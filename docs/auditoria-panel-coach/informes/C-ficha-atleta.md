> Informe de área de la auditoría del panel del coach (23-sep-2026). Resumen y propuesta: [../index.html](../index.html). Las capturas citadas vivían en el scratchpad de la sesión de auditoría y no están en el repo; las clave están en [../img/](../img/). Entorno: Postgres local con 100 atletas sintéticos (ver apéndice del índice).

# C · Athlete detail ("ficha") audit

Scope: `/es/atletas/[id]` (5 tabs plus every sub-view), the chat peek, the `···` menu, the session drawer, `/dia/[date]`, `/sesion/[id]`, `/intake`. Athletes checked: 11 Marc Vidal (Atención, draft week), 42 Bernat Font (Atención, week visible), 60 Vera Serra (Nuevo, has a plan), 97 Aina Roig (Nuevo, intake not reviewed, no plan), 76 Cesc Soler (no plan), 10 Alex Solé. Screenshots are in `scratchpad/shots/C/` (`d-` = 1440 desktop, `m-` = 390 mobile, `k-` = dark, `.full.png` = full page). Timings are from the dev server, so treat them as relative. The seed has no HR, pace or trace data, so I could not judge the zone, load and diagnostic charts **with data**. Only their empty states and code are assessed.

---

## 1. Verdict

**Rebuild the information architecture and the plan-editing model. Keep the visual language and about a third of the components.** On desktop the Resumen looks calm and premium and fits one screen. But the numbers disagree with each other and with the roster. The ficha never says why an athlete is flagged, and the coach can't do basic plan edits (move a session, add a session, open any day other than today) from the athlete. Everything else is an accretion: 5 tabs expand to **12 leaf views across 3 nav levels in 3 visual styles**. That's the old 12-tab menu, nested instead of removed.

**Single biggest problem:** the ficha can't be trusted at a glance. On a Wednesday, every athlete I opened showed a red **"▼ cayendo"** adherence bar, including athletes who had done 100% of what was due (Bernat, Vera, Alex). The Plan tab's compliance panel shows **"1%"** for a 100% week. A coach with 100 clients who can't trust the scan goes back to WhatsApp.

---

## 2. Screen-by-screen findings

### 2.0 Structure (all tabs)

The coach is trying to see state, plan and next action without hunting.

| # | Finding | Evidence | Sev | Fix |
|---|---|---|---|---|
| S1 | "5 tabs, not 12" (DECISIONS 2026-08-13) is nominal. The real tree is 5 tabs → Rendimiento {Carrera, Fuerza, Cuerpo} → Carrera {Cómo aterriza, Tiempo en zonas, Ritmos, Carreras}, plus Atleta {Datos, 1:1, Pagos}. That's **12 leaf views**, plus a hidden `?tab=mensajes`, 3 sub-routes and 10+ overlays/modals. It uses three nav styles: underline tabs, filled pills and underlined text links. | `atleta-detalle-types.ts:108-121`, `RendimientoHome.tsx:24-35`, `AtletaTab.tsx:16-20`, d-11-rend-carrera.full.png | P0 | Collapse to 3 destinations (see §4) |
| S2 | Content sits under the wrong headings. **Carrera** (read as "running") holds a *Remo 2 km* test form and multi-sport time-in-zone (Remo/Ski/Bici/Fuerza). **Fuerza** holds "Microciclos completados" and "Versiones de perfil". **Cuerpo** holds "Evaluar semana" (a plan action), running economy and HYROX prediction. | d-11-rend-ritmos.png, d-11-rend-enzonas.png, d-11-rend-fuerza.png, d-11-rend-cuerpo.full.png | P1 | Organise by question, not by leftover component |
| S3 | Every tab click is a server navigation that re-runs the **whole ~22-loader fan-out**. Tab components then add their own client fetches (about 20 call sites). A warm tab switch took 0.4–2.5 s in dev. | `atleta-detalle.ts:340-373`, tabtime run | P1 | Load the header and shell once and lazy-load each section |
| S4 | No previous/next athlete and no keyboard use beyond Esc. Reviewing 100 athletes means going back to the roster every time. | grep: no handlers in `atleta-detalle/` | P1 | J/K next/previous within the roster's current filter |
| S5 | Loader failure looks the same as "no data". The body loader throws (`invalid input value for enum biometric_metric: "sleep_deep"`) and the UI says "Sin señales biométricas todavía". | server log, `BiometriaTab.tsx:119` | P1 | Show a distinct error state; never degrade silently into an empty state |

