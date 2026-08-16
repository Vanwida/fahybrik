# Auditoría FAHYBRID — Backlog de Findings
**Fecha auditoría: 2026-05-28 · 4 auditorías paralelas (UI/UX · Seguridad/RGPD · Code Quality/Tests · Discrepancias/Ops)**

> Documento de backlog. Cada finding tiene: ID, descripción, archivo/evidencia, severidad, sprint asignado, estado. Se ataca y se marca `[x]` conforme se cierra.

---

## 🚨 CRÍTICOS — bloquean producción / Fase 1b

- [x] **K1 · Demo coach login ON por default**
  `isCoachDemoLoginEnabled()` devuelve `true` si `COACH_DEMO_LOGIN !== 'false'`. Cualquiera que llame `POST /api/auth/demo-login` en prod obtiene sesión coach completa de Pablo si la env no está explícitamente a `false`. `.env.example` trae `COACH_DEMO_LOGIN=true`.
  - Archivos: `web/lib/auth/demo-login.ts:13-15`, `web/app/api/auth/demo-login/route.ts:12-30`, `.env.example:13`
  - Fix: invertir default → `process.env.COACH_DEMO_LOGIN === 'true'`. `.env.example` a `false`. Bloquear endpoint si `NODE_ENV === 'production'` salvo override explícito.
  - CVSS ~9.8 · Sprint W6.5

- [x] **K2 · Apple Sign-In account linking sin `email_verified`**
  `findOrCreateAthleteForApple` enlaza nuevo `apple_user_id` a `users` pre-existente si el email coincide, sin chequear `email_verified` ni que el user previo fuese Apple. Posible takeover.
  - Archivo: `web/lib/auth/users.ts:89-117`
  - Fix: requerir `identity.email_verified === true` antes del link, o eliminar match-by-email y forzar creación nueva si `apple_user_id` no existe.
  - CVSS ~8.1 · Sprint W6.5

- [x] **K3 · XSS en email de invitación partner**
  `inviterLabel` (del `full_name` que el atleta controla) se interpola SIN escapar en el HTML del Resend (`<strong>${inviterLabel}</strong>` + subject). Injection de `<img onerror>` / phishing.
  - Archivo: `web/lib/partner/email.ts:53,62`
  - Fix: escapar HTML o usar template con escaping por defecto (React Email/mjml).
  - CVSS ~7.1 · Sprint W6.5

- [x] **K4 · Chat upload sin ownership check**
  `POST /api/chat/upload` con principal coach toma `athlete_id` del form-data y escribe a `chat/<athlete_id>/...` SIN verificar que ese atleta pertenece a la cohort del coach.
  - Archivo: `web/app/api/chat/upload/route.ts:51-57`
  - Fix: `select 1 from athletes where id=$1 and coach_id=$2` antes de aceptar `athlete_id`.
  - CVSS ~6.5 · Sprint W6.5

- [x] **K5 · iOS Chat sigue local-only**
  `ChatView` carga de `ChatMessage.seed` estático; envío hace `append` local. Backend completo desde W2 sin cablear. Comentario explícito línea 6: "appends locally only (no backend wire)".
  - Archivo: `ios/FAHYBRIK/Chat/ChatView.swift:6,8,29-34`
  - Fix: ChatService nuevo consumiendo `/api/chat/threads/*` + polling.
  - Bloqueante Fase 1a · Sprint W6.5

- [x] **K6 · iOS push notifications (APNS) 0% implementado**
  Cero referencias a `UNUserNotificationCenter`, `registerForRemoteNotifications`, handler. Backend tiene `apns_push_tokens` + `/api/devices/register` listos.
  - Archivo: global iOS
  - Fix: APNS setup + registration + handler + deep link tap.
  - Bloqueante · Sprint W6.5 o Fase 1c (ya planificado 1c)

- [x] **K7 · Atleta iOS NO ve el nombre del microciclo del coach (D2)**
  0 ocurrencias del nombre de fase del coach en `ios/FAHYBRIK`. Sigue mostrando códigos de catálogo crudos. Contradice decisión D2.
  - Archivos: `ios/Profile/ProfileView.swift:395,670,677-689`, `ios/Onboarding/Steps/HyroxStationsStep.swift:14`, `ios/Today/TodayDemoData.swift:12`, `ios/Plan/PlanView.swift:322`
  - Fix: pintar el nombre que el coach dio al microciclo.
  - Sprint W6.5

