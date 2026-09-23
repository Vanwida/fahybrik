> Informe de área de la auditoría del panel del coach (23-sep-2026). Resumen y propuesta: [../index.html](../index.html). Las capturas citadas vivían en el scratchpad de la sesión de auditoría y no están en el repo; las clave están en [../img/](../img/). Entorno: Postgres local con 100 atletas sintéticos (ver apéndice del índice).

# E · Visual system, consistency, responsiveness, dark mode, a11y, performance

Auditor E. Evidence: `shots/desk/*` (existing), `shots/E-dark/*`, `shots/E-mob/*`, `shots/E/*` (all under the scratchpad), and scripts in `scratchpad/E/*.mjs`. All counts leave out the athlete-app mockups in the guide (`components/v2/guia/`) unless stated otherwise.

---

## 1. Verdict

**Rebuild the visual layer from scratch. Keep the token plumbing and the theming mechanism.** Most of the colour tokens are sound. What's missing is an actual *system* on top of them. **Main problem:** there is no type scale or component layer being enforced, so every one of the 297 components hand-rolls its own look. The result is 31 font sizes, 143 different button styles, 48 hand-built modals and 5 tab styles. On top of that there is one accent colour that simultaneously means "selected", "primary action", "active filter" and "today". What Alex experiences as "I don't like how it looks" comes from four measurable things:

1. **Text is too small.** 45–56 % of the text on Hoy, the athlete profile, Microciclo and Biblioteca is under 12 px.
2. **Surfaces barely separate.** Card vs. canvas contrast is 1.13:1 in light and 1.07:1 in dark.
3. **Colour means nothing stable.** The same green means *done*, *circuit* and *Z1*; "Atención" is red on one screen and amber on another.
4. **Hierarchy is inverted.** A 36 px page title is the loudest thing on every screen, while the numbers a coach acts on are 11–14 px.

---

## 2. Findings

### 2.1 Tokens and type (system level)

| # | Finding | Evidence | Sev | Fix |
|---|---|---|---|---|
| T1 | **31 distinct font sizes** in the panel: 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 15.5, 16, 17, 18, 19, 20, 21, 22, 24, 26, 27, 28, 30, 36, 40, 42, 52 px, plus 1.05 rem and 1.2 rem. A professional scale uses 6–8. A single screen (athlete Resumen) renders **16 sizes**. | grep over `text-[Npx]` plus named utilities; `E/computed.mjs` on `/es/atletas/11` | P1 | Replace with the 8-step scale in §4.2. Lint-ban `text-[…px]`. |
| T2 | **Text is typeset like footnotes.** 62 % of size declarations are ≤12 px and 33 % are ≤11.5 px (649 of 1,944). Share of rendered text under 12 px: Hoy **50 %**, Biblioteca **56 %**, Microciclo **53 %**, Athlete **45 %**. | `E/computed.mjs` output | **P0** | Body text is 13–14 px. Only 11 px uppercase labels may go below 12. |
| T3 | Half-pixel sizes (9.5, 10.5, 11.5, 12.5, 13.5, 15.5) appear 60 times. They blur on 1× screens and have no reason to exist. | same grep | P2 | Delete them. |
| T4 | Weights: semibold is used 665 times, bold 266, extrabold 20, normal only 5. With nearly everything semibold, weight carries no hierarchy. | grep `font-*` | P1 | Use 400/500/600 only; 700 for display numbers. |
| T5 | **19 different letter-spacing values** (0.02–0.15 em, −0.04 to −0.01 em). There are 343 uppercase tracked labels (`v2-micro` ×237 plus `text-eyebrow` ×106), so almost every block starts with a small shouting caps label ("REFERENCIAS", "SENTADILLA", "ESTA SEMANA"). | grep `tracking-*` | P1 | Allow one caps style, only for table headers and section eyebrows. |
| T6 | `--text-*` tokens exist in `app/globals.css:67-72` (9/10/11/13/15/18), but **9 px and 10 px are official steps**. The scale was built bottom-up from existing usage, not designed. | `web/app/globals.css:52-72` | P1 | New scale; minimum is 11 px, caps only. |
| T7 | Theme hygiene. The shadcn bridge is **duplicated**: two `.v2-root {…}` blocks, and the second silently overrides `--card-radius` from 14 to 16. `--v2-r-block` is used but never defined, so those elements get square corners. | `v2-theme.css:190-214` vs `216-258`; `components/v2/club/ClubSkinPreview.tsx:82,180` | P2 | Keep one bridge block and define or remove `r-block`. |
| T8 | **Radii**: 9 token steps plus raw 14/6/2/10 px and `rounded-full`. One rendered screen shows 7–8 radii (6, 8, 10, 12, 14, 16, pill). Cards are 14 in 56 places and 16 in 48. | grep; `E/computed.mjs` | P1 | Three radii: 6 / 10 / full (§4.3). |
| T9 | **Spacing**: 35 distinct padding values, including 13/15/18/19 px arbitraries. Gap values in use: 0.5/1/1.5/2/2.5/3/3.5/4/5/6/8. There are also 5 control heights (28/32/36/40/44 px) plus padding-sized controls. | grep `p*-`, `gap-`, `h-` | P1 | Spacing {4, 8, 12, 16, 24, 32, 48}; control heights {28, 32, 40}. |
| T10 | **Fonts shipped vs used.** The root layout injects @font-face for 6 families (37 faces: Geist, Geist Mono, Archivo ×12, Archivo Narrow ×9, Bricolage, Figtree) into every panel page. The panel uses 2 of them. | `web/app/layout.tsx:25-49`; served CSS | P2 | Move Geist/Archivo into the landing and athlete-mockup layouts. |

