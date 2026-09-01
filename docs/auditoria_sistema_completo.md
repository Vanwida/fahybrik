# Auditoría de sistema completo — FAHYBRIK

> Estado a 2026-05-30. Síntesis CTO de 10 auditorías por dimensión + hallazgos verificados adversarialmente contra código y Neon prod.

---

## 1. Veredicto

El sistema **no es "peor que una alpha" a nivel de ingeniería** — el núcleo (auth, seguridad, contratos, dashboard, iOS) está sorprendentemente bien construido, con typechecks limpios y 302 tests verdes. **Pero hoy NO es mostrable**, y por una razón distinta a la que parece: el problema no es código roto sino (a) **basura de pruebas asfixiando la DB de producción** (8 de 12 usuarios y 8 de 11 coaches son cáscaras de test), (b) **falta de datos sembrados** para el único atleta real, que hace que la demo iOS muestre pantallas vacías "tu coach aún no ha publicado tu plan", y (c) **un puñado de bugs de coherencia end-to-end** (chat roto por timestamps, KPIs fabricados, deep-links muertos) que un Pablo exigente detectaría en 30 segundos. La distancia a "mostrable" se mide en **horas de saneamiento de datos + ~6 fixes quirúrgicos**, no en semanas de reescritura.

---

## 2. Lo CRÍTICO — bloquea mostrarlo

Priorizado por impacto en una demo en vivo HOY.

### 2.1 — La demo iOS se ve VACÍA (datos, no código) · ALTA
- **Qué:** Hoy (lunes 1-jun) el atleta ve *"Tu coach aún no ha publicado tu plan"* en **Hoy** y **Plan**. La única asignación existe pero con `scheduled_for=2026-05-29`, fuera de la ventana de la semana actual que pide `/api/athlete/plan/week` (Mon–Sun). No existe "Plan Junio".
- **Evidencia:** `workout_assignments` = 1 fila (29-may); endpoint filtra `>=weekStart AND <=weekEnd` → 0 filas → 7 días `is_rest=true` → `PlanView.hasAnySession=false`.
- **Fix:** Sembrar asignaciones reales para el atleta 2 (coach 4) en la semana en curso. Producto: el endpoint debería caer a la próxima semana con datos, y el copy iOS distinguir "descanso" de "sin plan".

### 2.2 — Chat roto end-to-end por timestamps · CRÍTICA
- **Qué:** Toda la superficie de chat **no decodifica en iOS**. El backend serializa con Postgres `::text` (`2026-05-29 11:06:13.234292+00`) y el decoder iOS usa `.iso8601`, que **rechaza** ese formato (espacio en vez de `T`, microsegundos, `+00` sin colon ni `Z`).
- **Evidencia:** `chat/service.ts:117/128/185`, `chat/threads/route.ts:52` usan `::text`. Reproducido a runtime: `JSONDecoder.iso8601` lanza `dataCorrupted` sobre ese string. `ChatService.createdAt: Date` no opcional → todo el array lanza. Rompe en cuanto hay ≥1 mensaje (el caso normal).
- **Fix:** Backend `to_char(created_at,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` o `.toISOString()` (ya se usa en `auth/me`). Single source en backend para todos los consumidores.

### 2.3 — KPIs de la ficha del atleta FABRICADOS · ALTA
- **Qué:** En la cabecera de la ficha que ve el coach, **Fatiga/Carga inventa un valor TSS** (`value = (100-compliance_pct)+15`, constante mágica) pintado como `TSS/d` — no existe ninguna columna TSS en la DB. **Sueño miente sobre la fuente**: toma `checkin_sub_score` (genérico 0-100) y lo pinta como `(checkin/10)` con unidad `hrs`. Math roto: barra de progreso siempre llena, tono casi siempre "success".
- **Evidencia:** `AthleteFichaView.tsx:59-81`, montado live en `atletas/[id]/page.tsx:57`. Una pestaña más profunda (`AthletePerformanceView`) sí usa datos reales con guard.
- **Fix:** Eliminar ambos KPIs o sustituir por métricas reales etiquetadas honestamente; mostrar `—` sin dato en vez de derivar números plausibles. **El coach toma decisiones de carga sobre datos inventados.**

