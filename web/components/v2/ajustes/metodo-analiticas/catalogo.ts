// El catálogo campo a campo del método de analíticas: cómo se llama cada clave
// delante del coach, para qué sirve en una línea y en qué unidad se enseña.
// Puro, sin React ni red. Los LÍMITES no se copian aquí (`ANALYTICS_METHOD_BOUNDS`).
//
// El tipo `Record<keyof CoachAnalyticsMethod, CampoDescriptor>` obliga en
// compilación a que todas las claves del método tengan descriptor, aunque el
// catálogo viva partido en tres ficheros por tamaño.

import type { CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import type { CampoDescriptor } from './descriptores';
import { DESCRIPTORES_FORMA_Y_CARGA } from './catalogo-carga';
import { DESCRIPTORES_CUMPLIMIENTO_Y_CAMBIO } from './catalogo-cumplimiento';
import { DESCRIPTORES_RENDIMIENTO } from './catalogo-rendimiento';

export const DESCRIPTORES_METODO_ANALITICO: Record<keyof CoachAnalyticsMethod, CampoDescriptor> = {
  ...DESCRIPTORES_FORMA_Y_CARGA,
  ...DESCRIPTORES_CUMPLIMIENTO_Y_CAMBIO,
  ...DESCRIPTORES_RENDIMIENTO,
};