### 2.2 Components (system level)

| # | Finding | Evidence | Sev | Fix |
|---|---|---|---|---|
| C1 | **The primitive layer exists but isn't used.** `components/ui/button.tsx` is a correct cva + Base UI Button. There are **553 raw `<button>` vs 9 `<Button>`** (4 files), **105 raw `<input>` vs 4 `<Input>`**, and 30 raw `<select>`. The same diagnosis was written on 14 Aug in `docs/design-system-web.html` ("Los primitivos existen. Nadie los usa."). Five weeks later it's unchanged. | grep | **P0** (root cause of all the drift) | Rebuild on primitives. Lint-ban raw `<button className=…>` in `components/v2`. |
| C2 | **143 distinct visual signatures** across the 300 buttons that have a static className. Primary filled buttons alone come in **36 combinations**: shape (pill ≈ 62 %, 8 px ≈ 25 %, 6 px, full), height (20/28/32/36/40 px), size (9–14 px). The same "delete microcycle" confirmation is a pill in one modal and an 8 px rectangle in another. | `E/btn.mjs`, `E/prim.mjs`; `planes/DeleteMicrocicloModal.tsx:95` vs `atleta-detalle/BorrarMicrocicloCadenaModal.tsx:160` | P0 | One Button: 4 variants × 3 sizes (§4.4). |
| C3 | `BTN_BASE` is copy-pasted in **9 files** with 4 different definitions: h-7 pill 11 px; h-8 8 px 12 px; 8 px 13 px with no height; h-9 pill. | `hoy/AsignacionSugeridaCard.tsx:53`, `hoy/AjusteSemanalCard.tsx:23`, `hoy/SiguienteMicrocicloCard.tsx:25`, `hoy/LaneCard.tsx:39`, `atletas/CoachGuidanceEditor.tsx:29`, `atletas/DoublesPairsPanel.tsx:25`, `atletas/DoblesSimulationEditor.tsx:43`, `lifecycle/lifecycle-ui.tsx:17`, `ajustes/controls.ts:19` | P1 | Covered by C2. |
| C4 | Pills: `<Pill>` is used 93× (good). There are also **≥39 hand-rolled chip spans in 25 variants** (radius pill/6/4/full × size 9/10/11/12 × caps or not). | `E/pill.mjs` | P1 | Split into two primitives: `StatusBadge` (icon + label, 4 tones) and `Tag` (neutral metadata). |
| C5 | **48 hand-built modal overlays** (`fixed inset-0`), no shared Dialog. 16 have no Escape handling and 33 do no focus management. Only 23 use `ModalPortal`. | grep | P1 | One `Dialog` + one `Sheet` on Base UI (already installed). |
| C6 | **5 tab styles**: underline tabs (profile), filled segmented pills (Carrera/Fuerza/Cuerpo, Datos/1:1/Pagos), underlined text links (Cómo aterriza/…), S1–S4 week tabs with dots, and filter chips. Rendimiento stacks three of them in 90 px. `SegmentedControl` declares `role="tablist"` but has no arrow-key handling. | `shots/desk/04c-atleta-rendimiento.full.png`; `components/v2/SegmentedControl.tsx:31-60` | P1 | Two primitives: `Tabs` (one level per page) and `SegmentedControl` (view toggles). |
| C7 | **Two status systems that disagree.** "Atención" is **red** in the roster (`lib/dashboard/v2/atletas-status.ts:42`) and **amber** in `StatusDot` (`components/v2/StatusDot.tsx:18`, shown in the Mensajes context panel). `StatusDot` also paints `alta` (a new client, which is good news) in danger red. | `shots/E/mensajes-desk.png` vs `shots/E/atletas-tabla-light.png` | P1 | One status enum → {label, tone, icon}. |
| C8 | None of the 15 primitives promised by `docs/design/hoy-redesign/SPEC.md:239` exist: StatusChip, ReadinessRing, TrajectoryChip, AdherenceDots, BulkActionBar, UndoToast, DetailSidePanel, SavedViews, CommandPalette, SkeletonRow, ErrorState and others. `aria-sort` appears 0 times, although the spec required it. | grep | P1 | Put them on the rebuild primitive list (§4.4). |
| C9 | The Sparkles icon (`auto_awesome`) is used 3 times, against CLAUDE.md. | `atleta-detalle/ZoneCalculator.tsx:72`, `ClasificacionCard.tsx:130`, `intake/IntakeReview.tsx:235` | P2 | Replace with a neutral glyph. |

