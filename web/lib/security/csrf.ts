// CSRF Origin/Referer check for cookie-authenticated coach mutations (A15).
//
// The coach session cookie is SameSite=Lax, which already blocks cross-site
// POST form submissions, but Lax still allows top-level GET navigations and
// has historical edge cases. This adds a second, independent defence: every
// state-changing coach request must carry an Origin (or, as a fallback,
// Referer) header whose origin matches our own app origin.
//
// Bearer-authenticated athlete endpoints do NOT need this — they don't use
// cookies, so they're immune to CSRF by construction. Only apply this to the
// cookie-based coach surface (/api/coach/*).

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Allowed app origins, derived from env. Includes localhost for dev. */
function allowedOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const raw of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (!raw) continue;
    try {
      origins.add(new URL(raw).origin);
    } catch {
      // Ignore malformed env values.
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
  }
  return origins;
}

function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Header-only CSRF check usable from contexts that have access to the request
 * headers but not the Request object (e.g. inside getCoachSession, which reads
 * cookies via next/headers). This intentionally does NOT branch on HTTP method
 * — instead it follows the rule:
 *
 *   - If an `Origin` header is present and does NOT match an allowed origin →
 *     reject. Browsers always attach Origin to cross-origin state-changing
 *     requests (POST/fetch), so this catches CSRF without blocking same-origin
 *     GET navigations (which either omit Origin or send a matching one).
 *   - If no Origin header → allow (same-origin GETs and many same-origin
 *     navigations omit it). Method-aware enforcement for missing-Origin
 *     mutations is handled by assertSameOrigin(req) where the Request is in
 *     scope.
 *
 * Returns true when the request may proceed.
 */
export function isAllowedOriginHeader(originHeader: string | null): boolean {
  if (!originHeader) return true;
  const allowed = allowedOrigins();
  if (allowed.size === 0) return true; // env misconfig — fail open
  return allowed.has(originHeader);
}

/**
 * Returns true when the request's Origin/Referer matches an allowed app
 * origin (or when the method is not state-changing, in which case the check
 * is a no-op). Returns false when a mutation arrives from a foreign origin or
 * with no usable Origin/Referer header at all.
 */
export function isSameOrigin(req: Request): boolean {
  if (!MUTATION_METHODS.has(req.method.toUpperCase())) return true;

  const allowed = allowedOrigins();
  // If we somehow have no configured origins, fail open rather than lock the
  // dashboard out — env misconfig shouldn't brick coach mutations.
  if (allowed.size === 0) return true;

  const origin = req.headers.get('origin');
  if (origin) {
    return allowed.has(origin);
  }
  // Some clients omit Origin; fall back to Referer's origin.
  const refererOrigin = originOf(req.headers.get('referer'));
  if (refererOrigin) {
    return allowed.has(refererOrigin);
  }
  // No Origin and no Referer on a mutation → reject (browsers send at least
  // one for same-origin fetch/XHR; absence is a red flag).
  return false;
}

/**
 * Guard for coach mutation routes. Returns a 403 Response when the request
 * fails the same-origin check, or null when it's safe to proceed:
 *
 *   const csrf = assertSameOrigin(req);
 *   if (csrf) return csrf;
 */
export function assertSameOrigin(req: Request): Response | null {
  if (isSameOrigin(req)) return null;
  return new Response(
    JSON.stringify({
      error: { code: 'forbidden_origin', message: 'Cross-origin request rejected' },
    }),
    { status: 403, headers: { 'content-type': 'application/json' } },
  );
}
