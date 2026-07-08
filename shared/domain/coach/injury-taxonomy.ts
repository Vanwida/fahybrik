// Canonical injury taxonomy (#16) — the SINGLE source of truth for injury zones,
// severities and lifecycle status. Before this, four divergent vocabularies
// existed (funnel lesion_zonas, iOS chips, the dead shared `severity`, funnel
// lesion_actual) and the coach UI read a `severity` field nothing wrote. Everything
// injury-related now references THESE constants.

export const INJURY_ZONES = [
  'rodilla',
  'tobillo_pie',
  'lumbar',
  'cadera',
  'hombro',
  'muneca',
  'codo',
  'isquios',
  'gemelo',
  'cuello',
  'otra',
] as const;
export type InjuryZone = (typeof INJURY_ZONES)[number];

export const INJURY_ZONE_LABEL: Record<InjuryZone, string> = {
  rodilla: 'Rodilla',
  tobillo_pie: 'Tobillo / pie',
  lumbar: 'Lumbar',
  cadera: 'Cadera',
  hombro: 'Hombro',
  muneca: 'Muñeca',
  codo: 'Codo',
  isquios: 'Isquios',
  gemelo: 'Gemelo',
  cuello: 'Cuello',
  otra: 'Otra',
};

export const INJURY_SEVERITIES = ['leve', 'moderada', 'severa'] as const;
export type InjurySeverity = (typeof INJURY_SEVERITIES)[number];
export const INJURY_SEVERITY_LABEL: Record<InjurySeverity, string> = {
  leve: 'Leve',
  moderada: 'Moderada',
  severa: 'Severa',
};

// Lifecycle status (an axis SEPARATE from severity).
export const INJURY_STATUSES = ['activa', 'en_recuperacion', 'resuelta'] as const;
export type InjuryStatus = (typeof INJURY_STATUSES)[number];
export const INJURY_STATUS_LABEL: Record<InjuryStatus, string> = {
  activa: 'Activa',
  en_recuperacion: 'En recuperación',
  resuelta: 'Resuelta',
};
/** A status that still limits training (drives the roster badge + adherence link). */
export function isOpen(status: InjuryStatus): boolean {
  return status === 'activa' || status === 'en_recuperacion';
}

// State machine — valid transitions. resuelta → activa is a REOPEN (a relapse),
// which the callers model as a NEW episode row, so it is not a self-transition here.
const TRANSITIONS: Record<InjuryStatus, InjuryStatus[]> = {
  activa: ['en_recuperacion', 'resuelta'],
  en_recuperacion: ['activa', 'resuelta'], // can flare back to activa
  resuelta: [], // terminal for THIS episode; a relapse is a new injury
};
export function canTransition(from: InjuryStatus, to: InjuryStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].includes(to);
}

// Session adaptation kinds (how a session was changed for an injury).
//   rest        → excluded from the adherence denominator (like a pause day)
//   substituted → swapped to rehab; still counts via its execution
//   softened    → reduced volume/intensity; still counts
export const INJURY_ADAPTATIONS = ['rest', 'substituted', 'softened'] as const;
export type InjuryAdaptation = (typeof INJURY_ADAPTATIONS)[number];
/** True when this adaptation removes the session from the adherence denominator. */
export function adaptationExcludesFromAdherence(a: InjuryAdaptation): boolean {
  return a === 'rest';
}

// ── Normalizers: legacy vocabularies → canonical (mirrors the 0106 backfill CASE) ──

/** Map any legacy `area` string (funnel code / iOS label / free text) to a canonical zone. */
export function normalizeZone(raw: string | null | undefined): InjuryZone {
  const s = (raw ?? '').toLowerCase();
  if (/(rodilla|knee)/.test(s)) return 'rodilla';
  if (/(tobillo|pie|ankle|foot)/.test(s)) return 'tobillo_pie';
  if (/(lumbar|espalda|low.?back|back)/.test(s)) return 'lumbar';
  if (/(cadera|hip)/.test(s)) return 'cadera';
  if (/(hombro|shoulder)/.test(s)) return 'hombro';
  if (/(muñeca|muneca|wrist)/.test(s)) return 'muneca';
  if (/(codo|elbow)/.test(s)) return 'codo';
  if (/(isquio|hamstring)/.test(s)) return 'isquios';
  if (/(gemelo|calf)/.test(s)) return 'gemelo';
  if (/(cuello|neck)/.test(s)) return 'cuello';
  return 'otra';
}

/** Funnel lesion_actual → the (severity, status) split it always conflated. */
export function mapFunnelInjury(code: string | null | undefined): {
  severity: InjurySeverity;
  status: InjuryStatus;
} {
  switch (code) {
    case 'leve':
      return { severity: 'leve', status: 'activa' };
    case 'limita':
      return { severity: 'moderada', status: 'activa' };
    case 'recuperandose':
      return { severity: 'leve', status: 'en_recuperacion' };
    default:
      return { severity: 'leve', status: 'activa' };
  }
}
