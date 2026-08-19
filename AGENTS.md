# AGENTS.md — FAHYBRID

Ley operativa del repo para cualquier agente. El porqué vive en `docs/DECISIONS.md`.
Marca = **FAHYBRID**. `FAHYBRIK` es solo el nombre heredado del repo / Vercel / Neon.

`web/AGENTS.md` e `ios/AGENTS.md` no existen. La ley de UI sigue en `docs/CONTRATO-UI.md`.

---

## Cuentas

Todo bajo **vanwida**. Nunca `alexsole@gmail.com` ni `kud0`.

- Tokens: `~/.openclaw/credentials/vanwida-tokens.env` — no echo, no commit
- Secretos locales: `.env.local` en la raíz (gitignorado, modo `600`). `web/.env.local` es un symlink a ese fichero
- GitHub: `gh auth status` debe mostrar Vanwida
- `git config user.email` = `vanwida@aistudios.pro`
- No proponer modelos LLM. Alex elige

---

## Arquitectura

pnpm workspace (`pnpm-workspace.yaml`): `web`, `shared`, `infra`. El resto no son paquetes.

| Ruta | Paquete | Qué es |
|---|---|---|
| `web/` | `@fahybrid/web` | Next.js 16. Dashboard del coach + **toda** la API. Único servidor. Puerto **3456** |
| `shared/` | `@fahybrid/shared` | Zod + dominio puro, sin I/O. Exports = subpaths en `shared/package.json` |
| `infra/` | `@fahybrid/infra` | Migraciones Neon + seeds + backfills. Scripts, no servicio |
| `ios/` | — | App Swift del atleta. Proyecto generado por XcodeGen desde `ios/project.yml`. `ios/FAHYBRIKCore/` = dominio compartido iPhone + reloj (lo incluyen los dos targets); `ios/FAHYBRIK/` = solo teléfono; `ios/FAHYBRIKWatch/` = solo muñeca |
| `docs/` | — | Ley: `DECISIONS.md`, `CONTRATO-UI.md`. Estado: `FOCUS.md` |
| `garmin-ciq/`, `zepp/` | — | Fuera del workspace |

Auth por prefijo, no por carpeta (`web/proxy.ts` → `isProtectedRoute`):

- `/api/coach/*` y `/api/admin/*` + páginas del dashboard + `/:locale/design/*` → Clerk
- `/api/athlete/*` → Bearer propio (`web/lib/auth/athlete-session.ts`)
- `/api/webhooks/*`, `/api/auth/*`, legales, landing → fuera de Clerk

Cliente DB vivo: `web/lib/db/index.ts` lee `DATABASE_URL`. Scripts de infra: `infra/scripts/_db.ts` carga `.env.local` de la **raíz** al importar.

---

## Ley que se lee antes de tocar dominio o UI

1. `CLAUDE.md` — design-first (`build-right`), multi-coach, git, cuentas
2. `docs/DECISIONS.md` — **antes** de rediseñar dominio o borrar entidades
3. `docs/CONTRATO-UI.md` — antes de escribir una pantalla
4. `FOCUS.md` — estado vivo (mentalOS). Se actualiza en el mismo commit que el trabajo
5. Skill `build-right` (`.claude/skills/build-right/`) — obligatoria antes de construir / especificar / lanzar un agente sobre dominio no trivial

Mecanismo = código. Método del coach = dato editable. Cero nombres propios en código (ni Pablo, ni Fabrik). Pregunta: *¿otro entrenador competente lo haría distinto?* Si sí → no es `const`.

---

## Comandos (verificados 2026-08-14)

Workspace (`package.json` de raíz):

```
pnpm dev:web        # → @fahybrid/web dev
pnpm build:web
pnpm lint           # pnpm -r lint
pnpm typecheck      # pnpm -r typecheck
pnpm test           # pnpm -r test   (shared e infra son echo; solo web prueba algo)
```

Web:

```
pnpm --filter @fahybrid/web dev            # next dev --turbopack -p 3456
pnpm --filter @fahybrid/web lint           # eslint
pnpm --filter @fahybrid/web typecheck      # tsc --noEmit
pnpm --filter @fahybrid/web test           # vitest run
pnpm --filter @fahybrid/web test:watch
pnpm --filter @fahybrid/web twin:desfase
```

