import 'server-only';

// EL REFLOW DE LA CADENA PERSONAL — la pieza que comparten "reordenar",
// "editar duración" y "borrar" de `personal-plan-chain-mutations.ts`: las tres
// acaban siendo la MISMA pregunta ("¿qué tramos personales cambian de fecha, y
// es seguro moverlos?") aplicada a una lista distinta cada vez.
//
// LA REGLA DURA, Y CÓMO SE APLICA AQUÍ
// -------------------------------------
// "Una sesión ya ejecutada no se toca ni se mueve jamás" (ver retirePersonalPlan
// en personal-plans.ts). Aquí se traduce así: un tramo cuya VENTANA de fechas
// cambiaría — se reordena, se acorta/alarga él mismo, o simplemente le toca
// desplazarse porque otro tramo anterior cambió — sólo se mueve si tiene CERO
// sesiones ejecutadas. Si tiene alguna, la operación entera se aborta ANTES de
// tocar una sola fila, con un mensaje que nombra qué tramo la bloquea.
//
// DOS FASES, por la misma razón que ya documentan personalize-plan.ts y
// revert-personal-plan.ts: un cliente `postgres.js` en transacción expone
// `.savepoint`, no `.begin` — así que `instantiateMonthFromTemplate` (que
// SIEMPRE abre su propia transacción) no puede llamarse dentro de una ya
// abierta. `planPersonalReflow` valida TODO bajo el advisory lock del atleta
// (fase 1, bloqueada); `applyPersonalReflow` escribe después (fase 2, sin
// lock) — mismo hueco residual que el resto del archivo de plan personal,
// cerrado por el lock para el caso realista y por la restricción 0166 (23P01)
// como red para el cruce más raro.
//
// UN TRAMO QUE SÓLO CAMBIA DE TAMAÑO NO ES UN TRAMO QUE SE MUEVE.
// -----------------------------------------------------------------
// Alargar/acortar el PROPIO tramo (su fecha de inicio no cambia, sólo cuántas
// semanas ocupa) es una operación DISTINTA — `resizeAssignmentInPlace`, en
// `personal-plan-chain-resize.ts` — que sólo toca las semanas de la punta que
// de verdad cambian, nunca las que ya había. Meter esto por
// `planPersonalReflow` (borrar el tramo entero y rematerializarlo desde su
// semana 1) exigiría que TODO el tramo estuviera libre de ejecutadas para
// poder alargarlo, cuando alargar nunca toca lo de atrás — una sesión ya
// hecha en la semana 1 no puede bloquear añadir una semana 5. Esta pieza
// sigue siendo la correcta para lo que SÍ relocaliza un tramo entero:
// reordenar, y los tramos que vienen DETRÁS del que cambia de tamaño.

import type { Sql } from '@/lib/db';
import { withOwnOrAmbientTx } from '@/lib/db';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import {
  instantiateMonthFromTemplate,
  InstantiateProgramError,
} from './instantiate-program';
import { markFutureWeeksDraft } from '@/lib/coach/publish-week';

export class PersonalChainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'PersonalChainError';
  }
}

/** Un tramo PERSONAL de este atleta tal y como vive hoy — nunca uno de
 *  biblioteca (`loadPersonalTramoChain` ya filtra por `athlete_id` de la
 *  plantilla). `microcycle_ids` viene en orden de semana. */
export type PersonalTramoRow = {
  assignment_id: number;
  month_template_id: number;
  name: string;
  start_date: string;
  end_date: string;
  week_count: number;
  microcycle_ids: number[];
};

/** Carga la cadena PERSONAL de este atleta (nunca microciclos de biblioteca),
 *  en orden de fecha. Es la vista que reordenar/acortar/borrar necesitan para
 *  saber qué hay antes y después de un tramo — distinta de
 *  `resolvePersonalPlanChain` (personal-plan-chain.ts), que además mezcla los
 *  nodos de biblioteca para PINTAR la espina completa. */
export async function loadPersonalTramoChain(params: {
  coach_id: number;
  athlete_id: number;
  client: Sql;
}): Promise<PersonalTramoRow[]> {
  const { coach_id, athlete_id, client } = params;
  const rows = await client<
    Array<{
      assignment_id: string;
      month_template_id: string;
      name: string;
      start_date: string;
      end_date: string;
      microcycle_ids: string[] | null;
    }>
  >`
    select
      ama.id::text as assignment_id,
      ama.month_template_id::text as month_template_id,
      m.name,
      to_char(ama.start_date, 'YYYY-MM-DD') as start_date,
      to_char(ama.end_date, 'YYYY-MM-DD') as end_date,
      ama.microcycle_ids
    from athlete_month_assignments ama
    join program_month_templates m on m.id = ama.month_template_id
    where ama.athlete_id = ${athlete_id}
      and m.athlete_id = ${athlete_id}
      and m.coach_id = ${coach_id}
    order by ama.start_date asc
  `;
  return rows.map((r) => {
    const microcycle_ids = (r.microcycle_ids ?? []).map(Number);
    return {
      assignment_id: Number(r.assignment_id),
      month_template_id: Number(r.month_template_id),
      name: r.name,
      start_date: r.start_date,
      end_date: r.end_date,
      week_count: microcycle_ids.length,
      microcycle_ids,
    };
  });
}

