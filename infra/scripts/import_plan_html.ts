/**
 * Importa un plan de entrenamiento real (HTML estructurado del tracker) como un
 * MICROCICLO (program_month_templates + program_week_templates) bajo el coach de
 * Alex (coach_id 14), para que el dashboard del coach lo abra y el materializador
 * lo publique.
 *
 * Fuente: health-planning/training/plan-junio-2026.html (solo lectura).
 *   <article class="day" data-date>       → día
 *   <section class="session" data-slot>    → sesión (am/pm → sessionIndex 0/1)
 *   <div class="block" data-block-kind/-format/-rounds/-cap-s/-interval-s> → bloque (part)
 *   <li class="segment" data-activity/-load-kg/-reps/-sets/-distance-m/-duration-s/-rest-s> → ejercicio
 *
 * Solo se importa el detalle real: Semanas 7, 8 y 9. W10/W11 son placeholder
 * (sin segmentos) → IGNORADAS.
 *
 * El contenido se guarda con el shape EXACTO que espera el dashboard
 * (`WeekSlots` → days → sessions → blocks(parts) → items), validado contra el
 * Zod compartido (`@fahybrid/shared/schema/program-templates`) y serializado
 * igual que `createMonthTemplateWithEmptyWeeks` / `upsertWeekTemplate` (mismas
 * tablas, mismas columnas). No se importan las funciones server-only del web;
 * se reusa su SHAPE y se replica su SQL (patrón de los demás seeds de infra).
 *
 * Idempotente: borra el microciclo "Plan Junio 2026 · W7–W9" de coach 14 (y sus
 * semanas + junction) antes de re-insertar.
 *
 * Run: pnpm --filter @fahybrid/infra import:plan
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  weekSlotsSchema,
  normalizeWeekSlotsInput,
  type WeekSlots,
  type WeekSession,
  type WeekDayPart,
  type WeekDayPartItem,
  type WeekDayPartConfig,
} from '@fahybrid/shared/schema/program-templates';
import type { TemplateFormat } from '@fahybrid/shared/schema/_primitives';
import { getSql } from './_db.js';

// ---------------------------------------------------------------------------
// Constantes de la importación
// ---------------------------------------------------------------------------

const COACH_ID = 14;
const MONTH_NAME = 'Plan Junio 2026 · W7–W9';
const MONTH_LEVEL = 'pro';
// W7-9 = fase de realización: 4 simulaciones de carrera + intervalos a umbral +
// fuerza pesada compuesta encarando competición → ATR REAL. Enum: ACC/TRANS/REAL.
const MONTH_ATR_HINT: 'ACC' | 'TRANS' | 'REAL' | null = 'REAL';
const PLAN_HTML = resolve(
  '/Users/alexsolecarretero/Public/projects/health-planning/training/plan-junio-2026.html',
);
/** Solo las semanas con detalle real. W10/W11 son placeholder → fuera. */
const WEEKS_TO_IMPORT = new Set([7, 8, 9]);

// ---------------------------------------------------------------------------
// Catálogo de ejercicios — alias del HTML → slug del catálogo `exercises`.
// El NOMBRE del segmento (no data-activity) es la fuente. Se normaliza quitando
// prefijos de prescripción (reps/cal/distancia/"Min N ·") antes de mapear.
// ---------------------------------------------------------------------------

/** slug → exercise_id, resuelto desde DB al arrancar. */
type Catalog = Map<string, { id: number; name: string }>;

/**
 * Normaliza el nombre de un segmento a una clave de movimiento. Quita:
 *  - prefijo EMOM "Min N · "
 *  - cuantías iniciales "15 ", "30s ", "500m ", "4×1000m ", "5×100m "
 *  - sufijos de carga "9kg", "20kg"
 *  - sufijos de zona/calidad "Z2", "continuo", "fasted", "progresivo", "R pace"
 */
