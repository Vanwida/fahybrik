# FAHYBRID — Landing Page (single-coach launch) — Design Spec

**Date:** 2026-06-13
**Status:** Approved direction, pending spec review
**Surface:** Public marketing landing, Next.js web app (`web/`)

---

## 1. Goal & scope

Award-level marketing landing whose single job is **conseguir clientes para Pablo**
(Fabrik Training Club Barcelona). The platform is multi-coach internally, but this
landing is **single-coach, Pablo-only**. It must convert a serious HYROX/DEKA athlete
into a paying subscriber.

Out of scope: multi-coach directory, athlete dashboard, onboarding form, auth flows
(those exist or come later). This spec covers the public landing route only.

## 2. Locked decisions (from Alex, 2026-06-13)

| Decision | Value |
|---|---|
| Public brand name | **FAHYBRID** (internal infra stays FAHYBRIK; the wordmark on this public site reads FAHYBRID) |
| Pricing (publish exact) | Individual **70€/mes** · Dobles **115€/mes** (57,50€ c/u, ~18% ahorro) · Pro **95€/mes** · Box members **precio especial** |
| Primary CTA | **Checkout directo** (Stripe already in repo) — CTA → Stripe Checkout per plan |
| Content/assets | **Premium placeholders**, clearly marked for swap (Pablo photo, box names, testimonials, hero footage) |
| Hero direction | **Race Film** — full-bleed training video, black/orange duotone grade, kinetic type overlay. Footage = placeholder for now |
| Language | **Spanish-first**, built under existing `[locale]` i18n; EN can follow |
| Theme | Dark `#0A0A0A` + single orange `#F06A2A` (locked design system) |

## 3. Positioning / core message

> Entrenamiento HYROX/DEKA de élite. Un plan 100% personalizado, rediseñado **cada
> semana** por Pablo + IA. La experiencia de un coach de boutique de Barcelona, en una app.

Tone: profesional, atlético, directo. La IA es **herramienta del coach, no lo reemplaza**
("El atleta siempre percibe que está hablando con un equipo de coaches profesionales").

## 4. Brand / design system (reuse, do not reinvent)

Source of truth: `web/app/globals.css` (mirror of `docs/design/fahybrik-design-system/`).

- **Colors:** `--bg #0A0A0A`, `--surface #141414`, `--surface-elevated #1F1F1F`,
  `--fg #F5F5F5`, `--muted #A1A1A1`, accent `--accent #F06A2A`, `--accent-press #D85A20`.
- **Methodology group colors:** reuse the existing per-group palette
  (`components/dashboard/methodology/`) for the 10-blocks section.
- **Type:** Archivo **italic 900** for all display/headlines (the signature — never roman).
  `--type-display 900 italic 56px`, `--type-data-hero 900 italic 96px`. Geist Sans body,
  Geist Mono for metrics/splits.
- **Spacing/radius:** existing scales (`--s-*`, `--r-*`).
- **Wordmark:** existing `components/Wordmark.tsx` pattern (orange bracket `[F]`), but the
  text must read **FAHYBRID** on this public surface. Add a `brand` prop or a
  landing-specific wordmark rather than mutating the dashboard one.

## 5. Tech additions

Currently the web app has **zero** animation libraries (pure CSS). For award-level scroll
craft we add:

- **`lenis`** — smooth scroll (baseline of the genre).
- **`gsap`** + **ScrollTrigger** — pin, scrub, parallax, horizontal scroll, kinetic reveals.
- **WebGL for the hero** — duotone-grade + grain shader over the video (lightweight; can use
  a single fragment shader. `ogl` preferred for bundle size, `three` acceptable). Hero is
  **progressive enhancement**: server-rendered text + poster first, WebGL layers on after mount.

Constraints:
- All scroll/motion respects **`prefers-reduced-motion`** (design system already does).
- **SSR-safe:** WebGL/Lenis/GSAP only in client components, dynamically imported, guarded for
  no-DOM. Hero headline + CTA are in the server-rendered DOM for LCP and SEO.
- Keep LCP fast: video lazy/poster-first, no layout shift, fonts already `next/font`.
- A11y: semantic sections, keyboard-reachable CTAs, focus states, WCAG AA contrast, captions/
  aria on icon-only controls. Motion never gates content.

## 6. Route & file structure

Landing lives under the existing public route group:

```
web/app/[locale]/(public)/
  page.tsx                      ← NEW: the landing (server component shell)
  layout.tsx                    ← existing public layout (header/footer) — reuse/extend
web/components/landing/         ← NEW: all landing sections + primitives
  Hero.tsx                      (client: video + WebGL + kinetic type)
  webgl/DuotoneVideo.tsx        (client: shader over <video>)
  SmoothScroll.tsx              (client: Lenis provider)
  ProblemPromise.tsx
  HowItWorks.tsx
  Methodology.tsx               (client: horizontal pinned scroll, 10 groups)
  RaceAnalytics.tsx             (client: animated splits chart, 8 stations)
  AppShowcase.tsx
  Coach.tsx                     (Pablo / Fabrik)
  Pricing.tsx                   (3 plans + box members, checkout CTAs)
  Faq.tsx
  FinalCta.tsx
  primitives/ …                 (Reveal, KineticText, SectionLabel, etc.)
web/lib/landing/
  content.ts                    ← all copy + the 10 groups + pricing + faq as typed data
  checkout.ts                   ← CTA → Stripe Checkout session (reuse existing Stripe setup)
web/public/landing/             ← placeholder assets (poster, video, pablo, app frames)
```