export type TramoSafety = {
  executed_count: number;
  pending_count: number;
  /** El nº de semanas MÍNIMO al que este tramo se puede acortar sin tocar una
   *  sola sesión ejecutada — no "cuántas se pueden quitar". Cuenta desde el
   *  FINAL: una semana limpia rodeada de semanas con historial no es
   *  "quitable" (dejaría un hueco a mitad del propio tramo). Igual al
   *  week_count actual cuando no hay nada ejecutado en absoluto. */
  min_week_count: number;
  /** Pendientes por semana, en orden (índice 0 = primera semana del tramo).
   *  Deja que la UI diga un número REAL antes de acortar — "vas a perder 3
   *  sesiones programadas" — en vez de una advertencia genérica; ver
   *  `EditarMicrocicloModal.tsx`, que suma el sufijo que se recortaría. */
  pending_by_week: number[];
};

/**
 * Recorre los microciclos de UN tramo, en orden de semana, y calcula en una
 * sola consulta lo ejecutado, lo pendiente (total y por semana) y el suelo
 * real de "acortar".
 */
export async function tramoSafety(client: Sql, microcycle_ids: number[]): Promise<TramoSafety> {
  const total = microcycle_ids.length;
  if (total === 0) return { executed_count: 0, pending_count: 0, min_week_count: 0, pending_by_week: [] };

  const rows = await client<Array<{ ord: number; executed: string; pending: string }>>`
    select
      mc.ord::int as ord,
      count(wa.id) filter (
        where wa.status = 'completed'
          or exists (select 1 from workout_executions we where we.assignment_id = wa.id)
      )::text as executed,
      count(wa.id) filter (
        where wa.status <> 'completed'
          and not exists (select 1 from workout_executions we where we.assignment_id = wa.id)
      )::text as pending
    from unnest(${microcycle_ids}::bigint[]) with ordinality as mc(id, ord)
    left join workout_assignments wa on wa.microcycle_id = mc.id
    group by mc.ord
    order by mc.ord asc
  `;
  const byOrd = rows.map((r) => ({ executed: Number(r.executed), pending: Number(r.pending) }));
  const executed_count = byOrd.reduce((n, r) => n + r.executed, 0);
  const pending_count = byOrd.reduce((n, r) => n + r.pending, 0);
  const pending_by_week = byOrd.map((r) => r.pending);

  let min_week_count = total;
  for (let i = total - 1; i >= 0; i--) {
    if ((byOrd[i]?.executed ?? 0) > 0) break;
    min_week_count = i;
  }

  return { executed_count, pending_count, min_week_count, pending_by_week };
}

export type ReflowStep = {
  month_template_id: number;
  name: string;
  week_count: number;
  old_start: string | null;
  new_start: string;
  new_end: string;
  /** false = la ventana no cambia; el llamador no lo toca en la fase 2. */
  moved: boolean;
};

/**
 * Calcula las fechas nuevas de una lista ORDENADA y COMPLETA de tramos
 * personales, encadenados sin hueco desde `anchor_start`, cada uno con el
 * `week_count` que traiga en `desired` (puede ser distinto del actual — así es
 * como "editar duración" reusa esto mismo). NO escribe nada: valida que TODO
 * tramo cuya ventana cambiaría esté libre de sesiones ejecutadas y lanza
 * `PersonalChainError` (nombrando cuál) si no lo está, antes de tocar una fila.
 *
 * `current` sólo necesita traer los tramos que YA EXISTEN — uno de `desired`
 * ausente en `current` es NUEVO (se crea desde cero en la fase 2, nunca
 * "cambia" de sitio, así que no hace falta protegerlo).
 */
export async function planPersonalReflow(params: {
  client: Sql;
  anchor_start: string;
  desired: Array<{ month_template_id: number; name: string; week_count: number }>;
  current: Map<number, PersonalTramoRow>;
}): Promise<ReflowStep[]> {
  const steps: ReflowStep[] = [];
  let cursor = parseIsoDate(params.anchor_start);

  for (const d of params.desired) {
    const startIso = isoDateString(cursor);
    const end = addDays(cursor, d.week_count * 7 - 1);
    const endIso = isoDateString(end);
    const cur = params.current.get(d.month_template_id) ?? null;
    const moved = cur == null || cur.start_date !== startIso || cur.week_count !== d.week_count;

    steps.push({
      month_template_id: d.month_template_id,
      name: d.name,
      week_count: d.week_count,
      old_start: cur?.start_date ?? null,
      new_start: startIso,
      new_end: endIso,
      moved,
    });
    cursor = addDays(end, 1);
  }

  for (const s of steps) {
    if (!s.moved) continue;
    const cur = params.current.get(s.month_template_id);
    if (!cur) continue; // nuevo — nada que proteger todavía.
    const safety = await tramoSafety(params.client, cur.microcycle_ids);
    if (safety.executed_count > 0) {
      throw new PersonalChainError(
        'has_executed_sessions',
        `«${s.name}» ya tiene ${safety.executed_count === 1 ? 'una sesión hecha' : `${safety.executed_count} sesiones hechas`} — no se puede mover ni cambiar de tamaño.`,
        409,
      );
    }
  }

  return steps;
}

