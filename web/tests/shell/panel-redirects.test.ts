import { describe, expect, it } from 'vitest';
// El mismo emparejador y compilador de destinos que usa Next para `redirects()`.
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination';
import { PANEL_REDIRECTS } from '../../panel-redirects';

/** Aplica la PRIMERA redirección que casa, como Next. null = ninguna. */
function resolve(url: string): string | null {
  const parsed = new URL(url, 'http://x');
  const query = Object.fromEntries(parsed.searchParams.entries());
  for (const rule of PANEL_REDIRECTS) {
    const params = getPathMatch(rule.source, { removeUnnamedParams: true, strict: true })(parsed.pathname);
    if (!params) continue;
    if (rule.has && !rule.has.every((h) => (h.value == null ? h.key in query : query[h.key] === h.value))) continue;
    // Como el enrutador de Next: la consulta de la petición + la del destino.
    const { parsedDestination } = prepareDestination({ appendParamsToQuery: false, destination: rule.destination, params, query });
    const qs = new URLSearchParams(parsedDestination.query as Record<string, string>).toString();
    return `${parsedDestination.pathname}${qs ? `?${qs}` : ''}`;
  }
  return null;
}

const path = (url: string | null) => (url == null ? null : new URL(url, 'http://x').pathname);

describe('redirecciones del panel (PLAN §5)', () => {
  it.each([
    ['/es/altas', '/es/hoy'],
    ['/es/biblioteca', '/es/programar/biblioteca'],
    ['/es/biblioteca/bloque/nuevo', '/es/programar/biblioteca/bloque/nuevo'],
    ['/es/biblioteca/bloque/42', '/es/programar/biblioteca/bloque/42'],
    ['/es/biblioteca/sesion/nueva', '/es/programar/biblioteca/entreno/nuevo'],
    ['/es/biblioteca/sesion/7', '/es/programar/biblioteca/entreno/7'],
    ['/es/microciclos/2', '/es/programar/programas/2'],
    ['/es/microciclos/2/dia/3', '/es/programar/programas/2'],
    ['/es/programar', '/es/programar/programas'],
    ['/es/periodizacion', '/es/programar/grupos'],
    ['/es/tests', '/es/programar/tests'],
    ['/es/leads', '/es/negocio/leads'],
    ['/es/leads/15', '/es/negocio/leads/15'],
    ['/es/pagos', '/es/negocio/cobros'],
    ['/es/metricas', '/es/negocio/embudo'],
    ['/es/disponibilidad', '/es/ajustes/agenda'],
    ['/es/club', '/es/ajustes/club'],
    ['/es/como-entrenas', '/es/ajustes/metodo'],
    ['/es/cuestionarios', '/es/ajustes/perfil'],
    ['/en/pagos', '/en/negocio/cobros'],
  ])('%s → %s', (from, to) => {
    expect(path(resolve(from))).toBe(to);
  });

  it('altas cae en la vista de altas de Hoy', () => {
    expect(resolve('/es/altas')).toBe('/es/hoy?vista=altas');
  });

  it('la pestaña vieja de microciclos de la biblioteca va a Programas', () => {
    expect(path(resolve('/es/biblioteca?tab=microciclos'))).toBe('/es/programar/programas');
    expect(path(resolve('/es/biblioteca?tab=bloques'))).toBe('/es/programar/biblioteca');
  });

  it('la consulta pasa al destino', () => {
    expect(resolve('/es/leads?estado=nuevo')).toContain('estado=nuevo');
  });

  it.each([
    '/es/hoy',
    '/es/atletas',
    '/es/atletas/11',
    '/es/mensajes',
    '/es/programar/programas',
    '/es/programar/programas/2',
    '/es/programar/biblioteca',
    '/es/programar/grupos/3',
    '/es/negocio/leads',
    '/es/ajustes',
    '/es/ajustes/perfil',
    '/es/guia',
    '/es/guia/tu-panel',
    '/es',
    '/fr/pagos',
  ])('%s no se toca (ruta nueva, pública o sin locale del producto)', (url) => {
    expect(resolve(url)).toBeNull();
  });

  it('todas son temporales y llevan el locale', () => {
    for (const rule of PANEL_REDIRECTS) {
      expect(rule.permanent).toBe(false);
      expect(rule.source.startsWith('/:locale(es|en)/')).toBe(true);
      expect(rule.destination.startsWith('/:locale/')).toBe(true);
    }
  });
});
