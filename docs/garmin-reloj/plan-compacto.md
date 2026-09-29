# El plan compacto — lo que el reloj Garmin recibe (29-09-2026, esquema v2 del 30-09)

Formato de cable de UNA sesión para la app Connect IQ (`modelo.md` §8, arreglo A1). Prototipo en el doble: `web/components/design-twin/kit-garmin/plan-compacto/`; el destino es `shared/domain/watch-plan/`. Serializa el contrato de `kit-reloj/paso.ts` (`PlanSesion`: pasos + zonas + reglas) más una cabecera. Vectores de oro: `web/tests/design-twin/fixtures/garmin-plan/` (46 ficheros). Examen: `pnpm exec vitest run tests/design-twin/kit-garmin-plan-compacto` (0 mocks). **Esquema v2** (30-09): el método del coach, la procedencia de las zonas, las bandas de ritmo y la pareja viajan EN `PlanSesion` (ya no en la cabecera), el cable no lleva ninguna cadena derivada en español y `MetaSesion` queda con la cabecera de la sesión.

## 1. El formato, campo a campo

API: `codificarSesion(plan, meta) → Uint8Array`, `decodificarSesion(bytes) → { meta, plan }` (`decodificarPlan(bytes) → PlanSesion`). Todo es una lista de enteros ≥ 0 (los «valores») + una tabla de cadenas. **Ausente = 0, presente = valor + 1.** Decimales: ejes (ritmo, pulso, RPE, %RM, inclinación) ×10; **kilos ×100 siempre**; fracción del método ×100. El codificador no redondea: un valor que no cabe exacto se rechaza. Un campo con varios trozos pequeños se empaqueta en un valor (bits de bajo a alto).

| Sección (orden del cable) | Campos |
|---|---|
| Contenedor | versión de esquema (2) · nº de cadenas · cada cadena (bytes + UTF-8) · valores hasta el final |
| Cabecera (`MetaSesion`) | `asignacionId`, `huella` (31 bits), `fitSport`, `fitSubSport` (dato del servidor, opacos), `entorno` (0 = mixto o sin decir), `duracionEstS`. La línea del brief ya NO viaja: el reloj la compone de los grupos |
| Zonas de pulso (`plan.zonas`) | n · techos en bpm · `procedencia` (estimada/medida, obligatoria si hay zonas) · nombres opcionales |
| Bandas de ritmo (`plan.bandasRitmo`) | n juegos × (unidad km/500 m · procedencia · n · [`rapidoS`, `lentoS`+1]) en s enteros |
| Reglas de aviso | 5 holguras · cadencia · confirmación · gracia de zona · preaviso s y m · preaviso mínimo · 2 flags (calentamiento, recuperación) |
| Vocabulario (`plan.vocabulario`) | clases usadas (clase, nombre, género) · los 10 formatos con nombre (+ Series, Fuerza, Continuo) · las 11 palabras del RPE 0–10 |
| Método (`plan.metodo`) | resumen (pares mínimos, umbral % de pieza hecha, guardado quieto) · anotar (reps de más, RPE y RIR mín/máx/paso, kg máx) |
| Pareja (`plan.pareja`) | nombre de pila de la pareja de dobles, una vez por sesión |
| Tablas | tareas del WOD (nombre, flags, dosis, carga) y listas de tareas: una vez, las citan los pasos |
| Paso (plano) | `clase` · rol 2b + fase 2b + cierre 1b · medida (tipo 3b + quién mide 3b, prescrito+1) · banderas (nº objetivos 2b + 12 de presencia) · extras (recupera, entorno, máquina, Roxzone) si hay |
| … objetivos | por objetivo: eje 4b + papel 2b + lleva palabra + aviso 2b + escala 2b (pulso/ritmo, solo en `zona`) · mín+1 · máx+1 · palabra |
| … resto | posición (máscara de 5 contadores + slot; n y de) · bloque · nombre · carga (kg×100, implementos) · tempo (4) · cue · vuelta auto (m) · damper · WOD por formato · ficha de fuerza · dobles (turno, reps, % tuyo, `alternaCada`) · grupo del coach (id, veces) |

