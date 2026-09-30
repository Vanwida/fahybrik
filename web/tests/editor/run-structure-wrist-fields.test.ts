// Editor de tramos de correr · entorno, aviso y frase para el reloj.
//
// Tres capas, todas sin base de datos ni DOM:
//   1. las operaciones puras del árbol dejan SIEMPRE un tramo que el mismo Zod del
//      servidor acepta (pista quita la inclinación, un RPE suelta el aviso…),
//   2. la frase del tramo y el texto del aviso dicen lo mismo que el modelo,
//   3. el render de la fila abierta enseña cada campo cuando toca y solo entonces.
// El guardado real (ruta PATCH → base) está en tests/editor/run-structure-wrist-save.db.test.ts.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import {
  safeParseRunStructure,
  type RunStructure,
  type Segment,
} from '@fahybrid/shared/domain/prescription';
import { RUN_CUE_MAX_LENGTH } from '@fahybrid/shared/domain/prescription/run-structure';
import {
  alertApplies,
  mapSegmentAt,
  removeSegmentField,
  toKind,
  withEnvironment,
  withTarget,
} from '@/components/v2/editor/archetype-forms/run-structure/tree-ops';
import { SegmentRow, type RowHandlers } from '@/components/v2/editor/archetype-forms/run-structure/SegmentRow';
import {
  alertHintText,
  alertNeedsMethod,
  runStructureIssues,
  segmentSentence,
} from '@/lib/dashboard/v2/run-structure-view';

const work = (extra: Partial<Segment> = {}): Segment => ({
  kind: 'work',
  measure: { type: 'duration', s: 60 },
  target: { type: 'pace_zone', zone: 4 },
  ...extra,
});
const asMain = (seg: Segment): RunStructure => [{ role: 'main', elements: [seg] }];
const valid = (seg: Segment) => safeParseRunStructure(asMain(seg)).success;

describe('operaciones del árbol · siempre un tramo válido', () => {
  test('elegir pista quita la inclinación (la pista es plana); cinta la conserva', () => {
    const cuesta = work({ incline_pct: 6 });
    expect(valid({ ...cuesta, environment: 'pista' })).toBe(false); // lo que rechaza el servidor
    const pista = withEnvironment(cuesta, 'pista');
    expect(pista.environment).toBe('pista');
    expect('incline_pct' in pista).toBe(false);
    expect(valid(pista)).toBe(true);

    const cinta = withEnvironment(cuesta, 'cinta');
    expect(cinta).toMatchObject({ environment: 'cinta', incline_pct: 6 });
    expect(valid(cinta)).toBe(true);
  });

  test('quitar el entorno lo omite (no queda `undefined`)', () => {
    const out = withEnvironment(work({ environment: 'cinta', incline_pct: 1 }), null);
    expect('environment' in out).toBe(false);
    expect(out.incline_pct).toBe(1);
  });

  test('un objetivo que no se puede medir (RPE o libre) suelta el aviso; ritmo y zona lo mantienen', () => {
    const conAviso = work({ alert: 'ambos' });
    expect(valid(withTarget(conAviso, { type: 'rpe', value: 8 }))).toBe(true);
    expect('alert' in withTarget(conAviso, { type: 'rpe', value: 8 })).toBe(false);
    expect('alert' in withTarget(conAviso, null)).toBe(false);
    expect(withTarget(conAviso, { type: 'pace', value_s: 270 }).alert).toBe('ambos');
    expect(withTarget(conAviso, { type: 'hr_zone', zone: 2 }).alert).toBe('ambos');
  });

  test('alertApplies: solo con ritmo, zona de ritmo o zona de pulso', () => {
    expect(alertApplies({ type: 'pace', value_s: 270 })).toBe(true);
    expect(alertApplies({ type: 'pace_zone', zone: 3 })).toBe(true);
    expect(alertApplies({ type: 'hr_zone', zone: 2 })).toBe(true);
    expect(alertApplies({ type: 'rpe', value: 7 })).toBe(false);
    expect(alertApplies(null)).toBe(false);
  });

  test('pasar un tramo a recuperación conserva entorno, frase y aviso', () => {
    const rec = toKind(work({ environment: 'cinta', cue: 'suelta los brazos', alert: 'arriba' }), 'recovery');
    expect(rec).toMatchObject({ kind: 'recovery', environment: 'cinta', cue: 'suelta los brazos', alert: 'arriba' });
    expect(valid(rec)).toBe(true);
  });

  test('quitar frase, aviso y entorno los omite del tramo dentro de un árbol', () => {
    const elements = asMain(work({ environment: 'calle', cue: 'mirar el pulso', alert: 'abajo' }))[0]!.elements;
    let out = removeSegmentField(elements, [0], 'cue');
    out = removeSegmentField(out, [0], 'alert');
    out = removeSegmentField(out, [0], 'environment');
    expect(out[0]).toEqual(work());
  });

  test('mapSegmentAt no toca un Repetir', () => {
    const rep = { times: 3, elements: [work()] };
    expect(mapSegmentAt([rep], [0], (s) => ({ ...s, cue: 'x' }))[0]).toBe(rep);
  });
});

