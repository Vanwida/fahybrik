import { describe, expect, test } from 'vitest';
import {
  MISSING_URL_MESSAGE,
  PREVIEW_QA_HOST,
  PROD_HOST,
  assertExplicitPreviewDatabaseUrl,
  hostOfDatabaseUrl,
} from '../../../infra/scripts/seed_demo_draft_week_guard';

const PREVIEW =
  'postgres://preview-user:preview-pass@ep-tiny-firefly-pooler.example.invalid/neondb?sslmode=require';
const PROD =
  'postgres://prod-user:s3cret-pass@ep-aged-base-pooler.example.invalid/neondb?sslmode=require';
const OTHER =
  'postgres://u:p@ep-other.example.invalid/neondb?sslmode=require';

function expectThrow(fn: () => void, contains: string, secrets: string[]): void {
  try {
    fn();
    throw new Error('expected assertExplicitPreviewDatabaseUrl to throw');
  } catch (err) {
    expect(err).toBeInstanceOf(Error);
    const text = err instanceof Error ? err.message : String(err);
    expect(text).toContain(contains);
    for (const secret of secrets) {
      expect(text).not.toContain(secret);
    }
  }
}

describe('hostOfDatabaseUrl', () => {
  test('reads the host after @', () => {
    expect(hostOfDatabaseUrl(PREVIEW)).toBe('ep-tiny-firefly-pooler.example.invalid');
  });
});

describe('assertExplicitPreviewDatabaseUrl', () => {
  test('refuses a missing URL without mentioning secrets', () => {
    expectThrow(() => assertExplicitPreviewDatabaseUrl(undefined), MISSING_URL_MESSAGE, [
      's3cret-pass',
      'preview-pass',
    ]);
    expectThrow(() => assertExplicitPreviewDatabaseUrl('   '), MISSING_URL_MESSAGE, [
      's3cret-pass',
    ]);
  });

  test('refuses Production even with SEED_DEMO_ALLOW_MAIN in the message contract', () => {
    expectThrow(() => assertExplicitPreviewDatabaseUrl(PROD), 'Production', [
      's3cret-pass',
      'prod-user',
    ]);
    expectThrow(() => assertExplicitPreviewDatabaseUrl(PROD), PROD_HOST, ['s3cret-pass']);
  });

  test('refuses an unknown Neon host without leaking the password', () => {
    expectThrow(() => assertExplicitPreviewDatabaseUrl(OTHER), 'not Preview QA', [
      'postgres://u:p@',
    ]);
  });

  test('accepts Preview QA including the pooler suffix', () => {
    expect(assertExplicitPreviewDatabaseUrl(PREVIEW)).toContain(PREVIEW_QA_HOST);
  });
});
