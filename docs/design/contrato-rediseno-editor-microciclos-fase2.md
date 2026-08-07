# CONTRATO — Rediseño del editor de microciclos, FASE 2 (agosto 2026)

**Todo agente de este encargo lee, en este orden: (1) `docs/CONTRATO-UI.md` §0-8+9, (2) `docs/design/contrato-rediseno-editor-microciclos.md` (fase 1 — reparto de ficheros original, decisiones cerradas, verificación), (3) este contrato, (4) `docs/DECISIONS.md` — las entradas del 2026-08-05 «La superserie es un FORMATO de bloque» y «Una medida de trabajo puede ser un RANGO» son la base directa de tu trabajo.**

La fase 1 (Semana/Día/Compositor) está en producción. Esta fase 2 cierra 4 huecos concretos que el propio rediseño dejó a la vista: rondas de circuito sin rango, reps sin forma de crear un rango desde cero, superserie invisible/no-creable, y «Opcional» todavía escondido en el título.

## Cimientos YA CONSTRUIDOS (commit `32e463cc`) — se usan, no se reinventan

- **`Prescription.rounds_max?: number`** (`shared/domain/prescription/types.ts`) — mismo patrón que `Measure.max`: `rounds` es el suelo (obligatorio si hay rondas), `rounds_max` el techo (opcional, aditivo). Validado: `rounds_max` no puede ser menor que `rounds`. Helper `roundsIsRange(p)`.
- **`prescriptionToText` ya renderiza la banda** ("3-4 rondas", "EMOM 3-4'", "3-4×90''") — no dupliques este formateador, si necesitas texto de rondas en tu UI usa `prescriptionToText` o el mismo patrón `rangeNum`.
- **`WeekDayPart.optional?: boolean` / `EditorBlock.optional?: boolean`** (`shared/schema/program-templates.ts`, `web/lib/dashboard/v2/editor-types.ts`) — atributo de BLOQUE (no de sesión; los dos casos reales encontrados —microciclo 76, domingo— son bloques sueltos). Autoritativo desde el input del day editor una vez hay UI (mismo contrato que `focus`/`title`); ausente en otros constructores de `EditorBlock` (biblioteca, IA, quickline) = implícitamente false, sin tocar esos ficheros.
- Tests que fijan el contrato: `web/tests/prescription/rounds-range.test.ts`, `web/tests/programming/editor-serialize-optional.test.ts` — NO los rompas.

**Cero migración SQL en ninguna pieza de fase 2**: `optional` y `rounds_max` viven en `slots_json` (jsonb). Si tu trabajo te hace pensar que necesitas una migración, para y pregunta — probablemente el modelo ya lo soporta y falta solo la UI.

## Reparto de ficheros — propiedad ESTRICTA (igual que fase 1)

- **STREAM A — Rondas en rango**: `web/components/v2/editor/archetype-forms/component-stations.tsx` (línea ~58-69, ya tiene el comentario `// Rondas con dedos: SIN rango (3-4) — eso es fase 2` marcando el sitio exacto).
- **STREAM B — Reps en rango (Series Iguales)**: `web/components/v2/editor/strength-shared-controls.tsx` (`SharedControls`, líneas 62-154) + `web/components/v2/controls/` si necesitas un control nuevo reutilizable (créalo ahí, no inline).
- **STREAM C — Superserie visible y creable**: `web/components/v2/editor/compositor-chrome.tsx` (`CompositorHeader` — necesita un picker de formato que hoy no existe) + `web/components/v2/editor/BlockItemTable.tsx` + `web/components/v2/editor/shared-dose.ts` (badges A1/A2 en la hoja del día) + `web/components/v2/editor/BlockEditor.tsx` si el picker necesita enganchar ahí.
- **STREAM D — «Opcional» end-to-end**: UI (toggle en el header del bloque, `web/components/v2/editor/SessionPartCard.tsx` + `compositor-chrome.tsx`), badge en Semana (`web/components/v2/planes/SemanaBoard.tsx`), reconocimiento del prefijo "OPCIONAL:"/"OPCIONA:" en el importador (`shared/domain/import/label.ts` o donde rastrees que se fija `EditorBlock.title` en `web/lib/import/build-proposal.ts`), y backfill de los 2 bloques reales del microciclo 76.

Si necesitas tocar un fichero de otro stream, anótalo en tu informe — el líder integra.

## STREAM A — Rondas en rango

`component-stations.tsx` usa un `Stepper` simple para rondas/minutos. Añade, junto al Stepper, un chip "hasta N" que active el rango — el mock aprobado (`docs/design/microciclos-editor-rediseno-mockup.html`, pestaña Compositor, panel "Transiciones carrera") ya prototipó exactamente esta interacción: botón `＋ rango`/`hasta N (3-4)` al lado del Stepper de rondas. Reutilízalo como referencia visual. Al activar el rango, `rounds_max` = rounds+1 por defecto (editable con su propio Stepper o el mismo chip). Al desactivar, `rounds_max` se borra (vuelve a cuenta fija) — nunca lo dejes fantasma con `rounds_max === rounds`. Aplica a los formatos que ya leen `rounds` (`rounds`, `emom`, `intervals`, `for_time`, `tabata` si procede) — mira `patternForBlock`/`archetypes.ts` para saber qué formatos pasan por este form.

