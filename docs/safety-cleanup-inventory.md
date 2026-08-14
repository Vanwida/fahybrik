# Inventario de riesgos previo a la limpieza — PASO 1

Levantado el **2026-08-14** sobre el checkout principal (`feat/pm5-counter-sync`, `df2e5b4f`).
Complementa `docs/architecture-map.md` §12 («candidatos a limpieza»), que solo los señalaba sin medirlos.

**PASO 2 ejecutado el 2026-08-14.** Se eliminaron los 35 worktrees SEGURO. No se tocó
el principal, el scratchpad, los 4 de A.2 ni ninguna rama. Sin commit.

---

## Resultado de la limpieza (2026-08-14)

| | Antes | Después |
|---|---|---|
| Worktrees registrados | 41 | **6** |
| Directorios en `.claude/worktrees/` | 39 | **4** |
| `du -sh .claude/worktrees` | 41G | **4.9G** |
| Disco (`df` Data) usado / libre | 855Gi / **32Gi** (97 %) | 843Gi / **44Gi** (96 %) |
| Ramas (`git branch --list`) | 105 | **105** (lista idéntica; solo cae el `+` de checkout) |
| HEAD principal | `feat/pm5-counter-sync` `df2e5b4f` | igual |
| `git status --porcelain` (principal) | 125 líneas | 125 líneas (antes de editar este fichero) |

- **Eliminados:** 35 / 35. `git worktree remove --force` sobre la lista A.1. Cero errores (`REMOVED_ERR=0`; el log de git quedó vacío).
- **Conservados:** 6 worktrees — el principal, el scratchpad de `/private/tmp`, y los 4 de A.2 (`agent-a5d58e9d1fd1ff9b7`, `agent-aed1713f03bb0bba2`, `agent-aa71d760bd0a68457`, `agent-a8b8e1f9102b48934`).
- **Ramas:** intactas. Muestra de ramas de worktrees ya quitados: `worktree-agent-a076cda737cb714a8`, `worktree-agent-a76d05102d1262f32`, `feat/tests-guiados-ios` siguen resolviendo.
- **No ejecutado (a propósito):** `git worktree prune`, quitar el scratchpad (A.4), C.4 (`.clerk/` en `web/.gitignore`), reset / stash / clean, borrado de ramas.
- **Disco:** `du` de `.claude/worktrees` bajó ~36 G; `df` solo recuperó **12 Gi** libres (32 → 44). El inventario estimaba ~68 Gi libres. La diferencia es real y no se ha forzado (ni `tmutil`, ni purge). Probable espacio APFS compartido / clones entre `node_modules` replicados: `du` suma lógico, `df` cuenta bloques únicos.

El inventario original de abajo se conserva como permiso y medición previa. Las cifras de A.0 son las de **antes** de ejecutar.

---

## 0 · El hecho que gobierna todo lo demás

> **`git worktree remove` borra el directorio de trabajo, NO la rama.**

Las 105 ramas del repo (87 `worktree-agent-*` + 18 con nombre) viven en `.git/refs`, que es
único y compartido. Al quitar un worktree, sus commits siguen alcanzables por su rama y
recuperables con `git log <rama>` / `git checkout <rama>`.

**Lo único que se pierde de verdad al quitar un worktree es lo NO commiteado**: ficheros
modificados y sin trackear. Por eso la clasificación de abajo se decide por *trabajo sucio
irrecuperable*, no por «tiene commits propios».

Verificado además: **ningún worktree está `locked` ni `prunable`**, los 39 directorios de
`.claude/worktrees/` corresponden 1:1 con worktrees registrados (**cero directorios huérfanos**),
y la carpeta está excluida vía `.git/info/exclude:11`, no vía `.gitignore` (por eso `grep worktree
.gitignore` no da nada).

---

## A · Worktrees

### A.0 Cuadro

| | Worktrees | Disco |
|---|---|---|
| Registrados en `git worktree list` | 41 | — |
| — checkout principal | 1 | (el repo) |
| — scratchpad en `/private/tmp` | 1 | fuera del repo |
| — agentes en `.claude/worktrees/` | **39** | **41 GB** |
| **SEGURO de liberar** | **35** | **~36 GB** |
| **REQUIERE CONFIRMACIÓN** | **4** | 4,8 GB |
| **NO TOCAR** | 1 (+ las ramas) | — |

