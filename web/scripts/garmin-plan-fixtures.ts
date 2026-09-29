/**
 * garmin-plan-fixtures.ts — escribe los vectores de oro del plan compacto del
 * reloj Garmin y, con `--medidas`, imprime la tabla de tamaños que usa el doc.
 *
 * Los vectores (`tests/design-twin/fixtures/garmin-plan/*.json`) los consume
 * quien escriba el decodificador de Monkey C, iOS y el servidor; el test
 * `kit-garmin-plan-compacto-vectores.test.ts` falla si el disco no coincide con
 * lo que produce el codificador. Un fichero que ya no corresponde a ningún caso
 * se borra: nada obsoleto que despiste.
 *
 * Run (contexto web: alias `@/`):
 *   cd web && ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json \
 *     scripts/garmin-plan-fixtures.ts [--medidas]
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { casosConVector, casosReales } from '@/tests/design-twin/garmin-plan-casos';
import { DIR_VECTORES, generarVectores } from '@/tests/design-twin/garmin-plan-fixtures';
import { medirSesion, resumir } from '@/tests/design-twin/garmin-plan-medidas';

const salida = (s: string) => process.stdout.write(`${s}\n`);

function escribirVectores(): void {
  const dir = resolve(process.cwd(), DIR_VECTORES);
  mkdirSync(dir, { recursive: true });
  const vectores = generarVectores();
  for (const [nombre, texto] of vectores) writeFileSync(join(dir, nombre), texto);
  for (const previo of readdirSync(dir)) {
    if (previo.endsWith('.json') && !vectores.has(previo)) rmSync(join(dir, previo));
  }
  salida(`${vectores.size} ficheros en ${DIR_VECTORES}`);
}

function imprimirMedidas(): void {
  const medidas = casosConVector().map(({ caso, meta }) => ({ clave: caso.clave, m: medirSesion(caso.plan, meta) }));
  salida('| caso | pasos | valores | binario B | cabecera B | base64 | sobre B | JSON A B | gzip B | gzip A |');
  salida('|---|---|---|---|---|---|---|---|---|---|');
  for (const { clave, m } of medidas) {
    salida(`| ${clave} | ${m.pasos} | ${m.valores} | ${m.binario} | ${m.binarioCabecera} | ${m.base64} | ${m.sobre} | ${m.json} | ${m.gzipSobre} | ${m.gzipJson} |`);
  }
  const reales = new Set(casosReales().map((c) => c.clave));
  const grupos: Array<[string, typeof medidas]> = [
    ['reales', medidas.filter((x) => reales.has(x.clave))],
    ['todos', medidas],
  ];
  for (const [nombre, ms] of grupos) {
    const r = resumir(ms);
    const suma = (f: (x: (typeof medidas)[number]['m']) => number) => ms.reduce((s, x) => s + f(x.m), 0);
    salida(
      `${nombre}: n=${r.n} mayor=${r.mayor.clave} ${r.mayor.bytes} B media=${r.media.toFixed(0)} B peorDiaDoble=${r.peorDiaDoble} B diaDobleMedio=${r.diaDobleMedio.toFixed(0)} B noCaben=${r.noCaben.join(',') || 'ninguna'}`,
    );
    salida(
      `${nombre} totales: binario=${suma((m) => m.binario)} sobre=${suma((m) => m.sobre)} jsonA=${suma((m) => m.json)} cabecera=${suma((m) => m.binarioCabecera)} gzipSobre=${suma((m) => m.gzipSobre)} gzipA=${suma((m) => m.gzipJson)} valores=${suma((m) => m.valores)} pasos=${suma((m) => m.pasos)}`,
    );
  }
}

if (process.argv.includes('--medidas')) imprimirMedidas();
else escribirVectores();
