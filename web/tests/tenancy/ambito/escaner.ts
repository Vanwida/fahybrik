// El escáner de ámbito: encuentra cada consulta SQL del código de la web y dice
// si está atada a un club.
//
// Una consulta es un template etiquetado de postgres.js (`sql\`…\``, `tx\`…\``,
// `client\`…\``…) cuyo texto toca alguna tabla del mapa. Está ATADA si:
//   · compara una columna `…coach_id` (where, join, using), o la escribe en un
//     insert — el filtro que hoy impide ver otro club;
//   · o solo toca `coaches`/`athletes` y se ancla en la identidad de la sesión: el
//     coach por su `id`/`user_id`, el atleta SOLO por `user_id` (un `athletes.id`
//     puede venir de la petición: así era el agujero de los partes de sesión);
//   · o lleva encima `// tenancy: <razón>` con una de RAZONES: el autor declara
//     por qué su ámbito es seguro sin filtrar por coach. Cada razón es una
//     política RLS futura.
// Lo que no cumple nada de eso es «sin ámbito». Hoy hay un baseline de ellas; el
// test no deja que crezca.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { TABLAS } from './tablas';

export const RAZONES = {
  'athlete-session': 'el atleta sale de la sesión firmada, no de la petición',
  'verified-owner': 'un guard anterior en la misma función comprobó que el id es del coach',
  platform: 'recorre todos los clubs a propósito (cron, admin)',
  'shared-catalog': 'lee filas comunes del catálogo (coach_id null)',
  'coach-fragment': 'el filtro de coach llega en un fragmento interpolado',
} as const;

export type Consulta = {
  archivo: string;
  linea: number;
  texto: string;
  huella: string;
  tablasClub: string[];
  atada: boolean;
  razon: string | null;
};

const TABLE_RE = /\b(?:from|join|update|into)\s+(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;
const COACH_CMP_RE =
  /\b[a-z_]*coach_id\s*(?:=|<>|!=|\bin\b|\bis\b)|(?:=|<>|!=|\bin\s*\(|\bany\s*\()\s*[a-z_.]*\bcoach_id\b|\busing\s*\([^)]*\bcoach_id\b/i;
const INSERT_COLS_RE = /\binsert\s+into\s+[a-z_.]+\s*\(([^)]*)\)/gi;
const COACH_SELF_RE = /\b(?:id|user_id)\s*=\s*(?:\$\{\}|any\s*\()/i;
const USER_SELF_RE = /\buser_id\s*=\s*(?:\$\{\}|any\s*\()/i;
// ORDER BY no filtra: `order by (coach_id is null)` no ata nada.
const ORDER_BY_RE = /\border\s+by\b[\s\S]*?(?=\blimit\b|\boffset\b|\)|;|$)/gi;
const RAZON_RE = /\/\/\s*tenancy:\s*([a-z-]+)/i;

function templateText(node: ts.TaggedTemplateExpression): string {
  const t = node.template;
  if (ts.isNoSubstitutionTemplateLiteral(t)) return t.text;
  return [t.head.text, ...t.templateSpans.map((s) => '${}' + s.literal.text)].join('');
}

function sinComentarios(sqlText: string): string {
  return sqlText.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

export function huella(sqlText: string): string {
  const norm = sinComentarios(sqlText).replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha1').update(norm).digest('hex').slice(0, 12);
}

export function tablasDeClub(sqlText: string): string[] {
  const found = new Set<string>();
  for (const m of sinComentarios(sqlText).matchAll(TABLE_RE)) {
    const t = m[1].toLowerCase();
    if (TABLAS[t]?.clase === 'club') found.add(t);
  }
  return [...found].sort();
}

export function estaAtada(sqlText: string, tablas: string[]): boolean {
  const text = sinComentarios(sqlText).replace(ORDER_BY_RE, ' ');
  if (COACH_CMP_RE.test(text)) return true;
  for (const m of text.matchAll(INSERT_COLS_RE)) {
    if (/\b[a-z_]*coach_id\b/i.test(m[1])) return true;
  }
  if (tablas.length === 1 && tablas[0] === 'coaches') return COACH_SELF_RE.test(text);
  if (tablas.every((t) => t === 'coaches' || t === 'athletes')) return USER_SELF_RE.test(text);
  return false;
}

/** La razón declarada en el bloque de comentarios justo encima de la línea, o en ella. */
export function razonDeclarada(lines: string[], lineIndex: number): string | null {
  const own = RAZON_RE.exec(lines[lineIndex] ?? '');
  if (own) return own[1];
  for (let i = lineIndex - 1; i >= 0 && i >= lineIndex - 6; i--) {
    const l = lines[i].trim();
    if (!l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*')) break;
    const m = RAZON_RE.exec(l);
    if (m) return m[1];
  }
  return null;
}

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
}

/** Todas las consultas que tocan tablas de club en `dirs` (rutas relativas a `webDir`). */
export function escanear(webDir: string, dirs: string[]): Consulta[] {
  const files: string[] = [];
  for (const d of dirs) walk(join(webDir, d), files);
  const out: Consulta[] = [];
  for (const file of files.sort()) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('`')) continue;
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const lines = source.split('\n');
    const visit = (node: ts.Node): void => {
      if (ts.isTaggedTemplateExpression(node)) {
        const texto = templateText(node);
        const tablas = tablasDeClub(texto);
        if (tablas.length > 0) {
          const start = node.getStart(sf);
          const linea = sf.getLineAndCharacterOfPosition(start).line;
          const stmt = sf.getLineAndCharacterOfPosition(statementStart(node).getStart(sf)).line;
          out.push({
            archivo: relative(webDir, file),
            linea: linea + 1,
            texto,
            huella: huella(texto),
            tablasClub: tablas,
            atada: estaAtada(texto, tablas),
            razon: razonDeclarada(lines, linea) ?? razonDeclarada(lines, stmt),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

/** El statement que contiene la consulta: el comentario va encima de él, no del backtick. */
function statementStart(node: ts.Node): ts.Node {
  let n: ts.Node = node;
  while (n.parent && !ts.isSourceFile(n.parent) && !ts.isBlock(n.parent)) n = n.parent;
  return n;
}
