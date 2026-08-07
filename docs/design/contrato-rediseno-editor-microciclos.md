# CONTRATO — Rediseño del editor de microciclos (fase 1, agosto 2026)

**Todo agente de este encargo lee, en este orden: (1) `docs/CONTRATO-UI.md` (§0-8 y §9 web),
(2) este contrato, (3) la maqueta aprobada `docs/design/microciclos-editor-rediseno-mockup.html`
(ábrela en navegador: es interactiva y ES la fuente de verdad visual — Alex la aprobó el 7-ago).**

## Qué es fase 1 (y qué NO)

Fase 1 = rediseño de presentación e interacción SIN tocar schema, API ni `shared/domain`.
- PROHIBIDO: migraciones, cambios en `shared/`, endpoints nuevos, cambios de `weekDayPartSchema`.
- Fuera de fase 1 (NO lo hagas aunque el mock lo insinúe): atributo «Opcional» como dato
  (hoy vive en el título, se deja tal cual), rondas en rango (3-4), arreglos del importador.
- El guardado sigue siendo el actual: `PUT /api/coach/program-weeks/[id]/day` con el
  serializador de `editor-serialize.ts`. Si tu rediseño «necesita» otro dato → NO lo necesita
  en fase 1: preséntalo derivándolo de lo que hay, o déjalo fuera y dilo en el informe.

## Cimientos (ya construidos — se usan, no se reinventan)

En `web/components/v2/controls/` (léelos antes de escribir un control):

| Control | API | Para |
|---|---|---|
| `Stepper` | `value, onChange, min?, max?, step?, format?, ariaLabel, size?` | series, reps, rondas |
| `ChipGroup<T>` | `options:{value,label,hint?}[], value, onChange, ariaLabel, mono?` | RIR, descansos, reps frecuentes, esquema |
| `TickBand` | `values, selection:{min,max?}|null, onChange, format?, ariaLabel` | %RM con rango a dos toques |
| `useHoldRepeat` | `(step)=>props de puntero` | cualquier −/＋ propio (pirámide) |

Tokens: SOLO `--v2-*` vía Tailwind arbitrary (`text-[color:var(--v2-muted)]`), como todo
`components/v2`. Cero hex, cero px mágicos (radios = `var(--v2-r-*)`). Clases utilitarias del
tema: `v2-display` (títulos italic-black), `v2-micro` (etiquetas), `v2-num` (cifras mono),
`v2-focus` (anillo de foco — obligatorio en todo interactivo). OJO al footgun `max-w-xl/xs`
(colapsa a 24px, lo caza eslint; usa valores arbitrarios como ya hace `DayEditor.tsx:741`).

## Reparto de ficheros — propiedad ESTRICTA

Cada agente toca SOLO sus ficheros. Si necesitas algo de otro fichero, se deriva con una
función local o se anota en el informe — NUNCA se edita el fichero de otro.

- **SEMANA**: `web/components/v2/planes/MicrocicloV2.tsx` (única propiedad).
- **DÍA**: `web/components/v2/editor/DayEditor.tsx`, `SessionPartCard.tsx`,
  `BlockItemTable.tsx` + nuevo `web/components/v2/editor/QuickAddLine.tsx`.
  (El shell del drawer `BlockEditorDrawer` vive en `DayEditor.tsx` → es del agente DÍA:
  conviértelo en drawer lateral derecho `min(680px,94vw)`, scrim `--v2-scrim`, cierre con
  Escape y click en scrim, `role="dialog" aria-modal`.)
- **COMPOSITOR**: `web/components/v2/editor/BlockEditor.tsx`, `PrescriptionFields.tsx`,
  `prescription-field-groups.tsx` (el CONTENIDO del drawer).
- Frontera DÍA↔COMPOSITOR: DÍA posee el shell (posicionamiento, scrim, animación);
  COMPOSITOR posee todo lo de dentro incluida la barra fija inferior «El atleta ve … + Guardar».

## Decisiones de diseño que NO se reabren (vienen del mock aprobado)

1. **Dosis común una vez.** Cuando todos los `items` de un bloque comparten esquema
   (mismo sets/reps/target/rest → compáralo con `setMeasure()`/`setTarget()`), la dosis se
   pinta UNA vez como línea de bloque y cada fila de ejercicio solo lleva su excepción
   («>78-80% RM», «lastrada») o «hereda N×M». Es presentación derivada: el dato guardado no
   cambia. Si los items divergen de verdad, cada fila pinta su dosis (no mientas agrupando).
