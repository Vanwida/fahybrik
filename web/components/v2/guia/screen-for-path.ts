// El artículo de ayuda de cada pantalla sale de su ruta, en un solo sitio: el
// «?» de la barra superior lo resuelve aquí cuando la pantalla no declara uno
// propio con <HelpArticle />. La primera regla que casa gana (lo más concreto
// arriba). Rutas sin prefijo de idioma, como las da usePathname de next-intl.

import { GUIA_SLUGS, type GuiaScreen } from './config';

const RULES: ReadonlyArray<readonly [RegExp, GuiaScreen]> = [
  [/^\/hoy\/?$/, 'hoy'],
  [/^\/atletas\/[^/]+\/intake\/?$/, 'altas'],
  [/^\/atletas\/[^/]+(\/.*)?$/, 'atleta'],
  [/^\/atletas\/?$/, 'atletas'],
  [/^\/mensajes\/?$/, 'mensajes'],
  [/^\/programar\/programas\/[^/]+\/?$/, 'programa'],
  [/^\/programar\/programas\/?$/, 'programas'],
  [/^\/programar\/biblioteca(\/.*)?$/, 'biblioteca'],
  [/^\/programar\/grupos(\/.*)?$/, 'grupos'],
  [/^\/programar\/tests\/?$/, 'tests'],
  [/^\/programar\/?$/, 'programar'],
  [/^\/negocio\/cobros\/?$/, 'cobros'],
  [/^\/negocio\/embudo\/?$/, 'embudo'],
  [/^\/negocio(\/leads(\/.*)?)?\/?$/, 'leads'],
  [/^\/ajustes\/perfil\/?$/, 'ajustes_perfil'],
  [/^\/ajustes\/club\/?$/, 'ajustes_club'],
  [/^\/ajustes\/metodo\/?$/, 'ajustes_metodo'],
  [/^\/ajustes\/plan\/?$/, 'ajustes_plan'],
  [/^\/ajustes\/agenda\/?$/, 'ajustes_agenda'],
  [/^\/ajustes\/notificaciones\/?$/, 'ajustes_notificaciones'],
  [/^\/ajustes\/cuenta\/?$/, 'ajustes_cuenta'],
  [/^\/ajustes\/alta\/?$/, 'inicio'],
];

/** El slug de la guía para una ruta del panel, o null (el «?» lleva al índice). */
export function guiaSlugForPath(pathname: string): string | null {
  for (const [re, screen] of RULES) if (re.test(pathname)) return GUIA_SLUGS[screen];
  return null;
}
