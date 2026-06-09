// Sentry client-side init.
// Skips gracefully when SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN) is empty,
// so local dev incurs zero overhead.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN ?? '';

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_ENV ?? process.env.NODE_ENV,
  });
}
