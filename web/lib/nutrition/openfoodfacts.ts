// Open Food Facts lookup — public, key-less API. We proxy server-side so the
// app doesn't hit OFF directly (CORS, rate-limit, and we control the timeout).
//
// We DO NOT persist anything here: the route returns mapped macros for the
// client to prefill, then the athlete POSTs an entry (source='barcode').
//
// Macros are per 100g (OFF's `_100g` nutriments). When OFF lacks the product or
// is unreachable, we return { found: false } — never throw a 500 at the route.

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_SEARCH_BASE = 'https://world.openfoodfacts.org/cgi/search.pl';
const OFF_TIMEOUT_MS = 6_000;
const OFF_SEARCH_PAGE_SIZE = 25;

// Open Food Facts BLOCKS/throttles requests from datacenter IPs (Vercel runs on
// AWS) unless the User-Agent identifies the app + a contact, per their policy:
// https://openfoodfacts.github.io/openfoodfacts-server/api/#authentication
// A generic UA gets a Cloudflare challenge (HTML, not JSON) → parse fail →
// found:false. This descriptive UA is required for server-side use.
const OFF_USER_AGENT = 'FAHYBRIK/1.0 (https://fahybrik.com; nutrition@fahybrik.com)';

export interface BarcodeLookupResult {
  found: boolean;
  name?: string;
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  per?: '100g';
  barcode?: string;
  raw?: unknown;
}

interface OffNutriments {
  'energy-kcal_100g'?: number | string;
  proteins_100g?: number | string;
  carbohydrates_100g?: number | string;
  fat_100g?: number | string;
}

interface OffResponse {
  status?: number; // 1 = found, 0 = not found
  product?: {
    product_name?: string;
    product_name_en?: string;
    nutriments?: OffNutriments;
  };
}

function toNum(v: number | string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Maps a raw OFF API payload to our flat per-100g shape. */
export function mapOffProduct(code: string, body: OffResponse): BarcodeLookupResult {
  const product = body.product;
  if (body.status !== 1 || !product) return { found: false };

  const n = product.nutriments ?? {};
  const name = product.product_name?.trim() || product.product_name_en?.trim();

  // Treat as "not found" when there's neither a usable name nor any macro — an
  // empty OFF shell isn't useful to prefill.
  const kcal = toNum(n['energy-kcal_100g']);
  const protein_g = toNum(n.proteins_100g);
  const carbs_g = toNum(n.carbohydrates_100g);
  const fat_g = toNum(n.fat_100g);
  if (!name && kcal == null && protein_g == null && carbs_g == null && fat_g == null) {
    return { found: false };
  }

  return {
    found: true,
    name: name || `Product ${code}`,
    kcal: kcal ?? 0,
    protein_g: protein_g ?? 0,
    carbs_g: carbs_g ?? 0,
    fat_g: fat_g ?? 0,
    per: '100g',
    barcode: code,
    raw: body,
  };
}

/**
 * Fetches + maps a product by barcode. Network/timeout/parse failures resolve
 * to { found:false } (logged) — the proxy is graceful by contract.
 *
 * `fetchImpl` is injectable for tests (defaults to global fetch).
 */
export async function lookupBarcode(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BarcodeLookupResult> {
  try {
    const res = await fetchImpl(`${OFF_BASE}/${encodeURIComponent(code)}.json`, {
      signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
      headers: { 'user-agent': OFF_USER_AGENT, accept: 'application/json' },
    });
    if (!res.ok) {
      console.warn(`[nutrition/barcode] OFF responded ${res.status} for ${code}`);
      return { found: false };
    }
    const body = (await res.json()) as OffResponse;
    return mapOffProduct(code, body);
  } catch (err) {
    console.warn('[nutrition/barcode] OFF lookup failed', err);
    return { found: false };
  }
}

// ─── Search by name ──────────────────────────────────────────────────────────
//
// Same contract philosophy as the barcode lookup: per-100g macros for the
// client to prefill, graceful on outage (→ { results: [] }, never a throw).

export interface FoodSearchResult {
  name: string;
  brand?: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  per: '100g';
  barcode?: string;
}

interface OffSearchProduct {
  product_name?: string;
  brands?: string;
  code?: string;
  nutriments?: OffNutriments;
}

interface OffSearchResponse {
  products?: OffSearchProduct[];
}

/**
 * Maps a raw OFF search payload to our flat per-100g results. Drops products
 * with neither a usable name nor a kcal value (an empty shell can't prefill a
 * form), and caps at OFF_SEARCH_PAGE_SIZE.
 */
export function mapOffSearch(body: OffSearchResponse): { results: FoodSearchResult[] } {
  const products = Array.isArray(body.products) ? body.products : [];
  const results: FoodSearchResult[] = [];

  for (const p of products) {
    const name = p.product_name?.trim();
    const n = p.nutriments ?? {};
    const kcal = toNum(n['energy-kcal_100g']);
    // Require a real name AND a kcal value — these are the two fields the
    // search list renders and the form needs.
    if (!name || kcal == null) continue;

    const brand = p.brands?.split(',')[0]?.trim() || undefined;
    const code = p.code?.trim();
    results.push({
      name,
      brand,
      kcal,
      protein_g: toNum(n.proteins_100g) ?? 0,
      carbs_g: toNum(n.carbohydrates_100g) ?? 0,
      fat_g: toNum(n.fat_100g) ?? 0,
      per: '100g',
      barcode: code && /^\d{6,14}$/.test(code) ? code : undefined,
    });
    if (results.length >= OFF_SEARCH_PAGE_SIZE) break;
  }

  return { results };
}

/**
 * Searches OFF by free text. Network/timeout/parse failures resolve to
 * { results: [] } (logged) — the proxy is graceful by contract.
 *
 * `fetchImpl` is injectable for tests (defaults to global fetch).
 */
export async function searchFoods(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ results: FoodSearchResult[] }> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(OFF_SEARCH_PAGE_SIZE),
    fields: 'product_name,brands,nutriments,code',
  });
  try {
    const res = await fetchImpl(`${OFF_SEARCH_BASE}?${params.toString()}`, {
      signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
      headers: { 'user-agent': OFF_USER_AGENT, accept: 'application/json' },
    });
    if (!res.ok) {
      console.warn(`[nutrition/search] OFF responded ${res.status} for "${query}"`);
      return { results: [] };
    }
    const body = (await res.json()) as OffSearchResponse;
    return mapOffSearch(body);
  } catch (err) {
    console.warn('[nutrition/search] OFF search failed', err);
    return { results: [] };
  }
}
