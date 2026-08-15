// El campo de varias líneas — lo que se fija aquí es lo que una constante de
// clases no podía dar: UNA sola grafía del contador y el cable de accesibilidad
// que lo ata al campo. Mismo aparato que `run-structure-render.test.ts`
// (`renderToString` en node, sin DOM ni dependencias nuevas).

import { describe, expect, test } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { Textarea } from '@/components/ui/textarea';

const render = (props: Parameters<typeof Textarea>[0]) =>
  renderToString(createElement(Textarea, props));

describe('Textarea · el lienzo', () => {
  test('sin contador es un textarea pelado, sin envoltorio', () => {
    const html = render({ value: 'hola', onChange: () => {} });
    expect(html).toMatch(/^<textarea/);
    expect(html).not.toContain('caracteres');
  });

  test('trae el lienzo medido: redimensionable en vertical y prosa por defecto', () => {
    const html = render({ value: '', onChange: () => {} });
    expect(html).toContain('resize-y');
    expect(html).toContain('leading-relaxed');
  });

  test('la pantalla puede pisar el lienzo — el compositor del chat no redimensiona', () => {
    const html = render({ value: '', onChange: () => {}, className: 'resize-none' });
    expect(html).toContain('resize-none');
    expect(html).not.toContain('resize-y');
  });

  test('interlineado compacto para el texto pegado, donde cada renglón es un registro', () => {
    const html = render({ value: '', onChange: () => {}, interlineado: 'compacta' });
    expect(html).toContain('leading-snug');
    expect(html).not.toContain('leading-relaxed');
  });
});

describe('Textarea · el contador', () => {
  test('una sola grafía: 4/100, sin espacios alrededor de la barra', () => {
    const html = render({ value: 'hola', maxLength: 100, onChange: () => {}, contador: true });
    expect(html).toContain('4/100');
    // Las dos grafías que convivían en el repo antes de esto.
    expect(html).not.toContain('4 / 100');
  });

  test('el lector de pantalla oye una frase, no un ratio', () => {
    const html = render({ value: 'hola', maxLength: 100, onChange: () => {}, contador: true });
    expect(html).toContain('de');
    expect(html).toContain('caracteres');
    expect(html).toContain('sr-only');
  });

  test('el contador va atado al campo por aria-describedby', () => {
    const html = render({ value: 'hola', maxLength: 100, onChange: () => {}, contador: true });
    const descrito = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(descrito).toBeTruthy();
    expect(html).toContain(`id="${descrito}"`);
  });

  test('se SUMA al aria-describedby que traiga la pantalla, no lo pisa', () => {
    const html = render({
      value: 'hola',
      maxLength: 100,
      onChange: () => {},
      contador: true,
      'aria-describedby': 'ayuda-previa',
    });
    const descrito = html.match(/aria-describedby="([^"]+)"/)?.[1] ?? '';
    expect(descrito.split(' ')).toContain('ayuda-previa');
    expect(descrito.split(' ')).toHaveLength(2);
  });

  test('al llegar al tope el contador se tiñe y lo dice en voz alta', () => {
    const html = render({ value: 'hola', maxLength: 4, onChange: () => {}, contador: true });
    expect(html).toContain('text-destructive');
    expect(html).toContain('límite alcanzado');
  });

  test('por debajo del tope no se tiñe', () => {
    const html = render({ value: 'hol', maxLength: 4, onChange: () => {}, contador: true });
    expect(html).not.toContain('text-destructive');
    expect(html).not.toContain('límite alcanzado');
  });

  test('cuenta en unidades UTF-16, que es lo que corta el navegador', () => {
    // Un emoji ocupa DOS de las 4 letras que permite `maxlength`. Si el
    // contador contase grafemas diría 1/4 y el campo cortaría en 2 — mentiría
    // sobre el sitio que queda.
    const html = render({ value: '🏃', maxLength: 4, onChange: () => {}, contador: true });
    expect(html).toContain('2/4');
  });
});

