// La regla de entrega de una semana: qué se escribe en `weekly_plans` según la
// entrega elegida, y cuándo se abre sola. Una retenida nunca se suelta sola.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTO_PUBLISH_DAYS_BEFORE,
  autoPublishDate,
  autoWeekWrite,
  deliveryWeekWrite,
  effectiveAutoPublishDays,
  isPastWeek,
  releaseHoldWrite,
} from '@fahybrid/shared/domain/coach/week-publishing';

const held = { status: 'draft', delivery_mode: 'manual' } as const;
const auto = { status: 'draft', delivery_mode: 'scheduled' } as const;
const published = { status: 'published', delivery_mode: 'scheduled' } as const;

describe('N días antes', () => {
  it('defecto 2 = el sábado antes del lunes (lo que hacía el cron del sábado)', () => {
    expect(DEFAULT_AUTO_PUBLISH_DAYS_BEFORE).toBe(2);
    expect(autoPublishDate('2026-09-28', 2)).toBe('2026-09-26');
  });

  it('NULL → defecto; fuera de rango se acota', () => {
    expect(effectiveAutoPublishDays(null)).toBe(2);
    expect(effectiveAutoPublishDays(0)).toBe(0);
    expect(effectiveAutoPublishDays(99)).toBe(28);
  });

  it('isPastWeek: el domingo aún es la semana; el lunes siguiente ya no', () => {
    expect(isPastWeek('2026-09-14', '2026-09-20')).toBe(false);
    expect(isPastWeek('2026-09-14', '2026-09-21')).toBe(true);
  });
});

describe('autoWeekWrite', () => {
  it('fuera de la ventana y sin fila → borrador automático', () => {
    expect(autoWeekWrite(null, '2026-10-12', '2026-09-23', 2)).toEqual({ kind: 'draft_auto' });
  });

  it('dentro de la ventana y sin fila → no toca (sin fila se ve)', () => {
    expect(autoWeekWrite(null, '2026-09-28', '2026-09-26', 2)).toEqual({ kind: 'keep' });
  });

  it('dentro de la ventana y en borrador automático → publica', () => {
    expect(autoWeekWrite(auto, '2026-09-28', '2026-09-26', 2)).toEqual({ kind: 'publish' });
  });

  it('una semana retenida NUNCA se suelta sola', () => {
    expect(autoWeekWrite(held, '2026-09-28', '2026-09-27', 2)).toEqual({ kind: 'keep' });
  });

  it('lo automático nunca esconde una semana ya publicada', () => {
    expect(autoWeekWrite(published, '2026-10-26', '2026-09-23', 2)).toEqual({ kind: 'keep' });
  });
});

describe('deliveryWeekWrite', () => {
  it('visible publica también lo retenido (elección explícita del coach)', () => {
    expect(deliveryWeekWrite('visible', held, '2026-10-26', '2026-09-23', 2)).toEqual({ kind: 'publish' });
    expect(deliveryWeekWrite('visible', null, '2026-10-26', '2026-09-23', 2)).toEqual({ kind: 'keep' });
  });

  it('draft retiene todo, también lo que ya estaba publicado', () => {
    expect(deliveryWeekWrite('draft', published, '2026-09-28', '2026-09-23', 2)).toEqual({ kind: 'hold' });
    expect(deliveryWeekWrite('draft', held, '2026-09-28', '2026-09-23', 2)).toEqual({ kind: 'keep' });
  });
});

describe('releaseHoldWrite', () => {
  it('quitar la retención dentro de la ventana publica ya', () => {
    expect(releaseHoldWrite('2026-09-28', '2026-09-26', 2)).toEqual({ kind: 'publish' });
  });

  it('fuera de la ventana vuelve a lo automático', () => {
    expect(releaseHoldWrite('2026-10-12', '2026-09-23', 2)).toEqual({ kind: 'draft_auto' });
  });
});