### 2.4 — Deep-link de TODO push roto · ALTA
- **Qué:** Tocar cualquier notificación (chat, plan publicado, HRV, carrera) **no navega a ninguna vista**. iOS enruta por `userInfo["type"]`; el backend nunca envía esa clave (usa `kind`/`screen`/`aps.category`).
- **Evidencia:** `PushManager.swift:200` es el único handler y lee solo `type`. `apns.ts:137` construye `{aps, ...deeplink}` sin `type` top-level. Doble fallo: aunque leyera `kind`, los valores tampoco casan con los rawValues del enum.
- **Fix:** Añadir `type:<kind>` top-level en `apns.ts` (usar el `category` que ya se pasa) o cambiar iOS a leer `aps.category`. Unificar shape `kind` vs `screen`.

### 2.5 — `notifications.payload_json` doble-encodeado · ALTA
- **Qué:** Se guarda como **string JSON** (no objeto) → `payload_json->>'kind'`/`'thread_id'` siempre NULL → **dedup/idempotencia roto** en triggers que sí están live (transition dispatch, disparado por Pablo) → notificaciones duplicadas. Rompe también lectores de analítica y deep-link.
- **Evidencia:** `dispatch.ts:49` `${JSON.stringify(payload)}::jsonb` con driver `postgres.js` re-serializa. `jsonb_typeof` en prod = `'string'`. Mismo patrón en **6 sitios** (`mass-adjustments`, `intake`, `partner/cascade`, `chat/service`, transition-dispatch).
- **Fix:** `${sql.json(payload)}` en los 6 sitios + backfill de la fila corrupta existente.

### 2.6 — "Invite-only" es un gate de cliente que falla-abierto · ALTA (seguridad)
- **Qué:** `/api/auth/apple` deja que **cualquier Apple ID** cree un atleta (`coach_id=NULL`) con sesión válida de 30 días, **sin invitación**. El único gate vive en iOS (`AuthState.swift:86 catch { accessGated=false }`, fail-open explícito) — trivial de saltar con cliente propio.
- **Matiz que baja de CRÍTICA a ALTA:** no hay fuga cross-tenant (un atleta `coach_id=NULL` no tiene datos que leer); el riesgo es registro no autorizado / cuentas fantasma. En el camino feliz de red el no-invitado SÍ ve el gate.
- **Fix:** Gatear server-side en `/api/auth/apple` (rechazar Apple IDs sin invitación pendiente) o forzar todo por `/api/athlete/invite/redeem` (que sí está bien hecho, fail-closed).

### 2.7 — IDOR sin auth en Garmin connect/callback · ALTA (seguridad)
- **Qué:** `/api/garmin/connect` y `/callback` toman `athlete_id` **solo del querystring, sin sesión**. Permite account-linking CSRF / contaminar ingesta de biometría de otro atleta.
- **Matiz:** hoy gated tras `loadGarminConfig()` (503 sin envs) y 0 filas → no explotable en el deploy actual, pero queda vivo en cuanto se activen las envs de Garmin.
- **Fix:** Derivar `athlete_id` de `getAthleteSessionFromBearer` (como hace `sync/healthkit`), ignorar el querystring.

### 2.8 — Modalidad Dobles de pago estructuralmente rota · CRÍTICA (latente)
- **Qué:** `subscriptions.partner_user_id` **nunca se escribe** en ningún path. Consecuencias deterministas en la PRIMERA compra Dobles real: (a) cascada de cancelación = código muerto, (b) el partner no obtiene fila → `subscribed:false` sin acceso, (c) el coach ve `null` para el partner.
- **Evidencia:** los 2 INSERT y todos los UPDATE a `subscriptions` omiten la columna; linking Dobles vive solo en `users.partner_id`. Falla **silenciosamente** (NULL, no error).
- **Estado:** latente (0 Dobles en prod hoy), pero se materializa al 100% en cuanto exista uno.
- **Fix:** Escribir `partner_user_id` (desde `users.partner_id`) en `upsertSubscription`/`ensureCheckoutSubscriptionRow`.

### 2.9 — Dos árboles de librería coach paralelos y divergentes · ALTA (deuda)
- **Qué:** `lib/coach/` (50 ficheros) y `lib/dashboard/coach/` (33) con 16 basenames solapados, **9 divergentes con drift semántico real** (`weekly-evaluation` 85 vs 427 líneas, `instantiate-program` 279 vs 529, `deep-dive-body` 528 vs 732). **Ambos importados en prod** (57 imports / 112 imports). Dos verdades de lógica core que ya divergieron.
- **Fix:** Elegir árbol canónico, mergear divergentes, reescribir imports. Viola DRY/single-source del CLAUDE.md.

