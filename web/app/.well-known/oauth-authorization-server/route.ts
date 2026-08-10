// OAuth 2.0 Authorization Server Metadata (RFC 8414), proxied from Clerk.
//
// Strictly a COMPATIBILITY shim. A client that follows the current MCP spec
// reads /.well-known/oauth-protected-resource/api/mcp, finds Clerk named as the
// authorization server, and goes to Clerk directly — it never asks us this.
// Older clients (and mcp-remote, the fallback for debugging a client that will
// not connect) instead assume the resource server IS the authorization server
// and look here. Answering costs one document and buys those clients.
//
// PUBLIC BY DESIGN, and it must be: this is the document a client fetches BEFORE
// it has any token, so requiring auth here deadlocks the handshake. It exposes
// nothing but our Clerk instance's public endpoints, which are already public.
//
// No auth gate to remove: `/.well-known/*` contains a dot, so proxy.ts's matcher
// (`/((?!api|_next|_vercel|.*\..*).*)`) excludes it from the middleware entirely,
// and it is not in `isProtectedRoute` either.

import {
  authServerMetadataHandlerClerk,
  metadataCorsOptionsRequestHandler,
} from '@clerk/mcp-tools/next';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = authServerMetadataHandlerClerk();

// Browser-based MCP clients preflight this cross-origin.
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
