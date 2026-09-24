// sql-split.ts — split a SQL script into its top-level statements.
//
// WHY THIS EXISTS
// migrate.ts used to send a migration as ONE simple-protocol query
// (`sql.unsafe(body)`). Postgres runs a query string holding several statements
// as an implicit transaction block, and CREATE INDEX CONCURRENTLY refuses to run
// inside one ("cannot run inside a transaction block"), so a migration with two
// or more CONCURRENTLY statements (0051) could never apply. The runner's
// no-transaction path now splits the file here and sends each statement as its
// own query. The transactional path does not use this module.
//
// WHERE A STATEMENT ENDS
// At a `;` outside every quote and comment, outside parentheses
// (CREATE RULE … DO (a; b)) and outside the BEGIN ATOMIC … END body of a
// CREATE [OR REPLACE] FUNCTION|PROCEDURE — the rules of the server lexer
// (scan.l) and of psql (psqlscan.l):
//   '…'            '' is a quote; a backslash is literal
//                  (standard_conforming_strings = on, the Postgres default)
//   E'…'           a backslash escapes the next character; the E counts only at
//                  the start of a token (`else'\'` is a plain string)
//   '…' '…'        one literal when a newline separates them (SQL continuation);
//                  it keeps the first part's rules
//   "…"            "" is a quote
//   $$…$$ $tag$…$tag$   no escapes; `$1` is a parameter, `a$b$` an identifier
//   -- …           runs to the end of the line
//   /* … */        nests
// Statements holding only whitespace or comments are dropped. Each one is
// returned from its first token to its last, without the `;`. A quote, dollar
// body or comment still open at the end of the input throws, before anything
// has run.

const SPACE = /[ \t\n\r\f\v]/;
const IDENT_START = /[A-Za-z_\u0080-\uffff]/;
const IDENT_CONT = /[A-Za-z0-9_$\u0080-\uffff]/;
const TAG_CONT = /[A-Za-z0-9_\u0080-\uffff]/; // a dollar-quote tag cannot hold `$`

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = -1; // first char of the current statement; -1 until it has a token
  let end = 0; // one past its last token
  let parens = 0;
  let atomic = 0; // depth of BEGIN ATOMIC … END, and of CASE … END inside it
  let words: string[] = []; // the statement's first identifiers, lowercased

  let i = 0;
  while (i < sql.length) {
    const c = sql.charAt(i);
    const next = sql.charAt(i + 1);

    if (SPACE.test(c)) {
      i++;
      continue;
    }
    if (c === '-' && next === '-') {
      i = lineEnd(sql, i);
      continue;
    }
    if (c === '/' && next === '*') {
      i = blockCommentEnd(sql, i);
      continue;
    }
    if (c === ';' && parens === 0 && atomic === 0) {
      if (start >= 0) statements.push(sql.slice(start, end));
      start = -1;
      words = [];
      i++;
      continue;
    }

    const token = i;
    if (c === "'") i = stringEnd(sql, i, false);
    else if ((c === 'E' || c === 'e') && next === "'") i = stringEnd(sql, i + 1, true);
    else if (c === '"') i = quoteEnd(sql, i, '"', false);
    else if (c === '$') i = dollarEnd(sql, i);
    else if (IDENT_START.test(c)) {
      i++;
      while (IDENT_CONT.test(sql.charAt(i))) i++;
      const word = sql.slice(token, i).toLowerCase();
      if (words.length < 4) words.push(word);
      if (parens === 0 && isRoutineHead(words)) {
        if (word === 'begin') atomic++;
        else if (word === 'case' && atomic > 0) atomic++;
        else if (word === 'end' && atomic > 0) atomic--;
      }
    } else {
      if (c === '(') parens++;
      else if (c === ')' && parens > 0) parens--;
      i++;
    }
    if (start < 0) start = token;
    end = i;
  }
  if (start >= 0) statements.push(sql.slice(start, end));
  return statements;
}

// psql's rule: only CREATE [OR REPLACE] FUNCTION|PROCEDURE can hold a
// BEGIN ATOMIC … END body, whose own `;` do not end the statement.
function isRoutineHead(words: string[]): boolean {
  const kind = words[1] === 'or' && words[2] === 'replace' ? words[3] : words[1];
  return words[0] === 'create' && (kind === 'function' || kind === 'procedure');
}

function lineEnd(s: string, i: number): number {
  let j = i;
  while (j < s.length && s.charAt(j) !== '\n' && s.charAt(j) !== '\r') j++;
  return j;
}

function blockCommentEnd(s: string, open: number): number {
  let depth = 0;
  let j = open;
  while (j < s.length) {
    const pair = s.slice(j, j + 2);
    if (pair === '/*') {
      depth++;
      j += 2;
    } else if (pair === '*/') {
      j += 2;
      if (--depth === 0) return j;
    } else {
      j++;
    }
  }
  throw unterminated(s, open, 'block comment');
}

// One past the quote that closes the one at `open`; a doubled quote is escaped.
function quoteEnd(s: string, open: number, quote: string, backslashEscapes: boolean): number {
  for (let j = open + 1; j < s.length; j++) {
    const c = s.charAt(j);
    if (backslashEscapes && c === '\\') {
      j++;
    } else if (c === quote) {
      if (s.charAt(j + 1) !== quote) return j + 1;
      j++;
    }
  }
  throw unterminated(s, open, quote === '"' ? 'quoted identifier' : 'string');
}

// One past a '…' literal, continuations included: 'a' and 'b' on the next line
// are one literal, and after E'a' the next-line part 'b\'' keeps the backslash
// escapes.
function stringEnd(s: string, open: number, backslashEscapes: boolean): number {
  let j = quoteEnd(s, open, "'", backslashEscapes);
  for (let k = continuation(s, j); k >= 0; k = continuation(s, j)) {
    j = quoteEnd(s, k, "'", backslashEscapes);
  }
  return j;
}

// The quote that continues the literal ending at j — whitespace (and `--`
// comments) holding at least one newline, then `'` — or -1.
function continuation(s: string, j: number): number {
  let newline = false;
  for (;;) {
    const c = s.charAt(j);
    if (c === '-' && s.charAt(j + 1) === '-') {
      j = lineEnd(s, j);
      continue;
    }
    if (!SPACE.test(c)) break;
    if (c === '\n' || c === '\r') newline = true;
    j++;
  }
  return newline && s.charAt(j) === "'" ? j : -1;
}

// One past a $tag$…$tag$ body opening at i, or past the lone `$` when it opens
// none (a `$1` parameter).
function dollarEnd(s: string, i: number): number {
  let j = i + 1;
  if (IDENT_START.test(s.charAt(j))) {
    j++;
    while (TAG_CONT.test(s.charAt(j))) j++;
  }
  if (s.charAt(j) !== '$') return i + 1;
  const tag = s.slice(i, j + 1);
  const close = s.indexOf(tag, j + 1);
  if (close < 0) throw unterminated(s, i, `${tag} body`);
  return close + tag.length;
}

function unterminated(s: string, at: number, what: string): Error {
  const line = s.slice(0, at).split('\n').length;
  return new Error(`sql-split: unterminated ${what} starting at line ${line}`);
}
