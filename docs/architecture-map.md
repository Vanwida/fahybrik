# FAHYBRID — Mapa operativo de la repo

Mapa de orientación para orquestar trabajo sin re-investigar. **No es un inventario de ficheros**: es dónde vive cada cosa, qué manda sobre qué, y dónde están las trampas.

- Raíz: `/Users/alexsolecarretero/Public/projects/FAHYBRIK`
- Rama del checkout principal al mapear: `integration/trunk` (`main` está parada hace meses)
- Levantado el **2026-08-14** leyendo el código. Los números son de ese día.
- Marca = **FAHYBRID**. `FAHYBRIK` es solo el nombre heredado del repo / Vercel / Neon.

---

## 1 · Monorepo

pnpm workspace (`pnpm-workspace.yaml`) con **tres paquetes**: `web`, `shared`, `infra`. El resto de carpetas de raíz no son paquetes.

| Carpeta | Paquete | Responsabilidad |
|---|---|---|
| `web/` | `@fahybrid/web` | Next.js 16 (App Router). Dashboard del coach + **toda la API** que consume iOS. Es el único servidor. |
| `shared/` | `@fahybrid/shared` | Zod schemas (contrato de API) + lógica de dominio pura, sin I/O. Consumido por `web` e `infra`. |
| `infra/` | `@fahybrid/infra` | Migraciones SQL de Neon + runner + seeds + backfills. Scripts, no servicio. |
| `ios/` | — | App Swift nativa del atleta + watchOS + widgets. Proyecto Xcode generado por XcodeGen. |
| `docs/` | — | Ley del proyecto (`DECISIONS.md`, `CONTRATO-UI.md`), mockups y artefactos HTML. |
| `garmin-ciq/` | — | App Connect IQ (Monkey C) para relojes Garmin. Build propio (`build.sh`). |
| `zepp/` | — | Mini-app Zepp OS (Amazfit). JS, `node_modules` propio, fuera del workspace. |
| `design_handoff_fhp/` | — | Handoff de diseño antiguo (HTML `.dc.html`). Archivo histórico. |
| `screenshots/` | — | Capturas de la app. **102 ficheros trackeados, borrados en el working tree sin commitear** (ver §11). |
| `.claude/` | — | Hooks de sesión, skill `build-right`, y **39 worktrees de agente (41 GB)**. |

**Nota:** el `README.md` de raíz dice que `shared/` contiene *"generated Swift Codable"*. **Eso no existe**: no hay ningún generador ni fichero generado en la repo. El contrato Swift↔TS se mantiene a mano vía convención snake_case.

---

## 2 · `web/` — el servidor y el dashboard

### 2.1 Entrypoints

| Fichero | Qué es |
|---|---|
| `web/proxy.ts` | Middleware. Clerk **envuelve** a next-intl. Define qué está protegido: páginas del dashboard, `/api/coach/*`, `/api/admin/*`, `/:locale/design/*`. Explícitamente **fuera** de Clerk: `/api/athlete/*` (Bearer propio), `/api/webhooks/*`, `/api/auth/*`, `/sign-in`, `/sign-up`, páginas legales. |
| `web/app/layout.tsx` | Raíz. Carga las 4 fuentes (`Geist`, `Geist Mono`, `Archivo`, `Archivo Narrow`) como vars CSS, monta `ClerkProvider` con tema dark + naranja. |
| `web/app/[locale]/layout.tsx` | `NextIntlClientProvider` + `generateStaticParams` de locales. |
| `web/i18n/routing.ts` | `es` (default) + `en`, `localePrefix: 'always'`, sin detección por `Accept-Language`. Vocabulario deportivo NO se traduce. |
| `web/next.config.ts` | `transpilePackages: ['@fahybrid/shared']`, cabeceras de seguridad, redirects de `/privacy` y `/terms` (los hardcodea iOS), `serverExternalPackages` para pdfjs/mammoth. |
| `web/vercel.json` | Región `fra1` + **12 crons** (ver §2.4). |

### 2.2 Rutas de página (45 `page.tsx`)

Todas bajo `app/[locale]/`, en cinco grupos:

