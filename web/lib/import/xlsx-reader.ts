/**
 * Read Pablo's real 12-week plan workbook and extract, for a chosen variant and
 * a set of weeks, the per-day content Pablo actually wrote (plan importer #28).
 *
 * SOURCE OF TRUTH — the workbook `docs/Plantilla_HYROX_12sem*.xlsx`:
 *   Each week exists as THREE variant sheets of the SAME 7 days:
 *     · estandar    → "Semana N"   (all 12 weeks)
 *     · fuerza      → "Fue SN"     (foco fuerza — only S1..S5 authored)
 *     · resistencia → "Res SN"     (foco resistencia — only S1..S5 authored)
 *   Inside each sheet, days are COLUMNS (Lunes..Domingo) and there are two
 *   layers stacked vertically:
 *     · CAPA 1 · LÓGICA DEL MICROCICLO      → per-day STIMULUS  (one line)
 *     · CAPA 2 · SESIÓN EJEMPLO DETALLADA   → per-day SESSION   (Pablo's notation)
 *   (A "REGISTRO DEL ATLETA" block follows Capa 2 — ignored.)
 *
 * We do NOT hardcode row numbers: the real file has blank spacer rows and the
 * exact offsets drift between sheets. Instead we locate each "CAPA N" marker,
 * take the next day-header row (the one holding Lunes..Domingo), and read the
 * content row immediately below it. Days are mapped by NAME → day_of_week, so the
 * mapping is correct regardless of column order or spacer columns.
 *
 * XLSX access reuses the python3/openpyxl bridge established by
 * infra/scripts/import_blocks_xlsx.ts — there is deliberately no JS xlsx dep.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** The season is a fixed 12-week template. */
export const MIN_WEEK = 1;
export const MAX_WEEK = 12;

export type ImportVariant = 'estandar' | 'fuerza' | 'resistencia';

export type ImportedDay = {
  /** 1 = Lunes … 7 = Domingo. */
  day_of_week: number;
  /** Display day name, e.g. "Lunes". */
  dow: string;
  /** CAPA 1 — the day's stimulus line. Null when the cell is empty. */
  stimulus: string | null;
  /** CAPA 2 — the detailed session in Pablo's notation. Null when empty. */
  session_text: string | null;
};

export type ImportedWeek = {
  week: number;
  /** The sheet actually read (reflects a fallback, if one happened). */
  sheet: string;
  /**
   * True when the requested variant sheet did not exist for this week and we
   * fell back to the "Semana N" estándar sheet (Fue/Res only cover S1..S5).
   */
  fell_back: boolean;
  days: ImportedDay[];
};

/** Ordered so index+1 == day_of_week. Single source for names + matching. */
const DAY_DISPLAY = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

/** Accent-stripped, lowercased day names for tolerant header matching. */
const DAY_NORM = DAY_DISPLAY.map((d) => normKey(d));

/** Layer markers as they appear at the start of a section title cell. */
const CAPA1_MARKER = 'capa 1';
const CAPA2_MARKER = 'capa 2';

type Cell = string | number | null;
type Rows = Cell[][];

/** Lowercase + strip accents + trim, for tolerant text comparison. */
function normKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Trim a cell to a non-empty string, or null. */
function trimmed(c: Cell | undefined): string | null {
  if (c === null || c === undefined) return null;
  const s = String(c).trim();
  return s.length ? s : null;
}

/** variant + week → the sheet name Pablo used. */
export function variantSheetName(variant: ImportVariant, week: number): string {
  switch (variant) {
    case 'estandar':
      return `Semana ${week}`;
    case 'fuerza':
      return `Fue S${week}`;
    case 'resistencia':
      return `Res S${week}`;
  }
}

/** The estándar sheet is always the fallback (every week has one). */
function standardSheetName(week: number): string {
  return `Semana ${week}`;
}

/**
 * Read the requested sheets via the python3/openpyxl bridge. Returns the full
 * list of sheet names present (so the caller can decide fallbacks) plus a 2-D
 * cell grid for each requested name that exists. Config is passed as a JSON
 * literal to avoid any shell/quoting injection.
 */
function readSheets(
  path: string,
  names: string[],
): { available: string[]; sheets: Record<string, Rows> } {
  const cfg = JSON.stringify({ path, names });
  const py = `
import json, openpyxl
cfg = json.loads(${JSON.stringify(cfg)})
wb = openpyxl.load_workbook(cfg['path'], data_only=True)
available = list(wb.sheetnames)
sheets = {}
for name in cfg['names']:
    if name in wb.sheetnames:
        ws = wb[name]
        rows = []
        for r in ws.iter_rows(values_only=True):
            rows.append([c if (c is None or isinstance(c, (int, float))) else str(c) for c in r])
        sheets[name] = rows
print(json.dumps({'available': available, 'sheets': sheets}))
`;
  const stdout = execFileSync('python3', ['-c', py], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout) as { available: string[]; sheets: Record<string, Rows> };
}

/** First row index whose any cell (normalized) starts with `marker`. */
function findMarkerRow(rows: Rows, marker: string): number {
  for (let i = 0; i < rows.length; i++) {
    for (const c of rows[i]!) {
      if (c !== null && normKey(String(c)).startsWith(marker)) return i;
    }
  }
  return -1;
}

/** First row after `fromRow` that holds a day name (the section's header). */
function findHeaderRow(rows: Rows, fromRow: number): number {
  for (let i = fromRow + 1; i < rows.length; i++) {
    for (const c of rows[i]!) {
      if (c !== null && DAY_NORM.includes(normKey(String(c)))) return i;
    }
  }
  return -1;
}

