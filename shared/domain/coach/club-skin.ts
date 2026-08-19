// Piel del club — nombre, logo y acento por coach_id.
//
// Vacío = la marca de ESTE binario (tokens actuales). FLEXR y FAHYBRID son el
// mismo software: el atleta entra al perfil del coach y ve su piel. Esta pieza
// no conoce iOS ni cobros.

import { tokens } from '../../tokens';

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
 */
export function clubAccentCssVars(raw: string | null | undefined): ClubAccentCssVars {
  const hex = normalizeAccentHex(raw);
  if (!hex) return {};
  const rgb = hexToRgb(hex);
  if (!rgb) return {};
  return {
    '--v2-accent': hex,
    '--v2-accent-press': darkenHex(rgb, 0.85),
    '--v2-accent-fg': contrastOn(rgb),
    '--v2-accent-soft': `color-mix(in srgb, ${hex} 14%, transparent)`,
  };
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/.exec(hex);
  const digits = match?.[1];
  if (!digits) return null;
  const n = Number.parseInt(digits, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function darkenHex(rgb: Rgb, factor: number): string {
  const to = (c: number) => Math.max(0, Math.min(255, Math.round(c * factor)));
  return `#${[to(rgb.r), to(rgb.g), to(rgb.b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Texto sobre el acento: negro de marca si aguanta AA, si no el claro del tema. */
function contrastOn(rgb: Rgb): string {
  const black = contrastRatio(rgb, { r: 10, g: 10, b: 10 });
  return black >= 4.5 ? '#0a0a0a' : '#f5f5f5';
}

function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
