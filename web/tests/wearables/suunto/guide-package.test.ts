// Tests del ZIP: que sea un ZIP de verdad (se lee por el directorio central,
// como haría cualquier lector), que traiga los tres ficheros con el nombre exacto
// que pide el PDF y que el icono sea un PNG de 300×300.

import { describe, expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { createZip, crc32, readStoredZip } from '@/lib/wearables/suunto/zip';
import { buildGuideIconPng, GUIDE_ICON_SIZE } from '@/lib/wearables/suunto/icon';
import { buildGuidePackage, GUIDE_FILE_NAMES } from '@/lib/wearables/suunto/guide-package';
import { guideExternalId } from '@/lib/wearables/suunto/guide-builder';
import type { WatchWorkout } from '@fahybrid/shared/domain/wearables/watch-workout';

const WORKOUT: WatchWorkout = {
  name: 'Rodaje suave',
  sport: 'running',
  blocks: [
    {
      iterations: 1,
      steps: [
        {
          kind: 'work',
          measure: { type: 'distance', m: 5000 },
          target: { type: 'pace', fast_s_per_km: 300, slow_s_per_km: 310 },
          name: '5 km - 5:00-5:10/km',
        },
      ],
    },
  ],
};

const OPTS = {
  owner: 'TestOwner',
  url: 'https://example.com/sesion/7',
  externalId: guideExternalId(7),
};

describe('zip', () => {
  test('lo que se escribe es lo que se lee', () => {
    const entries = [
      { name: 'a.json', data: new Uint8Array(Buffer.from('{"hola":true}', 'utf8')) },
      { name: 'b.bin', data: new Uint8Array([0, 1, 2, 250, 255]) },
    ];
    const read = readStoredZip(createZip(entries));
    expect([...read.keys()]).toEqual(['a.json', 'b.bin']);
    expect(read.get('a.json')).toEqual(entries[0]!.data);
    expect(read.get('b.bin')).toEqual(entries[1]!.data);
  });

  test('empieza por la firma de cabecera local de PKZIP', () => {
    const zip = createZip([{ name: 'x', data: new Uint8Array([1]) }]);
    expect(Buffer.from(zip).readUInt32LE(0)).toBe(0x04034b50);
  });

  test('el CRC-32 es el del estándar', () => {
    // Vector conocido: CRC32("123456789") = 0xCBF43926.
    expect(crc32(new Uint8Array(Buffer.from('123456789', 'ascii')))).toBe(0xcbf43926);
  });

  test('mismos datos, mismos bytes (la marca de tiempo es fija)', () => {
    const entry = [{ name: 'a', data: new Uint8Array([7, 7, 7]) }];
    expect(Buffer.from(createZip(entry)).equals(Buffer.from(createZip(entry)))).toBe(true);
  });
});

describe('icono', () => {
  const png = buildGuideIconPng();

  test('es un PNG', () => {
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  test('mide exactamente 300x300, que es lo que exige el PDF', () => {
    const buf = Buffer.from(png);
    // El IHDR arranca tras la firma (8) + longitud (4) + tipo (4).
    expect(buf.readUInt32BE(16)).toBe(GUIDE_ICON_SIZE);
    expect(buf.readUInt32BE(20)).toBe(GUIDE_ICON_SIZE);
    expect(GUIDE_ICON_SIZE).toBe(300);
  });
});

describe('paquete completo', () => {
  const { zip, guide, manifest } = buildGuidePackage(WORKOUT, OPTS);
  const files = readStoredZip(zip);

  test('trae los tres ficheros con los nombres exactos de la spec', () => {
    expect([...files.keys()].sort()).toEqual(['guide.json', 'icon.png', 'manifest.json']);
    expect(GUIDE_FILE_NAMES).toEqual({
      manifest: 'manifest.json',
      guide: 'guide.json',
      icon: 'icon.png',
    });
  });

  test('el guide.json del ZIP es el guide devuelto', () => {
    const parsed = JSON.parse(Buffer.from(files.get('guide.json')!).toString('utf8'));
    expect(parsed).toEqual(guide);
    expect(parsed.externalId).toBe('fhb-a7');
  });

  test('el manifest repite los cuatro campos del guide, sin poder divergir', () => {
    const parsed = JSON.parse(Buffer.from(files.get('manifest.json')!).toString('utf8'));
    expect(parsed).toEqual(manifest);
    expect(parsed).toEqual({
      name: guide.name,
      type: 'sequence',
      owner: guide.owner,
      description: guide.description,
    });
  });

  test('el icono del ZIP es el PNG generado', () => {
    expect(files.get('icon.png')).toEqual(buildGuideIconPng());
  });
});
