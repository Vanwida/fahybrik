> Informe de área de la auditoría del panel del coach (23-sep-2026). Resumen y propuesta: [../index.html](../index.html). Las capturas citadas vivían en el scratchpad de la sesión de auditoría y no están en el repo; las clave están en [../img/](../img/). Entorno: Postgres local con 100 atletas sintéticos (ver apéndice del índice).

# B · Roster + daily triage at 100 athletes

Screenshots are in `scratchpad/shots/B/` (1440×900 unless marked `-mob`). The extracted data (`hoy-lanes.json`, `hoy-sets.json`, `atletas-rows.json`) comes from the live page payloads, measured on 2026-09-23 against the 100-athlete seed.

## 1. Verdict

**Rebuild Hoy from scratch, and rework Atletas and Mensajes.** Most of the parts exist and several are good: the week chip, the honest empty states, the chat, and an attention engine on the backend with snooze and bulk. The screens put them together into a wall, not a queue. With 100 athletes, Hoy says **"92 decisiones"**, shows **114 cards**, and flags **82 of 100 athletes**. None of it can be resolved, snoozed or done, so the queue never shrinks.

**Biggest problem:** v2 Hoy (`buildHoyLanes`) skips the manage-by-exception engine the SPEC built (`coach_attention_items`, `loadAttentionQueue` capped at 15, the snooze/bulk endpoints). It re-derives lanes from raw roster fields with thresholds that fire on almost everyone. It counts one athlete up to three times. It also leaves out the most important operational fact in the data: **47 athletes can't see their week** (it is still a draft).

## 2. Screen-by-screen findings

### 2.1 `/es/hoy`: "who needs me today?"

**Where the 92 comes from** (`HoyBoard.tsx:151-154`): `need_attention_count` (Falló 10 + Vigilar 46 = 56) + altas 6 + asignación 30 = **92**. "Listo" (8) and "Espera respuesta" (14) are drawn as lanes but left out of the number, so the headline and the board disagree.

| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| H1 | The 92 counts **70 distinct athletes**. 22 are double-counted: 16 are in both Vigilar and Asignación, 4 in Asignación and Altas, 3 in Vigilar and Altas, 1 in Falló and Altas. Counting every card, **82/100 athletes appear somewhere on Hoy**. Aina Roig appears three times (Altas, Asignación, Vigilar). | `hoy-sets.json`; `hoy-full.png` | P0 | One row per athlete. The headline counts distinct athletes who need action. |
| H2 | **30 Asignación cards are one method gap.** All 30 are `blocked / nunca_asignado / sin_receta`, and the same paragraph repeats 30 times: "Tu periodización de N4 · 5 días no tiene secuencia…". The cells are N1–N5 × 5 días, so 5 cells cover 30 athletes. Expanded, the strip is **1,953 px** tall. | `hoy-asignacion-expanded.png`, `hoy-lanes.json` | P0 | Group by cause: "30 atletas sin bloque: faltan secuencias de 5 días (N1–N5)" with [Crear secuencia] or [Asignar bloque a los 30]. |
| H3 | **"Vigilar fisiología" is mostly not physiology.** 16 of its 46 reasons read "Sin plan activo". `physioReason()` prints `alert_label` first, and plan-gap athletes carry that label (`hoy-lanes.ts:228-230`). The plan-gap exclusion only guards the Falló lane (`hoy-lanes.ts:877` vs `:891`). | `hoy-lane-vigilar.png` (Aina Roig, Cesc Soler) | P0 | Planless athletes never go in a physiology lane. |
| H4 | **Readiness fires on any single value under 67** (`constants/readiness.ts`: 45–66 counts as "cautela"). There is no baseline, no persistence and no date floor. `getLatestReadinessBatch` takes the latest snapshot ever (`athlete-daily-readiness.ts:543-555`, only `<= today`), so a three-week-old score still flags. Cards give no date. The label "Fatiga CNS alta" is just readiness < 45 (`list.ts:344-346`); it claims a mechanism nobody measured. | code; `hoy-lane-vigilar.png` | P0 | A signal needs recency, deviation from the athlete's own baseline, and persistence (the SPEC §8 "trend, no spot"). Show value, baseline and date. |
| H5 | **Lanes sort A→Z** (roster order `order by a.full_name`), not by severity. The first cards in Vigilar are Aina, Bernat, Berta, Berta, Berta, Cesc, so a 65% "cautela" sits above a 38%. | `hoy-lane-vigilar.png` | P0 | Worst first, then oldest. |
| H6 | **"+ 38 más" is a dead button**: it has no `onClick` (`HoyLane.tsx:82-87`). Clicking it left the lane at 8 cards (measured). That makes 38/46 Vigilar, 6/14 Espera and 2/10 Falló cards unreachable except by typing a name into search. (The strip version in `DecisionStrip.tsx:70-77` does work.) | measured | P0 | Remove the cap and paginate the list. |
| H7 | **Responder / Mensaje open the wrong conversation.** Both go to `/mensajes` without `?hilo=` (`LaneCard.tsx:32-33`), even though the page supports `hilo` (`mensajes/page.tsx:33`). Mensajes then auto-opens the *first unread* thread and marks it read (`MensajesScreen.tsx:79-86`, `useConversation.ts:189-193`). Clicking "Responder" on David Costa therefore opens Xavi Prat and silently clears Xavi's unread. (Verified from code; I didn't click it, so shared data stayed as it was.) | code | P0 | Open a chat drawer in place (reuse `ChatPeek`), or at least `?hilo=`. |
| H8 | **No resolve / snooze / done anywhere.** A card leaves only when the underlying data changes. The endpoints exist but nothing in the UI calls them: `api/coach/inbox/snooze`, `api/coach/inbox/bulk`, `api/coach/messages/broadcast`. | grep | P0 | Wire them in; the queue has to trend to zero. |
| H9 | **"Espera respuesta" means unread, not unanswered** (`unread_for_coach > 0`, `hoy-lanes.ts:931`). Opening a thread clears it even with no reply. Live evidence: Berta García's question ("¿qué peso pongo si no llego al pautado?") was read by someone, is unanswered, and no longer appears in any queue. | `mensajes.html`; `mensajes-fold.png` | P0 | Count as waiting when the last message is from the athlete, older than a threshold, and not marked "no reply needed". |
| H10 | **Unpublished weeks aren't a decision.** In the roster, 47 athletes are `No lo ve` (draft week) and 30 are `Sin plan`. Hoy only shows a pill, "23 de 100 ven esta semana". Some athletes who can't see their plan are offered "Descargar carga". | `atletas-rows.json`; `hoy-fold.png` | P0 | Add a top grouped item, "47 atletas no ven su semana", with [Publicar] as a bulk action. |
| H11 | **Falsely triggered "Falló sesiones":** 6/10 cards are "2 días sin completar ni registrar nada" (`inactivity_alert_days: 2`), and one of them has 85% adherence. Two quiet days can be a rest day. The copy "Semana al 100%" / "Solo 50% de la semana" describes a **30-day** window (`list.ts:210-233`). | `hoy-full.png` | P1 | Count missed *scheduled* sessions in the last 7 days, and label the window honestly. |
| H12 | **"Listo para progresar" offers only "Ver"** (8 cards). There is no action and it isn't counted, so it is a daily lane for a decision that belongs to a weekly or end-of-microcycle review. | `hoy-full.png` | P1 | Move it to a weekly review item; on Hoy it becomes one grouped line at most. |
| H13 | **Fold:** at 1440×900 none of the four lanes is visible; the first lane starts at **y = 1,209 px**, and the page is 2,597 px (4,009 px with Asignación expanded). On mobile the first lane is at **y = 2,839 px** and the page is 7,698 px. The fold goes to 6 full-width "Revisar alta" black bars (a 4 + 2 layout with 2 stretched to half width) and 4 identical Asignación cards. | `hoy-fold.png`, `hoy-mob.png` | P1 | Use a dense list; the fold should hold roughly 15 rows. |
| H14 | **Keyboard:** 104 Tabs to reach the first lane action. There is no j/k, no ⌘K and no shortcuts (grep finds no palette). Search filters only the lanes, not the strips (`HoyBoard.tsx:131-138`). | measured | P1 | Add SPEC §4 keys: J/K, E done, H snooze, R reply, Enter peek. |
| H15 | "Actividad de hoy" (27 sessions, 4 visible in a rail) is ambient information inside a decision queue. | `hoy-full.png` | P2 | Move it to an Activity feed, or collapse it to one line. |
| H16 | Hardcoded method: the readiness bands 67/45 (Hoy) and 55/45 (roster, `list.ts:344-349`), `READY_ADHERENCE_MIN = 90` and `compliance_attention_max_pct: 70` are all `const`. That breaks HARD RULE Nº0. | code | P1 | Move them into `coach_signal_thresholds` with defaults. |

