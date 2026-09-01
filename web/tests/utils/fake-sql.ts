/**
 * Tiny fake of the `postgres` tagged-template client used by `lib/db`.
 *
 * Supports:
 *  - Tag-call form: `sql<T[]>\`select … ${value}\``
 *  - `.begin(fn)` — runs fn(self) within "transaction" (no rollback semantics)
 *  - `.unsafe(rawString)` — returns a marker the test fake inlines when
 *    reassembling SQL text
 *  - `.json(value)` — como el driver real: el valor se liga como parámetro
 *    jsonb; aquí llega al handler como el objeto original, que es lo que los
 *    tests asertan (ver docs/DECISIONS.md 2026-08-09, payload como OBJETO)
 *
 * The caller passes a `handler(sqlText, values)` that returns rows. Sql text
 * is reassembled by concatenating template strings and replacing parameter
 * holes with `$N` placeholders (matching real driver behaviour). The values
 * array contains the original interpolated arguments in order. `.unsafe(...)`
 * fragments are inlined into the SQL text rather than parameterised.
 */

import type { Sql } from '@/lib/db';

export type SqlHandler = (sqlText: string, values: unknown[]) => unknown[];

interface UnsafeMarker {
  __unsafe: true;
  value: string;
}

interface JsonMarker {
  __json: true;
  value: unknown;
}

function isJsonMarker(x: unknown): x is JsonMarker {
  return typeof x === 'object' && x != null && (x as { __json?: boolean }).__json === true;
}

function isUnsafeMarker(x: unknown): x is UnsafeMarker {
  return (
    typeof x === 'object' &&
    x != null &&
    (x as { __unsafe?: boolean }).__unsafe === true &&
    typeof (x as { value?: unknown }).value === 'string'
  );
}

export function createFakeSql(handler: SqlHandler): Sql {
  function tag(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]> {
    const parts: string[] = [];
    const collected: unknown[] = [];
    let paramIdx = 0;
    for (let i = 0; i < strings.length; i++) {
      parts.push(strings[i] ?? '');
      if (i < values.length) {
        const v = values[i];
        if (isUnsafeMarker(v)) {
          parts.push(v.value);
        } else if (isJsonMarker(v)) {
          paramIdx += 1;
          parts.push(`$${paramIdx}`);
          collected.push(v.value);
        } else {
          paramIdx += 1;
          parts.push(`$${paramIdx}`);
          collected.push(v);
        }
      }
    }
    const sqlText = parts.join('').replace(/\s+/g, ' ').trim().toLowerCase();
    return Promise.resolve(handler(sqlText, collected));
  }

  // Attach .begin and .unsafe to the tag function.
  (tag as unknown as { begin: (fn: (tx: Sql) => unknown) => Promise<unknown> }).begin = async (
    fn: (tx: Sql) => unknown,
  ) => fn(tag as unknown as Sql);
  (tag as unknown as { unsafe: (s: string) => UnsafeMarker }).unsafe = (s: string) => ({
    __unsafe: true,
    value: s,
  });
  (tag as unknown as { end: () => Promise<void> }).end = async () => undefined;
  (tag as unknown as { json: (v: unknown) => JsonMarker }).json = (v: unknown) => ({
    __json: true,
    value: v,
  });

  return tag as unknown as Sql;
}
