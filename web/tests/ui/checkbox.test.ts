// La casilla — lo que se fija aquí es lo que un `<input type="checkbox">` suelto
// no podía dar: que el control tenga NOMBRE accesible (Base UI pinta el control
// en un `<span role="checkbox">` y deja el `<input>` `aria-hidden` al lado, así
// que un `<label for>` a secas lo dejaría anónimo), que la tercera cara del
// control —la indeterminada— exista, y que el color entre sólo por tokens.
// Mismo aparato que `badge.test.ts` (`renderToString` en node, sin DOM).

import { describe, expect, test } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { Checkbox } from '@/components/ui/checkbox';

const render = (props: Parameters<typeof Checkbox>[0]) =>
  renderToString(createElement(Checkbox, props));

/** El id al que apunta un atributo aria, para comprobar que existe de verdad. */
const pointsTo = (html: string, attr: string) =>
  new RegExp(`${attr}="([^"]+)"`).exec(html)?.[1] ?? null;

describe('Casilla · el nombre accesible', () => {
  test('el control es el span con role=checkbox, no el input escondido', () => {
    const html = render({ label: 'Cortesía (sin cobro)' });
    expect(html).toContain('role="checkbox"');
    // El input existe para el formulario y para el clic en el texto, pero no
    // debe anunciarlo el lector de pantalla: hay dos controles en el DOM y uno
    // solo es el de verdad.
    expect(html).toMatch(/<input[^>]*aria-hidden="true"/);
  });

  test('el nombre lo da aria-labelledby, y el id al que apunta EXISTE', () => {
    const html = render({ label: 'Cortesía (sin cobro)' });
    const target = pointsTo(html, 'aria-labelledby');
    expect(target).toBeTruthy();
    expect(html).toContain(`id="${target}"`);
    // Y ese id es el de la etiqueta visible, no el de otra cosa.
    expect(html).toMatch(new RegExp(`id="${target}"[^>]*>Cortesía \\(sin cobro\\)`));
  });

  test('sin etiqueta no hay envoltura ni aria-labelledby colgando', () => {
    const html = render({ 'aria-label': 'Seleccionar fila' } as never);
    expect(html).not.toContain('data-slot="checkbox-field"');
    expect(html).not.toContain('aria-labelledby');
  });

  test('el hint se enlaza por aria-describedby, no se cuela en el nombre', () => {
    const html = render({ label: 'Cortesía', hint: 'Acceso libre, sin Stripe.' });
    const described = pointsTo(html, 'aria-describedby');
    expect(described).toBeTruthy();
    expect(html).toContain(`id="${described}"`);
    expect(pointsTo(html, 'aria-labelledby')).not.toBe(described);
  });
});

describe('Casilla · las tres caras del control', () => {
  test('desmarcada no pinta glifo', () => {
    const html = render({ label: 'x' });
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain('<svg');
  });

  test('marcada anuncia true y pinta el tick', () => {
    const html = render({ label: 'x', checked: true });
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('d="M3.5 8.5l3 3 6-6.5"');
  });

  test('indeterminada es «mixed» y pinta la raya — no el tick', () => {
    const html = render({ label: 'x', indeterminate: true });
    expect(html).toContain('aria-checked="mixed"');
    expect(html).toContain('d="M3.5 8h9"');
    expect(html).not.toContain('d="M3.5 8.5l3 3 6-6.5"');
  });
});

describe('Casilla · el color entra por token', () => {
  test('ni un color literal dentro del componente', () => {
    for (const props of [
      { label: 'x' },
      { label: 'x', checked: true },
      { label: 'x', indeterminate: true },
      { label: 'x', disabled: true },
    ]) {
      // Un hex dentro de un componente es una segunda fuente de verdad (§9.1).
      expect(render(props)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  test('el relleno sale de --primary, que el puente reapunta a v2', () => {
    const html = render({ label: 'x', checked: true });
    expect(html).toContain('data-[checked]:bg-primary');
    // Nunca el dialecto --v2-* : fuera de .v2-root no existiría.
    expect(html).not.toContain('--v2-');
  });
});

describe('Casilla · los estados que ya usa el dashboard', () => {
  test('deshabilitada se apaga y sale del orden de tabulación', () => {
    const html = render({ label: 'Cortesía (sin cobro)', disabled: true });
    expect(html).toContain('data-disabled');
    expect(html).not.toContain('tabindex="0"');
  });

  test('con hint la caja sube a la primera línea sin pedirlo', () => {
    expect(render({ label: 'x', hint: 'y' })).toContain('mt-0.5');
    expect(render({ label: 'x' })).not.toContain('mt-0.5');
  });

  test('align=start es para la etiqueta larga SIN hint (el caso que no se deduce)', () => {
    expect(render({ label: 'x', align: 'start' })).toContain('mt-0.5');
  });

  test('el peldaño de tipo es de la escala, nunca un text-[Npx]', () => {
    expect(render({ label: 'x' })).toContain('text-sm');
    expect(render({ label: 'x', size: 'dense' })).toContain('text-xs');
    expect(render({ label: 'x', size: 'dense' })).not.toMatch(/text-\[\d/);
  });
});
