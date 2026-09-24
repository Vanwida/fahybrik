> Informe de área de la auditoría del panel del coach (23-sep-2026). Resumen y propuesta: [../index.html](../index.html). Las capturas citadas vivían en el scratchpad de la sesión de auditoría y no están en el repo; las clave están en [../img/](../img/). Entorno: Postgres local con 100 atletas sintéticos (ver apéndice del índice).

# D · Creating and assigning programs: audit

Screenshots: `scratchpad/shots/D/` (D01–D37) plus `shots/desk/`. Paths below are relative to `web/` unless they start with `shared/` or `docs/`.
Test data I created in the shared DB (labelled `AUDIT-D … (borrar)`): microcycle id 3, library block id 98, and a draft assignment of «Demo · Acumulación N3» to David Costa starting 28 Sep. I did not delete or change anything that already existed.

## 1. Verdict

**Rebuild the workflow from scratch. Keep the engine and the parts listed in §3.** The typed-prescription engine underneath is strong: the quickline grammar, the chip/stepper composer, the "El atleta ve" line and resync-on-save. The workflow on top of it is built for one coach editing one template and handing it to one athlete at a time. **The single biggest problem: the panel has no way to give a program to more than one athlete at once.** Assigning is a single-select modal (`AsignarAtletaModal.tsx:46`), and then each athlete's plan has to be opened and published separately. Hoy shows the result: "Asignación sugerida · 30" and "23 de 100 ven esta semana" (`shots/desk/02-hoy.full.png`). A working bulk engine with preview and rollback already exists on the server (`app/api/coach/mass-adjustments/*`), but no screen calls it. On top of that, several core actions are broken or dangerous today. Saving a new block lands on a 404. One click on "Descanso" wipes an authored day. Quickline lines can never be saved without a picker detour. Unsaved day edits disappear silently.

## 2. Screen-by-screen findings

### 2.1 The end-to-end job: "build a 4-week block for my N3 HYROX group and give it to 20 athletes starting Monday"

What I measured (scripted with Playwright on the live app):
- Creating the microcycle took 3 clicks plus typing, 12.5 s (D32).
- Getting one saveable exercise line took **5 clicks + 2 typed strings, 24.5 s scripted** (D34a→D34e): type the quickline line, open the line, click "Elegir ejercicio", search, pick, close the drawer, then "Guardar día".
- Assigning one athlete took 3 clicks to create the draft (D26→D26c), then "Abrir plan y publicar" plus "Publicar": **5 clicks and 2 page loads per athlete**.

Extrapolated to the job, assuming 5 training days × 6 lines, copying S1 to S2–S4, and hand edits for weekly progression:

| Step | Clicks | Surfaces |
|---|---|---|
| Create microcycle | 4 (and change the level, which silently defaults to N1) | Biblioteca → modal |
| Write week 1 | ~130, plus ~60 typed strings | Semana → Día → compositor drawer → exercise picker (nested modal) |
| Copy to S2–S4 | 3 | "Copiar a…" modal, which makes an identical copy with loads unchanged |
| Progress S2–S4 (loads, deload) | ~200 | Día → drawer, ×45 |
| Assign + publish to 20 athletes | ~160, plus 20 ficha page loads | Asignar modal → athlete ficha ×20 |
| **Total** | **≈500 clicks, 9 distinct surfaces, modals nested 2 deep** | |

With a spreadsheet the same job is about 15 minutes: type one week, copy the columns, fill down +2.5 %, share. **That job is not doable in this panel in under an hour.**