Contexto de urgencia: el disco está al **97 %** con **32 GB libres**. Liberar los 35 seguros
lo deja en ~68 GB. `.git` pesa 133 MB, así que el coste está entero en los `node_modules` y
`DerivedData` replicados 39 veces, no en la historia.

### A.1 SEGURO — 35 worktrees, ~36 GB

Criterio: **0 commits por delante de `feat/pm5-counter-sync`** (o commits ya presentes por
`patch-id`) **y** cero trabajo sucio irrecuperable.

La columna «Sucio» solo contiene dos cosas, ambas desechables y verificadas:

- **`web/.gitignore`** — el **mismo** diff exacto en 10 worktrees (hash del diff `8ea266bbca89`
  en los 10). Son 3 líneas y quedan aquí escritas, así que no se pierde nada:
  ```
  + 
  + # clerk configuration (can include secrets)
  + /.clerk/
  ```
  **Nota aparte:** esas 3 líneas **NO están** en la rama de trabajo. Diez agentes las añadieron
  y ninguno las commiteó. Conviene aplicarlas de una vez en `feat/pm5-counter-sync` — es una
  regla de seguridad (`.clerk/` puede contener secretos), no ruido.
- **`ios/FAHYBRIK.xcodeproj/project.pbxproj`** y su `.xcscheme` — salida de **XcodeGen** desde
  `ios/project.yml`. Trackeados pero generados; se regeneran solos. Sin valor.

| Worktree | Tamaño | Último commit | Sucio |
|---|---|---|---|
| `agent-a076cda737cb714a8` | 1.0G | 2026-08-09 | — |
| `agent-a0c9b3142687cc5cf` | 1.0G | 2026-08-07 | — |
| `agent-a125aeba35d1e9761` | 1.2G | 2026-08-10 | — |
| `agent-a138529ba6194ad2b` | 1.0G | 2026-08-06 | — |
| `agent-a197ec77ba8449768` | 1.2G | 2026-08-10 | — |
| `agent-a2327f840645f56cb` | 1.2G | 2026-08-13 | — |
| `agent-a2aa59a81bd5952a5` | 1.0G | 2026-08-09 | — |
| `agent-a4772a4cb5cdb6576` | 1.5G | 2026-07-29 | `web/.gitignore` |
| `agent-a48d6ae86ecb92ebe` | 1.2G | 2026-08-10 | — |
| `agent-a63f8f973bf2bcfba` | 69M | 2026-07-30 | — |
| `agent-a681321e3844b85b8` | 1.0G | 2026-08-07 | — |
| `agent-a694aa13df4090e5b` | 1.2G | 2026-08-10 | — |
| `agent-a6c772e4ca8c278f0` | 1.0G | 2026-08-07 | — |
| `agent-a6ec01c228fbd94a9` | 1.4G | 2026-07-29 | `web/.gitignore` |
| `agent-a6fdba0821f80e754` | 1.0G | 2026-08-07 | — |
| `agent-a76d05102d1262f32` | **4.1G** | 2026-07-29 | `web/.gitignore` |
| `agent-a7d8ca02816a492c5` | 1.4G | 2026-07-29 | `web/.gitignore` |
| `agent-a7f53123fada5e980` | 70M | 2026-07-30 | `web/.gitignore` |
| `agent-a8a5192fa4cad8c33` | 1.2G | 2026-08-12 | — |
| `agent-a9a92b311e31c4e0c` | 67M | 2026-07-29 | — |
| `agent-aa4a52cb64a5b8b6a` | 1.2G | 2026-08-13 | — · ver nota ① |
| `agent-aa4ae35c29efeb1c1` | 1.3G | 2026-07-29 | `project.pbxproj` + `web/.gitignore` |
| `agent-aa61cecf6c1d8187d` | 505M | 2026-07-30 | `web/.gitignore` |
| `agent-ab0154fdd68b5d91a` | 1.0G | 2026-08-09 | — |
| `agent-ab8f577402166261a` | 1.0G | 2026-08-07 | — |
| `agent-abb13e9249d8ac738` | 1.4G | 2026-07-29 | `web/.gitignore` |
| `agent-ac10d366337d13a19` | 78M | 2026-08-06 | — |
| `agent-ac1c3ac16bb4f0feb` | 62M | 2026-07-16 | `project.pbxproj` · ver nota ② |
| `agent-ac7c0af96772233a4` | 308M | 2026-08-12 | — |
| `agent-ace29ac5d1e3b3632` | 1.0G | 2026-08-07 | — |
| `agent-ad08d98de7f333b2c` | 1.2G | 2026-08-12 | — |
| `agent-ada936182b6d64b90` | 1.0G | 2026-08-07 | — |
| `agent-adb0218c5fe04c645` | 1.0G | 2026-08-09 | — |
| `agent-af638fe2d8543cc00` | 1.2G | 2026-08-10 | — |
| `agent-afb6ca19c5f2d016e` | 1.4G | 2026-07-29 | `web/.gitignore` |