- **`(v2)`** — el dashboard del coach. Es *la* superficie viva: `hoy`, `atletas/[id]`, `microciclos/[id]/dia/[idx]`, `biblioteca`, `periodizacion`, `metricas`, `mensajes`, `tests`, `leads`, `altas`, `pagos`, `ajustes`, `disponibilidad`, `guia/[slug]`. Tiene `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` propios y **su propio fichero de tokens** (`v2-theme.css`).
- **`(design)`** — «el doble»: réplica viva de la app del atleta, `design/[screen]` + `design/entreno`. Admin-only. Ver §7.
- **`(marketing)`** — landing pública en `/:locale`.
- **`(public)`** — `privacy`, `terms`, `pago/exito|cancelado`, `no-mas-emails`.
- **`(admin)`** — `admin`, `admin/carreras`.
- Sueltas: `acceso-demo`, `empieza`, `invite/[token]`, `cita/[token]`, `partner/redeem`.
- Fuera de locale: `sign-in/[[...sign-in]]`, `sign-up/[[...sign-up]]` (Clerk).

### 2.3 API (339 `route.ts`)

Dos consumidores, dos regímenes de auth:

| Prefijo | Consumidor | Auth |
|---|---|---|
| `app/api/athlete/*` | iOS + watchOS | Bearer propio → `lib/auth/athlete-session.ts` |
| `app/api/coach/*` | Dashboard | Sesión Clerk → `lib/auth/require-coach.ts` |
| `app/api/admin/*` | Dashboard admin | `lib/auth/require-admin.ts` |
| `app/api/webhooks/*` | Clerk, Garmin, Stripe, Svix | Firma del proveedor |
| `app/api/cron/*` | Vercel Cron | Secreto de cron |
| `app/api/[transport]/route.ts` | **Servidor MCP del coach** (`mcp-handler` + `@clerk/mcp-tools`) | Clerk |

Familias grandes de `api/athlete/`: `plan`, `workouts`, `running`, `running-analysis`, `races`, `dobles`, `zones`, `readiness`, `biometrics`, `wearables`, `test-battery`, `strength-test`, `nutrition`, `injuries`, `communications`, `marks`, `stations`, `analytics`.
Familias grandes de `api/coach/`: `athletes`, `blocks`, `sequences`, `program-weeks`, `program-months`, `templates`, `methodology`, `tests`, `inbox`, `communications`, `import`, `editor`, `zones`, `signal-thresholds`, `mass-adjustments`.

### 2.4 Crons (`vercel.json`, 12)

`account-deletion-runner` (3:00) · `expire-invitations` (4:00) · `sync-race-calendar` (lun 5:00) · `lifecycle` (5:30) · `auto-import-results` (6:00) · `notifications` (7:00) · `nurture` (8:00) · `weekly-evaluation` (lun 9:00) · `publish-weekly-plans` (sáb 23:59) · `recompute-attention` (*/15) · `polar-sync` (*/15) · `cita-reminders` (cada hora).

### 2.5 `web/lib/` — la capa de servicio

~45 dominios. Los pesos (ficheros `.ts`) dicen dónde está la masa:

`dashboard/` **164** · `coach/` **106** · `athlete/` **66** · `sync/` 25 · `import/` 23 · `mcp/` 18 · `auth/` 18 · `races/` 15 · `leads/` 15 · `wearables/` 13 · `stripe/` 11 · `hyrox/` 11 · `chat/` 10 · `citas/` 9 · `rag/` 8 · `zones/` 7 · `garmin/` 7 · `execution/` 7 · `cron/` 7.

Integraciones externas con carpeta propia: `garmin/`, `polar/`, `whoop/`, `coros/`, `amazfit/`, `stripe/`, `cloudflare/`, `push/`, `notifications/`, `rag/` (pgvector).

**Cliente de DB**: `web/lib/db/index.ts` — un solo `postgres.js` con `max: 10`, `prepare: false`, `bigint` coercido, cacheado en `globalThis` fuera de producción. Exporta `Sql` y `TransactionClient` (para helpers que deben correr dentro de un `sql.begin`).

---

## 3 · `shared/` — el contrato

Sin build: `exports` del `package.json` apuntan **directo al `.ts`**, y `web` lo transpila (`transpilePackages`). Añadir una carpeta nueva de dominio **exige** añadir su subpath a `exports` o el import falla.

