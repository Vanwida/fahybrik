> Informe de área de la auditoría del panel del coach (23-sep-2026). Resumen y propuesta: [../index.html](../index.html). Las capturas citadas vivían en el scratchpad de la sesión de auditoría y no están en el repo; las clave están en [../img/](../img/). Entorno: Postgres local con 100 atletas sintéticos (ver apéndice del índice).

# Audit A — Information architecture, shell, and the business / method / settings screens

Auditor: IA + shell. Evidence screenshots are in `scratchpad/shots/A/` (1440×900 unless noted). Code refs are relative to `web/`.
Test data I created: one partial lead (`audit-lead-a@example.com`, id 1) through the public `POST /api/leads`, so I could see the lead list and lead detail. Nothing else was written.

---

## 1. Verdict

**Rebuild the IA, keep most of the parts.** The shell is well built: one nav source, a good mobile tab bar, and proper loading/error/not-found states. The screens behind it are mostly competent. The problem is how they are arranged. The sidebar lists **15 destinations of equal weight**. **At most 3 of them are daily jobs**, and 7 are setup screens a coach opens once. There is **no global search, no global "create", no single inbox**, and the whole "Negocio" group is **not tenant-scoped**.

**Biggest problem:** a coach with 100 athletes cannot answer "who needs me today" in one place. The answer is split across Hoy, Atletas (which embeds a second Hoy), Mensajes, Leads (badge), Pagos (no badge, not in Hoy) and /altas (not in the nav at all). Meanwhile the nav spends 60% of its rows on things done once.

---

## 2. Findings, screen by screen

### 2.1 Shell: sidebar, top bar, account menu, mobile nav

**What the coach is trying to do:** move between the 3–4 things they do all day, jump to a named athlete, and create things. The shell should stay out of the way.

| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| S1 | **15 destinations of equal weight** (12 primary in 3 groups, plus Guía/Club/Ajustes pinned) and 3 group headers. Only Hoy, Atletas and Mensajes are daily. Biblioteca is weekly. The other 11 are weekly, monthly or setup. Prior specs promised 3–4 (`docs/design/ux-redesign/SPEC.md` §0: Hoy/Atletas/Programar; `hoy-redesign/SPEC.md` §3: Hoy/Actividad/Atletas/Programar + ⌘K). The build went the other way. | `components/v2/nav.ts:41-57`, `shots/A/leads.png` | **P1** | Cut the sidebar to 5 destinations (§4). |
| S2 | **The sidebar does not fit.** Content is 882 px tall. At 1440×900 the rail has 868 px, so it scrolls by 14 px and the FLEXR stamp gets cut off. At 1280×720 it scrolls by 196 px and **Guía, Club and Ajustes are below the fold**. | measured `aside.scrollHeight`; `shots/A/laptop-1280x720-hoy.png` | P1 | Fixed by S1. |
| S3 | **No global search / ⌘K.** Pressing ⌘K or Ctrl+K does nothing (0 dialogs). The backend exists: `app/api/coach/search/route.ts` is a coach-scoped athlete typeahead, "LIMIT 8", written "for the ⌘K CommandPalette". No component calls it. It is a dead endpoint. To reach a named athlete from Pagos you need Atletas → type → click. | `shots/A/desk-cmdk.png`; `grep CommandPalette` = only that comment | **P0** for the 100-client goal | Build the palette (§4.3). |
| S4 | **No global "create".** The only create button in the chrome area is "Agregar atleta" on /atletas. New session, new microcycle and new comunicado are each 2–3 clicks deep inside Biblioteca tabs. There is no "message athlete X" from anywhere except Mensajes or the ficha. | `shots/A/desk-cmdk.png` | P1 | Add a "+ Nuevo" menu in the top bar plus a `C` shortcut. |
| S5 | **The top bar is 56 px of nothing on desktop.** It holds exactly 2 controls: the theme toggle and the account button (the brand is `lg:hidden`). It is sticky and `lg:bg-transparent`, so page content scrolls *under* the toggle with no background. | `V2Shell.tsx:232-249`; `shots/A/guia-leads-mockup.png` (text runs under the toggle) | P2 | Put search, "+ Nuevo" and help here, and give it a surface. |
| S6 | **No logout on desktop.** The account menu offers "Tu club" and "Ajustes y perfil" only. Logout sits at the bottom of /ajustes, a 2,580 px page. Mobile has it in the "Más" sheet. | `AccountMenu.tsx:92-117`; `shots/A/desk-account-menu.png`, `ajustes.full.png` | P1 | Add "Cerrar sesión" to the account menu. |
| S7 | **Two identities on the same screen.** The top bar says "Fabrik / FC" (`users.full_name`), while Ajustes on the same page says "Pablo Amigo / PA" (`coaches.full_name`). There are **four "name" fields in 3 screens**: `users.full_name` (top bar), `coaches.full_name` (Ajustes "Nombre"), `coaches.club_skin_name` (/club "Nombre del club"), `coaches.studio_name` (Ajustes "Box / estudio" **and** Disponibilidad "Nombre del box"). `coaches.location` is edited both as "Ubicación" (Ajustes) and "Dirección" (Disponibilidad). | `shots/A/dark-ajustes.png`; `lib/auth/coach-session.ts:89`; `lib/coach/profile.ts:51`; `lib/coach/club-skin.ts:50`; `citas/AvailabilityEditor.tsx:12` | **P1** | One editor per field. Settings get two clear sections: **Tú** (person: name, photo, email, bio) and **Tu club** (club name, logo, colour, box name, address, notice email). |
| S8 | **Badges cap at "9+".** With 100 athletes the Mensajes badge reads "9+" permanently, so it carries no information. The Leads badge adds together two different things (new leads + calls in the next 48 h). | `V2Sidebar.tsx:85`; `(v2)/layout.tsx:55-64` | P2 | Show exact counts up to 99. Put calls in Hoy, not in the Leads badge. |
| S9 | **Every navigation runs 4 layout loaders.** These are `listThreadsForCoach` (the full thread list, fetched only to count unread), `countNewLeads`, `countUpcomingCallsSoon` and `getClubSkin`. The two counts have **no coach scope**. | `(v2)/layout.tsx:44-73`; `lib/dashboard/coach/leads.ts:349`; `lib/citas/store.ts:304` | P1 | Replace with one scoped `count(*)` per badge, or one attention-count query. |
| S10 | **Mobile nav is good** (5 tabs, safe-area, scroll lock, Esc, closes on navigate). The "Más" sheet, though, is a 12-tile wall. It repeats the sidebar's problem at thumb size. | `shots/A/mob-mas-sheet.png` | P2 | After S1 the sheet only needs Programar / Ajustes / Ayuda / account. |
| S11 | **No in-app notification centre.** Web Push exists (`PushSync`, `dispatchNotification` → default `/hoy`). There is no bell. That is fine only if Hoy is the one inbox, and today it is not (see H1). | `lib/notifications/dispatch.ts:74` | P1 (via H1) | Make Hoy the inbox. Do not add a bell. |
| S12 | **Dead or stale IA code.** `UnderConstruction.tsx` is imported by nobody (good: no unfinished screen ships through it). `proxy.ts` still protects `/programar`, `/review` and `/metodologia`, which no longer exist. It does not list /leads, /pagos, /mensajes and others; the layout's `getCoachSession` is what actually gates them. | `proxy.ts:31-60` | P2 | Delete `UnderConstruction`. Protect `/:locale/(v2 routes)` with one matcher. |

**Home / inbox duplication (the core IA failure):**

| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| H1 | **"Who needs me today" lives in 5 places.** Hoy covers training exceptions and altas. Pagos has 7 "Vencido" rows, no badge, and **Hoy does not surface them** (`grep past_due` in the hoy code = 0). Leads has the badge (new leads + calls), and Hoy does not surface them either. Mensajes has its own badge. /altas is **not in the nav** and is reached only from Hoy, Atletas or the intake page. | `shots/A/pagos.png`, `altas.png`; `components/v2/hoy/*` | **P0** | One inbox (Hoy) with lanes for Altas, Leads & llamadas, Cobros, Mensajes sin responder, and the training exceptions. Each lane links to the full tool. |
| H2 | **Atletas (the declared home) embeds a second Hoy.** It has the strip "Hoy · 92 decisiones · Resolver →", and the same 6 pending altas appear **3 times on one screen** (strip, "Nuevo · 6" chip, right-rail card). | `shots/A/desk-cmdk.png`; `auth/verify/route.ts:44-46` (post-login lands on /atletas) | P1 | Pick one home (see Q1). The roster becomes a pure browse and bulk surface. |

### 2.2 `/leads` + `/leads/[id]`
**Coach's job:** each week, see who came in, contact them, book a call, convert.

