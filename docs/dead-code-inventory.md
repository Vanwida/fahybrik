# Inventario de código muerto — PASO 4

Levantado el **2026-08-14** sobre `feat/pm5-counter-sync` (`ce6108b6`).
**PASO 5 (este commit):** borradas las 7 rutas de §7. Los 49 REVISAR siguen.
La verificación de callers se re-hizo también sobre `origin/main` (`7ac632b9`)
antes de borrar: 0 callers de código.

Complementa `docs/architecture-map.md` §12 y `docs/safety-cleanup-inventory.md`
(PASO 1–2). Este paso **verifica** lo que un recuento a ciegas llamaría muerto.

---

## 0 · De dónde salen «56 ficheros» y «872 exports»

Ningún documento del repo (AGENTS, architecture-map, design-system-web,
safety-cleanup, auditorías, DECISIONS) escribe esas dos cifras juntas.

**56 ficheros — reconstruido y medido hoy.** Es el corte que aparece si se
juntan las dos listas que el mapa y un grafo de imports dejan encima de la mesa:

| Origen | N |
|---|---|
| Módulos TS/TSX de `web/` con **0 import estático** tras excluir entradas Next, `i18n/*`, `manifest`, `public/sw.js`, scripts CLI y pantallas del doble (las carga `registry.ts`) | **40** |
| One-shots de `infra/scripts/` que `architecture-map.md` §12 nombra (`apply_00XX` × 6 + repair/fix/rescue/retype × 10) | **16** |
| **Total** | **56** |

Los 40 y los 16 existen todos en disco. Abajo va cada uno.

**872 exports — no se reproduce.** No hay informe knip/ts-prune en el repo, y
AGENTS.md dice explícitamente que no hay herramienta de dead-export. Medido
hoy sobre 2.421 ficheros de código (`web` + `shared` + `infra`):

| Corte | Cifra |
|---|---|
| Declaraciones `export function/class/const/type/interface` + `export { … }` | **9.833** |
| De esas, handlers Next (`GET`/`POST`/`generateMetadata`/…) | 1.140 (no cuentan) |
| Exports cuyo identificador **no aparece en ningún otro fichero TS** | **1.780** |
| …y el fichero sí está importado (no es un módulo huérfano) | **1.680** |
| …solo valores (no `type`/`interface`) | **689** |
| …valores, excluyendo `design-twin` | **602** |
| …todo `web/` | 1.135 (424 valores) |
| …todo `shared/` | 536 |
| …todo `infra/` | 9 |

Ningún corte da 872. Tratar 872 como «exports muertos borrables» sería
inventar. La cifra real que se puede defender es **1.680 identificadores
exportados en ficheros vivos que nadie nombra en otro `.ts`**. Eso **no** es
una lista de borrado: un `import *`, un consumidor Swift, un export público de
`@fahybrid/shared`, un server action o un nombre usado por string rompen el
supuesto. Ver §4.

---

## 1 · Método

Grafo de imports propio (no knip: no está en el workspace y no se instaló).
Resolución de `@/`, `@fahybrid/shared/*`, relativos, y `index.ts` de carpeta.
`from '…'` / `import('…')` / `require('…')` en una sola pasada, también
multilínea.

Antes de marcar muerto se cruzó, por candidato:

- imports estáticos y `import()`
- rutas App Router (`page.tsx`, `route.ts`, `layout.tsx`, `manifest.ts`)
- next-intl (`web/i18n/request.ts`, `routing.ts`, `navigation.ts`)
- `vercel.json` crons
- `package.json` scripts (raíz, web, infra, shared)
- `shared/package.json` `exports`
- tests (`web/tests/**`, `*.test.ts` al lado)
- `web/components/design-twin/registry.ts` (`import * as` de cada pantalla)
- comentarios que claman un caller (p.ej. Garmin → `reconcile`)
- `docs/DECISIONS.md` cuando el mapa decía «verificar antes»
- strings Swift solo para los ítems históricos de `auditoria_profunda`
  (magic-link atleta ≠ magic-link coach)

No se ejecutó `knip`. No se tocó lint/typecheck. No se pegó a HTTP.

---

## 2 · Cifras reales (ficheros)

