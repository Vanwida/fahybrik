// Prueba de humo de las piezas de la carrera en el panel: que las seis lecturas
// SE PINTAN sin romperse, y que lo que no hay no se escribe.
//
// Existe porque la base no tiene todavía ni una traza (`workout_traces` está
// vacía) ni un tramo de carrera atribuido a su línea prescrita, así que la
// curva, la tabla de tramos y la de kilómetros no se pueden mirar contra
// producción. Renderizar a HTML no sustituye a verlo, pero sí caza lo que un
// test de dominio no ve: un campo nulo que revienta el pintado.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Sujeto } from '@/components/v2/carrera/Sujeto';
import { TablaKilometros, TablaTramos } from '@/components/v2/carrera/Tramos';
import type { Sujeto as SujetoLeido, TramoLeido } from '@/components/v2/carrera/lectura';

function tramo(over: Partial<TramoLeido> & { position: number }): TramoLeido {
  return {
    n: null,
    papel: 'trabajo',
    fase: 'main',
    modo: null,
    distanciaM: null,
    duracionS: null,
    ritmoSkm: null,
    fcMediaPpm: null,
    pendientePct: null,
    inicioS: null,
    veredicto: null,
    veredictoDuracion: null,
    banda: null,
    ...over,
  };
}

const SUJETOS: SujetoLeido[] = [
  {
    clase: 'veredicto',
    dentro: 5,
    evaluables: 6,
    sesgo: 'lento',
    fueraRapido: 0,
    fueraLento: 1,
    mediaTrabajoSkm: 212.8,
    peorDesvioS: 9,
    banda: { rapidoSkm: 205, lentoSkm: 215 },
  },
  { clase: 'contraste', nFuertes: 8, fuerteSkm: 238, suaveSkm: 318, contrasteSkm: 80, recuperacion: 'trote' },
  { clase: 'tiempo-en-zona', zona: 2, segundos: 2700, pct: 75 },
  { clase: 'ritmo-medio', skm: 286, veredicto: 'dentro' },
  { clase: 'tiempo-por-tramo', nTramos: 8, mediaS: 58, primeraS: 54, ultimaS: 63, pendientePct: 8 },
  { clase: 'sin-archivo', distanciaM: 15380, porque: 'Esta carrera es anterior al archivo.' },
];

describe('las seis lecturas se pintan', () => {
  it.each(SUJETOS.map((s) => [s.clase, s] as const))('%s', (_clase, sujeto) => {
    const html = renderToStaticMarkup(createElement(Sujeto, { sujeto, prescrito: '6 × 800 m a 3:30' }));
    expect(html.length).toBeGreaterThan(50);
    // Ni un guion largo ni una casilla vacía en el copy visible.
    expect(html).not.toContain('—');
    expect(html).not.toMatch(/>\s*(null|undefined|NaN)\s*</);
  });

  it('el sujeto sin banda ni desvío no escribe la línea de lo pedido', () => {
    const html = renderToStaticMarkup(
      createElement(Sujeto, {
        sujeto: {
          clase: 'veredicto',
          dentro: 3,
          evaluables: 3,
          sesgo: null,
          fueraRapido: 0,
          fueraLento: 0,
          mediaTrabajoSkm: null,
          peorDesvioS: null,
          banda: null,
        },
        prescrito: null,
      }),
    );
    expect(html).toContain('Todos dentro de lo que le pediste');
    expect(html).not.toContain('Le pediste');
    expect(html).not.toContain('Media del trabajo');
  });
});

describe('el troceado se pinta con lo que hay y calla lo que no', () => {
  it('una serie con recuperación trotando lleva su veredicto y su modo', () => {
    const html = renderToStaticMarkup(
      createElement(TablaTramos, {
        eje: 'ritmo',
        tramos: [
          tramo({ position: 0, n: 1, distanciaM: 800, duracionS: 166, ritmoSkm: 208, fcMediaPpm: 172, veredicto: 'dentro' }),
          tramo({
            position: 1,
            papel: 'recuperacion',
            duracionS: 120,
            modo: 'trote',
            ritmoSkm: 320,
            veredicto: 'controlada',
            veredictoDuracion: 'duracion_excedida',
          }),
        ],
      }),
    );
    expect(html).toContain('En banda');
    expect(html).toContain('trotando');
    expect(html).toContain('Controlada');
    // La duración solo aparece cuando falla, y la de recuperación falla por pasarse.
    expect(html).toContain('Se pasó de tiempo');
    expect(html).not.toContain('—');
  });

  it('un tramo sin pulso ni veredicto no deja hueco con unidad', () => {
    const html = renderToStaticMarkup(
      createElement(TablaTramos, { eje: 'ritmo', tramos: [tramo({ position: 0, n: 1, distanciaM: 400, ritmoSkm: 200 })] }),
    );
    expect(html).not.toContain('ppm');
    expect(html).not.toContain('—');
  });

  it('una recuperación parada no inventa un ritmo', () => {
    const html = renderToStaticMarkup(
      createElement(TablaTramos, {
        eje: 'ritmo',
        tramos: [tramo({ position: 0, papel: 'recuperacion', duracionS: 120, modo: 'parado', ritmoSkm: 900 })],
      }),
    );
    expect(html).toContain('parado');
    expect(html).not.toContain('/km');
  });

  it('en cuesta la cifra de la fila es el TIEMPO, no el ritmo', () => {
    const html = renderToStaticMarkup(
      createElement(TablaTramos, {
        eje: 'tiempo',
        tramos: [tramo({ position: 0, n: 1, distanciaM: 200, duracionS: 54, ritmoSkm: 270 })],
      }),
    );
    expect(html).toContain('0:54');
    expect(html).not.toContain('4:30');
  });

  it('un kilómetro sin ritmo dice qué pasó en vez de dejar la casilla vacía', () => {
    const html = renderToStaticMarkup(
      createElement(TablaKilometros, {
        kilometros: [
          { index: 1, partial: false, distance_m: 1000, duration_s: 290, avg_pace_s_per_km: 290, avg_hr: 141, elevation_gain_m: null },
          { index: 2, partial: false, distance_m: 1000, duration_s: null, avg_pace_s_per_km: null, avg_hr: null, elevation_gain_m: null },
        ],
      }),
    );
    expect(html).toContain('No hay ritmo medido en este kilómetro');
    expect(html).not.toContain('—');
  });
});
