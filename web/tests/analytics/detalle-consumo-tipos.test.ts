// El panel del coach declara SOLO lo que lee de los dos detalles (`detalle.ts`).
// Esta comprobación de tipos (la hace `tsc`) falla si el motor cambia una forma
// que el panel consume: el tipo del motor tiene que seguir cabiendo en el de
// consumo, y así el panel nunca lee un campo que el servidor ya no manda.

import { describe, expect, test } from 'vitest';
import type { DetalleCumplimiento } from '@fahybrid/shared/domain/analytics/cumplimiento';
import type { DetalleSesion } from '@/lib/analytics/sesion';
import type { DetalleCumplimientoConsumo, DetalleSesionConsumo } from '@/components/v2/analiticas/detalle';

type CabeEn<Motor, Consumo> = Motor extends Consumo ? true : false;

const cumplimientoCabe: CabeEn<DetalleCumplimiento, DetalleCumplimientoConsumo> = true;
const sesionCabe: CabeEn<DetalleSesion, DetalleSesionConsumo> = true;

describe('los detalles que consume el panel del coach', () => {
  test('el detalle del motor cabe en el tipo de consumo (comprobado al compilar)', () => {
    expect([cumplimientoCabe, sesionCabe]).toEqual([true, true]);
  });
});
