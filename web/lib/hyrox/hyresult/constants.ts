// hyresult.com client constants. The Meilisearch host + index + search key are
// PUBLIC client-side values (shipped in hyresult's own browser bundle), not
// secrets — kept here, DRY, in one place. All four are env-overridable with a
// working default so a deploy can repoint them without a code change.

export const HYRESULT_HOST = process.env.HYRESULT_HOST ?? 'www.hyresult.com';

export const HYRESULT_MEILI_HOST =
  process.env.HYRESULT_MEILI_HOST ?? 'https://ms-55058449beb8-8735.fra.meilisearch.io';

export const HYRESULT_MEILI_INDEX = process.env.HYRESULT_MEILI_INDEX ?? 'entities_v4';

// Public Meilisearch SEARCH key (read-only, client-side). Not a secret.
export const HYRESULT_MEILI_SEARCH_KEY =
  process.env.HYRESULT_MEILI_SEARCH_KEY ??
  'db2c723fa9632ad432529d3bf0d42f2a654828ecaec276addafa723fb88ded12';

// Max candidates per search.
export const HYRESULT_SEARCH_LIMIT = 20;

/** Athlete profile page (carries the full race history in the RSC stream). */
export function hyresultAthleteUrl(slug: string): string {
  return `https://${HYRESULT_HOST}/athlete/${encodeURIComponent(slug)}`;
}

/** Canonical per-race result page (stored as source_url for traceability). */
export function hyresultResultUrl(idp: string): string {
  return `https://${HYRESULT_HOST}/result/${encodeURIComponent(idp)}`;
}
