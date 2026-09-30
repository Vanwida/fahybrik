// Ajustes › Método › «Reloj…»: la pantalla pinta las cuatro secciones nuevas con
// el defecto a la vista en cada fila (número, interruptor, lista y las once
// palabras del RPE) y no revienta al renderizar. Render de servidor, sin DOM ni
// base de datos: la lógica de guardado es la de siempre (PUT de una clave).

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/v2/ui';
import { ThresholdsSettings } from '@/components/v2/ajustes/ThresholdsSettings';
import { THRESHOLD_COPY, THRESHOLD_SECTIONS } from '@/components/v2/ajustes/threshold-copy';
import { COACH_THRESHOLD_KEYS, DEFAULT_COACH_THRESHOLDS, mergeCoachThresholds } from '@fahybrid/shared/domain/coach/signal-thresholds';
import { DEFAULT_WRIST_RPE_WORDS } from '@fahybrid/shared/domain/coach/wrist-method';
import type { CoachSignalThresholdsResponse } from '@fahybrid/shared/schema/coach-signal-thresholds';

function response(over: Partial<CoachSignalThresholdsResponse> = {}, overrides = {}): CoachSignalThresholdsResponse {
  const effective = mergeCoachThresholds(overrides);
  const custom_keys = COACH_THRESHOLD_KEYS.filter((k) => k in overrides);
  return {
    ...effective,
    wrist_rpe_words: [...DEFAULT_WRIST_RPE_WORDS],
    wrist_rpe_words_custom: false,
    default_wrist_rpe_words: [...DEFAULT_WRIST_RPE_WORDS],
    is_custom: custom_keys.length > 0,
    custom_keys,
    defaults: { ...DEFAULT_COACH_THRESHOLDS },
    updated_at: null,
    ...over,
  };
}

const render = (initial: CoachSignalThresholdsResponse) =>
  renderToStaticMarkup(createElement(ToastProvider, null, createElement(ThresholdsSettings, { initial })));

describe('Ajustes › Método › Reloj', () => {
  const html = render(response());

  it('pinta las cuatro secciones «Reloj» y todas sus filas', () => {
    for (const s of THRESHOLD_SECTIONS.filter((x) => x.title.startsWith('Reloj'))) {
      expect(html, s.title).toContain(s.title);
      for (const k of s.keys) expect(html, k).toContain(THRESHOLD_COPY[k].label);
    }
  });

  it('cada fila dice su defecto: números, «No» de un interruptor y la palabra de una lista', () => {
    expect(html).toContain('Por defecto: 1000.');
    expect(html).toContain('Por defecto: 75.');
    expect(html).toContain('Por defecto: No.');
    expect(html).toContain('Por defecto: Sí.');
    expect(html).toContain('Por defecto: Solo por arriba.');
  });

  it('los interruptores son interruptores y la lista es un desplegable con su valor', () => {
    expect(html).toContain('role="switch"');
    expect(html).toContain('Solo por arriba');
  });

  it('las once palabras del RPE, una por campo, con las de fábrica', () => {
    for (let n = 0; n <= 10; n++) expect(html).toContain(`aria-label="RPE ${n}"`);
    expect(html).toContain(`Por defecto: ${DEFAULT_WRIST_RPE_WORDS.join(', ')}.`);
    expect(html).not.toContain('Usar las de fábrica');
  });

  it('un coach que ya cambió cosas ve «Usar …» en esas filas y «Restaurar valores por defecto»', () => {
    const custom = render(
      response(
        { wrist_rpe_words_custom: true, wrist_rpe_words: DEFAULT_WRIST_RPE_WORDS.map((w) => w.toUpperCase()) },
        { wrist_auto_lap_m: 500, wrist_gate_manual: 1, wrist_alert_continuous_zone: 2 },
      ),
    );
    expect(custom).toContain('Usar 1000');
    expect(custom).toContain('Usar No');
    expect(custom).toContain('Usar Solo por arriba');
    expect(custom).toContain('Usar las de fábrica');
    expect(custom).toContain('Restaurar valores por defecto');
    expect(custom).toContain('value="NADA"');
  });

  it('un coach que no ha tocado nada no ve ningún «Usar …» ni «Restaurar»', () => {
    expect(html).not.toMatch(/Usar (\d|No|Sí)/);
    expect(html).not.toContain('Restaurar valores por defecto');
  });
});