Decodificar en Monkey C = un cursor y `leer()`: varint de 7 bits por byte (`bytes[p]`, sin reservar memoria); tablas de cadenas con `StringUtil.convertEncodedString`; el sobre `{"v":1,"b":"<base64>"}` se convierte a `ByteArray` con el conversor base64 del sistema **[?]**: las APIs de `ByteArray`/`StringUtil` no se han ejecutado, se verifican al escribir el `.mc` contra los vectores. No hay floats ni BigInt: el reloj compara en décimas/centésimas enteras.

**Sin texto libre.** Las únicas cadenas: nombre de catálogo (≤ 40), cue (≤ 120, se **trunca con «…»** y el informe lo anota; ninguna sesión real lo necesita), palabra de RPE (≤ 40), la pareja, el nombre de una zona y el vocabulario. Nada derivado viaja (ni la línea del brief, ni la estación de dobles, ni el pacto). Un nombre de catálogo con cifras (una dosis escondida) falla el examen. `id` del paso y la clave de ejercicio no viajan: un paso es su posición y un ejercicio su ordinal (`canonico.ts`).

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

**Mayor 1 147 B (19 % del presupuesto, la 488), media 556 B, 0 sesiones fuera** (tabla de arriba: medidas del esquema v1; con v2 cada sesión pesa entre 3 y 13 B menos por quitar la línea del brief y entre 1 y 8 más por el `grupo`/`escala` cuando existen). Peor día con dos sesiones (488 + 529): 2 171 B; dos medias: 1 113 B. La cabecera (zonas, reglas, vocabulario, método) pesa unos 275 B por sesión, casi la mitad del total: si molesta se sube a un `perfil` por descarga (ahorra ≈ 200 B por sesión) sin tocar el modelo. **Sin datos en el doble: 511, 513 y 542** (los tres son del encargo; no se rellenan). 21 de las 24 sesiones del encargo tienen plan.

Al límite (sintéticas, en el examen): HYROX completo 33 pasos → 832 B · AMRAP de 6 tareas → 338 B · EMOM 60 × 4 → 1 213 B (la tabla de tareas evita repetir el ciclo) · 100 series con su descanso (200 pasos) → 4 416 B, caben · **200 series con descanso = 400 pasos → 8 578 B: +200 pasos sobre el tope y +2 434 B (+40 %)** · 200 series sin descanso (200 pasos) → 7 354 B, +1 210 B (+20 %). Una serie de fuerza completa pesa ≈ 36 B. Si algún día hiciera falta, la salida es deduplicar cuerpos de paso (estimado, sin medir: del orden de dos tercios menos en series repetidas); no se implementa: la mayor real usa el 19 %.

## 4. Huecos del modelo (no se parchean en el codificador)

Estado tras el arreglo del 30-09 (commits `21d76d56` y `60bc2e00` en la rama `worktree-agent-ab0b0d1b919beec05`):

