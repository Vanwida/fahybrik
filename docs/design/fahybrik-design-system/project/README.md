# FAHYBRIK Design System

**FAHYBRIK** is a premium HYROX / hybrid-training platform — a single-coach, elite-athlete iOS app + Next.js coach dashboard. Multi-coach by design; Pablo (Fabrik Training Club Barcelona) is the pilot coach. Templates are authored by the coach and selected/adapted by IA via RAG over HIS OWN methodology — the product hardcodes no school of periodization.

Two surfaces:

- **iOS app (athletes)** — Swift native, iPhone 17 Pro target. Black + Fabrik orange. Italic-bold display typography derived from the Fabrik wordmark. Whoop-style density, but workout-first (not recovery-first).
- **Web dashboard (Pablo)** — Next.js + Tailwind + shadcn, dark theme, same brand language.

This design system is the source of truth for any new visual artifact made for FAHYBRIK — slides, mocks, prototypes, marketing pages, in-app screens.

## Sources used to build this system

- `FAHYBRIK/` mounted codebase (read-only via local FS)
  - `ios/FAHYBRIK/Theme/Theme.swift` — color, spacing, radius, typography tokens
  - `ios/FAHYBRIKCore/Theme/ZoneColors.swift` — HR zone palette (Z1–Z5)
  - `ios/FAHYBRIK/Assets.xcassets/Brand*.colorset` — brand color hex values
  - `ios/FAHYBRIK/Onboarding/Components/*.swift` — buttons, chips, input rows, progress dots
  - `ios/FAHYBRIK/Workout/{ActiveWorkoutView, PreWorkoutBriefView, PostWorkoutSummaryView, DataGrid, LapButton, HRZoneBadge}.swift`
  - `ios/FAHYBRIK/Today/TodayView.swift`
  - `ios/FAHYBRIK/Auth/AppleSignInView.swift`
  - `web/app/{layout.tsx, page.tsx, globals.css}` — Tailwind tokens, fonts (Geist + Archivo)
  - `docs/ux/*.md` — signed-off UX specifications (workout execution, today, onboarding, etc.)
- GitHub: `Vanwida/fahybrik` — same source, mirrored

## Index

- `README.md` — this file. Identity, content fundamentals, visual foundations, iconography.
- `colors_and_type.css` — CSS custom properties for color, typography, spacing, radius. Use this in any HTML artifact.
- `fonts/` — Archivo (display, italic 800/900) + Geist (sans + mono). Substituted from Google Fonts via CDN; flagged below.
- `assets/` — wordmark, glyph, icon notes, neutral imagery placeholders.
- `preview/` — design-system cards for the Design System tab. One sub-concept per card.
- `ui_kits/ios/` — high-fidelity SwiftUI-equivalent React recreation of the iOS app: AppleSignIn, Today, Pre-Workout Brief, Active Workout, Post-Workout Summary, Onboarding step.
- `SKILL.md` — agent skill manifest (cross-compatible with Claude Code).

---

## CONTENT FUNDAMENTALS

### Voice

FAHYBRIK speaks **Spanish first** (Castilian Spanish from Barcelona). The coach is Pablo and the athlete is being addressed in **second-person singular informal (`tú`)** — never `usted`, never `we`. This is intimate elite coaching, one-on-one. English is reserved for technical performance vocabulary that the sport itself uses (HYROX, AMRAP, EMOM, FTP, RPE, sled push, wall ball, ski erg). Don't translate those.

### Tone

- **Spare. Confident. No selling.** The athlete already opted in. Stop convincing them.
- **Precise.** Every number is real. Don't hedge ("approximately", "around"). Say `42 días`, `48 bpm`, `+12% vs LW`.
- **Coach-shorthand.** Mimics how a serious coach actually talks: clipped, imperative, mid-sentence. Examples from the codebase: *"Mantén la cadencia controlada en run. Sled all-out."*, *"Bien metido. Mantén."*, *"Entrenar al detalle."*
- **No motivational filler.** No "You got this!", no fire emojis, no exclamation marks. Maximum one period per sentence; periods are optional in section labels.
- **Anchor phrase:** *"Cuanto más sepa Pablo, más preciso será tu plan."* Onboarding length is justified by precision, not apologized for.

