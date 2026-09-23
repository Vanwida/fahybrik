// Adónde va alguien que acaba de entrar, según su rol (puro; lo usa
// app/auth/landing/route.ts). Ver el comentario de esa ruta.

export function landingPathFor(roles: { coach: boolean; admin: boolean }): string {
  if (roles.coach) return '/es/hoy';
  if (roles.admin) return '/es/admin';
  return '/';
}
