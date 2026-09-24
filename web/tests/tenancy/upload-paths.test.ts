/**
 * La propiedad de un fichero se lee de su ruta (hallazgo P2 nº14). Antes bastaba
 * con que el SEGUNDO tramo fuera el id propio, con cualquier número de tramos
 * detrás: `chat/<mío>/../../chat/<suyo>/…` pasaba por mío. Pura.
 */
import { describe, expect, test } from 'vitest';

import { ownerIdFromPathname } from '@/lib/storage/owned-pathname';
import { athleteIdFromPathname } from '@/lib/chat/upload';
import { importPhotoPathnameOwner } from '@/lib/import/photo-pathname';
import { coachIdFromAudioPathname } from '@/lib/communications/audio';

const UUID = '0b7f5a52-6f1e-4c55-9d0f-2f5e8f3c1a9b';

describe('ownerIdFromPathname', () => {
  test('la forma exacta devuelve el dueño', () => {
    expect(ownerIdFromPathname(`chat/42/2026/05/${UUID}.jpg`, 'chat')).toBe(BigInt(42));
  });

  test.each([
    [`chat/42/../../chat/7/2026/05/${UUID}.jpg`, 'sube con ..'],
    [`chat/42/2026/05/../${UUID}.jpg`, '.. dentro'],
    [`chat/42/2026/05/..`, 'fichero ..'],
    [`chat/42/2026/05/.`, 'fichero .'],
    [`chat/42/2026/./${UUID}.jpg`, 'tramo .'],
    [`/chat/42/2026/05/${UUID}.jpg`, 'absoluta'],
    [`chat/42/2026/05/${UUID}.jpg/`, 'barra final'],
    [`chat//42/2026/05/${UUID}.jpg`, 'tramo vacío'],
    [`chat\\42\\2026\\05\\${UUID}.jpg`, 'barras invertidas'],
    [`chat/42/2026/05/extra/${UUID}.jpg`, 'un tramo de más'],
    [`chat/42/2026/${UUID}.jpg`, 'un tramo de menos'],
    [`chat/0/2026/05/${UUID}.jpg`, 'dueño 0'],
    [`chat/42/26/05/${UUID}.jpg`, 'año raro'],
    [`chat/42/2026/05/a.b.jpg`, 'dos puntos'],
    [`evil/42/2026/05/${UUID}.jpg`, 'otra raíz'],
  ])('rechaza %s (%s)', (path) => {
    expect(ownerIdFromPathname(path, 'chat')).toBeNull();
  });
});

describe('los tres lectores usan la misma forma', () => {
  test('chat, fotos de importación y audios', () => {
    expect(athleteIdFromPathname(`chat/42/../../chat/7/2026/05/${UUID}.jpg`)).toBeNull();
    expect(importPhotoPathnameOwner(`import-photos/42/../../import-photos/7/2026/08/${UUID}.jpg`)).toBeNull();
    expect(importPhotoPathnameOwner(`import-photos/42/2026/08/${UUID}.jpg`)).toBe(BigInt(42));
    expect(coachIdFromAudioPathname(`/comunicados/42/2026/08/${UUID}.m4a`)).toBeNull();
    expect(coachIdFromAudioPathname(`comunicados/42/2026/08/..`)).toBeNull();
  });
});