describe('la frase del tramo y el texto del aviso', () => {
  test('cinta al 1 %, aviso y frase salen en la frase del tramo (mismo orden en trabajo y recuperación)', () => {
    const w = work({ environment: 'cinta', incline_pct: 1, alert: 'ambos', cue: 'mirar el pulso' });
    expect(segmentSentence(w)).toBe("1' · ritmo Z4 · cinta · 1% · aviso en ambos sentidos · «mirar el pulso»");
    const r = segmentSentence({
      kind: 'recovery',
      measure: { type: 'duration', s: 60 },
      target: null,
      recovery_mode: 'trote',
      environment: 'pista',
      alert: undefined,
    });
    expect(r).toBe("rec 1' · trote · pista");
  });

  test('sin campos nuevos, la frase es la de siempre', () => {
    expect(segmentSentence(work())).toBe("1' · ritmo Z4");
  });

  test('sin elegir, el aviso dice lo que pasa: ritmo = los dos lados; zona = el método del coach', () => {
    const pace = { type: 'pace' as const, value_s: 270 };
    const zone = { type: 'pace_zone' as const, zone: 2 };
    expect(alertHintText(undefined, pace, null)).toContain('por arriba y por abajo');
    expect(alertHintText(undefined, zone, 'arriba')).toContain('solo por arriba');
    expect(alertHintText(undefined, zone, 'ambos')).toContain('por arriba y por abajo');
    expect(alertHintText(undefined, zone, 'ninguno')).toContain('no avisa');
    expect(alertHintText(undefined, zone, 'arriba')).toContain('Ajustes › Método');
    // Sin leer todavía el método: no se inventa la cifra.
    expect(alertHintText(undefined, zone, null)).toBe('Si no eliges, manda tu método (Ajustes › Método).');
  });

  test('con un aviso elegido, dice qué hace; sin nada que medir no dice nada', () => {
    const zone = { type: 'hr_zone' as const, zone: 2 };
    expect(alertHintText('ninguno', zone, 'arriba')).toBe('Este tramo no vibra.');
    expect(alertHintText('arriba', zone, null)).toContain('más rápido o con más pulso');
    expect(alertHintText(undefined, { type: 'rpe', value: 8 }, 'arriba')).toBeNull();
    expect(alertHintText(undefined, null, 'arriba')).toBeNull();
  });

  test('solo una zona depende del método del coach', () => {
    expect(alertNeedsMethod({ type: 'pace_zone', zone: 3 })).toBe(true);
    expect(alertNeedsMethod({ type: 'hr_zone', zone: 2 })).toBe(true);
    expect(alertNeedsMethod({ type: 'pace', value_s: 300 })).toBe(false);
    expect(alertNeedsMethod(null)).toBe(false);
  });
});

