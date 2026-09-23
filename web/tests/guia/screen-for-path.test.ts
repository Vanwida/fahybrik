import { describe, expect, it } from 'vitest';
import { GUIA_SLUGS } from '@/components/v2/guia/config';
import { guiaSlugForPath } from '@/components/v2/guia/screen-for-path';

describe('guiaSlugForPath', () => {
  it.each([
    ['/hoy', GUIA_SLUGS.hoy],
    ['/atletas', GUIA_SLUGS.atletas],
    ['/atletas/42', GUIA_SLUGS.atleta],
    ['/atletas/42/sesion/7', GUIA_SLUGS.atleta],
    ['/atletas/42/intake', GUIA_SLUGS.altas],
    ['/mensajes', GUIA_SLUGS.mensajes],
    ['/programar', GUIA_SLUGS.programar],
    ['/programar/programas', GUIA_SLUGS.programas],
    ['/programar/programas/2', GUIA_SLUGS.programa],
    ['/programar/biblioteca/entreno/nuevo', GUIA_SLUGS.biblioteca],
    ['/programar/grupos/3', GUIA_SLUGS.grupos],
    ['/programar/tests', GUIA_SLUGS.tests],
    ['/negocio', GUIA_SLUGS.leads],
    ['/negocio/leads/5', GUIA_SLUGS.leads],
    ['/negocio/cobros', GUIA_SLUGS.cobros],
    ['/negocio/embudo', GUIA_SLUGS.embudo],
    ['/ajustes/metodo', GUIA_SLUGS.ajustes_metodo],
    ['/ajustes/agenda', GUIA_SLUGS.ajustes_agenda],
  ])('%s → su artículo', (path, slug) => {
    expect(guiaSlugForPath(path)).toBe(slug);
  });

  it('una ruta sin artículo lleva al índice', () => {
    expect(guiaSlugForPath('/guia')).toBeNull();
    expect(guiaSlugForPath('/ajustes/sistema')).toBeNull();
  });
});
