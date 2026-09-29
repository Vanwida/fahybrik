// LOS VECTORES DE ORO DE LA MUÑECA DE CORRER — el disco tiene que coincidir con el kit.
//
// `ios/FAHYBRIKTests/Vivo/Vectores/muneca-correr.json` lo lee el examen de iOS
// (`MunecaCorrerTests`) y compara, línea a línea, lo que el Swift pinta con lo
// que pinta el kit. Si el kit cambia y el fichero no, este examen falla y dice
// cómo regenerarlo; si alguien retoca el fichero a mano, falla igual.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AYUDA, RUTA_VECTORES, esDeCorrer, generarVectoresMuneca, indicesClave, n3 } from './muneca-correr-vectores';
import { casosConVector } from './garmin-plan-casos';

const DISCO = resolve(dirname(fileURLToPath(import.meta.url)), '../..', RUTA_VECTORES);

interface Doc {
  casos: Array<{ clave: string; plan: { pasos: unknown[] }; pasos: Array<{ paso: { i: number }; situaciones: Array<{ n: string; plano: string[] }> }> }>;
  vueltas: unknown[];
}

describe('vectores de oro de la muñeca de correr', () => {
  it('el disco coincide con lo que produce el kit', () => {
    expect(readFileSync(DISCO, 'utf8'), AYUDA).toBe(generarVectoresMuneca());
  });

  it('hay un caso por cada sesión de correr del doble, sin repetir', () => {
    const doc = JSON.parse(readFileSync(DISCO, 'utf8')) as Doc;
    const esperadas = casosConVector().map((x) => x.caso).filter(esDeCorrer).map((c) => c.clave);
    expect(doc.casos.map((c) => c.clave)).toEqual(esperadas);
    for (const clave of ['573', '509', '535', '552', '479']) expect(esperadas, clave).toContain(clave);
  });

  it('cada caso examina su primer y último paso y cada clase de paso, con las cinco situaciones', () => {
    const doc = JSON.parse(readFileSync(DISCO, 'utf8')) as Doc;
    for (const c of doc.casos) {
      const idx = c.pasos.map((p) => p.paso.i);
      expect(idx, c.clave).toContain(0);
      expect(idx, c.clave).toContain(c.plan.pasos.length - 1);
      for (const p of c.pasos) {
        expect(p.situaciones.map((s) => s.n), `${c.clave} paso ${p.paso.i}`).toEqual(['arranque', 'dentro', 'rapido', 'lento', 'sin-enlace']);
        for (const s of p.situaciones) expect(s.plano[0], `${c.clave} paso ${p.paso.i}`).toMatch(/^cara=(paso|recupera|descanso)$/);
      }
    }
  });

  it('indicesClave nunca deja fuera una clase de paso', () => {
    const pasos = Array.from({ length: 20 }, (_, i) => ({ clase: i % 2 ? 'recuperacion' : 'series', rol: i % 2 ? 'recuperacion' : 'trabajo', fase: 'principal' })) as never[];
    expect(indicesClave(pasos)).toEqual([0, 1, 2, 3, 18, 19]);
  });

  it('n3 no imprime ceros de más ni «-0»', () => {
    expect([n3(44), n3(0.30000000000000004), n3(-0), n3(12.5), n3(0.0625)]).toEqual(['44', '0.3', '0', '12.5', '0.063']);
  });
});
