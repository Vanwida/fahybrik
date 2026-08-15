// La fila de lista — se fija aquí lo que la mudanza desde
// `v2/periodizacion/ReorderRow` podía romper en silencio: los píxeles de la
// fila (que ahora salen de `Card variant="row"` en vez de escribirse a mano),
// el estado que pinta el borde, y sobre todo la ARITMÉTICA de la reordenación,
// que antes vivía dentro de un `onDrop` y no se podía probar sin DOM.
//
// Mismo aparato que `badge.test.ts`: `renderToString` en node, sin DOM. Los
// pasos de reordenación son una función pura, así que se llaman a pelo.

import { describe, expect, test } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import {
  ListRow,
  ListRowAction,
  ListRowGroup,
  canMove,
  parseDragIndex,
  reorderSteps,
} from '@/components/ui/list-row';

const row = ({
  children = 'fila',
  ...props
}: Partial<Parameters<typeof ListRow>[0]> = {}) => {
  // Las props se arman aparte a propósito: `children` dentro de un objeto
  // literal en la llamada a `createElement` dispara `react/no-children-prop`.
  const p = { index: 1, total: 4, onMove: () => {}, children, ...props };
  return renderToString(createElement(ListRow, p));
};

/**
 * Las clases de la FILA misma. Hace falta porque dentro viven las flechas, que
 * llevan su propio `hover:border-…`: buscar en el HTML entero daría por bueno
 * un borde que en realidad pinta otro elemento.
 */
const rowClass = (props: Partial<Parameters<typeof ListRow>[0]> = {}) =>
  /^<li[^>]*\sclass="([^"]*)"/.exec(row(props))?.[1] ?? '';

const action = (props: Partial<Parameters<typeof ListRowAction>[0]> = {}) =>
  renderToString(
    createElement(ListRowAction, { icon: 'edit', label: 'Editar', onClick: () => {}, ...props }),
  );

describe('ListRow · la forma, que no puede moverse un píxel', () => {
  test('la superficie sale de la tarjeta, no de valores a mano', () => {
    const html = row();
    // 12 px de radio y el fondo del panel: exactamente lo que pintaba
    // `rounded-[var(--v2-r-m)] bg-[color:var(--v2-surface)]`.
    expect(html).toContain('rounded-card-inset');
    expect(html).toContain('bg-card');
    expect(html).toContain('border-border');
    // Una fila NO se eleva: apilar sombras ensucia.
    expect(html).not.toContain('shadow-card');
  });

  test('el relleno y el ritmo de la fila se conservan', () => {
    const html = row();
    expect(html).toContain('px-3.5');
    expect(html).toContain('py-3');
    expect(html).toContain('gap-3.5');
  });

  test('la acción es un cuadrado de 28 px — el tamaño que ya tenía', () => {
    expect(action()).toContain('h-7 w-7');
  });

  test('el raíl de color sólo aparece cuando lo piden, y desplaza el contenido', () => {
    expect(row()).not.toContain('pl-[18px]');
    const html = row({ leadingRail: 'var(--v2-accent)' });
    expect(html).toContain('pl-[18px]');
    expect(html).toContain('var(--v2-accent)');
  });
});

