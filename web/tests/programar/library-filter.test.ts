// La biblioteca se abre donde está el trabajo (revisión de producto, ola 4):
// con 0 listos y bloques por revisar, en «Por revisar»; si no, en «Listos».

import { describe, expect, it } from 'vitest';
import { defaultLibFilter, parseLibFilter } from '@/components/v2/biblioteca/library-filter';

describe('defaultLibFilter', () => {
  it('0 listos y 97 por revisar → abre la cola de revisión', () => {
    expect(defaultLibFilter({ listos: 0, revisar: 97 })).toBe('revisar');
  });
  it('con algo listo → Listos, aunque haya por revisar', () => {
    expect(defaultLibFilter({ listos: 3, revisar: 97 })).toBe('listos');
  });
  it('biblioteca vacía → Listos (su vacío dice «todavía no hay»)', () => {
    expect(defaultLibFilter({ listos: 0, revisar: 0 })).toBe('listos');
  });
});

describe('parseLibFilter', () => {
  it('un filtro pedido en la URL manda; lo desconocido es «ninguno»', () => {
    expect(parseLibFilter('listos')).toBe('listos');
    expect(parseLibFilter('revisar')).toBe('revisar');
    expect(parseLibFilter('otro')).toBeNull();
    expect(parseLibFilter(null)).toBeNull();
  });
});