### Casing

- **Section labels:** `UPPERCASE TRACKED` (`TU CUERPO`, `ESTA SEMANA`, `CARGA`, `ZONAS`, `POR SEGMENTO`). Letterspacing ~1.6.
- **Data labels inside cells:** `UPPERCASE`, very small (`HR`, `LAP`, `TOTAL`, `DIST`, `PACE TGT`, `POWER TGT`).
- **Headlines:** Sentence case, italic-bold, often a fragment (`Bienvenido.`, `Tu cuerpo`, `Esta semana`).
- **Buttons:** Sentence case (`Empezar`, `Siguiente`, `Guardar`, `Reanudar`). The `▶` glyph prefix is used for primary workout starts only (`▶ Empezar`).
- **Body copy:** Sentence case Spanish.

### Numbers and units

Numbers carry the design. Display them prominently in monospaced italic-bold. Always pair with an UPPERCASE unit label: `168` + `BPM`, `47:23` + `TOTAL`, `75` + `CTL`. Use `·` (middle dot) as the universal separator: `For Time · ~52 min`, `HYROX BCN · 42 días`, `REAL · semana 2 · día 4`. Never hyphens, never em-dashes.

### Wordmark

Always written `[F]AHYBRIK`. The bracketed `F` is **Fabrik orange** `#F06A2A`; the rest is foreground white. Italic-bold display. Never use the brand name in non-display contexts unless rendered with this exact treatment.

### Emoji

**No.** Never use emoji in product copy or marketing. Allowed substitutes:

- `▶` (U+25B6) — primary "start workout" affordance
- `✓` `✗` — success / failure (status badges, connection state)
- `▲` `▼` `─` — trend up / down / flat
- `·` — separator
- `→` `←` — flow direction
- `“ ”` — coach-quote indent
- `○ ●` — radio / check-in scale dots

These are unicode glyphs, not emoji. Render them in the regular text font.

### Specific copy examples (lifted from codebase)

- Welcome subhead: *"El siguiente paso es que Pablo conozca tu cuerpo. Cuanto más sepa, más preciso será tu plan."* + *"~10 min"*
- Sign-in tagline: *"Entrenar al detalle."*
- Workout context line: *"REAL · semana 2 · día 4"*
- Countdown: *"HYROX BCN · 42 días"*
- Status pill: *"Recovery 72% · OK"*
- Primary CTA: *"▶ Empezar"*
- Pause modal: *"Pausa"* / *"Auto-resume en 10s si no confirmas."*
- Coach note: *"Mantén la cadencia controlada en run. Sled all-out."*
- Outlier confirm: *"¿180kg deadlift? Confirmar"*
- Done state: *"Pablo está armando tu plan"*

---

## VISUAL FOUNDATIONS

### Mode

**Dark only.** No light theme exists, by explicit owner decision. All artifacts deliver on `#0A0A0A` background. Don't invent a light variant.

### Colors

Three layers, from background out:

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0A0A0A` | Page background. Never pure black `#000`; we want a touch of warmth so OLED doesn't smear. |
| `--surface` | `#141414` | Cards, data cells, input rows, modals. |
| `--surface-elevated` | `#1F1F1F` | Pressed/active rows, secondary buttons, nested elevation. |
| `--fg` | `#F5F5F5` | Primary text, headlines, hero numbers. Never pure `#FFF`. |
| `--muted` | `#A1A1A1` | Secondary text, labels, captions, icons. |
| `--accent` | `#F06A2A` | **Fabrik orange.** Single accent. Primary CTA, brand `[F]`, focus ring, progress dots filled, RPE selected, lap-button fill, coach-note left-bar. Use sparingly — it earns attention by being rare. |
| `--ok` | `#3FC773` | Success, positive trends, recovery good. |
| `--warning` | `#F2A52E` | Caution. |
| `--danger` | `#F23F3F` | Error, abandon, alert. |

**HR zones** (workout-only chart palette — orange is forbidden here):

| Zone | Hex | Meaning |
|---|---|---|
| Z1 | `#C7C7C7` | recovery (gray) |
| Z2 | `#4D9EEB` | aerobic base (blue) |
| Z3 | `#4DC773` | tempo (green) |
| Z4 | `#F2B833` | threshold (amber) |
| Z5 | `#EB4D4D` | VO₂ / red line (red) |

