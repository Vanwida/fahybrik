import { describe, expect, test } from 'vitest';
import { V2_NAV_ITEMS } from '@/components/v2/nav';

describe('nav Estudio', () => {
  test('el estudio vive en Método y no se confunde con Cómo trabajo', () => {
    const estudio = V2_NAV_ITEMS.find((item) => item.href === '/estudio');
    expect(estudio).toMatchObject({ label: 'Estudio', group: 'metodo' });
    expect(V2_NAV_ITEMS.some((item) => item.href === '/metodologia')).toBe(false);
  });
});