### 2.10 — Fusión coach→web a medias y SIN COMMITEAR · ALTA (proceso)
- **Qué:** Todo `web/app/[locale]/` está **untracked** (`??`) mientras las rutas viejas `(coach)`/`templates` están borradas en disco pero no staged. Migración 0039 aplicada a mano a prod, sin commit ni registro en `schema_migrations`. 31 errores de ESLint reales (incl. bugs de React en `use-autosave` y `VideoUrlField`).
- **Fix:** Commitear el árbol nuevo, registrar 0039, arreglar los 2 lint-bugs de React.

---

## 3. Basura a limpiar (prod)

Datos de prueba inyectados ad-hoc contra Neon prod (sin origen en el repo). **Limpieza segura por footprint nulo verificado.**

| Item | Conteo | Acción |
|---|---|---|
| Users `*@fahybrik.test` (comp-test 28-may) | **8** (ids 7,8,13,14,20,21,25,26) | `DELETE FROM users WHERE email LIKE '%@fahybrik.test'` (cascada borra 8 coaches) |
| Coaches "Coach A"/"Coach B" basura | **8** (ids 5,6,8,9,10,11,12,13) | cae por cascade del anterior |
| Mes duplicado (`pro·Semana base` id11, sin refs) | 1 | `DELETE FROM program_month_templates WHERE id=11` |
| Subscription falsa `source='comp'` (Alex) | 1 | `DELETE` o re-crear con source legítima |
| Assignment + chat de coach-dev id14 sobre atleta de coach 4 | 2 filas | reasignar `created_by_coach_id`/`coach_id` a 4 (debris de test, no bug de acceso) |
| Coach demo `pablo@fabrik.training` sin contenido | 1 | decidir identidad canónica de Pablo (3 compitiendo) |
| Tokens/sesiones caducados | varios | cron de purga (higiene) |

**Resultado tras limpiar:** de 12 users → **3-4 reales** (vanwida coach, alexsole+coach coach, alexsole athlete; opcional pablo). El "login es un mess" que reporta Alex es **exactamente** este inflado de 3 reales a 11 coaches, NO un problema de criptografía.

**Identidades de Pablo compitiendo (decidir 1):** `pablo@fabrik.training` (seed sin contenido) · `vanwida@aistudios.pro` (real, dueño del único atleta) · `alexsole+coach@gmail.com` (cuenta de pruebas).

---

## 4. Huecos de contenido (a medias, no rotos)

| Hueco | Detalle | Severidad |
|---|---|---|
| **0 vídeos en todo el catálogo** | 68 ejercicios, `video_url` NULL en todos → `play.circle` y reproductor 100% invisibles. Código listo, degrada limpio. Se arregla poblando, sin recompilar. | ALTA |
| **27/97 bloques sin estructura accionable** | Toda g6 (WODs 9/9) + g7 (sims 14/14) con 0 ejercicios. Honesto por diseño (no inventa estructura) pero ~28% de la biblioteca es texto, no datos. Pablo debe estructurarlos a mano. | MEDIA |
| **21/109 block_exercises con params `{}` vacíos** | ~19% sin volumen ni carga (parser no reparte esquemas a la chain). | MEDIA |
| **Metodología = stub "próximamente"** | Backend RAG + endpoints + i18n completos, sin frontend. Corpus vacío (0 docs), label honesto. | MEDIA |
| **Analíticas iOS = placeholder 100%** | Sin endpoint ni datos. Empty-state honesto. | MEDIA |
| **Notification center del atleta no existe** | `/api/notifications` es solo-coach; iOS push-only. | MEDIA |
| **Dashboard de facto solo-castellano** | 7/70 componentes traducen pero `/en/` es enrutable y renderiza castellano. Promesa rota. | MEDIA |
| **Race endpoints inexistentes** | iOS postea a `/race-results` y `/race-debriefs` → 404 → cola inerte (no loop). Tablas existen, ingesta nunca construida. | MEDIA |

---

## 5. Por dimensión