- **`shared/schema/`** (~45 ficheros) — Zod. Es el contrato de la API y la validación server-side de toda mutación. `index.ts` reexporta. `_primitives.ts` tiene los tipos base.
- **`shared/domain/`** — lógica pura, sin I/O. Pesos: `coach/` 32 · `running/` 18 · `import/` 14 · `prescription/` 12 · `methodology/` 11 · `goal-gap/` 8 · `analytics/` 8 · `training-load/` 6 · `strength/` 6 · `jump/` 5 · `execution-merge/` 5 · `adherence/` 5 · `free-plan/` 4 · `race-transfer/` 3 · `dobles-gap/`.
- **`shared/tokens.json`** + **`shared/tokens.ts`** — los design tokens canónicos (ver §6).

---

## 4 · `ios/` — la app del atleta

- **606 ficheros Swift.** Proyecto generado por **XcodeGen** desde `ios/project.yml` (no se edita el `.xcodeproj` a mano).
- Targets: `FAHYBRIK` (iOS 18+), `FAHYBRIKWatch`, `FAHYBRIKWidgets`, `FAHYBRIKTests`, `FAHYBRIKUITests`.
- Versión: `CURRENT_PROJECT_VERSION` / `MARKETING_VERSION` están **una sola vez** en `project.yml` para los tres targets — divergir dejaba al reloj sin actualizar en silencio.
- Esquema `FAHYBRIK` con `randomExecutionOrder: true` en `FAHYBRIKTests` (caza tests acoplados por orden). `FAHYBRIKUITests` se auto-salta sin `UITEST_BEARER`.
- Firma: `DEVELOPMENT_TEAM` = `S6W4459DDG`, **una sola vez** en `settings.base` y heredado por los tres targets firmables. `TBD` se descartó (2026-09-01): cada xcodegen / bump de pbxproj lo devolvía a «no team». `CODE_SIGN_STYLE` sigue Automatic.
- Marca: nombre visible, bundle id, dominio y esquema de URL salen de cuatro `BRAND_*` en `settings.base`; los tres `Info.plist`, los entitlements y `FAHYBRIKCore/Marca.swift` los expanden. Inventario y lo que NO se toca: `docs/ios-clonabilidad.md`.

**Masa por carpeta:** `Workout/` 84 · `Devices/` 39 · `Plan/` 32 · `Onboarding/` 29 · `Analytics/` 26 · `Profile/` 24 · `Watch/` 18 · `Carreras/` 17 · `Dobles/` 16 · `Comunicados/` 15 · `Chat/` 11 · `Today/` 10 · `Theme/` 10 · `App/` 10.

**Piezas troncales:**
- `Networking/APIClient.swift` + `RequestQueue.swift` — todo el tráfico y la cola offline.
- `App/AppRoot.swift`, `AppShell.swift`, `AppDataStore.swift`, `AuthState.swift`, `KeychainTokenStore.swift`.
- `Theme/` — el kit obligatorio del `CONTRATO-UI` (§1-2): `Theme.swift` (tokens), `Formato.swift` (**un formateador por concepto**, compilado también en el reloj), `Atoms.swift`, `ScreenScaffold.swift`, `RedesignComponents.swift`, `ZoneColors.swift`.
- `ios/fastlane/` (Appfile + Fastfile), `ios/tools/replay-sensor`.

---

## 5 · `infra/` — datos

- **`infra/migrations/`: 199 ficheros `.sql`**, de `0001_init` a `0196_communication_test_result`.
- **Runner: `infra/scripts/migrate.ts`** — idempotente, journal `schema_migrations`. La **clave de versión es el stem completo del fichero**, no el número, porque hay **colisiones históricas de numeración** (0005, 0012, 0025, 0026, 0027 duplicados; hueco en 0022 que nunca existió). Envuelve cada migración en una transacción y le quita su propio `begin/commit`.
- `infra/scripts/` (~50): seeds (`seed_exercises`, `seed_events`, `seed_methodology`, `seed_demo_*`), backfills (`backfill_prescriptions`, `backfill_zone_seconds`, `backfill_exercise_metrics`…), importadores (`import_blocks_xlsx`, `import_plan_html`), y reparaciones puntuales (`retype_*_blocks`, `repair_*`, `rescue_*`).
- `infra/reports/` — snapshots JSON de backfills. **Gitignored**, no es fuente.
- Varios scripts (`seed:demo-coaches`, `backfill:zonas`) se ejecutan **desde `web/`** con `NODE_OPTIONS=--conditions=react-server` porque importan módulos de servidor de Next.

