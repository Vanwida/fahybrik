import postgres from 'postgres';

const pgTypes = {
  bigint: postgres.BigInt,
} as const;

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return postgres(url, {
    ssl: 'require',
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    types: pgTypes,
  });
}

export type Sql = ReturnType<typeof createClient>;

/**
 * The client handed to a `sql.begin(async (tx) => …)` callback. It exposes the
 * tagged-template query API but NOT the connection-lifecycle methods (END,
 * CLOSE, …). Helpers that must run inside an existing transaction should accept
 * `Sql | TransactionClient` so callers can pass either the pool or a `tx`.
 */
export type TransactionClient = postgres.TransactionSql<{ readonly bigint: bigint }>;

export { withOwnOrAmbientTx } from '@fahybrid/shared/domain/sql-tx';

declare global {
  var __fahybrik_sql: Sql | undefined;
}

export const sql: Sql = globalThis.__fahybrik_sql ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__fahybrik_sql = sql;
}