**What of `hoy-redesign/SPEC.md` was built**

| SPEC promise | State |
|---|---|
| `signal-config.ts`, evaluators, `coach_attention_items`, recompute, resurface, `loadAttentionQueue` (cap 15), snooze + bulk endpoints (F0/F1) | **Built, but not used by the UI.** `lib/dashboard/coach/hoy-data.ts` has zero importers; v2 Hoy reads `coach_attention_items` only for `transition_ready` (`hoy-lanes.ts:712-721`). The communication signals (DECISIONS 2026-08-09) and the payment signals (`inbox.ts:384-432`, computed then dropped by `buildHoyLanes`) never reach the screen. |
| ~8–15 cards; trends to zero; Resolver/Posponer/Abrir; auto-resolved drawer; undo | **Not built.** There are 114 cards and no item actions. |
| Crítico → Vigilar severity tiers, worst first | **Replaced** by four lanes grouped by *type*, sorted A→Z. |
| Lens tabs `?lens=`, J/K keys, ⌘K, bulk bar, non-modal side panel, ThreadDrawer from "sin responder" | **Not built.** |
| Empty state "Todo revisado" | **Built**, and better than the SPEC: `hoyHeadlineKind`, "Nadie ve esta semana". |
| ISR/cacheTag instead of `force-dynamic`, DB-level filtering, pagination | **Not built.** All four routes are `force-dynamic` and nothing is paginated. |

### 2.2 `/es/atletas`: the roster