- [x] **K8 · Repo entero FAHYBRIK, producto FAHYBRID**
  Bundle id `pro.aistudios.vanwida.fahybrik`, paquetes `@fahybrik/*`, carpetas `ios/FAHYBRIK*`, `.env.example` dominios `fahybrik.com`. `ios/project.yml`: 21× FAHYBRIK / 10× FAHYBRID. Solo display-name + copy cara-usuario está en FAHYBRID.
  - Archivos: `ios/project.yml`, `coach/package.json`, `web/package.json`, `.env.example`, folders
  - Fix: rename cross-cutting masivo (bundle id, paquetes npm, folders, env). Bloquea App Store listing.
  - Sprint W6.6 dedicado (cross-cutting, requiere cuidado)

- [x] **K9 · iOS botón primario falla WCAG AA**
  `accentOn = .white` sobre `#F06A2A` = 3.09:1 (requiere 4.5:1). Coach usa `#511900` brown = 4.57:1 OK. Botones primarios iOS fallan + divergen del coach.
  - Archivo: `ios/FAHYBRIK/Theme/Theme.swift:17`
  - Fix: cambiar iOS `accentOn` a brown `#511900` (paridad + a11y).
  - Sprint W6.5 (fix trivial alto ROI)

---

## ⚠️ ALTOS — Fase 1c (antes beta cerrada)

- [x] **A1 · Rate limiting ausente** en endpoints sensibles (magic-link `/api/auth/email`, Apple sign-in, partner invite/redeem, AI suggest-week/-workout, export-data, chat send, devices/register). Permite enumeración emails, brute-force tokens, agotamiento LLM budget, spam.
  - Fix: helper `withRateLimit` table-based (no Redis en stack). Tabla `rate_limit_buckets` (migración `0025`), fixed-window upsert atómico, fail-open en error de BD. Helper en `web/lib/security/rate-limit.ts` con `RATE_LIMITS` centralizados. Aplicado por ip/user/coach/athlete en los 8 endpoints. Tests: `web/tests/security/rate-limit.test.ts`.

- [x] **A2 · Partner redeem race condition** — `redeemInvitation` lee→chequea→update sin `select for update`. Dos requests concurrentes mismo token → doble-link. No hay unique en `users.partner_id`.
  - Archivo: `web/lib/partner/invitations.ts:272-322`, `infra/migrations/0021:32`
  - Fix: `for update` en el SELECT inicial de la invitation dentro de la tx (`invitations.ts`) + unique partial index `users_partner_id_unique on users(partner_id) where partner_id is not null` (migración `0026`, CREATE INDEX CONCURRENTLY fuera de transacción vía `apply_0026.ts`). Tests: `web/tests/security/redeem-lock.test.ts`.

- [x] **A3 · Chat attachments Vercel Blob `access: public`** — security by obscurity, URL filtrable.
  - Archivo: `web/lib/chat/upload.ts:99-104`
  - Fix: `access: 'private'` + endpoint autenticado `GET /api/chat/attachments/[...path]` que (1) resuelve el principal (coach cookie / atleta bearer), (2) extrae el `athlete_id` del pathname `chat/<id>/<yyyy>/<mm>/<file>`, (3) verifica ownership (atleta = su propio id; coach = atleta en su cohort), (4) redirige a signed URL temporal de Vercel Blob (`getDownloadUrl`, TTL 5 min) o streamea de disco en dev. El `attachment_url` almacenado ahora apunta al proxy autenticado, nunca a la URL pública del blob. Tests: `web/tests/chat/attachment-path.test.ts`.
  - **iOS — cambio requerido:** el campo `attachment_url` de los mensajes de chat ahora es una URL del proxy (`<APP_URL>/api/chat/attachments/...`), NO una URL pública de blob. iOS debe **enviar el header `Authorization: Bearer <token>`** al hacer GET de adjuntos (igual que el resto de endpoints atleta). La petición devolverá un `302` a una signed URL temporal — el cliente HTTP de iOS debe **seguir el redirect**. Para vídeo/audio en `AVPlayer`, usar un `AVURLAsset` con `AVURLAssetHTTPHeaderFieldsKey` para inyectar el bearer, o resolver la signed URL primero (GET sin descargar el cuerpo) y pasar esa URL final a `AVPlayer`. Para imágenes, descargar con `URLSession` + bearer y dejar que siga el redirect.

