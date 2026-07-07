import { expect, test } from '@playwright/test';

/**
 * E2E for the coach Dobles SIMULATION editor cycle: open → edit → save → persist.
 * Component: web/components/v2/atletas/DoblesSimulationEditor.tsx, launched from the
 * "Reparto" button in DoublesPairsPanel on /atletas.
 *
 * The athlete-facing EFFECT (A sees the new share, B sees the flip) is proven
 * separately against the live API (scratchpad sim_effect_proof) because it needs
 * athlete bearers; this spec covers the coach UI path and that the change persists.
 *
 * Runs against a deployed demo with DEMO_ACCESS. Provide via env:
 *   SIM_EDITOR_BASE_URL   (default http://localhost:3000)
 *   SIM_EDITOR_DEMO_SLOT  demo coach slot that owns a dobles pair (default "1")
 * Self-skips when the demo pair isn't reachable, so the suite stays green without
 * a seeded/deployed target. Playwright is authored ahead of the harness (the Next
 * tsconfig excludes tests/e2e).
 */
const BASE_URL = process.env.SIM_EDITOR_BASE_URL ?? 'http://localhost:3000';
const DEMO_SLOT = Number(process.env.SIM_EDITOR_DEMO_SLOT ?? '1');

test.describe('coach dobles simulation editor', () => {
  test('open → change a station → save → reopen shows it persisted', async ({ page, request }) => {
    // 1. Demo-coach sign-in (sets the demo coach cookie on the context).
    const login = await request.post(`${BASE_URL}/api/demo/login`, { data: { slot: DEMO_SLOT } });
    test.skip(!login.ok(), 'demo login unavailable (DEMO_ACCESS off or not seeded)');
    // Carry the cookie into the page context.
    const cookies = await request.storageState();
    await page.context().addCookies(cookies.cookies);

    // 2. Go to the roster and open the first pair's "Reparto" editor.
    await page.goto(`${BASE_URL}/es/atletas`);
    const repartoBtn = page.getByRole('button', { name: 'Reparto' }).first();
    test.skip((await repartoBtn.count()) === 0, 'no dobles pair on this demo coach');
    await repartoBtn.click();

    const dialog = page.getByRole('dialog', { name: 'Reparto de la simulación' });
    await expect(dialog).toBeVisible();
    // Real names, not "A/B".
    await expect(dialog).not.toContainText(/\bAtleta A\b/);

    // 3. Force the first station to "Repartida" and move its share, then save.
    const firstStation = dialog.locator('[role="tablist"]').first();
    await firstStation.getByRole('tab', { name: 'Repartida' }).click();
    const slider = dialog.getByRole('slider').first();
    await slider.focus();
    // Nudge the share up a few 5% steps deterministically.
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    const savedValue = await slider.inputValue();

    await dialog.getByRole('button', { name: 'Guardar reparto' }).click();
    await expect(dialog).toBeHidden();

    // 4. Reopen → the first station is 'Repartida' at the saved share (persisted).
    await repartoBtn.click();
    const dialog2 = page.getByRole('dialog', { name: 'Reparto de la simulación' });
    await expect(dialog2).toBeVisible();
    const reloadedSlider = dialog2.getByRole('slider').first();
    await expect(reloadedSlider).toHaveValue(savedValue);
  });
});
