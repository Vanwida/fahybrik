// Single source of truth for deriving a person's display name.
//
// EVERY surface (dashboard header, admin, webhook sync, etc.) MUST resolve a
// human name through this module — never hand-pick a field or hardcode a name.
// The fallback chain is the market-standard one Clerk itself uses:
//
//   1. "<firstName> <lastName>" (each part optional, trimmed)
//   2. username
//   3. the local-part of the (primary) email, before the '@'
//
// If literally nothing is available, returns an empty string — callers decide
// how to render that (the UI never shows a fabricated name).

/** Minimal shape we read off a Clerk user (or any compatible object). */
export interface NameSource {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  /** Primary email address (already resolved to a single string). */
  email?: string | null;
}

function fromParts(first?: string | null, last?: string | null): string {
  return [first, last]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function emailLocalPart(email?: string | null): string {
  if (!email) return '';
  const at = email.indexOf('@');
  return (at > 0 ? email.slice(0, at) : email).trim();
}

/**
 * Derive a display name from a generic name source (Clerk user fields mapped to
 * snake_case, or a DB row exposing the same shape). Pure — no I/O.
 */
export function deriveDisplayName(source: NameSource): string {
  const full = fromParts(source.first_name, source.last_name);
  if (full) return full;

  const username = (source.username ?? '').trim();
  if (username) return username;

  return emailLocalPart(source.email);
}

/**
 * Shape of the Clerk user object delivered in webhook payloads / `auth()`
 * users. Clerk uses camelCase; this adapter maps it onto {@link NameSource}.
 */
export interface ClerkUserLike {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  // Clerk webhook payloads expose emails under email_addresses[].email_address
  // with a primary_email_address_id pointer. Callers that already resolved the
  // primary email can pass it via `primary_email`.
  primary_email?: string | null;
}

/**
 * Convenience: derive a display name directly from a Clerk-style user object
 * (already mapped to snake_case + a resolved primary_email).
 */
export function deriveDisplayNameFromClerk(user: ClerkUserLike): string {
  return deriveDisplayName({
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    email: user.primary_email,
  });
}