Dead ends I hit on this job:
- **P0 · There is no group.** "My N3 HYROX group" cannot be expressed. The closest mechanism is the level × days matrix, where N3 is split into 3/4/5/6-day variants and every variant needs its own chain (D14: "0/4 variantes con plan"). Recommendation: first-class Grupos plus a multi-recipient assign sheet (§4).
- **P0 · Assigning is one athlete at a time, and the assignment lands as a draft that must be published in a second place.** Evidence: `AsignarAtletaModal.tsx:46` and the success copy "Ábrelo en su plan y pulsa «Publicar microciclo»" (D26c). The button in the plan is labelled just "Publicar" (`PlanTab.tsx:497`), and it has no preview. The earlier spec (`docs/design/ux-redesign/SPEC.md §5`, "AssignFlow… Preview SIEMPRE… Publicar a [nombre]") was never built. Recommendation: one sheet that takes recipients (multi-select and groups), a start Monday, a preview, and a single confirm.
- **P0 · A bulk-operations backend exists with no UI.** `app/api/coach/mass-adjustments` (+ `/preview`, `/[id]/rollback`) supports scope by selection/filter/A-event and payloads strength-load %, running-volume %, exercise swap, insert/delete session, reschedule and note. Grep finds zero UI callers. Recommendation: surface it as "Ajustar a varios" from the athlete list and the group view.

### 2.2 Biblioteca (`/es/biblioteca`, five tabs)

The coach is trying to find or reuse content. What they get is a card grid of 97 blocks, three per row, 30 per batch, with "Ver 30 más" (`PagedGrid.tsx:25`). Every block in the seed is marked "sin tipar" (07-biblioteca-bloques).

- **P0 · The library cannot feed a day.** In "Desde la biblioteca", all 97 blocks say "Sin tipar: no se puede insertar" (D06). The design surfaces unusable content as primary content with no bulk path to fix it. Recommendation: default the filter to "Listos", show untyped blocks as a to-do queue, and offer "tipar con IA/gramática" in bulk.
- **P0 · The "Sesiones" rung is a dead end.** Library sessions can be created and edited, but no screen can place one into a microcycle day or an athlete's day. `/api/coach/templates` is only called by `SessionEditor`/`BlockLibraryEditor`, and `LibraryBlockRail` inserts blocks only. The teaching strip explains Ejercicio → Bloque → Sesión → Microciclo (`BibliotecaView.tsx:100-105`), but step 3 leads nowhere. Recommendation: make "Entreno" insertable (§4), or remove the tab.
- **P1 · Search is substring only, on one language.** "squat" returns 10 blocks and "sentadilla" returns 0 (D19; `BibliotecaView.tsx:178`). The exercise catalog is in English ("Band Pull Apart", "resistance_band · rear_delts") while the UI and quickline are in Spanish (D13). Recommendation: search over ES/EN names plus coach aliases, accent- and plural-insensitive.
- **P1 · At 500 blocks this breaks down.** It would take 17 "Ver más" clicks. There is no sort (recent, most used), no "used in N programs", no hover preview, no duplicate detection (imported titles repeat; the code itself notes "4 títulos entre 9 bloques", `LibraryBlockRail.tsx:19`), no tags beyond the fixed modality/objective/group rails, no bulk actions, and no Duplicate on block or session cards. The page also ships every block's prose to the client (≈200 KB at 97 blocks). Recommendation: a dense table view (§4).
- **P1 · The block editor hides the block's content.** Opening an imported block (D01-bloque-1) shows "0 sub-bloques · Sin sub-bloque seleccionado". The verbatim prose the coach needs to type from is not shown anywhere.
- **P0 · Saving a new block lands on "Esto no existe"** (D37b). After POST, the code runs `router.replace('/biblioteca/sesion/${newId}')` (`BlockLibraryEditor.tsx:186`), which passes a *block* id to the *session* route. The block is created, but the coach believes it failed. If a template with that id ever exists, the coach will silently land in a different entity.
- **P1 · The breadcrumb on every block page says "Biblioteca · sesiones"** and links to `?tab=sesiones` (`BlockLibraryEditor.tsx:205`).
- **P1 · A save error has no cause.** An empty block save turns the button into a red "Reintentar" with no reason (D27). The server requires ≥1 exercise (`shared/schema/blocks.ts:88`). This violates SPEC §6 ("nunca 'Error al guardar' seco").
- **P2 · Counts appear twice** ("1 de 1 sesiones" and "1 sesiones", 07c; `BibliotecaView.tsx:371` duplicates `PagedGrid`), and the plural is wrong.
- **P2 · Teaching chrome costs ~180 px on every visit:** the pipeline cue, the intro strip and the ContextHint all explain the same ladder. The copy also contradicts itself: "Lo que ordenas en Secuencias" (`BibliotecaView.tsx:104`) versus "…en Periodización" (:280).

