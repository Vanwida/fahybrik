/**
 * Vitest setup: provide a dummy DATABASE_URL so module-level `sql = createClient()`
 * doesn't throw on import. Unit tests that import `@/lib/db` should NOT actually
 * issue queries — they should mock the client via {@link createFakeSql}. The
 * postgres client is lazy about connecting, so an unused dummy URL is safe.
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://test-user:test-pass@127.0.0.1:5432/test-db';
}
