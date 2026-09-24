// El orden de escritura de un reflow de la cadena personal, sin base de datos.
// La 0166 mira cada escritura y la fase 2 son commits sueltos: si un recibo
// nuevo cae un solo instante sobre uno viejo todavía sin retirar, choca. Aquí
// se simula ese calendario escritura a escritura y se exige que NINGUNA caiga
// sobre un día ocupado — en los casos reales (subir/bajar, alargar, acortar,
// borrar) y en cientos de cadenas al azar.

import { describe, expect, test } from 'vitest';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { reflowWriteOrder, type ReflowWrite } from '@/lib/dashboard/coach/personal-plan-chain-write-order';
import type { ReflowStep } from '@/lib/dashboard/coach/personal-plan-chain-reflow';

const MONDAY = parseIsoDate('2026-10-05');
const weekStart = (w: number) => isoDateString(addDays(MONDAY, w * 7));
const weekEnd = (w: number) => isoDateString(addDays(MONDAY, w * 7 + 6));

type Tramo = { name: string; start: number; weeks: number };

/** Lo mismo que calcula planPersonalReflow: la lista `desired` encadenada sin
 *  hueco desde `anchor`, comparada con dónde está hoy cada tramo. */
function repack(anchor: number, desired: Array<{ name: string; weeks: number }>, current: Tramo[]): ReflowStep[] {
  let cursor = anchor;
  return desired.map((d, i) => {
    const cur = current.find((t) => t.name === d.name) ?? null;
    const step: ReflowStep = {
      month_template_id: i + 1,
      name: d.name,
      week_count: d.weeks,
      old_start: cur ? weekStart(cur.start) : null,
      old_end: cur ? weekEnd(cur.start + cur.weeks - 1) : null,
      new_start: weekStart(cursor),
      new_end: weekEnd(cursor + d.weeks - 1),
      moved: !cur || cur.start !== cursor || cur.weeks !== d.weeks,
    };
    cursor += d.weeks;
    return step;
  });
}

type Window = [string, string];
const overlaps = (a: Window, b: Window) => a[0] <= b[1] && b[0] <= a[1];
const win = (start: number, weeks: number): Window => [weekStart(start), weekEnd(start + weeks - 1)];

/** Ejecuta las escrituras sobre un calendario de mentira (con `others`: lo que
 *  la operación no mueve, ocupado de principio a fin) y devuelve cuántos tramos
 *  llegaron a estar a la vez sin fechas, y cómo queda el calendario. */
function simulate(
  steps: ReflowStep[],
  writes: ReflowWrite[],
  others: Array<[string, Window]> = [],
): { maxUnplaced: number; occupied: Map<string, Window> } {
  const occupied = new Map<string, Window>(others.map(([name, w]) => [`other:${name}`, w]));
  for (const s of steps) {
    if (s.old_start && s.old_end) occupied.set(`old:${s.name}`, [s.old_start, s.old_end]);
  }
  const placed = new Set<string>();
  let unplaced = 0;
  let maxUnplaced = 0;
  for (const w of writes) {
    const s = w.step;
    if (w.kind === 'clear') {
      expect(occupied.has(`old:${s.name}`), `«${s.name}» se retira dos veces`).toBe(true);
      expect(placed.has(s.name), `«${s.name}» se retira después de colocarse`).toBe(false);
      occupied.delete(`old:${s.name}`);
      unplaced += 1;
    } else {
      expect(occupied.has(`old:${s.name}`), `«${s.name}» se coloca sin soltar su sitio viejo`).toBe(false);
      for (const [key, win] of occupied) {
        expect(overlaps(win, [s.new_start, s.new_end]), `«${s.name}» cae sobre ${key}`).toBe(false);
      }
      expect(placed.has(s.name), `«${s.name}» se coloca dos veces`).toBe(false);
      occupied.set(`new:${s.name}`, [s.new_start, s.new_end]);
      placed.add(s.name);
      if (s.old_start) unplaced -= 1;
    }
    maxUnplaced = Math.max(maxUnplaced, unplaced);
  }
  expect([...placed].sort()).toEqual(steps.filter((s) => s.moved).map((s) => s.name).sort());
  expect(unplaced).toBe(0);
  return { maxUnplaced, occupied };
}

const script = (writes: ReflowWrite[]) => writes.map((w) => `${w.kind} ${w.step.name}`);