describe('ListRow · el estado lo dice el borde, y sólo uno a la vez', () => {
  test('normal: borde base, y reacciona al ratón y al foco', () => {
    const cls = rowClass();
    expect(cls).toContain('border-border');
    expect(cls).toContain('hover:border-[color:var(--v2-border-strong)]');
    // El foco vive en los controles de dentro, así que la fila lo refleja con
    // focus-within: sin esto, tabular por la lista no se ve.
    expect(cls).toContain('focus-within:border-[color:var(--v2-border-strong)]');
  });

  test('seleccionada: borde de marca, y el hover se retira para no pisarlo', () => {
    const cls = rowClass({ selected: true });
    expect(cls).toContain('border-primary');
    expect(row({ selected: true })).toContain('data-selected="true"');
    expect(cls).not.toContain('hover:border-');
    // El merge tiene que haber quitado el borde base, no dejar los dos: si
    // sobreviven, quien gana lo decide el orden del CSS, no este componente.
    expect(cls).not.toContain('border-border');
  });

  test('peligro: pisa a la selección — una fila que va a desaparecer manda más', () => {
    const cls = rowClass({ danger: true, selected: true });
    expect(cls).toContain('border-destructive');
    expect(cls).not.toContain('border-primary');
    expect(cls).not.toContain('border-border');
  });

  test('apagada: sin arrastre y atenuada', () => {
    const html = row({ disabled: true });
    expect(html).toContain('data-disabled="true"');
    expect(html).toContain('opacity-50');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('cursor-not-allowed');
  });

  test('apagar NO se dice con aria-disabled: `listitem` no lo admite', () => {
    // Lo dicen los controles (flechas `disabled`, acciones `inert`). Ponerlo en
    // el `<li>` es ARIA inválido y el linter de a11y lo canta.
    expect(row({ disabled: true })).not.toContain('aria-disabled');
  });

  test('apagada, las acciones quedan inertes — no se puede desactivar un ReactNode ajeno', () => {
    const html = row({ disabled: true, actions: createElement('button', null, 'x') });
    expect(html).toContain('inert');
  });

  test('la fila normal SÍ se puede arrastrar', () => {
    expect(row()).toContain('draggable="true"');
  });
});

describe('ListRow · lo que exige la accesibilidad', () => {
  test('la fila es un <li> y su grupo un <ul> — un <li> suelto no es HTML válido', () => {
    expect(row()).toMatch(/^<li/);
    const list = renderToString(createElement(ListRowGroup, null, 'x'));
    expect(list).toMatch(/^<ul/);
  });

  test('las flechas se anuncian, aunque sólo lleven icono', () => {
    const html = row();
    expect(html).toContain('aria-label="Subir"');
    expect(html).toContain('aria-label="Bajar"');
  });

  test('una acción sólo-icono SIEMPRE lleva etiqueta: sin ella es un botón mudo', () => {
    const html = action({ label: 'Eliminar nivel' });
    expect(html).toContain('aria-label="Eliminar nivel"');
    expect(html).toContain('title="Eliminar nivel"');
  });

  test('todo control lleva el foco visible de la casa', () => {
    expect(row()).toContain('v2-focus');
    expect(action()).toContain('v2-focus');
  });

  test('la acción de borrar se tiñe de peligro sólo al pasar por encima', () => {
    const html = action({ danger: true });
    expect(html).toContain('hover:border-destructive');
    expect(html).toContain('hover:text-destructive');
  });

  test('la acción apagada no se puede pulsar', () => {
    expect(action({ disabled: true })).toContain('disabled=""');
    expect(action()).not.toContain('disabled=""');
  });

  test('la acción NO es un botón del sistema: no arrastra sus variantes', () => {
    const html = action();
    expect(html).not.toContain('data-slot="button"');
    expect(html).toContain('h-7 w-7');
  });
});

describe('ListRow · las flechas se apagan en los extremos', () => {
  test('la primera fila no puede subir; la última no puede bajar', () => {
    expect(canMove(0, -1, 4)).toBe(false);
    expect(canMove(0, 1, 4)).toBe(true);
    expect(canMove(3, 1, 4)).toBe(false);
    expect(canMove(3, -1, 4)).toBe(true);
  });

  test('con una sola fila no se puede mover a ningún lado', () => {
    expect(canMove(0, -1, 1)).toBe(false);
    expect(canMove(0, 1, 1)).toBe(false);
  });

  test('la fila de en medio se mueve en las dos direcciones', () => {
    expect(canMove(1, -1, 4)).toBe(true);
    expect(canMove(1, 1, 4)).toBe(true);
  });

  test('y eso llega al HTML: la primera fila pinta una flecha desactivada', () => {
    // Dos flechas, una apagada. En medio no hay ninguna apagada.
    expect(row({ index: 0, total: 4 }).match(/disabled=""/g)).toHaveLength(1);
    expect(row({ index: 3, total: 4 }).match(/disabled=""/g)).toHaveLength(1);
    expect(row({ index: 1, total: 4 }).match(/disabled=""/g)).toBeNull();
    // Una fila apagada apaga LAS DOS.
    expect(row({ index: 1, total: 4, disabled: true }).match(/disabled=""/g)).toHaveLength(2);
  });
});