- [x] **A4 · Sentry web NO instalado** + 0 captures en route handlers. `@sentry/nextjs` solo en coach. 120 routes web sin error tracking. `lib/observability/capture.ts` web es no-op.
  - Fix: instalar `@sentry/nextjs` en web + wirear next.config + captures en endpoints críticos.

- [x] **A5 · `.env.example` masivamente incompleto.** Vars usadas en código no documentadas:
  `APNS_BUNDLE_ID/KEY_ID/PRIVATE_KEY/TEAM_ID`, `STRIPE_SECRET_KEY/WEBHOOK_SECRET/PRICE_ID/PORTAL_RETURN_URL/CHECKOUT_SUCCESS_URL/CHECKOUT_CANCEL_URL`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_APP_URL/ENV`, `GARMIN_WEBHOOK_SECRET`, `COACH_DEMO_EMAIL`, `LLM_CHAT_API_KEY/MAX_TOKENS/MAX_TOKENS_WEEK/MAX_TOKENS_WORKOUT/TIMEOUT_MS`, `LLM_MODEL`, `LLM_AZURE_API_VERSION`, `UPLOADS_DIR`.
  - Fix: completar `.env.example` + corregir branding fahybrik.com → fahybrid.com.

- [x] **A6 · Migration numbering corrupto** — 2× `0005`, 2× `0012`, falta `0022`. Sin tabla migration tracking (`schema_migrations`). Aplicación manual sin journal.
  - Fix: tabla migration journal + renumerar/documentar conflictos.

- [x] **A7 · LLM cost tracking no existe.** 0 referencias a `llm_invocations/tokens_used/prompt_tokens`. Sin telemetría coste por atleta/mes. Bill shock risk al escalar.
  - Fix: tabla `llm_invocations` + helper de tracking. Plan §8.6.

- [x] **A8 · `methodology_groups` tabla nunca creada (D3).** 0 referencias a `methodology_group_id`. Catálogo sin clasificación pedagógica de los 10 grupos del doc.
  - Fix: migración tabla + columna `templates.methodology_group_id` + UI filtro coach.

- [x] **A9 · iOS a11y fails** — Dynamic Type 0% (0 usos `@ScaledMetric`/`dynamicTypeSize`, 311 `Font.system(size:N)` fijos). Button labels 12/69 (83% sin `accessibilityLabel`). Chat icon buttons sin VoiceOver labels.
  - Archivos: global iOS, `Chat/ChatView.swift:81-110`
  - Fix: wrapper `Text` con `Theme.Typography` + Dynamic Type; añadir accessibilityLabel a botones.

- [x] **A10 · Web/coach drift** en `weekly-evaluation.ts` (web 126 líneas vs coach 445, shapes distintos: web devuelve `auto_advance`, coach no) y `macro-progress.ts` (web 150 vs coach 349). iOS consume web, dashboard consume coach → pueden calcular distinto.
  - Fix: mover a `shared/coach/`.

- [x] **A11 · 29 archivos duplicados web↔coach** (verdict-rules, pablo-ia-context, programming-status, monthly-block-proposal, instantiate-program, planner, transitions, dates, capture…). Cambio cross-cutting = tocar X2 o drift.
  - Fix: extraer a `shared/coach/` progresivamente.

- [ ] **A12 · iOS Stats sigue mock** (C3 ✗). `StatsView.mock`, no hay endpoint `/api/stats/*`.
  - Fix: endpoints stats + fetch real (ya planificado Fase 2).

- [x] **A13 · Phase labels EN/ES split en coach** — `MicrocycleDetailDrawer` muestra labels EN vs resto coach ES. 2 mapas duplicados divergentes.
  - Archivos: `MicrocycleDetailDrawer.tsx:19` vs `MicrocycleEditor.tsx:72`
  - Fix: consolidar PHASE_LABELS en `shared/`.

- [x] **A14 · No invalida partner_id al borrar cuenta** — `softDeleteAccount` no hace `update users set partner_id = null where partner_id = X`. Partner queda con FK a row deleted.
  - Archivo: `web/lib/athlete/account-deletion.ts:55-136`

- [x] **A15 · CSRF coach mutations sin Origin check** — cookie `SameSite=Lax` protege la mayoría pero sin doble defensa.
  - Archivo: `web/lib/auth/coach-session.ts:67`
  - Fix: helper `web/lib/security/csrf.ts` (`assertSameOrigin(req)` method-aware + `isAllowedOriginHeader` header-only). Chokepoint DRY en `getCoachSession()`: si llega un header `Origin` que no matchea `APP_URL`/`NEXT_PUBLIC_APP_URL` se descarta la sesión (cubre TODAS las rutas coach uniformemente — el navegador adjunta `Origin` a toda mutación cross-origin). Además `assertSameOrigin(req)` explícito (method-aware, rechaza también mutación sin Origin) en las 2 rutas AI (mayor valor: presupuesto LLM). Bearer endpoints (atleta) no lo necesitan (no usan cookies). Tests: `web/tests/security/csrf.test.ts`.

- [x] **A16 · 403 vs 404 fuga existencia** en deep-dive coach (`AthleteDeepDiveError forbidden → 403`).
  - Archivos: `web/app/api/coach/athletes/[id]/route.ts:35`, `.../notes/route.ts:57`
  - Fix: devolver 404 también para forbidden.

- [x] **A17 · Stripe price IDs single-tier** — solo `STRIPE_PRICE_ID` único, plan dice 3 tiers (Individual/Dobles/Pro). Falta `STRIPE_PRICE_ID_DOBLES`, `_PRO`.
  - Bloquea cobro 3 modalidades.

---

## 📋 MEDIOS — Fase 2 polish

- [x] **M1 · Tipografía ad-hoc** — 25 usos `font-display text-Xxl font-black` vs 15 con escala nombrada (`.font-display-xl/headline-lg`). Archivos: `AthletesList.tsx:126`, `MicrocycleDetailDrawer.tsx:121,176,188,224`, `AthleteFichaView.tsx:195,211,225`.
- [x] **M2 · HR zones colores divergentes** web (`text-emerald/amber/red-XXX` hardcoded) vs iOS `ZoneColors`. Z1/Z2 difieren. Archivo: `StudioDetailPanel.tsx:861-867`.
- [x] **M3 · `--bg` divergente** web `#131313` vs iOS `#0A0A0A`. Decidir converger.
- [x] **M4 · `data-export.ts` 14 queries seriales** sin `Promise.all`. Riesgo timeout serverless. Archivo: `data-export.ts:236-391`.
- [x] **M5 · Export incluye `sender_user_id` Pablo** (PII coach). Archivo: `data-export.ts:330-347`.
- [x] **M6 · Cron solo en web**, coach sin `vercel.json` crons. Falta cron publicación sábado + evaluación lunes + recordatorios.
- [ ] **M7 · benchmark HYROX `hyrox_benchmarks` global table no existe** (solo `athlete_benchmarks`). C20.
- [x] **M8 · Tests cobertura real ~40%** — mucho mock SQL "teatro" (`data-export.test.ts` con array scripted). 0 tests para instantiate-program, weekly-evaluation server, macro-progress, LLM fallback, HealthKitSyncService. E2E Playwright con `test.skip` silencioso si demo-login off.
- [x] **M9 · `subscriptions` vs `stripe_subscriptions` coexisten** — decidir source of truth.
- [x] **M10 · `onboarding/submit` con `.passthrough()`** acepta payload arbitrario → atleta puede inflar `intake_notes_json` con MB. Archivo: `onboarding/submit/route.ts:22,66-70`.
- [x] **M11 · Headers seguridad faltantes** (`Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`).
- [x] **M12 · `partner_invitations.token` sin hashear** (a diferencia de magic_link_tokens). DB comprometida → tokens vivos redimibles. Archivo: `0023:19`.
- [x] **M13 · Cron expiración invitations** — no hay runner que mueva pending expirados a `expired`.
- [x] **M14 · Chat upload sin Content-Length early check** — `req.formData()` carga todo a memoria. DoS upload grande. Archivo: `chat/upload/route.ts:32`.
- [x] **M15 · Garmin webhook descifra toda la tabla** `garmin_oauth_tokens` por webhook. Añadir `access_token_sha256` indexado. Archivo: `garmin/webhook/route.ts:62-77`.
- [ ] **M16 · `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`** no habilitados en web/coach tsconfig (shared sí). `rows[0]!` no-null-asserted son trampas.
- [x] **M17 · DateTime UTC vs Madrid** — `dates.ts` dice "all UTC" pero coach editando 23:30 CET cae en next UTC day → workout desplazado. Decidir/documentar.
- [x] **M18 · iOS `as!` / `try!` en paths críticos** — `APIClient.swift:59,145` `Empty() as!`; `RequestQueue.swift:22`, `WorkoutStateStore.swift:26` `try! FileManager`. Crash potencial.
- [x] **M19 · `pdf-parse@1.1.1`** vulnerabilidades históricas, casi no mantenido. Candidato swap `pdfjs-dist`.
- [x] **M20 · `lucide-react@^1.14.0`** versión muy antigua (actual 0.450.x) — verificar lib correcta.
- [ ] **M21 · Bigint→Number coerciones** (`${userId as unknown as number}`) rompen tras 2^53 IDs. Deuda no urgente.
- [x] **M22 · `PartnerInfo.initials`** para nombre simple ("Pablo") devuelve "PA" no "P". Confirmar comportamiento.
- [x] **M23 · Bug `WorkoutBlock.configJson` camelCase vs snake_case** — `blockConfigSummary` silenciosamente roto para AMRAP/intervals/EMOM en iOS. `convertFromSnakeCase` no aplica al dict interno.
- [x] **M24 · DaySessionModal inputs sin label** (solo placeholder). `DaySessionModal.tsx:214,221,269,275`.
- [x] **M25 · focus:ring inconsistente** — solo 6 usos en todo coach.
- [ ] **M26 · iOS strings catalog incompleto** — 190 entradas, 191 `Text()` no localizados (ES hardcoded). EN parcial.

---

## 🟢 VERIFICADO OK (no tocar)

- SQL injection: 100% queries parametrizadas (postgres-js tagged). Único `unsafe()` sobre constante estática.
- Apple JWT verification server-side (jose + JWKS remoto, audience+issuer validados).
- Stripe + Garmin webhooks: signature HMAC timing-safe.
- Cookies coach: `HttpOnly + Secure(prod) + SameSite=Lax + path + expiry`.
- 100% endpoints coach con `getCoachSession`; 100% athlete con bearer. Sin-auth solo: auth/*, cron/* (secret), webhooks (signature), events GET (público).
- Magic link tokens: SHA-256 hash + atomic consume.
- Partner token: 32 bytes base64url (~256 bits) — brute-force inviable.
- Account deletion: soft (anonimiza email) + revoca sesiones + cron hard 30d con `for update skip locked`.
- Indices BD cubren queries hot (workout_assignments, chat_messages, notifications, biometric_streams).
- Type safety: 0 `as any`, 0 `@ts-ignore` en lib/app. Strict mode global.
- Transacciones: `instantiate-program.ts` usa `client.begin` correctamente.
- LLM calls: `AbortSignal.timeout` + fallback library + `parseJsonLenient`.
- Console.log: 0 en lib/app de prod.
- No secrets en `NEXT_PUBLIC_*` (solo APP_URL + SENTRY_DSN, seguros).
- DateTime: `parseIsoDate`/`isoDateString` UTC consistente, sin mix `new Date()` local.
- Schemas Zod en `shared/` strict — single source of truth iOS+web.
- iOS RequestQueue consistente en endpoints write. HealthKit anchor persisted per type.
- Contraste coach WCAG AA pasa (text-muted 5.24:1, accent 6.02:1, accent-on 4.57:1).

---

## Plan de ataque propuesto

### Sprint W6.5 — Hardening crítico (antes de Fase 1b)
K1, K2, K3, K4 (security críticos) · K9 (a11y iOS botones, trivial) · K5 (cablear iOS chat) · K7 (D2 pedagógico iOS) · A4 (Sentry web) · A5 (.env.example completo) · A14 (partner_id null on delete) · A16 (404 vs 403)

**Bloquea Fase 1b.** Sin K1 (demo-login backdoor) abrir Stripe = exponer app con puerta trasera.

### Sprint W6.6 — Rename FAHYBRIK→FAHYBRID (dedicado)
K8. Cross-cutting: bundle id + paquetes npm + folders + env + dominios. Cuidado. Bloquea App Store listing.

### Fase 1c (ya planificada) — absorbe:
K6 (APNS), A1 (rate limit), A2 (race), A3 (blob private), A6 (migrations journal), A7 (LLM cost), A8 (methodology_groups), A9 (iOS a11y), A13 (phase labels), A15 (CSRF), A17 (Stripe tiers)

### Fase 2 — absorbe:
A10/A11 (drift web↔coach → shared/), A12 (Stats real), todos los M1-M26.

---

**Generado: 2026-05-28 · 4 auditorías · FAHYBRID**
