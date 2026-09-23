import { z } from 'zod';
import { isoDate } from './_primitives';
import { isMonday, ON_CONFLICT_VALUES, type OnConflict } from '../domain/coach/plan-placement';
import { WEEK_DELIVERY_VALUES, type WeekDelivery } from '../domain/coach/week-publishing';

// «Asignar a varios» (POST /api/coach/assign) — contrato §4.6 del plan del panel.
// Un programa, muchos atletas (sueltos y/o los miembros de uno o varios grupos),
// desde un lunes, con vista previa (dry_run) y deshacer por lote.
//
// Los ids viajan como cadenas de dígitos (snake_case, JSON sin bigint); se
// aceptan también números. `coach_id` NUNCA viene del cliente.

/** Un id de la API: "123" o 123 → "123". */
export const apiIdSchema = z
  .union([z.string().regex(/^\d+$/, 'Id inválido: tiene que ser un número.'), z.number().int().positive()])
  .transform((v) => String(v));

/** Un lunes (YYYY-MM-DD). Cualquier otro día se rechaza: no lo movemos a escondidas. */
export const mondaySchema = isoDate.refine(isMonday, {
  message: 'La fecha de inicio tiene que ser un lunes. Elige el lunes de la semana en que empieza.',
});

export const assignDeliverySchema = z.enum(WEEK_DELIVERY_VALUES);
export const assignOnConflictSchema = z.enum(ON_CONFLICT_VALUES);

/** Tope de destinatarios por envío: cordura del sistema, no método. */
export const ASSIGN_MAX_ATHLETES = 500;

export const assignManyInputSchema = z
  .object({
    program_id: apiIdSchema,
    athlete_ids: z.array(apiIdSchema).max(ASSIGN_MAX_ATHLETES).optional(),
    group_ids: z.array(apiIdSchema).max(50).optional(),
    start_date: mondaySchema,
    /** Semana del programa por la que se entra (1 = desde el principio). */
    start_week: z.number().int().min(1).max(52).optional(),
    delivery: assignDeliverySchema.default('auto'),
    on_conflict: assignOnConflictSchema.default('chain'),
    dry_run: z.boolean().optional(),
  })
  .refine((v) => (v.athlete_ids?.length ?? 0) + (v.group_ids?.length ?? 0) > 0, {
    message: 'Elige al menos un atleta o un grupo.',
    path: ['athlete_ids'],
  });
export type AssignManyInput = z.infer<typeof assignManyInputSchema>;

export type AssignAction = 'assign' | 'chain' | 'replace' | 'skip' | 'blocked';

/** El plan que ya tiene y estorba (el último, si son varios). */
export interface AssignConflict {
  program_name: string;
  start_date: string;
  end_date: string;
  /** Cuántos planes suyos se cruzan con la ventana pedida. */
  count: number;
}

export interface AssignPreviewAthlete {
  id: string;
  name: string;
  conflict: AssignConflict | null;
  /** Lo que se le va a hacer. `blocked` = no se le puede asignar (ver `blocked`). */
  action: AssignAction;
  /** Ventana real para ESTE atleta (tras encadenar o alinear con el grupo). */
  start_date: string | null;
  end_date: string | null;
  /** Programa que recibe y semana por la que entra. */
  program: { id: string; name: string } | null;
  start_week: number | null;
  blocked: { code: string; message: string } | null;
  lifecycle: 'activo' | 'pausado' | 'baja';
  /** Pareja de dobles: entrenan el mismo plan. Si la pareja no va en el envío, avisa. */
  pair_partner: { id: string; name: string; included: boolean } | null;
}

export interface AssignPreview {
  program: { id: string; name: string; weeks: number } | null;
  group: { id: string; name: string } | null;
  /** Ventana pedida (sin conflictos): el lunes de inicio y el domingo final. */
  start_date: string;
  end_date: string;
  /** Semanas que se materializan por atleta desde `start_week`. */
  weeks: number;
  sessions_per_athlete: number;
  athletes: AssignPreviewAthlete[];
  counts: Record<AssignAction, number> & { total: number };
}

export type AssignItemStatus = 'applied' | 'skipped' | 'failed';

export interface AssignApplied {
  batch_id: string;
  assigned: number;
  skipped: number;
  failed: number;
  /** El mismo envío llegó dos veces: se devuelve el lote que ya existía. */
  replayed: boolean;
  results: Array<{ athlete_id: string; status: AssignItemStatus; reason: string | null }>;
}

export interface AssignResponse {
  preview: AssignPreview;
  applied?: AssignApplied;
}

/**
 * Deshacer. Lo hecho nunca se borra: un atleta que ya entrenó algo del programa
 * nuevo NO se deshace (status 'failed' con el motivo) y se queda como está.
 */
export interface AssignUndoResult {
  batch_id: string;
  already_undone: boolean;
  undone: number;
  failed: number;
  results: Array<{
    athlete_id: string;
    /** undone = vuelve a como estaba · failed = no se pudo (motivo) · nothing = no se le había aplicado. */
    status: 'undone' | 'failed' | 'nothing';
    reason: string | null;
  }>;
}

export type { OnConflict, WeekDelivery };