| # | Finding | Evidence | Sev | Recommendation |
|---|---|---|---|---|
| R1 | **Filters, search and sort are lost on back.** Filtering Atención + "ber" (5 rows), opening an athlete and pressing back leaves 100 rows, an empty search and the filter off (measured). The state lives in `useState`, not the URL. Working through 44 "Atención" athletes means re-applying the filter 44 times. | `b_back.mjs` output | P0 | Keep all filter state in the URL, add saved views, and open athletes in a peek panel. |
| R2 | **The default sort is adherence, highest first** (`RosterDirectory.tsx:130,191-193`). The first screen is the 12 athletes at 100% (`atletas-cards-fold.png`), the ones who need the coach least. 77/100 have no adherence (`sin programar`) and sink to the bottom by name. | `atletas-rows.json` | P1 | Default to "needs me" (severity, then days since last activity). |
| R3 | **Density: 12 athletes fully visible in both views.** Cards are 129 px tall in 3 columns; table rows are 49 px, but the first row starts at y = 299 px. The header, the two-line triage strip (75 px) and a 320 px right rail eat the gain, so the table's only advantage is more columns. On mobile, **1** card is visible and the page is 14,588 px. | `atletas-cards-fold.png`, `atletas-table-fold.png`, `atletas-mob.png` | P1 | Use 36–40 px rows, drop the strip and the rail, and aim for ~18 rows at 900 px. |
| R4 | **The table clips its last column at 1440**: "ÚLT. REGISTRO" reads "hace 2…" and the chevron is hidden. | `atletas-table-fold.png` | P1 | Fix the widths in `grid.ts`. |
| R5 | **What a card says:** name, "N4 · Demo · Acumulación…" (truncated), a colour dot whose label exists only for screen readers (`RosterStatusDot` `sr-only`, no `title`), and a bar with a % that has **no label or window**. The meter's `aria-label` says "Adherencia"; it is a 30-day rolling value, which Mensajes labels "ADHER. 30D" and Hoy calls "semana". There is **no reason for "Atención"**, even though `alert_label` is loaded. Readiness and target race are loaded (`AthleteRow`) but never shown. | `atletas-card-closeup.png`, `list.ts` | P1 | Show the status *reason* as text. Add readiness (value, trend, date), the next session, race T-minus and "sin responder". |
| R6 | **"Sin plan" status can never appear.** A plan gap always sets `alert_severity` (`list.ts:329-343`), and `rosterStatus` checks `atencion` before `sin_plan` (`atletas-status.ts:75-76`). So 30 planless athletes read as red "Atención", the same as fatigue (`atletas-table-atencion.png`: Cesc Soler, "Atención / Sin plan"). | code + shot | P1 | One status model with its reason. |
| R7 | **Three definitions of "needs attention."** Roster "Atención" = 44 (readiness < 55 or a plan gap). Hoy = 56 (readiness < 67, compliance < 70, inactivity ≥ 2 d). Mensajes has a third `V2Status` (`mensajes-data.ts:14-18`). **20 athletes Hoy flags show green "Activa" in the roster**, and 12 roster "Atención" athletes appear in neither Hoy lane. | `atletas-rows.json` × `hoy-sets.json` | P0 | One signal source (`coach_attention_items`) read by every surface. |
| R8 | **No bulk actions**: 0 checkboxes. With 100 clients you can't assign a microciclo, publish a week, message, tag or change the level of several athletes at once. The broadcast endpoint exists but nothing uses it. | measured | P0 | Row select + bulk bar. |
| R9 | **No keyboard use**: 33 Tabs to reach the first athlete, and there are no shortcuts. | measured | P1 | j/k, x to select, / to search. |
| R10 | **Filter labels are wrong or hardcoded.** "Test pendiente" actually filters "Alta sin revisar", the same as the Nuevo chip (`RosterDirectory.tsx:81-87`, TODO). The Nivel options are hardcoded N1–N5 (`:70-79`, which breaks HARD RULE Nº0). Sort has 4 options, no direction and no header sorting. | `atletas-dd-*.png` | P1 | Read levels from the coach's data, remove the fake filter, and make headers sortable. |
| R11 | **Duplication on one screen:** the "6 altas sin revisar" count appears three times (strip link, `Nuevo · 6` chip, rail card), plus Hoy's strip and `/altas`. That is **5 entry points** to 6 athletes. The triage strip repeats Hoy, but its lane chips are plain spans and can't be clicked. "Clara, Clara y 6 más" is ambiguous because it shows first names only. | `atletas-cards-fold.png` | P1 | Remove the strip; a nav badge on Hoy is enough. |
| R12 | **The right rail spends 28% of the width** on one link and an **empty** Dobles panel ("Aún no hay parejas"). | `atletas-rail.png` | P1 | Move Dobles to its own view or filter. |
| R13 | **Agregar atleta** asks for name, email and modality, one person at a time. It has no level, plan or group, and there is no CSV or bulk invite. Onboarding 100 clients means 100 modal round-trips. | `atletas-add-modal.png` | P1 | Allow bulk invite by pasting a list or CSV, and assign plan and level at invite time. |

### 2.3 `/es/altas`

It is a clean list: one row per athlete, an age, one action ("Revisar alta"), and a count footer (`altas.png`). **It is the right pattern for the whole area.** It is also a sixth place to reach the same 6 people. **P2:** make it a saved view or group inside Hoy, not a page of its own.

### 2.4 `/es/mensajes`

This is a working three-pane chat: list, live thread, and a context panel with readiness and actions (`mensajes-fold.png`). "Sin leer · 14" is the default, and `?hilo=` deep links work. It is **not an inbox at scale** yet:

| # | Finding | Sev | Recommendation |
|---|---|---|---|
| M1 | **Read = handled.** The only filter is unread, and opening a thread clears it (see H9). There is no "needs reply" state, no mark-unread, no done and no snooze. | P0 | Default to "Por responder" (last message from the athlete), with Done and Snooze. |
| M2 | **Sorted newest first** (`chat/service.ts:183`), while Hoy's Espera lane is oldest first. Rows show a clock time ("16:40"), not how long the athlete has waited. | P1 | Oldest wait first, with an age badge that escalates in colour. |
| M3 | **No search and no filters** by status or level (100 threads under "Todas"). | P1 | Add search and filters. |
| M4 | **You can't reply from triage** (see H7). A drawer already exists (`atleta-detalle/ChatPeek.tsx`) but only on the athlete page. | P0 | Reuse it on Hoy and Atletas. |
| M5 | The context panel's "SESIÓN DE HOY" card shows the microciclo name, not today's session. "Reprogramar" and "Ver plan" go to the same URL (`ContextPanel.tsx:118,131`). | P2 | Show the real session of the day. |
| M6 | The page loads the **whole roster** (`fetchAthletesForCoach`, ~317 queries, see below) to feed one context panel (`mensajes-data.ts:44-49`). | P1 | Load the context of the selected thread only. |

### 2.5 Performance and scaling (measured and code-counted)

**Load time.** Warm, with a local Postgres (sub-millisecond latency):

| Route | Warm load | Under concurrent load |
|---|---|---|
| `/es/atletas` | 1.06–1.37 s | 1.5–4.3 s |
| `/es/hoy` | 1.13–1.31 s | 1.5–4.3 s |
| `/es/mensajes` | 0.87–1.11 s | — |
| `/es/altas` (control page, ~8 queries) | 0.32–0.48 s | — |

The "concurrent load" figures were taken while other auditors were using the server. So about **0.8–0.9 s of each heavy page is data loading, even with no network latency.** The HTML is 354 KB for `/atletas` and 251 KB for `/hoy`, with no virtualization; all 100 cards render. Card and table view come back from the server as the same payload, because the toggle is client-side.

**Queries per render**, counted from the loaders (seed: 70 athletes with a plan, 0 sequence enrollments):

| Loader | Queries at N=100 | Pattern |
|---|---|---|
| `fetchAthletesForCoach` → `loadProgrammingStatusMap` | **~310, sequential** (a `for … await` loop of 1–5 queries per athlete, `shared/domain/coach/programming-status.ts:193-195`). Its comment says "no N+1". | O(N) serial |
| `fetchAthletesForCoach`, everything else | main query with 9 laterals + order-altered + readiness (2, plus 6 per athlete with no snapshot, serial) + week chip (3) | ~7+ |
| `fetchAsignacionSugeridaCards` | 1 + **~300** (`resolveSequenceForAthlete` ×100: athlete, `to_regclass`, sequences) + 2. **70 of 100 results are thrown away** afterwards (`tieneHueco`) | O(N) parallel on a pool of 10 |
| `loadCoachInbox` | ~8, but it **re-loads threads and intakes** that the page already loaded, and then computes payment alerts `buildHoyLanes` discards | — |
| Layout | ~5, including `listThreadsForCoach` (the **third** call on `/hoy`) | — |
| Remaining Hoy loaders | ~10 | — |

**Totals:** `/hoy` ≈ **640 queries**, `/atletas` ≈ **640** (it runs the whole Hoy pipeline just to draw the strip), `/mensajes` ≈ **320**.

**Scaling.** Both big loops grow linearly, so at 300 athletes that is roughly **1,900 queries per render**. On Neon at 1–3 ms per round trip, the ~930 serial programming-status queries alone would add 1–3 s to every visit. Neither page scales to 300 athletes.

## 3. What to keep