### 2.3 Microcycle editor: Semana (`/es/microciclos/2`)

The coach is trying to lay out 4 weeks. What they get is one week at a time: week tabs, a Foco row, a weekstrip, and 7 columns of session cards (05-microciclo).

- **P0 · One click deletes authored work.** The "☾ Descanso" row sits *above* every training day's card, where it reads like a status label (05-microciclo, D30). A single click sends `putDay(kind:'rest', sessions:[])` (`SemanaBoard.tsx:373-378`) with no confirm and no undo. I reproduced it on my test microcycle: D34f shows the session, D34g shows it gone, and no dialog appeared. The day PUT then resyncs to every athlete on that microcycle (`program-weeks/[id]/day/route.ts:91`), so their scheduled sessions are pruned too. This directly breaks DECISIONS 2026-08-11 ("no volver a poner un botón de un toque que sustituya contenido autorado sin confirmación"). Recommendation: make rest a day-state change behind a menu, with a 5 s undo toast.
- **P1 · There is no 4-week view you can actually read.** "Vista general" shows modality names plus "1 bl" per cell, with no titles, doses or volumes (D02). The coach cannot compare S1 to S4 without clicking into 28 days.
- **P1 · No drag and drop between days or weeks.** dnd-kit is only used to reorder blocks inside one session (`SessionPartCard.tsx:196`). This is old friction F13, still present.
- **P1 · No undo/redo anywhere (old F11).** An undo hook was built (`lib/dashboard/programming/use-slots-history.ts`, "Historial undo/redo… (F11)") and is imported by zero files. Other orphans sit in the same folder: `day-composition`, `part-factory`, `block-panel`, `part-summary` and `template-session`, each with 0 importers.
- **P1 · Copy only works inside one microcycle.** "Copiar a…", "Copiar otro día aquí" and "Duplicar semana" all stay within the same microcycle (`CopyIntoDayModal.tsx:3-5`). There is no clipboard across programs or into an athlete's plan, and no copy "with progression".
- **P1 · The level silently defaults to N1.** `NuevoMicrocicloModal.tsx:92` preselects the first level. The demo's "Demo · Acumulación N3" is tagged N1 (07d), and so is my test microcycle (D32). DECISIONS 2026-08-23 made level optional, so the default should be "Sin nivel".
- **P2 · "Importar del Excel" actually opens four modes** (Excel, texto, foto, IA; D05/D36). "Pegar texto" accepts one day at a time, but coaches paste weeks. The week selector reads "Semana 1 · Semana 1".

### 2.4 Microcycle editor: Día (`?dia=N`) and compositor drawer

The coach is trying to write a session fast. What they get: a day rail, a header with Guardar, the quickline, session cards, and a composer drawer at 680 px (05b, D10, D34a2).

