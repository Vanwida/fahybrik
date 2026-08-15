// list-reorder — the consumer side of ListRow's adjacent-step contract.
// ListRow already tests reorderSteps (adjacent / same-row / corrupt payload /
// multi-step decomposition). Here we fix what those steps DO to a list when
// NivelesPanel and TestsView receive them: apply against the live array and
// commit the final order once.

import { describe, expect, test, vi } from 'vitest';
import { reorderSteps } from '@/components/ui/list-row';
import {
  applyAdjacentSwap,
  createCoalescedAdjacentMove,
  reduceAdjacentSwaps,
  type AdjacentStep,
} from '@/lib/ui/list-reorder';

const IDS: string[] = ['a', 'b', 'c', 'd', 'e'];

describe('applyAdjacentSwap', () => {
  test('adyacente hacia abajo intercambia con el vecino', () => {
    expect(applyAdjacentSwap([...IDS], 0, 1)).toEqual(['b', 'a', 'c', 'd', 'e']);
  });

  test('adyacente hacia arriba intercambia con el vecino', () => {
    expect(applyAdjacentSwap([...IDS], 2, -1)).toEqual(['a', 'c', 'b', 'd', 'e']);
  });

  test('misma lógica que un no-op de borde: fuera de lista → null', () => {
    expect(applyAdjacentSwap([...IDS], 0, -1)).toBeNull();
    expect(applyAdjacentSwap([...IDS], 4, 1)).toBeNull();
    expect(applyAdjacentSwap(['solo'], 0, 1)).toBeNull();
  });

  test('índice o delta inválidos → null (no-op)', () => {
    expect(applyAdjacentSwap([...IDS], 1.5 as -1, 1)).toBeNull();
    expect(applyAdjacentSwap([...IDS], 1, 2 as 1)).toBeNull();
    expect(applyAdjacentSwap([...IDS], -1, 1)).toBeNull();
    expect(applyAdjacentSwap([...IDS], 99, -1)).toBeNull();
  });
});

describe('reduceAdjacentSwaps · el arrastre multi-paso', () => {
  test('0→3 deja la fila en el destino y conserva el resto en orden relativo', () => {
    // ListRow descompone 0→3 en [[0,1],[1,1],[2,1]].
    const steps = reorderSteps('0', 3, 5);
    expect(steps).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    expect(reduceAdjacentSwaps([...IDS], steps)).toEqual(['b', 'c', 'd', 'a', 'e']);
  });

  test('3→0 es el espejo', () => {
    const steps = reorderSteps('3', 0, 5);
    expect(reduceAdjacentSwaps([...IDS], steps)).toEqual(['d', 'a', 'b', 'c', 'e']);
  });

  test('adyacente = un solo swap (flechas ↑/↓)', () => {
    expect(reduceAdjacentSwaps([...IDS], reorderSteps('1', 2, 5))).toEqual([
      'a',
      'c',
      'b',
      'd',
      'e',
    ]);
  });

  test('misma fila / pasos vacíos = identidad (no-op)', () => {
    expect(reduceAdjacentSwaps([...IDS], reorderSteps('2', 2, 5))).toEqual([...IDS]);
    expect(reduceAdjacentSwaps([...IDS], [])).toEqual([...IDS]);
  });

  test('carga corrupta de ListRow → sin pasos → identidad', () => {
    for (const bad of ['', 'abc', '1.9', '12 atletas', '1e2']) {
      expect(reduceAdjacentSwaps([...IDS], reorderSteps(bad, 2, 5))).toEqual([...IDS]);
    }
  });

  test('INVARIANTE: para todo from→to, la fila acaba exactamente en to', () => {
    for (let from = 0; from < IDS.length; from++) {
      for (let to = 0; to < IDS.length; to++) {
        const steps = reorderSteps(String(from), to, IDS.length);
        const next = reduceAdjacentSwaps([...IDS], steps);
        expect(next[to], `${from} → ${to}`).toBe(IDS[from]);
        expect([...next].sort()).toEqual([...IDS].sort());
      }
    }
  });

  test('el bug preexistente: N cierres sobre el array viejo solo dejan el último swap', () => {
    // Reproduce exactamente lo que hacían NivelesPanel/TestsView antes del fix:
    // cada onMove cierra sobre la misma foto y setea un array derivado de ella.
    const steps = reorderSteps('0', 3, 5) as AdjacentStep[];
    let staleResult = [...IDS];
    for (const [index, delta] of steps) {
      // Siempre desde IDS, no desde el resultado previo.
      const next = applyAdjacentSwap([...IDS], index, delta);
      if (next) staleResult = next;
    }
    // Solo sobrevive el último intercambio (2↔3), no el traslado 0→3.
    expect(staleResult).toEqual(['a', 'b', 'd', 'c', 'e']);
    expect(staleResult).not.toEqual(reduceAdjacentSwaps([...IDS], steps));
  });
});