describe('reorderSteps · la aritmética de la reordenación', () => {
  test('a la fila de al lado = UN solo paso, en la dirección correcta', () => {
    expect(reorderSteps('0', 1, 4)).toEqual([[0, 1]]);
    expect(reorderSteps('2', 1, 4)).toEqual([[2, -1]]);
  });

  test('sobre sí misma = ningún paso', () => {
    expect(reorderSteps('2', 2, 4)).toEqual([]);
    expect(reorderSteps(0, 0, 4)).toEqual([]);
  });

  test('carga corrupta = ningún paso — el dataTransfer es un canal abierto', () => {
    for (const bad of ['', '   ', 'abc', '1.9', '3px', '12 atletas', 'NaN', '1e2', '+1']) {
      expect(reorderSteps(bad, 1, 4), `payload ${JSON.stringify(bad)}`).toEqual([]);
    }
    for (const bad of [null, undefined, Number.NaN, 1.5, Infinity, {}, []]) {
      expect(reorderSteps(bad, 1, 4), `payload ${String(bad)}`).toEqual([]);
    }
  });

  test('fuera de la lista = ningún paso, venga del origen o del destino', () => {
    expect(reorderSteps('99', 1, 4)).toEqual([]);
    expect(reorderSteps('-1', 1, 4)).toEqual([]);
    expect(reorderSteps('4', 1, 4)).toEqual([]);
    expect(reorderSteps('1', 4, 4)).toEqual([]);
    expect(reorderSteps('1', -1, 4)).toEqual([]);
  });

  test('un salto largo se descompone en pasos adyacentes, uno por posición', () => {
    expect(reorderSteps('3', 0, 4)).toEqual([[3, -1], [2, -1], [1, -1]]);
    expect(reorderSteps('0', 3, 4)).toEqual([[0, 1], [1, 1], [2, 1]]);
  });

  test('LA INVARIANTE: aplicar los pasos deja la fila EXACTAMENTE en el destino', () => {
    // Es lo que de verdad importa y lo que un off-by-one rompería sin que
    // ninguna de las comprobaciones de arriba se enterase. Se aplica el mismo
    // intercambio de vecinas que hacen los dos consumidores.
    for (let from = 0; from < 5; from++) {
      for (let to = 0; to < 5; to++) {
        const list = ['a', 'b', 'c', 'd', 'e'];
        const moved = list[from]!;
        for (const [i, delta] of reorderSteps(String(from), to, list.length)) {
          const target = i + delta;
          [list[i], list[target]] = [list[target]!, list[i]!];
        }
        expect(list[to], `${from} → ${to}`).toBe(moved);
        expect(list.slice().sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
      }
    }
  });
});

describe('parseDragIndex · sólo un entero a solas cuenta', () => {
  test('lee el entero que escribe el propio arrastre', () => {
    expect(parseDragIndex('0')).toBe(0);
    expect(parseDragIndex('12')).toBe(12);
    expect(parseDragIndex(' 3 ')).toBe(3);
  });

  test('rechaza lo que `parseInt` habría aceptado a medias', () => {
    // Éste es el motivo de que la función exista: parseInt('12 atletas') === 12.
    expect(parseDragIndex('12 atletas')).toBeNull();
    expect(parseDragIndex('1.9')).toBeNull();
    expect(parseDragIndex('3px')).toBeNull();
    expect(parseDragIndex('')).toBeNull();
  });
});