/** Map day_of_week (1..7) → column index, from a header row. */
function dayColumns(headerRow: Rows[number]): Map<number, number> {
  const m = new Map<number, number>();
  headerRow.forEach((c, col) => {
    if (c === null) return;
    const idx = DAY_NORM.indexOf(normKey(String(c)));
    if (idx >= 0) m.set(idx + 1, col);
  });
  return m;
}

/**
 * Parse one sheet's grid into the 7 day rows. Locates both CAPA layers by their
 * markers and reads the content row under each layer's day-header.
 */
function parseSheet(rows: Rows, sheetName: string): ImportedDay[] {
  const c1 = findMarkerRow(rows, CAPA1_MARKER);
  const c2 = findMarkerRow(rows, CAPA2_MARKER);
  if (c1 < 0 || c2 < 0) {
    throw new Error(
      `sheet "${sheetName}": could not locate CAPA 1/CAPA 2 markers (found c1=${c1}, c2=${c2})`,
    );
  }
  const h1 = findHeaderRow(rows, c1);
  const h2 = findHeaderRow(rows, c2);
  if (h1 < 0 || h2 < 0) {
    throw new Error(`sheet "${sheetName}": could not locate day-header rows under a CAPA marker`);
  }

  const stimulusRow = rows[h1 + 1] ?? [];
  const sessionRow = rows[h2 + 1] ?? [];
  const stimulusCols = dayColumns(rows[h1]!);
  const sessionCols = dayColumns(rows[h2]!);

  const days: ImportedDay[] = [];
  for (let dow = 1; dow <= DAY_DISPLAY.length; dow++) {
    const sCol = stimulusCols.get(dow);
    const tCol = sessionCols.get(dow);
    if (sCol === undefined && tCol === undefined) continue; // day absent in both headers
    days.push({
      day_of_week: dow,
      dow: DAY_DISPLAY[dow - 1]!,
      stimulus: sCol === undefined ? null : trimmed(stimulusRow[sCol]),
      session_text: tCol === undefined ? null : trimmed(sessionRow[tCol]),
    });
  }
  return days;
}

/**
 * Read the plan workbook for one variant across the given weeks. For each week
 * we use the variant sheet if it exists; otherwise we fall back to the estándar
 * "Semana N" sheet and set `fell_back` (Fue/Res only cover S1..S5).
 */
export async function readPlanWorkbook(
  path: string,
  variant: ImportVariant,
  weeks: number[],
): Promise<ImportedWeek[]> {
  if (!existsSync(path)) {
    throw new Error(`plan workbook not found: ${path}`);
  }
  const uniqueWeeks = [...new Set(weeks)].sort((a, b) => a - b);
  for (const w of uniqueWeeks) {
    if (!Number.isInteger(w) || w < MIN_WEEK || w > MAX_WEEK) {
      throw new Error(`week ${w} out of range ${MIN_WEEK}..${MAX_WEEK}`);
    }
  }
  if (uniqueWeeks.length === 0) return [];

  // Ask python once for every sheet we might need (variant + estándar fallback).
  const wanted = new Set<string>();
  for (const w of uniqueWeeks) {
    wanted.add(variantSheetName(variant, w));
    wanted.add(standardSheetName(w));
  }
  const { available, sheets } = readSheets(path, [...wanted]);
  const avail = new Set(available);

  const out: ImportedWeek[] = [];
  for (const w of uniqueWeeks) {
    const primary = variantSheetName(variant, w);
    let sheetName: string;
    let fellBack: boolean;
    if (avail.has(primary)) {
      sheetName = primary;
      fellBack = false;
    } else if (avail.has(standardSheetName(w))) {
      sheetName = standardSheetName(w);
      fellBack = variant !== 'estandar';
    } else {
      throw new Error(
        `no sheet for week ${w}: looked for "${primary}" and "${standardSheetName(w)}"`,
      );
    }
    const rows = sheets[sheetName];
    if (!rows) throw new Error(`sheet "${sheetName}" reported available but returned no rows`);
    out.push({ week: w, sheet: sheetName, fell_back: fellBack, days: parseSheet(rows, sheetName) });
  }
  return out;
}

/**
 * A coach can paste a single day's session instead of pointing at the xlsx.
 * "One session's text → one day": the pasted block becomes the day's
 * `session_text` (Capa 2 content). If the first non-empty line is a day name
 * ("Martes\n…"), we lift it into day_of_week/dow; otherwise the day is unknown.
 */
export type PastedDay = {
  day_of_week: number | null;
  dow: string | null;
  stimulus: string | null;
  session_text: string | null;
};

export function parsePastedText(text: string): PastedDay {
  const raw = (text ?? '').trim();
  if (!raw) return { day_of_week: null, dow: null, stimulus: null, session_text: null };

  const lines = raw.split(/\r?\n/);
  let day_of_week: number | null = null;
  let dow: string | null = null;
  let body = lines;

  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstIdx >= 0) {
    const di = DAY_NORM.indexOf(normKey(lines[firstIdx]!));
    if (di >= 0) {
      day_of_week = di + 1;
      dow = DAY_DISPLAY[di]!;
      body = lines.slice(firstIdx + 1);
    }
  }

  const session_text = body.join('\n').trim() || null;
  return { day_of_week, dow, stimulus: null, session_text };
}