function movementKey(rawName: string): string {
  let s = rawName.trim();
  s = s.replace(/^Min\s*\d+\s*·\s*/i, ''); // EMOM prefix
  s = s.replace(/^\d+\s*×\s*\d+\s*m?\s*/i, ''); // "5×100m", "4×1000m"
  s = s.replace(/^\d+(?:\.\d+)?\s*(?:cal|reps?|m|km|s)?\s+/i, ''); // "15 cal Ski", "500m Row", "30s Hollow"
  s = s.replace(/\b\d+\s*kg\b/gi, ''); // load suffix
  return s.trim().toLowerCase();
}

/**
 * Mapa movimiento → slug del catálogo. La clave se compara contra el nombre
 * crudo en minúsculas Y contra `movementKey(name)`, lo que primero acierte.
 * Solo movimientos REALES del catálogo; las líneas de estructura (calentamiento,
 * camina, movilidad, rest) NO están aquí → se guardan como nota del bloque.
 */
const ALIAS_TO_SLUG: Array<{ test: (raw: string, key: string) => boolean; slug: string }> = [
  // Fuerza tradicional
  { test: (_r, k) => k === 'back squat', slug: 'back-squat' },
  { test: (_r, k) => k === 'front squat', slug: 'front-squat' },
  { test: (_r, k) => k === 'bench press', slug: 'bench-press' },
  { test: (_r, k) => k === 'deadlift', slug: 'deadlift' },
  { test: (_r, k) => k === 'ohp', slug: 'overhead-press' },
  { test: (_r, k) => k === 'row barra' || k === 'barbell row', slug: 'barbell-row' },
  // Pull-ups: "Pull-up weighted" lleva carga → weighted-pullup; "15 Pull-ups" → pull-up
  { test: (r) => /pull-?up\s*weighted/i.test(r), slug: 'weighted-pullup' },
  { test: (r) => /pull-?ups?/i.test(r), slug: 'pull-up' },
  // HYROX / funcional
  { test: (r) => /wall\s*balls?/i.test(r), slug: 'hyrox-wall-balls' },
  { test: (r) => /\bbbj\b|burpee\s*broad\s*jumps?/i.test(r), slug: 'hyrox-burpee-broad-jump' },
  { test: (r) => /sb\s*lunge|sandbag\s*lunge/i.test(r), slug: 'hyrox-sandbag-lunges' },
  { test: (r) => /db\s*thrusters?/i.test(r), slug: 'thruster' },
  { test: (r) => /\bburpees?\b/i.test(r), slug: 'burpee' },
  { test: (r) => /\bhollow\b/i.test(r), slug: 'hollow-hold' },
  // Cardio / ergómetros
  { test: (r) => /\brow\b|rowing/i.test(r), slug: 'row' },
  { test: (r) => /\bski\b|skierg/i.test(r), slug: 'ski-erg' },
  {
    test: (r) => /\brun\b|\d+\s*k(?:m)?\b|strides|trote|long\s+\d|\d+×\d+0{3}m/i.test(r),
    slug: 'run',
  },
];

/**
 * Líneas que NO son ejercicio de catálogo (estructura/recuperación): se guardan
 * como contenido del bloque (coach_note), nunca como item con exercise_id falso.
 */
function isNonCatalogLine(raw: string, key: string): boolean {
  return (
    /movilidad|camina|estiramientos|^rest$|^min\s*\d+\s*·\s*rest$/i.test(raw) ||
    key === 'rest' ||
    key === 'movilidad dinámica' ||
    key === 'movilidad articular'
  );
}

// ---------------------------------------------------------------------------
// Mapeo bloque → preset (templateFormat + methodology_group_id). Coherente con
// week-day-part-presets.ts.
// ---------------------------------------------------------------------------

interface PartMapping {
  format: TemplateFormat;
  methodology_group_id: number | null;
  title: string;
}