describe('validación con el mismo Zod del servidor, en castellano', () => {
  test('una secuencia válida no avisa de nada', () => {
    expect(runStructureIssues(asMain(work({ environment: 'cinta', incline_pct: 1, cue: 'mirar el pulso', alert: 'abajo' })))).toEqual([]);
  });

  test('pista con inclinación, aviso sin objetivo y frase demasiado larga salen con su mensaje', () => {
    expect(runStructureIssues(asMain(work({ environment: 'pista', incline_pct: 2 })))).toEqual([
      'La pista no tiene inclinación: usa cinta o calle para una cuesta.',
    ]);
    expect(runStructureIssues(asMain(work({ target: { type: 'rpe', value: 8 }, alert: 'arriba' })))).toEqual([
      'Un aviso necesita un objetivo de ritmo, zona o pulso que medir.',
    ]);
    expect(runStructureIssues(asMain(work({ cue: 'x'.repeat(RUN_CUE_MAX_LENGTH + 1) })))).toEqual([
      `La frase del reloj admite hasta ${RUN_CUE_MAX_LENGTH} caracteres.`,
    ]);
    expect(runStructureIssues(asMain(work({ cue: 'dos\nlíneas' })))).toEqual(['La frase del reloj va en una sola línea.']);
  });

  test('el tope de la frase es exactamente el del modelo: 80 pasa, 81 no', () => {
    expect(valid(work({ cue: 'x'.repeat(RUN_CUE_MAX_LENGTH) }))).toBe(true);
    expect(valid(work({ cue: 'x'.repeat(RUN_CUE_MAX_LENGTH + 1) }))).toBe(false);
  });
});

// ── Render de la fila abierta ─────────────────────────────────────────────────

const noop = () => {};
const handlers: RowHandlers = {
  toKind: noop,
  setMeasure: noop,
  setTarget: noop,
  patchSegment: noop,
  removeField: noop,
  setEnvironment: noop,
  setCue: noop,
  setAlert: noop,
  setRecoveryMode: noop,
  remove: noop,
  move: noop,
  wrap: noop,
};
const renderRow = (segment: Segment) =>
  renderToStaticMarkup(
    createElement(SegmentRow, { segment, path: [0], handlers, open: true, onOpen: noop, onClose: noop }),
  );

describe('fila abierta del tramo', () => {
  test('sin nada elegido: chips «Dónde se corre» y «Frase para el reloj»; el aviso ya dice su defecto', () => {
    const html = renderRow(work());
    expect(html).toContain('Dónde se corre');
    expect(html).toContain('Frase para el reloj');
    expect(html).toContain('Aviso en el reloj');
    expect(html).toContain('Si no eliges');
    expect(html).not.toContain('Inclinación de la cinta');
  });

  test('cinta enseña su inclinación; pista la oculta y lo dice', () => {
    const cinta = renderRow(work({ environment: 'cinta', incline_pct: 1 }));
    expect(cinta).toContain('Inclinación de la cinta (%)');
    expect(cinta).toContain('aria-label="Dónde se corre este tramo"');
    const pista = renderRow(work({ environment: 'pista' }));
    expect(pista).not.toContain('Inclinación');
    expect(pista).toContain('Plana, sin inclinación.');
    // La cuesta de siempre (calle o sin decir) sigue con su chip.
    expect(renderRow(work({ environment: 'calle' }))).toContain('Inclinación');
  });

  test('el aviso solo aparece con algo que medir', () => {
    expect(renderRow(work({ target: { type: 'rpe', value: 8 } }))).not.toContain('Aviso en el reloj');
    expect(renderRow(work({ target: null }))).not.toContain('Aviso en el reloj');
    expect(renderRow(work({ target: { type: 'pace', value_s: 270 } }))).toContain('Aviso en el reloj');
    expect(renderRow(work({ target: { type: 'hr_zone', zone: 2 } }))).toContain('Aviso en el reloj');
  });

  test('la frase enseña su contador y el campo tiene su etiqueta y tope', () => {
    const html = renderRow(work({ cue: 'mirar el pulso' }));
    expect(html).toContain(`14/${RUN_CUE_MAX_LENGTH}`);
    expect(html).toContain(`maxLength="${RUN_CUE_MAX_LENGTH}"`);
    expect(html).toMatch(/<label[^>]*for="[^"]+"[^>]*>Frase para el reloj<\/label>/);
    expect(html).toContain('aria-label="Quitar la frase"');
  });

  test('una recuperación también lleva entorno y frase', () => {
    const html = renderRow({
      kind: 'recovery',
      measure: { type: 'duration', s: 90 },
      target: null,
      recovery_mode: 'trote',
      environment: 'cinta',
    });
    expect(html).toContain('Dónde se corre');
    expect(html).toContain('Inclinación de la cinta (%)');
    expect(html).not.toContain('Aviso en el reloj'); // una recuperación libre no tiene qué medir
  });
});
