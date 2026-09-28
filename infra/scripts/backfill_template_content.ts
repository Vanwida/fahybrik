/**
 * backfill_template_content.ts — la segunda mitad de la migración 0275.
 *
 * La 0275 deja en SQL lo que se puede decir exacto en SQL (posiciones, formato del
 * bloque, circuitos, calentamiento). Lo que depende de la prescripción —su forma
 * canónica y el `params_json` que se deriva de ella— vive en TypeScript
 * (`storedLinePrescription` + `prescriptionToParams`, las MISMAS funciones que usa
 * el escritor único de plantillas, docs/DECISIONS.md 2026-09-28). Copiarlas a SQL
 * sería una segunda fuente de verdad, así que se aplican aquí.
 *
 * QUÉ FILAS: las de los entrenos libres (`meta_json.origin = 'self'`, que el
 * escritor viejo guardaba con `params_json = {}`) y las estaciones de los
 * circuitos que la 0275 pasó a `template_blocks` (su `params_json` todavía decía
 * las rondas que ya no llevan). Las filas se ACTUALIZAN por id: nunca se borran y
 * reinsertan, porque los tramos ejecutados se enlazan por id de segmento.
 *
 * Una prescripción ilegible no se toca (se cuenta). Idempotente: una segunda
 * pasada no cambia nada.
 *
 * LANZAR (después de la 0275, con DATABASE_URL explícito):
 *
 *   cd web && NODE_OPTIONS="--conditions=react-server" \
 *     ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     ../infra/scripts/backfill_template_content.ts --dry-run
 */
import { prescriptionToParams, safeParsePrescription, type Modality } from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.ts';

interface Row {
  id: string;
  template_id: string;
  origin: string | null;
  params_json: Record<string, unknown> | null;
  prescription_json: unknown;
  exercise_modality: string | null;
}

/** JSON con las claves ordenadas: dos objetos iguales dan el mismo texto. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  // import() dinámico: el enlazador estático de tsx no ve los exports de un módulo
  // del web (mismo apaño que backfill_zone_seconds.ts). Ruta relativa: el módulo es
  // puro (solo depende de @fahybrid/shared), así que también lo resuelve el tsc de infra.
  const { storedLinePrescription } = await import('../../web/lib/templates/template-content.ts');
  const sql = getSql();
  try {
    const rows = await sql<Row[]>`
      select s.id::text as id, s.template_id::text as template_id,
             t.meta_json->>'origin' as origin,
             s.params_json, s.prescription_json, e.modality::text as exercise_modality
      from template_segments s
      join templates t on t.id = s.template_id
      join exercises e on e.id = s.exercise_id
      where s.prescription_json is not null
        and (
          (jsonb_typeof(t.meta_json) = 'object' and t.meta_json->>'origin' = 'self')
          or (
            s.block_format = 'circuit'
            and exists (
              select 1 from template_blocks tb
              where tb.template_id = s.template_id and tb.block_position = s.block_position
            )
          )
        )
      order by s.id
    `;

    let unreadable = 0;
    let unchanged = 0;
    const updates: Array<{ id: string; prescription: unknown; params: unknown; origin: string | null }> = [];
    for (const r of rows) {
      const parsed = safeParsePrescription(r.prescription_json);
      if (!parsed.success) {
        unreadable += 1;
        continue;
      }
      const stored = storedLinePrescription({
        prescription: parsed.data,
        exercise_modality: (r.exercise_modality as Modality | null) ?? null,
      })!;
      const params = prescriptionToParams(stored);
      if (stable(stored) === stable(r.prescription_json) && stable(params) === stable(r.params_json ?? {})) {
        unchanged += 1;
        continue;
      }
      updates.push({ id: r.id, prescription: stored, params, origin: r.origin });
    }

    const free = updates.filter((u) => u.origin === 'self').length;
    console.log(
      `[backfill_template_content] ${rows.length} filas leídas · ${updates.length} a actualizar ` +
        `(${free} de libres, ${updates.length - free} de circuitos) · ${unchanged} ya canónicas · ` +
        `${unreadable} ilegibles${dryRun ? ' · DRY-RUN, nada escrito' : ''}`,
    );
    if (dryRun || updates.length === 0) return;

    await sql.begin(async (tx) => {
      for (const u of updates) {
        await tx`
          update template_segments
          set prescription_json = ${tx.json(JSON.parse(JSON.stringify(u.prescription)))},
              params_json = ${tx.json(JSON.parse(JSON.stringify(u.params)))},
              updated_at = now()
          where id = ${Number(u.id)}
        `;
      }
    });
    console.log(`[backfill_template_content] ${updates.length} filas actualizadas.`);
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
