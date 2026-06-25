# Rediseño `/hoy` — Centro de mando de triage del coach

> Estado: **spec build-ready, pendiente de sign-off visual de Alex antes de construir.**
> Alcance aprobado por Alex: 3 superficies (`/hoy` triage + `/actividad` feed + `/mensajes` chat) + upgrade del roster `/atletas`.
> Base: research de sector (TrainingPeaks, TrueCoach/Trainerize/CoachRx, TrainHeroic/SugarWOD/FITR, Whoop/Garmin/Oura, Linear/Superhuman/CRM/paneles clínicos, NN-G/Refactoring-UI/Geist) + recon interno del código actual.

---

## 0. Tesis

El home del coach **no es un dashboard**: es una **cola de triage** que responde una pregunta cada mañana — *"¿quién me necesita hoy?"* — y **tiende a cero**. Pablo gestiona hasta ~100 atletas; la mayoría **invisibles en un buen día = éxito**, no un bug. El sistema **auto-resuelve el 80% trivial en servidor** para que 100 atletas produzcan ~8-15 tarjetas, no 100.

Converge en los 6 clusters de research. El `/hoy` actual viola esta tesis (es un panel pasivo de 1 atleta) y se rompe a escala.

---

## 1. Auditoría del `/hoy` actual

**Rendimiento (se rompe a escala — objetivo, medible):**
- `listInboxAlerts` (`lib/dashboard/coach/inbox.ts`) trae **todos** los atletas y lanza 4 subqueries laterales por cada uno → O(atletas).
- `fetchAthletesForCoach` (`lib/dashboard/athletes/list.ts`) usa **9 laterales por atleta**.
- `loadTeamPulse` agrega miles de filas en memoria.
- Total ~15-20 queries por render → **5-15 s a N=100**. `force-dynamic` ⇒ cero caché.
- **Inbox sin paginación**: renderiza 100-300 tarjetas. Sin virtualización.
- **Lista de atención capada a 3** (`ATTENTION_LIST_SIZE`): oculta el resto silenciosamente.
- **Sin error boundary**: un loader que falla → 500 de página completa.

**UX vs estándar de mercado (objetivo):**
- Es panel, no triage: sin modelo de decisión (resolver/posponer), sin snooze, sin estado vacío.
- Sin manage-by-exception: no auto-resuelve nada → ruido a escala.
- Sin acciones en lote ni teclado (es herramienta diaria de un power-user).
- Sin lentes/filtros guardados.
- Señales sin contexto (readiness opaco, sin delta vs baseline → falsas alarmas).
- Falta el bloque proactivo nº1 del modelo ATR: "microciclo acaba en N días → asigna el siguiente".
- `TeamPulseRail` pasivo (no enlaza a nada).

---

## 2. Principios de diseño (del estándar)

1. **Excepción primero, tiende a cero** + estado vacío explícito.
2. **Auto-resuelve el 80%** server-side (cron + reglas).
3. Un modelo por ítem: **Resolver / Posponer / Abrir**. Snooze *signal-aware* (vuelve por tiempo **o** señal nueva).
4. **Tiers de severidad:** Crítico → Vigilar → (resto auto-resuelto), peor primero.
5. **Cada elemento = señal estructurada real, cero texto libre.**
6. **Glifos escaneables:** anillo readiness + chip trayectoria + puntos adherencia; **color + etiqueta + icono** (WCAG 1.4.1). **Naranja Fabrik = acento de marca, NUNCA color de estado.**
7. **Teclado + lote:** Cmd+K, J/K, teclas únicas, bulk + undo toast.
8. **Detalle en panel lateral no-modal** (la cola sigue visible).

---

## 3. Navegación / arquitectura de información

Nav primaria: **HOY · ACTIVIDAD · ATLETAS · PROGRAMAR** + icono **Mensajes** (badge no-leídos) + **⌘K** en barra. Mobile: bottom-nav espejo.

| Superficie | Trabajo del coach | Tiende a cero |
|---|---|---|
| `/hoy` | **Triage**: decisiones que requieren a Pablo hoy | ✅ Sí |
| `/actividad` | **Revisión**: qué han entrenado los atletas + feedback | ❌ No (conciencia pasiva) |
| `/atletas` | **Amplitud**: estado del equipo en cubos (drill-down) | n/a |
| `/mensajes` | **Async**: bandeja de chat con atletas | ✅ Sí (sin responder) |