- **Not tenant-scoped (P0 for FLEXR).** `listLeadsForCoach()` takes no `coach_id` and selects `from leads` with no WHERE. `listUpcomingCalls()` and `listWaitlist()` are also global. Every coach would see every club's prospects. DECISIONS 2026-08-10 records this as known debt ("siguen club-global"), but it means the Leads area cannot ship to coach #2. (`lib/dashboard/coach/leads.ts:95-128`, `leads/page.tsx:26-31`)
- **Hardcoded tenant copy (P1, HARD RULE Nº0).** The empty state says "Cuando alguien complete el onboarding en **fahybrid.com**…". (`leads/LeadsTable.tsx:35`, `shots/A/leads.png`)
- The list itself is good: status tabs, "Ver archivados", search, one row per lead with its state and next action (`shots/A/leads-1.png`). The chip "Sin límite" is actually capacity, explained only by a hover title. Label it "Cupo: sin límite" (P2).
- **Lead detail** (`shots/A/lead-detail.full.png`): a sensible order (state → move → call → 1:1 → contact → answers). Problems:
  - It shows the heading **"Onboarding completo"** directly under a lead marked "Sin terminar", which reads as a contradiction (`LeadDetalle.tsx:284`). Rename it to "Respuestas del onboarding" (P2).
  - The page is 1,320 px tall for a lead with no data. The 4-cell summary (Objetivo/Nivel/Días/Categoría) is all "—" (P2).
- **Top-level?** No. It is a weekly tool. Move it under **Negocio**, and let new leads and today's calls feed Hoy.

### 2.3 `/pagos`
**Coach's job:** see who hasn't paid and chase them, plus a monthly check of revenue.

- **Unbounded list:** 100 rows, full page **4,443 px**, with **no search, no filter and no pagination** (`shots/A/pagos.full.png`). A "vencidos primero" sort is the only tool. At 100 clients the job is "the 7 who owe me", so show those and fold the other 93 away (P1).
- **No actions.** A row only links to the ficha. There is no "recordar pago", no "abrir en Stripe" and no "marcar cobrado" (P1).
- Seeded data shows price "—" on all 100 rows and "MRR 0 €". The design does not notice that nobody has a price, so there is no nudge (P2).
- English header "ROSTER" (`pagos/PagosPanel.tsx:180`) (P2).
- **Multi-coach risk (P0 for FLEXR, outside IA but blocking):** there is no Stripe Connect (`grep stripeAccount` = 0), so every coach's athletes pay into one account. The guide itself says "Se activa próximamente" (`guia/sections/24-pagos.tsx:87`).
- **Top-level?** No. It becomes a Negocio tab, and past-due moves into Hoy.

### 2.4 `/metricas`
**Coach's job:** a monthly look at where prospects drop out.

- **The label lies.** The nav says "Métricas". The page is "**Métricas del funnel**", i.e. sales-funnel metrics only. A coach reading "Métricas" expects team training metrics (adherence, load, readiness trend), and **those exist nowhere as a team view** (P1). (`shots/A/metricas.full.png`)
- Loaders take only a date range (`metricas/page.tsx:42`), with no coach scope (P0 for FLEXR, same debt as Leads). "landing **fahybrid.com**" is hardcoded (`metricas/FunnelChart.tsx:152,172`) (P1).
- **Empty state:** a 0-lead coach gets **1,300 px of zeros** (5 KPI tiles, 7 funnel rows, 5 call outcomes, 5 objective rows) instead of one empty state (P2).
- Good: the drop-off-per-stage funnel, the cohort definition, and honest footnotes ("cohortes recientes siguen madurando"). Keep them.
- **Top-level?** No. It becomes Negocio › Embudo.

### 2.5 `/disponibilidad`
**Coach's job:** set call slots and capacity once, and revisit them occasionally.