---

## 6 · UI: componentes, estilos y tokens

### 6.1 Los tres sistemas de tokens que conviven

Esto es **el** hecho estructural de la UI web, y está documentado en `docs/design-system-web.html`:

| # | Sistema | Vive en | Nombres | Quién lo usa |
|---|---|---|---|---|
| 1 | **Marca (canónico)** | `shared/tokens.json` → `shared/tokens.ts`, `web/app/globals.css` (727 líneas), `ios/FAHYBRIK/Theme/Theme.swift` | `--bg` `--surface` `--accent` `--z1..z5`, escala 4·8·12·16·24·32·48, radios 6·10·14·20 | iOS + la app legacy |
| 2 | **shadcn (el estándar)** | `web/app/globals.css` | `--background` `--card` `--border` `--primary` `--muted-foreground` | **Solo `components/ui/button.tsx`.** Nadie más. |
| 3 | **v2 (casero)** | `web/app/[locale]/(v2)/v2-theme.css` (300 líneas, ~101 tokens `--v2-*`) | `--v2-accent`, `--v2-mod-*`, `--v2-r-*`, con claro/oscuro propios | **Los 333 componentes de `components/v2/`** |

Consecuencia práctica, y la razón de que el `Button` de shadcn no se use: está escrito en tokens del sistema 2, y el dashboard entero habla el 3 — un botón de shadcn **no se ve como la pantalla donde lo pones**.

**Aislamiento de tema (restricción dura):** los tokens `--v2-*` viven bajo `.v2-root[data-theme]`, **nunca en `<html>`**. La app legacy es dark-only y togglea `.dark` en `<html>`; v2 no puede sangrar sobre ella. v2 sí tiene claro y oscuro (`components/v2/theme/`: `V2ThemeProvider`, `V2ThemeScript`, `ThemeToggle`, `theme-config.ts`).

**Regla de propagación:** si cambia un valor de token → `tokens.json` + `globals.css` + `Theme.swift` **en el mismo commit**.

### 6.2 Inventario de componentes web

| Carpeta | `.tsx` | Qué es |
|---|---|---|
| `components/v2/` | **333** | El dashboard entero. Primitivos en la raíz (`Card`, `Pill`, `StatTile`, `EmptyState`, `ScreenState`, `SegmentedControl`, `PageFrame`, `Rail`, `V2Shell`, `V2Sidebar`, `V2MobileNav`…) + una subcarpeta por sección (`hoy/`, `atletas/`, `biblioteca/`, `periodizacion/`, `metricas/`, `editor/`, `sesion/`, `tests/`, `chat/`…). `nav.ts` es la **fuente única de navegación**; `constants.ts` y `index.ts` completan el barril. |
| `components/design-twin/` | **206** | El doble (ver §7). |
| `components/landing/` | 22 | Landing de marketing (GSAP + Lenis). |
| `components/admin/` | 6 · `onboarding/` 6 · `leads`, `citas`, `invites`, `demo`, `media`, `plan-espina`, `templates` | Superficies menores. |
| `components/ui/` | **2** | `button.tsx` (shadcn, sin uso real) + `MIcon.tsx`. Es la carpeta que `components.json` declara como destino de shadcn. |

`components.json`: estilo `base-nova`, `baseColor: neutral`, `cssVariables: true`, iconos `lucide`, CSS en `app/globals.css`. Instalado y pagado pero **prácticamente sin usar**: `shadcn ^4.7.0`, `@base-ui/react ^1.4.1`, `class-variance-authority`, `tailwind-merge`, `clsx` están todos en `package.json`.

### 6.3 iOS