Razón de separar: una cola de triage que también es feed y chat no puede tender a cero → se convierte en el desastre actual. Son trabajos distintos (lógica dual-surface de Whoop).

---

## 4. `/hoy` — Triage command center

**Objetivo:** responder "¿quién me necesita hoy?" en una pantalla y vaciarse.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ MIÉRCOLES · 18 JUN 2026                                          [⌘K  Buscar / acción]  │
│ Hoy.                                                                                    │
│ ▸ 7 te necesitan hoy   ·   Readiness equipo ◗ 68%   ·   3 alertas · 2 sin responder    │
├───────────────────────────────────────────────────────────────────┬────────────────────┤
│ [ Todo 7 ][ Sesiones perdidas 2 ][ Microciclo acaba 1 ][ Sin       │  HOY                │
│   responder 2 ][ Readiness 3 ]                                     │  Sesiones · 9       │
│                                                                   │  ◉ 2 atletas 2x/día │
│ CRÍTICO  3 ───────────────────────────────────────────────────   │  ◐ M. Costa AM✓PM·  │
│ ┌──────────────────────────────────────────────────────────────┐ │  · +7 hoy           │
│ │ ◗28│ MARTA COSTA   [● HRV crash]  [⚑ HYROX BCN · 12d]          │ │  ─────────          │
│ │ MC │ HRV ▼14 ms vs baseline 60d · readiness 28%               │ │  PRÓXIMO            │
│ │    │                              [Resolver][Posponer][Abrir →]│ │  ⚑ HYROX BCN  12d   │
│ └──────────────────────────────────────────────────────────────┘ │    5 atletas A      │
│ ┌──────────────────────────────────────────────────────────────┐ │  ─────────          │
│ │ ◗-- │ LEO DÍAZ   [● Intake · 3 días]                           │ │  EQUIPO  (30)       │
│ │ LD  │ Terminó onboarding hace 3 días y sigue sin plan         │ │  ● Atención    3 →  │
│ │     │              [Revisar intake][Ver ficha]      [Posponer] │ │  ● Vigilar     6 →  │
│ └──────────────────────────────────────────────────────────────┘ │  ● Listo      21 →  │
│ VIGILAR  4 ───────────────────────────────────────────────────   │  ─────────          │
│ ┌──────────────────────────────────────────────────────────────┐ │  Próx. revisión     │
│ │ ◗55│ J. RUIZ  [▲ Ajuste semanal]  Bajar volumen mié–vie        │ │  semanal: sábado    │
│ │ JR │ Antes: Tempo 8k → Propuesto: Z2 40min  (+2 cambios)      │ │                     │
│ │    │                              [Aprobar][Ajustar][Posponer] │ │                     │
│ └──────────────────────────────────────────────────────────────┘ │                     │
│ ▸ Auto-resuelto hoy (18)  ───────────────────────────  [mostrar]  │                     │
└───────────────────────────────────────────────────────────────────┴────────────────────┘
  Multi-select: [ 2 seleccionados ] [Resolver] [Posponer 2d ▾] [Abrir]      [Deseleccionar]
  Toast: ✓ 2 resueltos — Deshacer ◷4s

  EMPTY (N=0):  ✓  "Todo revisado."  · Sin decisiones pendientes. 21 atletas en verde.
