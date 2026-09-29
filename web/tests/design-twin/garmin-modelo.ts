// Leer las tablas de docs/garmin-reloj/modelo.md desde los tests del kit
// Garmin: el código se cruza con el documento, no con una copia de él.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MODELO = readFileSync(resolve(RAIZ, 'docs/garmin-reloj/modelo.md'), 'utf8');

/** Las filas de la primera tabla que sigue a `titulo`, sin cabecera ni separador. */
export function tablaDe(titulo: string): string[][] {
  const desde = MODELO.indexOf(titulo);
  if (desde < 0) throw new Error(`No está «${titulo}» en el modelo`);
  const lineas = MODELO.slice(desde).split('\n').slice(1);
  const filas: string[][] = [];
  for (const l of lineas) {
    if (l.startsWith('|')) filas.push(l.split('|').slice(1, -1).map((c) => c.trim()));
    else if (filas.length > 0) break;
  }
  return filas.slice(2);
}

/** Una celda del documento sin formato: sin negritas, sin código, sin paréntesis. */
export const normal = (c: string) =>
  c
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