Content is **single-sourced** in `lib/landing/content.ts` (DRY): copy, the 10 methodology
groups (name, color, session count, blurb), pricing plans, FAQ. No copy hardcoded in JSX.

## 7. Section-by-section

### 7.1 Hero — "Race Film"
- Full-bleed looping training video (placeholder), black→orange **duotone** grade + subtle
  grain via WebGL fragment shader. Scrim for text legibility.
- Kinetic **FAHYBRID** italic-black headline (GSAP reveal on load), eyebrow
  `HYROX · DEKA · HYBRID ATHLETE`, subhead = the core message.
- Primary CTA **"Empieza tu plan →"** (→ checkout), secondary "Cómo funciona" (anchor scroll).
- Scroll cue. Video pauses/reduces under `prefers-reduced-motion` (poster only).

### 7.2 Problema → Promesa
The 3 masterplan pains flipped:
- Planes genéricos online → **plan 100% tuyo**.
- Coach 1-on-1 inaccesible → **élite a precio accesible** (IA + coach).
- Planes compartidos que pierden valor → **se adapta a TU semana**.
Kinetic text reveal, three beats.

### 7.3 Cómo funciona (el bucle semanal)
Scrubbed step sequence:
1. Onboarding (nivel, lesiones, carreras, material, objetivos).
2. Pablo + IA diseñan tu plan base (revisado y aprobado por Pablo).
3. **Cada sábado** recibes tu semana (7 días, cada sesión con detalle).
4. Das feedback → la IA propone ajuste → **Pablo lo aprueba**.
Emphasis: human-in-the-loop, weekly cadence.

### 7.4 Metodología · 10 grupos  *(signature moment)*
GSAP **horizontal pinned scroll** through the 10 training block groups, each card in its
methodology-group color, with session count. Header line: **"+100 sesiones, adaptadas a ti."**
Groups (from masterplan): Fuerza Base (12) · Fuerza Explosiva/Pliométrica (8) · Series
Ergómetros (14) · Series Running (16) · Zona 2/Recuperación (11) · WODs/Metcons (9) ·
Simulaciones de Carrera (16) · Core/Movilidad/Preventivos (9) · Circuitos Fuerza-Resistencia
(8) · Tapering/Activación (7).

### 7.5 Race analytics  *(retention hook, made visible)*
The 8 HYROX stations (SkiErg, Sled Push, Sled Pull, Burpee Broad Jump, Row, Farmers Carry,
Sandbag Lunge, Wall Balls) + RoxZone. Animated splits chart (scrub-driven) that highlights
the **2-3 estaciones más débiles** and improvement across races.
Copy: *"Ve cómo mejoran tus splits, carrera a carrera."* Uses HR-zone-style data viz (mono
digits), **not** orange-for-data (orange reserved for brand per design system).

### 7.6 La app
Athlete-facing benefits with a device mockup (parallax): plan semanal con detalle, vídeos de
ejecución, chat directo con Pablo, importación Garmin/Polar/Strava, iOS. Placeholder frames.

### 7.7 Pablo / Fabrik (credibilidad)
Photo placeholder + bio: experto HYROX, **dueño de 2 boxes en Barcelona**, la mayor comunidad
HYROX de la ciudad, **revisa personalmente cada plan**. Box names = placeholder. Trust line:
"No es una IA genérica: es el método de Pablo, escalado."

### 7.8 Pricing
Three cards + box note. **Dobles destacado** ("mejor ratio valor/esfuerzo"):
- **Individual — 70€/mes** · plan completo personalizado.
- **Dobles — 115€/mes** (57,50€ c/u, ahorro ~18%) · entrenáis juntos sin perder personalización.
- **Pro — 95€/mes** · mayor volumen, análisis de splits Pro, planificación de temporada.
- **¿Eres de los boxes de Pablo?** precio especial → CTA contacto.
Each card CTA → Stripe Checkout. Microcopy: mínimo 1 mes, cancela cuando quieras.

### 7.9 FAQ
¿Necesito material? · ¿Y si soy principiante? · ¿Y si me salto un día? · ¿Puedo entrenar con
mi pareja/amigo? (Dobles) · ¿Cada cuánto se adapta? · ¿Puedo cancelar?

### 7.10 Cierre cinético + footer
Big kinetic close, final checkout CTA, FAHYBRID wordmark, legal links (privacy/terms exist).

## 8. Placeholder inventory (marked for swap)

- `public/landing/hero-poster.jpg` + `hero.mp4` — training footage (duotone applied in shader).
- `public/landing/pablo.jpg` — coach portrait.
- `public/landing/app-*.png` — iOS app frames.
- Box names ×2, real testimonials/HYROX results — copy placeholders in `content.ts`, flagged
  with `// TODO: real asset`.

## 9. Success criteria

- Loads fast (LCP from server-rendered hero text), no CLS, works with JS-light first paint.
- Full keyboard + screen-reader navigation; `prefers-reduced-motion` fully honored.
- Lint + typecheck pass. No console.log. No secrets.
- All copy/pricing/groups single-sourced in `content.ts`; pricing matches §2 exactly.
- Feels award-level on a good machine; degrades gracefully on a weak one / reduced motion.

## 10. Open follow-ups (post-build, not blocking)

- Real hero footage, Pablo photo, box names, testimonials.
- Wire Stripe Checkout price IDs (env) for the 3 plans + box contact path.
- EN locale copy.
- Decide whether onboarding form precedes or follows checkout (funnel detail).