```

**Zonas:** (0) header ritual sticky · (1) tabs de lente (Todo/Sesiones perdidas/Microciclo acaba/Sin responder/Readiness, estado en `?lens=`) · (2) cola CRÍTICO→VIGILAR + "Auto-resuelto hoy (N)" colapsable · (3) rail "Hoy" (sesiones, próximos, buckets equipo→roster) · (4) side-panel no-modal · (5) undo toast.

**Componentes:** `MorningRitualHeader`, `LensTabs`, `TriageQueue` (reescribe `InboxQueue`), `TriageCard` (evoluciona `InboxItemCard`: glyph + chip razón + evidencia delta + 3 acciones), `AthleteGlyph`, `ReasonChip`, `SnoozeControl`, `BulkActionBar`, `HoyRail`, `AthleteSidePanel`, `AutoResolvedDrawer`, `CommandPalette`.

**Teclado:** J/K mover foco · Enter/O abrir panel · R resolver/aprobar (undo 5s) · H posponer · E/Backspace descartar · X seleccionar · Shift+J/K rango · Esc cerrar. ⌘K palette.

**Estados:** loading (skeleton shape-matched), empty "Todo revisado", first-run (0 atletas → invitar), multi-select, item-undo 5s, snoozed, error de acción (banner inline `role=alert`), error de carga parcial (sección con retry, nunca 500).

---

## 5. `/actividad` — Feed de revisión

**Objetivo:** conciencia pasiva + canal de feedback sobre lo que registran los atletas. **Nunca tiende a cero.**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Actividad                                  ● 14 sin revisar   [Marcar todo ✓]│
├──────────────────────────────────────────────────────────────────────────┤
│ [Todo][🏃Correr][🚣Erg][🏋Fuerza][🤸WOD]  Atleta:[Todos ▾] [7d ▾]          │
│ ◻ Solo fuera de objetivo    ◻ Solo sin revisar                             │
├──────────────────────────────────────────────────────────────────────────┤
│ ─ HOY · 9 sesiones · 2 fuera de objetivo ───────────────────────────────── │
│ ┌────────────────────────────────────────────────────────────────────┐●  │
│ │ (LP) Laura P.  Fuerza tren inf.  🏋   ● Por debajo · Sent. 5×5 @60%  │   │
│ │  ▼ PRESCRITO            REAL              Δ                          │   │
│ │    Sentadilla 5×5 @75%  5×5 @60%RM       −15% carga ●rojo            │   │
│ │    Peso muerto 4×6 RPE8 4×6 RPE8         en objetivo ●verde          │   │
│ │    RPE 9 · 58' · Nota: "rodilla molesta, bajé carga"                 │   │
│ │    [👏 💪 🔥 ✅]   [ Responder en privado… ]                          │   │
│ └────────────────────────────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────────────────────────────┐   │
│ │ (JR) Jordi R.  Remo intervalos  🚣   ● En objetivo · 6×500m 1:48     │   │
│ └────────────────────────────────────────────────────────────────────┘   │
│                            [ Cargar más ]                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Clave:** tarjetas colapsadas (avatar, sesión, resultado, punto adherencia+label, chip readiness, preview comentario, marca sin-revisar) que **expanden in-situ** a tabla Prescrito/Real por segmento (modelo measure×target×modality), reacción rápida + respuesta privada **anclada a la sesión**. Filtros (modalidad/atleta/fecha/off-target/sin-revisar) en query params. Day-groups sticky. Cursor pagination + virtualización.

**Adherencia (derivada en servidor):** verde "En objetivo" | ámbar "Cerca/Por debajo" | rojo "Fuera" | gris "Sin detalle". Bandas **por tipo de métrica** (un fallo de RIR ≠ un fallo de distancia) en `shared/domain/adherence/bands.ts` — sin hardcode. Adherencia de sesión = peor métrica.

---

## 6. `/mensajes` — Chat del coach

**Contexto:** la API de chat **ya existe** (`lib/dashboard/chat/service.ts`, `/api/coach/chat/threads`, tablas `chat_threads`/`chat_messages`, `unread_for_coach`) pero **no hay UI web de coach**. Esta superficie es mayormente *backed*.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Mensajes   ● 7 sin leer        [ Sin responder | Todos ]     🔍 Buscar…     │
├───────────────────────────────┬────────────────────────────────────────────┤
│ (◔)Marta Ruiz    ● 3  ⏱2h    │  (◔) Marta Ruiz            Ver ficha ↗      │
│ "¿Cambio el martes por…"      │  ── martes 17 jun ──                        │
│ ───────────────────────────── │  atleta → ¿Cambio el martes…   09:14        │
│ ( )Iván Sol      ● 1  ⏱5h    │  coach  → Sí, te lo reprogramo. 11:02 ✓✓    │
│ "Hecho, gracias coach"        │  ── hoy ──                                  │
│ ───────────────────────────── │  atleta → Perfecto 🙌          08:40        │
│ (◔)Leo Páez      ● 2 ⚠18h    │  ┌──────────────────────────────────────┐  │
│ "No pude entrenar ayer…"      │  │ Escribe un mensaje…        [ Enviar ] │  │
│                               │  │                         ⌘↵ para enviar │  │
└───────────────────────────────┴────────────────────────────────────────────┘
Anillo avatar: (◔)=no-leídos · Badge edad ⏱: gris <2h · ámbar 2–12h · rojo+⚠ >12h
```

