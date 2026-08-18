/**
 * Fail-closed host guard for seed_demo_draft_week.
 *
 * Pure: no I/O, no .env.local fallback. DATABASE_URL must already be set to
 * Preview QA. Production is refused with no override. Hostnames in errors are
 * the endpoint id (public), never user/password.
 */

export const PREVIEW_QA_HOST = 'ep-tiny-firefly';
export const PROD_HOST = 'ep-aged-base';
export const PREVIEW_QA_BRANCH = 'preview-qa-2026-08-15';

export const MISSING_URL_MESSAGE =
  'seed_demo_draft_week: DATABASE_URL is not set. Pass the Preview Neon URL inline. ' +
  'Refusing to fall back to .env.local (that file is production).';

export function hostOfDatabaseUrl(url: string): string {
  return url.match(/@([^/?]+)/)?.[1] ?? '';
}

export function assertExplicitPreviewDatabaseUrl(url: string | undefined): string {
  if (!url?.trim()) {
    throw new Error(MISSING_URL_MESSAGE);
  }
  const host = hostOfDatabaseUrl(url);
  if (host.includes(PROD_HOST)) {
    throw new Error(
      `seed_demo_draft_week: DATABASE_URL host is Production (${host}). Refusing. ` +
        `This seed is Preview-only (branch ${PREVIEW_QA_BRANCH} / ${PREVIEW_QA_HOST}).`,
    );
  }
  if (!host.includes(PREVIEW_QA_HOST)) {
    throw new Error(
      `seed_demo_draft_week: DATABASE_URL host "${host || '(unknown)'}" is not Preview QA ` +
        `(${PREVIEW_QA_HOST} / ${PREVIEW_QA_BRANCH}). Point it at that branch.`,
    );
  }
  return host;
}