**Nota ① — `agent-aa4a52cb64a5b8b6a` (parser FIT).** Tiene 2 commits por delante, pero
`git cherry` marca el commit de código (`66244a11`, parser FIT) como **ya presente** en la rama
de trabajo por `patch-id`; `web/lib/import/fit/parse.ts` existe en `feat/pm5-counter-sync`.
El único commit único es `41c736ed`, que solo toca `FOCUS.md` — y `FOCUS.md` ha avanzado desde
entonces. Nada que rescatar. Mismo caso, aún más limpio, en `agent-a2327f840645f56cb`
(su único commit sale `-` en `git cherry`, y `materialize.ts` ya está en la rama).

**Nota ② — `agent-ac1c3ac16bb4f0feb`.** Es el único worktree sobre una rama **con nombre real**
(`feat/tests-guiados-ios`), no una `worktree-agent-*`. Está **1282 commits por detrás y 0 por
delante**: todo su contenido ya está en la rama de trabajo. Quitar el worktree deja la rama
`feat/tests-guiados-ios` intacta.

### A.2 REQUIERE CONFIRMACIÓN — 4 worktrees, 4,8 GB

Aquí sí hay algo que se perdería o que hay que decidir. **Recordatorio: los commits sobreviven
a `git worktree remove`** — lo que está en juego es (a) que el trabajo quede olvidado en una rama
que nadie mirará, y (b) en un caso, un cambio sin commitear.

| Worktree | Tam. | Qué retiene | Por qué hay que decidir |
|---|---|---|---|
| `agent-a5d58e9d1fd1ff9b7` | 1.2G | **4 commits únicos** — «fases de un plan personal»: `shared/domain/plan-phases.ts`, `web/lib/dashboard/coach/program-week-phases.ts`, `FasesPlanPersonalModal.tsx`, endpoint `program-months/[id]/phases`, 17 ficheros, +1.661 líneas, con tests. | Ninguno de esos ficheros existe en la rama de trabajo. **Y trae `infra/migrations/0167_personal_plan_week_phases.sql`, que COLISIONA con `0167_coach_entitlements.sql` ya aplicada.** Si se rescata hay que renumerarla a `0197_*` (el journal usa el stem completo, así que la colisión no rompe el runner, pero el número engaña). |
| `agent-aed1713f03bb0bba2` | 1.0G | **6 commits únicos** — la traza de entreno + atribución de FC por ventana + el modo FC/LTHR del TSS: `web/lib/sync/hr-attribution.ts`, `backfill-hr-attribution.ts`, cambios en `ingest-garmin/polar/healthkit`, `record-workout-execution`, 18 ficheros, +1.302 líneas, con tests `.db`. | `hr-attribution.ts` **no existe** en la rama de trabajo. Es la pieza más grande sin integrar del inventario. |
| `agent-aa71d760bd0a68457` | 1.2G | **2 commits únicos** — pantalla `trae-tu-historico` del doble (importador de Garmin), 637 líneas, con entrada en `registry.ts`. | La carpeta **no existe** en la rama de trabajo y `registry.ts` no la menciona. Relacionado con el ZIP GDPR de Garmin que `FOCUS.md` marca como pendiente. |
| `agent-a8b8e1f9102b48934` | 1.4G | **Cambio SIN COMMITEAR** en `web/components/design-twin/screens/post-entreno/propuesta.tsx` (−21/+7): sustituye la función local `distribucionPropuesta` por `distribucionZonas` de `../../zonas`. | `web/components/design-twin/zonas.ts` **ya está en la rama** (commit `d5f8b78b`) y es byte a byte idéntico al del worktree, pero **`propuesta.tsx` sigue con su copia local** de la lógica. Es un arreglo DRY real de ~20 líneas que se perdería. El `zonas.ts` sin trackear del worktree es descartable (idéntico al trackeado). |