### 2.3 Screens (visual judgement, light, 1440×900)

**Shell (all pages).**
- The left chrome takes **292 px (20 %)**: a floating 236 px sidebar with 16 always-expanded items plus insets. Content gets 1,124 px.
- The 56 px top bar holds only a theme toggle and the account menu (`V2Shell.tsx:49`).
- Page titles are 36 px Bricolage bold (`v2-display text-4xl`), often two-tone ("Atletas **· 100**" in grey, "Microciclo ·" in grey). On every screen the title outweighs the data.
- Height of chrome before first content (fold 900): Métricas 189, Atletas 265, Hoy 278, Periodización 331, **Biblioteca 372 px (41 %)**. The cause is stacked explainers: a "PASOS 2–3 DE 4" strip, a "Cómo funciona" callout and an info line (`07-biblioteca-bloques.png`).
- Severity P1. Fix: 20–24 px titles, a 64 px icon rail, and one onboarding checklist instead of per-page strips.

**Hoy (`02-hoy.full.png`, 2,597 px tall).**
- "**92 decisiones**" is a 36 px number in **danger red**. It's the sum of 6 counters, including *suggestions* (`hoy/HoyBoard.tsx:151-173`). At 100 clients it will always be red, so red stops meaning anything. **P1**: headline count in ink; red only on the specific items that are overdue.
- "Asignación sugerida" shows 8 identical cards: the same sentence "Todavía no tiene ningún bloque", the same "Tu método" paragraph, the same 3 buttons. Each is 236 px tall with **amber (warn) borders used as decoration**, plus an amber-outlined "Crear receta" button. Warn colour is being used as styling. **P1**.
- The 6 "Revisar alta" buttons are full-width black bars, the heaviest shapes on the page, for the least urgent task. **P1**.

**Atletas (`01-atletas.png`, `E/atletas-tabla-light.png`).**
- Cards are 255×129 px, so 12 athletes are visible out of 100.
- The status dot top-right is **colour-only** (`RosterCards.tsx:53`, `showLabel={false}`), and 90 % of cards show the same green dot, which is noise.
- The table view has 49 px rows, 11 visible, and the last column is clipped at 1440 ("ÚLT. RI…") because the right rail takes 320 px.
- The rail's "Dobles · 0" header and its two buttons wrap onto 2 lines at 1440, in both themes (`E-dark/01-atletas.png`).
- The table is a CSS grid of `<div>`s: no table, row or columnheader roles (`atletas/grid.ts:24`).
- Severity P1.