2. **Quickline** (`QuickAddLine`): input mono con `›`, placeholder «Escríbelo como siempre:
   press banca 4x4 @78-80% r90 · 10x400m r1' · 45' carrera z2», atajo `/` para enfocar.
   Parsea EN CLIENTE con `parseNotationCell` de `@fahybrid/shared/domain/import` (client-safe,
   ya probado así en `RunStructureForm.tsx:14`). Chips verdes de lo entendido en vivo
   (`confidence:'detected'`), Enter inserta el bloque tipado. Contrato de honestidad: lo no
   entendido se dice («no lo he pillado entero») y se inserta marcado a revisar con el texto
   verbatim en `note` — JAMÁS se inventa un número. Para el `exercise_token`: usa la
   resolución de ejercicios que el editor ya tenga (ExercisePicker / endpoint existente);
   si no resuelve, el item lleva `exercise_name` del token y la fila ofrece el picker.
   NUNCA fabricar un `exercise_id`.
3. **Steppers/chips/ticks en vez de inputs** para todo número del compositor. El teclado
   sigue disponible como alternativa (accesibilidad + valores fuera de chips), nunca como
   único camino. RIR = chips 0-4 · descanso = chips 45″/60″/1'30/2'/3' + «otro» ·
   %RM = TickBand 50-95 de 5 en 5 con rango a dos toques.
4. **Pirámide por serie**: toggle «Series iguales | Variar por serie» (ChipGroup texto).
   Variar → rejilla por serie con −/＋ por celda (useHoldRepeat), «aplicar hacia abajo» (⇊,
   visible al hover de la fila) y «＋ serie» que copia la última. Esto edita `sets[]` per-set
   con `measure`/`target` propios — el modelo YA lo soporta, no toques el schema.
5. **«El atleta ve»** siempre visible al pie del compositor: la frase exacta que verá el
   atleta, generada de la prescripción tipada. Busca el formateador existente
   (`AthletePreviewLine` en BlockEditor) y elévalo a barra fija; no escribas un formateador
   nuevo si ya hay uno (CONTRATO-UI §2).
6. **Semana**: tarjeta de sesión = slot + título + bloques con su dosis en mono + lomo de
   color por modalidad (`--v2-mod-*`); pie de día con mini-barra de modalidades y «N ej»;
   weekstrip con sesiones/bloques/ejercicios + barra apilada + chip ámbar «N bloques sin
   dosis» (un bloque sin dosis = ningún item con prescripción utilizable); día vacío =
   tarjeta compacta con «＋ Entreno · Descanso · Copiar otro día aquí», NUNCA columna a
   toda altura. El color NUNCA es la única señal (CONTRATO-UI): siempre acompaña texto.
7. **Densidad**: nada de espacios muertos. La jerarquía la dan tipografía (v2-display para
   nombres de día/bloque) y hairlines, no el aire. Referencia de compacidad: el mock, no el
   editor actual.

## Verificación obligatoria por agente (antes de dar por hecho)

1. `pnpm install` en el worktree (web/) — los worktrees no comparten `node_modules`.
2. `pnpm exec tsc --noEmit` limpio (los warnings 71007 de props-serializables preexistentes
   no cuentan; regresiones nuevas sí). EXCEPCIÓN CONOCIDA: hay UN error preexistente en
   `tests/import/complete-gaps.test.ts:138` (TS2322, del encargo del importador, commit
   12bee41d). No es tuyo, NO lo arregles y no cuenta como fallo tuyo; cualquier OTRO error sí.
3. `pnpm exec eslint <tus ficheros>` limpio.
4. Si tocas lógica con tests (`web/tests/editor/*`), córrelos; `quickline-grammar.test.ts`
   pinea la gramática del QuickLine de run-structure — NO lo rompas.
5. Commit(s) pequeños con `git add <rutas explícitas>` (jamás `-A`, jamás stash) y mensaje
   honesto. Informe final: qué cambió (file:line), qué NO hiciste, bloque «Verificado:».

## Copy

Español natural de box (CONTRATO-UI §7 aplica en espíritu): «serie», «descanso», «rondas»,
«escríbelo como siempre». Cero jerga técnica (nada de «prescripción», «parser», «esquema
inválido») en superficie. Sin guiones largos en copy. Los números en mono (`v2-num`).
