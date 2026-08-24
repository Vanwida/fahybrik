/**
 * El aviso «tu plan está publicado» nombra al coach de ESE atleta.
 *
 * Por qué existe este test: las siete cadenas de estos push decían «Pablo»
 * literal, así que el atleta de cualquier otro entrenador leía el nombre de un
 * desconocido. Aquí se fija el contrato: el nombre sale de `coaches.full_name`
 * por atleta, y cuando no hay nombre se usa un sujeto neutro — nunca uno inventado.
 */
import { describe, expect, test } from 'vitest';
import { createFakeSql } from '../utils/fake-sql';
import {
  COACH_FALLBACK_NAME,
  coachDisplayNameForAthlete,
  planPublishedPush,
} from '@/lib/notifications/plan-published';

/** Un cliente que devuelve el nombre dado como si viniera del join a `coaches`. */
function sqlReturningName(coach_name: string | null) {
  return createFakeSql((text) => {
    expect(text).toContain('join coaches');
    return [{ coach_name }];
  });
}

describe('plan-published — el coach que firma el aviso', () => {
  test('usa el nombre real del coach de ese atleta', async () => {
    const push = await planPublishedPush(sqlReturningName('Coach Demo 2'), BigInt(68), 'assigned');
    expect(push.body).toBe('Coach Demo 2 ha publicado tu plan de entrenamiento.');
  });

  test('dos atletas de coaches distintos leen nombres distintos', async () => {
    const a = await planPublishedPush(sqlReturningName('Pablo Amigo'), BigInt(63), 'weekly');
    const b = await planPublishedPush(sqlReturningName('Coach Demo 2'), BigInt(68), 'weekly');
    expect(a.body).toBe('Pablo Amigo ha publicado tu plan para la proxima semana.');
    expect(b.body).toBe('Coach Demo 2 ha publicado tu plan para la proxima semana.');
    expect(a.body).not.toEqual(b.body);
  });

  test('cada variante tiene su propia frase, y ninguna lleva un nombre propio fijo', async () => {
    const sql = sqlReturningName('Ana Ruiz');
    const assigned = await planPublishedPush(sql, BigInt(1), 'assigned');
    const weekly = await planPublishedPush(sql, BigInt(1), 'weekly');
    const next = await planPublishedPush(sql, BigInt(1), 'next_block');

    expect(assigned.title).toBe('Tu plan esta listo');
    expect(weekly.title).toBe('Tu plan de la semana esta listo');
    expect(next.title).toBe('Nuevo ciclo listo');
    for (const p of [assigned, weekly, next]) {
      expect(p.body.startsWith('Ana Ruiz ')).toBe(true);
      expect(`${p.title} ${p.body}`).not.toMatch(/pablo/i);
    }
  });

  // El sujeto neutro cubre los tres huecos reales: columna null, cadena vacía y
  // solo espacios. Ninguno puede acabar en un push que empiece por " ha publicado".
  test.each([null, '', '   '])('sin nombre (%j) → sujeto neutro, no un nombre inventado', async (
    name,
  ) => {
    const push = await planPublishedPush(sqlReturningName(name), BigInt(1), 'assigned');
    expect(push.body).toBe(`${COACH_FALLBACK_NAME} ha publicado tu plan de entrenamiento.`);
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
    const push = await planPublishedPush(sql, BigInt(1), 'weekly');
    expect(push.body).toBe(`${COACH_FALLBACK_NAME} ha publicado tu plan para la proxima semana.`);
  });
});
