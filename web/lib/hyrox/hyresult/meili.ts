import 'server-only';

import { hyresultCandidateSchema, type HyresultCandidate } from '@fahybrid/shared/schema';
import {
  HYRESULT_MEILI_HOST,
  HYRESULT_MEILI_INDEX,
  HYRESULT_MEILI_SEARCH_KEY,
  HYRESULT_SEARCH_LIMIT,
} from './constants';
import { HyresultError } from './parse';

// =============================================================================
// hyresult.com athlete search (public Meilisearch index `entities_v4`).
// Returns athlete candidates for a name query; the caller (athlete) picks the
// right one (nation + race count + level disambiguate namesakes), then imports.
// =============================================================================

const SEARCH_TIMEOUT_MS = 8_000;

interface MeiliHit {
  id?: string;
  type?: string;
  name?: string;
  slug?: string;
  races?: string | number;
  nation?: string | null;
  level?: string | null;
}

/** Search hyresult athletes by name. Filters to type === 'athlete'. */
export async function searchAthletes(query: string): Promise<HyresultCandidate[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = `${HYRESULT_MEILI_HOST}/indexes/${HYRESULT_MEILI_INDEX}/search`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HYRESULT_MEILI_SEARCH_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q, limit: HYRESULT_SEARCH_LIMIT }),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch {
    throw new HyresultError('search_failed', 'No se pudo conectar con la búsqueda.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new HyresultError('search_failed', `Búsqueda no disponible (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as { hits?: MeiliHit[] };
  const hits = Array.isArray(data.hits) ? data.hits : [];
  const out: HyresultCandidate[] = [];
  for (const h of hits) {
    if (h.type !== 'athlete' || !h.slug || !h.id) continue;
    const parsed = hyresultCandidateSchema.safeParse({
      id: String(h.id),
      name: String(h.name ?? h.slug),
      slug: String(h.slug),
      races_count: Number.parseInt(String(h.races ?? '0'), 10) || 0,
      nation: h.nation ?? null,
      level: h.level ?? null,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