- **P0 · Quickline lines are never linked to an exercise.** `quickline-block.ts:49` hard-codes `exercise_id: null`. Every line lands as "Línea sin ejercicio" and blocks saving: "2 líneas sin ejercicio… para guardar" (D33a). That includes the placeholder's own examples ("press banca 4x4 @78-80% r90", "45' carrera z2"). The contract asked for exercise resolution (`contrato-rediseno-editor-microciclos.md` §2), and it was never built. Recommendation: resolve inline with fuzzy match and aliases, show the top candidate in the "Entendido" chip, press Enter to accept, and learn the alias.
- **P0 · Unsaved edits are lost silently.** The day editor saves manually (an amber dot marks unsaved changes). Switching days from the rail remounts the editor and drops the edits with no prompt. I typed a note, went Lun → Mar → Lun, and the textarea was empty with no dialog (D11a–c; `DayEditor.tsx:109` uses `dirty` only for the dot). Recommendation: autosave, like the name and focus fields already do.
- **P1 · Seven ways to add content** (old F4 said 3, and it has got worse). They are the quickline, "+ Bloque" (12 archetypes, D10), "Desde la biblioteca", "Redactar" (AI), "añadir componente/ejercicio/tramo/movimiento" (4 verbs, `BlockItemTable.tsx:22-25`), "Copiar otro día aquí", and Import (4 tabs).
- **P1 · Exercise picking is a modal on top of a drawer**, and the picker shows raw slugs ("resistance_band · rear_delts, upper_back", D13), while the Ejercicios tab shows Spanish.
- **P1 · One block gets three classifications.** After I picked Cossack Squat, the same block read "FUERZA" (chip), "Circuito · la pone el ejercicio" (drawer) and "CALENTAMIENTO" (week card) (D34d, D34f).
- **P1 · The AI modal hard-codes a second level system**, "Inic./Inter./Pro/Élite" (`SuggestWorkoutModal.tsx:36-40`, D07), next to the coach's own N1–N5. It also claims "auto del atleta" on a template that has no athlete. On the plus side, the proposal can be reviewed and pruned before inserting, which fixes old F8.
- **P2 · The composer is tall.** One strength exercise takes ≈1,300 px (D28). The sticky "El atleta ve" bar covers the "Descanso entre series" label, and a new block shows a red error banner before the coach has touched it.
- **P2 · The quickline grammar is inconsistent.** `r1'` works for runs, but "sentadilla 5x5 @75% r2'" is "no lo pillo entero" (D12c).

### 2.5 Periodización (`/es/periodizacion`)

The coach is trying to set the order of blocks for a population. What they get: a levels list, then 3/4/5/6-day variant cards, then a chain editor (06, D14, D15).

- **P1 · Too much upfront work before anything happens.** 5 levels × 4 day-variants = 20 chains to build before "Asignación sugerida" can offer a one-click assignment. Today 30 cards say "no hay secuencia… Crear receta" (02-hoy).
- **P1 · Jargon.** Nivel, variante, celda, receta, secuencia, cadena and "Montar" all describe one idea: *which programs this group does, in order*.
- **P0 (multi-coach) · Method is hard-coded.** `methodology_groups` is a global table with no `coach_id` (`lib/dashboard/coach/methodology-groups.ts:19-21`), and the schema caps it at `max(10)` (`shared/schema/blocks.ts:83`). The ten groups ("Fuerza Base", "Tapering / Activación Pre-carrera"…, D06) belong to one coach's method and are imposed on every coach. The same applies to `days_per_week min(3).max(6)` (`blocks.ts:86`, `secuencias/days.ts:6`), the Excel "Plantilla_HYROX" with variants "Foco fuerza/resistencia" (`ImportSourceForm.tsx:31-32, 274`), and the AI levels. All of these break HARD RULE Nº0.

### 2.6 Assigning from the athlete (`/es/atletas/11?tab=plan`) and from Hoy

- **P1 · The athlete ficha cannot assign a library program.** "Añadir microciclo" only asks for a name and a number of weeks, and creates an *empty* personal tramo (D23). "Planes personales · Nuevo" does the same (D24). Only Hoy's "Reponer bloque" (D26) or Biblioteca can attach a library program.
- **P0 · "Editar día" contradicts the board.** On today (Wed 23), the board shows "Umbral 5×1 km + Wall balls · sin hacer". "Editar día" goes to `/atletas/11/dia/2026-09-23`, which says "Sin entreno este día" (04b vs D22).
- **P1 · "Bloque" means four things.** It is a library piece, a part of a session, a sub-piece inside a block ("añadir bloque" inside the block editor), and a *microcycle*: Hoy's "Todavía no tiene ningún bloque" / "Reponer bloque" opens a microcycle picker (D26b), and the chip reads "Bloque terminado".
- **P2 · The date field accepts any day**, but the server silently moves it back to that week's Monday (`instantiate-program.ts:142`). Picking a Thursday therefore starts the plan in the past.

