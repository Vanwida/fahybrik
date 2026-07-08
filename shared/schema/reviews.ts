// Zod para las revisiones 1:1 recurrentes (#21). Validación server-side en cada
// mutación. La cadencia y el kind de cita viven en ../domain/coach/reviews (single
// source), aquí solo se validan los payloads de las rutas.

import { z } from 'zod';
import { REVIEW_CADENCES } from '../domain/coach/reviews';

/** Coach: fija la cadencia de revisión de un atleta (PATCH review-cadence). */
export const reviewCadenceInput = z
  .object({
    cadence: z.enum(REVIEW_CADENCES),
  })
  .strict();
export type ReviewCadenceInput = z.infer<typeof reviewCadenceInput>;

/** Atleta (Bearer): reserva su revisión en un hueco. `requested_start` es un instante
 *  ISO que el servidor RE-verifica contra los huecos ofrecidos (nunca confía en el cliente). */
export const bookReviewInput = z
  .object({
    requested_start: z.string().datetime({ offset: true }),
  })
  .strict();
export type BookReviewInput = z.infer<typeof bookReviewInput>;
