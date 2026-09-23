import { describe, expect, it } from 'vitest';
import {
  MOBILE_TAB_KEYS,
  NAV_ITEMS,
  NAV_SETTINGS,
  badgeLabel,
  isNavActive,
  navForGoKey,
  visibleNavItems,
} from '@/components/v2/nav';
import { ACTIONS, SCREENS, filterEntries, visibleScreens } from '@/components/v2/shell/destinations';
import { PANEL_REDIRECTS } from '../../panel-redirects';

describe('barra lateral (PLAN §5)', () => {
  it('cinco destinos en orden + Ajustes anclado', () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(['Hoy', 'Atletas', 'Mensajes', 'Programar', 'Negocio']);
    expect(NAV_SETTINGS.href).toBe('/ajustes');
  });

  it('Negocio solo con el add-on', () => {
    expect(visibleNavItems({ negocio: false }).map((i) => i.key)).toEqual(['hoy', 'atletas', 'mensajes', 'programar']);
    expect(visibleNavItems({ negocio: true }).map((i) => i.key)).toContain('negocio');
  });

  it('la guía no está en la barra', () => {
    expect([...NAV_ITEMS, NAV_SETTINGS].some((i) => i.href.startsWith('/guia'))).toBe(false);
  });

  it('insignias exactas hasta 99; nada si no hay o no se sabe', () => {
    expect(badgeLabel(7)).toBe('7');
    expect(badgeLabel(14)).toBe('14');
    expect(badgeLabel(99)).toBe('99');
    expect(badgeLabel(100)).toBe('99+');
    expect(badgeLabel(0)).toBeNull();
    expect(badgeLabel(null)).toBeNull();
  });

  it('activo en la ruta y en lo que cuelga de ella, no en un prefijo suelto', () => {
    expect(isNavActive('/programar/programas/2', '/programar')).toBe(true);
    expect(isNavActive('/atletas', '/atletas')).toBe(true);
    expect(isNavActive('/atletas-x', '/atletas')).toBe(false);
  });

  it('G H / G A / G M / G P / G N; G N sin Negocio no va a ningún sitio', () => {
    expect(navForGoKey('h', { negocio: true })?.href).toBe('/hoy');
    expect(navForGoKey('A', { negocio: true })?.href).toBe('/atletas');
    expect(navForGoKey('m', { negocio: true })?.href).toBe('/mensajes');
    expect(navForGoKey('p', { negocio: true })?.href).toBe('/programar');
    expect(navForGoKey('n', { negocio: true })?.href).toBe('/negocio');
    expect(navForGoKey('n', { negocio: false })).toBeNull();
    expect(navForGoKey('x', { negocio: true })).toBeNull();
  });

  it('pestañas del móvil: Hoy · Atletas · Mensajes · Programar (+ Más)', () => {
    expect(MOBILE_TAB_KEYS).toEqual(['hoy', 'atletas', 'mensajes', 'programar']);
  });
});

describe('⌘K: pantallas y acciones', () => {
  it('ninguna pantalla del «Ir a» apunta a una ruta vieja que redirige', () => {
    const oldPrefixes = PANEL_REDIRECTS.map((r) => r.source.replace('/:locale(es|en)', '').replace(/\/:.*$/, ''));
    for (const s of SCREENS) {
      const pathOnly = s.href.split('?')[0]!;
      expect(oldPrefixes.includes(pathOnly), `${s.label} → ${s.href}`).toBe(false);
    }
  });

  it('sin tildes ni mayúsculas, por palabras', () => {
    expect(filterEntries(SCREENS, 'metodo')[0]?.id).toBe('metodo');
    expect(filterEntries(SCREENS, 'MÉTODO')[0]?.id).toBe('metodo');
    expect(filterEntries(SCREENS, 'cupo').map((s) => s.id)).toContain('agenda');
    expect(filterEntries(SCREENS, 'color club').map((s) => s.id)).toEqual(['club']);
  });

  it('lo que empieza por la consulta va primero', () => {
    expect(filterEntries(SCREENS, 'pro')[0]?.id).toBe('programas');
  });

  it('sin consulta, todo en su orden', () => {
    expect(filterEntries(ACTIONS, '  ')).toHaveLength(ACTIONS.length);
  });

  it('las pantallas de Negocio solo con el add-on', () => {
    expect(visibleScreens({ negocio: false }).some((s) => s.section === 'Negocio')).toBe(false);
    expect(visibleScreens({ negocio: true }).filter((s) => s.section === 'Negocio')).toHaveLength(3);
  });

  it('el vocabulario del panel: ni microciclo ni receta en lo que se enseña', () => {
    for (const e of [...SCREENS, ...ACTIONS]) {
      expect(e.label.toLowerCase()).not.toMatch(/microciclo|receta|secuencia|plantilla/);
    }
  });
});
