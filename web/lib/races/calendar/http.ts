// Race-catalog scraper — the ONE network boundary.
//
// Every adapter fetches through `fetchHtml`, never `fetch` directly. This:
//   * pins each read to the adapter's host allowlist (anti-SSRF) — both the
//     requested URL AND the final URL after redirects are checked, so an
//     off-host redirect can't smuggle us onto an internal address;
//   * sends a real browser User-Agent (the official sites server-render for
//     browsers and some 403 a bare fetch UA);
//   * bounds every request with an AbortController timeout so a hung source
//     can never stall the weekly cron.

// A desktop Chrome UA. The official calendars are server-rendered WordPress /
// Laravel and gate some bot UAs; a browser UA gets the full HTML.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 20_000;

export class CatalogFetchError extends Error {
  constructor(
    public code:
      | 'insecure_protocol'
      | 'host_not_allowed'
      | 'http_error'
      | 'timeout'
      | 'network',
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'CatalogFetchError';
  }
}

/**
 * True when `host` is the apex host or a subdomain of one of `allowedHosts`.
 * Exact match OR a dot-boundary suffix match — 'www.hyrox.com' is allowed by
 * 'hyrox.com', but 'evilhyrox.com' is NOT (no dot boundary).
 */
export function isHostAllowed(host: string, allowedHosts: string[]): boolean {
  const h = host.toLowerCase();
  return allowedHosts.some((allowed) => {
    const a = allowed.toLowerCase();
    return h === a || h.endsWith(`.${a}`);
  });
}

export interface FetchHtmlOptions {
  allowedHosts: string[];
  timeoutMs?: number;
}

/** Fetch a page as HTML text, enforced through the host allowlist + timeout. */
export async function fetchHtml(
  url: string,
  opts: FetchHtmlOptions,
): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CatalogFetchError('network', `Malformed URL: ${url}`);
  }

  // HTTPS only — no plaintext, no file:/data: schemes.
  if (parsed.protocol !== 'https:') {
    throw new CatalogFetchError(
      'insecure_protocol',
      `Refusing non-https URL: ${parsed.protocol}//${parsed.hostname}`,
    );
  }
  if (!isHostAllowed(parsed.hostname, opts.allowedHosts)) {
    throw new CatalogFetchError(
      'host_not_allowed',
      `Host ${parsed.hostname} not in allowlist [${opts.allowedHosts.join(', ')}]`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': BROWSER_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en;q=0.9,es;q=0.8',
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new CatalogFetchError('timeout', `Timed out fetching ${url}`);
    }
    throw new CatalogFetchError(
      'network',
      `Network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  // Re-check the FINAL host after redirects — defends against an allowed host
  // 30x-redirecting us onto an internal / disallowed address.
  try {
    const finalHost = new URL(res.url || url).hostname;
    if (!isHostAllowed(finalHost, opts.allowedHosts)) {
      throw new CatalogFetchError(
        'host_not_allowed',
        `Redirected to disallowed host ${finalHost}`,
      );
    }
  } catch (err) {
    if (err instanceof CatalogFetchError) throw err;
    // URL(res.url) parse failure — treat as network error.
    throw new CatalogFetchError('network', `Bad final URL after fetch: ${url}`);
  }

  if (!res.ok) {
    throw new CatalogFetchError(
      'http_error',
      `HTTP ${res.status} fetching ${url}`,
      res.status,
    );
  }

  return res.text();
}