`CONTRATO-UI.md` §0-8 es la ley: **grep antes de escribir un componente**; si no existe, se crea en `Theme/`, nunca en línea ni `private struct`. Un formateador por concepto en `Theme/Formato.swift`, y las variantes se piden **por parámetro**, nunca escribiendo una segunda función.

---

## 7 · «El doble» (`(design)`)

Réplica viva de la app del atleta en web, para dirigir UX sin compilar Swift. Admin-only (middleware exige Clerk; el layout estrecha a admin).

- Rutas: `/:locale/design` (índice), `/:locale/design/[screen]`, `/:locale/design/entreno`.
- `components/design-twin/registry.ts` es **la única lista de pantallas**. Cada pantalla es `screens/<id>/index.tsx` exportando `{ meta, escenarios, Screen }`.
- **Sello `estado`** — el contrato de sinceridad: `'espejo'` = réplica de Swift ya shipeado (declara `fuentes: [rutas Swift]` y `actualizado: 'YYYY-MM-DD'`); `'propuesta'` = mockup de lo aún no construido. `PENDIENTES` enumera huecos para que el desfase se vea en el índice.
- **`pnpm --filter @fahybrid/web twin:desfase`** (`web/scripts/twin-desfase.mjs`) compara el último commit de cada `fuente` contra `actualizado` y delata los espejos que mienten. Existe porque el 3-ago-2026 los 5 espejos llevaban una semana desfasados sin que nadie lo viera.
- CSS propio: `design/twin.css` (espejo de `Theme.swift`) y `design/studio.css`. **Si `Theme.swift` cambia tokens, `twin.css` cambia en el mismo lote.**

---

## 8 · `docs/design-system-web.html` ↔ el código

Es un **documento de diagnóstico y plan, no un catálogo de componentes ni una referencia viva**. Medido sobre `web/` el 14-ago-2026. Escrito en HTML autocontenido con su propio CSS inline (no consume los tokens del repo).

Lo que afirma, verificado contra el código:

| Afirmación del doc | Estado en el código (14-ago) |
|---|---|
| Tres sistemas de tokens en paralelo | ✅ Confirmado (§6.1) |
| `components/ui/button.tsx` con **0** usos frente a 537 `<button>` en 180 ficheros | ✅ `components/ui/` tiene 2 ficheros |
| `v2/Card.tsx` usado en 13 sitios vs 220 ficheros pintando borde+radio+fondo a mano | No re-contado en este mapa |
| `v2/Pill.tsx` con 46 usos → «bien» | No re-contado |
| Falta un `AGENTS.md` | ✅ **No existe ninguno en la repo** |
| shadcn/Base UI/cva/tailwind-merge ya instalados | ✅ Confirmado en `web/package.json` |

**El plan que propone** (no ejecutado a fecha de este mapa): mover los *valores* `--v2-*` a los *nombres* de shadcn dejando los 101 `--v2-*` como alias (los 333 ficheros no se tocan y la pantalla no se mueve), `shadcn add` del set estándar, reescribir `Pill`/`EmptyState`/`ScreenState`/`StatTile` encima de shadcn en `components/ui/`, crear `AGENTS.md` en raíz y `ios/AGENTS.md`, y una regla de lint que prohíba `--v2-*` nuevos.

Relación con `CONTRATO-UI.md`: el doc propone **sustituir su §9** (la parte web) por `AGENTS.md`. Las §0-8 (iOS) se quedan y se moverían a `ios/AGENTS.md`. **Hoy `CONTRATO-UI.md` sigue siendo la única ley de UI escrita.**

---

## 9 · Comandos reales

### Raíz (pnpm workspace)
```
pnpm dev:web        # → web dev
pnpm build:web
pnpm lint           # pnpm -r lint
pnpm typecheck      # pnpm -r typecheck
pnpm test           # pnpm -r test
```

### `web/`
```
pnpm --filter @fahybrid/web dev            # next dev --turbopack -p 3456
pnpm --filter @fahybrid/web build
pnpm --filter @fahybrid/web lint           # eslint
pnpm --filter @fahybrid/web typecheck      # tsc --noEmit
pnpm --filter @fahybrid/web test           # vitest run
pnpm --filter @fahybrid/web test:watch
pnpm --filter @fahybrid/web twin:desfase
```

