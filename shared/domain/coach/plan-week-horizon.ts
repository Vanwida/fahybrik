// @fahybrid/shared/domain/coach/plan-week-horizon — cuántas semanas del plan
// puede HOJEAR el atleta en la pestaña Plan.
//
// POR QUÉ ES DATO (HARD RULE Nº0)
// -------------------------------
// Que el atleta solo vea la semana en curso hasta que el coach publique más es
// MECANISMO (entrega semanal, borrador vs publicado). CUÁNTAS semanas adelante
// deja ver el club antes de tiempo es MÉTODO: uno entrega el sábado la siguiente
// y otro prefiere un mes de vista. «¿Otro entrenador competente lo haría
// distinto?» → sí → columna en `coaches`, no `const` en la app.

/** Valores persistidos en `coaches.plan_week_horizon`. */
export const PLAN_WEEK_HORIZON_VALUES = [
  'this_week',
  'next_week',
  'two_weeks',
  'one_month',
] as const;

export type PlanWeekHorizon = (typeof PLAN_WEEK_HORIZON_VALUES)[number];

/** Defecto para coaches NUEVOS (column default en la migración). */
export const DEFAULT_PLAN_WEEK_HORIZON: PlanWeekHorizon = 'this_week';

/**
 * Valor heredado para clubs EXISTENTES antes de FH-27: la API aceptaba
 * `week_offset=1` siempre. El backfill de la migración les pone esto para que
 * quien no toque el ajuste siga igual que hoy.
 */
export const LEGACY_PLAN_WEEK_HORIZON: PlanWeekHorizon = 'next_week';

/** El mayor `week_offset` que el atleta puede pedir (0 = solo esta semana). */
export function maxWeekOffset(horizon: PlanWeekHorizon): number {
  switch (horizon) {
    case 'this_week':
      return 0;
    case 'next_week':
      return 1;
    case 'two_weeks':
      return 2;
    case 'one_month':
      return 4;
    default: {
      const _exhaustive: never = horizon;
      return _exhaustive;
    }
  }
}

export interface PlanWeekHorizonOption {
  value: PlanWeekHorizon;
  /** Etiqueta corta en el panel del coach. */
  label: string;
  /** Una línea de ayuda — qué verá el atleta. */
  help: string;
}

/** Opciones del selector del dashboard, en orden de apertura creciente. */
export const PLAN_WEEK_HORIZON_OPTIONS: PlanWeekHorizonOption[] = [
  {
    value: 'this_week',
    label: 'Solo esta semana',
    help: 'El atleta ve el lunes–domingo en curso. No puede hojear semanas futuras.',
  },
  {
    value: 'next_week',
    label: 'Esta semana y la siguiente',
    help: 'Puede deslizar una semana hacia adelante cuando ya esté publicada.',
  },
  {
    value: 'two_weeks',
    label: 'Unas dos semanas',
    help: 'Hasta dos semanas por delante de la actual, si el plan ya está publicado.',
  },
  {
    value: 'one_month',
    label: 'Un mes aproximado',
    help: 'Hasta cuatro semanas por delante de la actual, si el plan ya está publicado.',
  },
];

/**
 * Copy objetivo cuando el atleta intenta hojear más allá del tope del club.
 * No infantiliza; explica el límite sin culpar al atleta.
 */
export function planWeekHorizonWallMessage(horizon: PlanWeekHorizon | null): string {
  switch (horizon) {
    case 'this_week':
      return 'Tu entrenador solo ha abierto esta semana de momento.';
    case 'next_week':
      return 'Tu club limita la vista del plan a esta semana y la siguiente.';
    case 'two_weeks':
      return 'Tu club limita la vista del plan a unas dos semanas.';
    case 'one_month':
      return 'Tu club limita la vista del plan a un mes aproximado.';
    case null:
      return 'Solo puedes ver la semana en curso.';
    default: {
      const _exhaustive: never = horizon;
      return _exhaustive;
    }
  }
}

export function isPlanWeekHorizon(raw: string): raw is PlanWeekHorizon {
  return (PLAN_WEEK_HORIZON_VALUES as readonly string[]).includes(raw);
}
