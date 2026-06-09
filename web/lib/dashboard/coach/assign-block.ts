import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  addDays,
  isoDateString,
  mondayOfWeek,
  parseIsoDate,
} from '@fahybrid/shared/domain/atr/dates';
import type { AtrBlockType } from '@fahybrid/shared/domain/atr/planner';
import { instantiateWeekIntoMicrocycle } from './instantiate-program';

export class AssignBlockError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AssignBlockError';
  }
}

/* -------------------------------------------------------------------------- */
/* READ — el plan del atleta como sus 3 bloques ATR con estado real.          */
/* -------------------------------------------------------------------------- */

export type BlockMicrocycleView = {
  microcycle_id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  scheduled: number;
  completed: number;
};

export type AtrBlockView = {
  block_id: string;
  type: AtrBlockType;
  position: number;
  /** Estado del bloque: planned | active | completed | skipped (block_status). */
  status: string;
  start_date: string;
  end_date: string;
  planned_weeks: number;
  microcycles: BlockMicrocycleView[];
  /** Suma de workout_assignments materializadas en los microciclos del bloque. */
  assignment_count: number;
  /** true cuando ya hay sesiones materializadas → "asignado/aprobado". */
  is_assigned: boolean;
  /** Plantillas de semana (program_week_templates) que cubren esta fase. */
  available_week_templates: number;
};

export type AthleteBlocksView = {
  athlete_id: string;
  macrocycle_id: string | null;
  macrocycle_status: string | null;
  start_date: string | null;
  end_date: string | null;
  /** Tipo de bloque que cubre la fecha actual (o null fuera del macrociclo). */
  current_block_type: AtrBlockType | null;
  blocks: AtrBlockView[];
};

const PLANNED_WEEKS_DAYS = 7;

/**
 * Construye la vista por-bloque del plan del atleta a partir de la estructura
 * REAL (`atr_macrocycles` → `atr_blocks` → `microcycles` + `workout_assignments`),
 * NO de `athlete_month_assignments`. El macrociclo activo/planificado más reciente
 * es la fuente. Cada bloque expone su estado, sus semanas y cuántas sesiones tiene
 * ya materializadas (para distinguir asignado vs pendiente).
 */
