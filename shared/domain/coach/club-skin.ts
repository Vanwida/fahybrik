// Piel del club — nombre, logo y acento por coach_id.
//
// Vacío = la marca de ESTE binario (tokens actuales). FLEXR y FAHYBRID son el
// mismo software: el atleta entra al perfil del coach y ve su piel. Esta pieza
// no conoce iOS ni cobros.

import { tokens } from '../../tokens';
import { buildClubAccent } from './club-accent';

/** Wordmark de este binario cuando el club no ha puesto nombre. */
export const BRAND_WORDMARK = 'FAHYBRID';

/** Icono de este binario cuando el club no ha puesto logo. */
export const BRAND_LOGO_SRC = '/brand/fh-icon-300.png';

/** Acento de este binario cuando el club no ha puesto color. */
export const BRAND_ACCENT_HEX = tokens.color.accent.toLowerCase();

export const CLUB_SKIN_NAME_MAX = 80;

/** #rrggbb canónico. Nada de #rgb, rgb() ni nombres. */
const HEX6 = /^#?([0-9a-f]{6})$/i;

export interface ClubSkin {
  name: string | null;
  logo_url: string | null;
  accent_hex: string | null;
}

export function emptyClubSkin(): ClubSkin {
  return { name: null, logo_url: null, accent_hex: null };
}

/** Recorta. Solo espacios = null. */
export function normalizeClubName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Vacío → null (usar marca). Hex válido → #rrggbb. Cualquier otra cosa → error.
 * El caller del schema mapea el error a 422; el de pintura trata el error como vacío.
 */
export function parseAccentHex(
  raw: string | null | undefined,
): { ok: true; hex: string | null } | { ok: false } {
  if (raw == null) return { ok: true, hex: null };
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, hex: null };
  const match = HEX6.exec(trimmed);
  const digits = match?.[1];
  if (!digits) return { ok: false };
  return { ok: true, hex: `#${digits.toLowerCase()}` };
}

export function normalizeAccentHex(raw: string | null | undefined): string | null {
  const parsed = parseAccentHex(raw);
  return parsed.ok ? parsed.hex : null;
}

export interface ResolvedClubBrand {
  wordmark: string;
  logo_src: string;
  using_default_name: boolean;
  using_default_logo: boolean;
}

/** Lo que se pinta: dato del club o la marca de este binario. */
export function resolveClubBrand(skin: Pick<ClubSkin, 'name' | 'logo_url'>): ResolvedClubBrand {
  const name = normalizeClubName(skin.name);
  const logo = (skin.logo_url ?? '').trim();
  return {
    wordmark: name ?? BRAND_WORDMARK,
    logo_src: logo.length > 0 ? logo : BRAND_LOGO_SRC,
    using_default_name: name === null,
    using_default_logo: logo.length === 0,
  };
}

/**
 * Parte el wordmark para el lockup (primera pieza en tinta, el resto en acento).
 * FAHYBRID → FA + HYBRID. Un nombre de varias palabras deja la última en acento.
 */
export function splitWordmark(wordmark: string): { lead: string; accent: string } {
  const trimmed = wordmark.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { lead: `${parts.slice(0, -1).join(' ')} `, accent: parts[parts.length - 1] ?? '' };
  }
  if (trimmed.length >= 4) {
    return { lead: trimmed.slice(0, 2), accent: trimmed.slice(2) };
  }
  return { lead: '', accent: trimmed };
}

export type ClubAccentCssVars = Record<`--v2-${string}`, string>;

/**
 * Variables que se clavan en `.v2-root`. Vacío = objeto vacío: el CSS de
 * `v2-theme.css` sigue siendo la marca. El dashboard ya lee `var(--v2-accent)`
 * (botones, foco, rail activo); no hace falta tocar cada componente.
 *
 * La familia la deriva `club-accent`: aquí solo se traduce a nombres de token.
 * El panel es la superficie CLARA; la app del atleta recibe la oscura por API.
 */
export function clubAccentCssVars(raw: string | null | undefined): ClubAccentCssVars {
  const family = buildClubAccent(normalizeAccentHex(raw));
  if (!family) return {};
  const { fill, press, on_fill, soft, text } = family.light;
  return {
    '--v2-accent': fill,
    '--v2-accent-press': press,
    '--v2-accent-fg': on_fill,
    '--v2-accent-soft': soft,
    '--v2-accent-text': text,
  };
}