describe('reflowWriteOrder — se libera antes de ocupar', () => {
  test('subir "Build" (3 sem) sobre "Base" (2 sem): los dos recibos se retiran antes de colocar ninguno', () => {
    const current = [
      { name: 'Base', start: 0, weeks: 2 },
      { name: 'Build', start: 2, weeks: 3 },
    ];
    const steps = repack(0, [{ name: 'Build', weeks: 3 }, { name: 'Base', weeks: 2 }], current);
    const writes = reflowWriteOrder(steps);
    expect(script(writes)).toEqual(['clear Build', 'clear Base', 'place Build', 'place Base']);
    expect(simulate(steps, writes).maxUnplaced).toBe(2);
  });

  test('bajar "Base" (dos tramos del mismo tamaño) es el mismo ciclo y tampoco choca', () => {
    const current = [
      { name: 'Base', start: 0, weeks: 2 },
      { name: 'Build', start: 2, weeks: 2 },
    ];
    const steps = repack(0, [{ name: 'Build', weeks: 2 }, { name: 'Base', weeks: 2 }], current);
    simulate(steps, reflowWriteOrder(steps));
  });

  test('alargar el primero empuja a los de detrás de último a primero, soltando cada uno sólo su sitio', () => {
    // "Base" pasa de 2 a 4 semanas: "Build" y "Peak" se retrasan 2.
    const current = [
      { name: 'Build', start: 2, weeks: 2 },
      { name: 'Peak', start: 4, weeks: 1 },
    ];
    const steps = repack(4, [{ name: 'Build', weeks: 2 }, { name: 'Peak', weeks: 1 }], current);
    const writes = reflowWriteOrder(steps);
    expect(script(writes)).toEqual(['clear Peak', 'place Peak', 'clear Build', 'place Build']);
    expect(simulate(steps, writes).maxUnplaced).toBe(1);
  });

  test('acortar o borrar adelanta a los de detrás de primero a último', () => {
    // "Base" pasa de 3 a 1 semana: "Build" y "Peak" se adelantan 2.
    const current = [
      { name: 'Build', start: 3, weeks: 2 },
      { name: 'Peak', start: 5, weeks: 1 },
    ];
    const steps = repack(1, [{ name: 'Build', weeks: 2 }, { name: 'Peak', weeks: 1 }], current);
    const writes = reflowWriteOrder(steps);
    expect(script(writes)).toEqual(['clear Build', 'place Build', 'clear Peak', 'place Peak']);
    expect(simulate(steps, writes).maxUnplaced).toBe(1);
  });

  test('lo que no se mueve no se escribe', () => {
    const current = [
      { name: 'Base', start: 0, weeks: 2 },
      { name: 'Build', start: 2, weeks: 2 },
    ];
    const steps = repack(0, [{ name: 'Base', weeks: 2 }, { name: 'Build', weeks: 2 }], current);
    expect(reflowWriteOrder(steps)).toEqual([]);
  });

  test('un tramo nuevo sólo se coloca, después de retirar lo que ocupaba su sitio', () => {
    const current = [{ name: 'Build', start: 0, weeks: 2 }];
    const steps = repack(0, [{ name: 'Nuevo', weeks: 1 }, { name: 'Build', weeks: 2 }], current);
    const writes = reflowWriteOrder(steps);
    expect(script(writes)).toEqual(['clear Build', 'place Nuevo', 'place Build']);
    simulate(steps, writes);
  });

  test('cientos de cadenas al azar: reordenar, alargar, acortar o borrar nunca cae sobre un día ocupado', () => {
    let seed = 20260924;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let run = 0; run < 500; run++) {
      const count = 1 + rand(5);
      const chain: Tramo[] = [];
      let at = rand(3);
      for (let i = 0; i < count; i++) {
        const weeks = 1 + rand(4);
        chain.push({ name: `T${i}`, start: at, weeks });
        at += weeks;
      }
      const op = count > 1 ? rand(3) : 1 + rand(2);
      const i = rand(op === 0 ? count - 1 : count);
      const before = chain.slice(0, i).map((t): [string, Window] => [t.name, win(t.start, t.weeks)]);
      const behind = chain.slice(i + 1);

      if (op === 0) {
        // intercambio con el vecino: el resto de la cadena ni se mueve
        const desired = chain.map((t) => ({ name: t.name, weeks: t.weeks }));
        [desired[i], desired[i + 1]] = [desired[i + 1]!, desired[i]!];
        const steps = repack(chain[0]!.start, desired, chain);
        simulate(steps, reflowWriteOrder(steps));
      } else if (op === 1) {
        // el tramo i cambia de tamaño EN SITIO (resizeInPlaceAndReflow): si
        // encoge, encoge ANTES del reflow; si crece, crece DESPUÉS, sobre el
        // sitio que lo de detrás acaba de dejar libre.
        const t = chain[i]!;
        const newWeeks = 1 + rand(6);
        const grows = newWeeks > t.weeks;
        const steps = repack(t.start + newWeeks, behind, behind);
        const { occupied } = simulate(steps, reflowWriteOrder(steps), [
          ...before,
          [t.name, win(t.start, grows ? t.weeks : newWeeks)],
        ]);
        if (grows) {
          for (const [key, w] of occupied) {
            if (key === `other:${t.name}`) continue;
            expect(overlaps(w, win(t.start, newWeeks)), `«${t.name}» crece sobre ${key}`).toBe(false);
          }
        }
      } else {
        // se borra el tramo i (su recibo ya no está): lo de detrás cierra el hueco
        const steps = repack(chain[i]!.start, behind, behind);
        simulate(steps, reflowWriteOrder(steps), before);
      }
    }
  });
});