### A.3 NO TOCAR

1. **`/Users/alexsolecarretero/Public/projects/FAHYBRIK`** — el checkout principal, rama
   `feat/pm5-counter-sync`. Tiene trabajo sin commitear propio (`docs/tablero.html` modificado
   y los 102 ficheros de `screenshots/` borrados sin commitear, ver `architecture-map.md` §12.1).
2. **Las 105 ramas.** Borrar ramas NO forma parte de esta limpieza. `git worktree remove` no las
   toca; `git worktree prune` tampoco. Nadie ejecuta `git branch -D` en la fase siguiente.
3. **`git stash`** — prohibido en este repo (worktree compartido entre sesiones). No aparece en
   ningún comando de abajo.

### A.4 Caso aparte — el scratchpad de `/private/tmp`

```
/private/tmp/claude-501/-Users-alexsolecarretero-Public-projects-FAHYBRIK/
  2333b73a-78c2-48bc-820e-9d6714ddb9a6/scratchpad/wt-v2
```

Registrado en `git worktree list`, **fuera del repo**, en `HEAD` desacoplado sobre `4b2a21ba`.
Verificado que `4b2a21ba` **es ancestro de `feat/pm5-counter-sync`** → contenido preservado.
Sucio solo con salida de XcodeGen (`project.pbxproj` + `FAHYBRIKWatch.xcscheme`). Vive en `/tmp`,
así que desaparece al reiniciar y deja el registro colgando. **Es seguro** quitarlo del registro,
y hacerlo evita que `git worktree list` mienta después del próximo reinicio.

---

## B · Entorno

### B.1 La relación real

```
FAHYBRIK/.env.local                 -rw------- (600), 1803 bytes, GITIGNORADO
FAHYBRIK/web/.env.local  --symlink--> ../.env.local   (creado 2026-05-07)
```

Un solo sumidero de secretos, en la raíz, con el paquete `web` apuntando a él por symlink.
Claves presentes (solo nombres): `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `VAPID_PRIVATE_KEY`,
`VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `VERCEL_OIDC_TOKEN`, y cuatro `NEXT_PUBLIC_CLERK_*`.
**Ningún valor se ha leído, impreso ni copiado en este trabajo.**

Estado de ignore, comprobado con `git check-ignore`:

| Fichero | Estado |
|---|---|
| `.env.local` | IGNORADO ✅ |
| `web/.env.local` (symlink) | IGNORADO ✅ |
| `.env.local.bak.20260625-112132` | IGNORADO ✅ (pero es un secreto viejo de jun-2026 tirado en la raíz, 600) |
| `.env.example` | TRACKEADO ✅ (correcto) |

### B.2 Quién lee ese fichero — y quién NO

| Consumidor | ¿Lee `.env.local`? | Consecuencia |
|---|---|---|
| `next dev` / `next build` (`web/`) | **Sí** | Es la razón de ser del symlink. Correcto. |
| **Vitest** (`pnpm --filter @fahybrid/web test`) | **NO** | Ver B.3. |
| `infra/scripts/*` vía `infra/scripts/_db.ts` | **Sí, siempre** | `_db.ts` hace `loadEnvLocal()` de la **raíz** como efecto de módulo. Cualquier seed/backfill/migración **apunta a producción por defecto**. |
| `infra/scripts/_load_web_env.ts` | **Sí** | Los 4 scripts que corren desde `web/`. |

### B.3 Corrección de un hecho que la documentación da por cierto y no lo es

`docs/architecture-map.md` §11 afirma: *«Ese `DATABASE_URL` apunta a main de producción, **y
Vitest carga ese fichero**»*. **Medido hoy, eso es falso.**

Prueba empírica (config equivalente a `web/vitest.config.ts` — mismo `root`, mismo `setupFiles`,
mismo vitest 2.1.9 — imprimiendo solo hashes, nunca valores):

```
process.env.DATABASE_URL hash : 3f690a92ae
.env.local DATABASE_URL hash  : 1a64a885cf
¿coinciden? (= fuga a prod)   : NO
¿es el dummy de setup/env.ts? : SI
TEST_DATABASE_URL             : AUSENTE
otras claves de .env.local en process.env : ninguna
```

