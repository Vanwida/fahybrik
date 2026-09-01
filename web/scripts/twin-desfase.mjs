#!/usr/bin/env node
// El detector de espejos podridos.
//
// Un «espejo» del doble afirma replicar unos ficheros Swift (meta.fuentes) a
// fecha meta.actualizado. Esa afirmación caduca en silencio: el Swift cambia y
// el espejo sigue diciendo «así está la app». Este script la re-verifica:
// si alguna fuente tiene un commit POSTERIOR al actualizado del espejo, el
// espejo está desfasado y se lista con las fuentes que lo delatan.
//
// Uso: node scripts/twin-desfase.mjs   (desde web/; sale 1 si hay desfases)
// Existe porque el 3-ago-2026 los 5 espejos llevaban una semana mintiendo y
// nadie lo vio hasta que Alex dejó de fiarse del índice entero.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = resolve(webDir, '..');
const screensDir = join(webDir, 'components/design-twin/screens');

function gitFecha(ruta) {
  const out = execFileSync('git', ['log', '-1', '--format=%as', '--', ruta], {
    cwd: repoDir,
    encoding: 'utf8',
  }).trim();
  return out || null;
}

const desfasados = [];

for (const id of readdirSync(screensDir).sort()) {
  const indexPath = join(screensDir, id, 'index.tsx');
  let src;
  try {
    src = readFileSync(indexPath, 'utf8');
  } catch {
    continue;
  }
  if (!/estado:\s*'espejo'/.test(src)) continue;

  const actualizado = src.match(/actualizado:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1];
  const fuentesRaw = src.match(/fuentes:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  const fuentes = [...fuentesRaw.matchAll(/'([^']+)'/g)].map((m) => m[1]);

  if (!actualizado) {
    desfasados.push({ id, motivo: 'espejo sin fecha `actualizado` en meta' });
    continue;
  }
  if (fuentes.length === 0) {
    desfasados.push({ id, motivo: 'espejo sin `fuentes` — no afirma nada verificable' });
    continue;
  }

  const delatoras = [];
  for (const fuente of fuentes) {
    const fecha = gitFecha(fuente);
    if (!fecha) delatoras.push(`${fuente} → NO EXISTE en git`);
    else if (fecha > actualizado) delatoras.push(`${fuente} → ${fecha}`);
  }
  if (delatoras.length > 0) desfasados.push({ id, actualizado, delatoras });
}

if (desfasados.length === 0) {
  console.log('Espejos fieles: ninguna fuente Swift cambió después de su `actualizado`.');
  process.exit(0);
}

console.log(`ESPEJOS DESFASADOS: ${desfasados.length}\n`);
for (const d of desfasados) {
  if (d.motivo) {
    console.log(`· ${d.id} — ${d.motivo}`);
    continue;
  }
  console.log(`· ${d.id} (espejo del ${d.actualizado}) — fuentes con commits posteriores:`);
  for (const f of d.delatoras) console.log(`    ${f}`);
}
console.log(
  '\nCada uno miente: re-verificar contra el Swift actual y actualizar pantalla + `actualizado` en el mismo commit.'
);
process.exit(1);
