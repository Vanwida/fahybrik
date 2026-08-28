/**
 * Lectura de una columna que una migración posterior puede no haber
 * corrido todavía (42703). `to_jsonb(alias)` solo serializa columnas
 * que EXISTEN en la fila; la clave ausente queda NULL. No es un
 * fallback que invente el resto del plan.
 *
 * Identifiers literales, validados. Nunca interpolar input de usuario.
 */

import type { Sql } from '@/lib/db';

const IDENT = /^[a-z_][a-z0-9_]*$/;

export function assertSqlIdent(name: string): string {
  if (!IDENT.test(name)) {
    throw new Error(`invalid SQL identifier: ${name}`);
  }
  return name;
}

export function optionalTextSql(alias: string, column: string): string {
  const a = assertSqlIdent(alias);
  const c = assertSqlIdent(column);
  return `(to_jsonb(${a})->>'${c}')`;
}

export function optionalBooleanSql(
  alias: string,
  column: string,
  whenAbsent: boolean,
): string {
  const a = assertSqlIdent(alias);
  const c = assertSqlIdent(column);
  return `coalesce((to_jsonb(${a})->>'${c}')::boolean, ${whenAbsent})`;
}

type UnsafeClient = Pick<Sql, 'unsafe'>;

/** `(to_jsonb(alias)->>'col') as col` — texto; ausente = NULL. */
export function optionalTextColumn(
  client: UnsafeClient,
  alias: string,
  column: string,
): ReturnType<Sql['unsafe']> {
  const c = assertSqlIdent(column);
  return client.unsafe(`${optionalTextSql(alias, column)} as ${c}`);
}

/** `coalesce((to_jsonb(alias)->>'col')::boolean, whenAbsent) as col`. */
export function optionalBooleanColumn(
  client: UnsafeClient,
  alias: string,
  column: string,
  whenAbsent: boolean,
): ReturnType<Sql['unsafe']> {
  const c = assertSqlIdent(column);
  return client.unsafe(`${optionalBooleanSql(alias, column, whenAbsent)} as ${c}`);
}