Tres evidencias independientes que apuntan a lo mismo:

1. El bundle de `vitest@2.1.9` **no contiene ninguna llamada a `loadEnv` ni a `dotenv`** (el único
   `loadEnv*` del dist es `loadEnvironment`, que es el entorno de test, no dotenv).
2. `vite.loadEnv` solo devuelve claves con prefijo `VITE_` y **no muta `process.env`**.
3. La sonda de arriba: dentro del run, `DATABASE_URL` es el dummy `127.0.0.1:5432/test-db` que
   inyecta `web/tests/setup/env.ts`, y ninguna otra clave del fichero está presente.

Y con la **config real**, una suite `.db` sin `TEST_DATABASE_URL`:

```
[test-db] TEST_DATABASE_URL not set — real-DB integration suites will be SKIPPED, not silently passed.
 ↓ tests/programming/cell-copy.db.test.ts (4 tests | 4 skipped)
 Test Files  1 skipped (1)
```

**Hay que corregir `architecture-map.md` §11 y la memoria
`reference_web_env_local_symlink_tests_hit_prod.md`.** Mientras digan lo contrario, el riesgo
real (B.4) queda tapado por un riesgo imaginario.

### B.4 El riesgo que SÍ existe

De 404 ficheros de test, **101 son `.db.test.ts` y los 101 usan `describeWithDb`** (comprobado uno
a uno: cero excepciones). Ninguno importa el cliente vivo de `@/lib/db` — los 12 imports de
`@/lib/db` en tests son **`import type`**. La red de seguridad está bien tejida. Quedan dos agujeros:

1. **`web/tests/setup/env.ts` cede ante el entorno.** Su guarda es
   `if (!process.env.DATABASE_URL)`. Si la shell ya lo exporta (un `source .env.local`, un
   `DATABASE_URL=… pnpm test`, una sesión de agente que lo heredó), el dummy **no se aplica** y
   los tests corren con lo que haya. Silencioso.
2. **Nadie valida `TEST_DATABASE_URL`.** Si se le pone por error la cadena de producción, las 101
   suites `.db` corren contra `main` **escribiendo**, y el reporte sale verde.

`.env.example` ya declara `TEST_DATABASE_URL=` (línea 18), pero sin una palabra sobre qué debe ser.

### B.5 Cómo correr tests sin apuntar a producción — hoy

```bash
# Unitarias (283 ficheros). Seguro tal cual: las .db se saltan explícitamente.
pnpm --filter @fahybrid/web test

# Antes, comprobar que la shell no trae nada heredado (si imprime algo, abrir shell limpia):
env | grep -E '^(DATABASE_URL|TEST_DATABASE_URL)=' | sed 's/=.*/=<set>/'

# Suites .db: rama Neon desechable, NUNCA main. Solo para ese comando, sin export global:
TEST_DATABASE_URL='<cadena de la rama desechable>' pnpm --filter @fahybrid/web test
```

Regla operativa: `TEST_DATABASE_URL` se pasa **en línea**, jamás se `export`ea ni se escribe en
`.env.local` — ahí lo heredaría `next dev` y todo lo demás.

### B.6 Cambio mínimo propuesto (**no aplicado**)

Tres cambios, un fichero de código, cero secretos tocados:

1. **`web/tests/setup/env.ts` — quitar la guarda y añadir el cortafuegos de host.**
   Que el dummy se aplique **siempre** (ningún test debe usar el cliente vivo), y que el arranque
   **falle en alto** si `TEST_DATABASE_URL` resuelve al mismo host que el `DATABASE_URL` del
   `.env.local` de la raíz. No hace falta cablear ningún host: se compara contra el fichero, así
   que sigue siendo agnóstico y no hay secreto nuevo en el repo. ~15 líneas.
2. **`.env.example` línea 18** — un comentario encima de `TEST_DATABASE_URL=` diciendo que es una
   **rama Neon desechable**, que se pasa en línea y que nunca puede ser la de producción.
3. **`docs/architecture-map.md` §11** — corregir la frase de B.3 y sustituirla por el riesgo real
   de B.4 (la guarda que cede ante el entorno + `TEST_DATABASE_URL` sin validar).

