// Tests for sql-split.ts. Run: `pnpm test` in infra, or
// `./node_modules/.bin/tsx scripts/sql-split.test.ts`. Exits non-zero on failure.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { splitSqlStatements as split } from './sql-split.ts';

test('plain statements', () => {
  assert.deepEqual(split('create table a (id int);\ncreate table b (id int);\n'), [
    'create table a (id int)',
    'create table b (id int)',
  ]);
});

test("semicolons inside '…' strings, with '' escapes", () => {
  assert.deepEqual(split("insert into t values ('a;b'); select 'it''s; fine';"), [
    "insert into t values ('a;b')",
    "select 'it''s; fine'",
  ]);
});

test("a backslash is literal in a plain '…' string", () => {
  assert.deepEqual(split(String.raw`select 'C:\'; select 2;`), [String.raw`select 'C:\'`, 'select 2']);
});

test("semicolons inside E'…' strings, with backslash escapes", () => {
  assert.deepEqual(split(String.raw`select E'it\'s; fine'; select e'\\'; select E'a''\'; b'; select 4;`), [
    String.raw`select E'it\'s; fine'`,
    String.raw`select e'\\'`,
    // '' inside E'…' is a quote too, and the string stays in E mode after it.
    String.raw`select E'a''\'; b'`,
    'select 4',
  ]);
});

test('E only prefixes a string at the start of a token', () => {
  // `else'\'` is the keyword else + the plain string '\', not an E'…' string.
  const sql = String.raw`select case when false then 'x' else'\' end; select 2;`;
  assert.deepEqual(split(sql), [String.raw`select case when false then 'x' else'\' end`, 'select 2']);
});

test("an E'…' literal continued on the next line keeps its backslash escapes", () => {
  const literal = String.raw`select E'a'` + '\n' + String.raw`'b\'; c'`;
  assert.deepEqual(split(`${literal}; select 2;`), [literal, 'select 2']);
});

test('semicolons inside "…" identifiers, with "" escapes', () => {
  assert.deepEqual(split('create table "a;b" ("c""; d" int); select 2;'), [
    'create table "a;b" ("c""; d" int)',
    'select 2',
  ]);
});

test('semicolons inside $$…$$ and $fn$…$fn$ bodies', () => {
  const fn = [
    'create function f() returns text language plpgsql as $fn$',
    'begin',
    '  return $$not; the end$$;',
    'end;',
    '$fn$',
  ].join('\n');
  assert.deepEqual(split(`select $$a;b$$; ${fn}; select 3;`), ['select $$a;b$$', fn, 'select 3']);
});

test('$1 is a parameter and a$b$ an identifier, not dollar quotes', () => {
  assert.deepEqual(split('prepare p(int) as select $1; select 1 as a$b$; select 1 as ñ$x$; select 4;'), [
    'prepare p(int) as select $1',
    'select 1 as a$b$',
    'select 1 as ñ$x$', // non-ASCII letters are identifier characters too
    'select 4',
  ]);
});

test('-- comments', () => {
  const sql = [
    "-- header; with a semicolon and an apostrophe: it's",
    'select 1; -- trailing; comment',
    '-- /* not a block comment',
    "select '--not a comment;'; -- done",
  ].join('\n');
  assert.deepEqual(split(sql), ['select 1', "select '--not a comment;'"]);
});

test('nested /* /* */ */ comments', () => {
  const sql = "/* outer /* inner; */ still; it's a comment */ select 1; select /* x; */ 2;";
  assert.deepEqual(split(sql), ['select 1', 'select /* x; */ 2']);
});

test('a DO $$ … $$ block', () => {
  const block = [
    'do $$',
    'begin',
    "  if not exists (select 1 from pg_class where relname = 'x') then",
    "    raise notice 'missing; skipping';",
    '  end if;',
    'end $$',
  ].join('\n');
  assert.deepEqual(split(`${block};\nselect 2;`), [block, 'select 2']);
});

test('a last statement with no semicolon', () => {
  assert.deepEqual(split('select 1;\nselect 2\n'), ['select 1', 'select 2']);
  assert.deepEqual(split('select 1;\nselect 2 -- no semicolon'), ['select 1', 'select 2']);
});

test('an input that is only comments, whitespace or empty statements', () => {
  assert.deepEqual(split('-- nothing; here\n/* nor; here */\n  \n'), []);
  assert.deepEqual(split(' ;; \n;'), []);
  assert.deepEqual(split(''), []);
});

test('parentheses and BEGIN ATOMIC bodies keep their semicolons', () => {
  const rule = 'create rule r as on insert to t do also (insert into a values (1); insert into b values (2))';
  const fn = [
    'create or replace function add(a int, b int) returns int language sql',
    'begin atomic',
    '  select case when a is null then 0 else a end + b;',
    'end',
  ].join('\n');
  // A transaction BEGIN … END is not a function body: each part is a statement.
  assert.deepEqual(split(`${rule};\n${fn};\nbegin; select 1; end;`), [rule, fn, 'begin', 'select 1', 'end']);
});

test('CRLF and lone CR line endings', () => {
  assert.deepEqual(split('select 1;\r\n-- c\r\nselect 2;\r\n'), ['select 1', 'select 2']);
  // Postgres ends a -- comment at \r as well as at \n.
  assert.deepEqual(split('select 1; -- c\rselect 2;'), ['select 1', 'select 2']);
});

test('a quote, body or comment left open throws before anything runs', () => {
  assert.throws(() => split("select 1; select 'oops;"), /unterminated string starting at line 1/);
  assert.throws(() => split('select 1;\nselect "oops'), /unterminated quoted identifier starting at line 2/);
  assert.throws(() => split('do $x$ begin; end $$;'), /unterminated \$x\$ body/);
  assert.throws(() => split('/* a /* b */'), /unterminated block comment/);
});

test('0051_attention_perf_indexes splits into its three CONCURRENTLY statements', () => {
  const file = new URL('../migrations/0051_attention_perf_indexes.sql', import.meta.url);
  const names = split(readFileSync(file, 'utf8')).map(
    (stmt) => /^create index concurrently if not exists (\w+)\s/.exec(stmt)?.[1],
  );
  assert.deepEqual(names, [
    'workout_assignments_athlete_date_status_idx',
    'races_target_upcoming_idx',
    'chat_messages_unread_idx',
  ]);
});