### 2.7 Seeing a plan at a glance

- **P1 · No 12-week macro anywhere.** The pieces available are: the athlete "Cadena de microciclos" (one card, "S1-S4 · Estás aquí, semana 3"), week pills (Visible/Borrador), and a 4-week grid of modality names. There is no timeline across programs, no planned volume or intensity per week, no deload marking, and no races on the coach's plan. The DECISIONS 2026-08-12 ban on "barra de carga… prevista" was written for the *athlete's* ciclo screen. For the coach, planned volume comes straight from the typed prescription (minutes, km, sets per modality). It is a fact about the recipe, not a prediction. TrainingPeaks' ATP (weekly hours/TSS bars, periods, A/B/C races) is the benchmark here.
- **P2 · The plan can differ from its template with no warning.** Marc's plan is labelled «Demo · Acumulación N3», yet every day shows "Umbral 5×1 km + Wall balls" while the template has five different sessions (04b vs 05). This may be a seed artifact, but the UI has no "diverges from template" signal either way.

### 2.8 Against the benchmarks

| Capability | TrainingPeaks | TrueCoach / TrainHeroic | Spreadsheet | FAHYBRID |
|---|---|---|---|---|
| See 4–12 weeks at once | calendar + ATP | program calendar | yes | 1 week (the grid shows modality only) |
| Drag/copy/paste days and weeks | yes (keyboard too) | yes | yes | copy inside one microcycle, no drag between days |
| Fast text entry | structured builder | free text + exercise autocomplete | yes | quickline, but it never links exercises (P0) |
| Progress across weeks | manual/ATP | manual | fill-down | manual, one drawer at a time |
| Undo | yes | — | yes | none |
| Deliver to many | apply plan per athlete | multi-client assign / team calendar | share one file | one athlete per modal, then publish per athlete |
| Athlete preview | workout graph | client view | — | "El atleta ve" line (good), no full-day preview |

## 3. What to keep