**Athlete profile (`04-atleta-resumen.png`, `04e`, `04g`).**
- Readiness is shown three ways across the product: "42" in ink here, "43" in red in the Mensajes context, and "Readiness 52%" in the Hoy lane.
- The race countdown is "4 semanas · 17 oct" on Resumen and "faltan 24 días" on Atleta.
- Dates appear as "2026-09-22" on the session page and "22 sept" elsewhere.
- The session detail page is a 1440 canvas with a single card, "Esfuerzo 7" (`04g`).
- Severity P1: one format per quantity.

**Microciclo (`05-microciclo.png`, `05b`).**
- Four levels of nested containers: page → grey board → white summary card → day column → session card → block card.
- Day headers read "MIERCOLES" and "SABADO" without accents, while "MIÉ/SÁB" is used elsewhere.
- Block titles are truncated at 150 px columns ("Fuerza base · senta…").
- The 5-colour modality bar and the S1–S4 coloured dots have **no legend**.
- Severity P1.

**Rendimiento (`04c-atleta-rendimiento.full.png`).**
- Six cards, each containing only a dashed box of explanatory prose. The empty states are the whole page. **P1**: collapse into one line, "Sin series con ritmo en 4 semanas".

**Mensajes (`E/mensajes-desk.png`).**
- The 3-pane structure is right.
- It breaks the page grid: the list starts at x=285 instead of 292, and the right panel ends at 1423 instead of 1416. P2.

**Pagos (`12-pagos.png`).**
- The calmest and most legible screen: a plain table, 40 px rows, labelled status pills. **This is the density and tone the rest should match.**

### 2.4 Colour semantics

- **S1. Categorical and status hues are the same colours** (`v2-theme.css:54-76`). Modality *circuito* = `--v2-ok` #2f7050, *ergo* = `--v2-info` #46688c, *carrera* #c0453a ≈ danger, *fuerza* #a9791d ≈ warn. Zones Z1–Z4 reuse the same four. So a running block is "red = failed" and a circuit is "green = done". The dataviz validator on the light modality palette **FAILS** chroma (3 slots read grey), CVD (ΔE 4.7) and normal vision (ΔE 11.1 between calentamiento and circuito). **P1.**
- **S2. The accent does four jobs**: primary action, nav selection, active filter/segment, and "HOY"/"today" markers (`v2-theme.css:22-24` says so explicitly).
  - With the default ink accent, every screen has 3–5 solid black blobs.
  - I **injected the club skin that the server derives for Fabrik orange** (`buildClubAccent('#F06A2A')`, client-side only, `E/skin.mjs`). Orange then takes the nav, all 6 "Revisar alta" bars, section icons, badges, the intro strip, "Estás aquí" and the S3 cell.
  - It sits beside amber "Borrador"/"sin dosis" and the red "92", so **accent, warning and danger become one warm smear** (`E/skin-orange-hoy-light.png`, `E/skin-orange-plan-dark.png`).
  - The collision check (`shared/domain/coach/club-accent.ts:57-61`) returns `null` for #F06A2A vs amber #b36a00.
  - **P0 for the multi-coach promise**: any saturated club colour turns the panel into a highlighter.
- **S3.** Warn amber is used decoratively (Asignación borders, "Crear receta" outline). Danger is used for a headline count. Both are P1.

### 2.5 Dark mode (`shots/E-dark/*`)

**Keep.** Tokens are complete, and the semantic colours pass AA with room to spare (ok 8.45, warn 8.95, info 6.50 on surface). It already looks more like the Whoop reference than the pearl theme does.

Problems:
- Primary actions become **white pills**. On Hoy that is 6 white full-width bars, the brightest objects on screen (`E-dark/02-hoy.png`).
- Surface vs bg is 1.07, so separation depends only on an 8 % white border.
- **`--v2-faint` #6e6e6e is 3.61:1 on surface and fails AA.** It is the colour of all 237 `v2-micro` labels and 507 faint texts, despite the token comment "mínimo permitido en texto pequeño".
- White text on dark danger #f2504f is 3.8:1 (fails).
- There is no `<meta name="theme-color">`, and the manifest hard-codes `#F1EFEB`, so the installed PWA shows a pearl status bar and splash screen over a dark UI (`web/app/manifest.ts:15-16`).

### 2.6 Mobile 390 px / PWA (`shots/E-mob/*`)

