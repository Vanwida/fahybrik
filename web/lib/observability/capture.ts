// Observability helper — wraps Sentry.captureException with structured tags so
// route handlers can `try/catch + captureRouteError(err, { route })` without
// reaching for Sentry directly. If the DSN is unset, falls back to a single
// structured console.error line (the only allowed console.* in committed code,
// since it's the safety net for un-instrumented prod).
//
// Mirrors coach/lib/observability/capture.ts. Skips Sentry entirely when no DSN
// is configured — keeps the bundle inert in local dev.
//
// Usage in a route handler:
//   try { ... } catch (err) {
//     captureRouteError(err, { route: 'api/athlete/account', meta: { athlete_id } });
//     return jsonError('internal', 'Unexpected error', 500);
//   }

import * as Sentry from '@sentry/nextjs';

export type RouteErrorContext = {
  route: string;
  // Optional structured metadata. Avoid putting PII here — only ids, counts,
  // booleans, route params, etc. Goes to Sentry as tags + extras.
  meta?: Record<string, unknown>;
};

function dsnConfigured(): boolean {
  return Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
}

export function captureRouteError(err: unknown, context: RouteErrorContext): void {
  const { route, meta } = context;

  if (dsnConfigured()) {
    Sentry.withScope((scope) => {
      scope.setTag('route', route);
      if (meta) {
        for (const [k, v] of Object.entries(meta)) {
          // Tags must be string-coercible; everything else goes into extras.
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            scope.setTag(k, String(v));
          } else {
            scope.setExtra(k, v);
          }
        }
      }
      Sentry.captureException(err);
    });
    return;
  }

  // Fallback: structured stderr log so prod without Sentry still surfaces the
  // error in Vercel function logs.
  const payload = {
    level: 'error',
    route,
    meta: meta ?? null,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : null,
  };
  // eslint-disable-next-line no-console
  console.error('[capture]', JSON.stringify(payload));
}

/**
 * Tag the current Sentry scope with the authenticated athlete. No-op when
 * Sentry isn't configured. Call once an athlete session is verified.
 */
export function setAthleteSentryUser(params: {
  athlete_id: bigint;
  user_id: bigint;
}): void {
  if (!dsnConfigured()) return;
  Sentry.setUser({
    id: String(params.athlete_id),
    role: 'athlete',
    user_id: String(params.user_id),
  });
}
