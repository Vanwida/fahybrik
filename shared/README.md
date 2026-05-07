# `@fahybrik/shared`

Cross-platform shared schema and design tokens for FAHYBRIK.

## Design tokens

The canonical source of truth is `docs/design/fahybrik-design-system/project/colors_and_type.css`. Tokens are mirrored byte-equivalent to:

- `shared/tokens.json` — JSON, useful for build-time codegen
- `shared/tokens.ts` — typed TypeScript export, importable from web code
- `ios/FAHYBRIK/Theme/Theme.swift` + `Assets.xcassets/Brand*.colorset` — Swift / SwiftUI
- `web/app/globals.css` — CSS custom properties + Tailwind v4 `@theme` block

If you change a color, font size, spacing step, etc. you **must** update all five files in the same commit. The `colors_and_type.css` file is authoritative for hex values and casing (uppercase preferred for hex, e.g. `#F06A2A`).

## Quick reference — where to grab a value

### Brand orange `#F06A2A`

| Surface | API |
| --- | --- |
| iOS SwiftUI | `Theme.Color.accent` (asset `BrandAccent`) |
| Web CSS | `var(--accent)` or Tailwind class `bg-accent` / `text-accent` |
| TypeScript / charts | `import { tokens } from '@fahybrik/shared/tokens'; tokens.color.accent` |

### Page background `#0A0A0A`

| Surface | API |
| --- | --- |
| iOS SwiftUI | `Theme.Color.background` (asset `BrandBackground`) |
| Web CSS | `var(--bg)` / Tailwind `bg-bg` |
| TypeScript | `tokens.color.bg` |

### HR zone color (workout charts only — orange forbidden here)

| Surface | API |
| --- | --- |
| iOS SwiftUI | `HRZone.z3.color` → asset `ZoneZ3` |
| Web CSS | `var(--z3)` (and `var(--z3-tint)` for 15% fill) |
| TypeScript | `tokens.zone.z3` / `tokens.zone.z3Tint` |

### Spacing step (e.g. 16pt card padding)

| Surface | API |
| --- | --- |
| iOS SwiftUI | `Theme.Spacing.l` |
| Web CSS | `var(--s-l)` / Tailwind `p-l` (custom utility) or `p-4` |
| TypeScript | `tokens.spacing.l` (number, in pt/px) |

### Radius `14pt`

| Surface | API |
| --- | --- |
| iOS SwiftUI | `Theme.Radius.l` |
| Web CSS | `var(--r-l)` |
| TypeScript | `tokens.radius.l` |

### Display type (Archivo italic 900, 56/1.0)

| Surface | API |
| --- | --- |
| iOS SwiftUI | `Theme.Typography.display` (Font) — and `Theme.Typography.displaySpec` for size/weight/italic tuple |
| Web CSS | `var(--type-display)` shorthand or class `.display` |
| TypeScript | `tokens.typography.display` |

## Hard rules

- Orange (`#F06A2A`) is **never** in the HR zone palette. Z1–Z5 are gray/blue/green/amber/red.
- Hex values are uppercase in source files (`#F06A2A`, not `#f06a2a`). CSS may present them lowercase but normalize when adding new tokens.
- Don't introduce new colors that aren't in `colors_and_type.css` without updating that file first.
- Dark mode is the only mode. No light variant exists.