**Dos paneles:** lista de hilos (orden `last_message_at`, badge no-leídos + edad, filtro "Sin responder" por defecto = triage-to-zero) + detalle (mensajes ASC, poll por delta reusando los 3s de iOS, mark-read on open, envío optimista). **`ThreadDrawer`** reutilizable: abre el mismo detalle desde la card "sin responder" de `/hoy` (corrige el dead-end actual). Teclado J/K, ⌘↵ enviar.

---

## 7. `/atletas` — Roster en cubos (vista de amplitud)

**Objetivo:** el plantel completo agrupado en 3 cubos de acción, ordenado peor-primero. Destino del drill-down del strip de equipo de `/hoy`.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ PLANTEL                                  ╭───────╮ Atención 6·Vigilar 11·Listo 41          │
│                                          │ ◍ 78% │ [Buscar…] [+ Añadir]  78% equipo listo  │
│ Vista:[En riesgo ▾]  Modalidad:(Todas)(Indiv)(Dobles)(Pro)  Readiness:(✓)(▲)(✕)  Grupo:▾  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ● ATENCIÓN · 6                                                                             │
│ │★(M) Marta Ríos  │◍38│↓Sobrecarga │●●●○●·· rojo │⚑ HRV crash  │REAL s2│ Hoy   │           │
│ │ (I) Lía Gómez   │◍—│ —sin dato   │·······      │⚑ Intake     │ —     │ —     │           │
│ ● VIGILAR · 11                                                                             │
│ │ (P) Hugo Peña   │◍64│↑Progresando│●●●●●·· verde│⚑ Micro acaba│REAL s3│ 19 Jun│           │
│ ● LISTO · 41   [Ver los 41 que van bien ▾]                                                 │
└──────────────────────────────────────────────────────────────────────────────────────────┘
  PANEL LATERAL (no-modal): desglose readiness por contribuyentes (sueño/HRV/RHR/recup/adher
  cada uno r-a-g + delta vs base) · timeline ATR [ACC 5s]→[TRANS 4s]→[REAL 3s ●s2] · sesiones
  recientes · [Mensaje][Abrir plan][Ver tendencias]
