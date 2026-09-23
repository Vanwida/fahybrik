# Coach panel rebuild — build plan and contracts

Approved by Alex on 2026-09-23 ("plan approved 100%, every decision you recommended").
Source of truth for WHAT: `docs/auditoria-panel-coach/index.html` (proposal + mockups) and the five
area reports in `docs/auditoria-panel-coach/informes/`. Decisions: `docs/DECISIONS.md`
2026-09-23 «El panel del coach se rehace alrededor del día del entrenador».
This file is the HOW: rules, contracts and ownership for every agent. Read it fully before touching code.

The product will be sold as **FLEXR** to many coaches; FAHYBRID is the first tenant. Everything is
tenant-neutral: no club name, coach name, domain or method baked into code or copy (CLAUDE.md HARD RULE Nº0).

---

## 0 · Working rules (every agent, no exceptions)

- **Shared working tree** `/home/user/fahybrik`, branch `claude/focused-bardeen-u9zz33`. Other agents
  are editing other files at the same time. You own ONLY the paths listed for you in §7. If you need a
  change in a file you don't own, write it in your final report instead of editing it.
- **Commit only your own paths, with a pathspec commit** (the index is shared; a plain `git commit`
  can sweep up another agent's staged files):
  `git add <your paths> && git commit --author="Vanwida <vanwida@aistudios.pro>" -m "<msg>" -- <your paths>` (the repo config sets the committer to Claude <noreply@anthropic.com>; do NOT override it with `-c user.*`)
  If you hit `index.lock`, wait a few seconds and retry. **Never** `git add -A`, `git add .`,
  `git stash`, `git reset`, `git checkout -- <others>`, rebase, or push. The lead pushes.
  Commit messages in Spanish, small and honest, ending with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01YSHJ8nY4yqxBxy5ckpMvFx`.
- **Typecheck** (never `pnpm typecheck`: it reads `.next/dev/types`, which the dev server rewrites):
  `cd web && npx tsc --noEmit -p tsconfig.check.json 2>&1 | grep -E "<your path prefixes>"`.
  Baseline has 12 pre-existing errors, all in `tests/e2e/*` — ignore those. Errors in files you don't
  own are another agent's work in progress: don't touch them. Your files must have zero errors.
- **Lint:** `cd web && npx eslint <your files>`.
- **Tests:** vitest. Pure unit tests: `cd web && npx vitest run <files>`. Real-DB tests (`*.db.test.ts`,
  see `tests/utils/test-db.ts`, `tests/utils/db-fixtures.ts`):
  `cd web && env -u DATABASE_URL TEST_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/fahybrik_test' npx vitest run <files>`.
  CLAUDE.md: don't mock the database in tests. Test-first where it makes sense.
- **Migrations:** new files in `infra/migrations/` with YOUR number range (§7). Idempotent SQL
  (`if not exists`, guards). After writing one, apply it to BOTH local DBs and journal it:
  `PGPASSWORD=postgres psql -h localhost -U postgres <db> -v ON_ERROR_STOP=1 -1 -f infra/migrations/<file>`
  then `insert into schema_migrations(version) values ('<stem>') on conflict do nothing` — for
  `<db>` = `fahybrik` and `fahybrik_test`. Explicit columns, no JSON blobs (CLAUDE.md). Defaults that
  are METHOD live in `shared/domain/...` as data defaults, never as column `default` (DECISIONS 2026-08-09).
- **Live app:** a dev server is already running at `http://localhost:3456` (dev login bypass, local
  Postgres with 100 synthetic athletes; athlete "Marc Vidal" = id 11; program/microcycle id 2).
  Do NOT start/stop/restart it. If you need an env var or a restart, say so in your report.
  Screenshots: `node /tmp/claude-0/-home-user-fahybrik/d560c94d-b33b-5991-a178-470c23d93c03/scratchpad/capture.mjs <outDir> <desk|mob|dark> "/es/route|name" ...`
  (write interaction scripts modelled on it). **Look at your own UI** with the Read tool before you
  call it done — at 1440×900 desktop, 390 px mobile, and dark AND light.
- **Language:** all UI copy in Spanish (Spain), human, no jargon (see §2). Code comments in the
  surrounding style. No `console.log`. Files under ~500 lines. Zod on every mutation. snake_case in
  API payloads.
- **Delete what you replace.** A screen rebuilt means the old components it used are deleted if nothing
  else imports them (grep first). No dead code left behind.
- **Final report** (your last message): what you built, file list, tests added and their result,
  screenshots you checked, anything you could not do, and any change you need in files you don't own.

---

## 1 · Approved decisions (summary)

1. Home = **Hoy**, one inbox that trends to zero (one row per athlete, worst first; resolve / snooze /
   done; keyboard). Login lands on `/hoy`.
2. **Dark by default**, light as toggle (same button). Neutral chrome; club colour is tenant data.
3. **«Programa»** replaces «Microciclo» everywhere in the coach UI.
4. **Grupos first**: a group is a set of athletes with its plan (ordered chain of programas). Built on
   `program_sequences` (gains a name; `level_id`/`days_per_week` become optional; the level×days cell
   is an optional auto-membership rule).
5. Athlete page = **cockpit** (why flagged + state + editable 3-week calendar + «Hacer ahora») with two
   more tabs: **Rendimiento**, **Perfil**.
6. **Publish per week, automatically N days before it starts** (N = coach setting with default); the
   coach can hold a week back.
7. **Negocio** (Leads, Cobros, Embudo) only for coaches with the add-on (`coach_entitlements`).

Defaults: cool-neutral light canvas with white cards; one family (Figtree), big tabular numbers as the
display voice; 6 px rectangular buttons, pills only for filter chips; sidebar with 5 destinations +
Ajustes, collapsible; club colour only on primary button, focus ring, logo; Atletas defaults to table;
comunicados are an action, not a tab; load uses CTL/ATL/TSB with a plain-Spanish gloss; phone = triage;
snooze 1 d / 3 d / hasta nueva señal (default); «Listo para progresar» leaves the daily inbox (weekly
review); «Leads» stays in English.

---

## 2 · Vocabulary (coach UI copy)

| Say | Never say (in UI) |
|---|---|
| **Programa** (N weeks with a name the athlete sees) | microciclo, mesociclo, bloque (in that sense), plantilla (for programs) |
| **Entreno** (what an athlete does in one slot of a day) | sesión de biblioteca, plantilla de sesión |
| **Bloque** (lettered part of an entreno: A, B, C) | sub-bloque, pieza, componente |
| **Ejercicio** (a movement) | — |
| **Semana** | S1–S4 without context |
| **Plan** (an athlete's or group's dated chain of programas and races) | cadena, tramo, receta, secuencia |
| **Grupo** (a saved set of athletes with a plan) | celda, variante, nivel × días (the matrix is an optional rule inside a group) |
| **Nivel** only as the coach's own axis label (may be renamed by the coach) | N1–N5 hard-coded |
| **Visible / Oculta al atleta** (week visibility, one pair everywhere) | No lo ve, Borrador (as visibility), publicado a medias |
| **Alta pendiente** (intake review) · **Convertir en atleta** (lead) · **Cuestionario de entrada** | alta (for three things), intake |
| **Adherencia (N días)** — always with its window | cumplimiento, % sin ventana |
| **Por responder** (last message is from the athlete, unanswered) | espera respuesta (as "unread") |
| Readiness shown as **0–100 with no %**, always with date and baseline | Readiness 52%, Fatiga CNS |
| Dates: `22 sept`, countdowns `24 d · 17 oct` | ISO dates, mixed formats |

Missing lines/values are honest: "sin datos", "todavía no lo sabemos" — never a fake 0.

---

## 3 · Design system contract (built in wave 1 by DS; everyone else consumes)

**Tokens** keep their existing names (`--v2-*` in `web/app/[locale]/(v2)/v2-theme.css`) so untouched
screens keep working; values change. Dark is the default theme.

| Token | Light | Dark |
|---|---|---|
| `--v2-bg` | `#F4F4F2` | `#0B0B0C` |
| `--v2-surface` | `#FFFFFF` | `#161618` |
| `--v2-surface-2` | `#ECECEA` | `#1E1E21` |
| `--v2-elevated` | `#F8F8F6` | `#1B1B1E` |
| `--v2-border` | `#DCDCD7` | `#2C2C30` |
| `--v2-border-strong` | `#C9C9C3` | `#3A3A40` |
| `--v2-fg` | `#141413` | `#F2F2F2` |
| `--v2-muted` | `#52524D` | `#A6A6A6` |
| `--v2-faint` (min for text) | `#67675F` | `#8C8C8C` |
| `--v2-ok` | `#1D7447` | `#3CCF85` |
| `--v2-warn` | `#8F5400` | `#F0A43A` |
| `--v2-danger` | `#BF3128` | `#FF5D55` (dark danger buttons take DARK text) |
| `--v2-info` | `#2C5F9E` | `#5AA7F5` |
| accent default | ink `#141413` | `#F2F2F2` — club skin overrides; **3 jobs only**: primary button, focus ring, logo |

`-soft` variants stay (10–14 % alpha). Modality palette (`--v2-mod-*`) and zone ramp (`--v2-z1..z6`)
must NOT reuse status hues: fuerza `#4A3AA7`, ergo `#1BAF7A`, carrera `#2A78D6`, circuito `#E87BA4`,
calentamiento neutral grey (light); dark steps validated with the dataviz skill's validator. Zones =
single-hue sequential ramp.

**Type scale** (Figtree only in the panel; utility classes in v2-theme.css or globals):
`t-label` 11/14 600 caps +0.06em (table headers, section eyebrows ONLY) · `t-meta` 12/16 500 ·
`t-body-sm` 13/18 400 · `t-body` 14/20 400 · `t-title-sm` 16/22 600 · `t-title` 20/26 600 (page
titles) · `t-num-l` 28/32 600 tnum · `t-num-xl` 40/44 600 tnum (max one per screen). Nothing under
12 px except `t-label`. Weights 400/500/600 (700 only for display numbers).

**Spacing** 4/8/12/16/24/32/48. **Rows** 40 px (tables at 100 athletes), 48 comfortable, 56 touch.
**Controls** 28 (inline in rows) / 32 (toolbars) / 40 (forms, primary). Mobile hit area ≥ 44 px.
**Radii** 6 (controls, chips, inputs) / 10 (cards, panels, dialogs) / full (avatars, dots).
**Elevation**: flat cards (1 px border); one shadow for popovers/dialogs. No card inside a card.

**Primitives** — `web/components/v2/ui/` with a barrel `index.ts`; Base UI + cva (installed):
Button (primary | secondary | ghost | destructive × sm 28 | md 32 | lg 40, `loading`), IconButton
(tooltip required), Input, Textarea, Select, Combobox, Checkbox, Switch, Tabs (one level per page,
arrow keys), SegmentedControl (arrow keys), FilterChip (the only pill), StatusBadge (icon + label +
tone from the status enum; a dot never appears alone), Tag (neutral metadata), Avatar, Card,
SectionHeader, PageHeader (title · count · subtitle · actions — ONE pattern for every page), ListRow,
DataTable (real `<table>`, sticky header, `aria-sort`, row select with shift-range, keyboard j/k/x,
optional virtualization), BulkBar, KPI, Sparkline, Meter, Dialog, Sheet (side panel, non-modal
option), Menu, Popover, Tooltip, Toast + `useToast()` with Undo, Kbd, EmptyState (inline one-line
variant + page variant), Skeleton, ErrorState. Icons: `MIcon` keeps its API but renders **Lucide**
SVG (name map); the 3.9 MB Material Symbols font is no longer loaded by panel pages.

**Status tones → colour**: danger = overdue/failed and act now · warn = watch · ok = done/healthy ·
info = neutral information (unanswered message, intake) · neutral. Red never colours a headline count,
a new client or decoration. Warn/danger are never decorative borders.

---

## 4 · Data contracts (built in wave 1; consumed by screens)

Names are binding; internals are the owner's call. All loaders take `coach_id` and are tenant-scoped.

### 4.1 Athlete state — `shared/domain/coach/athlete-state.ts` + `web/lib/coach/athlete-state.ts` (SIG)

```ts
export type StatusTone = 'danger' | 'warn' | 'ok' | 'info' | 'neutral';
export type AthleteStatusKey = 'accion' | 'vigilar' | 'nuevo' | 'sin_plan' | 'al_dia' | 'pausado';
export type SignalAction =
  | 'responder' | 'proponer_descarga' | 'publicar_semana' | 'asignar_programa'
  | 'revisar_alta' | 'recordar_pago' | 'mensaje' | 'ver_semana' | 'abrir_ficha';
export interface AthleteSignal {
  kind: SignalKind; severity: 'critical' | 'warning' | 'info';
  label: string;          // «Readiness 31», «2 de 4 debidas sin hacer», «Pago vencido»
  evidence: string;       // «−24 vs su base · 3 días seguidos» — value, baseline, window, date
  value: number | null; baseline: number | null;
  window_label: string | null; observed_at: string | null;   // ISO
  action: SignalAction;
}
export interface AthleteStatus {
  key: AthleteStatusKey; tone: StatusTone; label: string; reason: string | null;
  signals: AthleteSignal[];            // worst first
  snoozed_until: string | null;
}
```
One status model for Hoy, Atletas, Mensajes and the athlete page. Source = `coach_attention_items` +
`coach_alert_overrides` (existing engine), plus lifecycle (paused), intake and plan state.

### 4.2 Adherence — `shared/domain/coach/adherence.ts` (SIG)
`computeAdherence(sessions: {scheduled_for: string; status: AssignmentStatus}[], as_of: string, window_days: number)`
→ `{ pct: number | null; due: number; done: number; window_days: number }`. **Due-only**: a session is
due if `scheduled_for < as_of`, or `= as_of` and already done. Done = `completed` or `partial`. Future
sessions never count. `pct = null` when `due = 0`. Batched SQL loader for N athletes (one query).
Every surface uses it (roster, Hoy, ficha, plan). The window is always shown ("Adh. 14 d").

### 4.3 Hoy — `web/lib/dashboard/hoy/load-hoy.ts` (SIG)
```ts
export interface HoyView {
  generated_at: string;
  counts: { needs_you: number; critico: number; vigilar: number; resolved_today: number; snoozed: number };
  week_visibility: { visible: number; total: number };
  systemic: SystemicGroup[];   // shared-cause rows first
  critico: HoyRow[];           // all of them
  vigilar: HoyRow[];           // all of them (UI collapses after 10, expandable)
}
export interface SystemicGroup {
  kind: 'week_hidden' | 'no_program' | 'intake_pending' | 'payments_overdue' | 'leads_new' | 'calls_today';
  count: number; title: string; detail: string; athlete_ids: string[];
}
export interface HoyRow {
  athlete_id: string; name: string; avatar_url: string | null; level_label: string | null;
  primary: AthleteSignal; other_count: number; age_label: string; snoozable: boolean;
}
```
One athlete appears once (worst signal primary). Signals owned by a systemic group don't also appear as
rows. Snooze/done/undo: existing `coach_alert_overrides` via `/api/coach/inbox/snooze` and `/bulk`
(extend if needed: `until: '1d' | '3d' | 'signal'`, `action: 'done' | 'undo'`).
Engine changes (mechanism; thresholds = coach data in `coach_signal_thresholds` with defaults in
`shared/domain/coach/signal-thresholds.ts`): readiness uses the athlete's own 28-day baseline, needs
persistence (N days) and recency (observed ≤ M days ago); `checkin_skipped` only for athletes with a
check-in habit; `missed_sessions` counts due scheduled sessions in 7 d; «Listo para progresar» is not a
daily signal. Fix: `recomputeCoach` calls `updateTag` from a Route Handler → use `revalidateTag` there
(cron currently errors on every run).

### 4.4 Roster — `web/lib/dashboard/athletes/roster.ts` (SIG)
```ts
export interface RosterRow {
  athlete_id: string; name: string; avatar_url: string | null; email: string | null;
  level: { id: string; label: string } | null; group: { id: string; name: string } | null;
  lifecycle: 'activo' | 'pausado' | 'baja' | 'nuevo';
  status: AthleteStatus;                 // 4.1
  week_visibility: 'visible' | 'oculta' | 'sin_plan' | 'terminado';
  readiness: { value: number; baseline: number | null; trend_14d: (number | null)[]; observed_at: string } | null;
  adherence_14d: { pct: number | null; due: number; done: number } | null;
  last_session_at: string | null;
  next_session: { date: string; title: string } | null;
  race: { name: string; date: string; days: number } | null;
  program: { id: string; name: string; week: number; weeks: number } | null;
  unread: number; awaiting_reply: boolean;
}
export async function loadRoster(params: { coach_id: bigint | number }): Promise<RosterRow[]>;
```
**Set-based**: a constant number of queries regardless of athlete count (replace the per-athlete
`loadProgrammingStatusMap` loop and the per-athlete sequence resolution). Budget: ≤ 12 queries,
< 300 ms on local Postgres at 100 athletes.

### 4.5 Groups — (DOM)
Migration: `program_sequences` gains `name text` (nullable; display fallback «Nivel N3 · 5 días»),
`level_id` and `days_per_week` become NULLABLE, uniqueness (coach, level, days) only when both set
(partial unique index). Members = athletes with an active `athlete_sequence_progress` row.
`web/lib/coach/groups.ts`: `listGroups`, `getGroup` (members + ordered programas + each member's
current position), `createGroup`, `renameGroup`, `deleteGroup`, `setGroupPrograms` (ordered),
`addMembers`/`removeMembers` (enroll/unenroll via the existing assign-sequence path). API
`/api/coach/groups` (GET, POST), `/api/coach/groups/[id]` (GET, PATCH, DELETE),
`/api/coach/groups/[id]/members` (POST `{athlete_ids, action: 'add' | 'remove'}`).

### 4.6 Assign to many — (DOM)
`POST /api/coach/assign` body
`{ program_id, athlete_ids?: string[], group_ids?: string[], start_date /* Monday */, start_week?: number, delivery: 'auto' | 'visible' | 'draft', on_conflict: 'chain' | 'replace' | 'skip', dry_run?: boolean }`
→ `{ preview: { athletes: { id, name, conflict: null | { program_name, end_date } }[], weeks, sessions_per_athlete, start_date, end_date }, applied?: { batch_id, assigned, skipped } }`.
`POST /api/coach/assign/[batch_id]/undo` removes that batch's month assignments and their not-yet-done
sessions. Uses the existing `assignMonthToAthlete` per athlete (one transaction per athlete, all
recorded in a batch table). `delivery: 'auto'` = weeks become visible N days before start (4.7).
Idempotent against double submit.

### 4.7 Week publishing — (DOM)
Coach setting `coaches.auto_publish_days_before` (nullable → default from shared domain, e.g. 2).
A week can be held (`weekly_plans` hold flag). Daily cron (replace the Saturday-only
`publish-weekly-plans` schedule) publishes draft weeks whose start is within N days unless held.
APIs: `POST /api/coach/athletes/[id]/weeks/[week_start]/publish` and `/hold` (toggle), bulk
`POST /api/coach/weeks/publish { athlete_ids, week_start }`. Reconcile with the existing
`publish-week.ts`, `publish-microciclo.ts`, `plan-week-horizon.ts` and DECISIONS 2026-08-18 (one
visibility gate `athleteSeesItFromWeeklyStatus`); remove what becomes dead.

### 4.8 Saved views & bulk athlete ops — (DOM)
`coach_saved_views (id, coach_id, name, query text, position, created_at)` + CRUD API
`/api/coach/saved-views`. `query` is the Atletas URL query string. Built-in views (not stored):
Necesitan algo, Todos, Sin plan, No ven su semana, Pausados.
`POST /api/coach/athletes/bulk { athlete_ids, action: 'set_level' | 'pause' | 'resume' | 'add_to_group' | 'remove_from_group', level_id?, group_id? }`.
Messages to many: existing `/api/coach/messages/broadcast`.

### 4.9 Search (⌘K) and exercise resolution — (SAFE)
`GET /api/coach/search?q=` → typed groups `{ athletes, programs, groups, library }` (≤ 5 each,
coach-scoped, accent/case-insensitive, ES+EN names). Screens and actions are static client-side.
`web/lib/exercises/resolve.ts`: `resolveExercise(coach_id, token)` → best match + candidates (fuzzy,
ES/EN, coach aliases, plural/accents), used by the quick-entry line so a typed line links an exercise.

---

## 5 · Route map (SHELL owns `next.config.ts` redirects; area owners move their folders)

| Old | New |
|---|---|
| `/atletas` (home) | `/hoy` is home; login lands on `/hoy` |
| `/altas` | `/hoy?vista=altas` (group row in Hoy) |
| `/biblioteca` | `/programar/biblioteca` |
| `/biblioteca/bloque/[id]`, `/nuevo` | `/programar/biblioteca/bloque/[id]`, `/nuevo` |
| `/biblioteca/sesion/[id]`, `/nueva` | `/programar/biblioteca/entreno/[id]`, `/nuevo` |
| `/microciclos/[id]` (+ `/dia/[idx]`) | `/programar/programas/[id]` |
| (new) | `/programar/programas` (list) · `/programar` → `/programar/programas` |
| `/periodizacion` | `/programar/grupos` (+ `/programar/grupos/[id]`) |
| `/tests` | `/programar/tests` |
| `/leads`, `/leads/[id]` | `/negocio/leads`, `/negocio/leads/[id]` |
| `/pagos` | `/negocio/cobros` |
| `/metricas` | `/negocio/embudo` |
| `/disponibilidad` | `/ajustes/agenda` |
| `/club` | `/ajustes/club` |
| `/como-entrenas` | `/ajustes/metodo` |
| `/cuestionarios` | hidden (redirect `/ajustes`) until something reads it |
| `/ajustes` | `/ajustes/perfil` (sub-nav area) |
| `/guia`, `/guia/[slug]` | unchanged URL; out of the sidebar ("?" in the top bar) |

Every old URL keeps working via a locale-aware redirect (`/:locale/biblioteca/:path*` →
`/:locale/programar/biblioteca/:path*`, etc.). Update internal links in the files you own.

Sidebar (5 + Ajustes): **Hoy** (badge = needs_you) · **Atletas** · **Mensajes** (badge = por responder)
· **Programar** · **Negocio** (only with add-on; badge = new leads + calls today + overdue) · Ajustes.
Top bar: ⌘K search · «+ Nuevo» (Atleta, Entreno, Programa, Grupo, Comunicado, Mensaje a…) · «?» help
(Guía) · theme toggle · account menu (Tu perfil, Tu club, Ayuda, Cerrar sesión). Mobile tab bar: Hoy ·
Atletas · Mensajes · Programar · Más.

---

## 6 · Screens (wave 2) — see the proposal mockups and area reports for detail

- **Hoy** (`/hoy`): PageHeader «Hoy · N te necesitan · X de Y ven su semana»; lens chips (Todo, Por
  responder, Sesiones, Fisiología, Plan, Altas); systemic rows first with one bulk action each
  (Publicar a los 47 · Asignar a los 30… · Revisar altas en fila · Recordar pagos); Crítico then
  Vigilar (collapsed after 10, "Ver N más" works); row = checkbox, avatar, name + level, primary signal
  as StatusBadge + evidence, age, primary action, Posponer ▾; Enter/click → non-modal AthletePeek
  Sheet; keys J/K, X, E (hecho), H (posponer), R (responder), Enter; undo toast; empty state «Todo al
  día»; first-run shows the setup checklist. No card grid, no «Actividad de hoy» rail (one line max).
- **Atletas** (`/atletas`): PageHeader + «Importar lista» + «Invitar atletas»; saved views as FilterChips
  (built-ins + coach views + «Guardar vista»); filters (Nivel from coach data, Grupo, Estado, Semana,
  Carrera) in the URL; DataTable 40 px rows: Atleta (+level) · Estado·motivo · Semana · Readiness 14 d
  (value + sparkline) · Adh. 14 d · Últ. entreno · Próximo · Carrera · Por responder; default sort
  «necesita algo» worst first; row click → AthletePeek; BulkBar: Asignar programa (AssignSheet),
  Publicar semana, Mensaje (broadcast), Nivel, Añadir a grupo, Pausar. Cards remain an optional density.
  Bulk invite by pasting a list (name, email per line) with level/group at invite time.
- **Mensajes** (`/mensajes`): default filter **Por responder**, oldest wait first with age badge;
  search; Hecho / Posponer / Marcar sin leer; send to several (broadcast); context panel loads only the
  open thread. Deep links `?hilo=` everywhere; nothing marks another athlete's thread read.
- **Athlete cockpit** (`/atletas/[id]`): header (name, level, division, race countdown; Mensaje with
  unread badge, Comunicado…, Publicar semana, ···; K/J prev/next within the roster filter); status
  banner with reason; «Hacer ahora» chips from the same signals; tabs Plan (default) · Rendimiento ·
  Perfil. Plan: calendar Semana / 3 semanas (default) / Plan completo; each week row shows
  Visible/Oculta (toggle hold/publish), load bar, week menu (copiar, desplazar, escalar volumen %,
  descarga, publicar); drag to move (existing reschedule endpoint), «+» to add (library / en blanco /
  IA), click → session Sheet that IS the editor (inline prescription; prescribed vs done for past
  sessions). Right column: readiness vs 28 d baseline + sparkline, sleep, soreness, last check-in (reply),
  injury (adapt), target race, private note (editable), the coach's key markers (coach-chosen). «Nuevo»
  athletes show the intake checklist instead. Rendimiento = one scroll ordered by question; empty
  sections collapse to one line. Perfil = datos, clasificación, lesiones, días, pagos, and one timeline
  (messages, comunicados, check-ins, 1:1, tests, injuries, plan changes).
- **Programar** (`/programar/*`): Programas list (table) → program editor: all weeks as rows × 7 days,
  cells show entreno lines; arrow keys, Enter edits with the quick-entry line (exercises resolved),
  ⌘C/⌘V cell/week/range, ⌘D, ⌘Z/⇧⌘Z (wire `use-slots-history`), Del with undo toast; drag from
  library; «Progresar selección» (+x %/sem, +1 serie, −x % descarga — step values are coach defaults);
  autosave per cell; week footer with planned volume per modality (derived); «Vista atleta» preview;
  «Asignar…» opens AssignSheet. Rest is a day state behind a menu, never a one-click delete.
  Biblioteca = dense table (Entrenos · Bloques · Ejercicios), default filter «Listos», «Por revisar»
  queue with the verbatim prose beside the editor, search ES/EN, «Usado en N», duplicates, bulk
  tag/archive. Grupos = list + group page (members, ordered programas, timeline with races and planned
  weekly volume, «Asignar a nuevos (n)»). Tests = the existing tests screen restyled.
- **Negocio** (`/negocio/*`, gated): tabs Leads (list + side-panel detail) · Cobros (KPI row, only rows
  needing action + actions: recordar, abrir en Stripe, marcar cobrado; «Al día (n)» collapsed) · Embudo
  (current funnel, one empty state at 0 leads). Tenant copy from data.
- **Ajustes** (`/ajustes/*`): left sub-nav, 720 px column, save-on-blur with InlineSave:
  Tu perfil · Tu club (the only place for club name/logo/colour/box/address/notice email; keeps the
  dual preview) · Método (Cómo entrenas interview + signal thresholds + readiness bands + key markers +
  auto-publish days) · Plan del atleta (visibility) · Agenda y cupo · Notificaciones · Cuenta (logout).
  Setup checklist component (computed from real data) shown in Hoy first-run and as «Setup n/9» in the
  sidebar until complete. Guía: full-width reader, linked from «?» and from each screen's help link.

---

## 7 · Waves and ownership

Migration number ranges: SIG 0211–0214 · DOM 0215–0219 · SAFE 0220–0222 · wave 2 ask the lead.

**Wave 1 (parallel)**
- **DS — design system.** Owns `web/app/[locale]/(v2)/v2-theme.css`, `(v2)/fonts.ts`,
  `web/app/globals.css` (panel parts only), `web/components/ui/MIcon.tsx`, new `web/components/v2/ui/**`,
  `web/components/v2/theme/**`, `web/app/manifest.ts`, font/icon links in `web/app/layout.tsx` (move
  landing/athlete-mockup fonts to their own layouts — verify the landing renders identically),
  `web/eslint.config.mjs` (add a `warn` rule against raw `<button className=…>` / `<input>` in
  `components/v2/**` outside `components/v2/ui/**`).
- **SIG — signals, status, adherence, roster, Hoy loader, perf.** Owns `web/lib/coach/attention/**`,
  `web/lib/coach/signal-config.ts`, `web/lib/coach/signal-thresholds.ts`,
  `shared/domain/coach/{signals,signal-thresholds,athlete-state,adherence,programming-status}.ts`,
  `web/lib/coach/athlete-state.ts`, `web/lib/dashboard/hoy/**`, `web/lib/dashboard/athletes/**`,
  `web/lib/dashboard/constants/readiness.ts`, `web/app/api/cron/recompute-attention/**`,
  `web/app/api/coach/inbox/**`, `web/app/api/coach/signal-thresholds/**`, related tests.
- **DOM — groups, assign-many, publishing, saved views, bulk.** Owns `web/lib/coach/groups.ts`,
  `web/lib/coach/assign-many.ts`, `web/lib/coach/{publish-week,publish-microciclo,plan-week-horizon}.ts`,
  `web/lib/coach/saved-views.ts`, `web/lib/dashboard/coach/{assign-sequence,sequences}.ts`,
  `web/app/api/coach/{groups,assign,weeks,saved-views,sequences}/**`, `web/app/api/coach/athletes/bulk/**`,
  `web/app/api/coach/athletes/[id]/weeks/**`, `web/app/api/cron/publish-weekly-plans/**`,
  `web/vercel.json` (cron schedule only), `shared/schema/{groups,assign-many,saved-views,bulk}.ts`,
  related tests.
- **SAFE — tenant scope, search, exercise resolution, layout loaders.** Owns
  `web/lib/dashboard/coach/{leads,business-metrics,metrics}.ts`, `web/lib/citas/**`, `web/lib/leads/**`,
  `web/app/api/coach/{leads,availability,citas,appointments,capacity,search}/**`,
  `web/lib/exercises/resolve.ts`, `web/lib/auth/coach-session.ts` (`cache()` only),
  `web/app/[locale]/(v2)/layout.tsx` (loaders only: scoped cheap badge counts, parallel awaits),
  copy fixes for tenant literals in `components/v2/{leads,metricas,citas}/**` and
  `components/v2/guia/**` (replace Pablo/FAHYBRID/fahybrid.com with tenant data), related tests.

**Wave 1.5 (after wave 1)** — **SHARED** cross-screen components on the new primitives:
`web/components/v2/shared/{AssignSheet,AthletePeek,ChatDrawer,SnoozeMenu,PublishWeekControl,GroupPicker,AthletePicker,StatusBadgeFor,ReadinessMini,AdherenceMini}.tsx`.

**Wave 2 (parallel)** — SHELL · HOY · ATLETAS · MENSAJES · FICHA · PROGRAMAR · NEGOCIO+AJUSTES,
each owning its route folders and `components/v2/<area>/**` (exact lists in their briefs).

**Wave 3** — lead: full QA at 100 athletes (desktop, phone, dark/light), consistency sweep, dead-code
sweep, lint rule to `error`, guía content to the new IA/vocabulary, docs (FOCUS, DECISIONS), push.

---

## 8 · Definition of done (whole rebuild)

- Hoy on the 100-athlete seed shows ≤ 20 rows (systemic groups + athletes), every row resolvable,
  snoozable or done, and the count goes down when you act.
- The same athlete-week shows the same adherence on every surface; no "1 %", no red on a healthy week.
- Assign a programa to 20 athletes starting next Monday from Atletas multi-select in ≤ 5 clicks,
  with preview and undo.
- Move Thursday's session to Friday from the athlete cockpit with one drag.
- Build a 4-week programa with copy/paste and «Progresar» without opening a drawer per line.
- No page issues more than ~15 DB queries per render at 100 athletes; Hoy/Atletas < 500 ms warm locally.
- No raw styled buttons in rebuilt screens; ≤ 8 font sizes; all text ≥ 12 px except caps labels;
  AA contrast in both themes; 44 px targets on phone.
- Every old URL redirects; no link points to a removed route.
- Lint + typecheck clean (except the pre-existing `tests/e2e` types); all tests pass.
