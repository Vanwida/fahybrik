import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Composición Clerk + next-intl (Fase 2 — gates activos).
//
// Clerk envuelve el middleware de i18n: corre en las rutas de página (para
// adjuntar el contexto de auth que necesitan <SignIn/> y `auth()`) y en las
// rutas de API de coach/admin (para protegerlas server-side). Delega el ruteo
// de locale a next-intl SOLO en las páginas localizadas.
//
// Reglas de scope (ver matcher abajo):
//   - PROTEGIDO (requiere login Clerk): dashboard coach (grupo `(v2)`), admin
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
// 404/401 vía auth.protect(). Los grupos de rutas `(v2)`/`(admin)` no aparecen
// en la URL, así que matcheamos los paths reales del dashboard y del admin.
const isProtectedRoute = createRouteMatcher([
  // Dashboard coach (grupo (v2), única versión tras consolidar): todas las
  // secciones bajo /:locale. La raíz /:locale es la landing pública de
  // marketing (grupo (marketing)) y NO se protege — solo las secciones del
  // dashboard exigen login Clerk.
  '/:locale/hoy',
  '/:locale/atletas/:path*',
  '/:locale/mensajes/:path*',
  '/:locale/biblioteca/:path*',
  '/:locale/planes/:path*',
  '/:locale/periodizacion/:path*',
  '/:locale/microciclos/:path*',
  '/:locale/ajustes/:path*',
  '/:locale/admin/:path*',
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

  // API: Clerk corre en TODAS las APIs (para que `auth()` tenga contexto allí
  // donde se llama getCoachSession/getAdminSession — p.ej. /api/exercises,
  // /api/templates, /api/notifications…), pero SOLO protege coach/admin. El
  // resto (athlete con Bearer propio, webhooks server-to-server, auth legacy)
  // recibe contexto pero NO se protege → su lógica propia decide. Nunca i18n.
  if (pathname.startsWith('/api/')) {
    if (!devAuthBypass && isProtectedRoute(req)) {
      await auth.protect();
    }
    return; // Sin i18n para APIs.
  }

  // Páginas de auth Clerk: contexto adjunto, sin i18n.
  if (NON_LOCALIZED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return;
  }

  // Páginas protegidas: exige login; sin sesión → redirect a /sign-in.
  if (!devAuthBypass && isProtectedRoute(req)) {
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
