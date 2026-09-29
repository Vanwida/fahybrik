// LOS VECTORES DE ORO DEL PLAN COMPACTO — el disco tiene que coincidir con el codificador.
//
// `fixtures/garmin-plan/*.json` los consumen el decodificador de Monkey C, iOS
// y el servidor. Si el codificador cambia y los ficheros no, este examen
// falla y dice cómo regenerarlos; si alguien retoca un fichero a mano, falla
// igual. Además cada vector se decodifica DESDE EL DISCO (hex → plan), como
// lo haría un consumidor ajeno, y se compara con la forma decodificada que el
// propio fichero declara.
//
// Regenerar: cd web && ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json scripts/garmin-plan-fixtures.ts

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aBase64, decodificarSesion, decodificarSobre, envolver, VERSION_ESQUEMA } from '@/components/design-twin/kit-garmin/plan-compacto';
import { DIR_VECTORES, generarVectores } from './garmin-plan-fixtures';
import { casosConVector } from './garmin-plan-casos';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/garmin-plan');
const AYUDA = `Regenera los vectores: cd web && ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json scripts/garmin-plan-fixtures.ts (${DIR_VECTORES})`;

const esperados = generarVectores();
const deHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

interface Vector {
  caso: string;
  esquema: number;
  bytes: number;
  hex: string;
  base64: string;
  sobre: string;
  valores: number[];
  cadenas: string[];
  meta: unknown;
  plan: unknown;
}

describe('vectores de oro del plan compacto', () => {
  it('no falta ni sobra ningún fichero', () => {
    const enDisco = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
    expect(enDisco, AYUDA).toEqual([...esperados.keys()].sort());
  });

  it.each([...esperados])('%s coincide con lo que produce el codificador', (nombre, texto) => {
    expect(readFileSync(join(DIR, nombre), 'utf8'), AYUDA).toBe(texto);
  });

  it.each(casosConVector().map(({ caso }) => [caso.clave] as const))('%s · el vector decodifica desde el disco a su propio plan y cabecera', (clave) => {
    const v = JSON.parse(readFileSync(join(DIR, `${clave}.json`), 'utf8')) as Vector;
    const bytes = deHex(v.hex);
    expect(bytes).toHaveLength(v.bytes);
    expect(v.esquema).toBe(VERSION_ESQUEMA);
    const d = decodificarSesion(bytes);
    expect(d.plan).toStrictEqual(v.plan);
    expect(d.meta).toStrictEqual(v.meta);
    // Las tres formas de llevar lo mismo dicen lo mismo.
    expect(aBase64(bytes)).toBe(v.base64);
    expect(v.sobre).toBe(envolver(bytes, v.esquema));
    expect(decodificarSobre(v.sobre).plan).toStrictEqual(v.plan);
  });

  it('los vectores básicos traen los varints de los bordes y las escalas', () => {
    const b = JSON.parse(readFileSync(join(DIR, '00-basicos.json'), 'utf8')) as {
      varint: Array<{ valor: number; hex: string }>;
      escalas: Array<{ valor: number; escala: number; token: number }>;
    };
    expect(b.varint.find((x) => x.valor === 300)?.hex).toBe('ac02');
    expect(b.varint.find((x) => x.valor === 127)?.hex).toBe('7f');
    expect(b.varint.find((x) => x.valor === 128)?.hex).toBe('8001');
    for (const e of b.escalas) expect(Math.round(e.valor * e.escala)).toBe(e.token);
  });
});