1. **CERRADO (contrato y cable) · el método del coach en el plan.** `PlanSesion.vocabulario` y `.metodo` (`kit-reloj/metodo.ts`: `vocabularioDe`, `metodoDe`, `nombreDeClase`), con los `*_DEFECTO` como fallback de un solo sitio. Lo leen del plan los sitios que ya tienen el plan a mano (garmin-fuerza, las escenas de «después»). **PENDIENTE**: unos 20 sitios del kit leen `NOMBRE_CLASE_DEFECTO` desde funciones puras de un paso (`contextoDe`, `nombreCuenta`, `textoViene`, `vozInicio`…) que no reciben el plan; pasarlo exige un contexto común (cross-cutting, pide mini-mapa y OK).
2. **CERRADO · `formatoDe`** ya no escribe texto fuera del vocabulario: «Series», «Fuerza» y «Continuo» están en `NOMBRE_FORMATO_DEFECTO` (el cable lleva 3 cadenas más).
3. **CERRADO · dobles sin texto libre.** `PlanSesion.pareja` (una por sesión), `estacion` derivada del paso (`estacionDe`), `nota` → `Dobles.alternaCada: { tipo: 'metros' | 'reps' | 'segundos', n }` (`textoAlterna` escribe el pacto). El codificador rechaza un `nota` sin `alternaCada` y una pareja por estación.
4. **CERRADO · `Objetivo.escala: 'ppm' | 'ritmo'`** para el eje `zona` (530 «Row @Z3», 536 «SkiErg @Z2»). Ausente = pulso. El kit todavía RESUELVE solo pulso: quien lea una zona de ritmo (Garmin) usa `plan.bandasRitmo`.
5. **CERRADO (contrato y cable) · `ZonasCoach.procedencia`** (obligatoria en el cable si hay zonas) y `PlanSesion.bandasRitmo` (km / 500 m, con su procedencia) en el mismo plan. Decisión: las bandas de ritmo van a nivel de plan y no dentro de `ZonasCoach`, para que un atleta sin zonas de pulso pueda llevarlas. **PENDIENTE**: que el kit diga «estimada» donde pinta una zona (G6); hoy ninguna pantalla del kit lee `procedencia`.
6. **CERRADO · el grupo del coach como dato.** `PasoBase.grupo?: { id, veces }`; `filasDePasos` (estructura, brief, `hoyDe`) agrupa por él cuando existe y usa sus `veces`; sin él, la heurística de siempre. El cable lleva 2 valores por paso agrupado y **ya no lleva la línea del brief** (`meta.estructura` eliminada). Que el reloj Garmin componga el texto del brief desde los grupos queda para su `.mc`.
7. **PARCIAL · 538 solo existe partida** (correr y fuerza). **511, 513 y 542**: ver el informe del encargo (C).
8. **PARCIAL · menores.** `hoyDe`/`grupoPrincipal` seguros sin paso de trabajo: CERRADO (`439d5f9b`). `wod.ciclo` repetido en cada ventana: el cable lo deduplica. **NO HECHO**: `PasoBase.id` y `fuerza.ejercicio` como índice y ordinal en el contrato: el cable ya no los lleva (`canonico.ts`), pero en el kit `id` es la clave del registro de la corona y de React en unas 40 pantallas; cambiarlo es un cruce que pide mini-mapa.

## 5. Qué haría falta en el servidor

- **A1**: contrato (`PlanSesion`, `PasoBase`, `MetaSesion`) en `shared/` con Zod, más el builder `AssignmentDetail → pasos`; el códec (`formato`, `flujo`, `codificar`, `decodificar`, `transporte`, `canonico`) pasa tal cual a `shared/domain/watch-plan/` y `meta.ts` es el esqueleto del builder de cabecera.
- Endpoint por lotes: `{ sesiones: [{ id, huella, plan: "<base64>" }] }`, con `id` y `huella` FUERA del blob para no volver a bajar lo que el reloj ya tiene. Pedir pocos días por petición (la respuesta entera vive en RAM): T5/T6.
- Validar al servir: rechazar o partir lo que pase de 6 KB o 200 pasos, y devolver el `codigo` del `ErrorPlanCompacto` (`no-entero`, `cadena-larga`, `clave-desconocida`, `vocabulario-incompleto`…).
- Rellenar la cabecera con los valores EFECTIVOS del coach (vocabulario, palabras del RPE, método), nunca con un defecto del reloj; bandas en enteros; `fit_sport`/`fit_sub_sport` del mapa A4.
- Cambiar el orden de una tabla rompe a los relojes instalados: solo se añade al final y sube `VERSION_ESQUEMA`; el reloj rechaza una versión que no conoce y lo dice.
- Regenerar los vectores: `cd web && ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json scripts/garmin-plan-fixtures.ts` (`--medidas` imprime la tabla de este doc).
