import type { PhaseRole } from '@fahybrid/shared/schema/_primitives';

// =============================================================================
// PHASE ROLE PRESENTATION — the agnostic intensity ramp, client-safe (NO db
// import) so both the server resolver (phases.ts) and the editor UI share ONE
// source of truth for role -> color / badge / label.
//
// The `role` axis (volume | intensity | peak | recovery | maintenance) is the
// ONLY closed dimension of a coach-defined phase; it drives the generic
// green -> amber -> red ramp, mapped onto existing design tokens (verified in
// web/app/globals.css):
//   --status-success (green) · --status-warning (amber) · --danger (red) ·
//   --info (blue) · --text-muted (neutral).
// =============================================================================

/** All roles, in intensity-ramp order, for selects / legends. */
export const PHASE_ROLES: readonly PhaseRole[] = [
  'volume',
  'intensity',
  'peak',
  'recovery',
  'maintenance',
] as const;

/** CSS color token per role (the green -> amber -> red ramp). */
const ROLE_COLOR: Record<PhaseRole, string> = {
  volume: 'var(--status-success)', // base / high volume -> green
  intensity: 'var(--status-warning)', // specific intensity -> amber
  peak: 'var(--danger)', // peaking / competition -> red
  recovery: 'var(--info)', // deload / recovery -> blue
  maintenance: 'var(--text-muted)', // maintenance / neutral
};

export function roleColor(role: PhaseRole): string {
  return ROLE_COLOR[role] ?? ROLE_COLOR.maintenance;
}

/** Coach-facing role label (Spanish, founder vocab — "fase", never "microciclo"). */
export const ROLE_LABEL: Record<PhaseRole, string> = {
  volume: 'Volumen',
  intensity: 'Intensidad',
  peak: 'Pico / Competición',
  recovery: 'Recuperación',
  maintenance: 'Mantenimiento',
};

/** One-line hint explaining what each role does on the intensity ramp. */
export const ROLE_HINT: Record<PhaseRole, string> = {
  volume: 'Volumen alto, intensidad moderada. Base.',
  intensity: 'Sube intensidad, baja volumen. Trabajo específico.',
  peak: 'Afinar y competir. Carga máxima específica.',
  recovery: 'Descarga: bajar carga para recuperar.',
  maintenance: 'Sostener sin progresar. Neutro.',
};

// =============================================================================
// DEFAULT ATR SEED — the one-click "usar set ATR por defecto" starting point for
// a coach with no phases yet. Mirrors migration 0052's seed (Acumulación /
// Transformación / Realización + Descarga) so the UI default == the DB default.
// =============================================================================
export interface PhaseSeed {
  label: string;
  role: PhaseRole;
  default_weeks: number;
  is_deload: boolean;
  description: string;
}

export const ATR_PHASE_SEED: readonly PhaseSeed[] = [
  {
    label: 'Acumulación',
    role: 'volume',
    default_weeks: 5,
    is_deload: false,
    description: 'Volumen alto, intensidad moderada. Construir base.',
  },
  {
    label: 'Transformación',
    role: 'intensity',
    default_weeks: 4,
    is_deload: false,
    description: 'Sube intensidad, baja volumen. Trabajo específico.',
  },
  {
    label: 'Realización',
    role: 'peak',
    default_weeks: 3,
    is_deload: false,
    description: 'Descarga previa a competir. Afinar y recuperar.',
  },
  {
    label: 'Descarga',
    role: 'recovery',
    default_weeks: 1,
    is_deload: true,
    description: 'Semana de descarga: bajar carga para recuperar y supercompensar.',
  },
] as const;

/**
 * Tailwind chip classes for a role badge. Mirrors the green/amber/red/blue/
 * neutral ramp; used by the server resolver's `badgeClass` and the editor legend.
 */
export function roleBadgeClass(role: PhaseRole): string {
  switch (role) {
    case 'volume':
      return 'border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 text-[color:var(--status-success)]';
    case 'intensity':
      return 'border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]';
    case 'peak':
      return 'border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 text-[color:var(--danger)]';
    case 'recovery':
      return 'border-[color:var(--info)]/40 bg-[color:var(--info)]/10 text-[color:var(--info)]';
    case 'maintenance':
    default:
      return 'border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] text-[color:var(--text-muted)]';
  }
}