### Typography

Two families:

1. **Archivo** — display + heading. Used at weights 800 / 900, **italic**, large. This carries the brand. The wordmark `[F]AHYBRIK` is Archivo Black Italic. Headlines (`Bienvenido.`, `Tu cuerpo`) and hero numerals (`168`, `47:23`, `42`) all italic-bold-900. Tracking slightly tight on display, normal on headings.
2. **Geist Sans** — body, labels, UI. 400 / 500 / 600. Section labels are 11px / 600 / `letter-spacing: 0.16em` / `text-transform: uppercase`. Body 16/regular. Caption 12/medium.
3. **Geist Mono** — only inside `monospaced-digit` data values when reading numbers in a tight grid.

Type scale (matches `Theme.Typography`):

```
display     56 / 900 italic
headline-l  38 / 900 italic
headline-m  28 / 900 italic
headline-s  20 / 700 italic
body         16 / 400
body-emph    16 / 600
small        13 / 500
caption      12 / 500
data-digit   36 / 900 italic monospaced-digit
data-hero    96 / 900 italic monospaced-digit
data-label   11 / 600 uppercase letter-spacing 0.16em
```

### Spacing and radius

Spacing scale: `4 · 8 · 12 · 16 · 24 · 32 · 48`. (xs s m l xl xxl xxxl.)
Radius scale: `6 · 10 · 14 · 20`. (s m l xl.) Workout cards use `l (14)`. The LAP button and modals use `xl (20)`. Pills are full `9999`.

### Layout rules

- **Tab bar** (iOS, 5 tabs: Today / Plan / Stats / Chat / Profile) — fixed bottom, surface background, accent tint on selected.
- **Above-the-fold rule:** the workout HERO card must be visible without scrolling. Countdown + microcycle context above it; metrics scroll.
- **Edge padding:** 24px horizontal on screens. 16px inside cards. 12px on dense rows.
- **Card stack pattern:** rows separated by 1px `rgba(161,161,161,0.18)` hairlines, not gaps — keeps density Whoop-like.
- **Active workout = chrome-free.** Hide the tab bar; everything is data.

### Backgrounds

- Solid `#0A0A0A`. **No gradients, no images, no patterns** in any product surface.
- Marketing/slide surfaces may use a single full-bleed athletic photo (warm-toned, gym/HYROX, slight grain) with `mix-blend-mode: luminosity` over `#0A0A0A` and a 60–80 % black overlay. Keep it muted; the numbers are the hero.
- The `[F]` glyph in the wordmark is the only "brand mark" treatment. No swooshes, no radial glows, no AI-gradient slop.

### Borders and dividers

- 1px hairlines `rgba(161,161,161,0.18)` between rows in a card.
- 1px stroke `rgba(255,255,255,0.10)` on outlined cards / secondary buttons.
- Cards usually have **no border** — separated by surface color shift only.
- Focus ring: 2px outset accent orange.

### Shadows

Almost none. Dark UI doesn't need them. The one exception:

- `--shadow-card: 0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.4)` on the workout hero card and modal sheets only.

### Corner radii in use

- Pills (chips, zone badges, status badges, RPE buttons): `999px`
- Input rows / segment list rows: `10px`
- Cards (hero, data grid 2x2, modals): `14px`
- LAP button + bottom-sheet: `20px`

### Hover / press states

This is a touch-first iOS app, so press states matter more than hover.

- **Press primary button:** scale 0.98, no color change. Haptic `medium`.
- **Press secondary button:** background fades to `--surface-elevated`. Haptic `light`.
- **Press chip (selected):** orange fill, white label. Unselected fills surface; outline `rgba(161,161,161,0.35)`.
- **Press LAP:** fill flashes `--ok` (green) for 200ms, haptic `medium`, then back to orange.
- **Pressed list row:** `--surface-elevated` background.
- **Web hover** (dashboard only): `opacity: 0.9` on text links, surface lift to `--surface-elevated` on rows.

### Animations

- Onboarding step transition: horizontal slide + fade, `easeInOut`, **280ms**.
- Pause modal: cross-fade 200ms.
- LAP flash: 180ms ease-out → 160ms ease-in.
- Countdown card on load: subtle slide-down (12px) + fade, 320ms.
- **No bounces. No springs. No parallax.** This is a measurement instrument, not a delight machine.