function mapBlockToPart(
  blockKind: string,
  blockFormat: string | null,
  blockTitle: string,
  segments: ParsedSegment[],
): PartMapping {
  const anyRowing = segments.some((s) => s.activity === 'rowing' || /\bski\b|ski/i.test(s.name));
  const anyRunning = segments.some((s) => s.activity === 'running');

  switch (blockKind) {
    case 'warmup':
      return { format: 'tempo', methodology_group_id: null, title: 'Calentamiento' };
    case 'cooldown':
      return { format: 'tempo', methodology_group_id: null, title: 'Vuelta a la calma' };
    case 'mobility':
      // Core / Movilidad / Preventivos (grupo 8).
      return { format: 'strength_block', methodology_group_id: 8, title: blockTitle || 'Movilidad' };
    case 'strength':
      // Fuerza Base (grupo 1).
      return { format: 'strength_block', methodology_group_id: 1, title: blockTitle || 'Fuerza' };
    case 'run':
      // Bloques de carrera del plan = Z2 base / recovery → Zona 2 (grupo 5).
      return { format: 'tempo', methodology_group_id: 5, title: blockTitle || 'Carrera Z2' };
    case 'sim':
      // Simulación de carrera (grupo 7).
      return { format: 'hyrox_sim', methodology_group_id: 7, title: blockTitle || 'Simulación' };
    case 'circuit':
      // Circuito funcional fuerza-resistencia (grupo 9).
      return { format: 'circuit', methodology_group_id: 9, title: blockTitle || 'Circuito' };
    case 'conditioning': {
      if (blockFormat === 'intervals') {
        // Ergómetros (grupo 3) si es row/ski; Running (grupo 4) si es carrera.
        if (anyRowing && !anyRunning) {
          return { format: 'intervals', methodology_group_id: 3, title: blockTitle || 'Series ergómetro' };
        }
        return { format: 'intervals', methodology_group_id: 4, title: blockTitle || 'Series running' };
      }
      // amrap / emom / for_time → WOD / Metcon (grupo 6).
      const fmt = (['amrap', 'emom', 'for_time'] as const).includes(
        (blockFormat ?? '') as 'amrap' | 'emom' | 'for_time',
      )
        ? (blockFormat as TemplateFormat)
        : 'amrap';
      return { format: fmt, methodology_group_id: 6, title: blockTitle || 'Metcon' };
    }
    default:
      return { format: 'circuit', methodology_group_id: null, title: blockTitle || blockKind };
  }
}

/** Config del bloque a partir de los data-* del HTML. */
function buildPartConfig(b: ParsedBlock): WeekDayPartConfig {
  const cfg: WeekDayPartConfig = {};
  if (b.rounds != null) cfg.rounds = b.rounds;
  if (b.capSeconds != null) cfg.time_cap_seconds = b.capSeconds;
  if (b.intervalSeconds != null) cfg.emom_interval_seconds = b.intervalSeconds;
  if (b.workDistanceM != null) cfg.distance_meters = b.workDistanceM;
  if (b.restSeconds != null) cfg.rest_seconds = b.restSeconds;
  return cfg;
}

// ---------------------------------------------------------------------------
// Parser HTML (regex — el HTML es generado y muy regular).
// ---------------------------------------------------------------------------

interface ParsedSegment {
  name: string;
  prescription: string | null;
  activity: string;
  loadKg: number | null;
  reps: number | null;
  sets: number | null;
  distanceM: number | null;
  durationS: number | null;
  restS: number | null;
}

interface ParsedBlock {
  kind: string;
  format: string | null;
  title: string;
  intent: string | null;
  rounds: number | null;
  capSeconds: number | null;
  intervalSeconds: number | null;
  workDistanceM: number | null;
  restSeconds: number | null;
  segments: ParsedSegment[];
}

interface ParsedSession {
  slot: string; // 'am' | 'pm'
  title: string;
  desc: string | null;
  blocks: ParsedBlock[];
}

interface ParsedDay {
  date: string;
  /** Índice de día de la SEMANA DE ENTRENO según la etiqueta del HTML (0=lunes…6=domingo). */
  dow: number;
  sessions: ParsedSession[];
}

