# El plan compacto — lo que el reloj Garmin recibe (29-09-2026)

Formato de cable de UNA sesión para la app Connect IQ (`modelo.md` §8, arreglo A1). Prototipo en el doble: `web/components/design-twin/kit-garmin/plan-compacto/`; el destino es `shared/domain/watch-plan/`. Serializa el contrato de `kit-reloj/paso.ts` (`PlanSesion`: pasos + zonas + reglas) más una cabecera. Vectores de oro: `web/tests/design-twin/fixtures/garmin-plan/` (46 ficheros). Examen: `pnpm exec vitest run tests/design-twin/kit-garmin-plan-compacto` (218 pruebas, 0 mocks).

## 1. El formato, campo a campo

API: `codificarSesion(plan, meta) → Uint8Array`, `decodificarSesion(bytes) → { meta, plan }` (`decodificarPlan(bytes) → PlanSesion`). Todo es una lista de enteros ≥ 0 (los «valores») + una tabla de cadenas. **Ausente = 0, presente = valor + 1.** Decimales: ejes (ritmo, pulso, RPE, %RM, inclinación) ×10; **kilos ×100 siempre**; fracción del método ×100. El codificador no redondea: un valor que no cabe exacto se rechaza. Un campo con varios trozos pequeños se empaqueta en un valor (bits de bajo a alto).

| Sección (orden del cable) | Campos |
|---|---|
| Contenedor | versión de esquema (1) · nº de cadenas · cada cadena (bytes + UTF-8) · valores hasta el final |
| Cabecera | `asignacionId`, `huella` (31 bits), `fitSport`, `fitSubSport` (dato del servidor, opacos), `entorno` (0 = mixto o sin decir), `duracionEstS`, `estructura` (línea del brief, cadena) |
| Zonas de pulso | n · techos en bpm · procedencia (estimada/medida) · nombres opcionales |
| Bandas de ritmo | n juegos × (unidad km/500 m · procedencia · n · [`rapidoS`, `lentoS`+1]) en s enteros |
| Reglas de aviso | 5 holguras · cadencia · confirmación · gracia de zona · preaviso s y m · preaviso mínimo · 2 flags (calentamiento, recuperación) |
| Vocabulario | clases usadas (clase, nombre, género) · los 7 formatos con nombre · las 11 palabras del RPE 0–10 |
| Método | resumen (pares mínimos, umbral %, guardado quieto) · anotar (reps de más, RPE y RIR mín/máx/paso, kg máx) |
| Tablas | tareas del WOD (nombre, flags, dosis, carga) y listas de tareas: una vez, las citan los pasos |
| Paso (plano) | `clase` · rol 2b + fase 2b + cierre 1b · medida (tipo 3b + quién mide 3b, prescrito+1) · banderas (nº objetivos 2b + 12 de presencia) · extras (recupera, entorno, máquina, Roxzone) si hay |
| … objetivos | por objetivo: eje 4b + papel 2b + lleva palabra + aviso 2b · mín+1 · máx+1 · palabra |
| … resto | posición (máscara de 5 contadores + slot; n y de) · bloque · nombre · carga (kg×100, implementos) · tempo (4) · cue · vuelta auto (m) · damper · WOD por formato · ficha de fuerza · dobles |

Decodificar en Monkey C = un cursor y `leer()`: varint de 7 bits por byte (`bytes[p]`, sin reservar memoria); tablas de cadenas con `StringUtil.convertEncodedString`; el sobre `{"v":1,"b":"<base64>"}` se convierte a `ByteArray` con el conversor base64 del sistema **[?]**: las APIs de `ByteArray`/`StringUtil` no se han ejecutado, se verifican al escribir el `.mc` contra los vectores. No hay floats ni BigInt: el reloj compara en décimas/centésimas enteras.

**Sin texto libre.** Las únicas cadenas: nombre de catálogo (≤ 40), cue (≤ 120, se **trunca con «…»** y el informe lo anota; ninguna sesión real lo necesita), palabra de RPE (≤ 40), la línea de estructura (≤ 120) y el vocabulario. Un nombre de catálogo con cifras (una dosis escondida) falla el examen. `id` del paso y la clave de ejercicio no viajan: un paso es su posición y un ejercicio su ordinal (`canonico.ts`).

## 2. Decisión A/B, con medidas (26 planes de sesiones reales)