## STREAM B — Reps en rango en «Series iguales»

Hoy el coach puede DESPLAZAR un rango existente (`stepReps` en `SharedControls`) pero no puede CREAR uno desde cero — verificado leyendo el código: no hay ningún control que ponga `measure.max`. Caso real que hoy no se puede escribir: "4 series de 12-15 repeticiones" (Compensatorio Glúteo, microciclo 76). Añade la forma de activar/desactivar un rango en el Stepper de reps — mismo patrón de "chip hasta N" que el Stream A, o un long-press/segundo valor, tu elección de interacción (subjetivo, documenta por qué). Al desactivar, borra `measure.max` limpio.

## STREAM C — Superserie visible y creable

Dominio YA DECIDIDO (DECISIONS.md 2026-08-05): `scheme:'superset'`/`format:'superset'` rota A1→A2→A1→A2; `sets` son series rectas. `SupersetForm.tsx` ya existe como archetype form pero **nada en la UI deja al coach ELEGIR `superset`** — verificado: `CompositorHeader` no tiene picker de formato, y `applyQuickDose`/`BlockEditor.tsx:113` solo PRESERVA `superset` si ya venía así (nunca lo asigna). Necesitas:
1. Un picker "Series rectas | Superserie" en el header del compositor, visible cuando el bloque es de fuerza y tiene ≥2 ejercicios. Al elegir superserie, fija `block.format = 'superset'` y normaliza el `scheme` de TODOS los items del bloque a `'superset'` (es una decisión de BLOQUE, no de ejercicio suelto — DECISIONS.md: "un grupo es N rondas × K estaciones").
2. En la hoja del día (`BlockItemTable.tsx`/`shared-dose.ts`), cuando el bloque es `superset`, las etiquetas de fila pasan de A/B/C a A1/A2/A3 (rotación) en vez de A/B/C (series rectas) — hoy son indistinguibles visualmente, que es exactamente la ambigüedad que DECISIONS.md señaló como real ("A1/A2 = circuito, A/B/C = series rectas — semántica que cambia la ejecución").

## STREAM D — «Opcional» end-to-end

1. **Toggle**: en el header del bloque (día/compositor), un control que fija `EditorBlock.optional`. El mock aprobado tiene el estilo de referencia (`.badge-op` en `docs/design/microciclos-editor-rediseno-mockup.html`) — replícalo, ahora como control clicable, no solo lectura.
2. **Badge en Semana**: `SemanaBoard.tsx`/`BlockLine` — el mismo badge, visible en la tarjeta de sesión (no solo al abrir el día). Verifica que las dos superficies (Semana y Día) lean el MISMO dato, no diverjan.
3. **Importador reconoce el prefijo**: busca dónde se fija el título de un bloque al construir la propuesta de importación (`web/lib/import/build-proposal.ts`, y `isBlockTitle`/`extractLabel` en `shared/domain/import/label.ts` como punto de partida) y añade el reconocimiento de un prefijo `OPCIONAL` (tolera el typo real `OPCIONA`, case-insensitive, con o sin dos puntos) que STRIPEA el prefijo del título y fija `optional: true`. Esto es reconocimiento de texto EXACTO, no inferencia — coherente con el resto de la gramática (RIR/RPE/%RM). Si el prefijo no está, `optional` queda ausente (false) — nunca lo infieras de otra señal.
4. **Backfill de datos reales**: microciclo 76 (coach 60, "Trainingpeaks"), domingo, tiene 2 bloques con título literal `"OPCIONA: REFUERZO HOMBRO"` y `"OPCIONAL: FUERZA PARTE ALTA (4 × 4)"`. Escribe un script pequeño (`infra/scripts/`, un solo uso, documentado) que localiza esos 2 bloques por microciclo+coach, limpia el prefijo del título, fija `optional:true`, y verifica ANTES/DESPUÉS con una query de solo lectura mostrando el diff exacto. Ejecútalo tú mismo contra `FAHYBRIK_DATABASE_URL` (de `~/.openclaw/credentials/vanwida-tokens.env`) — es UNA fila real de Alex, dos bloques, bajo riesgo, pero verifica el resultado con una query después, no asumas que el UPDATE fue el esperado.

## Verificación obligatoria por agente

Igual que fase 1: `pnpm install` en el worktree, `pnpm exec tsc --noEmit` limpio (única excepción tolerada: `tests/import/complete-gaps.test.ts:138`), `pnpm exec eslint` de tus ficheros, `pnpm exec vitest run tests/editor tests/prescription tests/programming tests/import` en verde — `quickline-grammar.test.ts`, `rounds-range.test.ts` y `editor-serialize-optional.test.ts` NUNCA se rompen. Commits pequeños, rutas explícitas, `git config user.email` = vanwida antes de tocar DB. Informe final: qué cambió (file:line), qué NO hiciste y por qué, «Verificado:».

## Copy y estilo

Mismo que fase 1: español de box, sin guiones largos, tokens `--v2-*` únicamente, `v2-focus` en todo interactivo, el color nunca es la única señal.