- **Hit targets**: on Hoy **84 of 118 targets are under 32 px** and 91 are under 44 px. Buttons are 28 px ("Reponer bloque" 118×28, the close X 16×16). Microciclo has 27 of 50 under 44 px. **P0 for a phone-first PWA.**
- **Page length**: Hoy is **7,698 px** long (about 9 screens); Atletas' first athlete card sits at y≈555 of 844.
- **Layout breaks**:
  - The Biblioteca segmented control is 416 px wide in a 390 viewport, so "Comunicados" is clipped (`E/overflow.mjs`).
  - The profile tabs wrap to 2 rows, leaving "Atleta" alone on the second row (`E-mob/04-atleta.png`).
  - The intro callout squeezes its prose into a ~150 px column next to a no-wrap "Cómo funciona" (`orientacion/IntroStrip.tsx:75-87`, `E-mob/02-hoy.png`).
- **Offline**: the service worker has no `fetch` handler (`public/sw.js`), so nothing is cached and there is no offline shell.

### 2.7 Accessibility

| Check | Result |
|---|---|
| Contrast, light | fg 16.2, muted 7.55: fine. **faint** 4.62 on bg, but **4.38 on surface-2 (fail)**. **warn #b36a00: 3.67 bg / 4.15 surface / 3.48 surface-2, fails AA** (64 text uses + 12 warn pills: "No lo ve", "Borrador", "sin dosis · tócalo y escríbela", "sin tipar"). Fuerza modality text 3.18–3.80 (fail, 14 uses). |
| Contrast, dark | faint **3.61 on surface (fail)**; white on danger 3.8 (fail). |
| Non-text | light border vs surface 1.28, card vs canvas 1.13. Cards are hard to see for low-vision users. |
| Focus | **Good**: 45/45 tab stops on `/es/atletas` show the 2-layer ring (`v2-focus`, 678 uses). |
| Keyboard | **32 Tab presses before the first athlete.** No skip link. No global shortcuts: no ⌘K, j/k or "/" outside the day editor (`editor/QuickAddLine.tsx:46`). Segmented tabs ignore arrow keys. |
| Semantics | Roster table has no table/row/header roles; 0 `aria-sort` in the product. |
| Colour-only | Roster card dot, microciclo modality bar, S1–S4 week dots. |

### 2.8 Performance (dev server, so absolute JS numbers are inflated; relative findings hold)

| Route | Warm TTFB / total | HTML | Scripts (dev) | Fonts |
|---|---|---|---|---|
| /es/hoy | 0.89 / 2.12 s | 245 KB | 37 req / 1.25 MB | **4.14 MB** |
| /es/atletas | 0.64 / 1.71 s | 345 KB | 43 / 1.40 MB | 4.14 MB |
| /es/mensajes | 0.60 / 1.76 s | 161 KB | — | — |
| /es/atletas/11 | 0.26 / 0.40 s | 152 KB | 50 / 1.78 MB | 0.23 MB |
| /es/microciclos/2 | 0.31 s | 122 KB | 43 / 1.69 MB | 4.11 MB |
| /es/biblioteca | 0.69 s | 196 KB | 44 / 1.51 MB | 4.11 MB |

- **The Material Symbols variable font is 3,909 KB per cold load.** It loads all 4 axes at full range (`opsz 20..48, wght 100..700, FILL 0..1, GRAD −50..200`) to draw **126 icons** (`web/app/layout.tsx:80`), with `display=block`. On a phone cold start, icons are invisible for up to 3 s and then render as ligature words ("groups", "dark_mode") that break layouts. That is exactly the "capture artifact" in our screenshots: the artifact *is* the user experience on a slow network. **P0 for the PWA.** Fix: Lucide (already installed, 0 uses in v2, tree-shaken SVG), or at minimum `&icon_names=` subsetting with fixed axes (≈30–60 KB).
- `MIcon` pins `opsz 24` at every size, and 18 different icon sizes are used (11–40 px). Icons at 13–16 px look spindly (`components/ui/MIcon.tsx:36`).
- **90 % client components**: 266 of 297 v2 component files are `'use client'`.
- **0 Suspense boundaries**: every route waits for its slowest loader behind one generic skeleton.
- The layout runs **4 sequential awaits**: session → *all* chat threads just to count unread → leads + calls → club skin (`app/[locale]/(v2)/layout.tsx:43-72`). `getCoachSession` isn't memoised with `cache()`, so it runs twice per request (layout + page). Hoy adds a third sequential round (`hoy/page.tsx:96`).
- The root layout preloads Clerk's UI bundle on every panel page.