**Clicks to reach things, starting from Resumen:**
- **Zones:** 2 (Rendimiento → Ritmos). No nav label says "Zonas". Zones live under "Ritmos", and "Tiempo en zonas" is something else.
- **Last session detail:** 1 if it's this week (a day card opens Plan and the drawer, first session of the day only). Otherwise 2 (Plan → Ejecución reciente).
- **Next 2 weeks of plan:** 3 (Plan → › → ›). The two weeks are **never on screen together**, and the "Semanas" rail shows status only.
- **Payments:** 2 (Atleta → Pagos).
- **Why this athlete is "Atención":** not reachable (see R3).

### 2.1 Header and pending line

| # | Finding | Evidence | Sev | Fix |
|---|---|---|---|---|
| H1 | The roster says **Atención**. The loader computes `status_label` ("Atención · fisiología") but **nothing renders it**. The ficha has no status and no reason. | `atleta-detalle.ts:158-176`, grep `status_label` = 0 UI uses, d-11-resumen.png | P0 | Status chip plus reason in row 1 |
| H2 | "N cosas tuyas pendientes" ignores the most common coach jobs. It misses a **draft week the athlete can't see** (Marc: "No lo ve" twice on screen, zero pending items), low readiness, an unanswered check-in and missed sessions. | `ficha-resumen.ts:95-156`, d-11-resumen.png | P0 | Feed it from the same triage engine as Hoy |
| H3 | "Pro · Elite" (HYROX division) sits next to the "N4" badge (Competición), so a coach reads two conflicting levels. | d-11-resumen.png | P2 | Label it as a field: "División: Pro" |
| H4 | "Mensaje" has no unread badge, so you can't tell whether this athlete wrote to you. | `DetalleHeader.tsx:74` | P1 | Add an unread count |
| H5 | The `···` menu holds only Pausar / Dar de baja. That's good placement for destructive actions. | desk-11-menu.png | — | Keep |
| H6 | "Ver plan" in the header, "Abrir semana →" on the card and the Plan tab are 3 routes to one place above the fold. | d-11-resumen.png | P2 | Drop "Ver plan" |
| H7 | "Pagos" uses a different container width (~880 px, centred) from every other view. | d-11-atleta-pagos.png | P2 | Use one layout grid |

### 2.2 Resumen

The coach is trying to answer: how is this athlete doing, and what's happening this week? At 1440 the whole tab fits in 900 px for Marc. That's good. What's above the fold: the week strip, adherence, check-in, "Referencias" (three "sin registro" cells for 5 of the 6 athletes) and the race countdown.