### `shared/` e `infra/`
`lint` y `typecheck` son ambos `tsc --noEmit`. `shared test` y `infra test` son **no-ops** (`echo`), así que un `pnpm test` verde a nivel raíz solo prueba `web`.

`infra` (todos vía `tsx`):
```
pnpm --filter @fahybrid/infra migrate            # aplica pendientes
pnpm --filter @fahybrid/infra migrate:dry-run
pnpm --filter @fahybrid/infra migrate:backfill   # marca el histórico como aplicado, UNA vez
pnpm --filter @fahybrid/infra seed:exercises | seed:events | seed:methodology | seed:demo-*
pnpm --filter @fahybrid/infra backfill:prescriptions[:dry-run] | backfill:zonas[:dry-run] | backfill:metrics
pnpm --filter @fahybrid/infra import:blocks | import:plan | parse:blocks
```

### iOS
No hay scripts npm. XcodeGen regenera desde `ios/project.yml`; después `xcodebuild -scheme FAHYBRIK` / `-scheme FAHYBRIKWatch`. Los UITests solo corren con `UITEST_BEARER=<bearer> xcodebuild test -only-testing:FAHYBRIKUITests`.
**Las builds de iOS las instala Alex**, no el agente.

### Tests web — cómo están montados
`web/vitest.config.ts`: incluye `tests/**/*.test.ts` **y** `lib/**/*.test.ts` (los motores llevan sus unitarios al lado). `testTimeout: 30_000` porque las suites `.db.test.ts` hablan con una **rama real de Neon** por red. Alias: `@` → `web/`, y `server-only` → stub. `tests/setup/env.ts` inyecta un `DATABASE_URL` dummy para que el import de `lib/db` no reviente.

- **395 ficheros de test** en `web/tests/`, de los cuales **101 son `.db.test.ts`**.
- `tests/utils/test-db.ts` lee **`TEST_DATABASE_URL`** (rama Neon desechable). Sin ella, las suites se saltan **explícitamente** vía `describeWithDb` — nunca un falso verde.
- `tests/e2e/` (2 specs Playwright), `tests/fixtures/fit/`, `tests/_stubs/`.
- **La DB no se mockea** (regla de `CLAUDE.md`).

---

## 10 · Reglas que mandan

| Fichero | Qué manda | Nota |
|---|---|---|
| `CLAUDE.md` (raíz) | La ley operativa. Regla Nº1 = **design-first** (invocar la skill `build-right` antes de construir algo no trivial del dominio). Regla Nº0 = **multi-coach**: mecanismo → código, método → dato editable del coach; cero nombres propios en código. | Se carga solo |
| `docs/DECISIONS.md` | **3.353 líneas.** Toda decisión estructural de dominio o modelo de datos, y sobre todo **lo que se descartó**. Se lee ANTES de rediseñar dominio. Una migración que *crea* algo no prueba que siga vivo (0063 lo creó, 0064 lo borró). | Ley |
| `docs/CONTRATO-UI.md` | **335 líneas.** §0-8 = kit y formateadores (nacieron para iOS, aplican a las dos superficies). §9 = web. Existe porque el 28-jul nueve agentes en paralelo produjeron 6 formateadores de duración distintos. | Ley de UI |
| `FOCUS.md` | Estado vivo que lee mentalOS desde el móvil. Tope 80 líneas. **Se actualiza en el mismo commit que el trabajo.** | Estado |
| `docs/tablero.html` | El mapa visual que abre Alex. `FOCUS.md` no lo lee él. | |
| **`AGENTS.md`** | **NO EXISTE.** Propuesto por `docs/design-system-web.html`, sin crear. | Hueco |
| `.claude/hooks/session-context.sh` | Sirve `FOCUS.md` + sin-commitear + últimos commits al arrancar sesión. | |
| `.claude/hooks/worktree-al-dia.sh` | Adelanta un worktree recién creado a la rama de trabajo con `--ff-only`. **El registro que cuenta es el de nivel usuario** (`~/.claude/`), no la copia versionada aquí. | |
| `.claude/skills/build-right/SKILL.md` | La skill obligatoria de diseño-primero. | |

