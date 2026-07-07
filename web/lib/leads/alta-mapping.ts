import 'server-only';

import { leadOptionLabel, type LeadColumn } from '@fahybrid/shared/domain/leads/questions';

// Lead → athlete translation for the alta (#5).
//
// The lead's onboarding answers are STABLE snake_case codes (nivel='principiante',
// dias_semana='d3_4', sexo='hombre', …) that do NOT 1:1 match the athlete model
// (athlete_sex enum, the per-coach athlete_levels catalog, an integer
// training_days_per_week). This module is the single, explicit translation layer
// so the alta pre-fill and the persisted athlete profile never drift on codes.
//
// Scope (per the alta spec): STRUCTURED carry-over = name, email, edad→dob, sexo,
// nivel→level, días/semana. Everything else (objetivo, carrera, lesiones, texto
// libre, dobles) is distilled into readable COACH NOTES — the full lead stays
// linked via leads.converted_athlete_id, so nothing is lost.

export type AthleteSex = 'male' | 'female' | 'other';
export type AthleteModality = 'individual' | 'dobles' | 'pro_elite';

const SEX_BY_CODE: Record<string, AthleteSex> = {
  hombre: 'male',
  mujer: 'female',
  prefiero_no_decir: 'other',
};

// Lead self-reported level (4 codes) → coach level-catalog NAME (N1–N5, seeded per
// coach in 0057). N5 (Elite) is intentionally never auto-assigned from a self-report;
// the coach can bump it in the modal.
const LEVEL_NAME_BY_CODE: Record<string, string> = {
  principiante: 'N1',
  intermedio: 'N2',
  avanzado: 'N3',
  competidor: 'N4',
};

// A days-per-week RANGE code → one concrete integer (upper bound of the range — the
// realistic training ceiling the plan should target). Satisfies athletes_training_days_chk.
const DAYS_BY_CODE: Record<string, number> = {
  d2_3: 3,
  d3_4: 4,
  d4_5: 5,
  d6_mas: 6,
};

export function mapSex(code: string | null | undefined): AthleteSex | null {
  return code ? (SEX_BY_CODE[code] ?? null) : null;
}

export function mapLevelName(code: string | null | undefined): string | null {
  return code ? (LEVEL_NAME_BY_CODE[code] ?? null) : null;
}

export function mapTrainingDays(code: string | null | undefined): number | null {
  return code ? (DAYS_BY_CODE[code] ?? null) : null;
}

/**
 * edad (whole years) → an approximate ISO dob (Jan 1 of the birth year). Coarse BY
 * DESIGN — the onboarding only captures age, and the coach refines the exact dob
 * later; a Jan-1 birth year is a valid, unambiguous placeholder. Out-of-range → null.
 */
export function ageToDobIso(edad: number | null | undefined, now: Date = new Date()): string | null {
  if (edad == null || !Number.isFinite(edad) || edad < 12 || edad > 100) return null;
  const year = now.getUTCFullYear() - Math.round(edad);
  return `${year}-01-01`;
}

/** Doubles-with-partner intent → 'dobles' modality; otherwise 'individual'. */
export function inferModality(row: {
  categoria_objetivo?: string | null;
  dobles_pareja?: string | null;
}): AthleteModality {
  const cat = row.categoria_objetivo ?? '';
  const par = row.dobles_pareja ?? '';
  if (cat === 'dobles_open' || cat === 'dobles_pro' || par === 'si_plan_compartido' || par === 'si_planes_separados') {
    return 'dobles';
  }
  return 'individual';
}

/** A visible hint for the coach when the lead wants to train doubles with a partner. */
export function doblesHint(row: { dobles_pareja?: string | null }): string | null {
  switch (row.dobles_pareja) {
    case 'si_plan_compartido':
      return 'Interesado en DOBLES con pareja — quiere plan compartido.';
    case 'si_planes_separados':
      return 'Interesado en DOBLES con pareja — cada uno su plan.';
    default:
      return null;
  }
}

function line(label: string, value: string | null | undefined): string | null {
  const v = value?.toString().trim();
  return v ? `${label}: ${v}` : null;
}

/**
 * Distil the lead's non-structured onboarding answers into readable ES coach notes
 * (what Pablo skims before building the plan). Codes are rendered as Spanish labels.
 * Free text is included verbatim. The doubles hint is appended so it stays visible.
 */
export function buildCoachNotes(row: Record<string, unknown>): string {
  const s = (k: string) => (row[k] as string | null | undefined) ?? null;
  const label = (col: LeadColumn, code: string | null) => (code ? leadOptionLabel(col, code) : null);

  const carrera = [label('carrera_cual', s('carrera_cual')), label('carrera_cuando', s('carrera_cuando'))]
    .filter(Boolean)
    .join(' · ');

  const lesiones = [
    label('lesion_actual', s('lesion_actual')),
    Array.isArray(row.lesion_zonas) && (row.lesion_zonas as string[]).length
      ? `zonas: ${(row.lesion_zonas as string[]).map((z) => leadOptionLabel('lesion_zonas', z)).join(', ')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const parts = [
    line('Objetivo', label('objetivo', s('objetivo'))),
    carrera ? `Carrera: ${carrera}` : null,
    line('Plazo', label('plazo', s('plazo'))),
    line('Punto débil', label('punto_debil', s('punto_debil'))),
    lesiones ? `Lesiones: ${lesiones}` : null,
    line('Planes previos', label('planes_previos', s('planes_previos'))),
    line('Qué espera', label('espera_coaching', s('espera_coaching'))),
    line('Nota', s('nota_libre')),
    doblesHint(row as { dobles_pareja?: string | null }),
  ].filter(Boolean) as string[];

  return parts.join('\n');
}

export interface AltaPrefill {
  full_name: string;
  email: string;
  edad: number | null;
  sex: AthleteSex | null;
  training_days_per_week: number | null;
  /** Mapped coach-level NAME (N1–N4) — the modal pre-selects the matching level. */
  level_name: string | null;
  modality: AthleteModality;
  notes: string;
}

/** Build the alta-modal pre-fill from a raw `leads` row. */
export function buildAltaPrefill(row: Record<string, unknown>): AltaPrefill {
  const nombre = (row.nombre as string | null)?.trim() || '';
  return {
    full_name: nombre,
    email: (row.email as string) ?? '',
    edad: (row.edad as number | null) ?? null,
    sex: mapSex(row.sexo as string | null),
    training_days_per_week: mapTrainingDays(row.dias_semana as string | null),
    level_name: mapLevelName(row.nivel as string | null),
    modality: inferModality(row as { categoria_objetivo?: string | null; dobles_pareja?: string | null }),
    notes: buildCoachNotes(row),
  };
}