```

**Columnas:** Atleta (frozen) · Readiness (ring) · Trayectoria (chip) · Adherencia (dots microciclo) · Bandera · Bloque ATR · Próxima · Carrera. Headers sortables `aria-sort`, números `tabular-nums`. Cubo Listo colapsado por defecto (refuerza tiende-a-cero). Bulk-select → asignar microciclo ATR a grupo. Densidad Tabla/Tarjetas.

---

## 8. Backbone: motor de señales y reglas (attention store)

**El núcleo objetivo (build-right): la fuente única que decide en servidor QUIÉN necesita a Pablo, convirtiendo 100 atletas en ~8-15 tarjetas.** También arregla el N+1 del audit.

```
RAW TABLES → [CRON */15 + EVENT on-write] → recompute.ts (por atleta: rollupFacts → evaluators
→ si !fires SKIP (auto-resuelve) → si suppressed SKIP (snooze) → upsert) → coach_attention_items
(flat, indexado) → /hoy loadAttentionQueue (1 query, sev-sorted, capped) ≈ 8-15 cards
```

**Capas:** (0) `signal-config.ts` SIGNAL_THRESHOLDS (umbrales config, Zod) + overrides por atleta · (1) `SIGNAL_EVALUATORS` registry — funciones **puras** (testeables contra el cohort real de Pablo) · (2) auto-resolve gate (estado positivo = ausencia de señal negativa, no crea tarjeta) · (3) job cron + evento → `coach_attention_items` · (4) `coach_alert_overrides` (snooze/dismiss + resurfacing signal-aware) · (5) ensamblado de tarjetas + ranking severidad (single-highest-severity por atleta para el anillo).

### Señales — backed vs gap

| Señal | Severidad | Backed | Fuente / nota |
|---|---|---|---|
| HRV crash (▼ vs baseline 60d) | Crítico | ✅ | `cohort.ts` (trend, no spot) |
| Sin sync >48h / >24h | Crít/Vig | ✅ | `cohort.ts` sync_minutes_ago |
| Intake pendiente >48h | Crít/Vig | ✅ | `intake.ts` |
| Programming `no_month`/`month_2_pending` | Crítico | ✅ | `programming-status` |
| Microciclo acaba ≤N días (Due-Soon ATR) | Vigilar | ✅ | `atr/service.ts` |
| Ajuste semanal IA / bloque mensual pendiente | Vigilar | ✅ | `week-adjustments.ts` / `monthly-block-proposal.ts` |
| Sesiones perdidas ≥2 (7d) | Vigilar | ✅ | `cohort.ts` (gap: sin tabla de disponibilidad → falsos en viaje) |
| RPE alto ≥9 ayer · Check-in saltado >48h | Vigilar | ✅ | `cohort.ts` |
| Mensaje sin responder >12h | Vigilar | ✅ | `chat/service.ts` |
| Readiness baja (<45 / 45-66) | Vig/factor | ✅ | `readiness.ts` (67/45 — **fuente única**) |
| Pago fallido / renovación ≤7d | Crít/Vig | ✅ | `inbox.ts` subscriptions |
| **Snooze/dismiss persistente** | — | ❌ | **tabla `coach_alert_overrides` (no existe)** |
| **Auto-resueltos del día (auditoría)** | — | ❌ | derivable, no registrado |
| Compliance drop (delta ventana-sobre-ventana) | Vigilar | ❌ | falta ventana previa (solo 7d hoy) |
| Tests del día | Vigilar | ❌ | `flags.test_today` hardcoded false; sin `test_assignments` |
| Video reviews pendientes | Vigilar | ❌ | hardcoded `?? 4`; sin tabla |
| Mass-adjustment IA pendiente | Vigilar | ❌ | `mass_adjustments` sin estado `pending`/`generated_by` |
| Pin manual + nota de coach | — | ❌ | sin persistencia (alto valor, bajo coste) |
| Umbrales por atleta | — | ❌ | `athlete_signal_thresholds` (no existe) |

---

## 9. Sistema compartido + rendimiento + a11y

**Primitivos reutilizables (DRY, un barrel):** `StatusChip` (enum semántico, color+icono+label, fills atenuados para rutina), `ReadinessRing` (arco banded + integer + label), `TrajectoryChip`, `AdherenceDots`, `AthleteGlyph` + `AthleteQuickview` (hover/focus, Mensaje/Plan/Tendencias), `TriageCard`, `BulkActionBar`, `UndoToast`, `DetailSidePanel`, `FilterChipBar`, `SavedViews` (URL-encoded), `CommandPalette` (⌘K), `SkeletonRow`, `EmptyState`, `ErrorState`, `Toast` provider.

**Tokens:** añadir `--info`/`--neutral` + `*-tint` siguiendo convención existente; **paridad `Theme.swift`** en el mismo commit. **Naranja `--accent` = solo marca/selección; estados usan escala semántica green/amber/red.** Verificar contraste naranja-on-dark para texto pequeño (≥4.5:1) → si no llega, usar naranja solo en fondos/bordes, no en texto <14px.

**Rendimiento (arregla el audit):**
1. **Attention store precomputado** → `/hoy` lee ~8-15 filas con 1 query indexada (no O(atletas) N+1).
2. **Filtrado a nivel DB** (mover umbrales de TS a WHERE/CTE).
3. **Paginación/virtualización** (cursor) en inbox, roster y feed.
4. **7 índices** (workout_assignments, daily_checkins, biometric_streams, races, week_adjustment_proposals, chat_threads, coach_attention_items) — verificar EXPLAIN a N=100 en branch Neon (sin mocks).
5. **ISR + cacheTag** (`coach:{id}:attention`) en vez de `force-dynamic`; cron/acciones llaman `updateTag`.
6. **Error boundaries por loader.**
7. **Bulk transaccional** (1 POST para N).
8. **⌘K typeahead** `/api/coach/search?q=` (no cargar roster entero).

**A11y (gate antes de merge):** color nunca solo (color+icono+label en todos los glifos) · focus-visible rings brillantes sobre dark · 100% teclado · `aria-sort` en headers · `aria-live` polite en toasts/conteos · side-panel gestiona foco (Esc devuelve a origen) · `prefers-reduced-motion` · targets ≥24px desktop/44px touch.

---

## 10. Reconciliaciones (coherencia cross-surface)

- **Bandas de readiness = fuente única `lib/dashboard/constants/readiness.ts` (ok≥67 / caution 45-66 / low<45)** en TODAS las superficies. (Un agente propuso 55 para el chip de `/actividad` — descartado.)
- **Vocab de trayectoria:** `Progresando / Manteniendo / Sobrecarga / Sin dato` (alineado Garmin) — unificado (otro agente usó Mejorando/Estable/Cayendo).
- **Buckets de equipo:** `Atención / Vigilar / Listo` en `/hoy` rail y `/atletas`.
- **Severidad:** 2 tiers `Crítico / Vigilar`; lo trivial → "Auto-resuelto".
- **Umbrales:** TODOS en `signal-config.ts` / `constants/*` — cero números mágicos en componentes (extraer los inline de `cohort.ts`/`inbox.ts`/`team-pulse.ts`).

---

## 11. Orden de construcción (fases)

- **F0 · Fundaciones (sin UI):** `status-semantics.ts` (tiers, fuente única) + tokens `--info/--neutral/*-tint` + `Theme.swift` · `signal-config.ts` (extraer umbrales hardcoded) · bandas adherencia/readiness.
- **F1 · Backbone señales + perf:** migraciones `coach_attention_items`, `coach_alert_overrides`, `athlete_signal_thresholds` · `SIGNAL_EVALUATORS` puros + tests contra cohort real · `recompute.ts` (cron */15 + evento) · `loadAttentionQueue` + filtrado DB · 7 índices (EXPLAIN N=100) · ISR/cacheTag + error boundaries.
- **F2 · Sistema compartido:** los primitivos del §9 + barrel · nav (Actividad + Mensajes + ⌘K) + bottom-nav.
- **F3 · `/hoy` triage:** LensTabs · TriageQueue/TriageCard · HoyRail · AthleteSidePanel · AutoResolvedDrawer · hook teclado · endpoints snooze + bulk · `ThreadDrawer` (reusa chat API) para "sin responder".
- **F4 · `/mensajes`:** MessagesShell 2-paneles · poll/mark-read/optimista · badge nav (mayormente backed).
- **F5 · `/atletas` roster:** `buckets.ts` · extender `AthleteRow` (next_session, hrv_trend, adherencia-por-sesión) · ReadinessRing/TrajectoryChip/AdherenceDots en filas · BucketSection/RosterTable/TeamReadinessGauge/AthletePanel (lazy)/CohortActionBar.
- **F6 · `/actividad`:** migraciones `execution_reviews`, `session_reactions`, `chat_messages.execution_id` · `shared/domain/adherence` compute + tests · loader+endpoints cursor · componentes colapsado→expand→reacción/respuesta→marcar-revisado→virtualización.
- **F7 · GAPs de feature (follow-up, no bloquean base):** `test_assignments` · tabla video reviews · `mass_adjustments` pending+generated_by · `coach_athlete_pin` + nota · `coach_saved_views` custom · UI umbrales por atleta · disponibilidad de atleta (suprimir falsos missed) · sync por dispositivo.

