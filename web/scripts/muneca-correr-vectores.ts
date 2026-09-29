/**
 * muneca-correr-vectores.ts — escribe los vectores de oro de la muñeca de
 * correr (del kit web al Swift). Los lee `MunecaCorrerTests` (iOS); el test
 * `kit-muneca-correr-vectores.test.ts` falla si el disco no coincide con lo que
 * produce el kit.
 *
 * Run (contexto web: alias `@/`):
 *   cd web && ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     scripts/muneca-correr-vectores.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { RUTA_VECTORES, generarVectoresMuneca } from '@/tests/design-twin/muneca-correr-vectores';

const destino = resolve(process.cwd(), RUTA_VECTORES);
mkdirSync(dirname(destino), { recursive: true });
const texto = generarVectoresMuneca();
writeFileSync(destino, texto);
process.stdout.write(`${texto.length} bytes en ${RUTA_VECTORES}\n`);
