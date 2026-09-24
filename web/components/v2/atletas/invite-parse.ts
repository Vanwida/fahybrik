// Invitar a varios: de lo que el coach pega (o sube en CSV) a una lista de
// personas con nombre y email, con el motivo por el que una línea no vale.
// PURO — se prueba en node.
//
// Acepta, una persona por línea:
//   Marta Ruiz, marta@correo.com          (coma, punto y coma o tabulador)
//   marta@correo.com, Marta Ruiz          (el orden da igual: el email es el que lleva @)
//   Marta Ruiz <marta@correo.com>         (copiado de un cliente de correo)
//   marta@correo.com                      (sin nombre → se pide)
// Una primera línea de cabecera («nombre,email») se salta. Columnas de más se ignoran.

/** Mismo criterio que el servidor (z.string().email()) en lo esencial. */
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const HEADER_RE = /^(nombre|name|full.?name)?[\s,;\t]*(e-?mail|correo)/i;

export const INVITE_MAX_ROWS = 200;
export const INVITE_NAME_MAX = 120;

export type InviteIssue = 'sin_email' | 'email_no_valido' | 'sin_nombre' | 'repetido' | 'ya_en_tu_lista';

export interface InviteLine {
  /** Número de línea en lo pegado (1-based). */
  line: number;
  name: string;
  email: string;
  issue: InviteIssue | null;
}

export const INVITE_ISSUE_LABEL: Record<InviteIssue, string> = {
  sin_email: 'Falta el email',
  email_no_valido: 'Email no válido',
  sin_nombre: 'Falta el nombre',
  repetido: 'Repetido en la lista',
  ya_en_tu_lista: 'Ya está en tu lista',
};

function unquote(s: string): string {
  return s.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim();
}

/** Parte una línea de CSV sencillo (comillas dobles para campos con coma). */
function splitCells(line: string): string[] {
  const sep = line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ',';
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    if (ch === sep && !quoted) {
      cells.push(cur);
      cur = '';
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map(unquote).filter((c) => c.length > 0);
}

function parseLine(raw: string): { name: string; email: string } {
  const angle = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (angle) return { name: angle[1]!.trim(), email: angle[2]!.trim() };
  const cells = splitCells(raw);
  const emailIdx = cells.findIndex((c) => c.includes('@'));
  if (emailIdx === -1) return { name: cells.join(' ').trim(), email: '' };
  const email = cells[emailIdx]!;
  const name = cells.find((c, i) => i !== emailIdx && !c.includes('@')) ?? '';
  return { name, email };
}

/**
 * Lo pegado → líneas con su problema (si lo tienen). `existing` son los emails
 * que ya están en el roster del coach. Las líneas vacías no cuentan.
 */
export function parseInviteList(text: string, existing: Iterable<string> = []): InviteLine[] {
  const known = new Set([...existing].map((e) => e.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: InviteLine[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    if (out.length === 0 && HEADER_RE.test(raw.trim())) return;
    const { name, email: rawEmail } = parseLine(raw);
    const email = rawEmail.toLowerCase();
    let issue: InviteIssue | null = null;
    if (!email) issue = 'sin_email';
    else if (!EMAIL_RE.test(email)) issue = 'email_no_valido';
    else if (known.has(email)) issue = 'ya_en_tu_lista';
    else if (seen.has(email)) issue = 'repetido';
    else if (!name) issue = 'sin_nombre';
    if (issue == null) seen.add(email);
    out.push({ line: i + 1, name: name.slice(0, INVITE_NAME_MAX), email, issue });
  });
  return out.slice(0, INVITE_MAX_ROWS);
}

/** Las que se pueden invitar. */
export function invitable(lines: readonly InviteLine[]): InviteLine[] {
  return lines.filter((l) => l.issue == null);
}

/** «Nombre: enlace» por línea, para pegar en un mensaje o una hoja. */
export function linksText(rows: ReadonlyArray<{ name: string; invite_url: string | null }>): string {
  return rows
    .filter((r) => r.invite_url)
    .map((r) => `${r.name}: ${r.invite_url}`)
    .join('\n');
}
