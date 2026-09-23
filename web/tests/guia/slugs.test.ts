// La guía: cada pantalla enlaza a su artículo por GUIA_SLUGS, las direcciones
// viejas siguen llevando a algún sitio y el índice no tiene huecos. Si un
// artículo se renombra o desaparece, estos tests lo dicen antes que un 404.

import { describe, expect, test, vi } from 'vitest';

// Las secciones pintan enlaces y datos del club; aquí solo importa que existan.
vi.mock('@/i18n/navigation', () => ({ Link: () => null, usePathname: () => '/guia' }));
vi.mock('@/components/v2/guia/tenant', () => {
  const Stub = () => null;
  return {
    ClubMark: Stub,
    ClubInitial: Stub,
    CoachSubject: Stub,
    CoachObject: Stub,
    WithCoach: Stub,
    CoachInitial: Stub,
    Signature: Stub,
    AppUrl: Stub,
  };
});
import {
  GUIA_AREAS,
  GUIA_FIRST_SLUG,
  GUIA_SECTIONS,
  GUIA_SLUGS,
  GUIA_SLUG_ALIASES,
  guiaHref,
} from '@/components/v2/guia/config';
const { GUIA_SECTION_REGISTRY } = await import('@/components/v2/guia/sections/registry');

const known = new Set(GUIA_SECTIONS.map((s) => s.slug));

describe('GUIA_SLUGS', () => {
  test('cada pantalla apunta a un artículo que existe y tiene contenido', () => {
    for (const [screen, slug] of Object.entries(GUIA_SLUGS)) {
      expect(known.has(slug), `${screen} → ${slug}`).toBe(true);
      expect(GUIA_SECTION_REGISTRY[slug], `${screen} → ${slug} sin componente`).toBeDefined();
    }
  });

  test('cada destino del panel tiene su artículo', () => {
    for (const screen of ['hoy', 'atletas', 'atleta', 'mensajes', 'programas', 'biblioteca', 'grupos', 'tests', 'leads', 'cobros', 'embudo', 'ajustes_metodo']) {
      expect(GUIA_SLUGS, screen).toHaveProperty(screen);
    }
  });

  test('la portada vive en /guia y el resto en /guia/<slug>', () => {
    expect(guiaHref(GUIA_FIRST_SLUG)).toBe('/guia');
    expect(guiaHref(GUIA_SLUGS.hoy)).toBe('/guia/tu-pantalla-hoy');
  });
});

describe('índice', () => {
  test('slugs únicos, todos con componente, y ningún componente huérfano', () => {
    expect(known.size).toBe(GUIA_SECTIONS.length);
    for (const s of GUIA_SECTIONS) expect(GUIA_SECTION_REGISTRY[s.slug], s.slug).toBeDefined();
    for (const slug of Object.keys(GUIA_SECTION_REGISTRY)) expect(known.has(slug), slug).toBe(true);
  });

  test('numerado 1…n por posición, y cada artículo en un área que existe', () => {
    const areas = new Set(GUIA_AREAS.map((a) => a.id));
    GUIA_SECTIONS.forEach((s, i) => {
      expect(s.num).toBe(i + 1);
      expect(areas.has(s.area), s.slug).toBe(true);
    });
    for (const a of GUIA_AREAS) expect(GUIA_SECTIONS.some((s) => s.area === a.id), a.id).toBe(true);
  });

  test('las direcciones viejas llevan a un artículo vivo y no pisan uno actual', () => {
    for (const [old, target] of Object.entries(GUIA_SLUG_ALIASES)) {
      expect(known.has(target), `${old} → ${target}`).toBe(true);
      expect(known.has(old), `${old} sigue siendo un artículo`).toBe(false);
    }
  });
});