- **`WeekStateChip`** (Visible / No lo ve / Sin plan / Bloque terminado). It is the most useful column in the roster and should drive a Hoy group.
- **Honest emptiness:** `clubWeekCensus` and `hoyHeadlineKind` ("Nadie ve esta semana", no green checks over an undelivered week). `AdherenceBar` says "sin programar" instead of drawing a fake 0% bar.
- **The two-axis Asignación model** (`programa` = the athlete's own history, `receta` = the method gap, `hoy-asignacion.ts`). The model is correct; only the grouping is wrong.
- **`DecisionStrip`'s honest count** ("+ 22 más" that actually expands).
- **The backend attention engine**: `coach_attention_items`, the evaluators, `resurface.ts` (signal-aware snooze), `loadAttentionQueue`, and the snooze, bulk and broadcast endpoints. It is the right foundation and it is already paid for.
- **Chat**: three panes, live, `?hilo=` deep links, the context panel, and `ChatPeek` as a reusable drawer.
- **The `/altas` list pattern**: one row, one reason, one action, a count.
- **Degrade-per-loader** (`.catch` on each source), the live search, and status chips that double as counters.

## 4. Target design (100 → 300 clients)

**Structure.** There are three surfaces with distinct jobs, and all of them read one signal source (`coach_attention_items`):

- **Hoy** is the queue that trends to zero.
- **Atletas** is a dense table with saved views and bulk actions.
- **Mensajes** is an inbox organized around "por responder".

Remove the triage strip, the roster's right rail, the separate `/altas` page (it becomes a view), and "Actividad de hoy" from Hoy.

### Hoy: one list, one row per athlete, grouped by severity, systemic issues first

```
Hoy · 14 te necesitan · 23/100 ven su semana                 [⌘K]  [buscar]
[Todo 14] [Sin responder 5] [Sesiones 3] [Fisiología 2] [Plan 4]   ← ?lens=
─ AFECTA A VARIOS ─────────────────────────────────────────────────────────
▣ 47 atletas no ven su semana (borrador)        [Publicar a los 47] [Ver]
▣ 30 atletas sin bloque · faltan secuencias 5 días (N1–N5)
                                     [Crear secuencia] [Asignar bloque…]
▣ 6 altas sin revisar · la más antigua 1 d            [Revisar en fila →]
─ CRÍTICO ─────────────────────────────────────────────────────────────────
☐ MC Marta Costa  N3  ● Readiness 31 · −24 vs su base · 3 días    2 h
     [Descargar semana] [Responder] [Posponer ▾] [Hecho]
☐ XP Xavi Prat    N3  ✉ «¿qué peso pongo si no llego…?» · espera 19 h
─ VIGILAR ─────────────────────────────────────────────────────────────────
☐ JO Joan Ortega  N4  ◐ 3 de 5 sesiones perdidas (7 d)   +1 señal
▸ Resuelto hoy (9) · Pospuesto (4)
```

- **Row** = avatar, name, level, the *primary* signal as a typed chip with its evidence (value, baseline, window and date), "+N señales", age, then the actions: the primary verb, Posponer ▾ (1 d / 3 d / hasta nueva señal), and Hecho.
- **Enter** opens a **non-modal peek panel** on the right: readiness contributors, this week's sessions, and a chat tab (`ChatPeek`). The queue stays visible behind it.
- **Keys:** J/K move, E marks done, H snoozes, R replies, X selects, Shift+J/K selects a range. There is a 5 s undo toast.
- **Systemic rows** group any signal that shares a cause (method cell, unpublished week, intake) and offer one bulk action.
- **Listo para progresar** leaves the daily queue for a weekly "Revisión" item.
- **Expected size on this seed:** 3 group rows plus about 10–15 athlete rows. That matches the SPEC's 8–15 and is far from today's 114.

### Atletas: an Attio-style table

```
Atletas · 100   Vistas: [Necesitan algo 14] [Sin plan 30] [No ven semana 47] [N4] [+ Guardar]
☐ Atleta ▲ │Estado + motivo        │Semana   │Readiness 7d  │Adh 14d│Últ. ses│Próx. ses│Carrera │✉
☐ Marta C. │● Readiness baja 3 d   │Visible  │31 ▁▂▁ hoy    │ 60%   │ ayer   │ jue Z2  │T-12 d  │2
─── 3 seleccionados: [Asignar microciclo] [Publicar semana] [Mensaje] [Nivel] [Etiqueta] [Pausar] ───
```

- **Default view:** "Necesitan algo", ordered worst first. Filters, sort and search live in the URL and survive back; saved views persist per coach.
- **Rows** are 36–40 px (about 18 rows per 900 px screen) and headers are sortable (`aria-sort`).
- **Cards** become an optional density for small rosters.
- **Row click** opens the same peek panel as Hoy.
- **Performance:** server-side paginated or virtualized; statuses read from the precomputed attention table (one indexed query). The programming-status N+1 is replaced by one set-based SQL query.

### Mensajes

- Default filter is **"Por responder"**: the last message is from the athlete, the coach hasn't replied, and it hasn't been marked "no requiere respuesta". The oldest wait comes first, with an age badge that goes grey, then amber, then red.
- Add search, **Hecho** / **Posponer**, mark-unread, and send-to-several (the broadcast endpoint).
- Load context only for the open thread.

## 5. Objective vs subjective

**Objective: just do these**

1. Responder and Mensaje open *that* athlete's thread (in a drawer, or via `?hilo=`) and never mark someone else's messages read (H7).
2. Fix or remove the dead "+ N más" (H6).
3. Count one athlete once, and make the headline equal to the rows shown (H1).
4. Group shared-cause items: the method gap, unpublished weeks and intakes (H2, H10).
5. Keep planless athletes out of "Fisiología". Readiness signals need recency, a personal baseline, persistence and a visible date. Drop "Fatiga CNS" (H3, H4).
6. "Espera respuesta" means unanswered, not unread (H9, M1).
7. Sort worst first everywhere (H5, R2, M2).
8. Use one attention and status model across Hoy, Atletas and Mensajes, read from `coach_attention_items`, and make the "Sin plan" status reachable (R6, R7).
9. Wire resolve, snooze, bulk and broadcast to the endpoints that already exist (H8, R8).
10. Put filter and view state in the URL (R1).
11. Remove the N+1s: batch the programming status, stop resolving sequences for athletes that are then discarded, and don't load the Hoy pipeline on `/atletas` or the roster on `/mensajes` (§2.5).
12. Thresholds and the level list become coach data with defaults, not `const` (H16, R10). That is HARD RULE Nº0.
13. Label adherence with its window everywhere; fix "Semana al X%" and the "Test pendiente" filter (H11, R10).
14. Fix the clipped table column and the unlabelled status dot (R4, R5).

**Subjective: questions for Alex**

1. **What is home?**
   - (a) Hoy, the queue, as landing, with Atletas as the table.
   - (b) Atletas as landing, with a queue mode inside it.
   - (c) One screen where Hoy is the default saved view of Atletas.

   *Recommend (a).* This explicitly challenges the 2026-08-19 decision ("el roster es la casa, el triage una franja"). At 100 clients the home has to answer "who needs me", and a roster sorted by adherence answers "who's fine".
2. **Hoy's grouping.**
   - (a) By severity (Crítico / Vigilar) with type chips and lens tabs.
   - (b) Keep the four lanes by type.

   *Recommend (a).* Lanes hide severity and force a 4-column layout below the fold.
3. **Roster cards view.**
   - (a) Remove it.
   - (b) Keep it as a secondary density.
   - (c) Keep it as the default.

   *Recommend (b)*, with the table as default.
4. **"Listo para progresar".**
   - (a) A weekly review surface.
   - (b) A collapsed group on Hoy.
   - (c) Leave it as a lane.

   *Recommend (a).*
5. **"Actividad de hoy".**
   - (a) Its own feed (SPEC `/actividad`).
   - (b) A one-line summary on Hoy.
   - (c) As it is now.

   *Recommend (a) or (b).*
6. **Default snooze choices.** Is "1 día / 3 días / hasta nueva señal" right? *Recommend yes*, with "hasta nueva señal" as the default.
7. **Reply surface.**
   - (a) A drawer everywhere plus the Mensajes page.
   - (b) The Mensajes page only.

   *Recommend (a).*