interface ParsedWeek {
  weekNumber: number;
  days: ParsedDay[];
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1]! : null;
}
function numAttr(tag: string, name: string): number | null {
  const v = attr(tag, name);
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function innerText(html: string, cls: string): string | null {
  const m = html.match(new RegExp(`<span class="${cls}">([^<]*)</span>`));
  return m ? decodeEntities(m[1]!.trim()) : null;
}
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSegments(blockBody: string): ParsedSegment[] {
  const out: ParsedSegment[] = [];
  const liRe = /<li class="segment"([^>]*)>([\s\S]*?)<\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(blockBody))) {
    const tag = m[1]!;
    const body = m[2]!;
    out.push({
      name: innerText(body, 'segment-name') ?? '',
      prescription: innerText(body, 'segment-prescription'),
      activity: attr(tag, 'data-activity') ?? '',
      loadKg: numAttr(tag, 'data-load-kg'),
      reps: numAttr(tag, 'data-reps'),
      sets: numAttr(tag, 'data-sets'),
      distanceM: numAttr(tag, 'data-distance-m'),
      durationS: numAttr(tag, 'data-duration-s'),
      restS: numAttr(tag, 'data-rest-s'),
    });
  }
  return out;
}

function parseBlocks(sessionBody: string): ParsedBlock[] {
  const out: ParsedBlock[] = [];
  // Cada bloque: <div class="block" ...> ... </div> con sus <ul class="segments">.
  // El cierre lo delimitamos por el siguiente "<div class=\"block\"" o el fin.
  const blockRe =
    /<div class="block"([^>]*)>([\s\S]*?)(?=<div class="block"|<\/div>\s*<\/section>|$)/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(sessionBody))) {
    const tag = m[1]!;
    const body = m[2]!;
    out.push({
      kind: attr(tag, 'data-block-kind') ?? '',
      format: attr(tag, 'data-format'),
      title: innerText(body, 'block-title') ?? '',
      intent: (body.match(/<p class="block-intent">([^<]*)<\/p>/)?.[1] ?? null)
        ? decodeEntities(body.match(/<p class="block-intent">([^<]*)<\/p>/)![1]!.trim())
        : null,
      rounds: numAttr(tag, 'data-rounds'),
      capSeconds: numAttr(tag, 'data-cap-s'),
      intervalSeconds: numAttr(tag, 'data-interval-s'),
      workDistanceM: numAttr(tag, 'data-work-distance-m'),
      restSeconds: numAttr(tag, 'data-rest-s'),
      segments: parseSegments(body),
    });
  }
  return out;
}

function parseSessions(dayBody: string): ParsedSession[] {
  const out: ParsedSession[] = [];
  const sesRe =
    /<section class="session"([^>]*)>([\s\S]*?)(?=<section class="session"|<\/article>|$)/g;
  let m: RegExpExecArray | null;
  while ((m = sesRe.exec(dayBody))) {
    const tag = m[1]!;
    const body = m[2]!;
    out.push({
      slot: attr(tag, 'data-slot') ?? 'am',
      title: innerText(body, 'session-title') ?? '',
      desc: body.match(/<p class="session-desc">([^<]*)<\/p>/)?.[1]?.trim() ?? null,
      blocks: parseBlocks(body),
    });
  }
  return out;
}

function parseWeeks(html: string): ParsedWeek[] {
  const weeks: ParsedWeek[] = [];
  const weekRe =
    /<section class="week" data-week-number="(\d+)"[^>]*>([\s\S]*?)(?=<section class="week"|<\/main>)/g;
  let wm: RegExpExecArray | null;
  while ((wm = weekRe.exec(html))) {
    const weekNumber = Number(wm[1]);
    const weekBody = wm[2]!;
    if (!WEEKS_TO_IMPORT.has(weekNumber)) continue;
    const days: ParsedDay[] = [];
    const dayRe = /<article class="day"([^>]*)>([\s\S]*?)<\/article>/g;
    let dm: RegExpExecArray | null;
    while ((dm = dayRe.exec(weekBody))) {
      const date = attr(dm[1]!, 'data-date')!;
      const dow = numAttr(dm[1]!, 'data-dow') ?? 0;
      days.push({ date, dow, sessions: parseSessions(dm[2]!) });
    }
    weeks.push({ weekNumber, days });
  }
  return weeks.sort((a, b) => a.weekNumber - b.weekNumber);
}

// ---------------------------------------------------------------------------
// Conversión Parsed* → WeekSlots (shape del dashboard).
// ---------------------------------------------------------------------------

