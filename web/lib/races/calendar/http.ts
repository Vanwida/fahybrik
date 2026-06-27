// Race-catalog scraper — the ONE network boundary.
//
// Every adapter fetches through `fetchHtml`, never `fetch` directly. This:
//   * pins each read to the adapter's host allowlist (anti-SSRF) — redirects are
//     followed MANUALLY and EVERY hop (the initial URL + each 30x target) is
//     re-validated for https + allowlisted host BEFORE the request fires, so an
//     off-host / non-https redirect is refused without ever being requested;
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

// Redirects we follow manually, re-validating each hop. The official calendars
// use 0–1 hops (apex→www, +trailing slash); a longer chain is a loop or an
// open-redirector and is refused.
const MAX_REDIRECTS = 5;

export class CatalogFetchError extends Error {
  constructor(
    public code:
      | 'insecure_protocol'
      | 'host_not_allowed'
      | 'too_many_redirects'
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

/**
 * Throw unless `parsed` is https AND its host is allowlisted. Run on the initial
 * URL AND every redirect target BEFORE that hop is requested — so an off-host or
 * non-https 30x is refused without ever firing a request at it (true anti-SSRF,
 * not merely withholding the body after the fact).
 */
function assertUrlAllowed(parsed: URL, allowedHosts: string[]): void {
  // HTTPS only — no plaintext, no file:/data: schemes.
  if (parsed.protocol !== 'https:') {
    throw new CatalogFetchError(
      'insecure_protocol',
      `Refusing non-https URL: ${parsed.protocol}//${parsed.hostname}`,
    );
  }
  if (!isHostAllowed(parsed.hostname, allowedHosts)) {
    throw new CatalogFetchError(
      'host_not_allowed',
      `Host ${parsed.hostname} not in allowlist [${allowedHosts.join(', ')}]`,
    );
  }
}

/** Fetch a page as HTML text, enforced through the host allowlist + timeout. */
export async function fetchHtml(
  url: string,
  opts: FetchHtmlOptions,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    let currentUrl = url;

    for (let hop = 0; ; hop++) {
      let parsed: URL;
      try {
        parsed = new URL(currentUrl);
      } catch {
        throw new CatalogFetchError('network', `Malformed URL: ${currentUrl}`);
      }

      // Validate protocol + host on EVERY hop before the request fires.
      assertUrlAllowed(parsed, opts.allowedHosts);

      let res: Response;
      try {
        res = await fetch(parsed.toString(), {
          method: 'GET',
          // Manual: we follow redirects ourselves so each hop is re-validated by
          // the loop. Node/undici returns the real 30x with a readable Location
          // header (NOT a browser's opaque redirect), which this relies on.
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'user-agent': BROWSER_UA,
            accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en;q=0.9,es;q=0.8',
          },
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new CatalogFetchError('timeout', `Timed out fetching ${currentUrl}`);
        }
        throw new CatalogFetchError(
          'network',
          `Network error fetching ${currentUrl}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Redirect: resolve the target and loop back so the allowlist + https
      // check at the top runs BEFORE we ever request it.
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) {
          throw new CatalogFetchError(
            'http_error',
            `Redirect (${res.status}) with no Location from ${currentUrl}`,
            res.status,
          );
        }
        if (hop >= MAX_REDIRECTS) {
          throw new CatalogFetchError(
            'too_many_redirects',
            `Exceeded ${MAX_REDIRECTS} redirects starting at ${url}`,
          );
        }
        try {
          currentUrl = new URL(location, parsed).toString();
        } catch {
          throw new CatalogFetchError(
            'network',
            `Bad redirect target "${location}" from ${currentUrl}`,
          );
        }
        continue;
      }

      if (!res.ok) {
        throw new CatalogFetchError(
          'http_error',
          `HTTP ${res.status} fetching ${currentUrl}`,
          res.status,
        );
      }

      return res.text();
    }
  } finally {
    clearTimeout(timeout);
  }
}