describe('createCoalescedAdjacentMove · estado vivo + un solo commit', () => {
  test('adyacente: un setList y un commit con el orden esperado', () => {
    const lists: string[][] = [];
    const commits: { next: readonly string[]; previous: readonly string[] }[] = [];
    let flush: (() => void) | undefined;

    let current = [...IDS];
    const move = createCoalescedAdjacentMove<string>({
      getList: () => current,
      setList: (next) => {
        lists.push(next);
        current = next;
      },
      commit: (next, previous) => commits.push({ next: [...next], previous: [...previous] }),
      schedule: (fn) => {
        flush = fn;
        return () => {
          flush = undefined;
        };
      },
    });

    move(1, 1);
    expect(lists).toEqual([['a', 'c', 'b', 'd', 'e']]);
    expect(commits).toEqual([]);
    flush?.();
    expect(commits).toEqual([
      { next: ['a', 'c', 'b', 'd', 'e'], previous: [...IDS] },
    ]);
  });

  test('multi-paso (0→3): setList progresivo y UN commit con el array final', () => {
    const lists: string[][] = [];
    const commits: string[][] = [];
    let flush: (() => void) | undefined;

    let current = [...IDS];
    const move = createCoalescedAdjacentMove<string>({
      getList: () => current,
      setList: (next) => {
        lists.push([...next]);
        current = next;
      },
      commit: (next) => {
        commits.push([...next]);
      },
      schedule: (fn) => {
        flush = fn;
        return () => {
          flush = undefined;
        };
      },
    });

    const steps = reorderSteps('0', 3, 5);
    for (const [index, delta] of steps) move(index, delta);

    expect(lists).toEqual([
      ['b', 'a', 'c', 'd', 'e'],
      ['b', 'c', 'a', 'd', 'e'],
      ['b', 'c', 'd', 'a', 'e'],
    ]);
    // Aún no ha corrido el schedule: un solo commit pendiente.
    expect(commits).toEqual([]);
    flush?.();
    expect(commits).toEqual([['b', 'c', 'd', 'a', 'e']]);
  });

  test('no-op de borde no setea ni commitea', () => {
    const setList = vi.fn();
    const commit = vi.fn();
    let scheduled = 0;
    const move = createCoalescedAdjacentMove<string>({
      getList: () => [...IDS],
      setList,
      commit,
      schedule: (fn) => {
        scheduled += 1;
        fn(); // run immediately if ever scheduled
        return () => {};
      },
    });

    move(0, -1);
    move(4, 1);
    expect(setList).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(scheduled).toBe(0);
  });

  test('project (renumber sort_order) corre en cada paso — forma NivelesPanel', () => {
    type Row = { id: string; sort_order: number };
    const start: Row[] = IDS.map((id, i) => ({ id, sort_order: i }));
    let current = start;
    const committed: Row[][] = [];
    let flush: (() => void) | undefined;

    const move = createCoalescedAdjacentMove<Row>({
      getList: () => current,
      setList: (next) => {
        current = next;
      },
      commit: (next) => {
        committed.push(next.map((r) => ({ ...r })));
      },
      project: (list) => list.map((r, i) => ({ ...r, sort_order: i })),
      schedule: (fn) => {
        flush = fn;
        return () => {
          flush = undefined;
        };
      },
    });

    for (const [index, delta] of reorderSteps('0', 3, 5)) move(index, delta);
    flush?.();

    expect(committed).toHaveLength(1);
    expect(committed[0]!.map((r) => r.id)).toEqual(['b', 'c', 'd', 'a', 'e']);
    expect(committed[0]!.map((r) => r.sort_order)).toEqual([0, 1, 2, 3, 4]);
  });

  test('forma TestsView: el commit expone ordered_ids del array final, no intermedios', () => {
    const posts: string[][] = [];
    let current = [...IDS];
    let flush: (() => void) | undefined;

    const move = createCoalescedAdjacentMove<string>({
      getList: () => current,
      setList: (next) => {
        current = next;
      },
      commit: (next) => {
        // Espejo del body que manda TestsView.
        posts.push(next.map((id) => id));
      },
      schedule: (fn) => {
        flush = fn;
        return () => {
          flush = undefined;
        };
      },
    });

    for (const [index, delta] of reorderSteps('4', 1, 5)) move(index, delta);
    // Sin coalescer se habrían disparado 3 POSTs intermedios; con él, uno.
    expect(posts).toEqual([]);
    flush?.();
    expect(posts).toEqual([['a', 'e', 'b', 'c', 'd']]);
  });
});