| # | Finding | Evidence | Sev | Fix |
|---|---|---|---|---|
| R1 | **The adherence bar for the week in progress counts every session in the week**, future ones included. It is then painted **red below 60%** with "▼ cayendo". Bernat did every session due so far and shows 40% red. Vera did 3/3 due and shows 40% red, "cayendo". So does Alex. On any weekday, the whole roster reads "cayendo". | `ficha-resumen-load.ts:40-56`, `ResumenTab.tsx:192`, d-42-resumen.png, d-60-resumen.png, d-10-resumen.png | P0 | Count only what's due (due-only denominator). Show the partial week hatched, with "3/3 due · 3 left". Trend compares complete weeks only. |
| R2 | **Three numbers for one athlete-week.** Roster: Bernat 100%, Vera 93%, Marc "sin programar". Resumen bars: 40% / 40% / 40%. Resumen strip: "2 de 6 hechas" for Marc, which counts **days** using `sessions[0]` (the Plan tab shows 4/10 sessions). Plan panel: 0%. | `ficha-resumen.ts:261-272`, roster text extract, d-11-plan.png | P0 | One adherence function, shared everywhere |
| R3 | **Readiness is only shown inside the check-in card.** No check-in means no readiness. Bernat is on Hoy with "Readiness 52%", and his ficha shows no readiness at all. When readiness is shown it's a bare number: no scale, no colour, no baseline, no trend. 42 and 78 look identical (d-11 vs d-10). Hoy writes "52%", the ficha writes "42". | `ResumenTab.tsx:248`, d-42-resumen.png, k-11-resumen.png | P0 | A state block independent of check-in: value vs 28-day baseline band plus a 14-day sparkline |
| R4 | At desktop width, `line-clamp-2` hides the "+1" that marks a second session on a day. Mobile shows it. The sentence "Sin hacer: …" (Vera) refers to a session that no visible card shows. | `ResumenTab.tsx:148`, d-60-resumen.png vs m-11-resumen.png | P1 | Put the count in its own chip; list every session per day |
| R5 | **"Añadir objetivo →" lies.** It opens Atleta, where the card says "El atleta la fija desde su app". | `ResumenTab.tsx:368`, `TargetRaceCard.tsx:91` | P1 | Let the coach set it, or remove the CTA |
| R6 | **"5 km · Programar →" leads to Fuerza**, where "Programar test" is **disabled** (no battery). Running test, strength page, dead end. | `ResumenTab.tsx:324`, d-11-rend-fuerza.png | P1 | Link to the fix: the tests setup |
| R7 | "Referencias" is hard-coded to squat / deadlift / FC máx / 5 km, so the coach's method is written in code (Hard Rule Nº0). When empty, it takes a 3-cell grid, against the spec's own rule that "lo vacío es una línea". | `ResumenTab.tsx:64-72`, spec 2026-08-13 | P1 | The coach picks their key markers; missing ones go on one line |
| R8 | The injury card's "Adaptar sesiones" and "Historial" **both** go to `?tab=atleta`. | `LesionCard.tsx:33-47` | P1 | "Adaptar" opens the adapt dialog directly |
| R9 | The private note is display-only. There's no way to write one from the ficha (only at intake). | `ficha-resumen-load.ts:58`, no UI caller | P1 | Editable note, pinned |
| R10 | The same race is shown three ways: "SINGLES · OPEN · 4 SEMANAS" here, "24 días · Individual · Open · Hombres" in Carreras and Atleta. English and Spanish are mixed. | d-11-resumen.png, d-11-rend-carreras.png | P2 | One formatter |