### 2.9 The Next.js dev overlay "1 issue"

It's `ClerkRuntimeError: Failed to load Clerk JS … clerk.example.com … (code="failed_to_load_clerk_js")` (`shots/E/issue-hoy.png`, `issue-microciclo.png`). **It comes from the environment, not the UI**: the dev publishable key points at a placeholder domain, and our captures abort it. The "2 issues" once seen in a dark capture of microciclo didn't reproduce.

Unrelated but worth passing to the data auditor: `/es/atletas/11?tab=rendimiento` logs `[deep-dive-body] loader degraded: invalid input value for enum biometric_metric: "sleep_deep"`. A loader is failing silently, most likely a local DB enum drift.

---

## 3. What to keep

- **Token discipline.** Only 1 file in `components/v2` has a hard-coded hex; everything reads `--v2-*`. Semantic tokens with `-soft` variants exist, and the dark set is complete.
- **The club-accent mechanism** (`shared/domain/coach/club-accent.ts`). Derived on the server, with AA guaranteed for text roles, and per-surface families. It is right for FLEXR. Only *where* the accent gets painted must change.
- **The focus ring**: `.v2-focus` with the 2-layer ring, 678 uses, 100 % visible on Tab.
- **Motion**: `prefers-reduced-motion` is respected, and the stagger and view-transition timing (280 ms, `cubic-bezier(.22,1,.36,1)`) is tasteful.
- **`v2-num`**: tabular numerals (335 uses).
- **Primitives worth building on**: `components/ui/button.tsx` (cva + Base UI, correct API), `Pill` (93 uses), `EmptyState` (35), `SegmentedControl`.
- **Screens to use as references**: Pagos as the density and tone benchmark; Mensajes' 3-pane structure; the single `--v2-container` width.

---

## 4. Target visual direction

### 4.1 Palette

**Principles:**
- Neutral chrome. Numbers and status carry the colour.
- The accent gets exactly **three jobs**: the single primary action per view, the focus ring, and the brand mark. It does **not** mark nav selection, active filters or tabs, "today", links or section icons.
- Selection = ink text on `surface-2`, plus a 2 px ink indicator.

**Light** (cool neutral; replaces warm pearl, see Q2). Every text role validated with `E/proposal.mjs`.

| Token | Light | Dark | Contrast (light / dark, on surface) |
|---|---|---|---|
| bg | `#F4F4F2` | `#0B0B0C` | — |
| surface | `#FFFFFF` | `#161618` | cards separated by border, not luminance |
| surface-2 | `#ECECEA` | `#1E1E21` | — |
| border | `#DCDCD7` | `#2C2C30` | 1.38 / 1.30 |
| fg | `#141413` | `#F2F2F2` | 18.4 / 16.1 |
| muted | `#52524D` | `#A6A6A6` | 7.9 / 7.4 |
| faint (min for text) | `#67675F` | `#8C8C8C` | 5.7 / 5.4 (≥4.8 on surface-2) |
| ok | `#1D7447` | `#3CCF85` | 5.8 / 9.0 |
| warn | `#8F5400` | `#F0A43A` | 6.1 / 8.7 (5.3 / 6.7 on own soft) |
| danger | `#BF3128` | `#FF5D55` | 5.7 / 6.0; dark danger buttons take **dark** text (6.5), never white |
| info | `#2C5F9E` | `#5AA7F5` | 6.5 / 7.1 |
| accent (default) | ink `#141413` | `#F2F2F2` | club skin overrides, **3 jobs only** |

**Modality hues** (categorical, must never coincide with status): fuerza `#4A3AA7`, ergo `#1BAF7A`, carrera `#2A78D6`, circuito `#E87BA4`, calentamiento = neutral grey.
- This order passes the validator in light, adjacent and all-pairs (CVD 6.1 in the warn band, so labels stay mandatory, and they already are).
- Dark steps `#9085E9 / #199E70 / #3987E5 / #D55181` pass adjacent-order checks but **fail all-pairs** (magenta↔aqua deutan ΔE 1.6). Re-step them with `validate_palette.js` during the build.
- Zones Z1–Z5 get their own single-hue sequential ramp (blue 250→650). They stop reusing the status colours.

