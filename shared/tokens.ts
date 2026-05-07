/**
 * FAHYBRIK design tokens — typed TypeScript mirror of `tokens.json`.
 *
 * Source of truth: `docs/design/fahybrik-design-system/project/colors_and_type.css`.
 * iOS mirror: `ios/FAHYBRIK/Theme/Theme.swift`.
 * Web mirror: `web/app/globals.css` (via CSS custom properties).
 *
 * Use this when JS/TS code needs raw token values (chart libraries, inline
 * style fallbacks, generated SVG, etc.). For component styling prefer Tailwind
 * utilities backed by the same tokens.
 */

export const tokens = {
  color: {
    bg: '#0A0A0A',
    surface: '#141414',
    surfaceElevated: '#1F1F1F',
    fg: '#F5F5F5',
    muted: '#A1A1A1',
    hairline: 'rgba(161,161,161,0.18)',
    outline: 'rgba(255,255,255,0.10)',
    scrim: 'rgba(0,0,0,0.55)',
    accent: '#F06A2A',
    accentPress: '#D85A20',
    accentOn: '#FFFFFF',
    ok: '#3FC773',
    warning: '#F2A52E',
    danger: '#F23F3F',
  },
  zone: {
    z1: '#C7C7C7',
    z2: '#4D9EEB',
    z3: '#4DC773',
    z4: '#F2B833',
    z5: '#EB4D4D',
    z1Tint: 'rgba(199,199,199,0.15)',
    z2Tint: 'rgba(77,158,235,0.15)',
    z3Tint: 'rgba(77,199,115,0.15)',
    z4Tint: 'rgba(242,184,51,0.15)',
    z5Tint: 'rgba(235,77,77,0.15)',
  },
  spacing: {
    xs: 4,
    s: 8,
    m: 12,
    l: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48,
  },
  radius: {
    s: 6,
    m: 10,
    l: 14,
    xl: 20,
    pill: 9999,
  },
  shadow: {
    card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.4)',
    modal: '0 20px 48px rgba(0,0,0,0.6)',
  },
  fontFamily: {
    display: '"Archivo", "SF Pro Display", system-ui, sans-serif',
    sans: '"Geist", "SF Pro Text", system-ui, sans-serif',
    mono: '"Geist Mono", "SF Mono", ui-monospace, monospace',
  },
  typography: {
    display:    { weight: 900, italic: true,  size: 56, leading: 1.0,  tracking: '-0.02em', family: 'display' },
    headlineL:  { weight: 900, italic: true,  size: 38, leading: 1.05, tracking: '-0.01em', family: 'display' },
    headlineM:  { weight: 900, italic: true,  size: 28, leading: 1.1,  tracking: '-0.01em', family: 'display' },
    headlineS:  { weight: 700, italic: true,  size: 20, leading: 1.2,  tracking: '0',       family: 'display' },
    body:       { weight: 400, italic: false, size: 16, leading: 1.4,  tracking: '0',       family: 'sans'    },
    bodyEmph:   { weight: 600, italic: false, size: 16, leading: 1.4,  tracking: '0',       family: 'sans'    },
    small:      { weight: 500, italic: false, size: 13, leading: 1.4,  tracking: '0',       family: 'sans'    },
    caption:    { weight: 500, italic: false, size: 12, leading: 1.3,  tracking: '0',       family: 'sans'    },
    dataDigit:  { weight: 900, italic: true,  size: 36, leading: 1.0,  tracking: '0',       family: 'display' },
    dataHero:   { weight: 900, italic: true,  size: 96, leading: 0.95, tracking: '0',       family: 'display' },
    dataLabel:  { weight: 600, italic: false, size: 11, leading: 1.0,  tracking: '0.16em',  family: 'sans'    },
  },
} as const;

export type ColorToken = keyof typeof tokens.color;
export type ZoneToken = keyof typeof tokens.zone;
export type SpacingToken = keyof typeof tokens.spacing;
export type RadiusToken = keyof typeof tokens.radius;
export type ShadowToken = keyof typeof tokens.shadow;
export type FontFamilyToken = keyof typeof tokens.fontFamily;
export type TypographyToken = keyof typeof tokens.typography;
export type TypographyStyle = (typeof tokens.typography)[TypographyToken];