- **A** · JSON de arrays posicionales con tabla de cadenas: `{"v","s":[…],"d":[…]}`, la MEJOR versión de A (una lista plana, sin claves ni sub-arrays por paso).
- **B** · binario de varints, en base64 dentro de un JSON mínimo.

| | A (JSON) | B binario | B en el sobre (base64) |
|---|---|---|---|
| Suma de las 26 sesiones | 29 190 B | **14 517 B** (0,50×) | 19 756 B (0,68×) |
| Mayor (488) | 2 475 B | **1 160 B** | 1 562 B |
| En RAM tras decodificar (las 26) | 8 208 `Number` en un `Array` | un `ByteArray` de 558 B de media | |

**Elegido: B.** Dos veces menor en crudo y 1,5 veces menor incluso con el base64; en A la respuesta entera se parsea a objetos antes de poder leer nada (pico de RAM, sin medir en reloj: T6 **[?]**), en B es una cadena que se convierte una vez y se lee con `bytes[p]`. Mismo resultado semántico (test: A y B decodifican a lo mismo). Con gzip A ≈ B (11,6 vs 12,7 KB): no decide, y el móvil entrega el cuerpo ya descomprimido **[?]**. El serializador de A vive solo en el helper de medidas: no es código de producción. 6 KB de binario son exactamente 8 192 caracteres de base64 = la clave máxima de Storage.

## 3. Tamaños (bytes de binario · caracteres de base64 · pasos)

| Sesión | pasos | B | b64 | Sesión | pasos | B | b64 |
|---|---|---|---|---|---|---|---|
| 491 | 2 | 274 | 368 | 492 fuerza | 50 | 1 021 | 1 364 |
| 494 | 1 | 270 | 360 | 492 circuito | 27 | 677 | 904 |
| 573 | 1 | 250 | 336 | 498 EMOM | 12 | 478 | 640 |
| 479 | 22 | 567 | 756 | 572 EMOM | 15 | 507 | 676 |
| 551 | 12 | 389 | 520 | 506 circuito | 12 | 535 | 716 |
| 509 | 36 | 644 | 860 | 506 wod | 12 | 496 | 664 |
| 535 | 18 | 546 | 728 | 552 | 1 | 270 | 360 |
| 538 correr | 21 | 565 | 756 | 493 circuito | 15 | 591 | 788 |
| 538 fuerza | 33 | 919 | 1 228 | 493 con Roxzone | 20 | 576 | 768 |
| 488 | 54 | **1 160** | 1 548 | 482 | 12 | 473 | 632 |
| 529 fuerza | 44 | 1 034 | 1 380 | 505 | 15 | 484 | 648 |
| 529 antes/después | 35 | 746 | 996 | 530 | 10 | 432 | 576 |
| 514 | 1 | 293 | 392 | 536 | 4 | 320 | 428 |

**Mayor 1 160 B (19 % del presupuesto), media 558 B, 0 sesiones fuera.** Peor día con dos sesiones (488 + 529): 2 194 B; dos medias: 1 117 B. La cabecera (zonas, reglas, vocabulario, método) pesa 275 B por sesión, el 49 % del total: si molesta se sube a un `perfil` por descarga (ahorra ≈ 200 B por sesión) sin tocar el modelo. **Sin datos en el doble: 511, 513 y 542** (los tres son del encargo; no se rellenan). 21 de las 24 sesiones del encargo tienen plan.

Al límite (sintéticas, en el examen): HYROX completo 33 pasos → 832 B · AMRAP de 6 tareas → 338 B · EMOM 60 × 4 → 1 213 B (la tabla de tareas evita repetir el ciclo) · 100 series con su descanso (200 pasos) → 4 416 B, caben · **200 series con descanso = 400 pasos → 8 578 B: +200 pasos sobre el tope y +2 434 B (+40 %)** · 200 series sin descanso (200 pasos) → 7 354 B, +1 210 B (+20 %). Una serie de fuerza completa pesa ≈ 36 B. Si algún día hiciera falta, la salida es deduplicar cuerpos de paso (estimado, sin medir: del orden de dos tercios menos en series repetidas); no se implementa: la mayor real usa el 19 %.

## 4. Huecos del modelo (no se parchean en el codificador)