| Universo | N |
|---|---|
| `.ts`/`.tsx` en `web/` (sin `node_modules`/`.next`) | 2.145 |
| `.ts` en `shared/` | 219 |
| `.ts` en `infra/` | 54 |
| **Código escaneado** | **2.421** |
| Con ≥1 import estático o entrada (Next/test/CLI/script) | 2.381 |
| `web/` con 0 import estático (los 40) | 40 |
| Candidatos §12 de infra (los 16) | 16 |
| **Candidatos de este inventario (56)** | **56** |
| De los 56, **BORRADO SEGURO** | **7** (5 `apply_*` + 2 TSX; ver recuento bajo la tabla) |
| De los 56, **REVISAR** | **49** |
| De los 56, **NO BORRAR** | **0** (los NO BORRAR de alrededor van en §5–6) |

**Recuento BORRADO SEGURO = 7, no 8.** La lectura «`apply_0020`–`apply_0025` = 6
ficheros + `DemoSignIn` + `SignInForm` = 8» es un rango aritmético, no una lista
de ficheros. En disco **no existe** `apply_0022.ts` (hueco documentado en
`migrate.ts` y `0028_migration_journal.sql`: el número se saltó, no se borró).
Los `apply_*` SEGURO son cinco: `0020`, `0021`, `0023`, `0024`, `0025`.
`apply_0026.ts` existe y es el sexto `apply_*`; está en **REVISAR** (§3.2 #46).
5 + 2 = **7**. Las 7 rutas están en §7.

Más ruido que el mapa señalaba y **no** entra en los 56: worktrees (ya
limpiados en PASO 2), `screenshots/` (102 trackeados, 0 en disco),
`design_handoff_fhp/`, HTML de `web/public/`, ficheros de raíz, `button.tsx`.
Van en §5 porque el mapa los nombra.

---

## 3 · Los 56, uno a uno

Leyenda: **BORRADO SEGURO** = 0 callers, 0 ruta HTTP, 0 test, 0 script npm, y
hay un sucesor explícito o el propio runner los declara superados.
**REVISAR** = 0 import no basta: CLI, sucesor dudoso, DECISIONS, comentario
de SQL, o UI que puede ser WIP.
**NO BORRAR** no aparece en esta tabla: ninguno de los 56 es intocable, pero
casi todos son REVISAR.

### 3.1 · `web/` — 40 módulos sin import estático

| # | Fichero | Estado | Clasificación | Por qué |
|---|---|---|---|---|
| 1 | `web/app/auth/sign-in/DemoSignIn.tsx` | existe | **BORRADO SEGURO** | 0 importers. `page.tsx` es solo `redirect('/sign-in')`. El demo vivo es `/acceso-demo` + `POST /api/demo/login`. |
| 2 | `web/app/auth/sign-in/SignInForm.tsx` | existe | **BORRADO SEGURO** | 0 importers. Único sitio que llamaría a `POST /api/auth/email`. Borrar el form **no** borra la ruta. |
| 3 | `web/components/v2/ajustes/SettingRow.tsx` | existe | **REVISAR** | 0 importers. Ajustes usa `CoachProfileForm`. Presentacional; podría cablearse. |
| 4 | `web/components/v2/atleta-detalle/PerfilTab.tsx` | existe | **REVISAR** | 0 importers. La ficha tiene 5 tabs (`resumen/plan/rendimiento/del-coach/atleta`); pinta `AtletaTab`, no esto. UI grande: sucesor o resto. |
| 5 | `web/components/v2/planes/parts.tsx` | existe | **REVISAR** | 0 importers. El comentario dice que las pantallas 6–7 lo usan; no lo hacen. No confundir con `atleta-detalle/parts.tsx` (ese sí vive). |
| 6 | `web/components/v2/UnderConstruction.tsx` | existe | **REVISAR** | 0 importers. `FOCUS.md` aún aparca «29 rutas coach sin pantalla»: el placeholder puede ser el hueco. |
| 7 | `web/lib/coach/ai-persist-workout.ts` | existe | **REVISAR** | `persistWorkoutFromAiSuggestion` solo existe aquí. Parece el persist de suggest-week/workout, nunca cableado. |
| 8 | `web/lib/coach/athlete-benchmark-tests.ts` | existe | **REVISAR** | Reexport de `@fahybrid/shared/domain/coach/test-battery`. El shared lo llama stub muerto. 0 imports de esta ruta. Compat shim. |
| 9 | `web/lib/coach/columns.ts` | existe | **REVISAR** | 0 imports de esta ruta. El stem `columns` aparece por todas partes: no es evidencia. |
| 10 | `web/lib/coach/methodology-live-editor.ts` | existe | **REVISAR** | Solo un `PHASE = '2+'` y una checklist. 0 readers. `DECISIONS` no lo nombra. |
| 11 | `web/lib/dashboard/athletes/status-pills.ts` | existe | **REVISAR** | 0 importers. `programming-status.ts` (vivo) es otra cosa. |
| 12 | `web/lib/dashboard/coach/athlete-status.ts` | existe | **REVISAR** | `computeAthleteState` 0 callers. Roster vive en `v2/atletas-status.ts`. |
| 13 | `web/lib/dashboard/coach/athlete-training-level.ts` | existe | **REVISAR** | Wrapper a shared. El vivo es `@/lib/coach/athlete-training-level`. Esta ruta: 0 imports. |
| 14 | `web/lib/dashboard/coach/hoy-data.ts` | existe | **REVISAR** | `loadTriageData` 0 callers. `/hoy` usa `hoy-lanes.ts`. Ensamblador grande: confirmar que no queda un import dinámico de servidor. |
| 15 | `web/lib/dashboard/coach/methodology/use-rule-parse.ts` | existe | **REVISAR** | 0 callers de UI. Solo lo menciona `rule-vm.ts` al lado. Motor de metodología: `DECISIONS` lo da por muerto, decisión de borrar vs revivir abierta. |
| 16 | `web/lib/dashboard/coach/modality-types.ts` | existe | **REVISAR** | 0 imports. Analytics de modalidad tiene tipos propios. |
| 17 | `web/lib/dashboard/coach/team-pulse.ts` | existe | **REVISAR** | `loadTeamPulse` 0 callers. Ni `hoy-data` lo importa. Umbrales se fueron a `signal-config.ts`. |
| 18 | `web/lib/dashboard/coach/weekly-verdict-rules.ts` | existe | **REVISAR** | Wrapper a shared. El vivo es `@/lib/coach/weekly-verdict-rules` + tests. Esta ruta: 0 imports. |
| 19 | `web/lib/dashboard/constants/block-format.ts` | existe | **REVISAR** | 0 imports. Posible resto V1 del studio. |
| 20 | `web/lib/dashboard/constants/day-block-sections.ts` | existe | **REVISAR** | 0 imports. |
| 21 | `web/lib/dashboard/constants/session-status.ts` | existe | **REVISAR** | 0 imports. |
| 22 | `web/lib/dashboard/exercises/filter-exercises.ts` | existe | **REVISAR** | `filterExercises` 0 callers. |
| 23 | `web/lib/dashboard/hooks/use-autosave.ts` | existe | **REVISAR** | `useDebouncedAutosave` 0 callers. Hook de editor V1. |
| 24 | `web/lib/dashboard/programming/block-defaults.ts` | existe | **REVISAR** | 0 imports. `block-to-part.ts` **sí** vive (tests + editor V2). No mezclar. |
| 25 | `web/lib/dashboard/programming/block-origin.ts` | existe | **REVISAR** | 0 imports. |
| 26 | `web/lib/dashboard/programming/block-panel.ts` | existe | **REVISAR** | 0 imports. |
| 27 | `web/lib/dashboard/programming/group-colors.ts` | existe | **REVISAR** | 0 imports. |
| 28 | `web/lib/dashboard/programming/part-factory.ts` | existe | **REVISAR** | Se importa a sí el comentario de `block-defaults`. 0 callers externos. |
| 29 | `web/lib/dashboard/programming/part-summary.ts` | existe | **REVISAR** | 0 imports. |
| 30 | `web/lib/dashboard/programming/template-session.ts` | existe | **REVISAR** | 0 imports. |
| 31 | `web/lib/dashboard/programming/use-media-query.ts` | existe | **REVISAR** | `useMediaQuery` 0 callers. |
| 32 | `web/lib/dashboard/programming/use-portal-mount.ts` | existe | **REVISAR** | `usePortalMount` 0 callers. |
| 33 | `web/lib/dashboard/programming/use-slots-history.ts` | existe | **REVISAR** | `useSlotsHistory` 0 callers. Undo del canvas V1. |
| 34 | `web/lib/dashboard/templates/format-segment.ts` | existe | **REVISAR** | 0 imports. |
| 35 | `web/lib/rag/types.d.ts` | existe | **REVISAR** | Ambient `declare module 'mammoth'` para `import()` en `lib/rag/parse.ts`. Borrar puede romper `typecheck` aunque nadie lo importe. |
| 36 | `web/lib/studio/labels.ts` | existe | **REVISAR** | `partUiForBlock` 0 callers. `studio/blocks.ts` y `section-types.ts` **sí** viven. |
| 37 | `web/lib/studio/slug.ts` | existe | **REVISAR** | `slugifyExerciseName` 0 callers. 9 líneas; barato de dejar. |
| 38 | `web/lib/sync/reconcile.ts` | existe | **REVISAR** | El header dice que el webhook Garmin lo llama. **Mentira hoy:** `reconcileWorkout` no aparece en `ingest-garmin.ts` ni en ningún otro `.ts`. Lógica de producto (Garmin gana a HealthKit), no un stub. |
| 39 | `web/lib/templates/meta-json.ts` | existe | **REVISAR** | 0 imports de esta ruta. |
| 40 | `web/lib/templates/station-defaults.ts` | existe | **REVISAR** | 0 imports. `shared/domain/hyrox/stations.ts` lo nombra en un comentario como prefill del editor. |

Ninguno de los 40 aparece en `web/tests/**`.

### 3.2 · `infra/scripts/` — 16 one-shots del mapa

En disco hay **6** `apply_00XX.ts`: `0020`, `0021`, `0023`, `0024`, `0025`,
`0026`. **No hay** `apply_0022.ts`. De esos 6, **5 son BORRADO SEGURO** y
`apply_0026.ts` es REVISAR (comentario en el SQL vivo). No escribir
«`apply_0020`–`apply_0025`» como si fueran 6 ficheros.

| # | Fichero | Estado | Clasificación | Por qué |
|---|---|---|---|---|
| 41 | `infra/scripts/apply_0020.ts` | existe | **BORRADO SEGURO** | Era manual. `migrate.ts` los declara superados. No está en npm. |
| 42 | `infra/scripts/apply_0021.ts` | existe | **BORRADO SEGURO** | Igual. |
| — | `infra/scripts/apply_0022.ts` | **no existe** | — | Hueco: el número se saltó. No entra en los 56 ni en el 7. |
| 43 | `infra/scripts/apply_0023.ts` | existe | **BORRADO SEGURO** | Igual que 0020. |
| 44 | `infra/scripts/apply_0024.ts` | existe | **BORRADO SEGURO** | Igual. |
| 45 | `infra/scripts/apply_0025.ts` | existe | **BORRADO SEGURO** | Igual. |
| 46 | `infra/scripts/apply_0026.ts` | existe | **REVISAR** | Superado por `migrate.ts`, **pero** `infra/migrations/0026_partner_id_unique.sql` aún dice que este script es el executor (CONCURRENTLY fuera de txn). El runner ya cubre eso. Borrar exige actualizar el comentario del SQL vivo. |
| 47 | `infra/scripts/repair_0017.ts` | existe | **REVISAR** | Sigue en `infra/package.json` → `repair:0017`. El DDL de 0017 ya lo aplica `migrate.ts`. |
| 48 | `infra/scripts/fix_week1_balanced_segments.ts` | existe | **REVISAR** | One-shot ids 51/76–81. El mapa lo da por consumido. `DECISIONS` no pide conservarlo ni lo nombra. |
| 49 | `infra/scripts/fix_double_encoded_jsonb.mjs` | existe | **REVISAR** | One-shot host-guarded. Consumido. No está en DECISIONS. |
| 50 | `infra/scripts/rescue_inferred_intensity_blocks.ts` | existe | **REVISAR** | One-shot post-retype. Consumido. Apunta a `rollup_block_needs_review.ts`. |
| 51 | `infra/scripts/retype_core_mobility_blocks.ts` | existe | **REVISAR** | `DECISIONS` (2026-08, gramática de `block_exercises`) los cita como el script que **produjo** los datos actuales. No es caller; es procedencia. |
| 52 | `infra/scripts/retype_erg_blocks.ts` | existe | **REVISAR** | Igual. |
| 53 | `infra/scripts/retype_functional_blocks.ts` | existe | **REVISAR** | Igual. |
| 54 | `infra/scripts/retype_run_blocks.ts` | existe | **REVISAR** | Igual. Además documenta el host-guard. |
| 55 | `infra/scripts/retype_strength_blocks.ts` | existe | **REVISAR** | Igual. |
| 56 | `infra/scripts/backfill_optional_block_flag_microciclo76.ts` | existe | **REVISAR** | One-shot de 2 filas (id real 180, no 76). El mapa lo da por consumido. |

`repair_block_exercises_grammar.ts` **no** está en los 56 del mapa (el mapa
decía «verificar en DECISIONS»). DECISIONS lo deja «listo para retomar» →
**NO BORRAR**. Ver §6.

---

## 4 · Exports — por qué 872 no se puede usar

Un identificador exportado que no aparece en otro `.ts` **no** es un export
muerto. En este repo falla por, al menos:

| Canal que un grep de identificador no ve | Ejemplo |
|---|---|
| `import * as X` + `X.foo` | pantallas del doble (`registry.ts`) |
| Reexport de barril (`export { Foo } from`) | `shared/schema/index.ts`, `components/v2/index.ts` |
| Contrato público `@fahybrid/shared` | `shared/package.json` `exports` (22 claves + globs). iOS no importa TS: el shape es el contrato |
| Rutas Next / server actions | `GET`/`POST`/`generateMetadata` (ya filtrados: 1.140) |
| MCP tools | `web/lib/mcp/tools-*.ts` registra por nombre |
| Tests que importan el símbolo | no son «muerto» |
| Comentarios / docs / Swift | `BrandLogo` es asset iOS, no el componente web (ya no existe) |

**Clasificación de la cifra 1.680:** **REVISAR** como clase, no como lista de
borrado. No hay **BORRADO SEGURO** a nivel export sin una pasada 1×1 con el
compilador (knip o `tsc` + references). AGENTS.md lo prohíbe («no borrar
exports por si acaso»).

Cortes que **no** se proponen borrar aunque el identificador esté solo:

- todo `shared/schema/*` y `shared/domain/*` exportado en `package.json`
- handlers y metadata de `web/app/`
- exports de `components/design-twin/screens/*/index.tsx` (el registry los
  carga por namespace)
- `@deprecated` en schemas si `normalize*` aún tipa con ellos — la
  `auditoria_profunda` ya avisó: `params_json` + `prescription_json` es
  dual-write **intencional**

---

## 5 · Lo que el mapa §12 nombra y no está en los 56

Estos **existen**. No son los 56. Se clasifican para no mezclarlos.

| Ítem | ¿Existe? | Clasificación | Nota |
|---|---|---|---|
| `screenshots/` 102 PNG trackeados | trackeados sí; en disco **0** (solo `.DS_Store`) | **REVISAR** | Inconsistencia git. Decisión de Alex: commitear el borrado o restaurar. No es código. |
| `infra/scripts/apply_00XX.ts` | sí, 6 | ver §3.2 | 5 SEGURO + `apply_0026` REVISAR |
| Repair/fix/retype/rescue/backfill76 | sí, 10 | ver §3.2 | todos REVISAR |
| `web/*.tsbuildinfo` (3) | sí, **untracked** (gitignore) | — | No es candidato git. Ensucian el árbol local. |
| `logo.JPG` | sí, trackeado | **REVISAR** | 0 refs de código. Asset de raíz. |
| `Grupos_Entrenamiento_HYROX.xlsx` (raíz) | sí, trackeado | **NO BORRAR** | `import_blocks_xlsx.ts` lee **esta** ruta. SHA256 = el de `docs/Grupos_Entrenamiento_HYROX.xlsx` (duplicado exacto). El de `docs/` es el sobrante. |
| `docs/Grupos_Entrenamiento_HYROX.xlsx` | sí | **REVISAR** | Duplicado byte a byte del de raíz. |
| `verificacion.json` | sí, **untracked** | **REVISAR** | Fichero de trabajo en raíz. No está en git. |
| `upload-target-video.json` | sí, **untracked** | **REVISAR** | Igual. |
| `.env.local.bak.20260625-112132` | sí, **untracked**, modo 600 | **REVISAR** | Secreto viejo en raíz. No commitear. No imprimir. |
| `.DS_Store` | sí, untracked | — | Ruido local. |
| `design_handoff_fhp/` (8 ficheros, trackeados) | sí | **NO BORRAR** | Handoff histórico. Candidato a `docs/archivo/`, no a rm. |
| `components/ui/button.tsx` | sí | **NO BORRAR** | El mapa y `design-system-web.html` dicen 0 usos. **Falso hoy:** lo importan `LeadStatusControl.tsx` y `BorrarPlanPersonalModal.tsx`. Además es el ancla del plan shadcn. |
| `components/ui/MIcon.tsx` | sí | **NO BORRAR** | Decenas de usos. |
| `.playwright-mcp/` | sí, gitignorado | — | Artefactos de sesión. |
| `README.md` desactualizado | sí | — | Copy, no código muerto. |

HTML sueltos en `web/public/` (Next los sirve, aunque nadie los enlace):

| Fichero | HTTP | Clasificación |
|---|---|---|
| `web/public/metodo.html` | `/metodo.html` | **NO BORRAR** como si fuera muerto. Copia de `docs/methodology/manual.html`. URL pública. |
| `web/public/intake-redesign.html` | `/intake-redesign.html` | **REVISAR** | Mock; solo un comentario en `AthleteAnswers.tsx`. Sigue siendo URL. |
| `web/public/solicitudes-wearables.html` | `/solicitudes-wearables.html` | **REVISAR** | `noindex`. 0 refs de código. Sigue siendo URL. |

---

## 6 · Lo que un grep «0 imports» mataría y está vivo

No están en los 56. Se listan para que el siguiente paso no los «descubra».

| Ítem | Por qué no está muerto |
|---|---|
| `web/components/design-twin/screens/*/index.tsx` (~50) | `registry.ts` hace `import * as`. Cero `from '@/…/index'` y aun así son el doble. |
| `web/i18n/request.ts` | Convención next-intl. |
| `web/app/manifest.ts` | PWA. Entrada Next. |
| `web/public/sw.js` | Service worker. |
| Todo `infra/scripts/seed_*` cableado en npm | CLI, no import. |
| `infra/scripts/migrate.ts`, `_db.ts`, `_load_web_env.ts` | Runner y cliente. |
| `infra/scripts/repair_block_exercises_grammar.ts` | DECISIONS: «listo para retomar». |
| `infra/scripts/parse_blocks_lib.ts` / `parse_blocks_structured.ts` | Tests + npm `parse:blocks`. |
| `infra/scripts/clone_block_library.ts` | Paso del pipeline demo. |
| `web/lib/auth/magic-link.ts` + `demo-login.ts` + rutas `/api/auth/email`, `/api/auth/demo-login`, `/auth/verify` | HTTP vivo. iOS **no** usa `/api/auth/email` (usa `/api/auth/email/request`). Clerk es el login coach; estas rutas aún minten (o intentan). **Dead auth reachable = NO BORRAR en este paso.** |
| `web/app/auth/sign-in/page.tsx` | Redirect permanente. Borrar la URL rompe bookmarks. |
| `web/lib/security/csrf.ts` | 0 callers de runtime; **sí** lo fija `web/tests/security/csrf.test.ts`. |
| `web/components/templates/template-types.ts` | Lo usan `lib/studio/{blocks,section-types,labels}.ts`. |
| `web/lib/dashboard/programming/{studio-types,block-to-part,day-composition,assign-month}.ts` | Editor V2 + APIs + tests. Los hermanos huérfanos de §3.1 no los arrastran. |
| `params_json` / `prescription_json` | Dual-write intencional (`auditoria_profunda`). |
| Los 6 componentes de `auditoria_profunda` (WorkoutBlockCard, MacroProgressRibbon, LogoMark, PlanView web, templates-browse, template-builder) | **Ya no existen.** `components/dashboard/` y `(app)` tampoco. |
| `button.tsx` | 2 usos. El design-system está desfasado. |

`web/components/v2/index.ts` no reexporta `UnderConstruction` ni `SettingRow`
ni `PerfilTab`. Un import desde el barril no los salvaría hoy.

---

## 7 · Primera tanda pequeña

**7 rutas, ni 6 ni 8.** 5 one-shots `apply_*` + 2 componentes de auth huérfanos.
Un commit, rutas explícitas, sin `-A`. **Borradas en este commit.**

| # | Ruta | Grupo |
|---|---|---|
| 1 | `infra/scripts/apply_0020.ts` | apply (5) |
| 2 | `infra/scripts/apply_0021.ts` | apply (5) |
| 3 | `infra/scripts/apply_0023.ts` | apply (5) |
| 4 | `infra/scripts/apply_0024.ts` | apply (5) |
| 5 | `infra/scripts/apply_0025.ts` | apply (5) |
| 6 | `web/app/auth/sign-in/DemoSignIn.tsx` | auth (2) |
| 7 | `web/app/auth/sign-in/SignInForm.tsx` | auth (2) |

```
infra/scripts/apply_0020.ts
infra/scripts/apply_0021.ts
infra/scripts/apply_0023.ts
infra/scripts/apply_0024.ts
infra/scripts/apply_0025.ts
web/app/auth/sign-in/DemoSignIn.tsx
web/app/auth/sign-in/SignInForm.tsx
```

No entra `apply_0022.ts` (no existe).
No entra `apply_0026.ts` (comentario en la migración viva → REVISAR).
No entra ningún export suelto.
No entra `UnderConstruction` / `SettingRow` / `PerfilTab`.
No entra `screenshots/` (decisión de Alex).
No se toca FLEXR. No se toca `magic-link.ts`.

### Cruzado de las 7 (re-verificado 2026-08-14; borradas en PASO 5)

Por cada ruta: `import()` / `require()`, scripts npm (raíz, web, infra),
`web/tests/**`, `registry.ts` del doble, `ios/` + `project.yml` + `garmin-ciq/`
+ `zepp/`, y docs operativos (`AGENTS.md` / `Agents.md`, `FOCUS.md`,
`DECISIONS.md`, `safety-cleanup-inventory.md`).

| Canal | Resultado |
|---|---|
| Import estático o `import('…')` hacia estas 7 rutas | **0** |
| Ruta HTTP (App Router) | **Ninguna de las 7 es `page.tsx` / `route.ts`.** `web/app/auth/sign-in/page.tsx` es solo `redirect('/sign-in')` y no importa los dos TSX. Borrar los TSX no cambia `/auth/sign-in`. Los `apply_*` no son HTTP. |
| `package.json` scripts (raíz / web / infra) | **0.** Infra tiene `migrate` y `repair:0017`; no hay `apply:0020` ni equivalente. |
| Tests | **0** hits en `web/tests/**` ni `*.test.ts` al lado. |
| `web/components/design-twin/registry.ts` | **0** |
| iOS / Swift / `project.yml` | **0** refs a estas rutas. `ios/FAHYBRIK/Auth/DemoSignInView.swift` es **otro** tipo (login demo del atleta); homónimo, no caller de `DemoSignIn.tsx`. |
| `garmin-ciq/`, `zepp/` | **0** |
| Docs operativos (AGENTS, FOCUS, DECISIONS, safety-cleanup) | **0** |
| SQL vivo 0020 / 0021 / 0023 / 0024 / 0025 | **No nombran** su `apply_00XX.ts`. Solo `0026_partner_id_unique.sql` nombra un apply (`apply_0026.ts`) — y ese no está en esta tanda. |

Menciones que **no** son callers (inventario / historia / auditoría):

- `infra/scripts/migrate.ts` y `0028_migration_journal.sql` hablan de la era
  `apply_00XX` como **superada** por el runner.
- `docs/architecture-map.md` §12 nombra el grupo de **6** `apply_00XX.ts`
  (los 5 de esta tanda + `apply_0026`) como muertos por diseño.
- `docs/auditoria_profunda.html` lista `SignInForm.tsx` y `DemoSignIn.tsx`
  como UI de auth huérfana (0 render sites). Confirmado: `page.tsx` no los
  importa.

### Pruebas necesarias (después de borrar, no ahora)

```bash
# 1. Nadie los importa (debe quedar vacío)
rg -n 'apply_0020|apply_0021|apply_0023|apply_0024|apply_0025|DemoSignIn|SignInForm' \
  --glob '!docs/**' --glob '!**/node_modules/**'

# 2. Types de los paquetes tocados
pnpm --filter @fahybrid/infra typecheck
pnpm --filter @fahybrid/web typecheck

# 3. Auth unitarias (no tocan DB)
env -u DATABASE_URL -u TEST_DATABASE_URL \
  pnpm --filter @fahybrid/web test tests/auth

# 4. No lanzar migrate. No lanzar seeds.
```

`/auth/sign-in` debe seguir respondiendo 307/308 a `/sign-in` (la `page.tsx`
no se toca). `/api/auth/email` sigue existiendo hasta un paso de auth aparte.

---

## 8 · Comandos usados y limitaciones

```text
# recuentos
find web shared infra -type f \( -name '*.ts' -o -name '*.tsx' \) \
  ! -path '*/node_modules/*' ! -path '*/.next/*' | wc -l
rg --no-filename -o '^export (async )?(function|class|const|let|var|enum|type|interface) ' \
  web shared infra -g '!**/node_modules/**' -g '!**/.next/**' | wc -l

# grafo (script local, no commiteado)
node /tmp/fahybrid-dead-code-fast.mjs
# salida: /tmp/fahybrid-dead-code-report.json

# existencia y git
git ls-files screenshots | wc -l          # 102
find screenshots -type f                  # solo .DS_Store
shasum Grupos_Entrenamiento_HYROX.xlsx docs/Grupos_Entrenamiento_HYROX.xlsx
git ls-files --error-unmatch <candidato>
rg -n "from '@/components/ui/button'" web

# cruzado por candidato: rg del stem, de la ruta, de import(), de tests
```

Limitaciones, dichas:

- **No corrí knip ni ts-prune.** 872 no se puede contrastar con la herramienta
  que (quizá) lo produjo. Si esa herramienta existió, su informe no está en
  el repo.
- El grafo no ejecuta TypeScript: un `export type` reexportado por `export *`
  y usado solo como tipo puede colarse en los 1.680.
- No se recorrió iOS en busca de Swift muerto. El 56/872 es universo TS.
- No se recorrió `garmin-ciq/` ni `zepp/`.
- No se pegó a las URLs (`/metodo.html`, `/api/auth/email`, `/auth/verify`).
  Se asume que Next sigue sirviendo lo que hay bajo `app/` y `public/`.
- No se abrió Neon. Un one-shot «consumido» en el mapa puede seguir haciendo
  falta en una rama vieja.
- `FOCUS.md` no se actualizó (este paso no commitea).
- HEAD (`ce6108b6`) no es el `df2e5b4f` del mapa: el checkout avanzó.

---

## 9 · Correcciones al mapa / design-system (hechos, no propuestas)

| Afirmación | Hoy |
|---|---|
| `components/ui/button.tsx` tiene 0 usos | **Falso.** 2 imports V2. |
| Vitest carga `.env.local` | Ya corregido en el mapa §11 (PASO 3). |
| `components/dashboard/` y `(app)` son candidatos V1 | **Ya no existen.** |
| Seis componentes huérfanos de `auditoria_profunda` | **Ya no existen.** |
| 39 worktrees / 41 GB | PASO 2: 6 worktrees, ~4.9G. |

---

Verificado:

- Los 56 ficheros de §3 existen; cada ruta se listó y se cruzó con rg.
- 872 no aparece en docs ni como corte limpio del grafo.
- `button.tsx` tiene 2 usos; `Grupos_Entrenamiento_HYROX.xlsx` de raíz lo lee
  el importador; `screenshots/` está trackeado y vacío en disco.
- No se borró nada. No se modificó código. No hay commit.
- No verifiqué runtime HTTP ni una rama Neon. Un one-shot «consumido» puede
  seguir siendo la única receta de un backfill viejo.
