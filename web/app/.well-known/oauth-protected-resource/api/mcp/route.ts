// OAuth 2.0 Protected Resource Metadata (RFC 9728) for the MCP server.
//
// This is the document that starts the whole handshake. An unauthenticated call
// to /api/mcp comes back 401 with `WWW-Authenticate: … resource_metadata="<this
// URL>"`; the client fetches it, learns that Clerk is the authorization server,
// registers itself there and comes back with a token.
//
// THE PATH IS PART OF THE CONTRACT. RFC 9728 locates a resource's metadata at
// /.well-known/oauth-protected-resource + the resource's own path, so a resource
// at /api/mcp is described here. The folder nesting is mirroring that path, not
// decoration (see lib/mcp/paths.ts).
//
// WHY THIS IS HAND-ROLLED instead of `protectedResourceHandlerClerk()`.
// That helper — and Clerk's plain `protectedResourceHandler` too — hardcodes
// `resourceUrl: new URL(req.url).origin`. Both are written for a server mounted
// at the domain ROOT: they would publish `"resource": "https://app.fahybrid.com"`
// from a document served at …/api/mcp. Two things break. A client that checks the
// resource identifier against the server it is talking to (the MCP spec says it
// MUST) sees a mismatch and gives up; and the token gets issued for the wrong
// audience the day anything starts enforcing RFC 8707. Reading `req.url` also
// misses Vercel's proxy headers, so the origin can come back internal.
//
// So: Clerk's generator keeps producing the Clerk-specific half (its FAPI is
// derived from the publishable key, along with the introspection and JWKS
// endpoints), and we supply the resource identifier it should have been given.
//
// PUBLIC BY DESIGN: fetched before any token exists, so gating it would deadlock
// the handshake. It is excluded from the middleware by the dot in `.well-known`
// (see proxy.ts's matcher) and absent from `isProtectedRoute`. It exposes only
// our Clerk instance's already-public endpoints.

import {
  corsHeaders,
  generateClerkProtectedResourceMetadata,
} from '@clerk/mcp-tools/server';
import { metadataCorsOptionsRequestHandler } from '@clerk/mcp-tools/next';
import { getPublicOrigin } from 'mcp-handler';
import { MCP_RESOURCE_PATH } from '@/lib/mcp/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: Request): Response {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    // Misconfiguration, not a client error: without the key we cannot name the
    // authorization server, and a metadata document that names the wrong one is
    // worse than none at all.
    return Response.json(
      {
        error: 'server_error',
        error_description: 'OAuth metadata unavailable: Clerk is not configured.',
      },
      { status: 500, headers: corsHeaders },
    );
  }

  // `getPublicOrigin` reads X-Forwarded-Host / X-Forwarded-Proto / Forwarded
  // before falling back to req.url, so this is the origin the client actually
  // dialled and not whatever Vercel's internal one happens to be.
  const metadata = generateClerkProtectedResourceMetadata({
    publishableKey,
    resourceUrl: `${getPublicOrigin(req)}${MCP_RESOURCE_PATH}`,
    // Advertised so a client knows a plain bearer token in the header is all we take.
    properties: { bearer_methods_supported: ['header'] },
  });

  return Response.json(metadata, {
    headers: { ...corsHeaders, 'Cache-Control': 'max-age=3600' },
  });
}

// Browser-based MCP clients preflight this cross-origin.
export const OPTIONS = metadataCorsOptionsRequestHandler();