1. **`PlanSesion` no tiene dónde llevar el método del coach.** Nombres de clase (15 lecturas directas de `NOMBRE_CLASE_DEFECTO` en 8 ficheros del kit), de formato, palabras del RPE, `METODO_RESUMEN` y `RANGO_ANOTAR`: el kit lee los `*_DEFECTO` tal cual. Afecta a las 26 sesiones (HARD RULE Nº0). Hoy viaja en `MetaSesion`. Propuesta: `PlanSesion.vocabulario` y `.metodo`, y el kit lee de ahí.
2. **`formatoDe` escribe tres nombres de formato fuera de `NOMBRE_FORMATO_DEFECTO`**: «Series» (479, 509, 535, 551), «Fuerza» (488, 529, 492) y «Continuo» (536). Propuesta: añadir esas claves al vocabulario (el cable lleva 3 cadenas más).
3. **Los dobles llevan texto libre**: `pareja` (un nombre), `estacion` (repite `nombre` + dosis: «SkiErg 1km») y `nota` («alterna 25»). Ninguna sesión real los usa; el examen los marca no admitidos. Propuesta: `pareja` al plan, `estacion` derivada, `nota` → `alternaCada: { tipo, n }`.
4. **`zona` no dice de qué familia es**: el kit solo resuelve pulso (`ZonasCoach` en bpm), pero el servidor tiene zonas de ritmo por modalidad (`ResolvedZone`, por km y por 500 m). En 530 y 536 («Row @Z3», «SkiErg @Z2») es ambiguo. Propuesta: `Objetivo.escala: 'ppm' | 'ritmo'`. El cable ya lleva ambos juegos de bandas.
5. **`ZonasCoach` no sabe si son estimadas o medidas** (G6 lo exige) ni tiene bandas de ritmo: viajan en `MetaSesion`. Propuesta: `procedencia` en `ZonasCoach`. Las bandas del servidor llevan 2 decimales: se redondean a segundo entero (±0,5 s/km).
6. **El grupo del coach no existe como dato.** «6 × (1000 m / r 90″)» y las tandas salen de `filasDePasos`, que agrupa por nombre + dosis + objetivos serializados. La página Estructura del reloj tendría que portar esa heurística; la línea del brief va como texto derivado en español (`meta.estructura`, de 7 a 44 B en las sesiones reales) y pide i18n en servidor. Afecta a las sesiones con series (479, 509, 535, 538, 551, 488, 529, 492). Propuesta: `PasoBase.grupo?: { id, veces }` (≈ 4 B por grupo) y que el reloj componga el texto.
7. **538 solo existe partida** en dos planes (correr y fuerza): no hay un plan de la sesión entera. **511, 513 y 542 no existen** (542 exige M6, HYROX half-sim como estructura).
8. Menores: `PasoBase.id` y `fuerza.ejercicio` son claves de UI (contador global): en el contrato compartido, índice y ordinal · `hoyDe` revienta en un plan sin paso de trabajo (`grupoPrincipal` devuelve `undefined`; lo cazó el generador al azar) · `wod.ciclo` se repite en cada ventana del modelo (el cable lo deduplica).

## 5. Qué haría falta en el servidor

- **A1**: contrato (`PlanSesion`, `PasoBase`, `MetaSesion`) en `shared/` con Zod, más el builder `AssignmentDetail → pasos`; el códec (`formato`, `flujo`, `codificar`, `decodificar`, `transporte`, `canonico`) pasa tal cual a `shared/domain/watch-plan/` y `meta.ts` es el esqueleto del builder de cabecera.
- Endpoint por lotes: `{ sesiones: [{ id, huella, plan: "<base64>" }] }`, con `id` y `huella` FUERA del blob para no volver a bajar lo que el reloj ya tiene. Pedir pocos días por petición (la respuesta entera vive en RAM): T5/T6.
- Validar al servir: rechazar o partir lo que pase de 6 KB o 200 pasos, y devolver el `codigo` del `ErrorPlanCompacto` (`no-entero`, `cadena-larga`, `clave-desconocida`, `vocabulario-incompleto`…).
- Rellenar la cabecera con los valores EFECTIVOS del coach (vocabulario, palabras del RPE, método), nunca con un defecto del reloj; bandas en enteros; `fit_sport`/`fit_sub_sport` del mapa A4.
- Cambiar el orden de una tabla rompe a los relojes instalados: solo se añade al final y sube `VERSION_ESQUEMA`; el reloj rechaza una versión que no conoce y lo dice.
- Regenerar los vectores: `cd web && ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json scripts/garmin-plan-fixtures.ts` (`--medidas` imprime la tabla de este doc).
