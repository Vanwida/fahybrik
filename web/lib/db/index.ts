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

declare global {
  var __fahybrik_sql: Sql | undefined;
}

export const sql: Sql = globalThis.__fahybrik_sql ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__fahybrik_sql = sql;
}
