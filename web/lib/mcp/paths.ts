// The three paths of the OAuth handshake, derived from one another.
//
// They have to agree or the connector cannot be connected, and the failure is
// SILENT: the server keeps answering 401 with a pointer, the client keeps
// fetching a document that describes a different resource than the one it is
// talking to, and strict clients (Claude among them) just refuse without saying
// why. That is the failure mode the phase-1 plan flags as its main risk, so the
// three strings live here and are computed, never retyped.
//
// One thing this file CANNOT enforce: the folder that serves the metadata has to
// mirror `MCP_RESOURCE_METADATA_PATH` on disk
// (app/.well-known/oauth-protected-resource/api/mcp/route.ts). tests/mcp/well-known.test.ts
// imports that exact path, so moving the folder without updating this breaks the
// suite instead of production.

/** mcp-handler's `basePath`; it derives the transport endpoints under it. */
export const MCP_BASE_PATH = '/api';

/**
 * The protected resource itself: Streamable HTTP, the transport every client we
 * target speaks. This is the RFC 8707 resource identifier a token is issued for.
 */
export const MCP_RESOURCE_PATH = `${MCP_BASE_PATH}/mcp`;

/**
 * Where the resource's metadata lives. RFC 9728 §3.1: the well-known prefix
 * followed by the resource's own path — NOT the bare well-known path, which
 * would describe a resource mounted at the domain root.
 */
export const MCP_RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`;