**Reglas de git del proyecto:** todo se commitea (si no está en git, para Alex no existe); commits pequeños por ruta explícita; **nunca `git add -A` ni `git stash`** (el worktree es compartido entre sesiones).

---

## 11 · Zonas de riesgo

**Datos / migraciones**
- **Numeración con colisiones y hueco.** Nunca asumas que el prefijo numérico identifica una migración: el journal usa el **stem completo**. Al añadir una nueva, coge el número más alto + 1 (`0197_*`) y aplícala vía `migrate.ts` — nunca a mano.
- **`web/.env.local` es un symlink a `../.env.local`** (la raíz). Ese `DATABASE_URL` apunta a **main de producción**. Vitest **no** carga ese fichero. El riesgo real es otro: (1) `tests/setup/env.ts` cedía ante un `DATABASE_URL` ya exportado en la shell — ahora lo pisa **siempre** con un dummy `127.0.0.1`; (2) `TEST_DATABASE_URL` sin validar podía ser la de main. El setup compara el host de `TEST_DATABASE_URL` con el de la shell y el de `.env.local` y **falla en alto** si coinciden (sin imprimir la URL). Las libs importadas leen `DATABASE_URL` (dummy en Vitest).
- **`DATABASE_URL` del `~/.openclaw/.../vanwida-tokens.env` apunta a OTRO Neon.** Pinear siempre la variable correcta del proyecto. Un dry-run con decenas de pendientes = base equivocada.
- **postgres.js + jsonb**: nunca `JSON.stringify` en una columna `jsonb` — usar `client.json()`. Ya rompió los adjuntos del chat.
- Migraciones y seeds tocan la misma base que la app: los seeds son **defectos editables**, no datos falsos en cuentas reales.

**Rutas dinámicas**
- 339 `route.ts` con muchos segmentos `[id]`. El cambio de régimen de auth es por **prefijo**, no por carpeta: mover un endpoint de `api/coach/` a otro sitio **le quita la protección de Clerk** (`proxy.ts` matchea paths literales). Cualquier ruta nueva de dashboard hay que **añadirla a `isProtectedRoute`** o nace pública.
- Catch-all de ficheros (`api/chat/attachments/[...path]`, `api/communications/audio/[...path]`) — superficie de path traversal.
- `app/api/[transport]/route.ts` sirve **todo** el MCP del coach desde un solo fichero.

**Código generado**
- **Ninguno en TS/JS.** El único generado es `ios/FAHYBRIK.xcodeproj` desde `project.yml` (XcodeGen) y `Generated-Info.plist`. Editar el `.xcodeproj` a mano se pierde a la siguiente generación.
- Las fuentes del target watch se declaran en **lista explícita** en `project.yml` — un fichero nuevo compartido que no se añada allí rompe el build del reloj.

**Estilos**
- **`max-w-xl` / `max-w-xs` no valen lo que parecen.** `globals.css` redefine `--spacing-xs/xl` y Tailwind v4 los resuelve antes que `--container-*`: `max-w-xl` = **24px**, no 36rem. Fallo mudo (ni build ni typecheck). Lo caza `eslint.config.mjs` con `no-restricted-syntax`. Solo chocan `xs` y `xl`.
- Tocar `v2-theme.css` sin scope `.v2-root` sangra sobre la app legacy.

**Vercel / deploy**
- `.vercelignore` excluye `ios/`, `docs/`, `screenshots/`, `tests/` para mantener el upload bajo el límite de fuente. Añadir algo grande a `web/` puede romper el deploy por tamaño.
- El límite de body es un tema histórico: los ficheros van por **subida prefirmada**, nunca por la API.

**Worktrees de agente**
- **39 worktrees de agente, 41 GB en `.claude/worktrees/`.** Nacen de `main` (parada hace meses). Antes de medir o arreglar nada dentro de uno: `git rev-list --count HEAD..<rama-de-trabajo>` tiene que dar **0**.

