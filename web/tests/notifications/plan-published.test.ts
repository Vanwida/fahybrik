/**
 * El aviso «tienes plan nuevo a la vista»: quién lo firma, qué semana nombra y
 * con qué palabras.
 *
 * Por qué existe este test:
 *  · las siete cadenas de estos push decían «Pablo» literal, así que el atleta de
 *    cualquier otro entrenador leía el nombre de un desconocido. El nombre sale de
 *    `coaches.full_name` por atleta; sin nombre, un sujeto neutro.
 *  · (auditoría de la app del atleta, D-10) decían «para la proxima semana» también
 *    al publicar la semana en curso, «Nuevo microciclo … el siguiente bloque» y sin
 *    tildes. La app instalada abre el Plan en la semana en curso sin mirar
 *    `week_start`: la frase es el único sitio donde el atleta lee qué semana es.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { createFakeSql } from '../utils/fake-sql';
import {
  COACH_FALLBACK_NAME,
  coachDisplayNameForAthlete,
  planPublishedCopy,
  planPublishedPush,
  weekPhrase,
  type PlanPublishedVariant,
} from '@/lib/notifications/plan-published';

/** Un cliente que devuelve el nombre dado como si viniera del join a `coaches`. */
function sqlReturningName(coach_name: string | null) {
  return createFakeSql((text) => {
    expect(text).toContain('join coaches');
    return [{ coach_name }];
  });
}

// Miércoles 23 de septiembre de 2026: su semana empieza el lunes 21.
const TODAY = '2026-09-23';
const THIS_MONDAY = '2026-09-21';
const NEXT_MONDAY = '2026-09-28';
const LATER_MONDAY = '2026-10-12';
const PAST_MONDAY = '2026-09-14';

describe('la semana, contada desde el hoy del atleta', () => {
  test('la semana en curso es «esta semana», nunca «la próxima»', () => {
    expect(weekPhrase(THIS_MONDAY, TODAY)).toBe('esta semana');
  });

  test('la siguiente es «la semana que viene»; más allá, su lunes con fecha', () => {
    expect(weekPhrase(NEXT_MONDAY, TODAY)).toBe('la semana que viene');
    expect(weekPhrase(LATER_MONDAY, TODAY)).toBe('la semana del lunes 12 de octubre');
    expect(weekPhrase(PAST_MONDAY, TODAY)).toBe('la semana del lunes 14 de septiembre');
  });

  test('en el borde: el domingo, el lunes de mañana ya es «la semana que viene»; el lunes, «esta semana»', () => {
    expect(weekPhrase(NEXT_MONDAY, '2026-09-27')).toBe('la semana que viene');
    expect(weekPhrase(NEXT_MONDAY, '2026-09-28')).toBe('esta semana');
  });

  test('cualquier día de la semana se lee por su lunes (también cruzando de año)', () => {
    expect(weekPhrase('2026-09-24', TODAY)).toBe('esta semana');
    expect(weekPhrase('2027-01-04', '2026-12-30')).toBe('la semana que viene');
    expect(weekPhrase('2027-01-13', '2026-12-30')).toBe('la semana del lunes 11 de enero');
  });
});

describe('cada aviso, frase a frase', () => {
  const coach = 'Laura Vidal';

  test('asignar un programa: «Tu plan está listo» y cuándo empieza', () => {
    expect(planPublishedCopy('assigned', coach, { week_start: THIS_MONDAY, today: TODAY })).toEqual({
      title: 'Tu plan está listo',
      body: 'Laura Vidal ha publicado tu plan de entrenamiento. Empieza esta semana.',
    });
    expect(planPublishedCopy('assigned', coach, { week_start: NEXT_MONDAY, today: TODAY }).body).toBe(
      'Laura Vidal ha publicado tu plan de entrenamiento. Empieza la semana que viene.',
    );
    expect(planPublishedCopy('assigned', coach, { week_start: LATER_MONDAY, today: TODAY }).body).toBe(
      'Laura Vidal ha publicado tu plan de entrenamiento. Empieza la semana del lunes 12 de octubre.',
    );
    // Una fecha de inicio atrasada no se anuncia en futuro.
    expect(planPublishedCopy('assigned', coach, { week_start: PAST_MONDAY, today: TODAY }).body).toBe(
      'Laura Vidal ha publicado tu plan de entrenamiento. Empezó la semana del lunes 14 de septiembre.',
    );
  });

  test('publicar una semana: nombra ESA semana', () => {
    expect(planPublishedCopy('weekly', coach, { week_start: THIS_MONDAY, today: TODAY })).toEqual({
      title: 'Tu plan de la semana está listo',
      body: 'Laura Vidal ha publicado tu plan para esta semana.',
    });
    expect(planPublishedCopy('weekly', coach, { week_start: NEXT_MONDAY, today: TODAY }).body).toBe(
      'Laura Vidal ha publicado tu plan para la semana que viene.',
    );
    expect(planPublishedCopy('weekly', coach, { week_start: LATER_MONDAY, today: TODAY }).body).toBe(
      'Laura Vidal ha publicado tu plan para la semana del lunes 12 de octubre.',
    );
  });

  test('publicar varias semanas de golpe: un aviso, «a partir de» la primera', () => {
    expect(planPublishedCopy('weekly', coach, { week_start: NEXT_MONDAY, weeks: 3, today: TODAY })).toEqual({
      title: 'Tu plan está listo',
      body: 'Laura Vidal ha publicado tu plan a partir de la semana que viene.',
    });
  });

  test('avanzar al siguiente programa: «programa», no «microciclo» ni «bloque»', () => {
    expect(planPublishedCopy('next_block', coach, { week_start: NEXT_MONDAY, today: TODAY })).toEqual({
      title: 'Nuevo programa listo',
      body: 'Laura Vidal ha publicado el siguiente programa de tu plan. Empieza la semana que viene.',
    });
    expect(planPublishedCopy('next_block', coach, { week_start: THIS_MONDAY, today: TODAY }).body).toBe(
      'Laura Vidal ha publicado el siguiente programa de tu plan. Empieza esta semana.',
    );
  });

  test('ningún aviso usa las palabras retiradas, pierde las tildes ni lleva una marca', () => {
    const variants: PlanPublishedVariant[] = ['assigned', 'weekly', 'next_block'];
    const weeks = [THIS_MONDAY, NEXT_MONDAY, LATER_MONDAY, PAST_MONDAY];
    for (const v of variants) {
      for (const w of weeks) {
        for (const n of [1, 2]) {
          const { title, body } = planPublishedCopy(v, coach, { week_start: w, weeks: n, today: TODAY });
          const text = `${title} ${body}`;
          expect(text).not.toMatch(/microciclo|bloque|pr[oó]xima/i);
          expect(text).not.toMatch(/\besta listo\b|\besta lista\b/);
          expect(text).not.toMatch(/pablo|fabrik|fahybrid/i);
        }
      }
    }
  });
});

