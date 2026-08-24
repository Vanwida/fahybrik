import { describe, expect, it } from 'vitest';
import { V2_NAV_ITEMS } from '@/components/v2/nav';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('nav y proxy de Cómo entrenas', () => {
  it('el sidebar tiene Cómo entrenas en Método, antes de Planificación', () => {
    const metodo = V2_NAV_ITEMS.filter((i) => i.group === 'metodo');
    expect(metodo[0]?.href).toBe('/como-entrenas');
    expect(metodo[0]?.label).toBe('Cómo entrenas');
    expect(metodo.some((i) => i.href === '/periodizacion')).toBe(true);
    expect(metodo.some((i) => i.href === '/cuestionarios')).toBe(true);
  });

  it('proxy protege /:locale/como-entrenas', () => {
    const src = readFileSync(resolve(process.cwd(), 'proxy.ts'), 'utf8');
    expect(src).toContain('/:locale/como-entrenas/:path*');
    expect(src).toContain('/:locale/cuestionarios');
  });
});