Fuera de alcance pero anotado: **`infra/scripts/_db.ts` no tiene cortafuegos** — carga la raíz y
va a producción por defecto. Solo `seed_demo.ts` y `retype_run_blocks.ts` comprueban el host antes
de escribir. Es un agujero mayor que el de los tests, y merece su propia decisión.

---

## C · Comandos exactos para la fase siguiente

Nada de esto se ha ejecutado.

### C.1 Rescatar primero lo de A.2 (antes de liberar nada)

```bash
cd /Users/alexsolecarretero/Public/projects/FAHYBRIK

# 1. El único cambio SIN COMMITEAR que vale algo (agent-a8b8e1f9, DRY de propuesta.tsx).
#    Guardarlo como parche fuera del repo antes de tocar el worktree:
git -C .claude/worktrees/agent-a8b8e1f9102b48934 \
  diff -- web/components/design-twin/screens/post-entreno/propuesta.tsx \
  > /tmp/rescate-propuesta-zonas.patch

# 2. Los 3 lotes con commits únicos: sus ramas ya lo preservan. Dejar constancia de
#    dónde está cada uno para que no se pierda entre 87 ramas de agente:
for b in worktree-agent-a5d58e9d1fd1ff9b7 \
         worktree-agent-aed1713f03bb0bba2 \
         worktree-agent-aa71d760bd0a68457; do
  echo "### $b"; git log --oneline feat/pm5-counter-sync..$b | cat
done
```

### C.2 Liberar los 35 seguros

```bash
cd /Users/alexsolecarretero/Public/projects/FAHYBRIK

RETENER="agent-a5d58e9d1fd1ff9b7 agent-aed1713f03bb0bba2 \
agent-aa71d760bd0a68457 agent-a8b8e1f9102b48934"

# ENSAYO — imprime solo, no borra. Debe listar 35 líneas.
for d in $(ls -1 .claude/worktrees | sort); do
  case " $RETENER " in *" $d "*) echo "RETENIDO  $d"; continue;; esac
  echo "quitaría  $d"
done | tee /tmp/plan-worktrees.txt
grep -c '^quitaría' /tmp/plan-worktrees.txt   # → tiene que dar 35

# EJECUCIÓN — --force porque los 12 sucios llevan el .gitignore / pbxproj desechables (A.1).
for d in $(ls -1 .claude/worktrees | sort); do
  case " $RETENER " in *" $d "*) continue;; esac
  git worktree remove --force ".claude/worktrees/$d"
done

# El scratchpad de /private/tmp (A.4):
git worktree remove --force \
  "/private/tmp/claude-501/-Users-alexsolecarretero-Public-projects-FAHYBRIK/2333b73a-78c2-48bc-820e-9d6714ddb9a6/scratchpad/wt-v2"

git worktree prune
```

### C.3 Verificar después

```bash
git worktree list | wc -l          # 41 → 5   (principal + los 4 retenidos)
du -sh .claude/worktrees           # 41G → ~4,8G
df -h /Users/alexsolecarretero     # 32Gi libres → ~68Gi
git branch --list | wc -l          # 105, SIN CAMBIOS: las ramas no se tocan
git status --porcelain | wc -l     # igual que antes: el checkout principal intacto
```

### C.4 Lo de las 3 líneas de `.clerk/` (independiente, 30 segundos)

```bash
printf '\n# clerk configuration (can include secrets)\n/.clerk/\n' >> web/.gitignore
git add web/.gitignore   # ruta explícita, nunca -A
```

---

## D · Lo que NO verifiqué

- **Si el trabajo retenido en A.2 vale la pena integrarse.** Leí qué ficheros toca y comprobé que
  no están en la rama; no juzgué si el diseño sigue vigente 300-500 commits después.
- **Si los 4 worktrees retenidos compilan o pasan tests.** No corrí `typecheck`, `lint` ni
  `vitest` dentro de ninguno.
- **La migración `0167_personal_plan_week_phases.sql` contra el esquema real.** No consulté Neon.
  Solo verifiqué la colisión de número contra `infra/migrations/`.
- **Los `node_modules` de cada worktree.** Asumo que los 41 GB son eso y `DerivedData`; no los
  desglosé por subcarpeta.
- **Nada de `garmin-ciq/` ni `zepp/`.** Fuera del alcance de este paso.
- **Los valores de cualquier `.env`.** Solo nombres de clave, permisos y estado de ignore.