- **The typed prescription engine and quickline grammar.** "press banca 4x4 @78-80% r90" parses to "4×4 @ 78-80% RM · descanso 90''", "8x400m r1' z4" to "8×400m @ Z4 · descanso 1'" (D12b). The "no lo pillo entero · entra para revisar" honesty contract is the right behaviour.
- **The compositor controls:** RIR/rest chips, the %RM TickBand with two-tap range, and Series iguales / Variar por serie. These are the right primitives. Keep them, but inline and denser.
- **"El atleta ve «…»"** as a live athlete-facing sentence (D28). It is the seed of a real preview.
- **Resync-on-save** to athletes' still-scheduled sessions (DECISIONS 2026-08-07). This is the correct TrainingPeaks/TrueCoach behaviour.
- **The AI proposal flow** with source labels (biblioteca / IA / respaldo) and pruning before insert.
- **Honest readiness markers** on blocks (sin tipar / sin dosis with the count of lines).
- **Copy modals** ("La siguiente / Todas las siguientes / Todas", D04) and Duplicar semana/microciclo.
- **The chain espina** as the one component that draws a path (it is reused on the athlete's phone).

## 4. Target design

**Minimal visible vocabulary: 7 words.** *Ejercicio* (a movement) → *Bloque* (a lettered part of an entreno, A/B/C) → *Entreno* (what an athlete does in one slot of a day) → *Semana* → *Programa* (N weeks with a name the athlete sees) → *Plan* (an athlete's or group's dated chain of Programas, including races) → *Grupo* (a saved set of athletes).
Removed from the UI: sub-bloque, pieza, componente, línea, tipar, dosis común, variante, celda, receta, secuencia, cadena, tramo (plan sense), plantilla (for programs), microciclo, fase-as-a-word, grupo metodológico (becomes coach tags), and the second level system. "Nivel" survives only as one filter/tag whose label the coach can edit (DECISIONS 2026-08-23 already asks for this).

**Navigation:** one **Programar** destination that replaces Biblioteca (programming tabs) and Periodización, with three views: *Programas*, *Biblioteca*, *Grupos*. Comunicados moves to Mensajes.

### 4.1 Program editor: all weeks, spreadsheet-dense

```
Programa «Acumulación HYROX» · 4 sem · tags: N3, HYROX        [Vista atleta] [Asignar ▸]
┌ Biblioteca ───────┐ ┌──────┬────────────┬────────────┬─────┬────────────┬────────────┬──────┐
│ ⌕ buscar (es/en)  │ │ Sem  │ Lun        │ Mar        │ Mié │ Jue        │ Vie        │ S/D  │
│ [Listos▾][Tags▾]  │ │ S1   │ A Sentadilla│ Z2 45'     │  —  │ 5×1km umb  │ WOD est.   │ Desc │
│ ▸ Sentadilla 5×5  │ │ Base │ B Remo 3×8 │ Movilidad  │     │ Wall balls │ HYROX 40'  │      │
│ ▸ 5×1 km umbral   │ │ 5h10 ▇▇▇▅ fza 12s · run 28km · erg 30'                               │
│ ▸ Entreno «Sim 1» │ │ S2   │ …+2.5%     │ Z2 50'     │  —  │ 6×1km umb  │ …          │      │
│  (drag → celda)   │ │ S4 ↓ │ deload …                                                        │
└───────────────────┘ └────────────────────────────────────────────────────────────────────────┘
 Celda seleccionada → panel derecho: bloques A/B/C, cada línea editable inline (quickline + chips)
```

- All weeks visible, one row each (4–12). Every cell shows the entreno title plus its lines in mono. Each week row has a derived footer: planned hours, sets and km per modality.
- **Keyboard:** arrow keys move between cells. Enter edits a cell with the quickline, and exercises are resolved inline. ⌘C/⌘V works on a cell, a week row or a range. ⌘D duplicates, ⌘Z/⇧⌘Z undo and redo (wire `use-slots-history`). Del clears a cell, with an undo toast.
- **Drag** from the library into a cell, or from cell to cell (Alt = copy).
- **"Progresar selección":** select a range, then apply "+2.5 %/sem", "+1 serie" or "−30 % deload". This works on the typed prescription (it is mechanism). The step values are coach defaults (method).
- **Autosave per cell** with a "Guardado" tick. There is no Guardar button and no lost edits.
- **Vista atleta:** a phone-frame preview of any day, built from the existing `prescriptionToText`.

### 4.2 Assign sheet: one component, called from everywhere

```
Asignar «Acumulación HYROX»
Para:  [Grupo N3 HYROX Valencia ×] [+ Aina Roig ×]  (+ filtros: sin plan · termina esta semana)
       22 atletas · 2 ya tienen plan que se solapa → [Encadenar detrás] [Sustituir] [Saltar]
Empieza: lun 28 sep ▾ (solo lunes)   Entra en: Semana 1 ▾
Entrega: ( ) Todo visible  (•) Semana a semana (sábados)  ( ) Borrador
Vista previa: 22 × 4 sem · 18 entrenos cada uno · 28 sep – 25 oct        [Publicar a 22]
```

Invoked from the program editor, from Hoy (with the suggested athletes preselected), from the athlete list after a multi-select, and from a group. After confirming: a toast with **Deshacer** that calls the existing mass-adjustments rollback.

### 4.3 Grupos and Plan

A Grupo can be manual membership, or a saved filter (level, days/week, target race). A group has a **Plan**: the dated chain of Programas, plus policies such as repeat or progress. This is today's sequence, re-homed to where coaches already think. The level × days matrix becomes an optional auto-membership rule, not the entry point.

```
Grupo N3 HYROX · 22 atletas                                   [Asignar a nuevos (3)]
Sep ───────── Oct ───────── Nov ───────── Dic ───── ⚑ HYROX Valencia 14-dic
[ Acumulación 4s ][ Build 4s ][ ↓1s ][ Pico 3s ][Taper 2s]
 h/sem ▅▆▇▃ ▆▇▇▃ ▂ ▇▇▆ ▄▂        (derivado de la prescripción, no previsión)
 run   ▃▄▅▂ ▅▆▆▂ ▁ ▆▆▅ ▃▁   fza ▆▆▅▃ ▄▄▃▂ ▁ ▂▂▂ ▁▁
```

### 4.4 Library at scale: a table, not cards

Rows are 36 px: Name · Tipo · Tags · Duración · Usado en N · Editado · Estado. Hovering shows the typed lines. Saved filters. "Posibles duplicados" groups rows by normalized title plus content. Bulk actions: tag, archive, "tipar pendientes". The default filter is Listos, and untyped rows are a count badge that opens a fix queue with the verbatim prose shown next to the editor.

## 5. Objective vs subjective

**Objectively right (just do them):**
1. Fix the block-save redirect (`BlockLibraryEditor.tsx:186`) and the breadcrumb (:205). Show the cause on save errors.
2. One-click "Descanso" must not destroy content: use a menu plus an undo toast (DECISIONS 2026-08-11).
3. Autosave, or at least an unsaved-changes guard, in the day editor.
4. The quickline must resolve exercises (fuzzy match, ES/EN, aliases). The placeholder examples must produce saveable lines.
5. Multi-recipient assignment with preview and one confirm. Wire the mass-adjustments API with rollback. This is required for the 100-client goal.
6. HARD RULE Nº0: methodology groups become per-coach data (drop `max(10)`), the AI modal uses the coach's own levels, the Excel template/variants and days 3–6 stop being constants, and the default level is "Sin nivel".
7. Wire or delete the orphans: library Sesiones (make them insertable), `use-slots-history`, and the dead `programming/*` files.
8. The athlete "Editar día" must match the board. Offer "Añadir programa de la biblioteca" from the ficha.
9. Monday-only date picker. Search across languages. Remove the duplicate counters. Show the untyped block's prose inside its editor.
10. Planned per-week volume on the *coach's* views. It is derived from the prescription, not predicted, and reconciles with DECISIONS 2026-08-12 (which is about the athlete screen).
11. "Microciclo" for a 4-week unit contradicts standard periodization terminology (microcycle ≈ 1 week, mesocycle = 2–6 weeks). Coaches buying FLEXR will read it wrong.

**Taste/priority calls for Alex:**
1. *What to call the multi-week unit?* (a) keep "Microciclo", (b) "Programa", (c) "Mesociclo". **Recommend (b):** neutral, and what TrueCoach uses. Possibly make it a coach-editable label.
2. *How do athletes get grouped?* (a) keep level × days as the only axis, (b) explicit Grupos only, (c) Grupos first, with level × days as an optional auto-membership rule. **Recommend (c).** This reopens the 2026-08-23 "matriz" decision, on purpose.
3. *Default delivery?* (a) draft then publish (today), (b) visible immediately after the preview, (c) released week by week (the sequence path's Saturday cron). **Recommend** choosing it in the assign sheet, with the default as a coach setting.
4. *Editor default?* (a) week tabs (today), (b) all-weeks grid. **Recommend (b)**, keeping the week zoom as a secondary view.
5. *Library unit?* (a) blocks and sessions as separate tabs, (b) one "Entrenos" library with Bloques as saved snippets. **Recommend (b)**, which is what SPEC §3 already said ("todo entreno reutilizable es una Sesión").
6. *Periodización as its own nav item?* (a) keep, (b) merge into Programar → Grupos. **Recommend (b).**
7. *Teaching chrome* (pipeline cue, intro strip, context hint): (a) keep, (b) one dismissible "¿Cómo funciona?" link. **Recommend (b).** Once the vocabulary is 7 words, the ladder no longer needs explaining.
