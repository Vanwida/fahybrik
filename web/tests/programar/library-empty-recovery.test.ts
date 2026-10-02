import { describe, expect, it } from 'vitest';
import { libraryRecoveryFilter, type LibFilterCounts } from '@/components/v2/biblioteca/library-filter';
import { libraryView, libraryViewParams } from '@/components/v2/biblioteca/library-view';

const counts = (values: Partial<LibFilterCounts> = {}): LibFilterCounts => ({
  listos: 0, sin_dosis: 0, revisar: 0, duplicados: 0, archivados: 0, ...values,
});

describe('salidas de una biblioteca sin coincidencias', () => {
  it('un filtro explícito vacío ofrece la cola existente sin cambiar la elección', () => {
    const params = new URLSearchParams('ver=bloques&filtro=listos');
    expect(libraryRecoveryFilter(counts({ revisar: 99 }), 'listos')).toBe('revisar');
    expect(params.get('filtro')).toBe('listos');
  });

  it('ofrece los incompletos cuando no hay listos ni cola de revisión', () => {
    expect(libraryRecoveryFilter(counts({ sin_dosis: 4 }), 'listos')).toBe('sin_dosis');
  });

  it('una búsqueda sin coincidencias en un filtro con filas se resuelve quitando la búsqueda', () => {
    expect(libraryRecoveryFilter(counts({ listos: 8, revisar: 99 }), 'listos')).toBeNull();
  });

  it('mantiene acceso al archivo cuando todo el contenido está archivado', () => {
    expect(libraryRecoveryFilter(counts({ archivados: 3 }), 'revisar')).toBe('archivados');
  });

  it('una categoría sin ninguna fila requiere creación o acceso a otra categoría', () => {
    expect(libraryRecoveryFilter(counts(), 'listos')).toBeNull();
  });

  it('el enlace a otra categoría retira solo sus filtros antiguos y respeta el resto del contexto', () => {
    const original = new URLSearchParams('tab=sesiones&filtro=archivados&volver=%2Fes%2Fatletas%2F64');
    const next = libraryViewParams(original, 'bloques');
    expect(next.get('ver')).toBe('bloques');
    expect(next.has('tab')).toBe(false);
    expect(next.has('filtro')).toBe(false);
    expect(next.get('volver')).toBe('/es/atletas/64');
    expect(original.get('tab')).toBe('sesiones');
    expect(original.get('filtro')).toBe('archivados');
    expect(libraryView(next, 'entrenos')).toBe('bloques');
  });

  it('el vacío no sustituye la categoría de un enlace explícito por la recordada', () => {
    expect(libraryView(new URLSearchParams('ver=entrenos'), 'bloques')).toBe('entrenos');
    expect(libraryView(new URLSearchParams('tab=sesiones'), 'bloques')).toBe('entrenos');
    expect(libraryView(new URLSearchParams(), 'bloques')).toBe('bloques');
  });
});
