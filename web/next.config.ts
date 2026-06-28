import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// M11: baseline security headers applied to every route. We deliberately do
// NOT set a Content-Security-Policy here (no CSP exists elsewhere in the app),
// so there's nothing to duplicate — CSP is tracked separately.
//   * HSTS: 2 years + subdomains + preload. Only meaningful over HTTPS; on
//     plain-HTTP localhost browsers ignore it, so it's safe to always emit.
//   * nosniff: stop MIME-type sniffing of responses.
//   * Referrer-Policy: don't leak full URLs cross-origin.
const HSTS_MAX_AGE_SECONDS = 63_072_000; // 2 years
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains; preload`,
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@fahybrid/shared"],
  // Coach avatars are stored on Vercel Blob; allow next/image to optimize them.
  // Public blob URLs are https://<storeId>.public.blob.vercel-storage.com/...
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  // pdfjs-dist + mammoth ship Node-only assets (fonts/cmaps, fs access) — keep
  // them external so the bundler doesn't try to inline them.
  serverExternalPackages: ["pdfjs-dist", "mammoth"],
  async headers() {
    return [
      {
        // Apply to all routes.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  // localePrefix is 'always', so the public legal pages live at /es/privacy and
  // /es/terms. The iOS app hardcodes the bare URLs (/privacy, /terms) for the
  // App Store, so redirect them to the default-locale variants. Permanent so
  // clients and crawlers cache the canonical localized URL.
  async redirects() {
    return [
      { source: "/privacy", destination: "/es/privacy", permanent: true },
      { source: "/terms", destination: "/es/terms", permanent: true },
    ];
  },
};

const sentryEnabled = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

// Wrap with next-intl always; layer Sentry only when source maps upload is configured.
const intlConfig = withNextIntl(nextConfig);

export default sentryEnabled
  ? withSentryConfig(intlConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      disableLogger: true,
    })
  : intlConfig;