describe('el coach que firma el aviso', () => {
  const week = { week_start: NEXT_MONDAY, today: TODAY };

  test('usa el nombre real del coach de ese atleta', async () => {
    const push = await planPublishedPush(sqlReturningName('Coach Demo 2'), BigInt(68), 'assigned', week);
    expect(push.body).toBe('Coach Demo 2 ha publicado tu plan de entrenamiento. Empieza la semana que viene.');
  });

  test('dos atletas de coaches distintos leen nombres distintos', async () => {
    const a = await planPublishedPush(sqlReturningName('Marta Soler'), BigInt(63), 'weekly', week);
    const b = await planPublishedPush(sqlReturningName('Coach Demo 2'), BigInt(68), 'weekly', week);
    expect(a.body).toBe('Marta Soler ha publicado tu plan para la semana que viene.');
    expect(b.body).toBe('Coach Demo 2 ha publicado tu plan para la semana que viene.');
  });

  // El sujeto neutro cubre los tres huecos reales: columna null, cadena vacía y
  // solo espacios. Ninguno puede acabar en un push que empiece por " ha publicado".
  test.each([null, '', '   '])('sin nombre (%j) → sujeto neutro, no un nombre inventado', async (name) => {
    const push = await planPublishedPush(sqlReturningName(name), BigInt(1), 'assigned', week);
    expect(push.body).toBe(`${COACH_FALLBACK_NAME} ha publicado tu plan de entrenamiento. Empieza la semana que viene.`);
    expect(push.body).not.toMatch(/^\s/);
  });

  test('atleta sin coach (0 filas) → sujeto neutro en vez de reventar el aviso', async () => {
    const sql = createFakeSql(() => []);
    await expect(coachDisplayNameForAthlete(sql, BigInt(999))).resolves.toBe(COACH_FALLBACK_NAME);
  });

  test('si la consulta falla, el aviso sale igual con el sujeto neutro', async () => {
    const sql = createFakeSql(() => {
      throw new Error('db down');
    });
    const push = await planPublishedPush(sql, BigInt(1), 'weekly', week);
    expect(push.body).toBe(`${COACH_FALLBACK_NAME} ha publicado tu plan para la semana que viene.`);
  });
});

describe('un solo sitio escribe el aviso', () => {
  const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  /** El texto que se ejecuta: sin comentarios. */
  const runtimeText = (rel: string) =>
    readFileSync(resolve(WEB, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');

  test('el módulo no lleva nombres propios ni marca en lo que se ejecuta', () => {
    expect(runtimeText('lib/notifications/plan-published.ts')).not.toMatch(/Pablo|Fabrik|FAHYBRID/);
  });

  // Cada ruta escribía su propio aviso (y dos se saltaban la regla de «solo si ve
  // alguna semana»). Ahora todos pasan por `notifyPlanPublished`.
  test.each([
    'app/api/coach/doubles/pairs/[id]/assign-sequence/route.ts',
    'app/api/coach/athletes/[id]/advance-sequence/route.ts',
    'lib/coach/assign-many.ts',
    'lib/coach/week-publishing.ts',
    'lib/coach/publish-week.ts',
  ])('%s no arma el aviso a mano', (rel) => {
    const text = runtimeText(rel);
    expect(text).not.toMatch(/'plan_published'/);
    expect(text).not.toMatch(/planPublishedPush/);
  });
});
