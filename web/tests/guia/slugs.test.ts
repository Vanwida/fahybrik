// Cada pantalla del panel enlaza a su artículo de la guía por GUIA_SLUGS: si
// un artículo se renombra o desaparece, el test lo dice antes que un 404.

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
import { GUIA_FIRST_SLUG, GUIA_SECTIONS, GUIA_SLUGS, guiaHref } from '@/components/v2/guia/config';
const { GUIA_SECTION_REGISTRY } = await import('@/components/v2/guia/sections/registry');

describe('GUIA_SLUGS', () => {
  test('cada pantalla apunta a un artículo que existe y tiene contenido', () => {
    const known = new Set(GUIA_SECTIONS.map((s) => s.slug));
    for (const [screen, slug] of Object.entries(GUIA_SLUGS)) {
      expect(known.has(slug), `${screen} → ${slug}`).toBe(true);
      expect(GUIA_SECTION_REGISTRY[slug], `${screen} → ${slug} sin componente`).toBeDefined();
    }
  });

  test('la portada vive en /guia y el resto en /guia/<slug>', () => {
    expect(guiaHref(GUIA_FIRST_SLUG)).toBe('/guia');
    expect(guiaHref(GUIA_SLUGS.hoy)).toBe('/guia/tu-pantalla-hoy');
  });
});
