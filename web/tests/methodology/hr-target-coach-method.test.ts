// Una «Z2» de FC en la prescripción (reloj, detalle de sesión) se corta donde la
// corta EL COACH (coach_hr_method), no con las fracciones por defecto: antes el
// resolvedor de etiquetas ignoraba el método y el reloj pintaba otra banda que
// el teléfono.

import { describe, expect, it } from 'vitest';
import { resolveTarget } from '@fahybrid/shared/domain/methodology/zones';
import { resolveSegmentTarget } from '@fahybrid/shared/domain/methodology/segment-resolve';
import {
  DEFAULT_COACH_HR_METHOD,
  hrZoneFractionsFrom,
} from '@fahybrid/shared/domain/coach/hr-method';

const B = { lthr_bpm: 170 };

describe('banda de FC con el método del coach', () => {
  it('sin método: los defectos (Z2 = 82–88 % de LTHR)', () => {
    expect(resolveTarget('Z2', B)?.target).toEqual({ kind: 'hr_bpm', min: 139, max: 150 });
  });

  it('con su método: donde él corta', () => {
    const mine = hrZoneFractionsFrom({ ...DEFAULT_COACH_HR_METHOD, z2_lo_frac: 0.75, z2_hi_frac: 0.85 });
    const t = resolveTarget('Z2', B, { hrZoneFractions: mine })?.target;
    expect(t).toEqual({ kind: 'hr_bpm', min: 128, max: 145 });
    expect(resolveSegmentTarget({ type: 'hr_zone', zone: 2 }, B, { hrZoneFractions: mine })?.target).toEqual(t);
  });
});