### 4.2 Type scale (Figtree, or the Q3 alternative; `tnum` for all numbers)

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| label | 11/14, caps +0.06em | 600 | table headers, section eyebrows **only** |
| meta | 12/16 | 500 | timestamps, secondary cells |
| body-sm | 13/18 | 400 | dense rows, chips |
| body | 14/20 | 400 | default text, inputs, buttons |
| title-sm | 16/22 | 600 | card titles, athlete name in a row |
| title | 20/26 | 600 | page title (was 36) |
| num-l | 28/32 | 600 tnum | KPI values |
| num-xl | 40/44 | 600 tnum | at most one hero number per screen |

That's 8 sizes, 3 weights, 1 tracking value.

### 4.3 Spacing, density, shape, elevation

- **Spacing**: 4 / 8 / 12 / 16 / 24 / 32 / 48. Page gutter 24 (16 on mobile). Card padding 16. Section gap 24.
- **Rows**: 40 px compact (default for tables at 100 athletes), 48 px comfortable, 56 px touch.
- **Controls**: 28 (inline in rows), 32 (toolbars), 40 (forms and primary). Mobile hit area ≥44 via padding or a `::after` extension.
- **Radii**: 6 (controls, chips, inputs), 10 (cards, panels, dialogs), full (avatars, status dots). **Buttons are 6 px rectangles; pills are only for filter chips.**
- **Elevation**: flat cards (1 px border, no shadow); popovers and dialogs get one shadow `0 12px 32px -12px rgb(0 0 0 / .25)`. No card inside a card: nest with a divider or `surface-2` fill, max 2 levels.
- **Chrome**: 64 px icon rail (expands to 220 on hover or ⌘\\), a 48 px top bar holding search / ⌘K and the account, and a 20 px page title in line with the page actions.

```
┌64┬──────────────────────────────────────────────────────────────────────────┐
│◎ │ Atletas  100            [⌕ Buscar  ⌘K]            [+ Agregar atleta]   │ 48
│▣ │ [Todos 100][Atención 43][Nuevo 6]  Nivel ▾  Fase ▾        Densidad ▾   │ 40
│✉ │ ATLETA           NIVEL  ESTADO          READINESS 7d   ADH 4s  ÚLT.    │ 32
│… │ ○ Bernat Font     N4    ▲ Atención      62 ▁▃▅▂▁      ███▁ 72%  21 h  │ 40
│  │ ○ Clara Riera     N4    · Activa        78 ▃▄▅▆▅      ████ 100% 21 h  │ 40
└──┴──────────────────────────────────────────────────────────────────────────┘
 ≈ 18 athletes per 900 px fold (today: 12 cards / 11 rows)
```

### 4.4 Component primitives (one barrel; Base UI + cva, which are already installed)

- **Button** (primary / secondary / ghost / destructive × 28 / 32 / 40), IconButton (with tooltip)
- **Inputs**: Input, Textarea, Select, Combobox, Checkbox, Switch
- **Navigation**: Tabs (one level per page), SegmentedControl (with arrow keys), FilterChip
- **Labels**: **StatusBadge** (icon + label + tone from one enum), Tag (neutral), Avatar
- **Layout**: Card, SectionHeader, ListRow, **DataTable** (real `<table>`, sticky header, `aria-sort`, row select, bulk bar)
- **Data**: KPI tile, Sparkline, MiniBar, Meter
- **Overlays**: Dialog, Sheet, Popover/Menu, Tooltip, Toast (with undo)
- **States and navigation**: EmptyState (one line inside cards, full only for empty pages), Skeleton (per component), CommandPalette, Kbd

**Icons**: Lucide at 16/20 px, stroke 1.75.

### 4.5 Status and semantic rules

