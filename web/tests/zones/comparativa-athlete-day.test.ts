// El par por defecto de una comparativa de zonas cuelga del día del ATLETA: las
// semanas que se comparan son las suyas, y su «última semana cerrada» es la que él
// ha terminado (DECISIONS 2026-09-23, «Qué día es en cada sitio»). Antes salía
// del día UTC del navegador: hasta la 01:00–02:00 del lunes en España, y hasta
// las 13:00 en Nueva Zelanda, ofrecía la semana anterior.
//
// El instante: domingo 31 de marzo de 2030, 12:30 UTC = lunes 1 de abril, 01:30
// en Auckland. Para un atleta allí la semana del 25 ya está cerrada.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ZonasComparar } from '@/components/v2/atleta-detalle/rendimiento/ZonasComparar';
import { filaVacia, ventanaQueAcabaHoy } from '@/lib/dashboard/v2/del-coach-borrador';

// El enlace localizado de los avisos no se pinta aquí (y arrastra el router de Next).
vi.mock('@/i18n/navigation', () => ({ Link: () => null }));

const NOW = new Date('2030-03-31T12:30:00Z');
const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  vi.useRealTimers();
  // El huso del proceso vuelve a ser el de antes (Node lo relee al asignarlo).
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

test('«Comparar» de la ficha arranca con el trimestre del día del atleta, no con el de UTC', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const html = renderToStaticMarkup(
    createElement(ZonasComparar, { athleteId: '1', hoy: '2030-04-01', onDarFeedback: () => {} }),
  );
  // Última semana cerrada del atleta: la del 25 de marzo → el después empieza el
  // 31 de diciembre y el antes, trece semanas antes. Con el día UTC (domingo 31)
  // saldrían el 24 de diciembre y el 24 de septiembre.
  expect(html).toContain('value="2029-12-31"');
  expect(html).toContain('value="2029-10-01"');
  expect(html).not.toContain('value="2029-12-24"');
});

test('el compositor (varios atletas o la biblioteca) arranca en el calendario de quien escribe, no en UTC', () => {
  process.env.TZ = 'Pacific/Auckland';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  expect(filaVacia().comparativa).toEqual({ a_start: '2029-10-01', b_start: '2029-12-31', weeks: 13 });
  // La gráfica por defecto termina en la misma semana: las dos formas hablan del mismo «hoy».
  expect(ventanaQueAcabaHoy(1)).toEqual({ week_start: '2030-04-01', weeks: 1 });
});
