// Piel del club — nombre, logo y acento por coach_id.
//
// Vacío = la marca de ESTE binario (tokens actuales). FLEXR y FAHYBRID son el
// mismo software: el atleta entra al perfil del coach y ve su piel. Esta pieza
// no conoce iOS ni cobros.

import { tokens } from '../../tokens';
import { buildClubAccent, SOFT_ALPHA_DARK } from './club-accent';

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
 * Las DOS familias del club, servidas como ENTRADAS (`--v2-club-l-*` para el
 * lienzo claro, `--v2-club-d-*` para el oscuro). No se clavan los tokens de
 * acento directamente y el motivo es de CSS, no de gusto: estas variables van
 * en el `style` de `.v2-root`, y el bloque de tema oscuro es una regla sobre
 * ESE MISMO elemento — un estilo en línea gana a cualquier regla, así que
 * pintar aquí `--v2-accent` metería el color derivado para PERLA también en el
 * panel oscuro. Y ahí no se lee: es justo lo que la derivación existe para
 * evitar.
 *
 * Quien elige es `v2-theme.css`, que sí sabe en qué tema está: cada bloque lee
 * su familia con un valor por defecto para el club que no ha puesto color.
 */
export function clubAccentCssVars(raw: string | null | undefined): ClubAccentCssVars {
  const family = buildClubAccent(normalizeAccentHex(raw));
  if (!family) return {};
  return {
    '--v2-club-l-fill': family.light.fill,
    '--v2-club-l-press': family.light.press,
    '--v2-club-l-on': family.light.on_fill,
    '--v2-club-l-soft': family.light.soft,
    '--v2-club-l-text': family.light.text,
    '--v2-club-d-fill': family.dark.fill,
    '--v2-club-d-press': family.dark.press,
    '--v2-club-d-on': family.dark.on_fill,
    '--v2-club-d-soft': family.dark.soft,
    '--v2-club-d-text': family.dark.text,
  };
}

export interface DeviceAccent {
  fill: string;
  on_fill: string;
  press: string;
  text: string;
  soft_alpha: number;
}

/** La piel que viaja al dispositivo. `null` en un campo = usa lo del binario. */
export interface DeviceClubTheme {
  /** Nombre del club, o null si nunca lo puso: la app pinta su propia marca. */
  name: string | null;
  /** Logo del club, o null: la app pinta el icono que trae dentro. */
  logo_url: string | null;
  /** Acento del club derivado para fondo oscuro, o null: la app usa el suyo. */
  accent: DeviceAccent | null;
}

/**
 * La piel de un club para la app del atleta y el reloj.
 *
 * A diferencia del panel, aquí NO se rellena con la marca de este binario: se
 * manda null y el dispositivo pinta lo que trae. Así una app que se abre sin red
 * y una que responde tarde enseñan lo mismo, y no hay que mandar rutas web que
 * en un móvil no existen.
 */
export function deviceClubTheme(skin: ClubSkin | null | undefined): DeviceClubTheme {
  const name = normalizeClubName(skin?.name ?? null);
  const logo = (skin?.logo_url ?? '').trim();
  const family = buildClubAccent(normalizeAccentHex(skin?.accent_hex));
  return {
    name,
    logo_url: logo.length > 0 ? logo : null,
    accent: family
      ? {
          fill: family.dark.fill,
          on_fill: family.dark.on_fill,
          press: family.dark.press,
          text: family.dark.text,
          soft_alpha: SOFT_ALPHA_DARK,
        }
      : null,
  };
}
