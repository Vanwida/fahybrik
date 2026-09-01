// De un plan resuelto a los tramos que dibuja la espina.
//
// El puente vive aquí y no dentro de cada pantalla porque es donde se decide qué
// se ENSEÑA de un tramo, y eso tiene que ser igual en el móvil del atleta y en la
// ficha del coach: si una pantalla escondiera el hito y la otra no, el coach
// estaría revisando algo que su atleta no ve.

import type { PlanPathDTO } from '@fahybrid/shared/domain/plan-path';
import type { TramoEspina } from './Espina';
import { colorDelTono } from './tokens';

export function tramosDesdePlan(camino: PlanPathDTO, paleta: readonly string[]): TramoEspina[] {
  return camino.segments.map((s) => ({
    clave: `${s.position}-${s.start_date}`,
    semanas: s.weeks_label,
    titulo: s.title,
    detalle: s.detail,
    color: colorDelTono(paleta, s.tone),
    destacado: s.milestone,
    actual: s.current_week !== null,
    semanaActual: s.current_week,
  }));
}
