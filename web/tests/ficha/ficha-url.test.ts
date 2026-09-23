import { describe, expect, it } from 'vitest';
import { canonicalFichaQuery, resolveAtletaUrl } from '@/lib/dashboard/v2/atleta-detalle-types';

describe('resolveAtletaUrl — la ficha en tres pestañas y los enlaces viejos', () => {
  it('sin nada es Plan con 3 semanas', () => {
    const u = resolveAtletaUrl({});
    expect(u).toMatchObject({ tab: 'plan', seccion: null, zoom: '3sem', legacy: false, chat: false });
  });

  it('las tres pestañas nuevas no redirigen', () => {
    for (const tab of ['plan', 'rendimiento', 'perfil']) {
      expect(resolveAtletaUrl({ tab }).legacy).toBe(false);
    }
  });

  it.each([
    [{ tab: 'resumen' }, 'plan', null],
    [{ tab: 'rendimiento', vista: 'ritmos' }, 'rendimiento', 'zonas'],
    [{ tab: 'rendimiento', vista: 'en-zonas' }, 'rendimiento', 'running'],
    [{ tab: 'rendimiento', vista: 'fuerza' }, 'rendimiento', 'fuerza'],
    [{ tab: 'rendimiento', vista: 'cuerpo' }, 'rendimiento', 'fisiologia'],
    [{ tab: 'rendimiento', vista: 'carreras' }, 'rendimiento', 'carreras'],
    [{ tab: 'atleta', vista: 'pagos' }, 'perfil', 'pagos'],
    [{ tab: 'atleta', vista: 'sesiones' }, 'perfil', 'revisiones'],
    [{ tab: 'atleta' }, 'perfil', 'datos'],
    [{ tab: 'del-coach' }, 'perfil', 'historial'],
    [{ tab: 'ritmos' }, 'rendimiento', 'zonas'],
    [{ tab: 'pagos' }, 'perfil', 'pagos'],
  ])('%o → %s / %s (y redirige)', (q, tab, seccion) => {
    const u = resolveAtletaUrl(q);
    expect(u.tab).toBe(tab);
    expect(u.seccion).toBe(seccion);
    expect(u.legacy).toBe(true);
  });

  it('del-coach abre el historial filtrado en comunicados', () => {
    expect(resolveAtletaUrl({ tab: 'del-coach' }).historial).toBe('comunicado');
  });

  it('mensajes abre la conversación encima del Plan', () => {
    const u = resolveAtletaUrl({ tab: 'mensajes' });
    expect(u).toMatchObject({ tab: 'plan', chat: true, legacy: true });
    expect(canonicalFichaQuery(u)).toBe('?chat=1');
  });

  it('?sesion= siempre abre en Plan y conserva el id', () => {
    const u = resolveAtletaUrl({ tab: 'plan', sesion: '182' });
    expect(u).toMatchObject({ tab: 'plan', sesion: '182', legacy: false });
    const old = resolveAtletaUrl({ tab: 'resumen', sesion: '182' });
    expect(canonicalFichaQuery(old)).toBe('?sesion=182');
  });

  it('un sesion no numérico se ignora', () => {
    expect(resolveAtletaUrl({ sesion: 'abc' }).sesion).toBeNull();
  });

  it('la query canónica conserva desde y el zoom', () => {
    const u = resolveAtletaUrl({ tab: 'rendimiento', vista: 'ritmos' });
    expect(canonicalFichaQuery(u, 'estado=accion,vigilar')).toBe(
      '?tab=rendimiento&seccion=zonas&desde=estado%3Daccion%2Cvigilar',
    );
    expect(canonicalFichaQuery(resolveAtletaUrl({ zoom: 'plan' }))).toBe('?zoom=plan');
  });

  it('comunicado=nuevo abre el compositor', () => {
    expect(resolveAtletaUrl({ comunicado: 'nuevo' }).comunicado).toBe(true);
  });

  it('una sección que no es de la pestaña se ignora', () => {
    expect(resolveAtletaUrl({ tab: 'perfil', seccion: 'zonas' }).seccion).toBeNull();
  });
});
