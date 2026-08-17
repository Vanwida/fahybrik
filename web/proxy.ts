import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { DEMO_COACH_COOKIE, isDemoAccessEnabled } from './lib/auth/demo-access';

// Composición Clerk + next-intl (Fase 2 — gates activos).
//
// Clerk envuelve el middleware de i18n: corre en las rutas de página (para
// adjuntar el contexto de auth que necesitan <SignIn/> y `auth()`) y en las
// rutas de API de coach/admin (para protegerlas server-side). Delega el ruteo
// de locale a next-intl SOLO en las páginas localizadas.
//
// Reglas de scope (ver matcher abajo):
//   - PROTEGIDO (requiere login Clerk): dashboard coach `(app)`, admin
//     `(admin)`, y `/api/coach/*` + `/api/admin/*`.
//   - NUNCA protegido / fuera de Clerk: `/api/athlete/*` (iOS usa Bearer propio,
//     ver lib/auth/athlete-session.ts), `/api/webhooks/*` (Clerk/Garmin llaman
//     server-to-server), `/api/auth/*` (callbacks de auth legacy), `/sign-in`,
//     `/sign-up`, y las páginas legales/públicas.
//   - i18n: corre en páginas localizadas; NO en api / sign-in / sign-up / auth.

const handleI18nRouting = createMiddleware(routing);

// Rutas de auth de Clerk: top-level, NO se localizan. Clerk sí debe correr en
// ellas (las sirve), pero no deben pasar por el ruteo de locale de next-intl.
const NON_LOCALIZED_PREFIXES = ['/sign-in', '/sign-up'];

// Superficies que exigen sesión Clerk. Páginas → redirect a /sign-in; API →
// 404/401 vía auth.protect(). El grupo de rutas `(app)`/`(admin)` no aparece en
// la URL, así que matcheamos los paths reales del dashboard y del admin.
const isProtectedRoute = createRouteMatcher([
  // Dashboard coach (grupo (app)): todo bajo /:locale excepto las páginas
  // públicas del grupo (public) y las superficies de auth. Para no enumerar
  // cada sección, protegemos las APIs explícitas y las páginas del dashboard
  // por sus segmentos reales.
  '/:locale/atletas/:path*',
  // /biblioteca y /programacion ya no existen como páginas: next.config los
  // redirige (antes del middleware) a /programar.
  '/:locale/programar/:path*',
  '/:locale/review/:path*',
  '/:locale/ajustes/:path*',
  '/:locale/metodologia',
  '/:locale/metodologia/:path*',
  '/:locale/admin/:path*',
  // El doble (grupo (design)): herramienta interna de UX. El middleware exige
  // login Clerk; su layout estrecha después a ADMIN-ONLY (getAdminSession) —
  // un coach sin rol admin rebota a /sign-in.
  '/:locale/design/:path*',
  // Home del dashboard coach. La movimos a /:locale/hoy: la raíz /:locale es ahora
  // la landing pública de marketing (grupo (marketing)) y NO se protege. Solo /hoy
  // y las secciones del dashboard exigen login Clerk.
  '/:locale/hoy',
  // APIs de coach/admin.
  '/api/coach/:path*',
  '/api/admin/:path*',
]);

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  // ⚠️ DEV-ONLY LOGIN BYPASS (solo `next dev` local). NODE_ENV es 'production'
  // en TODO build/deploy de Vercel (incluidos previews), así que esto NUNCA se
  // activa fuera de un `next dev` en la máquina del dev. Salta el gate de Clerk
  // para entrar al dashboard sin login; getCoachSession() inyecta el coach de
  // dev (pareja de este bypass). QUITAR cuando el login de Clerk funcione local.
  const devAuthBypass = process.env.NODE_ENV === 'development';

  // ⚠️ GATED DEMO BYPASS (DEMO_ACCESS=1 only). When the demo flag is on AND the
  // request carries the demo coach cookie, skip the Clerk gate so the demo
  // coach (no Clerk session) can reach the protected dashboard. The cookie is
  // STILL validated downstream by getCoachSession (verifySession + demo-email
  // allowlist); an invalid cookie just makes the (v2) layout redirect to
  // /sign-in. Production never sets DEMO_ACCESS, so this is dead there. Never
  // weakens the real Clerk path (only adds a second, flag-gated way in).
  const demoBypass =
    isDemoAccessEnabled() && req.cookies.get(DEMO_COACH_COOKIE) !== undefined;
  const skipAuthGate = devAuthBypass || demoBypass;

  // API: Clerk corre en TODAS las APIs (para que `auth()` tenga contexto allí
  // donde se llama getCoachSession/getAdminSession — p.ej. /api/exercises,
  // /api/templates, /api/notifications…), pero SOLO protege coach/admin. El
  // resto (athlete con Bearer propio, webhooks server-to-server, auth legacy)
  // recibe contexto pero NO se protege → su lógica propia decide. Nunca i18n.
  if (pathname.startsWith('/api/')) {
    if (!skipAuthGate && isProtectedRoute(req)) {
      await auth.protect();
    }
    return; // Sin i18n para APIs.
  }

  // Páginas de auth Clerk: contexto adjunto, sin i18n.
  if (NON_LOCALIZED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return;
  }

  // Páginas protegidas: exige login; sin sesión → redirect a /sign-in.
  if (!skipAuthGate && isProtectedRoute(req)) {
    await auth.protect({ unauthenticatedUrl: new URL('/sign-in', req.url).toString() });
  }

  return handleI18nRouting(req);
});

export const config = {
  // Páginas localizadas (excluyendo internals de Next y assets) + TODAS las
  // APIs. Clerk debe correr en toda /api para que `auth()` tenga contexto allí
  // donde getCoachSession/getAdminSession se llaman (no solo bajo /api/coach).
  // La PROTECCIÓN sigue acotada en el handler (isProtectedRoute): correr el
  // middleware ≠ proteger, así que /api/athlete (Bearer iOS), /api/webhooks y
  // /api/auth reciben contexto pero NO se bloquean.
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*).*)',
    '/api/:path*',
  ],
};