1. There are 4 status tones: ok / warn / danger / info, plus neutral. Each always renders as **icon + label**. A dot never appears alone.
2. **Red means overdue or failed and needing action.** It never colours a headline count, and never a new client.
3. **One status model** feeds roster, Hoy, profile and Mensajes. "Atención" has one colour everywhere.
4. Categorical (modality) and sequential (zones) palettes never reuse a status hue.
5. Warn and danger are never decoration: no coloured card borders, no amber buttons.
6. The club accent is only in the three places listed in §4.1. The server check must also flag an accent within ΔE <15 of a status hue, and the panel then keeps status hues and shifts the *accent's text role*.

### 4.6 Data-viz rules

- Numbers are the hero: KPI = 11 px caps label above, 28 px `tnum` value, and a delta chip beside it. Units are fixed per quantity: readiness is always 0–100 with no "%", dates are always "22 sept", countdowns always "24 d · 17 oct".
- Every chart has a title that states the question and a reference line or target (e.g., adherence 80 %), and gets a hover tooltip.
- Bars: 4 px radius only on the data end, anchored to the baseline, 2 px gap. Neutral bars, plus one highlighted bar only when highlighting is the point.
- Sparklines in rows are 24 px tall and 1.5 px stroke, with the last point marked.
- A multi-series or modality bar always has a legend or direct labels.
- A module with no data collapses to a single `meta` line. A card made only of empty-state prose is never shown.

---

## 5. Objective vs subjective

**Objective (just do these):**
1. Adopt the primitive layer; ban raw styled `<button>`/`<input>`/modals in `components/v2` via lint.
2. 8-step type scale, nothing under 12 px except 11 px caps labels; 3 weights.
3. Fix the AA failures: warn text, faint on surface-2, dark faint, fuerza text, white on dark danger.
4. One status enum and colour mapping (removes red-vs-amber "Atención" and red "alta").
5. Separate the modality and zone palettes from status hues; validate with the script.
6. Accent limited to 3 jobs; selection states go neutral; headline counts in ink.
7. Mobile: 44 px hit areas; fix the Biblioteca segment overflow, profile tab wrapping and IntroStrip squeeze; add `theme-color` metas for both themes and manifest colours that match the default theme.
8. Performance and fonts: replace or subset Material Symbols (3.9 MB → <60 KB); drop Geist/Archivo @font-face from the panel; `cache()` the session; parallelise the layout awaits; count unread with a query instead of loading all threads; add Suspense per section.
9. Accessibility: skip link, real `<table>` + `aria-sort`, arrow keys in tabs, a shared Dialog with focus trap and Escape.
10. Hygiene: remove `auto_awesome`; delete the duplicate bridge block and the undefined `--v2-r-block`; fix "MIERCOLES/SABADO"; one date format.

**Subjective (Alex decides):**
- **Q1. Default theme?**
  - (a) Dark default, light as a toggle. **Recommended**: it's your original ask, matches Whoop, the athlete app and the landing, lets any club accent read as brand rather than highlighter, and puts the coach's PWA next to the athlete app on the same phone.
  - (b) Follow the system setting (current behaviour).
  - (c) Pearl light default (FLEXR decision of 19 Aug).
  - This challenges DECISIONS 2026-08-19/20. Neutral chrome with the accent as tenant data stays either way.
- **Q2. Light canvas?**
  - (a) Warm pearl `#F1EFEB` (current; card-to-canvas contrast 1.13 and it muddies amber).
  - (b) Cool neutral `#F4F4F2` with white cards. **Recommended.**
- **Q3. Display voice?**
  - (a) Bricolage for page titles (current; quirky and editorial).
  - (b) One family everywhere (Figtree or Geist), with large `tnum` numbers as the display voice. **Recommended.**
  - (c) Archivo italic for hero numbers only, as a nod to the athlete app.
- **Q4. Button shape?**
  - (a) Pill.
  - (b) 6 px rectangle, pills only for filters. **Recommended.**
- **Q5. Navigation?**
  - (a) Always-expanded 236 px sidebar (current).
  - (b) 64 px rail that expands on demand, plus ⌘K. **Recommended.**
  - (c) Top nav.
- **Q6. Default density at 100 athletes?**
  - (a) Cards (current, 12 visible).
  - (b) Table with 40 px rows (~18 visible), cards as an option. **Recommended.**
- **Q7. Where does the club colour appear?**
  - (a) Everywhere the accent is used today.
  - (b) Primary CTA, focus ring, logo and a 2 px active-nav bar. **Recommended.**