### Transparency / blur

- Pause modal scrim: `rgba(0,0,0,0.55)`. **No backdrop-filter blur** — keeps it readable on OLED, no GPU cost mid-workout.
- Status badges use 15 % alpha tint of their semantic color (e.g. `Z4` = amber-15).

### Imagery vibe

When photography is used (rare — slides, marketing, About-Pablo screen):

- Warm-leaning highlights, deep neutral shadows. Slight film grain.
- Gym, HYROX equipment, athlete-mid-effort. Sweat, chalk, sled-track lines on rubber. No staged corporate fitness.
- Black-and-white is acceptable for portrait shots of Pablo; never for action.
- Saturation -20 from native. Never crush blacks below `#0A0A0A`.

### Data-density discipline

Every number on screen must be earned. The layout is **dense** like a Garmin watch face — that's the point. Don't add chartjunk, don't repeat units that the column header already shows, don't decorate metrics with icons.

### Card recipe (the one card)

```
background: var(--surface);
border-radius: 14px;
padding: 16px;
gap-between-rows: 1px hairline (rgba(161,161,161,0.18))
no border, no outer shadow on dark, optional inset top hairline rgba(255,255,255,0.04)
```

That single recipe covers ~90 % of all card surfaces in the product. Variants only change padding (12 inside dense rows) or add a left accent bar (2px orange) for coach-quote callouts.

---

## ICONOGRAPHY

### Approach

**SF Symbols on iOS.** The native app uses Apple's system icon font directly via `Image(systemName: "...")`. There is no custom iOS icon set. Common ones in the codebase:

- `circle.grid.2x2` — Today tab
- `calendar` — Plan tab
- `chart.bar` — Stats tab
- `message` — Chat tab
- `person` — Profile tab
- `gearshape` — settings
- `chevron.left` — back
- `xmark` — close
- `pause.fill` / `play.fill` — workout pause/resume

For **HTML artifacts** built against this design system, substitute with **Lucide** (closest stroke weight + style match to SF Symbols Light). Pin via CDN:

```html
<script src="https://unpkg.com/lucide@latest"></script>
```

Lucide ↔ SF Symbol mapping:

| SF Symbol | Lucide |
|---|---|
| `circle.grid.2x2` | `layout-grid` |
| `calendar` | `calendar` |
| `chart.bar` | `bar-chart-3` |
| `message` | `message-square` |
| `person` | `user` |
| `gearshape` | `settings` |
| `chevron.left` | `chevron-left` |
| `xmark` | `x` |
| `pause.fill` / `play.fill` | `pause` / `play` |

> **Substitution flag:** Lucide is not in the codebase — it's a CDN substitute for SF Symbols when rendering web artifacts. If pixel-perfection is needed, export the SF Symbols as SVG from Apple's app and drop them in `assets/icons/`.

### Unicode glyphs (in-product)

Used as semantic icons in text flow — no SVG needed:

- `▶` start
- `✓` ✗ status
- `▲` `▼` `─` trend
- `·` separator
- `→` `←` arrow
- `○` `●` scale dots (RPE, check-in)
- `“ ”` coach quote

Render in the body font; no emoji color rendering ever.

### Logos / wordmark

The brand mark is **typographic, not iconographic.** There is no shield, no monogram outside of the bracketed `[F]`. See `assets/wordmark.html` for the canonical render. Whenever you write the brand name, render it with the bracketed orange `F`.

### Emoji

**Never** in product, marketing, slides, or this design system. Bullets are `·` or hairline rows.

---

## Caveats and substitutions

- **Fonts:** Archivo and Geist are loaded from Google Fonts CDN in this design system. The native iOS app uses `Font.system()` (San Francisco) italic-bold; visually similar but not identical to Archivo. If you need 1:1 iOS-app screenshots, substitute SF Pro Display Italic Heavy.
- **Icons:** Lucide is a substitute for SF Symbols (see above).
- **Imagery:** No photography is provided in the codebase. Use placeholders.
- **Logo:** No standalone logo file exists; the wordmark IS the logo. Rendered as text.
