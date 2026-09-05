// PKCE S256 for COROS MCP OAuth. MCP's authorization server advertises
// code_challenge_methods_supported: ["S256"] only.

import { createHash, randomBytes } from 'node:crypto';

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
