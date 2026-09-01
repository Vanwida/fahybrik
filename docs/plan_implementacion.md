# Plan Maestro de Implementación — FAHYBRID
**Documento de planificación vivo · uso interno equipo fundador**

> Objetivo: traducir el **Documento Maestro del Proyecto** a un plan de implementación accionable que reconcilia lo que ya está construido con lo que falta. Pensado para que los tres socios (Fundador / Pablo / Programador) compartan visión y prioridades.
>
> **Nota nombre:** el código y wordmark del producto es **FAHYBRID** (con **D**). El Documento Maestro v1.0 lo escribe "FAHYBRIK" (con K) — typo del doc, pendiente corregir en v1.1.
>
> **Historial de cambios:**
> - 2026-05-27: redactado v1 a partir del doc maestro + auditoría código.
> - 2026-05-27: revisión adversarial (devil's advocate + auditor fidelidad). 17 decisiones cerradas con equipo. Incorporado lagunas funcionales L1-L5, estimaciones realistas, sección Operativa Prod, mapping entidades doc↔schema, aclaración Apple IAP.

---

## 0. TL;DR

- **Producto:** app nativa iOS+Android de entrenamiento HYROX/DEKA/híbrido personalizado, supervisado por Pablo, con IA asistente. Mercado España, lanzamiento en ES+EN.
- **3 modalidades de servicio:** Individual (~70€), **Dobles** (~115€, atletas vinculados, producto estrella), Pro/Elite (~95€).
- **Estado real coach:** muy avanzado — microciclos, IA Compose/Adapt, dashboard, schema BD, notificaciones, intake, macro-progress runtime, editor templates atómicos, ribbon de microciclo clickable.
- **Estado real iOS:** ~65% real / 35% stub. Funciona: Apple Sign In, Onboarding 13 pasos, Today (check-in + readiness + nextWorkout real), Plan view, ActiveWorkout + RPE sync, HealthKit service cableado. **Gaps críticos iOS:** Chat local-only (no backend), detalle sesión ausente del DTO (no muestra series/reps/pesos/RPE), push notifications (APNS) sin implementar, RGPD (export/delete) ausente, Stats mock, Garmin solo checkbox.
- **Estado real datos:** `biometric_streams` = 0 rows. HealthKit sync no verificado end-to-end aunque el código está montado.
- **Bloqueantes para lanzamiento:** Dobles + Stripe + catálogo ampliado + Chat real iOS + detalle sesión iOS + push iOS + RGPD.
- **3 acciones inmediatas:** (1) cerrar 17 decisiones P0 → DONE (ver sección 3); (2) arrancar Fase 1a (Dobles + Chat backend + Plan session detail + RGPD + tests setup) ~5-7 sem reales; (3) Stripe Individual + iOS Profile (Fase 1b) en paralelo.
- **Apple IAP NO aplica:** modelo web-first (atleta paga en fahybrik.com antes de descargar app, modelo Spotify/Netflix). Apple Guidelines 3.1.3(B) "Multiplatform Services". Stripe vía web sin Apple cut.

---

## 1. Alineación con Documento Maestro

### 1.1 Qué refleja el Documento Maestro
El doc fija visión de producto, modelo de servicio, pricing, flow del atleta, modelo de datos sugerido, biblioteca metodológica de 10 grupos, análisis HYROX y captación vía boxes de Pablo. Es el "qué" del producto.

### 1.2 Qué se ha construido ya (alto nivel)
- **Backend coach (`coach/3457`)**: dashboard Atletas + Review + ficha atleta (Resumen/Plan/Cuerpo/Rendimiento) + Programación (microciclos + editor templates atómicos) + notificaciones in-app + IA Pablo Compose (1 entreno / semana entera con LLM real DeepSeek v4 Flash via OpenRouter, fallback heurístico).
- **iOS app**: onboarding 13 pasos, Today con readiness composite + check-in matinal, Plan (lee API real), Active workout con RPE post-sync, HealthKit sync service cableado.
- **Schema BD (Neon Postgres + pgvector)**: `coaches`, `athletes`, `program_month_templates` (microciclo), `program_week_templates`, `templates` (entrenos atómicos) con multi-block, `workout_assignments`, `workout_executions`, `biometric_streams`, `race_results`, `notifications`, `week_adjustment_proposals`, `monthly_block_proposals`, `atr_macrocycles`, `microcycles`, `methodology_documents`.
- **IA**: Pablo IA Adapt (Context Pack + LLM + RAG hooks), Pablo IA Compose (sugerencias semana/entreno), text-suggest (sugerencias de nombres).

### 1.3 Estado app iOS pantalla por pantalla

Auditoría real (2026-05-27) sobre `ios/FAHYBRIK/`:

| Surface | Estado | Notas |
|---|---|---|
| **Auth (Apple Sign In)** | ✓ funcional | `AppleSignInView` + `AppleAuthService` cableados a backend |
| **Onboarding 13 pasos** | ✓ funcional | Captura 82 campos, persiste vía `OnboardingAPI`. Cubre los 7 campos del doc + extras. **Verificar mapping a BD coach view del intake.** |
| **Today — Check-in matinal** | ✓ funcional | 5 preguntas (soreness, mood, motivación, fatiga, sueño) + notas. Auto-save borrador. POST `/api/checkin`. |
| **Today — Readiness 0-100** | ✓ funcional | Fetch `/api/athlete/readiness/today` con score precalculado server-side. |
| **Today — Próximo workout** | ✓ funcional | `PlanService.nextWorkout()` deriva del plan semana, pasa `assignmentId` real a `WorkoutContainer`. |
| **Plan — vista 7 días** | ✓ funcional | Consume `/api/athlete/plan/week`. |
| **Plan — DETALLE sesión** | ✗ **CRÍTICO** | `PlanService.AthleteWeekDaySession` solo trae `{assignmentId, slot, title, modality, status}`. **NO series/reps/pesos/RPE/ritmos**. `PlanView` rellena con mock `warmup:[], zones:[], coachNote:nil`. El doc lo pide explícito. |
| **Plan — Macro / fase** | △ parcial | Muestra macroLabel + barra progreso. **No muestra el nombre del microciclo** en lenguaje atleta. |
| **Active Workout (cronómetro + flow)** | ✓ funcional | Session state, lap, pause modal, métricas tiempo real. |
| **PostWorkoutSummary (RPE + notas)** | ✓ funcional | POST `/api/sync/workout-execution` con `perceived_exertion + notes + duraciones`. Offline-first via `RequestQueue`. |
| **Stats — sub-tabs Running/Carga/HR/HYROX/PRs/Tendencias** | △ UI mock | Sub-tabs visibles pero datos vienen de `StatsView.mock`. No hay GET `/api/stats/history` real. |
| **Stats — HYROX race results** | △ esqueleto | Endpoints `/api/athlete/race-results` y `/race-debriefs` existen. `PostRaceDebriefView` captura post-carrera. **Verificar si el form realmente captura 8 estaciones + 8km + RoxZone + división** según doc. |
| **Chat** | ✗ **CRÍTICO local-only** | `ChatView` carga de `ChatMessage.seed` (estático). Envío hace `append` local sin backend. Comentario explícito en línea 6: "appends locally only (no backend wire)". |
| **Profile — datos + modalidad** | △ mock | Identity card con `TodayPersona.demo`. `editProfile` sheet existe pero acción vacía. Modalidad "HYROX Pro Men" hardcoded. |
| **Profile — RGPD (export / delete)** | ✗ **CRÍTICO** | 0 referencias en código. Bloqueante legal. |
| **HealthKit Sync** | ✓ código / ⚠ datos | `HealthKitSyncService` con HKObserverQuery + permisos + POST a `/api/sync/healthkit`. **PERO `biometric_streams` tiene 0 rows** — sync no se ha verificado end-to-end con datos reales. |
| **Garmin Connect** | △ checkbox solo | `ConnectionsStep` (onboarding paso 12) tiene toggle booleano. **Sin OAuth UI nativa**. Backend tiene `/api/garmin/connect/callback/webhook` listos. |
| **Notificaciones push (APNS)** | ✗ **CRÍTICO** | Cero referencias a `UNUserNotificationCenter`, `registerForRemoteNotifications` o handler. Bloquea recordatorios + chat + plan publicado. |
| **Settings / idioma / notif config** | ✗ ausente | No vista UI de configuración usuario. |

### 1.4 Top 10 gaps iOS críticos (priorizados por bloqueo lanzamiento)

| # | Gap | Severidad | Fase plan |
|---|---|---|---|
| iOS-1 | **Chat NO conectado a backend** — local seed solamente | Bloqueante | **1a** |
| iOS-2 | **Detalle sesión (series/reps/pesos/RPE/ritmos) ausente del DTO** — el atleta no sabe qué ejecutar | Bloqueante | **1a** |
| iOS-3 | **Notificaciones push (APNS) no implementadas** — atleta no sabe cuándo entrenar | Bloqueante | **1c** |
| iOS-4 | **RGPD export + delete account** no existe | Legal | **1a** |
| iOS-5 | **HealthKit sync no verificado end-to-end** — 0 rows en BD | Alto (datos vacíos en Stats/Pablo IA) | **1c** |
| iOS-6 | **Garmin OAuth flow nativo** ausente — solo checkbox onboarding | Alto | **2** |
| iOS-7 | **Stats histórico real** — todo mock | Medio | **2** |
| iOS-8 | **Profile edición datos + ver suscripción** ausente | Medio | **1b** |
| iOS-9 | **Race results form real** (8 estaciones + 8km + RoxZone + división) | Alto diferenciador | **2** |
| iOS-10 | **Macro: mostrar tipo de bloque** en lenguaje atleta (acumulación/intensificación/tapering) | Bajo | **2** |

### 1.5 Top gaps backend/coach vs documento
| Gap | Impacto | Bloquea lanzamiento |
|---|---|---|
| Modalidad **Dobles** (partner_id, plan compartido, pago vinculado) | Alto — producto estrella | **Sí** |
| **Pagos Stripe/Redsys** (suscripciones, churn, dunning) | Alto — sin esto no se cobra | **Sí** |
| **App Android nativa** | Medio — corta mercado a la mitad | No (fase 2) |
| **Catálogo 100+ sesiones** clasificadas en **10 grupos metodológicos** del doc | Alto — hoy 18 templates seed | **Sí** |
| **Vídeos por ejercicio** (15-30s pro) | Medio — diferenciador | Parcial |
| **Flow videollamada inicial** + reserva calendario | Medio | No (manual al inicio) |
| **Bilingüe ES+EN** contenido completo | Medio | Parcial (ES first OK) |
| **Box_member** flag + precio especial | Bajo | No |
| **RGPD operativo** (exportar/eliminar datos atleta) | Legal | **Sí** (mínimo legal) |
| **Multi-coach admin UI** | Bajo | No (Pablo único) |
| **Análisis HYROX con benchmarks por división** | Alto — diferenciador | **Sí** parcial |

---

## 2. Matriz de Capacidades

Comparativa fina por capacidad del documento maestro.

| # | Capacidad (doc) | Estado actual | Brecha | Fase |
|---|---|---|---|---|
| C1 | Atleta accede plan semanal con detalles (series/reps/pesos/RPE/ritmos) | ✓ iOS Plan view consume API real | Refinar UI según mockups Stitch | 1c |
| C2 | Atleta registra resultados texto libre por sesión | ⚠ Hay `workout_executions.notes` pero UI iOS post-workout solo captura RPE | Añadir input texto libre en PostWorkoutSummary | 1a |
| C3 | Atleta consulta historial semanas + evolución | ⚠ Schema OK, UI Stats parcial | Implementar Stats sub-tab "Historial" | 2 |
| C4 | Chat coach↔atleta in-app | ✓ Backend chat_threads/messages + endpoints sync | Verificar UI iOS Chat + UI coach chat por atleta | 1c |
| C5 | Atleta introduce resultados carrera HYROX (8 estaciones + 8km + RoxZone) | ⚠ Schema `race_results` existe, UI iOS no verificada | Implementar form post-carrera en iOS | 2 |
| C6 | Notificaciones push (plan publicado, recordatorios, chat, renovación) | ⚠ Endpoints comms, no verificado push iOS | Wire APNS + endpoint push trigger | 1c |
| C7 | Coach ve lista atletas activos con métricas | ✓ AthletesList + programming_status + readiness | Verificar columnas exactas del doc (semana actual, % completado, última conexión, próxima renovación) | 1b |
| C8 | Coach constructor de semanas (drag bloques biblioteca) | ✓ Studio 3-pane funcional | Mapear a 10 grupos metodológicos del doc | 2 |
| C9 | IA propone semana → coach revisa → publica | ✓ Pablo IA Compose + Adapt operativo | Pulir prompt + RAG metodología | 1c |
| C10 | Publicar plan cada sábado para semana siguiente | ⚠ Existe assign-month, no hay cron "publicar viernes 23:59" | Cron Vercel + estado `draft/published/archived` en weekly_plan | 2 |
| C11 | Sistema alertas coach (sin actividad >2d, mensaje nuevo, renovación, pago fallido, propuesta IA pendiente) | ✓ Notificaciones in-app montadas | Añadir alertas pago fallido (depende de Stripe) | 1b |
| C12 | Panel métricas negocio (MRR, churn, altas, renovaciones próximas) | ❌ No existe | Implementar dashboard métricas | 2 |
| C13 | **Modalidad Dobles** (partner_id, plan shared, pago vinculado) | ❌ No existe | Refactor users + weekly_plans + subscriptions + UI atleta "plan compañero" | **1a** |
| C14 | **Modalidad Pro/Elite** (volumen, periodización, splits Pro, planificación temporada) | ✓ Implementado vía level=elite | El coach nombra el orden de microciclos | 2 |
| C15 | Videollamada inicial como filtro pre-onboarding | ❌ No existe en flow | Calendly/embed + flag `intake_call_completed` | 3 |
| C16 | Onboarding 7 campos (nivel, lesiones, carreras, splits previos, días, equipamiento, objetivos) | ✓ iOS onboarding 13 pasos | Verificar match exacto con campos del doc | 1a |
| C17 | Plan creado 48-72h tras onboarding | ⚠ Flujo automático intake → propose first month existe; falta SLA | Documentar SLA + notificación atleta cuando listo | 2 |
| C18 | Ajuste semanal feedback → IA propone → coach aprueba | ✓ Motor semanal + WeekAdjustmentsPanel | Lazy hoy (botón). Cron domingo noche pendiente | 1b |
| C19 | Análisis carrera HYROX automático (top 2-3 estaciones débiles + RoxZone perdido + caída ritmo) | ⚠ Schema race_results, helper `web/lib/coach/race-analysis` (verificar existencia) | Implementar comparador con benchmarks por división | 2 |
| C20 | Benchmarks por división HYROX (Open/Pro/Dobles/Relay) | ❌ Datos no cargados | Importar dataset benchmarks (público) + tabla `hyrox_benchmarks` | 2 |
| C21 | Biblioteca 10 grupos metodológicos (~100 sesiones) | ⚠ 18 templates seed con `format` técnico (strength_block, amrap…) | Mapeo formats → 10 grupos + seed completar a 100+ con Pablo | **2** |
| C22 | Vídeos explicativos por ejercicio (15-30s) | ❌ Schema `exercises` sin `video_url` | Migración + UI upload + storage (Cloudflare R2 / Vercel Blob) | 2 |
| C23 | Idioma ES + EN | ⚠ i18n next-intl montado, contenido solo ES | Traducir UI + planes en idioma del atleta | 3 |
| C24 | Pagos: tarjeta crédito/débito, suscripción mensual recurrente | ❌ No existe | **Stripe Subscriptions** (Redsys evaluar después) | **1b** |
| C25 | Pago Dobles: 1 pago, 2 cuentas vinculadas, cancelación cancela ambos | ❌ No existe | Stripe customer compartido + partner_id en subscriptions | **1a** |
| C26 | Precio especial para miembros de boxes de Pablo | ❌ No existe | Flag `box_member` + código descuento Stripe Coupon | 3 |
| C27 | Integraciones Garmin/Polar/Strava | ⚠ Garmin OAuth + webhook montado, Polar y Strava no | Aplicar Garmin Partner (semanas approval), Polar/Strava OAuth | 2 |
| C28 | RGPD: T&C + privacidad accesibles + export/borrar datos | ⚠ Páginas web públicas existen, no flow export/borrar in-app | **Endpoints export/delete + UI Perfil** | **1c** |
| C29 | Multi-coach future-ready | ✓ Schema `coach_id` en todas las tablas relevantes | Añadir UI admin coach panel cuando se incorpore segundo coach | 5 |
| C30 | Android nativo | ❌ No existe | Decisión: Kotlin nativo vs React Native vs Flutter | 4 |
| C31 | **Integración calendario boxes Pablo en planning** (doc §15: "si box hace fuerza martes, plan no añade fuerza ese día") | ❌ ausente totalmente | Campo `users.box_class_schedule` (JSON: días + tipo entreno por día) + IA Pablo Compose lo respeta en system prompt | **1a** |
| C32 | **Reparto estaciones Dobles HYROX** (doc §4 Dobles competición) | ❌ ausente | Campo `sessions.station_assignment` (JSON: por estación qué atleta del par hace) + UI atleta marca sus estaciones del día | **1a** |
| C33 | **IA responde dudas básicas ejercicios** al atleta in-app sin reemplazar coach (doc §7 uso #5) | ❌ ausente | Endpoint `POST /api/athlete/ai/exercise-question` + UI iOS botón "Pregunta a Pablo IA" en detalle ejercicio + LLM con guardrails (solo ejecución técnica, NO planificación/salud → deriva a coach) | **2** |
| C34 | **Duplicar semana de otro atleta como punto de partida** (doc §8) | ❌ ausente | UI coach: botón "Duplicar de…" en wizard nueva semana + selector atleta + clona slots_json | **2** |
| C35 | **Privacidad fina Dobles** (D16) — qué ve cada atleta del compañero | ❌ ausente | Campo `sessions.partner_visibility` ENUM('shared','self_only') + filtros endpoint plan atleta según rol partner | **1a** |

---

## 3. Decisiones de Producto a Cerrar

| # | Decisión | **CERRADO COMO** | Notas |
|---|---|---|---|
| D1 | Microciclo vs `weekly_plans` | **Microciclo + `weekly_plans` hijo** | Schema añade tabla weekly_plans + flag shared. Doc maestro v1.1 reflejar ambas. |
| D2 | Nombre del microciclo vs copy atleta | **El atleta lee el nombre que puso el coach** | Sin catálogo de fases en producto. |
| D3 | 10 grupos vs `format` técnico | **Coexisten: `methodology_group_id` + `format`** | Editor coach filtra por grupo, motor usa format. |
| D4 | Dobles cuándo | **Antes — Fase 1a (5-7 sem)** | Producto estrella del doc, sin Dobles el lanzamiento pierde lógica comercial. |
| D5 | Android stack | **Kotlin nativo, post-MVP iOS** | 12-16 sem real. Acepta desviación doc ("Android desde inicio"). |
| D6 | Stripe vs Redsys | **Stripe principal** | Modelo web-first → sin Apple IAP → sin 30%. |
| D7 | Pricing | **Mantener 70/115/95€** | Revisar a 3 meses con datos competencia. |
| D8 | Permanencia | **Mensual puro al inicio** | Trimestral en Fase 5 si churn alto. |
| D9 | Modelo IA | DeepSeek v4 Flash temporal | Alex itera. Swap = 1 env var. |
| D10 | Estructura legal | **Posponer con asesor** | Bloqueante Fase 1b (cobros). Acción: agendar asesor esta semana. |
| D11 | Nombre proyecto | **FAHYBRID temporal** | Equipo abierto a alternativas. Verificar dominios + App Store handle. Bloquea brand book + listing. |
| D12 | Inversión socios | **Acuerdo socios separado** | Sesión específica fuera del debate de producto. |
| D13 | Idiomas | **ES + EN desde día 1** | Catálogo HYROX España tiene muchos extranjeros residentes. +1 sem Fase 1c traducción. |
| D14 | Calendario boxes en planning | **MVP Fase 1a** | Campo "días clase box" en perfil + IA Pablo Compose respeta al sugerir. Refinamiento Fase 2. |
| D15 | Reparto estaciones Dobles HYROX | **MVP Fase 1a** | Campo `station_assignment` por sesión (atleta A/B/alterna). UI atleta marca sus estaciones. Algoritmo IA Fase 2. |
| D16 | Privacidad fina Dobles | **Plan + tiempos compartidos; RPE/notas/chat privados** | Default razonable. Cada atleta accountability propia. |
| D17 | Tests + observabilidad | **Desde Fase 1a** | Vitest unit + Playwright happy paths (Stripe, Dobles, RGPD) + Sentry. +1 sem en Fase 1a pero evita ruleta rusa. |

**16 de 17 decisiones cerradas el 2026-05-27.** Pendiente solo D10 (legal, asesor). D11 (nombre) temporal — los socios pueden proponer alternativa en cualquier momento.

---

## 4. Reconciliación Arquitectónica

Cambios concretos en BD/código para alinear lo construido con el doc.

### 4.1 Modelo Dobles (D4 = sí)
**Schema:**
- `users.partner_id BIGINT NULL REFERENCES users(id)` — atleta compañero en Dobles
- `users.plan_type ENUM('individual','dobles','pro_elite')` — ya hay similar como `subscription_tier`, alinear nombre
- `users.box_member BOOLEAN DEFAULT false`
- `users.idioma TEXT DEFAULT 'es'` (ES|EN)
- `subscriptions.partner_id BIGINT NULL REFERENCES users(id)` — pago vinculado a 2 cuentas
- `subscriptions.stripe_customer_id TEXT` — 1 customer cubre 2 users en Dobles
- `weekly_plans` (entidad nueva o renombrar program_week_assignments): añadir `shared BOOLEAN DEFAULT false`. Si shared=true, ambos partners ven sus sesiones comunes.
- `sessions.partner_visibility ENUM('both','self','partner')` para Dobles — control fino qué ve cada uno.

**Lógica:**
- Onboarding Dobles: primer atleta paga → recibe link de invitación → segundo atleta crea cuenta + completa SU onboarding (no clona del primero).
- Pago Stripe: 1 subscription, 1 customer, 2 metadata: `user_a_id, user_b_id`.
- Cancelación: si cualquiera cancela → ambos pierden acceso al fin del periodo. Notificar al otro.
- UI atleta Dobles: el plan muestra **sesiones compartidas marcadas** (chip "Con [nombre compañero]") + sesiones individuales propias.

### 4.2 Mapeo formats → 10 grupos metodológicos (D3)
Añadir tabla `methodology_groups` (id 1-10, name, description del doc) + columna `templates.methodology_group_id`. Mapeo recomendado:

| Format técnico | Grupo metodológico doc |
|---|---|
| `strength_block` con squat/deadlift/press | 01 Fuerza Base |
| `strength_block` con jumps/plyo | 02 Fuerza Explosiva/Pliométrica |
| `intervals` con erg | 03 Series Ergómetros |
| `intervals` con run | 04 Series Running |
| `tempo` Z2/recovery | 05 Zona 2 / Recuperación |
| `amrap`/`for_time`/`circuit` con mix | 06 WODs / Metcons Competitivos |
| `hyrox_sim` | 07 Simulaciones HYROX/DEKA |
| Mobility/core | 08 Core, Movilidad y Preventivos |
| `circuit` resistencia | 09 Circuitos Funcionales Fuerza-Resistencia |
| Templates `taper`/intensidad baja | 10 Tapering / Activación Pre-Carrera |

UI del editor templates añade chip seleccionable de los 10 grupos.

### 4.3 Nombre del microciclo (D2)
- Coach UI: el título editable del microciclo.
- Atleta UI iOS: ese mismo nombre, sin un catálogo de fases en producto.

### 4.4 Microciclos como contenedor del weekly_plan (D1)
Mantener `program_month_templates` (microciclo, 4 semanas plantilla) + nuevo nivel `weekly_plans` (runtime, 1 semana asignada a atleta concreto). Hoy ya tenemos `workout_assignments` que vive ese rol — solo hay que añadir nivel intermedio "weekly_plan" para agrupar las 7 sesiones del atleta de esa semana (status `draft/published`, ia_propuesta flag, aprobado_por). Refactor menor.

### 4.5 Análisis HYROX benchmarks
Nueva tabla `hyrox_benchmarks (division, station, p50, p25, p75, source, season)` cargada con datos públicos. Cada `race_result` se compara automáticamente.

### 4.6 Mapping formal entidades doc maestro ↔ schema actual

El doc maestro propone unos nombres de entidad; el schema existente usa otros. Ambos son válidos — actualizar doc v1.1 para reflejar el schema real:

| Doc maestro dice | Schema actual usa | Equivalencia |
|---|---|---|
| `users` | `users` + `coaches` + `athletes` | Split intencional para multi-tenant coach-atleta |
| `onboarding` | Campos en `athletes.profile_json` + intake tables | Sin tabla dedicada, datos dispersos por flujo |
| `training_blocks` | `templates` con multi-block (block_position en template_segments) | Templates atómicos del doc = `templates`. Multi-block schema nuevo soporta sesiones compuestas. |
| `weekly_plans` | NUEVO en Fase 1a — entidad hija de microciclo (D1) | `weekly_plans` (status draft/published/archived, ia_propuesta bool, aprobado_por, shared bool). |
| `sessions` | `workout_assignments` (runtime) + `templates` (catálogo) | Sesión en doc = workout_assignment con su template_id. |
| `session_logs` | `workout_executions` | Renombrar en doc v1.1 — el schema gana. |
| `race_results` | `race_results` ✓ | Match exacto. |
| `chat_messages` | `chat_messages` ✓ | Match exacto. |
| `subscriptions` | NUEVO en Fase 1b | Schema añadirse en Fase 1b (Stripe integration). |

---

## 5. Roadmap por Fases

### Fase 0 — Alineación + decisiones (1-2 semanas)
**Objetivo:** cerrar D1-D6 (decisiones P0), congelar nomenclatura, actualizar Documento Maestro con reconciliación arquitectónica.

**Entregables:**
- Documento Maestro v1.1 con sección "Reconciliación arquitectónica" añadida (microciclo, 10 grupos)
- Plan de implementación firmado por los tres socios
- Stripe account creado, Garmin Partner application enviada

**Responsable:** Fundador + Alex (Programador)

### Fase 1a — Modalidad Dobles + RGPD mínimo + Chat backend + Plan session detail + tests/observabilidad (5-7 semanas)
**Objetivo:** soporte data model Dobles + RGPD operativo + cerrar los 3 bloqueantes iOS más graves (Chat real, detalle sesión, RGPD UI) + nuevas capacidades C31/C32/C35 + base de tests y Sentry desde el día 1 (D17).

**Entregables backend (Alex):**
- Migración schema: `users.partner_id`, `box_member`, `idioma`, `box_class_schedule` (JSON — C31); `subscriptions.partner_id`, `stripe_customer_id`; flag `shared` en weekly_plans; `sessions.station_assignment` (JSON — C32); `sessions.partner_visibility` ENUM (C35/D16)
- Flow invitación Dobles (email link), creación segunda cuenta sin pago, cancelación cascada
- Endpoints chat real: `GET /api/chat/threads`, `GET /api/chat/threads/:id/messages`, `POST /api/chat/threads/:id/messages` (con persistencia). Polling o SSE para nuevos mensajes.
- **Expandir `/api/athlete/plan/week`** o nuevo endpoint `/api/athlete/assignments/:id/detail` que devuelva blocks + items + params (series/reps/pesos/RPE/ritmos/notas coach) para cada sesión
- Endpoints RGPD: `GET /api/athlete/export-data` (JSON con todo: profile + workouts + carreras + chat + check-ins) + `DELETE /api/athlete/account` (soft delete + scheduled hard delete a 30 días)
- Coach: filtro "modalidad: Individual / Dobles / Pro" en Atletas; chat coach por atleta con UI list de threads
- **C31 calendario boxes Pablo:** IA Pablo Compose lee `users.box_class_schedule` en system prompt para no añadir entrenos solapados
- **Tests (D17):** setup Vitest unit (libs críticas: weekly-evaluation, pablo-ia-context, monthly-block-proposal, instantiate-program, Stripe webhook stub) + Playwright happy paths (signup → onboarding → primer plan, Dobles invitación, RGPD export+delete). CI Vercel bloquea merge si fail.
- **Observabilidad (D17):** Sentry web + iOS SDK instalados, logging estructurado en endpoints críticos

**Entregables iOS (sesión iOS paralela — gaps iOS-1, iOS-2, iOS-4):**
- **iOS-1:** Reescribir `ChatView` para consumir endpoints reales (no `ChatMessage.seed` local). Persistencia + lectura histórico + envío real. ChatService nuevo + polling/refresh.
- **iOS-2:** Expandir `PlanService.AthleteWeekDaySession` o llamar nuevo endpoint `/api/athlete/assignments/:id/detail`. Refactor `PlanView` para mostrar **series/reps/pesos/RPE/ritmos reales** en lugar de mock `warmup:[], zones:[], coachNote:nil`.
- **iOS-4:** Settings nuevos en Profile: "Exportar mis datos" (descarga JSON) + "Eliminar cuenta" (confirm con texto destrucción).
- Pantalla "Tu compañero/a" en Profile (Dobles) + sesiones con badge "Con [nombre]".
- **C32 reparto estaciones Dobles:** UI atleta marca sus estaciones del día en sesiones HYROX Dobles (lee `sessions.station_assignment`).
- **iOS XCTest smoke:** navegación principal Today/Plan/ActiveWorkout/PostWorkout; sync HealthKit smoke.

**Responsable:** Alex (backend + coach UI), iOS session (iOS UI)

### Fase 1b — Pagos Stripe + iOS Profile (3-4 semanas, en paralelo con 1a posible)
**Objetivo:** suscripciones Individual + Pro funcionando end-to-end. Dobles requiere 1a primero. Resuelve iOS-8.

**Entregables backend / coach:**
- Stripe products + prices configurados (Individual 70€/mes, Pro 95€/mes, Dobles 115€/mes)
- Webhook receiver `/api/stripe/webhook` (subscription.created/updated/deleted, invoice.payment_failed)
- UI coach: alerta "Pago fallido" en NotificationBell + estado suscripción en ficha atleta
- Métricas coach: MRR + churn mensual + altas + renovaciones próximas (nueva ruta `/es/metricas` en dashboard)
- Tests: stripe-cli para simular eventos
- Endpoint `PUT /api/athlete/profile` (edición datos atleta)
- Endpoint `GET /api/athlete/subscription` (estado suscripción)

**Entregables iOS (sesión iOS — gap iOS-8):**
- Flow checkout iOS: deep link a Stripe Checkout → callback → activa cuenta
- Profile UI: edición datos personales (nombre, email, idioma, modalidad si cambia)
- Profile UI: pantalla "Mi suscripción" (estado, próximo cobro, modalidad, cancelar)

**Responsable:** Alex (backend + Stripe), sesión iOS (UI Profile + checkout flow)

### Fase 1c — Push notifications + verificación HealthKit + bilingüe ES+EN + pulido beta (3 semanas)
**Objetivo:** producto presentable para beta cerrada con atletas de los boxes de Pablo. Resuelve iOS-3 e iOS-5.

**Entregables:**
- **iOS-3 Push notifications APNS:**
  - `UNUserNotificationCenter` setup + registration de device token en backend (`POST /api/devices/register`)
  - Tipos: plan publicado (sábado), recordatorio diario entreno, mensaje chat nuevo, renovación 7 días, pago fallido
  - Handler tap → deep link a pantalla relevante (Plan / Chat / Suscripción)
  - Backend: trigger desde notificaciones existentes en BD + envío vía APNS
- **iOS-5 HealthKit end-to-end verificación:**
  - Smoke test simulador: aceptar permisos → datos sintéticos en Health → confirmar rows aparecen en `biometric_streams`
  - Fix de cualquier issue de auth Bearer / Zod / dedupe que aparezca
  - Documentar en CLAUDE.md el procedimiento
- **Cron Vercel** domingo noche: evaluación semanal automática para todos los atletas con mes activo + propuestas IA listas para Pablo el lunes (sustituye el botón lazy "Evaluar semana")
- UI coach: verificación visual Stitch screenshots de las 4 surfaces (Atletas, Review, Ficha, Programación)
- Auditoría exhaustiva Onboarding iOS vs los 7 campos exactos del doc (verificar mapping a BD coach)
- **D13 Bilingüe ES+EN desde día 1:** i18n next-intl completar todo el contenido coach + iOS strings catalog ES+EN. Plan en idioma del atleta. +1 semana de trabajo dedicada.

**Responsable:** Alex + iOS session

### Fase 2 — Catálogo, vídeos, análisis HYROX, multi-idioma + remate iOS (6-8 semanas)
**Objetivo:** producto "completo" en contenido y diferenciadores. Resuelve iOS-6, iOS-7, iOS-9, iOS-10.

**Entregables backend / coach:**
- Pablo crea **80+ sesiones adicionales** clasificadas en los 10 grupos metodológicos (sesiones de Pablo desde su archivo)
- Schema `exercises.video_url` + UI upload (Vercel Blob o Cloudflare R2)
- Tabla `hyrox_benchmarks` cargada con datos público (HYROX Pro Series + Open avg) + helper análisis splits por división
- Endpoints `/api/stats/history`, `/api/stats/running`, `/api/stats/hr`, `/api/stats/hyrox` con datos reales agregados
- Bilingüe ES+EN: traducir UI completa coach + planes en idioma del atleta (campo `notes` traducido por LLM en background)
- Panel métricas negocio coach con MRR/churn/altas/cancelaciones/renovaciones
- Trigger de cambio de microciclo → el atleta ve el nombre que puso el coach
- **C33 IA Q&A ejercicios:** endpoint `POST /api/athlete/ai/exercise-question` + guardrails (solo ejecución técnica, planificación/salud deriva al coach).
- **C34 duplicar semana de otro atleta:** botón "Duplicar de…" en wizard + selector atleta + clona slots_json.
- **C31 refinamiento calendario boxes:** mejor UI Profile para mantener calendario clase del box.

**Entregables iOS (sesión iOS):**
- **iOS-6 Garmin OAuth nativo:** flow `/api/garmin/connect` + safari view + callback handler in-app. Sync pipeline funcional.
- **iOS-7 Stats real:** sustituir `StatsView.mock` por fetch a `/api/stats/*`. Histórico semanas con resultados reales.
- **iOS-9 Race results form completo:** 8 estaciones (SkiErg, Sled Push, Sled Pull, Burpee Broad Jump, Rower, Farmer Carry, Sandbag Lunge, Wall Balls) + 8km splits + RoxZone + división. POST `/api/athlete/race-results` con payload completo. Vista post-carrera con comparación benchmarks.
- **iOS-10 Macro fase label:** mostrar tipo bloque (Acumulación/Intensificación/Tapering) además de la fase.
- iOS render vídeo en detalle sesión (AVPlayer).
- **C33 UI iOS:** botón "Pregunta a Pablo IA" en detalle ejercicio.

**Responsable:** Pablo (contenido sesiones), Alex (técnico backend), sesión iOS (UI atleta vídeos+carreras+Garmin+Stats real)

### Fase 3 — Captación + box_member + flow videollamada (2-3 semanas)
**Objetivo:** flow comercial completo.

**Entregables:**
- Landing pública web (`/`, `/precios`, `/dobles`, `/pro`) con CTAs a videollamada
- Embed Cal.com o Calendly para reserva videollamada
- Flag `intake_call_completed` en users + estado coach "Videollamada pendiente / Hecha / No interesado"
- Código descuento Stripe Coupon para box_member (precio especial Pablo)
- Email transaccional (Resend): bienvenida, plan publicado semana, renovación 7 días, pago fallido
- Estrategia Instagram/TikTok contenido (operativa fuera del código pero documentar)

**Responsable:** Fundador (landing + estrategia), Alex (técnico)

### Fase 4 — Android nativo (12-16 semanas)
**Objetivo:** paridad iOS en Android.

**Entregables:**
- Kotlin native app
- Auth: Sign in with Google + Apple (App Stores requirements)
- Health Connect equivalente a HealthKit
- Garmin/Polar/Strava OAuth con activity types Android
- Push: FCM
- UI completa (onboarding, today, plan, active workout, stats, chat, profile)

**Responsable:** Programador iOS o contratado Android dev

### Fase 5 — Escalabilidad multi-coach + DEKA + internacional (8+ semanas, post-launch)
**Objetivo:** soporte producto a múltiples coaches + expansión.

**Entregables:**
- Admin panel: crear coaches, asignar atletas, gestionar permisos
- DEKA FIT como disciplina con peso propio en catálogo (mientras tanto está como categoría dentro de HYROX)
- Internacionalización beyond ES+EN (FR, IT, DE)
- Licencia white-label a otros coaches/boxes HYROX España

**Responsable:** Equipo

**Total Fase 0→1c (a beta cerrada): ~12 semanas reales** (vs 6 sem optimistas v1). Total a launch público (Fase 0→3): ~17-21 semanas.

---

## 6. Riesgos y Bloqueantes

| Riesgo | Mitigación |
|---|---|
| **Garmin Partner approval** tarda semanas | Aplicar en Fase 0 ya. Mientras tanto, Polar y Strava OAuth pueden cubrir parcial. |
| **Stripe Dobles complejo** (1 sub, 2 customers) | Validar con Stripe support antes de implementar. Posible workaround: 1 customer compartido + metadata. |
| **80+ sesiones catálogo** depende de Pablo | Bloquea Fase 2. Empezar en Fase 0 incluso (Pablo va aportando). |
| **Vídeos calidad pro** requieren grabación dedicada | Subcontratar 1 día estudio o iPhone + iluminación básica al inicio. Iterar calidad después. |
| **Modelo IA cambia** y rompe wiring | Wiring genérico OpenRouter-compatible — swap es 1 env var. Bajo riesgo. |
| **Estructura legal autónomo vs SL** afecta fiscalidad pagos | Cerrar D10 antes de Fase 1b. |
| **Lazy v1 motor semanal** sin cron → Pablo se olvida de evaluar | Cron Vercel viernes 23:59 + lunes 09:00 en Fase 1c. |
| **HealthKit datos no fluyen** (0 rows hoy en `biometric_streams`) | Sesión iOS paralela verifica end-to-end con simulador + datos sintéticos. |
| **Migración data Dobles** sobre usuarios existentes | No hay usuarios reales todavía — sin riesgo. |

---

## 7. Por dónde atacar HOY

### Acciones inmediatas (post-debate viernes)
1. **Decisiones del viernes** (D1-D17) ya cerradas. Solo pendiente D10 (legal con asesor).
2. **Fundador**: agendar asesor legal/fiscal esta semana; Apple Developer Account (99€/año) creado; verificar disponibilidad dominios FAHYBRID + handles redes sociales + App Store.
3. **Pablo**: arrancar batch sesiones (objetivo 20/sem, 80+ total en 4 sem); definir campos exactos del "calendario clase del box" (C31).
4. **Alex (programador)**: arrancar Fase 1a (Dobles + RGPD + Chat backend + Plan detail + tests setup + Sentry); Garmin Partner application enviada; Stripe account creada (sin productos todavía).

### Acciones de Pablo (paralelo, no técnico)
- Empezar a documentar las **80+ sesiones adicionales** de su archivo. Estructura: nombre + grupo metodológico (1-10) + bloques + ejercicios + parámetros. Cualquier formato (Notion, Google Docs, plantilla) que después se importe.
- Grabar primer batch de **vídeos ejercicios** (15-30s) con iPhone + iluminación. Empezar por los 30 ejercicios más usados.
- Decidir nomenclatura definitiva atleta-facing (el nombre que pone el coach) y validarla con 3-5 atletas reales del box.

### Acciones del Fundador (paralelo, no técnico)
- **Asesor legal/fiscal** para D10 (estructura del negocio).
- **Cuenta Stripe** + datos fiscales registrados.
- **Identidad visual final** + brand book completo para Pablo y atletas.
- **Landing page** redactada (copy) — Alex la implementa después.

---

## 8. Operativa de Producción

Aspectos operacionales que el doc maestro y el plan v1 no cubrían:

### 8.1 Tests automatizados (desde Fase 1a, D17)
- **Vitest unit** para libs críticas: `weekly-evaluation`, `pablo-ia-context`, `monthly-block-proposal`, `instantiate-program`, Stripe webhook handler.
- **Playwright happy paths**: signup → onboarding → primer plan; Stripe checkout completion; Dobles invitación + activación segundo atleta; RGPD export + delete.
- **iOS XCTest**: navegación principal Today/Plan/ActiveWorkout/PostWorkout; sync HealthKit smoke.
- CI: Vercel auto-runs en cada PR. Bloquea merge si fail.

### 8.2 Observabilidad
- **Sentry** web + iOS (free tier OK al inicio). Capture errors + warnings.
- **Logging estructurado** en endpoints críticos (Stripe webhooks, sync HealthKit, IA propose).
- **Métricas LLM** (telemetría coste tokens/atleta/mes) — Sentry custom o tabla `llm_invocations`.
- Cron Vercel monitoreado: alertas si falla evaluación semanal.

### 8.3 Soporte cliente
- Email transaccional: `hello@fahybrid.com` con respuesta SLA 24h business days.
- Tickets in-app: futuro Fase 3 con Intercom o similar.
- FAQ web mínimo en `/ayuda` antes del lanzamiento (Fase 3).

### 8.4 Backup + Disaster Recovery
- Neon Postgres: backups automáticos del proveedor (verificar RPO/RTO con Neon).
- Política: snapshot diario, retención 7 días mínimo.
- Test de restore: simular en branch staging trimestralmente.

### 8.5 Apple Developer Account + TestFlight (bloqueante Fase 1c)
- Apple Developer Program: 99€/año (Fundador).
- Apple Push Key + APNS certificate (en Fase 1c).
- TestFlight: internal testers (Pablo + Fundador + Alex + 1-2 atletas piloto), external beta (atletas boxes Pablo) — máx 10k.
- App Store Connect listing: nombre, ícono, screenshots, descripción ES+EN, política privacidad (URL).

### 8.6 Telemetría costes LLM
- Tracking por atleta y mes: tokens prompt + completion + caché.
- Con DeepSeek v4 Flash (~$0.0006/propuesta) y volumen estimado (~5 atletas × 1 propuesta semanal = 20/mes), coste inicial ~$0.012/mes. Despreciable.
- Monitor activo a partir de 30 atletas: límite suave $30/mes total. Re-evaluar modelo si pasa.

---

## 9. Estado pendiente del Documento Maestro

El doc v1.0 tiene secciones marcadas "por definir" (sección 19). Quedan abiertas:
- Nombre del proyecto definitivo
- Modelo de pago exacto (mensual/trimestral/bloque 12 semanas)
- Precios definitivos
- Estructura legal
- Retribución socios
- Inversión inicial
- Fecha objetivo MVP
- Precio especial boxes
- Política cancelación Dobles (revisar excepciones)
- Diseño visual brand book completo

**Recomendación:** un Doc Maestro v1.1 que incluya:
- Sección 4.x de este plan (reconciliación arquitectónica)
- Decisiones cerradas en Fase 0
- Estimación temporal por fase
- Estado de avance trimestral

---

**Versión 1.0 · 2026-05-27 · ALEX/FAHYBRIK**
*Próxima revisión: tras cerrar decisiones P0 (D1-D6) → plan v1.1*