---

## 12. Decisiones subjetivas pendientes (para Alex)

Defaults ya elegidos (no requieren acción salvo veto): nombres de superficies (Actividad/Mensajes), buckets (Atención/Vigilar/Listo), vocab trayectoria, 2 tiers de severidad, cubo Listo colapsado, snooze 24h/1sem/hasta-que-responda.

Genuinamente suyas: (a) **orden de construcción/prioridad** de superficies; (b) **alcance de los GAPs F7** ahora vs follow-up; (c) sign-off visual de los wireframes de `/actividad`, `/mensajes`, roster.

---

## Apéndice: fuentes del research

Endurance: TrainingPeaks, Final Surge, Today's Plan, TrainerRoad. PT SaaS: TrueCoach, Trainerize, Everfit, CoachRx, FitBudd. Funcional/HYROX: TrainHeroic, Hevy Coach, SugarWOD, btwb, Volt, FITR, Roxfit. Wearables: Whoop (Vector Connect/Coach Catalyst), Garmin, Oura, Strava. Triage: Linear, Superhuman, Intercom, Front, Missive, HubSpot, Salesforce, Sunsama, Akiflow, paneles de salud poblacional. Craft: NN/G, Refactoring UI, Geist/Vercel, Polaris, Atlassian, Stripe. (URLs completas en el output del workflow de research.)
