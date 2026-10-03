import { describe, expect, it } from 'vitest';
import { LIBRARY_VIEWS, firstLibraryView, libraryView } from '@/components/v2/biblioteca/library-view';

const rows = (active: number, archived = 0) => [
  ...Array.from({ length: active }, () => ({ archived: false })),
  ...Array.from({ length: archived }, () => ({ archived: true })),
];
const content = (entrenos: number, bloques: number, archivedEntrenos = 0, archivedBloques = 0) => ({
  entrenos: rows(entrenos, archivedEntrenos), bloques: rows(bloques, archivedBloques),
});

describe('primera entrada neutral de Biblioteca', () => {
  it.each([
    [0, 99, 0, 0, 'bloques'],
    [1, 99, 0, 0, 'entrenos'],
    [4, 0, 0, 99, 'entrenos'],
    [0, 99, 8, 0, 'bloques'],
    [0, 0, 8, 99, 'entrenos'],
    [0, 0, 0, 0, 'entrenos'],
  ] as const)('con %i entrenos y %i bloques activos (archivo %i/%i), abre %s', (entrenos, bloques, archivedEntrenos, archivedBloques, expected) => {
    const data = content(entrenos, bloques, archivedEntrenos, archivedBloques);
    expect(firstLibraryView(data)).toBe(expected);
    expect(libraryView(new URLSearchParams(), undefined, data)).toBe(expected);
  });

  it('un fallo de carga mantiene la vista de entrada para mostrar su error', () => {
    expect(firstLibraryView(null)).toBe('entrenos');
    expect(libraryView(new URLSearchParams(), undefined, null)).toBe('entrenos');
  });

  it.each(LIBRARY_VIEWS)('respeta la elección recordada %s aunque esté vacía', (remembered) => {
    expect(libraryView(new URLSearchParams(), remembered, content(0, 99))).toBe(remembered);
  });

  it.each(LIBRARY_VIEWS)('el enlace explícito %s prevalece sobre la elección y los datos', (view) => {
    expect(libraryView(new URLSearchParams({ ver: view }), 'ejercicios', content(0, 99))).toBe(view);
  });

  it('el enlace antiguo a entrenos vacíos también prevalece', () => {
    expect(libraryView(new URLSearchParams('tab=sesiones'), 'bloques', content(0, 99))).toBe('entrenos');
  });

  it('un valor de URL desconocido no crea una elección', () => {
    expect(libraryView(new URLSearchParams('ver=desconocido'), undefined, content(0, 99))).toBe('bloques');
    expect(libraryView(new URLSearchParams('ver=desconocido'), 'comunicados', null)).toBe('comunicados');
  });
});