interface BuildStats {
  items: number;
  mappedToCatalog: number;
  nonCatalogLines: number;
  unmapped: Array<{ name: string; where: string }>;
  newExercisesUsed: Set<string>;
}

function segmentToItem(
  seg: ParsedSegment,
  catalog: Catalog,
  uid: string,
  where: string,
  stats: BuildStats,
): WeekDayPartItem | null {
  const key = movementKey(seg.name);

  if (isNonCatalogLine(seg.name, key)) {
    stats.nonCatalogLines++;
    return null;
  }

  const alias = ALIAS_TO_SLUG.find((a) => a.test(seg.name, key));
  if (!alias) {
    stats.unmapped.push({ name: seg.name, where });
    return null;
  }
  const cat = catalog.get(alias.slug);
  if (!cat) {
    stats.unmapped.push({ name: `${seg.name} (slug ${alias.slug} ausente)`, where });
    return null;
  }

  // params_json — usa las keys canónicas de segmentParamsSchema.
  const params: Record<string, number> = {};
  if (seg.sets != null) params.sets = seg.sets;
  if (seg.reps != null) params.reps = seg.reps;
  if (seg.loadKg != null) params.weight_kg = seg.loadKg;
  if (seg.distanceM != null) params.distance_meters = seg.distanceM;
  if (seg.durationS != null) params.time_seconds = seg.durationS;
  if (seg.restS != null) params.rest_seconds = seg.restS;

  stats.mappedToCatalog++;
  stats.items++;
  return {
    uid,
    exercise_id: cat.id,
    exercise_name: cat.name,
    params_json: params,
    ...(seg.prescription ? { notes: seg.prescription.slice(0, 500) } : {}),
  };
}

function blockToPart(
  block: ParsedBlock,
  catalog: Catalog,
  uidBase: string,
  where: string,
  stats: BuildStats,
): WeekDayPart {
  const mapping = mapBlockToPart(block.kind, block.format, block.title, block.segments);
  const items: WeekDayPartItem[] = [];
  const noteLines: string[] = [];

  block.segments.forEach((seg, i) => {
    const item = segmentToItem(seg, catalog, `${uidBase}-i${i}`, where, stats);
    if (item) {
      items.push(item);
    } else if (!ALIAS_TO_SLUG.find((a) => a.test(seg.name, movementKey(seg.name)))) {
      // Línea de estructura/sin mapear → texto del bloque (target + prescripción).
      const presc = seg.prescription ? ` — ${seg.prescription}` : '';
      noteLines.push(`${seg.name}${presc}`.trim());
    }
  });

  // coach_note: intent del bloque + líneas no-catálogo (calentamiento, camina…).
  const noteParts: string[] = [];
  if (block.intent) noteParts.push(block.intent);
  if (noteLines.length > 0) noteParts.push(noteLines.join(' · '));
  const coachNote = noteParts.join(' — ').slice(0, 2000);

  const part: WeekDayPart = {
    uid: uidBase,
    format: mapping.format,
    title: mapping.title.slice(0, 120),
    ...(mapping.methodology_group_id != null
      ? { methodology_group_id: mapping.methodology_group_id }
      : {}),
    config_json: buildPartConfig(block),
    ...(coachNote ? { coach_note: coachNote } : {}),
    items,
  };
  return part;
}

function buildWeekSlots(week: ParsedWeek, catalog: Catalog, stats: BuildStats): WeekSlots {
  // Empieza con los 7 días en rest, rellena los presentes.
  const dayMap = new Map<number, WeekSession[]>();
  for (const day of week.days) {
    // day_of_week por la ETIQUETA del HTML (semana de entreno: lunes=día 1…
    // domingo=día 7), NO por la fecha de calendario — es una plantilla de
    // microciclo; la fecha real se asigna al publicar. data-dow es 0=lunes…6=domingo.
    const dow = day.dow + 1;
    const sessions: WeekSession[] = day.sessions.map((ses, si) => {
      const where = `W${week.weekNumber} ${day.date} ${ses.slot}`;
      const blocks = ses.blocks.map((b, bi) =>
        blockToPart(b, catalog, `w${week.weekNumber}-${day.date}-s${si}-b${bi}`, where, stats),
      );
      return {
        kind: 'workout',
        template_id: null,
        blocks,
        focus: (ses.title || undefined)?.slice(0, 120),
        ...(ses.desc ? { notes: ses.desc.slice(0, 800) } : {}),
      };
    });
    dayMap.set(dow, sessions);
  }

  const days = [1, 2, 3, 4, 5, 6, 7].map((day_of_week) => ({
    day_of_week,
    sessions: dayMap.get(day_of_week) ?? [],
  }));

  // Valida contra el Zod compartido (mismo shape que el dashboard/materializador).
  return weekSlotsSchema.parse(normalizeWeekSlotsInput({ days }));
}