`shared` e `infra`: `lint` y `typecheck` son ambos `tsc --noEmit`. `test` es no-op.

Infra (todos `tsx`). **No lanzar `migrate` ni seeds contra `.env.local`** — esa URL es main de producción:

```
pnpm --filter @fahybrid/infra migrate:dry-run   # también lee .env.local; no es inocuo
pnpm --filter @fahybrid/infra migrate           # escribe. Solo contra rama Neon desechable
```

iOS: no hay scripts npm. Regenerar con XcodeGen desde `ios/project.yml`. Las builds las instala Alex. UITests: `UITEST_BEARER=<bearer> xcodebuild test -only-testing:FAHYBRIKUITests`.

Playwright: `web/tests/e2e/` tiene 2 specs. No hay script npm.

### Estado medido (esta sesión, sin producción)

| Comando | Resultado |
|---|---|
| `pnpm --filter @fahybrid/web dev` | Puerto 3456. `GET /` → 307. `GET /es` → 200. Ya había un `next-server` 16.2.5 en `web/` |
| `pnpm --filter @fahybrid/web lint` | **Falla.** 10 errors + 42 warnings. Mayoría `react-hooks/set-state-in-effect` en `components/v2/atleta-detalle/` |
| `pnpm --filter @fahybrid/web typecheck` | **Falla.** `tests/import/fit-materialize.db.test.ts`: `CanonicalLap.phase` no admite `undefined` |
| `pnpm --filter @fahybrid/shared typecheck` | Pasa |
| `pnpm --filter @fahybrid/infra typecheck` | **Falla.** Alias `@/lib/db` sin resolver + `"interval"` vs `"intervals"` + `FABRIK_WEEK1_BATTERY` ausente |
| `env -u DATABASE_URL -u TEST_DATABASE_URL pnpm --filter @fahybrid/web test` | 404 ficheros: 272 passed, **2 failed**, 130 skipped. 4427 tests passed, 2 failed, 686 skipped. Suites `.db` se saltan (aviso `[test-db] TEST_DATABASE_URL not set`) |

Fallos unitarios (no tocan DB):

- `tests/sync/healthkit-activity.test.ts` — `healthkitActivityToModality(52)` esperaba `run`, recibió `other`
- `tests/sync/ingest-healthkit.test.ts` — `executions_linked` esperaba `0`, recibió `1`

---

## Tests DB — cómo correrlos sin apuntar a producción

Vitest **no** carga `.env.local`. Las 101 suites `*.db.test.ts` usan `describeWithDb` (`web/tests/utils/test-db.ts`) y leen **solo** `TEST_DATABASE_URL`. Sin esa variable se saltan en alto, no dan verde falso.

La DB no se mockea. Rama Neon desechable, nunca main.

```bash
# 1. Shell limpia. Si imprime algo, abrir otra:
env | grep -E '^(DATABASE_URL|TEST_DATABASE_URL)=' | sed 's/=.*/=<set>/'

# 2. Unitarias. Seguro. Las .db se saltan.
env -u DATABASE_URL -u TEST_DATABASE_URL pnpm --filter @fahybrid/web test

# 3. Rama desechable (neonctl 2.27.1 está en PATH). Nunca main.
#    El project id está en .env.local como NEON_PROJECT_ID — no lo imprimas.
neonctl branches create --project-id <NEON_PROJECT_ID> --name test-<quien>-<fecha>

# 4. Suites .db: URL EN LÍNEA. Jamás `export`. Jamás escribirla en .env.local
#    (ahí la heredaría next dev y todo lo demás).
TEST_DATABASE_URL='<connection_uri de la rama>' pnpm --filter @fahybrid/web test

# 5. Borrar la rama al terminar.
neonctl branches delete <nombre> --project-id <NEON_PROJECT_ID>
```

Cortafuegos (PASO 3): `web/tests/setup/env.ts` pisa siempre `DATABASE_URL` con el dummy y aborta si `TEST_DATABASE_URL` resuelve al mismo host que la shell o el `DATABASE_URL` de `.env.local`. Detalle: `docs/test-db-prod-guard-proposal.md`.