/**
 * Retira el recibo ACTUAL de un tramo (su `athlete_month_assignments`, sus
 * microciclos y `workout_assignments`) para poder rematerializarlo en otra
 * fecha — SIN tocar `program_month_templates`/`program_week_templates` (el
 * contenedor y su contenido se conservan, sólo cambian sus fechas). Sólo se
 * llama sobre tramos que `planPersonalReflow` ya validó libres de ejecutadas;
 * aun así lo vuelve a comprobar aquí antes de borrar — defensivo, no asumido.
 */
async function clearPersonalTramoAssignment(params: {
  coach_id: number;
  athlete_id: number;
  month_template_id: number;
  client: Sql;
}): Promise<void> {
  const { coach_id, athlete_id, month_template_id, client } = params;
  await withOwnOrAmbientTx(client, async (txRaw) => {
    const tx = txRaw as unknown as Sql;
    const owned = await tx<Array<{ id: string }>>`
      select id::text from program_month_templates
      where id = ${month_template_id} and coach_id = ${coach_id} and athlete_id = ${athlete_id}
      limit 1
    `;
    if (!owned[0]) {
      throw new PersonalChainError(
        'not_found',
        'Este microciclo personal no existe o no es de este atleta',
        404,
      );
    }
    const assignments = await tx<Array<{ id: string; microcycle_ids: string[] | null }>>`
      select id::text, microcycle_ids from athlete_month_assignments
      where athlete_id = ${athlete_id} and month_template_id = ${month_template_id}
    `;
    const microcycleIds = Array.from(
      new Set(assignments.flatMap((a) => (a.microcycle_ids ?? []).map(Number))),
    );
    if (microcycleIds.length > 0) {
      const safety = await tramoSafety(tx, microcycleIds);
      if (safety.executed_count > 0) {
        throw new PersonalChainError(
          'has_executed_sessions',
          'Este microciclo ya tiene sesiones hechas — no se puede mover.',
          409,
        );
      }
      await tx`delete from workout_assignments where microcycle_id = any(${microcycleIds}::bigint[])`;
      await tx`delete from microcycles where id = any(${microcycleIds}::bigint[])`;
    }
    if (assignments.length > 0) {
      const ids = assignments.map((a) => Number(a.id));
      await tx`delete from athlete_month_assignments where id = any(${ids}::bigint[])`;
    }
  });
}

/**
 * Aplica un plan de reflow YA VALIDADO (`planPersonalReflow`): para cada paso
 * que se mueve (en orden de fecha NUEVA), retira su recibo actual si lo tenía
 * y rematerializa en la fecha nueva — el contenido de sus semanas (lo que el
 * coach ya haya escrito) viaja intacto porque es la MISMA plantilla, sólo con
 * fecha distinta. Los pasos que no se mueven no se tocan.
 *
 * Corre en la fase 2 (sin el advisory lock — ver cabecera del archivo). Si un
 * paso falla a mitad, los anteriores YA se movieron: el error final dice
 * cuántos se completaron para que el llamador lo cuente con honestidad en vez
 * de fingir que la cadena entera sigue como estaba.
 */
export async function applyPersonalReflow(params: {
  coach_id: number;
  athlete_id: number;
  steps: ReflowStep[];
  client: Sql;
}): Promise<{ moved: ReflowStep[] }> {
  const { coach_id, athlete_id, client } = params;
  const toMove = params.steps
    .filter((s) => s.moved)
    .sort((a, b) => (a.new_start < b.new_start ? -1 : a.new_start > b.new_start ? 1 : 0));

  const moved: ReflowStep[] = [];
  for (const s of toMove) {
    try {
      if (s.old_start != null) {
        await clearPersonalTramoAssignment({
          coach_id,
          athlete_id,
          month_template_id: s.month_template_id,
          client,
        });
      }
      const materialization = await instantiateMonthFromTemplate({
        coach_id,
        athlete_id,
        month_template_id: s.month_template_id,
        start_date: s.new_start,
        client,
      });
      await markFutureWeeksDraft({
        coach_id,
        athlete_id,
        start_date: materialization.start_date,
        week_count: materialization.microcycle_ids.length,
        client,
      });
      moved.push(s);
    } catch (err) {
      const already = moved.length;
      const total = toMove.length;
      const suffix =
        already > 0
          ? ` Ya se movieron ${already} de ${total} microciclo(s) antes de este fallo — revisa la cadena antes de reintentar.`
          : '';
      if (err instanceof InstantiateProgramError) {
        throw new PersonalChainError(err.code, `${err.message}${suffix}`, err.status);
      }
      if (err instanceof PersonalChainError) {
        throw new PersonalChainError(err.code, `${err.message}${suffix}`, err.status);
      }
      throw err;
    }
  }
  return { moved };
}
