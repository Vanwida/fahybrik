import { expect, test } from '@playwright/test';

/**
 * E2E coverage for the public Dobles partner-redeem landing page
 * (app/[locale]/partner/redeem/page.tsx).
 *
 * State is derived server-side from the invitation row, so valid/expired cases
 * need real seeded tokens. Provide them via env when running:
 *   PARTNER_REDEEM_BASE_URL   (default http://localhost:3000)
 *   PARTNER_REDEEM_VALID_TOKEN    plaintext token of a pending, live invitation
 *   PARTNER_REDEEM_EXPIRED_TOKEN  plaintext token of an expired invitation
 *
 * The `invalid` case needs no seeding — any bogus token resolves to 'invalid'.
 * The valid/expired specs skip themselves when their token env var is absent so
 * the suite stays runnable without a seeded DB.
 *
 * NOTE: Playwright is not yet a dependency of this app; this spec is authored
 * ahead of the harness (the Next tsconfig excludes tests/e2e for that reason).
 */
const BASE_URL = process.env.PARTNER_REDEEM_BASE_URL ?? 'http://localhost:3000';
const VALID_TOKEN = process.env.PARTNER_REDEEM_VALID_TOKEN;
const EXPIRED_TOKEN = process.env.PARTNER_REDEEM_EXPIRED_TOKEN;

const OPEN_LINK = 'a[href^="fahybrid://partner/redeem"]';

function redeemUrl(token: string): string {
  const url = new URL('/es/partner/redeem', BASE_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

test.describe('partner redeem landing', () => {
  test('invalid token → "no válida", no open button', async ({ page }) => {
    await page.goto(redeemUrl('this-token-does-not-exist'));

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Invitación no válida');
    await expect(page.locator(OPEN_LINK)).toHaveCount(0);
  });

  test('valid token → Dobles headline + open-in-app button', async ({ page }) => {
    test.skip(!VALID_TOKEN, 'set PARTNER_REDEEM_VALID_TOKEN to run');
    await page.goto(redeemUrl(VALID_TOKEN as string));

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Dobles');

    const openButton = page.locator(OPEN_LINK);
    await expect(openButton).toBeVisible();
    await expect(openButton).toHaveAttribute(
      'href',
      new RegExp(`^fahybrid://partner/redeem\\?token=`),
    );
  });

  test('expired token → "caducada", no open button', async ({ page }) => {
    test.skip(!EXPIRED_TOKEN, 'set PARTNER_REDEEM_EXPIRED_TOKEN to run');
    await page.goto(redeemUrl(EXPIRED_TOKEN as string));

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Invitación caducada');
    await expect(page.locator(OPEN_LINK)).toHaveCount(0);
  });
});