`infra/scripts/_db.ts` carga producción por defecto. No es el camino de Vitest. No lanzar migrate/seed/backfill salvo con `DATABASE_URL` explícita a una rama desechable.

---

## Límites de edición

- No borrar ficheros ni exports «por si acaso». No hay herramienta de dead-export
- No mover carpetas ni reconfigurar linters sin decisión explícita
- No tocar FLEXR (`docs/specs/flexr-race-mode-spec.md` y lo que cuelgue)
- No editar `ios/FAHYBRIK.xcodeproj` a mano — se regenera desde `ios/project.yml`
- Fichero Swift nuevo compartido con el reloj → **va en `ios/FAHYBRIKCore/`**, que los dos targets incluyen entera. No se añade a ninguna lista de `project.yml`. Lo que entre ahí tiene que compilar en watchOS: nada de UIKit, de tipos de la app ni de ActivityKit (la app embute el reloj, así que un `xcodebuild -scheme FAHYBRIK` lo caza). Ver `docs/DECISIONS.md` (2026-08-17 «lo dice la carpeta»)
- Carpeta nueva en `shared/domain/` → subpath en `shared/package.json` `exports`
- Ruta nueva del dashboard → añadirla a `isProtectedRoute` en `web/proxy.ts` o nace pública
- Mover un endpoint fuera de `api/coach/` le quita Clerk
- Token de marca: `shared/tokens.json` + `web/app/globals.css` + `ios/FAHYBRIK/Theme/Theme.swift` en el mismo commit
- Si cambia `Theme.swift`, `web` `design/twin.css` cambia en el mismo lote
- Tokens `--v2-*` solo bajo `.v2-root[data-theme]`, nunca en `<html>`
- Prohibido `max-w-xl` y `max-w-xs` (eslint `no-restricted-syntax`: resuelven a 24px / 4px)
- Mockups de la app = pantallas `propuesta` del doble, no HTML suelto
- Cambio Swift shipeado → pantalla `espejo` + sello `actualizado` en el mismo lote
- Grep antes de escribir un componente o formateador (`docs/CONTRATO-UI.md` §0-2)
- Validación server-side (Zod) en toda mutación
- Columnas explícitas. Sin JSON blobs salvo vectores ML / embeddings
- Ficheros < 500 líneas
- Snake_case en respuestas API
- Sin `console.log` en código commiteado
- Sin secretos. Solo se commitea `.env.example`
- Sin ficheros de trabajo en la raíz
- `postgres.js` + `jsonb`: usar `client.json()`, nunca `JSON.stringify`

---

## Git

- Commits pequeños, ruta explícita. Nunca `git add -A` ni `git add .`
- **Jamás `git stash`** — el worktree es compartido entre sesiones
- `FOCUS.md` en el mismo commit que el trabajo
- `docs/DECISIONS.md` se escribe al tomar la decisión, sobre todo al descartar
- Worktree de agente: `git rev-list --count HEAD::<rama-de-trabajo>` tiene que dar 0 antes de medir o arreglar. `main` está parada

---

## Entorno — seguridad

`.env.local` de la raíz es producción. `web/.env.local` apunta ahí.

| Quién | Qué lee | Riesgo |
|---|---|---|
| `next dev` / `next build` | `.env.local` | Esperado |
| Vitest | **No** carga `.env.local` | Dummy `127.0.0.1` en `web/tests/setup/env.ts` **siempre**. Si `TEST_DATABASE_URL` coincide con el host de la shell o de `.env.local`, Vitest aborta |
| `infra/scripts/_db.ts` | `.env.local` siempre | migrate/seed → main si no se overridea |

Antes de cualquier `pnpm test` o script de infra:

```bash
env | grep -E '^(DATABASE_URL|TEST_DATABASE_URL)=' | sed 's/=.*/=<set>/'
```

`DATABASE_URL` de `vanwida-tokens.env` apunta a **otro** Neon. No mezclar.

No mockear la base. No commitear `.env*`. No imprimir valores de secretos.