**Fixtures y assets**
- `web/tests/fixtures/fit/` (ficheros FIT de Garmin) e `infra/scripts/fixtures/*.json` son ground truth de tests — no regenerables trivialmente.
- `web/public/` lleva `brand/`, `landing/`, `photos/`, `sw.js` (service worker de la PWA del coach) y tres HTML sueltos (`metodo.html`, `intake-redesign.html`, `solicitudes-wearables.html`) servidos como estáticos.
- `web/public/.well-known/apple-app-site-association` necesita `Content-Type: application/json` forzado en `next.config.ts` o los Universal Links de iOS dejan de verificar.

---

## 12 · Candidatos a limpieza (**nada borrado; solo señalados**)

Ordenados por relación coste/riesgo. **Ninguno se ha tocado.**

1. **`screenshots/` — 102 ficheros trackeados, borrados en el working tree y sin commitear.** Es la inconsistencia más visible del repo hoy: o se commitea el borrado o se restauran. Decisión de Alex, no del agente.
2. **`.claude/worktrees/` — 39 worktrees de agente, 41 GB.** Gitignorado, pero es disco real. Los que no tengan commits propios son desechables.
3. **`infra/scripts/apply_00XX.ts` (6 ficheros)** — la era manual anterior a `migrate.ts`. El propio runner los documenta como superados. Muertos por diseño.
4. **Reparaciones puntuales ya consumidas** en `infra/scripts/`: `repair_0017.ts`, `fix_week1_balanced_segments.ts`, `fix_double_encoded_jsonb.mjs`, `rescue_inferred_intensity_blocks.ts`, `retype_*_blocks.ts`, `backfill_optional_block_flag_microciclo76.ts` (este último lleva el número de microciclo en el nombre). Verificar en `DECISIONS.md` antes de tocar: alguno puede seguir siendo referencia.
5. **`web/*.tsbuildinfo`** (`tsconfig.tsbuildinfo`, `tsconfig.seedcheck.tsbuildinfo`, `tsconfig.superset-check.tsbuildinfo`) — artefactos de compilación en el árbol. No trackeados (gitignore los cubre), pero ensucian.
6. **Ficheros de raíz que no son código**: `logo.JPG`, `Grupos_Entrenamiento_HYROX.xlsx` (**duplicado exacto de `docs/Grupos_Entrenamiento_HYROX.xlsx`**), `verificacion.json`, `upload-target-video.json`, `.env.local.bak.20260625-112132`, `.DS_Store`. La regla del proyecto es no dejar ficheros de trabajo en raíz.
7. **`design_handoff_fhp/`** — handoff de diseño antiguo, sustituido por «el doble». Candidato a `docs/archivo/`.
8. **`docs/` sin jerarquía** — 60+ entradas en el primer nivel mezclando ley (`DECISIONS.md`, `CONTRATO-UI.md`), mockups, auditorías y restos (`C _ Expert (1..4).html/png`, sin dueño aparente). `docs/archivo/` ya existe con un solo fichero: hay dónde mover.
9. **`components/ui/button.tsx`** — 2 ficheros en la carpeta que `components.json` declara como destino, con 0 usos. **No borrar**: es el ancla del plan de `design-system-web.html`.
10. **`.playwright-mcp/` (583 entradas)** — artefactos de sesión, gitignorados.
11. **`README.md` de raíz desactualizado** — afirma «generated Swift Codable» en `shared/`, que no existe.

---

## 13 · Lo que NO sé (marcado, no adivinado)

- **Si `shared/domain/*` tiene código muerto.** No hay barril global ni herramienta de dead-export en la repo; medirlo requiere una pasada de referencias que no hice.
- **Los recuentos concretos de `design-system-web.html`** (13 usos de `Card`, 220 ficheros pintando tarjetas a mano, 537 `<button>`) — los reporto como los declara el doc; no los re-conté.
- **Cuáles de las 29 rutas de coach «sin pantalla»** que `FOCUS.md` menciona como parqueadas son cuáles. `FOCUS.md` lo dice sin enumerar.
- **El estado real de la base de datos.** Este mapa se levantó del código; no consulté Neon.
- **Si `lint` / `typecheck` de `web` pasan hoy.** Solo ejecuté `typecheck` de `shared` (pasa limpio). No corrí `web typecheck`, `web lint`, `vitest`, ni ningún `xcodebuild`.
- **`garmin-ciq/` y `zepp/`** los mapeé por estructura de carpetas, no leyendo su código.