export async function buildAthleteBlocksView(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<AthleteBlocksView> {
  const client = params.client ?? defaultSql;
  const athleteId = Number(params.athlete_id);

  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${athleteId} and coach_id = ${Number(params.coach_id)} limit 1
  `;
  if (!owned[0]) {
    throw new AssignBlockError('not_found', 'Atleta no encontrado', 404);
  }

  const macroRows = await client<
    Array<{ id: string; status: string; start_date: string; end_date: string }>
  >`
    select
      id::text,
      status::text,
      to_char(start_date, 'YYYY-MM-DD') as start_date,
      to_char(end_date, 'YYYY-MM-DD') as end_date
    from atr_macrocycles
    where athlete_id = ${athleteId}
      and status in ('planned', 'active')
    order by start_date desc
    limit 1
  `;
  const macro = macroRows[0] ?? null;

  if (!macro) {
    return {
      athlete_id: String(athleteId),
      macrocycle_id: null,
      macrocycle_status: null,
      start_date: null,
      end_date: null,
      current_block_type: null,
      blocks: [],
    };
  }

  const blockRows = await client<
    Array<{
      block_id: string;
      type: AtrBlockType;
      position: number;
      status: string;
      start_date: string;
      end_date: string;
    }>
  >`
    select
      id::text as block_id,
      type::text as type,
      position,
      status::text as status,
      to_char(start_date, 'YYYY-MM-DD') as start_date,
      to_char(end_date, 'YYYY-MM-DD') as end_date
    from atr_blocks
    where macrocycle_id = ${Number(macro.id)}
    order by position asc
  `;

  const microRows = await client<
    Array<{
      block_id: string;
      microcycle_id: string;
      week_number: number;
      start_date: string;
      end_date: string;
      scheduled: number;
      completed: number;
    }>
  >`
    select
      mc.block_id::text as block_id,
      mc.id::text as microcycle_id,
      mc.week_number,
      to_char(mc.start_date, 'YYYY-MM-DD') as start_date,
      to_char(mc.end_date, 'YYYY-MM-DD') as end_date,
      count(wa.id)::int as scheduled,
      count(wa.id) filter (where wa.status = 'completed')::int as completed
    from microcycles mc
    join atr_blocks b on b.id = mc.block_id
    left join workout_assignments wa on wa.microcycle_id = mc.id
    where b.macrocycle_id = ${Number(macro.id)}
    group by mc.block_id, mc.id, mc.week_number, mc.start_date, mc.end_date
    order by mc.block_id, mc.week_number
  `;

  // Plantillas de semana disponibles por fase (atr_block_hint) para el coach.
  const tplRows = await client<Array<{ atr_block_hint: string | null; n: number }>>`
    select atr_block_hint::text, count(*)::int as n
    from program_week_templates
    where coach_id = ${Number(params.coach_id)}
    group by atr_block_hint
  `;
  const tplByPhase = new Map<string, number>();
  for (const r of tplRows) {
    if (r.atr_block_hint) tplByPhase.set(r.atr_block_hint, r.n);
  }

  const microByBlock = new Map<string, BlockMicrocycleView[]>();
  for (const m of microRows) {
    const list = microByBlock.get(m.block_id) ?? [];
    list.push({
      microcycle_id: m.microcycle_id,
      week_number: m.week_number,
      start_date: m.start_date,
      end_date: m.end_date,
      scheduled: m.scheduled,
      completed: m.completed,
    });
    microByBlock.set(m.block_id, list);
  }

  const blocks: AtrBlockView[] = blockRows.map((b) => {
    const micros = microByBlock.get(b.block_id) ?? [];
    const assignment_count = micros.reduce((n, m) => n + m.scheduled, 0);
    const planned_weeks =
      Math.floor(
        (parseIsoDate(b.end_date).getTime() - parseIsoDate(b.start_date).getTime()) /
          86_400_000 /
          PLANNED_WEEKS_DAYS,
      ) + 1;
    return {
      block_id: b.block_id,
      type: b.type,
      position: b.position,
      status: b.status,
      start_date: b.start_date,
      end_date: b.end_date,
      planned_weeks,
      microcycles: micros,
      assignment_count,
      is_assigned: assignment_count > 0,
      available_week_templates: tplByPhase.get(b.type) ?? 0,
    };
  });

  const today = isoDateString(mondayOfWeek(params.on_date ?? new Date()));
  const current = blocks.find(
    (b) => b.start_date <= today && b.end_date >= today,
  );

  return {
    athlete_id: String(athleteId),
    macrocycle_id: macro.id,
    macrocycle_status: macro.status,
    start_date: macro.start_date,
    end_date: macro.end_date,
    current_block_type: current?.type ?? null,
    blocks,
  };
}

/* -------------------------------------------------------------------------- */
/* WRITE — asigna/aprueba UN bloque: materializa sus semanas como microciclos. */
/* -------------------------------------------------------------------------- */

export type AssignBlockResult = {
  block_id: string;
  block_type: AtrBlockType;
  start_date: string;
  end_date: string;
  microcycle_ids: string[];
  assignment_count: number;
  /** true si el bloque YA estaba asignado y no se re-materializó (idempotente). */
  already_assigned: boolean;
};

/**
 * Asigna/aprueba UN bloque ATR a un atleta: por cada semana planificada del
 * bloque, materializa un microciclo + sus `workout_assignments` reutilizando
 * `instantiateWeekIntoMicrocycle`. El bloque (y su macrociclo) deben existir ya
 * en `atr_blocks` (los crea el planner/intake). Idempotente: si el bloque ya
 * tiene sesiones materializadas no las duplica salvo `force`.
 */
export async function assignBlockToAthlete(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  atr_block?: AtrBlockType | undefined;
  program_week_template_ids?: Array<number | bigint> | undefined;
  start_date?: string | undefined;
  force?: boolean | undefined;
  client?: Sql;
}): Promise<AssignBlockResult> {
  const client = params.client ?? defaultSql;
  const athleteId = Number(params.athlete_id);

  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${athleteId} and coach_id = ${Number(params.coach_id)} limit 1
  `;
  if (!owned[0]) {
    throw new AssignBlockError('not_found', 'Atleta no encontrado', 404);
  }

  const macroRows = await client<Array<{ id: string; status: string }>>`
    select id::text, status::text
    from atr_macrocycles
    where athlete_id = ${athleteId}
      and status in ('planned', 'active')
    order by start_date desc
    limit 1
  `;
  const macro = macroRows[0];
  if (!macro) {
    throw new AssignBlockError(
      'no_macrocycle',
      'El atleta no tiene un macrociclo activo. Crea el macrociclo antes de asignar bloques.',
      409,
    );
  }

  // Resolver el bloque destino: por tipo ATR (auto) o por el bloque que cubre la
  // start_date (cuando se pasa un override + ids explícitas). Sin override → por tipo.
  const block = await resolveTargetBlock({
    client,
    macrocycle_id: macro.id,
    atr_block: params.atr_block,
    program_week_template_ids: params.program_week_template_ids,
    start_date: params.start_date,
  });

  // Semana de inicio: override (alineado a lunes) o el start_date planificado.
  const startMonday = mondayOfWeek(
    parseIsoDate(params.start_date ?? block.start_date),
  );

  // Nº de semanas a materializar = semanas planificadas del bloque.
  const plannedWeeks =
    Math.floor(
      (parseIsoDate(block.end_date).getTime() -
        parseIsoDate(block.start_date).getTime()) /
        86_400_000 /
        PLANNED_WEEKS_DAYS,
    ) + 1;

  // Plantillas de semana en orden de semana del bloque.
  const weekTemplateIds = await resolveWeekTemplateIds({
    client,
    coach_id: params.coach_id,
    atr_block: block.type,
    explicit_ids: params.program_week_template_ids,
    needed_weeks: plannedWeeks,
  });

  // Idempotencia: ¿ya hay sesiones materializadas en el rango del bloque?
  const existing = await client<Array<{ n: number }>>`
    select count(wa.id)::int as n
    from workout_assignments wa
    join microcycles mc on mc.id = wa.microcycle_id
    where mc.block_id = ${Number(block.block_id)}
  `;
  const alreadyHas = (existing[0]?.n ?? 0) > 0;
  if (alreadyHas && !params.force) {
    const microIds = await client<Array<{ id: string }>>`
      select id::text from microcycles where block_id = ${Number(block.block_id)}
      order by week_number asc
    `;
    return {
      block_id: block.block_id,
      block_type: block.type,
      start_date: block.start_date,
      end_date: block.end_date,
      microcycle_ids: microIds.map((m) => m.id),
      assignment_count: existing[0]?.n ?? 0,
      already_assigned: true,
    };
  }

  const microcycleIds: string[] = [];
  let assignmentCount = 0;

  await client.begin(async (tx) => {
    // Activar macrociclo/bloque al asignar (aprobación del coach).
    if (macro.status === 'planned') {
      await tx`
        update atr_macrocycles set status = 'active', updated_at = now()
        where id = ${Number(macro.id)}
      `;
    }
    await tx`
      update atr_blocks set status = 'active', updated_at = now()
      where id = ${Number(block.block_id)} and status = 'planned'
    `;

    // Si re-asignamos con force, limpiamos las sesiones previas del bloque para
    // no duplicar (el microciclo se reutiliza vía resolveOrCreateMicrocycle).
    if (alreadyHas && params.force) {
      await tx`
        delete from workout_assignments
        where microcycle_id in (
          select id from microcycles where block_id = ${Number(block.block_id)}
        )
      `;
    }

    for (let wi = 0; wi < plannedWeeks; wi++) {
      const weekStart = addDays(startMonday, wi * 7);
      const weekTemplateId = weekTemplateIds[wi];
      // Menos plantillas que semanas: reutiliza la última disponible (mejor
      // entregar algo que dejar la semana vacía; coach lo afina luego).
      const tplId = weekTemplateId ?? weekTemplateIds[weekTemplateIds.length - 1];
      if (tplId == null) {
        throw new AssignBlockError(
          'no_week_templates',
          `No hay plantillas de semana para la fase ${block.type}. Crea plantillas con esa fase antes de asignar.`,
          409,
        );
      }
      const res = await instantiateWeekIntoMicrocycle({
        client: tx as unknown as Sql,
        coach_id: params.coach_id,
        athlete_id: params.athlete_id,
        macrocycle_id: macro.id,
        week_template_id: Number(tplId),
        week_start: weekStart,
        week_number: wi + 1,
      });
      microcycleIds.push(res.microcycle_id);
      assignmentCount += res.assignment_count;
    }
  });

  return {
    block_id: block.block_id,
    block_type: block.type,
    start_date: block.start_date,
    end_date: block.end_date,
    microcycle_ids: microcycleIds,
    assignment_count: assignmentCount,
    already_assigned: false,
  };
}

type TargetBlock = {
  block_id: string;
  type: AtrBlockType;
  start_date: string;
  end_date: string;
};

async function resolveTargetBlock(params: {
  client: Sql;
  macrocycle_id: string;
  atr_block?: AtrBlockType | undefined;
  program_week_template_ids?: Array<number | bigint> | undefined;
  start_date?: string | undefined;
}): Promise<TargetBlock> {
  const { client } = params;

  if (params.atr_block) {
    const rows = await client<
      Array<{ block_id: string; type: AtrBlockType; start_date: string; end_date: string }>
    >`
      select
        id::text as block_id,
        type::text as type,
        to_char(start_date, 'YYYY-MM-DD') as start_date,
        to_char(end_date, 'YYYY-MM-DD') as end_date
      from atr_blocks
      where macrocycle_id = ${Number(params.macrocycle_id)}
        and type = ${params.atr_block}::atr_block_type
      order by position asc
      limit 1
    `;
    const row = rows[0];
    if (!row) {
      throw new AssignBlockError(
        'block_not_found',
        `El macrociclo no tiene un bloque ${params.atr_block}.`,
        404,
      );
    }
    return row;
  }

  // Vía explícita (ids de plantilla): el bloque destino es el que cubre start_date,
  // o el primer bloque planificado del macrociclo si no se pasa fecha.
  const anchorIso = params.start_date ?? null;
  const rows = await client<
    Array<{ block_id: string; type: AtrBlockType; start_date: string; end_date: string }>
  >`
    select
      id::text as block_id,
      type::text as type,
      to_char(start_date, 'YYYY-MM-DD') as start_date,
      to_char(end_date, 'YYYY-MM-DD') as end_date
    from atr_blocks
    where macrocycle_id = ${Number(params.macrocycle_id)}
      and (
        ${anchorIso}::date is null
        or (start_date <= ${anchorIso}::date and end_date >= ${anchorIso}::date)
      )
    order by case when status = 'planned' then 0 else 1 end, position asc
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw new AssignBlockError(
      'block_not_found',
      'Ningún bloque ATR cubre la fecha indicada.',
      404,
    );
  }
  return row;
}

/**
 * Devuelve los ids de `program_week_templates` en orden de semana para el bloque.
 * - Explícitas → se respetan tal cual (orden del coach).
 * - Auto (por fase) → plantillas con ese `atr_block_hint`, una por semana,
 *   ordenadas por el nº de semana parseado del nombre ("Semana N") y, dentro de
 *   la misma semana, la variante base (nombre más corto → sin sufijo de modalidad).
 */
async function resolveWeekTemplateIds(params: {
  client: Sql;
  coach_id: number | bigint;
  atr_block: AtrBlockType;
  explicit_ids?: Array<number | bigint> | undefined;
  needed_weeks: number;
}): Promise<number[]> {
  if (params.explicit_ids && params.explicit_ids.length > 0) {
    // Validar pertenencia al coach (no asignar plantillas ajenas).
    const ids = params.explicit_ids.map(Number);
    const rows = await params.client<Array<{ id: string }>>`
      select id::text from program_week_templates
      where coach_id = ${Number(params.coach_id)} and id = any(${ids}::bigint[])
    `;
    const owned = new Set(rows.map((r) => Number(r.id)));
    const missing = ids.filter((id) => !owned.has(id));
    if (missing.length > 0) {
      throw new AssignBlockError(
        'week_template_not_found',
        `Plantillas de semana no encontradas: ${missing.join(', ')}`,
        404,
      );
    }
    return ids;
  }

  const rows = await params.client<Array<{ id: string; name: string }>>`
    select id::text, name
    from program_week_templates
    where coach_id = ${Number(params.coach_id)}
      and atr_block_hint = ${params.atr_block}
    order by id asc
  `;
  if (rows.length === 0) {
    throw new AssignBlockError(
      'no_week_templates',
      `No hay plantillas de semana para la fase ${params.atr_block}.`,
      409,
    );
  }

  // Agrupar por nº de semana parseado del nombre; elegir la variante base.
  const byWeek = new Map<number, { id: number; name: string }>();
  let fallbackKey = 1000;
  for (const r of rows) {
    const weekNo = parseWeekNumber(r.name) ?? fallbackKey++;
    const current = byWeek.get(weekNo);
    if (!current || r.name.length < current.name.length) {
      byWeek.set(weekNo, { id: Number(r.id), name: r.name });
    }
  }

  const orderedWeeks = Array.from(byWeek.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v.id);

  return orderedWeeks.slice(0, params.needed_weeks);
}

/** Extrae el N de "Semana N — …" (o null si no encaja). */
function parseWeekNumber(name: string): number | null {
  const m = /semana\s+(\d+)/i.exec(name);
  return m ? Number(m[1]) : null;
}
