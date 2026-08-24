import { z } from 'zod';
import {
  COACH_STATION_DAMPER_MAX,
  COACH_STATION_DAMPER_MIN,
  COACH_STATION_LOAD_CELL_COUNT,
  COACH_STATION_LOAD_KG_MAX,
  type CoachStationLoadCell,
} from '../domain/coach/station-loads';
import { hyroxStationLoadAxis, type HyroxStationSlug } from '../domain/hyrox/stations';
import { raceDivision, raceGender } from './races';

// Contrato de cable de la tabla de cargas de competición del coach.
//   GET /api/coach/station-loads  → CoachStationLoadsResponse
//   PUT /api/coach/station-loads  ← coachStationLoadsPutSchema
// snake_case. Guardar reemplaza el conjunto entero: las celdas omitidas o
// vacías son «no lo sé» y no se persisten.

const kgSchema = z
  .number()
  .positive()
  .max(COACH_STATION_LOAD_KG_MAX)
  .nullable()
  .optional();

const damperSchema = z
  .number()
  .int()
  .min(COACH_STATION_DAMPER_MIN)
  .max(COACH_STATION_DAMPER_MAX)
  .nullable()
  .optional();

export const coachStationLoadPutCellSchema = z
  .object({
    station_slug: z.string().min(1),
    division: raceDivision,
    gender: raceGender,
    kg: kgSchema,
    damper: damperSchema,
  })
  .strict()
  .superRefine((cell, ctx) => {
    const axis = hyroxStationLoadAxis(cell.station_slug as HyroxStationSlug);
    if (!axis) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['station_slug'],
        message: 'Esta estación no tiene eje de carga.',
      });
      return;
    }
    if (axis === 'damper') {
      if (cell.kg != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['kg'],
          message: 'Esta estación puede el damper, no los kilos.',
        });
      }
    } else if (cell.damper != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['damper'],
        message: 'Esta estación puede los kilos, no el damper.',
      });
    }
  });

export const coachStationLoadsPutSchema = z
  .object({
    cells: z.array(coachStationLoadPutCellSchema).max(COACH_STATION_LOAD_CELL_COUNT),
  })
  .strict()
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    for (const [i, cell] of body.cells.entries()) {
      const key = `${cell.station_slug}|${cell.division}|${cell.gender}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cells', i],
          message: 'Celda duplicada.',
        });
      }
      seen.add(key);
    }
  });

export type CoachStationLoadsPutInput = z.infer<typeof coachStationLoadsPutSchema>;

export interface CoachStationLoadsResponse {
  cells: CoachStationLoadCell[];
  filled_count: number;
  cell_count: number;
  updated_at: string | null;
}