- **It is a settings page promoted to the nav.** It even shows a breadcrumb "← Leads" (`AvailabilityEditor.tsx:378`), so it already knows it lives under Leads (P1).
- **HARD RULE Nº0 violation in live copy:** "los leads verán **"Pablo te escribirá para cuadrar la llamada"**" (`AvailabilityEditor.tsx:492`, `shots/A/disponibilidad.full.png`) (**P0**: a coach named anything else sees Pablo's name).
- **4 independent commit buttons** (3× "Guardar" + "Bloquear") on one 1,646 px page (P2).
- It duplicates `studio_name`/`location` from Ajustes under different labels (S7).
- **Availability is club-global by design** (DECISIONS 2026-08-10: "no tiene dueño posible"). Multi-coach blocker (P0 for FLEXR).

### 2.6 `/como-entrenas`
**Coach's job:** describe their method once, so the AI can imitate it. Revisit rarely.

- The concept is strong: 7 chapters, checkboxes, and a live "Tu sistema, en voz alta" mirror paragraph (`shots/A/como-entrenas.png`, DECISIONS 2026-08-17). Keep it.
- **Setup-once screen in the primary nav** (P1). It belongs in the first-run checklist and in Ajustes › Método.
- Eyebrow copy **"INSTRUMENTO · EL SISTEMA, NO EL ESLOGAN"** is design-doc language leaking into the UI (`ComoEntrenarView.tsx:171`) (P2). The Hoy empty board's "Eso no es que el sistema siga un método" has the same problem (`shared/domain/coach/club-hoy.ts:103`).

### 2.7 `/tests`
- It has a clean empty state with 2 CTAs (`shots/A/tests.png`). "Restaurar batería por defecto" is wrong for a coach who never had one; say "Usar la batería por defecto" (P2).
- **Top-level?** No. A test is a kind of session template (the guide already says "bloques… carrera, fuerza, circuito, **test**"), so it becomes a Programar tab. DECISIONS 2026-08-02 already diagnoses "tres sistemas paralelos" of tests. Surfacing them as their own nav island makes that split visible to the coach.

### 2.8 `/cuestionarios`: **P0, a finished-looking screen that does nothing**
- The editor for `coach_onboarding_forms` (migration 0201) looks complete: list, duplicate, edit, delete, reorder, destination email (`shots/A/cuestionarios.png`).
- **Nothing consumes it.** `grep` for `onboarding-forms|definition_json|onboardingForm` across `web/app`, `web/lib`, `ios`, `shared` finds only the editor, its API and its schema. No public page renders the form, the athlete app does not read it, and the migration itself says "No es el embudo público /empieza ni la cola /altas". A coach who edits it changes nothing.
- It also sits under **Método** while its eyebrow says "ALTA" (P2).
- **Fix:** hide it until the athlete or lead flow reads it. Then it lives in Ajustes › Alta.

### 2.9 `/club`
- It is one of the best screens. The dual live preview (panel vs athlete app) shows "Tu marca llega a / Todavía no a", which tells the coach exactly where the brand lands (`shots/A/club.png`). Keep it.
- The inputs show the fallback values ("FAHYBRID", "#F06A2A") as grey placeholders in grey filled fields, which read as *disabled*. Render the fallback as helper text ("Si lo dejas vacío: FAHYBRID") (P2). "Vacío = icono de FAHYBRID" names the product binary in copy (P2).
- **Setup-once, yet reachable 3 ways:** sidebar, account menu "Tu club", and an Ajustes link card (P1). It becomes Ajustes › Club.

### 2.10 `/ajustes`
- **2,580 px single column (672 px wide)** covering: profile, 4 link cards that **duplicate sidebar destinations** (Cuestionarios, Club, Cómo entrenas, Periodización), plan visibility, avisos thresholds, logout (`shots/A/ajustes.full.png`) (P1).
- 3 separate save buttons ("Guardar cambios", "Guardar", "Guardar cambios") plus "Restaurar" (P2).
- Jargon (P2):
  - "**Offset máximo actual: 1 semana adelante**" (`ajustes/PlanWeekHorizonForm.tsx:172`)
  - "Define las fases y principios que alimentan a **Coach IA**" (`ajustes/page.tsx:176`)
- The **Avisos** thresholds with "Por defecto: N" and "Restaurar los valores por defecto" are exactly HARD RULE Nº0 done right. Keep them.
- **Fix:** Ajustes becomes a real settings area with a left sub-nav (§4.4). Link cards to other pages go away.

### 2.11 `/guia` + an article
- **Double sidebar.** The app rail (268 px) plus the guide TOC (270 px) leave about 850 px for reading (`shots/A/guia.png`). On mobile the 41-item TOC stacks **above** the article, so the content starts about 2,000 px down (`shots/A/mob-guia.png`) (P1).
- **The guide teaches a UI that doesn't exist.** Its "tu-panel / leads" mockup is a dark, orange, Archivo-italic table. The real Leads page is a pearl list with status tabs (`shots/A/guia-leads-mockup.png` vs `leads-1.png`) (P1).
- **Hardcoded tenant.** The guide sidebar brand "FAHYBRID · GUÍA DEL ENTRENADOR" is hardcoded (`GuiaSidebar.tsx:46`). I found **39 occurrences** of Pablo/FAHYBRID/fahybrid in guide sections, e.g. "Reserva tu llamada con Pablo", "hello@fahybrid.com", "30 min con Pablo" (`guia/sections/22-*.tsx`, `21-*.tsx`). The leads article also says "Son **leads globales**: todos tuyos, sin reparto", which contradicts migration 0147 (P1, HARD RULE Nº0).
- **Nav jargon:** "13 · Tu pantalla **/hoy**" shows a URL as a title (P2).
- **No screen links to its guide article** (`grep href.*guia` outside the guide = 0) (P2).
- All 41 sections are `built: true`. The content is extensive and genuinely useful; the problem is only placement and staleness.

### 2.12 `/altas` (the orphan)
- A good focused queue: 6 rows, days waiting, "Revisar alta →", and a count anchored at the bottom (`shots/A/altas.png`).
- It is **not in any nav**. It is really a *lane of Hoy* and a *filter of Atletas* ("Nuevo · 6"). Make it `/hoy?lane=altas` and drop the route (P2).

### 2.13 First run (a brand-new coach with 0 athletes)
I reasoned from the code, since I could not create a second coach (the dev bypass email is fixed at server start).

- **Lands on /atletas** (`auth/verify/route.ts:46`). It shows "Aún no hay atletas · Da de alta a tu primer atleta" with an **Agregar atleta** CTA (`atletas/RosterCards.tsx:87-101`). **That is the wrong first step.** An athlete invited before niveles/sesiones/secuencias exist immediately appears in Hoy's "Asignación sugerida" as "Tu periodización de N4 · 5 días no tiene secuencia" (`shots/A/laptop-1280x720-hoy.png`) (P1).
- **Hoy with 0 athletes** says "**Nadie ve esta semana** · Ningún atleta ve sesiones de esta semana. **El vacío no es que el club esté bien.**" and offers "Ver todos los atletas" (`shared/domain/coach/club-hoy.ts:109-113`). It is cryptic, it sounds like a reproach, and it gives no setup path (P1).
- **Four separate orientation systems, none of them the whole path:**
  1. `PipelineCue` "Paso N de 4" (Niveles → Sesiones → Microciclos → Secuencias), shown **only** on Periodización and Biblioteca.
  2. Per-screen `IntroStrip`s.
  3. Cómo entrenas' own 0/34 progress.
  4. The 41-article Guía.

  Nothing tells the coach that Club, Cómo entrenas, Tests, Disponibilidad/cupo and inviting athletes are also part of setup (P1).
- **Unfinished screens:** `UnderConstruction` is used **0 times**, so no placeholder ships. The real P0 unfinished items are Cuestionarios (no consumer), Pagos (no Stripe for other tenants, "próximamente") and the unscoped Negocio group.

### 2.14 Copy: jargon, language mixing, one word for several things

| Term | What it means today | Evidence |
|---|---|---|
| **alta** | (a) the intake review queue (/altas, "Revisar alta"); (b) lead → athlete conversion ("Dar de alta como atleta", funnel "Alta enviada", "Se dan de alta"); (c) the questionnaire ("Cuestionarios de alta", "Alta típica"). The roster calls the same thing "**Nuevo**", which is also a *lead* status. The URL says `/intake`. | altas.png, lead-detail, cuestionarios.png, desk-cmdk.png |
| **bloque** | Biblioteca › Bloques = a *part of a session* (97 library blocks). Hoy "Todavía no tiene ningún **bloque**" / "Reponer **bloque**" = a *4-week microcycle*. | `hoy/AsignacionSugeridaCard.tsx:8-30` |
| **microciclo** | A 4-week unit. In periodisation a microcycle is ~1 week and 2–6 weeks is a *mesocycle*. That is domain-incorrect, and another coach would name it differently. | Biblioteca tab, demo "4-week microcycle" |
| **receta / secuencia / periodización** | Three names for one object (nivel × días → ordered microcycles): Hoy "Crear receta", Periodización "su secuencia de microciclos", and a button labelled "Periodización →" on each nivel. | `06-periodizacion.png`, Hoy |
| English in UI | funnel (24×), Roster, MRR, Leads, Offset, Coach IA, check-in, readiness, `/hoy`, `/intake` | as cited |
| Page titles | 4 patterns: "X · count" (Atletas · 100, Leads · 0, Altas · 6); "X · qualifier" (Tests · calibración, Periodización · niveles, Métricas del funnel · 30 d); eyebrow + title (ALTA/CUENTA/CLUB/INSTRUMENTO…); back-link + title (← Leads / Disponibilidad y cupo) | screenshots |
| Content width | 4 widths across 10 secondary screens: full container (Leads/Pagos/Métricas/Tests), 899 px (Disponibilidad), 880 px (Cuestionarios), 671 px (Club/Ajustes). The left edge jumps 292 → 404 → 414 → 518 px as you click through the nav. | screenshots |

---

## 3. What to keep

- **`nav.ts` as the single source** for both sidebar and mobile bar (`V2Sidebar`, `V2MobileNav`). The target IA only needs its data changed.
- **`PageFrame` / `FillPanel`** (the height strategy `llena | centra` as a required prop) and **`ScreenState`** (loading/error/not-found, with an exit required on every notice). They are the right primitives.
- **The mobile bottom bar mechanics:** safe-area, scroll lock, Esc, closes on route change, badge.
- **Club page:** the dual live preview and the "llega a / todavía no" honesty.
- **Cómo entrenas:** the interview + deterministic mirror paragraph (as a feature, not as a nav item).
- **Ajustes › Avisos:** thresholds as coach data with visible defaults. This is the multi-coach pattern to copy everywhere.
- **Leads list + lead detail pipeline** ("Mover a", 1:1 sessions, onboarding answers) and the **funnel drop-off chart** with its cohort definitions.
- **Pagos:** past-due-first ordering and the collapse of dobles pairs into one charge row.
- **Theme toggle + club accent as tenant data** (DECISIONS 2026-08-19/20).
- **Orientation primitives** (`IntroStrip`/`ContextHint` with enforced density). Reuse them for the first-run checklist.

---

## 4. Target design for this area

### 4.1 Route inventory: frequency and fate (28 pages)

| Route | Frequency | Fate |
|---|---|---|
| `/hoy` | daily | **Home.** The single inbox; absorbs altas, leads nuevos + llamadas hoy, cobros vencidos, sin responder |
| `/atletas` | daily | Keep. Pure roster/browse/bulk. Remove the embedded Hoy strip and the duplicate altas card |
| `/atletas/[id]` (+`/dia/[date]`, `/sesion/[a]`, `/intake`) | daily/weekly | Keep, as children of the ficha |
| `/mensajes` | daily | Keep |
| `/altas` | weekly | **Merge** → Hoy lane (`/hoy?lane=altas`) |
| `/biblioteca` (+ sesion/bloque new/[id]) | weekly | **Rename to `/programar`**, keep sub-routes |
| `/microciclos/[id]` (+`/dia/[idx]`) | weekly | **Move** → `/programar/microciclos/[id]` (URL matches its tab) |
| `/periodizacion` | setup + monthly | **Move** → Programar tab "Periodización" |
| `/tests` | setup | **Move** → Programar tab "Tests" |
| `/leads`, `/leads/[id]` | weekly | **Move** → `/negocio` tab "Leads" (detail as side panel or `/negocio/leads/[id]`) |
| `/pagos` | monthly (vencidos via Hoy) | **Move** → `/negocio` tab "Cobros" |
| `/metricas` | monthly | **Move + rename** → `/negocio` tab "Embudo" |
| `/disponibilidad` | setup | **Settings panel** → `/ajustes/agenda` (slots, cupo, dirección presencial, fechas bloqueadas) |
| `/como-entrenas` | setup-once | **Settings panel** → `/ajustes/metodo` + first-run step |
| `/club` | setup-once | **Settings panel** → `/ajustes/club` |
| `/cuestionarios` | setup | **Hide** until something consumes it, then `/ajustes/alta` |
| `/ajustes` | rare | Settings area with sub-nav (below) |
| `/guia`, `/guia/[slug]` | rare | **Out of the sidebar.** "?" in the top bar + contextual links + ⌘K. Full-width reader layout |

### 4.2 Shell

```
┌──────────────┬─────────────────────────────────────────────────────────────────────┐
│ [club logo]  │ [⌕ Buscar atleta, sesión, pantalla…   ⌘K]     [+ Nuevo ▾]  [?]  [◐]  [PA ▾]│
│              ├─────────────────────────────────────────────────────────────────────┤
│ ▣ Hoy     12 │                                                                     │
│ ○ Atletas    │                         page content                                │
│ ○ Mensajes 4 │        (one PageHeader: Title · count, one-line subtitle,           │
│ ○ Programar  │         right-aligned primary action; two widths only:              │
│ ○ Negocio  3 │         list = container, form/settings = 720 px)                   │
│              │                                                                     │
│ ⚙ Setup 5/9  │  ← first-run checklist, disappears when done                        │
│ ─────────    │                                                                     │
│ ⚙ Ajustes    │                                                                     │
│     FLEXR    │                                                                     │
└──────────────┴─────────────────────────────────────────────────────────────────────┘
```

- **5 destinations + Ajustes.** Badges show exact counts: Hoy = open items, Mensajes = unanswered threads, Negocio = new leads + calls today + vencidos.
- **Account menu:** name + email, "Tu perfil", "Tu club", "Ayuda", **"Cerrar sesión"**.
- **"+ Nuevo" (also `C`):** Atleta (invitar) · Sesión · Microciclo · Comunicado · Mensaje a… (opens an athlete picker).
- **Go-to keys:** `G H / G A / G M / G P / G N`.
- **Mobile bar:** Hoy · Atletas · Mensajes · Negocio · Más (Más = Programar, Ajustes, Ayuda, account).

### 4.3 ⌘K palette (the backend already exists for athletes)
Groups, typeahead, max 5 per group:
- **Atletas:** name · nivel · estado chip. Enter opens the ficha; ⌘Enter opens the chat.
- **Leads**
- **Programar:** sesiones, microciclos, bloques, ejercicios
- **Ir a:** every screen and settings panel ("Cupo", "Disponibilidad", "Color del club")
- **Acciones:** "Nuevo atleta", "Asignar microciclo a…", "Enviar comunicado a…", "Publicar semana de…"
- **Ayuda:** guide article titles

Extend `/api/coach/search` to return typed results scoped by `coach_id`.

### 4.4 Ajustes (settings area, left sub-nav, 720 px column, one save model)

```
Ajustes
├ Tu perfil        persona: nombre, foto, email (read-only), bio, especialidades, certificaciones
├ Tu club          nombre del club, logo, color (with the existing dual preview), box + dirección,
│                  correo de avisos        ← the ONLY place for studio_name/location/club name
├ Método           Cómo entrenas (the 7-chapter interview), umbrales de avisos
├ Plan del atleta  visibilidad de semanas (no "offset")
├ Agenda y cupo    franjas videollamada/presencial, fechas bloqueadas, cupo máximo
├ Alta             cuestionario (only once consumed), qué pasa al dar de alta
├ Notificaciones   push de este navegador
└ Cuenta           email, cerrar sesión
```

Each panel saves on blur with an inline "Guardado" confirmation (`InlineSave` already exists). No page with 3–4 separate save buttons.

### 4.5 Negocio (one destination, three tabs)
- **Leads:** today's list, with the detail as a right side panel so the list stays visible.
- **Cobros:** KPI row, then **only the rows that need action** (vencidos, pendientes) with actions (recordar, abrir en Stripe, marcar cobrado); "Al día (83)" collapsed.
- **Embudo:** today's Métricas screen, renamed, with a single empty state when there are 0 leads.

Only enable it for coaches who use the web funnel and have scoped data. Until the multi-coach work lands, gate it to the funnel-owner tenant.

### 4.6 Programar (renamed Biblioteca)
Tabs: Sesiones · Microciclos (see Q3 on the name) · Bloques · Ejercicios · Tests · Comunicados · Periodización (niveles × días → secuencia). Each tab has one "+ Nuevo X" in the PageHeader. The existing `PipelineCue` stays here.

### 4.7 First run
When setup is incomplete, Hoy's top section (and the sidebar "Setup N/9" entry) shows a checklist computed from real data, extending `PipelineCue`'s approach:

```
Pon en marcha tu club                                           5 de 9
✓ Tu club (nombre, logo, color)
✓ Cómo entrenas                         34/34
✓ Niveles y fases                       5 niveles
○ Tu primera sesión                     → Programar › Sesiones
○ Tu primer microciclo
○ Secuencia por nivel                   0 de 5 niveles
○ Batería de tests                      → Usar la batería por defecto
○ Agenda y cupo (si captas por web)     Opcional
○ Invita a tu primer atleta             ← only becomes primary after the plan exists
```

This replaces "Nadie ve esta semana. El vacío no es que el club esté bien."

---

## 5. Objective vs subjective

### Objective: just do these
1. **Scope Negocio by `coach_id`:** `listLeadsForCoach`, `countNewLeads`, `countUpcomingCallsSoon`, `listUpcomingCalls`, `listWaitlist`, the Métricas loaders, and availability. Until then, gate Negocio to the funnel owner. (HARD RULE Nº0; a cross-tenant data leak.)
2. **Remove tenant literals from live UI:** "Pablo te escribirá…" (`AvailabilityEditor.tsx:492`), "fahybrid.com" (`LeadsTable.tsx:35`, `FunnelChart.tsx:152,172`), the guide brand (`GuiaSidebar.tsx:46`), and the 39 Pablo/FAHYBRID literals in guide sections. Replace them with tenant data (club name, coach name, domain).
3. **Hide Cuestionarios** until a flow reads `coach_onboarding_forms`.
4. **Hoy absorbs** altas, new leads, calls today, past-due payments, and unanswered messages. `/altas` becomes a Hoy lane.
5. **Take setup-once screens out of the primary nav:** Disponibilidad, Cómo entrenas, Club and Cuestionarios go to Ajustes; Tests and Periodización go to Programar; Métricas and Pagos go to Negocio.
6. **Build ⌘K** on the existing `/api/coach/search`. Add **"+ Nuevo"** and **logout** to the chrome.
7. **One editor per field:** fix the 4 name fields and the duplicate `studio_name`/`location` editors. Split settings into "Tú" and "Tu club".
8. **One `PageHeader` and two content widths** across all screens.
9. **Fix the copy defects:** "Onboarding completo" on an unfinished lead, "Restaurar batería" for a new coach, "Offset máximo", "ROSTER", "funnel" → "embudo", the "Instrumento · el sistema, no el eslogan" eyebrow, "Tu pantalla /hoy".
10. **Disambiguate "bloque"** (Hoy must say microciclo/plan, not bloque). Use one name for receta/secuencia. Stop using "alta" for three things: *Alta pendiente* = intake review, *Convertir en atleta* = lead conversion, *Cuestionario de entrada* = the form.
11. **Badges:** exact counts; the Leads badge stops counting calls. Replace the full `listThreadsForCoach` in the layout with a scoped count.
12. **Re-shoot the guide mockups** in the current FLEXR panel look. Link every screen's "Cómo funciona" to its guide article.
13. **Delete dead code:** `UnderConstruction.tsx` and the stale matchers in `proxy.ts`.

### Subjective: Alex's calls

**Q1. What is the home after login?**
- (a) **Hoy, the inbox that tends to zero** (both prior specs).
- (b) Atletas (DECISIONS 2026-08-19 FLEXR, current).
- (c) Atletas with a Hoy summary strip (today's hybrid).

**My recommendation is (a).** This explicitly challenges the 2026-08-19 decision. The goal statement's first job is "know in seconds who needs you and ignore everyone else", and a 100-card grid is the opposite of ignoring. The hybrid (c) is what produces the triple "6 altas" today.

**Q2. Sidebar form?**
- (a) Always expanded, 200 px, 5 items (current philosophy of "día uno sin manual", minus 10 items).
- (b) Collapsible to a 64 px icon rail with `[`.
- (c) Top tabs, no sidebar.

**My recommendation is (a) plus the (b) toggle.** With 5 items, expanded costs little, and power users can reclaim 150 px.

**Q3. Name of the 4-week unit?**
- (a) Keep "Microciclo". It is domain-incorrect: a microcycle is ~1 week.
- (b) "Mesociclo". It is correct, and Spanish coaches know it.
- (c) "Programa", like TrueCoach and TrainHeroic.

**My recommendation is (b) in the coach panel.** The athlete keeps seeing the coach's phase name.

**Q4. Where does Periodización live?**
- (a) A Programar tab.
- (b) Ajustes › Método, as the ux-redesign spec proposed.

**My recommendation is (a).** The coach touches it when assigning, not when configuring.

**Q5. Negocio for coaches without a web funnel?**
- (a) Always shown.
- (b) Shown only when the tenant enables the funnel/billing add-on (`coach_entitlements` already exists).
- (c) Removed from the product for v1.

**My recommendation is (b).** Many coaches who buy FLEXR will bring their own clients and payments.

**Q6. Guide placement?**
- (a) Sidebar item (current).
- (b) "?" in the top bar + contextual links + ⌘K, with `/guia` opening in a full-width reader.

**My recommendation is (b).**

**Q7. English business terms?**
- (a) Keep "Leads" and "MRR", which coaches running a business use, and translate the rest (funnel → embudo, Roster → Atletas).
- (b) Full Spanish ("Interesados", "Ingresos mensuales").

**My recommendation is (a).**