**Adherence chart quality.** There's no axis, which is acceptable with direct labels. There's no target line (the coach's goal %) and no baseline. Colour carries two meanings: dark = "this week", red = "this week and <60". A past week at 20% stays grey. A week with no data draws an 8 px stub that reads as 0%. The 60% threshold is a `const`, which is method in code.

### 2.3 Plan

The coach is trying to answer "what do I send and how do I change it?" (decision 2026-08-13).

| # | Finding | Evidence | Sev | Fix |
|---|---|---|---|---|
| P1 | **Units bug.** `compliance_pct` is a 0–1 fraction (`macro-progress.ts:157`) and is rendered as a % (`PlanTab.tsx:348`). Result: 80% shows as "1%", 40% as "0%", and Aina's 100% weeks as "1%". | d-11-plan.png, d-97-plan.png | P0 | Fix the unit; merge this panel into the rail |
| P2 | **You can't move a session.** `POST …/sessions/[id]/reschedule` exists (and MCP `move_session` does the same), but there are **0 UI callers**. The week grid has no drag. | grep `reschedule` in components = 0 | P0 | Drag and drop in the week, plus "Mover a…" in the drawer |
| P3 | **You can't add a session to a day.** `POST …/athletes/[id]/sessions` has 0 UI callers. Rest-day cells are passive. The empty day editor says "Vuelve al plan para … asignar una sesión", and the plan has no such control. It's circular. | d-11-dia-empty.png, `semana.tsx:212` | P0 | "+" on every cell: library, blank or AI |
| P4 | **There is no click path to edit any day except today.** The drawer is read-only with no link to the editor. Cells and day headers aren't links. "Editar día" goes to *today* (or the first day of another week). The day editor has no ‹ › day navigation. Editing Thursday's session: **impossible without typing the URL.** Today: Plan → Editar día → select block → edit → Guardar = 5 clicks and a full page change. `docs/design/ux-redesign/SPEC.md` promised "cualquier ejercicio editable en ≤2 clicks" in the drawer. | `SessionDetailDrawer.tsx` (no edit link), `AthleteDayEditorScreen.tsx`, `ux-redesign/SPEC.md §2b` | P0 | The drawer *is* the editor (inline prescription) |
| P5 | **The day editor disagrees with the plan.** Today (Wed 23) the plan shows a session. `/dia/2026-09-23` says "Sin entreno este día". Monday shows 2 sessions in the plan and 1 in the editor. The editor only lists assignments whose template is an athlete instance (`t.instance_athlete_id`). This may be partly a seed artifact, but the empty state lies whenever it happens. | `athlete-day-editor.ts:107`, d-11-dia-today.png, d-11-dia-mon.png | P1 | Show every assignment, and offer "fork to edit" for library templates |
| P6 | "**Publicar**" publishes **all 4 weeks** of the microcycle with no scope in the label, no preview and no confirm. There's no per-week publish from the ficha. | `microciclo/publish/route.ts:1-6` | P1 | "Publicar semana 21–27 sept" plus "Publicar todo"; auto-publish N days ahead as a coach setting |
| P7 | The same draft state has 3 names: "No lo ve" (header, Resumen), "Borrador" (Plan chip, rail) and "publicado" on the session in the day editor (the template's state) while the week is a draft. | d-11-plan.png, d-11-dia-future.png | P1 | One word pair: "Visible / Oculta al atleta" |
| P8 | The same 4 weeks appear three times: "Semanas" rail, "Cumplimiento del microciclo" (S1–S4) and "Cadena de microciclos" (S1–S4). | d-11-plan.full.png | P1 | One multi-week calendar |
| P9 | "Ejecución reciente" has 5 rows with the same title ("Umbral 5×1 km + Wall balls") and **no date**. | d-11-plan.full.png | P1 | Date column, and prescribed vs done |
| P10 | The drawer shows the date as ISO "2026-09-24", is read-only apart from "Quitar sesión", and covers 640 of 1440 px, hiding Fri–Sun of the week it claims to navigate. | desk-11-drawer-future.png | P1 | Human date; narrower drawer or one that pushes the grid instead of covering it |
| P11 | An athlete with no plan (Aina, intake pending) gets a broken header ("Plan del atleta — / —"), live "Editar día" / "Personalizar" buttons and 4× "1%". The intake-first empty state never shows because past sessions exist. | d-97-plan.png, `PlanTab.tsx:91` | P1 | Branch on the athlete's state, not on `total_sessions` |
| P12 | "Sin plan" → "Asignar en Hoy →" **leaves the ficha** to do the core job. The "Planes personales" copy points to "«Añadir microciclo» arriba", which isn't on that screen. | d-76-plan.png, `PlanesPersonalesPanel.tsx:173` | P1 | Assign flow in place, with the athlete preselected (the ux-redesign spec's §5 AssignFlow) |
| P13 | Adjusting a week is scattered across three tabs: "Evaluar semana" lives in Rendimiento › Cuerpo, the resulting proposal banner in Resumen, the effect in Plan. There are no week tools (copy, shift, scale volume, deload). The mass-adjustments API has 0 UI callers. | `EvaluarSemanaPanel.tsx`, grep | P1 | Week-row actions menu |

**Click counts for plan edits:**

| Task | Clicks |
|---|---|
| Remove a session | 4 (Plan → session → Quitar → confirm) |
| Change today's session | ≥5, with a page change |
| Change another day's session | no path |
| Move a session to another day | not possible |
| Add a session | not possible |
| Deload a week | Personalizar (fork the whole plan) → microcycle editor → edit each session, or the Evaluar semana proposal flow across 3 tabs |

### 2.4 Rendimiento

| # | Finding | Evidence | Sev | Fix |
|---|---|---|---|---|
| RD1 | Cuerpo is **1,758 px, 12 panels**, almost all empty states ("Sin …"). The spec's rule was that empty = one line. | d-11-rend-cuerpo.full.png | P1 | Collapse missing sections into "Faltan datos: HRV, umbral, 3′ test → cómo conseguirlos" |
| RD2 | The empty state says it will show check-ins. There is a check-in (visible in Resumen), and it isn't shown. | `BiometriaTab.tsx:119-127` | P1 | Honest copy, and show the check-in |
| RD3 | "Carga": Fondo 25 / Reciente 81 / Frescura −55 / Reciente contra fondo 2,24. These are CTL/ATL/TSB/ACWR renamed into terms no TrainingPeaks coach will recognise. The numbers have no chart and no colour, though −55 and 2.24 are alarming values. | d-11-rend-carrera.full.png | P1 | Standard terms with a plain-language gloss, a PMC chart, and threshold bands from coach data |
| RD4 | "Versiones de perfil" is still the phase-assignment proxy the 11-Aug audit (P3) called false. It shows "v1 · **N1**" for an N4 athlete. | d-11-rend-fuerza.png | P1 | Remove, or wire to real zone versions |
| RD5 | "Solo aquí" (a product-marketing badge) on a panel title. The copy "al estilo Whoop/Oura" names third-party brands. | `correr/paneles.tsx:126`, `BiometriaTab.tsx:124` | P2 | Remove both |
| RD6 | The honest "why there's no number" copy on Cómo aterriza is genuinely good (see §3). It's just 3 full-width cards to say "no data yet". | d-11-rend-carrera.full.png | P2 | One line each |

### 2.5 Del coach, Atleta, Mensajes

| # | Finding | Evidence | Sev | Fix |
|---|---|---|---|---|
| A1 | The "Del coach" tab is a single "Nuevo →" row for most athletes. The composer (5 types plus a phone preview) is strong, but it's an *action*, not a place. Its "Foco" type clashes with Plan's "Foco esta semana". | d-11-delcoach.png, d-11-delcoach-nuevo.png | P1 | Header action "Publicar a Marc…"; history goes into the athlete timeline |
| A2 | Atleta › Datos repeats the intake's classification. "Días de entreno · reales" shows a "**5 días/sem**" chip while every day is "—". | m-11-atleta.png | P2 | Derive the chip from the marked days |
| A3 | The 1:1 sub-tab says "**Al día** · aún sin primera revisión", which contradicts itself. The URL value `sesiones` doesn't match the "1:1" label. | d-11-atleta-11.png | P2 | Say "Primera revisión pendiente" |
| A4 | Pagos: "Precio acordado — /mes" next to "Al día". | d-11-atleta-pagos.png | P2 | "Sin precio fijado" as a pending item |
| A5 | **The chat peek works well**: thread over the ficha, "Abrir en Mensajes", check-in "Responder" lands here. | desk-11-mensajes-peek.png | — | Keep |
| A6 | Intake page: the numbered 6-step checklist with a sticky "Listo para asignar" gate and a disabled "Asignar plan" until the warnings are confirmed is a clear model. It sits outside the ficha chrome (breadcrumb "Altas ›"). | d-97-intake.full.png | — | Keep; make it the ficha's state for "Nuevo" |
| A7 | `/sesion/182` without a trace is an almost-blank page ("Esfuerzo 7") that links back to Resumen, not Plan. It's only reachable by URL. | shots/desk/04g-atleta-sesion.full.png, `SessionDetailDrawer.tsx:278` | P2 | 404 → drawer |

### 2.6 Mobile (390 px)

| # | Finding | Evidence | Sev |
|---|---|---|---|
| M1 | The header is sticky at **203 px**, plus the 56 px top bar and ~64 px bottom nav. That's **~38% of an 844 px screen** of chrome while scrolling. The tabs wrap onto 2 rows. | m-11-plan-scrolled.png | P1 |
| M2 | The Resumen stacks the 7 day cards vertically (~700 px), so adherence starts at **y=1114**. Plan is 2,766 px tall. | m-11-resumen.png, _metrics.tsv | P1 |
| M3 | Day editor: the title overflows (scrollWidth 401 > 390). The copy says "panel izquierdo", but the layout is stacked. | m-11-dia.png | P1 |

Recommendation: on mobile the ficha should be triage-only (state, this week as a 7-dot strip, reply). Editing belongs on desktop.

### 2.7 Labels a new coach won't understand

"No lo ve" · "Del coach" · "Referencias" · "Atleta" (a tab on the athlete's page) · "Datos" / "1:1" · "Cómo aterriza" · "Carrera" vs "Carreras" (run vs race) · "Ritmos" (actually the zone calculator) · "Tiempo en zonas" (includes rowing) · "Cuerpo" (holds running economy) · "Fondo / Reciente / Frescura / Reciente contra fondo" · "Disposición" (vs "Readiness" on Resumen) · "Solo aquí" · "Lo que le cuesta correr cansado" · "Cadena de microciclos" · "Planes personales" · "borradores sin fecha" · "Personalizar" / "Volver a periodización" · "S1–S4" · "Cumplimiento" vs "Adherencia" · "Foco" (week) vs "Foco" (comunicado) · "Evaluar semana" · "Versiones de perfil" · "Clasificación · para asignación" · "Lista para asignar" · "Días de entreno · reales" · "cerrar el alta" · "SINGLES" · "Pro · Elite" · "hecha / sin hacer / prevista / en curso" · "Te reclama" · "Protocolo / Pregunta / Tarea / Nota / Foco".

---

## 3. What to keep

- **Visual system.** Dark mode has parity (k-11-resumen.png). Type and density are calm and on-brand. The Resumen fits one desktop screen.
- **The two-row header** and the idea of a pending line with links plus "también en Hoy". The pattern is right; it just needs more inputs.
- **The week-state chip model** (existence × visibility, one function, DECISIONS 2026-08-18). It's honest; only the words need unifying.
- **The drawer's prescribed-vs-done per item** (`ItemPrescritoHecho`, per-segment run compliance), the non-modal peek behaviour and the deep link `?tab=plan&sesion=<id>`.
- **The chat as a peek** over the ficha, and check-in "Responder" landing there.
- **Honest empty-state reasoning** ("sin pareja no hay número…"). Keep the honesty, cut the footprint.
- **The intake checklist** with its assign gate. **Classification chips** (1 click, optimistic). **Lifecycle actions tucked in `···`.**
- **The Del coach composer with live phone preview** (as an action, not a tab).

---

## 4. Target design: the athlete cockpit for 100 clients

The principle: the ficha answers four things in order. **Why am I here? What's his state? What's the plan for the next 3 weeks? What do I do?** Every one of them must be visible without clicking. Anything else is one click away, in 2 secondary views, not 12.

```
┌─ ‹ K  Marc Vidal  N4 · Pro · HYROX BCN en 24 d                J › ─ [Mensaje ●2] [Publicar sem.] ··· ┐
│  ● ATENCIÓN  readiness 42 (−18 vs su base) · 1 sesión sin hacer · semana oculta al atleta           │
├─ HACER AHORA ───────────────────────────────────────────────────────────────────────────────────────┤
│  [Publicar 21–27 sept]  [Responder check-in «la última me costó»]  [Ajustar miércoles: sin hacer ▸] │
├─ PLAN ─ Semana | 3 semanas | Macro ──────────────── adherencia due-only: 3/4 ✓  carga ▂▃▅ ─────────┤
│        LUN        MAR        MIÉ(hoy)    JUE        VIE        SÁB        DOM                         │
│ 21–27  ■Umbral✓   ■Umbral✓   ■Umbral✗   □Umbral    □Umbral    □Umbral    +       Oculta ▾  ⋯ semana  │
│        ■Z2 45'✓   ■Fuerza✓              +          □Z2        □Fuerza                                 │
│ 28–4   □…         □…         □…         □…         □…         □…         +       Oculta ▾  ⋯         │
│ 5–11   □…         …                                                              Oculta ▾  ⋯         │
│   drag = mover · click = cajón editable · + = añadir (biblioteca / en blanco) · ⋯ = copiar, desplazar, │
│   escalar volumen %, descarga, publicar                                                              │
├─ ESTADO (derecha, 328px) ───────────────────────────────────────────────────────────────────────────┤
│ Readiness 42  ▁▂▅▆▄▂▁ (banda base 28d)   Sueño 6:10 (−0:40)   Agujetas 2/5 ↑                         │
│ Check-in ayer «Bien, la última me costó»  [Responder]                                                │
│ Lesión activa · rodilla · leve  [Adaptar sesiones]                                                   │
│ Carrera objetivo HYROX BCN · 17 oct · obj 1:12:00                                                    │
│ Nota privada ✎ (editable, fijada)                                                                   │
│ Marcadores del coach (elegidos por él): 5k 19:40 · Row 2k — · FC máx — → «faltan 2: programar test»  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
 Secondary views (tabs): [Plan ▸ cockpit]  [Rendimiento]  [Perfil]
```

**Structure:**
1. **Cockpit (default).** It merges Resumen and Plan. It has 3 zones:
   - **Why and what.** The status chip carries its reason. The "Hacer ahora" chips come from the Hoy triage engine: publish, reply, missed session, low readiness → propose adjustment, intake, payment, comunicado.
   - **The calendar, 3 weeks by default** (zoom Semana / 3 semanas / Macro). Every session is visible, the published/hidden state sits per week row, adherence counts only what's due, and a load bar runs along the row.
   - **The state column.**
2. **The drawer is the editor.** It edits the prescription inline and offers Mover (date picker), Duplicar, Reemplazar desde biblioteca and Quitar, plus prescribed-vs-done for past sessions. The standalone `/dia/[date]` page goes away, or stays only as a full-screen view of the same component, with ‹ › day navigation.
3. **Rendimiento: one scroll, sections ordered by the coach's question.**
   - **Zonas y tests:** calculator, versions, programar test.
   - **Running:** how it lands, time in zones, load chart (PMC).
   - **Fuerza:** 1RM trends.
   - **Fisiología:** HRV/RHR vs baseline.
   - **Carreras.**
   
   Missing sections collapse into one "Faltan datos" line with the fix. "Evaluar semana" moves to the week-row `⋯` menu.
4. **Perfil.** Holds datos and classification, lesiones, días, 1:1, pagos and the comunicados history as one athlete timeline (messages, comunicados, check-ins, 1:1s, tests, injuries, plan changes in one reverse-chronological feed, filterable).
5. **Actions live in the header:** Mensaje (peek), Publicar a Marc (the composer), Publicar semana, `···` lifecycle. J/K moves between athletes and keeps the roster filter.
6. **"Nuevo" athletes.** The cockpit *becomes* the intake checklist (A6) until the gate is passed. There's no broken plan tab.
7. **Mobile.** Status and reason, a 7-dot week, the state block, and Mensaje/Responder. Header ≤96 px, not sticky beyond the name row.

**Merged or removed:**
- Removed as separate surfaces:
  - Resumen strip vs Plan canvas.
  - Semanas rail, S1–S4 compliance and Cadena S1–S4.
  - Three race cards.
  - Tabs: Del coach, Atleta, and the four Carrera capas as navigation.
  - Versiones de perfil.
  - "Solo aquí".
  - Header "Ver plan".
- Kept as data but moved: Cadena / Planes personales go into Macro zoom and "Plan personal" in `⋯`.

---

## 5. Objective vs subjective

**Objective. Just do these; no taste involved:**
1. Fix the `compliance_pct` fraction-as-% bug (P1).
2. One adherence function (due-only for the current week; complete weeks for trend), used by roster, Hoy, ficha and Plan (R1, R2).
3. Render the status and its reason. Readiness shows independently of check-in, with a baseline (H1, R3).
4. Feed the pending line from the Hoy triage: draft week, check-in, missed session, readiness (H2).
5. UI for the existing endpoints: move a session (`reschedule`), add a session (`POST sessions`), open any day or session for editing from the calendar and drawer, day navigation in the editor (P2–P4).
6. The day editor must list every assignment on the day (P5).
7. Remove or fix lying CTAs: "Añadir objetivo", "5 km · Programar" → disabled button, Lesión's two identical buttons, the "Añadir microciclo arriba" copy, the Biometría empty-state copy, "Versiones de perfil" (R5, R6, R8, P12, RD2, RD4).
8. One word pair for visibility. Human dates in the drawer. Dates in "Ejecución reciente". Don't clip the second session.
9. Move methodology out of `const`s into coach data with the current values as defaults: readiness <45, adherence red <60, the "Referencias" set, load thresholds (Hard Rule Nº0).
10. Loader errors must be distinct from empty data. Empty sections collapse to one line.
11. Mobile: fix the title overflow and cap the sticky header.
12. Unread badge on Mensaje. Explicit publish scope.

**Subjective. Alex decides:**
1. **Default landing view?**
   - (a) Keep Resumen.
   - (b) Plan-calendar.
   - (c) **A merged cockpit: why + state + 3-week calendar.** *Recommend (c).*
2. **How many tabs?**
   - (a) Keep 5.
   - (b) **3 (Cockpit · Rendimiento · Perfil).**
   - (c) A single long page with anchors.
   
   *Recommend (b).* This explicitly challenges DECISIONS 2026-08-13: "5 pestañas" became 12 leaf views and scattered the week and adjustment flows.
3. **Where do comunicados live?**
   - (a) Their own tab (current).
   - (b) **A header action, with history in the athlete timeline.**
   - (c) Inside Mensajes.
   
   *Recommend (b).* This challenges 2026-08-09/13 on placement, not on the "publicar ≠ chat" principle, which stays.
4. **Publishing model?**
   - (a) Whole microcycle (current).
   - (b) Per week.
   - (c) **Per week plus a coach-set auto-publish N days ahead.** *Recommend (c).*
5. **Calendar horizon by default?** 1 week / **3 weeks** / 4-week month. *Recommend 3 weeks.*
6. **Load vocabulary?**
   - (a) Spanish folk terms (current).
   - (b) **Standard CTL/ATL/TSB/ACWR with a plain gloss.**
   - (c) Hide load.
   
   *Recommend (b)*: TrainingPeaks-trained coaches already speak it.
7. **Mobile ficha?** Full parity / **triage-only**. *Recommend triage-only.*
8. **The 4 header KPIs?** Readiness vs baseline · adherence due-only · load (ACWR) · race countdown, or swap one for "last contact". *Recommend the first set.*
9. **Tab label names**, if tabs are kept: "Del coach" → "Comunicados"; "Atleta" → "Perfil"; "Carrera" anchor → "Running". *Recommend renaming.*
