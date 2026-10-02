import 'server-only';
import type { Sql } from '@/lib/db';
import type { WeekSession } from '@fahybrid/shared/schema/program-templates';
import { templateFormat, type TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import { applyProgression, safeParsePrescription, type Prescription, type ProgressionSpec } from '@fahybrid/shared/domain/prescription';
import type { SessionContent, SessionDrop } from './session-content';
import { cloneTemplateAsInstance } from './template-instance';
import type { TemplateContentBlock } from '@/lib/templates/template-content';
import { buildTemplateContent, writeTemplateContent } from '@/lib/templates/template-content-db';

/**
 * Validate an item's structured prescription for the `prescription_json` column.
 * Returns `null` (the line keeps its legacy params_json) when absent or invalid;
 * never persists a malformed shape.
 *
 * When `progression` is supplied (a repeated sequence loop), the parsed dose is
 * scaled by the coach's per-loop lever BEFORE persisting — scoped strictly to the
 * configured dimension (loads | volume | pace). A factor-1 spec (loops 0 / pct 0)
 * is a no-op, so the verbatim path stays byte-identical.
 */
function toSegmentPrescription(
  prescription: unknown,
  progression?: ProgressionSpec,
): Prescription | null {
  if (prescription == null) return null;
  const parsed = safeParsePrescription(prescription);
  if (!parsed.success) return null;
  return progression ? applyProgression(parsed.data, progression) : parsed.data;
}

/** template.format is NOT NULL; used when an inline session has no usable block format. */
const DEFAULT_TEMPLATE_FORMAT: TemplateFormat = 'circuit';
/** Every value the `template_format` enum accepts — the single shared source
 *  (canonical catalog ∪ legacy DB members). Block + template formats share it. */
const TEMPLATE_FORMATS: readonly TemplateFormat[] = templateFormat.options;
export async function insertSlotAssignment(params: {
  client: Sql;
  coach_id: number | bigint;
  athlete_id: number | bigint;
  microcycle_id: string;
  scheduled_for: string;
  slot: 'am' | 'pm' | `slot:${number}`;
  session: WeekSession;
  /** Veredicto de la sesión (`resolveSessionsContent`); las que no son de entreno no lo llevan. */
  content: SessionContent | undefined;
  template_name_base: string;
  progression?: ProgressionSpec;
}): Promise<{ count: number; drop: SessionDrop | null }> {
  const content = params.content;
  if (params.session.kind !== 'workout' || !content) return { count: 0, drop: null };
  // Sin nada que asignar (plantilla de origen desaparecida o de otro coach; bloques
  // sin ejercicios): no se crea entreno, y el motivo sube al resultado.
  if (!content.materializes) return { count: 0, drop: content.drop };

  // Dos formas de definir el workout de una sesión — en AMBAS la asignación
  // recibe un INSTANCE per-atleta (fork), nunca una referencia compartida a la
  // biblioteca (per-athlete plan bifurcation):
  //  1) `template_id` → referencia a un `templates` reutilizable: lo CLONAMOS en
  //     un instance per-atleta (cloneTemplateAsInstance) y apuntamos la
  //     asignación al clon → editar la biblioteca no propaga al atleta, y editar
  //     el atleta no toca la biblioteca ni a otros atletas.
  //  2) `blocks[]` inline → contenido editado en el week-studio: lo
  //     materializamos como un template propio de esta sesión, ya etiquetado
  //     como instance del atleta. (workout_assignments.template_id es NOT NULL y
  //     GET /athlete/plan/week hace join contra `templates`.)
  let templateId: number | null = null;
  let version = 1;

  if (params.session.template_id != null) {
    const instance = await cloneTemplateAsInstance({
      client: params.client,
      source_template_id: Number(params.session.template_id),
      athlete_id: params.athlete_id,
      coach_id: params.coach_id,
    });
    // La plantilla desapareció entre el veredicto y el clonado → nada que asignar.
    if (instance == null) {
      return { count: 0, drop: { reason: 'template_missing', session_lost: true, missing_exercises: [], empty_blocks: [] } };
    }
    templateId = instance.template_id;
    version = instance.version;
  } else {
    templateId = await materializeInlineSessionTemplate({
      client: params.client,
      coach_id: params.coach_id,
      athlete_id: params.athlete_id,
      session: params.session,
      content,
      name_base: params.template_name_base,
      progression: params.progression,
    });
  }

  // GUARDA DE DOBLE RESERVA. Materializar dos veces (dos clics del coach, o dos
  // vías distintas sobre el mismo atleta) insertaba un SEGUNDO juego completo de
  // sesiones en las mismas fechas, colgando del mismo microciclo y por tanto
  // indistinguible del bueno. No había ni unique en la tabla ni comprobación
  // aquí; las guardas existentes viven una capa por encima y ninguna mira la
  // fecha (`assign-sequence.ts` lo documentaba: «instantiateMonthFromTemplate
  // has NO dedup guard»).
  //
  // La identidad de una sesión materializada es (atleta, fecha, slot): el slot
  // vive en `notes` como `slot:am` / `slot:pm` / `slot:3`… (ver
  // `slotLabelForSessionIndex`), que es lo que este mismo insert escribe. Un
  // entreno LIBRE del atleta (origin 'self') o un test de calibración no llevan
  // ese `notes`, así que nunca bloquean — solo se deduplica contra otra
  // materialización del mismo hueco.
  //
  // `on conflict` no sirve: la tabla no tiene índice único que lo soporte y
  // añadirlo retroactivamente rompería los días con varias sesiones legítimas.
  //
  // El `status` decide qué hacer con el duplicado, no solo si lo hay. Mientras
  // sigue 'scheduled' el atleta no ha tocado nada — es seguro REEMPLAZAR su
  // contenido por el recién materializado (resincronizar una edición posterior
  // del coach, 0158). En cualquier otro estado ('completed'/'partial'/'skipped'/
  // 'missed') el atleta ya actuó sobre esa fila: se deja intacta, siempre — la
  // misma guarda que usa `markAssignmentDoneFromDevice` (lib/sync/assignment-status.ts).
  const dup = await params.client<Array<{ id: string; status: string }>>`
    select wa.id::text, wa.status::text from workout_assignments wa
    join athletes a on a.id = wa.athlete_id and a.coach_id = ${Number(params.coach_id)}
    where wa.athlete_id = ${params.athlete_id as number}
      and wa.scheduled_for = ${params.scheduled_for}::date
      and wa.notes = ${`slot:${params.slot}`}
    limit 1
  `;
  if (dup.length > 0) {
    if (dup[0]!.status !== 'scheduled') return { count: 0, drop: null };
    const updated = await params.client<Array<{ id: string }>>`
      update workout_assignments wa
      set template_id = ${templateId}, template_version = ${version}, updated_at = now()
      from athletes a
      where wa.id = ${Number(dup[0]!.id)} and wa.athlete_id = a.id
        and a.id = ${Number(params.athlete_id)} and a.coach_id = ${Number(params.coach_id)}
      returning wa.id::text
    `;
    if (!updated[0]) throw new Error('No se ha podido actualizar el entreno de este atleta.');
    return { count: 1, drop: content.drop };
  }

  const inserted = await params.client<Array<{ id: string }>>`
    insert into workout_assignments (
      athlete_id,
      microcycle_id,
      scheduled_for,
      template_id,
      template_version,
      status,
      notes
    )
    select
      a.id,
      mc.id,
      ${params.scheduled_for}::date,
      ${templateId},
      ${version},
      'scheduled'::assignment_status,
      ${`slot:${params.slot}`}
    from athletes a join microcycles mc on mc.athlete_id = a.id
    where a.id = ${Number(params.athlete_id)} and a.coach_id = ${Number(params.coach_id)}
      and mc.id = ${Number(params.microcycle_id)}
    returning id::text
  `;
  if (!inserted[0]) throw new Error('No se ha podido crear el entreno de este atleta.');
  return { count: 1, drop: content.drop };
}

export async function pruneRemovedSlotAssignments(params: {
  client: Sql;
  athlete_id: number | bigint;
  microcycle_id: string;
  scheduled_for: string;
  keep_notes: string[];
}): Promise<void> {
  await params.client`
    delete from workout_assignments wa
    using microcycles mc, athletes a, program_week_templates w
    where wa.athlete_id = ${params.athlete_id as number}
      and wa.microcycle_id = ${Number(params.microcycle_id)}
      and mc.id = wa.microcycle_id and mc.athlete_id = wa.athlete_id
      and a.id = wa.athlete_id and w.id = mc.source_week_template_id
      and w.coach_id = a.coach_id
      and wa.scheduled_for = ${params.scheduled_for}::date
      and wa.status = 'scheduled'
      and wa.notes like 'slot:%'
      and coalesce(wa.origin, 'coach') <> 'self'
      and not (wa.notes = any(${params.keep_notes}::text[]))
  `;
}

/**
 * Materializa los `blocks[]` inline de una sesión de week-template como un
 * `templates` row + `template_segments`, espejando el shape que produce el
 * week-studio (block_position/block_format/block_title por bloque, position
 * global por ejercicio). Devuelve el id del template creado.
 *
 * Qué entra lo decide `resolveSessionsContent` (session-content.ts) y llega en
 * `content`: bloques de biblioteca ya desglosados (0037/0038; uno sin estructura,
 * needs_review, se queda sin items) y solo los ejercicios que existen y ve el
 * coach (template_segments.exercise_id es FK NOT NULL: un id fantasma reventaría
 * toda la asignación). Es el mismo veredicto que enseña la previa, así que aquí
 * solo se llama con una sesión que sí se materializa.
 */
async function materializeInlineSessionTemplate(params: {
  client: Sql;
  coach_id: number | bigint;
  /** Owner of the per-athlete instance this inline session materializes into. */
  athlete_id: number | bigint;
  session: WeekSession;
  content: SessionContent;
  name_base: string;
  progression?: ProgressionSpec;
}): Promise<number> {
  const { blocks, modality_by_exercise: modalityById } = params.content;
  const existingExerciseIds = new Set(modalityById.keys());

  // format del template = primer block format válido, o fallback.
  const firstFormat = blocks.find((b) =>
    (TEMPLATE_FORMATS as readonly string[]).includes(b.format),
  )?.format;
  const format = (firstFormat ?? DEFAULT_TEMPLATE_FORMAT) as TemplateFormat;

  const name = (params.session.focus?.trim() || params.name_base).slice(0, 200);
  const coachNotes = params.session.notes ?? null;

  // Materialized inline content is per-athlete by construction → tag it as that
  // athlete's instance (instance_athlete_id) so it's a fork from birth and the
  // coach library (which filters instance_athlete_id IS NULL) never lists it.
  // No `instance_of_template_id`: inline content has no library source template.
  const tplRows = await params.client<Array<{ id: string }>>`
    insert into templates (
      coach_id, name, format, is_draft, coach_notes,
      instance_athlete_id
    )
    values (
      ${params.coach_id as number},
      ${name},
      ${format}::template_format,
      false,
      ${coachNotes},
      ${params.athlete_id as number}
    )
    returning id::text
  `;
  const templateId = Number(tplRows[0]!.id);

  // El contenido va por el escritor ÚNICO de plantillas (docs/DECISIONS.md
  // 2026-09-28): posiciones desde 0, formato elegido del bloque, prescripción
  // canónica, params_json derivado y el circuito en template_blocks. Aquí solo se
  // decide QUÉ entra: los ejercicios que existen para este coach y la dosis del
  // bucle de progresión. Sin control de completitud: se materializa el plan que
  // el coach ya escribió, no se le corrige.
  const content: TemplateContentBlock[] = blocks.map((block) => ({
    title: block.title ?? null,
    format: (TEMPLATE_FORMATS as readonly string[]).includes(block.format) ? block.format : null,
    circuit: block.circuit ?? null,
    items: (block.items ?? [])
      .filter((item) => existingExerciseIds.has(Number(item.exercise_id)))
      .map((item) => ({
        exercise_id: Number(item.exercise_id),
        exercise_modality: modalityById.get(Number(item.exercise_id)) ?? null,
        prescription: toSegmentPrescription(item.prescription_json, params.progression),
        params_json: item.params_json ?? null,
        notes: item.notes ?? null,
      })),
  }));
  const built = await buildTemplateContent(params.client, content);
  await writeTemplateContent(params.client, templateId, built.content, { fresh: true });

  return templateId;
}