/** Serializa WeekSlots a JSON plano (bigint→number) igual que el web. */
function slotsForDb(slots: WeekSlots): unknown {
  return JSON.parse(
    JSON.stringify(slots, (_, v) => (typeof v === 'bigint' ? Number(v) : v)),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const html = readFileSync(PLAN_HTML, 'utf8');
  const weeks = parseWeeks(html);
  if (weeks.length === 0) {
    throw new Error('No weeks parsed (W7-9 not found)');
  }

  const sql = getSql();
  try {
    // Catálogo: slug → {id, name}.
    const exRows = await sql<Array<{ id: string; slug: string; name: string }>>`
      select id::text, slug, name from exercises
    `;
    const catalog: Catalog = new Map(
      exRows.map((r) => [r.slug, { id: Number(r.id), name: r.name }]),
    );

    // Verifica que todos los slugs del alias-map existen (no inventamos ejercicios:
    // todos los del HTML ya están en el catálogo de 68).
    const referencedSlugs = new Set(ALIAS_TO_SLUG.map((a) => a.slug));
    const missingSlugs = [...referencedSlugs].filter((s) => !catalog.has(s));
    if (missingSlugs.length > 0) {
      throw new Error(`Slugs ausentes en catálogo: ${missingSlugs.join(', ')}`);
    }

    const stats: BuildStats = {
      items: 0,
      mappedToCatalog: 0,
      nonCatalogLines: 0,
      unmapped: [],
      newExercisesUsed: new Set(),
    };

    // Construye las semanas (idx 0..2 = W7,W8,W9). Empareja con el modelo de 4
    // semanas del microciclo añadiendo una 4ª vacía (deload placeholder).
    const weekSlotsByIndex = weeks.map((w) => buildWeekSlots(w, catalog, stats));

    // Idempotencia: borra el microciclo previo de coach 14 con este nombre.
    await sql.begin(async (tx) => {
      const prev = await tx<Array<{ id: string }>>`
        select id::text from program_month_templates
        where coach_id = ${COACH_ID} and name = ${MONTH_NAME}
      `;
      for (const row of prev) {
        const monthId = Number(row.id);
        const weekIds = await tx<Array<{ week_template_id: string }>>`
          select week_template_id::text from program_month_weeks
          where month_template_id = ${monthId}
        `;
        await tx`delete from program_month_weeks where month_template_id = ${monthId}`;
        if (weekIds.length > 0) {
          await tx`
            delete from program_week_templates
            where id = any(${weekIds.map((w) => Number(w.week_template_id))}::bigint[])
              and coach_id = ${COACH_ID}
          `;
        }
        await tx`delete from program_month_templates where id = ${monthId}`;
      }

      // Inserta el microciclo.
      const monthRows = await tx<Array<{ id: string }>>`
        insert into program_month_templates (coach_id, name)
        values (
          ${COACH_ID},
          ${MONTH_NAME}
        )
        returning id::text
      `;
      const monthId = Number(monthRows[0]!.id);

      // Semanas: W7→idx0, W8→idx1, W9→idx2 + 4ª vacía (deload) para el modelo de 4.
      const WEEK_LABELS = [
        'Semana 7',
        'Semana 8',
        'Semana 9',
        'Semana 4 (deload, sin detalle)',
      ];
      const emptySlots: WeekSlots = weekSlotsSchema.parse(
        normalizeWeekSlotsInput({
          days: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ day_of_week: d, sessions: [] })),
        }),
      );

      for (let i = 0; i < 4; i++) {
        const slots = i < weekSlotsByIndex.length ? weekSlotsByIndex[i]! : emptySlots;
        const weekName = `${MONTH_NAME} · ${WEEK_LABELS[i]}`;
        const weekRows = await tx<Array<{ id: string }>>`
          insert into program_week_templates (
            coach_id, name, focus, slots_json
          )
          values (
            ${COACH_ID},
            ${weekName},
            ${null},
            ${tx.json(slotsForDb(slots) as never)}
          )
          returning id::text
        `;
        const weekId = Number(weekRows[0]!.id);
        await tx`
          insert into program_month_weeks (month_template_id, week_template_id, position)
          values (${monthId}, ${weekId}, ${i})
        `;
      }

      // ---- Reporte ----
      const totalSessions = weekSlotsByIndex.reduce(
        (n, w) => n + w.days.reduce((m, d) => m + d.sessions.length, 0),
        0,
      );
      const totalBlocks = weekSlotsByIndex.reduce(
        (n, w) =>
          n +
          w.days.reduce(
            (m, d) => m + d.sessions.reduce((k, s) => k + (s.blocks?.length ?? 0), 0),
            0,
          ),
        0,
      );

      console.log('============================================================');
      console.log(`Microciclo creado: "${MONTH_NAME}" (id ${monthId}) coach ${COACH_ID}`);
      console.log(`  Semanas: 3 con detalle (W7,W8,W9) + 1 vacía (deload placeholder)`);
      console.log(`  Días con sesiones: ${weekSlotsByIndex.reduce((n,w)=>n+w.days.filter(d=>d.sessions.length>0).length,0)}`);
      console.log(`  Sesiones: ${totalSessions}`);
      console.log(`  Bloques (parts): ${totalBlocks}`);
      console.log(`  Items (ejercicios mapeados al catálogo): ${stats.items}`);
      console.log(`  Líneas no-catálogo guardadas como nota: ${stats.nonCatalogLines}`);
      console.log('------------------------------------------------------------');
      if (stats.unmapped.length === 0) {
        console.log('  Sin segmentos sin mapear (todos los movimientos reales mapearon).');
      } else {
        console.log(`  SEGMENTOS SIN MAPEAR (${stats.unmapped.length}):`);
        for (const u of stats.unmapped) console.log(`    - "${u.name}"  (${u.where})`);
      }
      console.log('============================================================');
    });

    // Lectura de vuelta con la lógica real (parseWeekSlotsRaw) para verificar shape.
    const monthRow = await sql<Array<{ id: string }>>`
      select id::text from program_month_templates
      where coach_id = ${COACH_ID} and name = ${MONTH_NAME} limit 1
    `;
    const monthId = Number(monthRow[0]!.id);
    const readback = await sql<Array<{ position: number; name: string; slots_json: unknown }>>`
      select mw.position, w.name, w.slots_json
      from program_month_weeks mw
      join program_week_templates w on w.id = mw.week_template_id
      where mw.month_template_id = ${monthId}
      order by mw.position
    `;
    const { parseWeekSlotsRaw } = await import(
      '@fahybrid/shared/domain/coach/program-week-slots'
    );
    console.log('\nReadback (validado con parseWeekSlotsRaw — lógica real del dashboard):');
    for (const w of readback) {
      const slots = parseWeekSlotsRaw(w.slots_json);
      const sessions = slots.days.reduce((n, d) => n + d.sessions.length, 0);
      const blocks = slots.days.reduce(
        (n, d) => n + d.sessions.reduce((m, s) => m + (s.blocks?.length ?? 0), 0),
        0,
      );
      const items = slots.days.reduce(
        (n, d) =>
          n +
          d.sessions.reduce(
            (m, s) => m + (s.blocks ?? []).reduce((k, b) => k + b.items.length, 0),
            0,
          ),
        0,
      );
      console.log(
        `  pos ${w.position}: ${w.name} → ${sessions} sesiones, ${blocks} bloques, ${items} items`,
      );
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
