/**
 * Custom-scheme deep links + App Store link for FAHYBRID invitations.
 *
 * These custom-scheme URLs are emitted by the invitation emails / APIs and must
 * be matched by the iOS URL handler. Keep them in sync with the app's
 * CFBundleURLSchemes (`fahybrid`) and the AASA paths in
 * web/public/.well-known/apple-app-site-association.
 *
 * The two schemes the app must handle:
 *   fahybrid://partner/redeem?token=…   (Dobles partner pairing)
 *   fahybrid://invite?token=…           (coach → athlete account claim)
 *
 * Single source of truth so the email, the JSON API and the landing pages
 * never drift on scheme spelling.
 */

/** Custom URL scheme registered by the iOS app. */
export const APP_SCHEME = 'fahybrid';

/**
 * App Store listing URL. Empty until the listing exists — landing pages render
 * a disabled placeholder button while this is empty, and a real link once set.
 */
export const APP_STORE_URL: string = ''; // TODO: pegar el link del listing cuando exista

/** Deep link that opens the Dobles partner-redeem flow in the app. */
export function partnerRedeemDeepLink(token: string): string {
  return `${APP_SCHEME}://partner/redeem?token=${encodeURIComponent(token)}`;
}

/** Deep link that opens the coach→athlete account-claim flow in the app. */
export function inviteDeepLink(token: string): string {
  return `${APP_SCHEME}://invite?token=${encodeURIComponent(token)}`;
}
