# FAHYBRIK Design System — Agent Skill

You are working inside the **FAHYBRIK design system**. Read `README.md` and `colors_and_type.css` before producing any visual artifact.

## Brand at a glance

- Premium HYROX / hybrid-training platform. Single-coach (Pablo, Fabrik Training Club Barcelona).
- Two surfaces: iOS app (athletes, Swift) + Next.js coach dashboard.
- **Dark only** (`#0A0A0A`). Single accent: **Fabrik orange `#F06A2A`** — used sparingly.
- Italic-bold display typography (Archivo 800/900) + Geist sans/mono.
- Wordmark always rendered as `[F]AHYBRIK` with bracketed orange `F`.
- Voice: Spanish (Castilian, `tú`), spare, precise, no motivational filler. Anchor: *"Entrenar al detalle."*
- **No emoji.** Use `▶ ✓ ✗ ▲ ▼ · → ←` glyphs in body font.

## Files

- `README.md` — full identity, content fundamentals, visual foundations, iconography.
- `colors_and_type.css` — drop-in CSS variables and semantic classes (`.btn-primary`, `.card`, `.zone-pill`, `.wordmark`, etc.).
- `preview/` — one card per atom (colors, type scale, buttons, pills, RPE, lap button, zones chart, etc.).
- `ui_kits/ios/` — high-fidelity React recreation of the iOS app (Auth, Onboarding, Today, Workout Active). Open `index.html`.

## Quickstart for new artifacts

1. `<link rel="stylesheet" href="<path-to>/colors_and_type.css">`
2. Set `<body style="background: var(--bg); color: var(--fg)">`
3. Use `.wordmark` with `<span class="f">[F]</span>AHYBRIK` for the brand mark.
4. Reach for `.card`, `.btn-primary`, `.pill`, `.zone-pill[data-zone="Z4"]`, `.section-label`, `.data-hero`.
5. Spacing: `--s-xs..--s-xxxl` (4·8·12·16·24·32·48). Radius: `--r-s..--r-xl` + `--r-pill`.

## Hard rules

- No light theme. No gradients. No backdrop-blur in product. No emoji. No motivational copy.
- Orange is **never** used inside HR-zone charts; zones use the Z1–Z5 palette.
- Numbers carry the design — italic-bold, monospaced-digit, paired with UPPERCASE units.
- 24px screen edge padding · 16px card padding · 1px hairlines `rgba(161,161,161,0.18)` between rows.
- Animations: fades and slides only, 180–320ms `easeInOut`. No springs, no bounces.

## Substitution flags

- Archivo + Geist load from Google Fonts CDN (the iOS app uses SF Pro Italic Heavy natively).
- Lucide is the recommended web substitute for SF Symbols (`layout-grid`, `bar-chart-3`, `settings`, etc.).
- No photography ships in this system — use neutral placeholders or ask the user.
