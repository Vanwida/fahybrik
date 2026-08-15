// La insignia — lo que se fija aquí es lo que una constante de clases no podía
// dar: que el color entre por UNA fuente (el semáforo o el dato, nunca las dos),
// y que el peldaño de tipo sobreviva al merge de clases. Mismo aparato que
// `run-structure-render.test.ts` (`renderToString` en node, sin DOM).

import { describe, expect, test } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { Badge } from '@/components/ui/badge';
import { MODALITY_META } from '@/components/v2/constants';
import { EXERCISE_ORIGIN_META } from '@/lib/dashboard/exercises/catalog-ui';

const render = (props: Parameters<typeof Badge>[0]) => renderToString(createElement(Badge, props));

describe('Badge · el tono semántico', () => {
  test('sin tono es neutral — una insignia siempre tiene color, nunca hereda', () => {
    const html = render({ children: 'base' });
    expect(html).toContain('[--badge-bg:var(--v2-surface-2)]');
    expect(html).toContain('[--badge-fg:var(--v2-muted)]');
  });

  test('cada tono declara sus dos tokens, y ninguno lleva color literal', () => {
    for (const tone of ['neutral', 'ok', 'warn', 'danger', 'info'] as const) {
      const html = render({ tone, children: tone });
      expect(html).toContain('--badge-bg:');
      expect(html).toContain('--badge-fg:');
      // Un hex dentro de un componente es una segunda fuente de verdad (§9.1).
      expect(html).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  test('el naranja de marca NO es un tono: falla AA como texto en el tema claro', () => {
    const html = render({ tone: 'neutral', children: 'x' });
    expect(html).not.toContain('--v2-accent');
  });
});

describe('Badge · el tinte que manda el dato', () => {
  test('la modalidad tiñe por par de tokens, no por un tono cableado', () => {
    const meta = MODALITY_META.ergo;
    const html = render({ tint: { fg: meta.colorVar, bg: meta.softVar }, children: 'Ergo' });
    expect(html).toContain('--badge-fg:var(--v2-mod-ergo)');
    expect(html).toContain('--badge-bg:var(--v2-mod-ergo-soft)');
  });

  test('el tinte NO tiene por qué ser un par del mismo tono — `Mío` es naranja con tinta', () => {
    const own = EXERCISE_ORIGIN_META.own;
    const html = render({ tint: { fg: own.fgVar, bg: own.bgVar }, children: own.label });
    expect(html).toContain('--badge-fg:var(--v2-fg)');
    expect(html).toContain('--badge-bg:var(--v2-accent-soft)');
  });

  test('con tinte no se cuela además el tono por defecto: una sola fuente de color', () => {
    const meta = MODALITY_META.carrera;
    const html = render({ tint: { fg: meta.colorVar, bg: meta.softVar }, children: 'x' });
    expect(html).not.toContain('--v2-surface-2');
    expect(html).not.toContain('--v2-muted');
  });
});

describe('Badge · forma', () => {
  test('el peldaño de tipo sobrevive al merge — sin esto text-label se borra en silencio', () => {
    expect(render({ children: 'x' })).toContain('text-label');
    expect(render({ size: 'eyebrow', children: 'x' })).toContain('text-eyebrow');
  });

  test('`eyebrow` es la CATEGORÍA: mayúsculas y tracking, como define el peldaño', () => {
    const html = render({ size: 'eyebrow', children: 'Base' });
    expect(html).toContain('uppercase');
    expect(html).not.toContain('text-label');
  });

  test('`outline` se queda sin relleno y pinta el borde con el mismo color del texto', () => {
    const html = render({ tone: 'info', variant: 'outline', children: 'x' });
    expect(html).toContain('border-[color:var(--badge-fg)]');
    expect(html).toContain('bg-transparent');
    expect(html).not.toContain('bg-[color:var(--badge-bg)]');
  });

  test('una insignia es una línea y no se deja encoger', () => {
    const html = render({ children: 'x' });
    expect(html).toContain('whitespace-nowrap');
    expect(html).toContain('shrink-0');
  });

  test('la pantalla puede pisar la forma sin pelearse con el merge', () => {
    expect(render({ children: 'x', className: 'text-eyebrow' })).not.toContain('text-label');
  });

  test('no es un control: sin rol, sin foco, sin `v2-focus`', () => {
    const html = render({ children: 'x' });
    expect(html).not.toContain('tabindex');
    expect(html).not.toContain('v2-focus');
    expect(html).toContain('data-slot="badge"');
  });
});
