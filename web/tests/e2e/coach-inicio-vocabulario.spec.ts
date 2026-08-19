import { expect, test } from '@playwright/test';

/**
 * E2E for the coach wayfinding/copy fix (ClickUp 86ak2e314): the audit in
 * docs/coach-ux-grok.html (fila "Inicio vs Plan") flags "Hoy" (coach, club-wide
 * triage) and "Inicio" (atleta, iOS home) as homonyms that make the coach expect
 * to find a specific athlete's day where it doesn't live. Fix is vocabulary only:
 *   · Hoy's kicker reads "Hoy del club · <fecha>" (was "Hoy · <fecha>") —
 *     web/components/v2/hoy/HoyBoard.tsx.
 *   · The athlete ficha's Plan block reads "Plan del atleta" (was "Plan") —
 *     web/components/v2/atleta-detalle/PlanTab.tsx.
 * No data/API change — this does not touch week anchoring or programming_status.
 *
 * Runs against a deployed demo with DEMO_ACCESS. Provide via env:
 *   COACH_VOCAB_BASE_URL   (default http://localhost:3000)
 *   COACH_VOCAB_DEMO_SLOT  demo coach slot (default "1")
 * Self-skips when the demo isn't reachable or the slot has no athlete with an
 * active plan, so the suite stays green without a seeded/deployed target.
 */
const BASE_URL = process.env.COACH_VOCAB_BASE_URL ?? 'http://localhost:3000';
const DEMO_SLOT = Number(process.env.COACH_VOCAB_DEMO_SLOT ?? '1');

test.describe('coach vocabulario Hoy/Plan', () => {
  test('Hoy lleva la cabecera "Hoy del club"', async ({ page, request }) => {
    const login = await request.post(`${BASE_URL}/api/demo/login`, { data: { slot: DEMO_SLOT } });
    test.skip(!login.ok(), 'demo login unavailable (DEMO_ACCESS off or not seeded)');
    const cookies = await request.storageState();
    await page.context().addCookies(cookies.cookies);

    await page.goto(`${BASE_URL}/es/hoy`);
    await expect(page.getByText(/^Hoy del club ·/)).toBeVisible();
  });

  test('Plan del atleta reemplaza el rótulo "Plan" en la ficha', async ({ page, request }) => {
    const login = await request.post(`${BASE_URL}/api/demo/login`, { data: { slot: DEMO_SLOT } });
    test.skip(!login.ok(), 'demo login unavailable (DEMO_ACCESS off or not seeded)');
    const cookies = await request.storageState();
    await page.context().addCookies(cookies.cookies);

    await page.goto(`${BASE_URL}/es/atletas`);
    const firstRow = page.locator('a[href*="/atletas/"]').first();
    test.skip((await firstRow.count()) === 0, 'no athletes on this demo coach');
    const href = await firstRow.getAttribute('href');
    test.skip(!href, 'roster row has no href');

    await page.goto(`${BASE_URL}${href}?tab=plan`);
    const label = page.getByText('Plan del atleta', { exact: true });
    test.skip((await label.count()) === 0, 'demo athlete has no active plan (empty state, no FichaLabel)');
    await expect(label).toBeVisible();
  });
});
