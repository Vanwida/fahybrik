// Piel del club: vacío = marca de ESTE binario. El PATCH no acepta el logo.

import { describe, expect, test } from 'vitest';
import {
  BRAND_ACCENT_HEX,
  BRAND_LOGO_SRC,
  BRAND_WORDMARK,
  CLUB_SKIN_NAME_MAX,
  clubAccentCssVars,
  emptyClubSkin,
  normalizeClubName,
  parseAccentHex,
  resolveClubBrand,
  splitWordmark,
} from '@fahybrid/shared/domain/coach/club-skin';
import { clubSkinPatchSchema } from '@fahybrid/shared/schema/coach-club-skin';
import { clubLogoRejection } from '@/lib/coach/club-logo-client';
import { PROFILE_PHOTO_MAX_BYTES } from '@/lib/profile/photo-source';

function fileLike(name: string, size: number): File {
  return { name, size } as File;
}

describe('normalizeClubName', () => {
  test('null y solo espacios son vacío', () => {
    expect(normalizeClubName(null)).toBeNull();
    expect(normalizeClubName(undefined)).toBeNull();
    expect(normalizeClubName('')).toBeNull();
    expect(normalizeClubName('   ')).toBeNull();
  });

  test('recorta, no inventa', () => {
    expect(normalizeClubName('  Fabrik  ')).toBe('Fabrik');
  });
});

describe('parseAccentHex', () => {
  test('vacío es null (usar marca)', () => {
    expect(parseAccentHex(null)).toEqual({ ok: true, hex: null });
    expect(parseAccentHex('')).toEqual({ ok: true, hex: null });
    expect(parseAccentHex('   ')).toEqual({ ok: true, hex: null });
  });

  test('canónico #rrggbb en minúsculas, con o sin almohadilla', () => {
    expect(parseAccentHex('#F06A2A')).toEqual({ ok: true, hex: '#f06a2a' });
    expect(parseAccentHex('F06A2A')).toEqual({ ok: true, hex: '#f06a2a' });
  });

  test('rechaza #rgb, rgb() y nombres', () => {
    expect(parseAccentHex('#F06').ok).toBe(false);
    expect(parseAccentHex('rgb(240, 106, 42)').ok).toBe(false);
    expect(parseAccentHex('orange').ok).toBe(false);
  });
});

describe('resolveClubBrand', () => {
  test('sin dato pinta la marca de este binario', () => {
    expect(resolveClubBrand(emptyClubSkin())).toEqual({
      wordmark: BRAND_WORDMARK,
      logo_src: BRAND_LOGO_SRC,
      using_default_name: true,
      using_default_logo: true,
    });
  });

  test('el nombre del club no arrastra el logo de marca invertido', () => {
    const brand = resolveClubBrand({ name: 'North Box', logo_url: null });
    expect(brand.wordmark).toBe('North Box');
    expect(brand.logo_src).toBe(BRAND_LOGO_SRC);
    expect(brand.using_default_name).toBe(false);
    expect(brand.using_default_logo).toBe(true);
  });

  test('un logo propio no cambia el wordmark vacío', () => {
    const brand = resolveClubBrand({
      name: null,
      logo_url: 'https://imagedelivery.net/acct/76b484a7-fa1a-45be-678c-d86c53e33600',
    });
    expect(brand.wordmark).toBe(BRAND_WORDMARK);
    expect(brand.using_default_logo).toBe(false);
  });
});

describe('splitWordmark', () => {
  test('FAHYBRID parte en FA + HYBRID', () => {
    expect(splitWordmark(BRAND_WORDMARK)).toEqual({ lead: 'FA', accent: 'HYBRID' });
  });

  test('varias palabras dejan la última en acento', () => {
    expect(splitWordmark('Fabrik Training Club')).toEqual({
      lead: 'Fabrik Training ',
      accent: 'Club',
    });
  });

  test('un nombre corto no se parte', () => {
    expect(splitWordmark('BOX')).toEqual({ lead: '', accent: 'BOX' });
  });
});

describe('clubAccentCssVars', () => {
  test('vacío o inválido no pisa los tokens', () => {
    expect(clubAccentCssVars(null)).toEqual({});
    expect(clubAccentCssVars('no')).toEqual({});
  });

  test('un hex válido clava las variables de acento del panel', () => {
    const vars = clubAccentCssVars('#F06A2A');
    expect(vars['--v2-accent']).toBe('#f06a2a');
    expect(vars['--v2-accent-press']).toBe('#cc5a24');
    expect(vars['--v2-accent-fg']).toBe('#0a0a0a');
    expect(vars['--v2-accent-soft']).toBe('rgba(240, 106, 42, 0.1)');
    // Como texto el naranja no llega a 4,5:1 sobre el perla: se oscurece.
    expect(vars['--v2-accent-text']).not.toBe('#f06a2a');
  });

  test('sobre un acento oscuro el texto es el claro del tema', () => {
    expect(clubAccentCssVars('#111111')['--v2-accent-fg']).toBe('#f5f5f5');
  });

  test('el acento de marca del binario es el token, no un hex suelto', () => {
    expect(BRAND_ACCENT_HEX).toBe('#f06a2a');
  });
});

describe('clubSkinPatchSchema', () => {
  test('recorta el nombre y canónico el color', () => {
    const r = clubSkinPatchSchema.safeParse({ name: '  North  ', accent_hex: '#F06A2A' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe('North');
      expect(r.data.accent_hex).toBe('#f06a2a');
    }
  });

  test('nombre solo espacios = null (volver a la marca)', () => {
    const r = clubSkinPatchSchema.safeParse({ name: '   ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBeNull();
  });

  test('nombre más largo que el tope no entra', () => {
    expect(
      clubSkinPatchSchema.safeParse({ name: 'x'.repeat(CLUB_SKIN_NAME_MAX + 1) }).success,
    ).toBe(false);
  });

  test('color inválido no entra', () => {
    expect(clubSkinPatchSchema.safeParse({ accent_hex: '#F06' }).success).toBe(false);
  });

  test('logo_url no es campo del PATCH — otro escritor', () => {
    expect(
      clubSkinPatchSchema.safeParse({
        name: 'X',
        logo_url: 'https://imagedelivery.net/x/y',
      }).success,
    ).toBe(false);
  });

  test('rechaza coach_id en el cuerpo', () => {
    expect(clubSkinPatchSchema.safeParse({ name: 'X', coach_id: 99 }).success).toBe(false);
  });
});

describe('clubLogoRejection', () => {
  test('rechaza un formato que Cloudflare no recorta como marca', () => {
    expect(clubLogoRejection(fileLike('marca.svg', 1200))).toMatch(/no es una imagen/);
  });

  test('rechaza el vacío y lo que pasa del tope de Cloudflare', () => {
    expect(clubLogoRejection(fileLike('marca.png', 0))).toMatch(/vacío/);
    expect(clubLogoRejection(fileLike('marca.png', PROFILE_PHOTO_MAX_BYTES + 1))).toMatch(/tope/);
  });

  test('acepta un png dentro del tope', () => {
    expect(clubLogoRejection(fileLike('marca.png', 240_000))).toBeNull();
  });
});
