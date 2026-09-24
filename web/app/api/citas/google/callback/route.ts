// GET /api/citas/google/callback — the registered Google OAuth redirect URI.
//
// Validates the HMAC-signed `state` (CSRF) — which names the coach who started the
// connect — requires that coach to be the one signed in, exchanges the `code` for
// tokens, stores the refresh_token AS THAT COACH'S connection (0254) and renders a
// self-contained page. Handles ?error= (user denied consent) cleanly.
//
// Why re-check the session: without it, a coach could start the flow and send the
// consent link to someone else; that person's Google account would end up wired to
// the first coach's club. Never logs the code or tokens.

import { z } from 'zod';
import { exchangeCode, verifySignedState } from '@/lib/citas/google';
import { saveGoogleConnection } from '@/lib/citas/google-tokens';
import { getCoachSession } from '@/lib/auth/coach-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Google appends `code`+`state` on success, or `error` (e.g. access_denied) on denial.
const callbackQuery = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = callbackQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return page('error', 'Faltan parámetros en la respuesta de Google.');
  }

  const { code, state, error } = parsed.data;

  // User denied consent (or Google returned an error) — not a failure to shout about.
  if (error) {
    return page('error', 'No se concedió el acceso a Google. Puedes cerrar esta pestaña e intentarlo de nuevo.');
  }
  if (!code || !state) {
    return page('error', 'Respuesta incompleta de Google.');
  }
  const coachId = verifySignedState(state);
  if (coachId == null) {
    return page('error', 'La sesión de conexión caducó o no es válida. Vuelve a iniciar la conexión.');
  }
  const session = await getCoachSession();
  if (!session || BigInt(session.coach_id) !== coachId) {
    return page('error', 'Esta conexión la empezó otra cuenta. Entra con la tuya y vuelve a conectar Google.');
  }

  try {
    const { refresh_token } = await exchangeCode(code);
    await saveGoogleConnection(coachId, refresh_token);
  } catch {
    // Never surface token/exchange internals to the browser.
    return page('error', 'No pudimos completar la conexión con Google. Inténtalo de nuevo.');
  }

  return page('ok', 'Conectado ✓ — ya puedes cerrar esta pestaña.');
}

// ── On-brand, self-contained result page (FAHYBRID: black + brand orange) ──────────
const ACCENT = '#F06A2A';
const BG = '#0A0A0A';

function page(kind: 'ok' | 'error', message: string): Response {
  const title = kind === 'ok' ? 'Google conectado' : 'No conectado';
  const badge = kind === 'ok' ? ACCENT : '#8a8a8a';
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title} · FAHYBRID</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background: ${BG};
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .card {
    width: 100%; max-width: 420px; text-align: center;
    border: 1px solid rgba(255,255,255,0.08); border-radius: 16px;
    padding: 40px 28px; background: #121212;
  }
  .dot { width: 12px; height: 12px; border-radius: 50%; background: ${badge}; display: inline-block; margin-bottom: 20px; }
  h1 {
    font-size: 22px; line-height: 1.2; margin: 0 0 12px;
    font-style: italic; font-weight: 800; letter-spacing: -0.01em;
  }
  h1 .accent { color: ${ACCENT}; }
  p { margin: 0; color: rgba(255,255,255,0.7); font-size: 15px; line-height: 1.5; }
</style>
</head>
<body>
  <main class="card">
    <span class="dot" aria-hidden="true"></span>
    <h1><span class="accent">FAHYBRID</span></h1>
    <p>${message}</p>
  </main>
</body>
</html>`;
  return new Response(html, {
    status: kind === 'ok' ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
