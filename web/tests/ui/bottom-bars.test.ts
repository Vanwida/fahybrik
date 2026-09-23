// Dos reglas de manejo en el móvil: el «volver» de la cabecera tiene 44 px de
// zona táctil, y un aviso nunca tapa una barra de acciones pegada abajo.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageHeader } from '@/components/v2/ui/Layout';
import { bottomBarLift } from '@/components/v2/ui/Toast';

describe('PageHeader · volver', () => {
  it('44 px de zona táctil en el móvil, sin mover el texto (márgenes negativos)', () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, { title: 'Ana', back: { href: '/es/atletas', label: 'Atletas' } }),
    );
    const link = /<a [^>]*href="\/es\/atletas"[^>]*>/.exec(html)?.[0] ?? '';
    expect(link).toContain('min-h-11');
    expect(link).toContain('min-w-11');
    expect(link).toContain('-my-3.5');
    // Desde sm vuelve a su tamaño.
    expect(link).toContain('sm:min-h-0');
  });
});

describe('avisos por encima de las barras de abajo', () => {
  const H = 800;
  it('sin barras no se levantan', () => {
    expect(bottomBarLift([], H)).toBe(0);
  });

  it('una barra pegada abajo los levanta su altura desde el borde', () => {
    expect(bottomBarLift([{ top: 720, bottom: 784, height: 64 }], H)).toBe(80);
  });

  it('manda la más alta de las barras a la vista', () => {
    expect(
      bottomBarLift(
        [
          { top: 720, bottom: 784, height: 64 },
          { top: 650, bottom: 740, height: 90 },
        ],
        H,
      ),
    ).toBe(150);
  });

  it('una barra fuera de pantalla, lejos del borde o sin tamaño no cuenta', () => {
    expect(bottomBarLift([{ top: 900, bottom: 960, height: 60 }], H)).toBe(0);
    expect(bottomBarLift([{ top: 100, bottom: 160, height: 60 }], H)).toBe(0);
    expect(bottomBarLift([{ top: 780, bottom: 780, height: 0 }], H)).toBe(0);
  });
});
