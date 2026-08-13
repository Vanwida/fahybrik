// Informe de UNA ocurrencia de salto. Se deriva al leer; no se guarda un póster.
// Mecanismo = física. Método = bandas y etiquetas del coach.

import {
  DEFAULT_JUMP_METHOD,
  formatJumpHeightCm,
  formatLri,
  heightLevel,
  loadResponse,
  lriLevel,
  type JumpMethod,
} from '../jump/method';

export interface ScaleBand {
  level: 1 | 2 | 3 | 4 | 5;
  range_label: string;
  label: string;
  active: boolean;
}

export interface CmjAttemptView {
  kind: 'cmj' | 'loaded_cmj';
  height_cm: number;
  kept: boolean;
  quality: string;
}

export interface CmjReport {
  title: string;
  date_label: string | null;
  unloaded_cm: number;
  loaded_cm: number | null;
  height_level: 1 | 2 | 3 | 4 | 5;
  height_label: string;
  loaded_height_level: 1 | 2 | 3 | 4 | 5 | null;
  lri: number | null;
  lri_label: string | null;
  lri_level: 1 | 2 | 3 | 4 | 5 | null;
  drop_abs_cm: number | null;
  drop_rel: number | null;
  load_rel: number | null;
  load_kg: number | null;
  body_mass_kg: number | null;
  lectura: string;
  height_scale: ScaleBand[];
  lri_scale: ScaleBand[];
  attempts: CmjAttemptView[];
}

export function heightLabel(level: 1 | 2 | 3 | 4 | 5, method: JumpMethod): string {
  return method.height_bands_cm.find((b) => b.level === level)?.label ?? `Nivel ${level}`;
}

export function heightScale(cm: number, method: JumpMethod = DEFAULT_JUMP_METHOD): ScaleBand[] {
  const active = heightLevel(cm, method);
  const bands = method.height_bands_cm;
  return bands.map((b, i) => {
    const prev = i === 0 ? null : bands[i - 1]!.max;
    let range_label: string;
    if (b.max == null) {
      range_label = prev == null ? '—' : `> ${prev} cm`;
    } else if (prev == null) {
      range_label = `< ${b.max} cm`;
    } else {
      range_label = `${prev} – ${b.max} cm`;
    }
    return { level: b.level, range_label, label: b.label, active: b.level === active };
  });
}

export function lriScale(lri: number | null, method: JumpMethod = DEFAULT_JUMP_METHOD): ScaleBand[] {
  const active = lri == null ? null : lriLevel(lri, method);
  const bands = method.lri_bands;
  return bands.map((b, i) => {
    const prev = i === 0 ? null : bands[i - 1]!.max;
    let range_label: string;
    if (b.max == null) {
      range_label = prev == null ? '—' : `> ${formatBound(prev)}`;
    } else if (prev == null) {
      range_label = `≤ ${formatBound(b.max)}`;
    } else {
      range_label = `${formatBound(prev)} – ${formatBound(b.max)}`;
    }
    return { level: b.level, range_label, label: b.label, active: active != null && b.level === active };
  });
}

function formatBound(n: number): string {
  return String(n).replace('.', ',');
}

export function pctPoints(ratio: number): number {
  return Math.round(ratio * 100);
}

export function composeLectura(input: {
  height_label: string;
  drop_rel: number | null;
  load_rel: number | null;
  lri_label: string | null;
}): string {
  const explosiva = `Capacidad explosiva ${input.height_label.toLowerCase()}.`;
  if (input.drop_rel == null || input.load_rel == null || !input.lri_label) return explosiva;
  return (
    `${explosiva} Al añadir una carga equivalente al ${pctPoints(input.load_rel)} % de su peso ` +
    `pierde un ${pctPoints(input.drop_rel)} % de altura. ` +
    `Respuesta a la carga: ${input.lri_label.toLowerCase()}.`
  );
}

export function buildCmjReport(input: {
  title: string;
  date_label?: string | null;
  unloaded_cm: number;
  loaded_cm?: number | null;
  load_kg?: number | null;
  body_mass_kg?: number | null;
  attempts?: CmjAttemptView[];
  method?: JumpMethod;
}): CmjReport {
  const method = input.method ?? DEFAULT_JUMP_METHOD;
  const loaded = input.loaded_cm ?? null;
  const loadKg = input.load_kg ?? null;
  const bodyMass = input.body_mass_kg ?? null;
  const resp =
    loaded != null && loadKg != null && bodyMass != null
      ? loadResponse(input.unloaded_cm, loaded, loadKg, bodyMass)
      : null;
  const hLevel = heightLevel(input.unloaded_cm, method);
  const hLabel = heightLabel(hLevel, method);
  const loadedLevel = loaded != null ? heightLevel(loaded, method) : null;
  const lLevel = resp ? lriLevel(resp.lri, method) : null;
  const lLabel = lLevel != null ? (method.lri_bands.find((b) => b.level === lLevel)?.label ?? formatLri(resp!.lri)) : null;

  return {
    title: input.title,
    date_label: input.date_label ?? null,
    unloaded_cm: input.unloaded_cm,
    loaded_cm: loaded,
    height_level: hLevel,
    height_label: hLabel,
    loaded_height_level: loadedLevel,
    lri: resp?.lri ?? null,
    lri_label: lLabel,
    lri_level: lLevel,
    drop_abs_cm: resp?.drop_abs_cm ?? null,
    drop_rel: resp?.drop_rel ?? null,
    load_rel: resp?.load_rel ?? null,
    load_kg: loadKg,
    body_mass_kg: bodyMass,
    lectura: composeLectura({
      height_label: hLabel,
      drop_rel: resp?.drop_rel ?? null,
      load_rel: resp?.load_rel ?? null,
      lri_label: lLabel,
    }),
    height_scale: heightScale(input.unloaded_cm, method),
    lri_scale: lriScale(resp?.lri ?? null, method),
    attempts: input.attempts ?? [],
  };
}

export { formatJumpHeightCm, formatLri };