| Dimensión | Estado | CRÍT | ALTA | MEDIA | BAJA |
|---|---|:---:|:---:|:---:|:---:|
| **Auth / sesiones / onboarding** | Núcleo sólido; gate invite-only fail-open + basura de cuentas | 0 | 1 | 1 | 5 |
| **Integridad de datos (Neon prod)** | FKs sanas; basura de test + drift de migraciones | 0 | 1 | 3 | 4 |
| **Biblioteca / import (97 bloques)** | Texto verbatim OK; capa estructurada con bugs de parseo | 0 | 1 | 4 | 3 |
| **Dashboard coach** | Mayormente real; KPIs fabricados + i18n a medias | 0 | 1 | 1 | 5 |
| **iOS athlete app** | Código alto nivel; **demo vacía por falta de datos** | 0 | 4 | 1 | 4 |
| **Contratos API** | Bien alineado salvo chat | 1 | 0 | 3 | 3 |
| **Seguridad** | Maduro (0 SQLi real, Zod, JWT+jti); gaps acotados | 0 | 2 | 1 | 4 |
| **Pagos / Stripe** | Bien arquitecturado; Dobles roto + config local LIVE | 1 | 0 | 4 | 3 |
| **Chat / notificaciones** | Chat core funciona; 3 fallos de coherencia E2E | 0 | 2 | 1 | 4 |
| **Salud del código** | tsc 0 / 302 tests verdes; fusión sin commitear + duplicación | 0 | 2 | 4 | 2 |

> Nota: el chat aparece como CRÍTICA en "contratos" (timestamps) y como ALTA×2 en "comms" (deep-link, payload doble-encode) — son 3 bugs distintos sobre la misma superficie.

---

## 6. Plan de saneamiento propuesto

Orden de ataque para llegar a **mostrable** lo antes posible. Fases 0-1 son lo que desbloquea una demo en vivo; el resto endurece para no-Alex.

### Fase 0 — Limpieza de datos prod (horas, sin tocar código)
1. `DELETE` 8 users `*@fahybrik.test` + cascada de 8 coaches.
2. Borrar mes id11, subscription `comp` falsa, debris assignment/chat de coach 14.
3. Decidir identidad canónica de Pablo y consolidar el atleta real bajo el coach de demo.
4. **Nunca volver a correr scripts comp-test contra prod** — usar branch efímera de Neon.

### Fase 1 — Datos + fixes para que la demo se vea llena (1-2 días)
5. **Sembrar un "Plan Junio" real** (asignaciones en la semana en curso) para el atleta 2.
6. **Poblar `exercises.video_url`** con YouTube reales (parser y embed ya listos).
7. **Fix chat timestamps** (backend `to_char`/`.toISOString()`) — desbloquea toda la superficie de chat.
8. **Quitar/sustituir los KPIs fabricados** de la ficha (Fatiga TSS + Sueño hrs).
9. **Fix categorías de ejercicio** (mapper backend canónico DB ↔ taxonomía iOS) — afecta ~50% del catálogo, oculta distancia/zona en cardio.
10. **Readiness:** devolver `null`/flag `has_data:false` cuando no hay datos, para que iOS muestre el empty-state ya construido (hoy fabrica 45-50).

### Fase 2 — Coherencia E2E comms (1 día)
11. Fix deep-link push (`type` top-level o leer `aps.category`).
12. Fix `payload_json` doble-encode (`sql.json` en 6 sitios + backfill).

### Fase 3 — Endurecimiento seguridad antes de abrir más cuentas
13. Gatear `/api/auth/apple` server-side (invite-only real).
14. Auth en Garmin connect/callback (antes de activar envs de Garmin).
15. Cablear rate-limit de IA (cost-abuse).

### Fase 4 — Deuda estructural + pagos
16. Commitear `web/app/[locale]/` + registrar migración 0039 + arreglar 31 lint errors.
17. Unificar `lib/coach/` vs `lib/dashboard/coach/` (árbol canónico).
18. Fix `subscriptions.partner_user_id` (Dobles) — antes de la primera venta Dobles.
19. Dev: cambiar `sk_live` por `sk_test` + price IDs de test en `.env.local`.

---

*Fin del informe. Hallazgos verificados adversarialmente contra código fuente y Neon prod (solo-lectura). Ningún dato ni código fue modificado durante la auditoría.*
