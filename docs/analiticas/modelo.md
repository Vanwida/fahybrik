# Analíticas, rehechas — el modelo (29-09-2026)

Petición de Alex (28-09): «una página de analíticas digna de competir contra TrainingPeaks; la de ahora es un poco desastrosa, no hay nada que me guste; tenemos la capacidad de contar todos los entrenos porque están tipados». Superficies (elegido por Alex): **las dos, un solo cálculo** — la pestaña del atleta en el iPhone y las analíticas del atleta en el panel web del coach.

Sale de tres investigaciones del 28/29-09: inventario de lo que hay (21 problemas, P1–P21), inventario de datos reales (cobertura por modalidad) y mercado con fuentes oficiales (TrainingPeaks a fondo; Garmin, Strava, WHOOP, Apple, Runna, Hevy, Strong, Concept2, HYROX, Intervals.icu, Final Surge).

**Listón:** todo lo que TrainingPeaks da a un atleta y a un coach, en español de box, para las cinco familias de entreno a la vez — y lo que TrainingPeaks no puede dar porque no tiene los entrenos tipados.

---

## 1. Por qué se rehace — causas raíz

1. **Siete contratos para una pestaña** (`/analytics` muerto, `/sections/{5}`, `/running/progress`, `/lecturas`, `/running/{historial,tendencias,capacidad}`, `/drilldown`) y seis ventanas de tiempo distintas (7/30/365 d en UTC, 12 sem fijas, 4 sem/6 m/1 a, 84 d, 7/28 d, 90 d).
2. **Tres cargas y dos ACWR** para lo mismo (P2), VFC/FC reposo/sueño tres veces con tres basales (P3, P16), «Forma» con dos significados (P4), cuatro definiciones de «qué es correr» (P17).
3. **La carga casi no existe:** solo cuenta la FC con umbral MEDIDO y nadie lo tiene; queda el RPE → 8 % del tiempo con carga, cuando el 47 % de las sesiones tiene FC suficiente. La potencia del ergo no está conectada.
4. **El coach no ve lo que ve el atleta:** cálculos distintos, ventanas 42/7 fijas frente al método del coach en el atleta (P15), el método de analíticas sin editor.
5. **Rótulos que mienten** (P1 unidades del veredicto, P5 «este mes» = 30 d, P7 delta contra otra cosa) y textos internos a la vista (P11, P12).
6. **Solo correr tiene analítica de verdad;** ergo, fuerza y HYROX son tarjetas sueltas sin «¿mejoro?».
7. **Dos lenguajes visuales** y series normalizadas 0..1 sin ejes reales (P21).

## 2. Principios

**A1 · Un cálculo, dos pintores.** Un solo motor puro (`shared/domain/analytics/`), un solo cargador por atleta (`web/lib/analytics/`), un solo contrato. La ruta del atleta y la del coach devuelven EXACTAMENTE lo mismo para el mismo atleta y ventana; el coach añade capas, nunca otra cifra.

**A2 · Toda cifra dice de dónde sale.** Valor + unidad + **procedencia** (mecanismo) + **ancla** (`medida | declarada | estimada | poblacional`) + **cobertura**. `null` ≠ 0. Lo que no se sabe se dice, y si no aporta, se calla (`seCalla`). Es el contrato `Lectura` que ya existe, ampliado (§5).

**A3 · Toda cifra contra algo.** Periodo anterior de igual longitud, basal propia, objetivo del coach o plan. Nunca un número suelto. El delta se calcula en la MISMA unidad que el umbral que lo juzga (arregla P1).

**A4 · Una ventana.** `7d · 4s · 12s · 6m · 1a · todo`, cortada en el día LOCAL del atleta, comparada con la anterior de igual longitud. Toda sección obedece la ventana o dice que no la obedece.

**A5 · Nombres, no siglas.** Forma (carga crónica), Fatiga (aguda), Frescura (forma − fatiga), Carga (unidad TSS: 1 h en umbral = 100). Glosa a un toque para quien busque CTL/ATL/TSB. «Forma» significa solo eso en toda la app; el VO₂/ritmo al mismo pulso se llama **Motor**.

**A6 · Mecanismo nuestro, método del coach.** Ventanas, bandas de frescura, bandas de cumplimiento y su base, prioridad de fuentes de carga por modalidad, fórmula de 1RM, umbral de cambio significativo por métrica, cobertura mínima del veredicto, ventana basal: **dato del coach con defecto**, con editor en Ajustes › Método (hoy `coach_analytics_method` no tiene editor).

**A7 · El plan es parte del dato.** Como los entrenos están tipados, la carga PLANIFICADA de cada sesión se calcula sola desde su prescripción (duración × intensidad objetivo). Con ella: plan frente a hecho por semana, cumplimiento por sesión y **proyección de forma y frescura hasta el día de la carrera**. TrainingPeaks necesita que el coach escriba el TSS planificado a mano; nosotros no.

**A8 · Prescrito frente a hecho por tramo, en todas las modalidades.** El cumplimiento no es «hizo la sesión»: es serie a serie contra su banda (ritmo, zona, split, vatios, reps, kg, RIR, rondas, tiempo). Nadie en el mercado lo tiene fuera de las series de correr.

**A9 · Un «¿mejoro?» por familia, con la misma regla.** Correr, remo, ski, bici, fuerza, estaciones y WOD tienen su métrica clave, su curva o tabla de mejores y su veredicto con el mismo mecanismo (A3).

**A10 · Diseñado para 100 atletas y para el vacío.** La base de hoy es de prueba (solo un atleta tiene dato denso): nada se diseña desde sus filas. Todo bloque resuelve sus cuatro estados: vacío (qué hacer para tenerlo), poco dato (cuánto falta), lleno y dato viejo.

## 3. Las preguntas y dónde se responden

| # | Pregunta | Bloque | Atleta (iPhone) | Coach (web) |
|---|---|---|---|---|
| 1 | ¿Cómo estoy hoy? | **Estado** | cabecera fija: palabra + Forma/Fatiga/Frescura + readiness de hoy | cabecera de la ficha, igual |
| 2 | ¿Gano forma o me paso? ¿Llego fresco? | **Forma y fatiga** | curva de las tres + proyección hasta la carrera | igual, más grande, con la carga planificada editable (fase 2) |
| 3 | ¿Hago lo que toca? | **Semana a semana** | carga y horas por modalidad, plan frente a hecho, cumplimiento por sesión | igual + tabla de cumplimiento POR TRAMO |
| 4 | ¿Entreno a la intensidad que toca? | **Intensidad** | tiempo en zonas por semana + reparto (polarización) | igual, por modalidad |
| 5 | ¿Mejoro? | **Progreso** | una fila por familia con su número clave y tendencia → detalle | igual, comparar periodos |
| 6 | ¿Qué marcas tengo? | **Récords** | lista única de mejores de todas las familias, lo nuevo marcado | igual |
| 7 | ¿Llego a mi carrera? | **Carrera** | tiempo previsto, hueco por tramo (8 carreras, 8 estaciones, Roxzone), tendencia | igual |
| 8 | ¿Asimilo? | **Recuperación** | VFC, FC reposo y sueño contra UNA basal | igual |
| 9 | ¿Qué pasó en esa sesión? | **Sesión** (detalle) | tramo a tramo: prescrito frente a hecho, curvas, parciales, zonas | igual + comparar con otra sesión o test |

**Detalles por familia** (el «¿mejoro?» a fondo, A9):
- **Correr:** ritmo umbral y su tendencia, mejores esfuerzos (400 m → media), Motor (ritmo al mismo pulso), desacople, velocidad crítica, VDOT, «lo que te piden» (cumplimiento de series). Rehace el hub de Carrera existente.
- **Remo · SkiErg · BikeErg** (cada máquina la suya): mejores por pieza estándar de Concept2 (100 m, 500 m, 1 k, 2 k, 5 k; 1′, 4′, 30′), vatios al mismo pulso, volumen. La bici en /1000 m y rpm.
- **Fuerza:** 1RM estimado por ejercicio (fórmula del coach), tabla de mejores por nº de reps, volumen por patrón de movimiento y semana (series y tonelaje), cumplimiento de RIR.
- **Estaciones y WOD:** mejores por estación (ejercicio + dosis + carga), historial de puntuación de los WOD de referencia y de las simulaciones, parciales de carrera oficiales.
- **Tests:** evolución de cada test del coach.

## 4. La carga única (mecanismo)

Cada **tramo** hecho recibe una carga en unidades TSS con su método y su ancla. La carga de la sesión es la suma de sus tramos; la del día, la de sus sesiones. Así fuerza, ergo, carrera y estaciones caben en una sola curva de forma y se pueden desglosar por familia.

**Escalera por tramo** (el orden por modalidad es método del coach con este defecto; gana el primer peldaño con dato y ancla):
1. **Potencia** (remo/ski/bici con vatios): contra el umbral de potencia DE ESA máquina. Solo si ese umbral existe (test medido o declarado).
2. **Ritmo** (correr, calle o cinta): contra el ritmo umbral (rTSS; con desnivel si lo hay).
3. **Pulso:** tiempo por zona contra el pulso umbral (hrTSS), cualquier modalidad.
4. **Esfuerzo:** RPE del tramo o de la sesión × minutos (sRPE → intensidad). En fuerza, RPE de la serie o **10 − RIR** si solo hay RIR.
5. Sin nada de lo anterior: la carga de ese tramo **no se sabe** (cuenta en contra de la cobertura, jamás como cero).

**Anclas** — alinea la carga con la escalera de zonas que ya está decidida (DECISIONS 07-28): **medida** (test) > **declarada** (el atleta o el coach la escriben; un toque) > **estimada** (0,88 × FC máx medida; o ritmo umbral desde VDOT de una marca) > **poblacional** (edad). Cuentan para la carga las tres primeras, cada cifra marcada con la suya; la poblacional no cuenta. El veredicto de «vas a más o te pasas» se retira si la cobertura de carga baja del mínimo del coach (defecto 90 %, ya decidido) — y dice cuánto de la carga está estimada.

**Carga planificada:** misma escalera sobre la PRESCRIPCIÓN: duración prevista × intensidad objetivo (zona, ritmo, vatios, RPE o RIR del tramo). Sin intensidad prescrita, la carga planificada de ese tramo no se sabe.

**Forma, fatiga y frescura:** Banister con las ventanas del coach (defecto 42/7), calentamiento declarado, cinco estados de frescura con bandas del coach (defecto de mercado: sobrecarga ≤ −30, óptimo −29…−11, mantener −10…4, fresco 5…29, recargando ≥ 30), subida de forma por semana con aviso del coach. Proyección: la carga planificada futura hasta la fecha de la carrera objetivo.

## 5. El contrato (uno)

- **Motor:** `shared/domain/analytics/` (puro). **Cargador:** `web/lib/analytics/panel.ts` → `cargarPanel(atletaId, ventana, metodo)`. Las dos rutas lo llaman: `GET /api/athlete/analytics/panel?ventana=` y `GET /api/coach/athletes/[id]/analytics/panel?ventana=` (con el ámbito de club). Detalles: `…/analytics/familia/{correr|remo|ski|bici|fuerza|estaciones}`, `…/analytics/records`, `…/analytics/sesion/[executionId]`.
- **Sobre:** la `Lectura` actual (Dato, Serie, Reparto, Cobertura, Procedencia, Veredicto, `null` como hueco real) con: `procedencia.ancla`, `comparacion` (periodo anterior), series de **plan y hecho** en el mismo eje, `familia` y ejes reales (fuera las series normalizadas 0..1).
- **Bloques del panel:** `estado`, `forma`, `semanas`, `intensidad`, `progreso` (una fila por familia), `records`, `carrera`, `recuperacion`. Cada uno es una lista de lecturas; el cliente dibuja lo que conoce e ignora lo que no.
- iOS pinta, no calcula (como las zonas). La web del coach consume el mismo JSON.

## 6. Lo que hay que capturar para que sea fuerte (y arreglar)

**Capturas** (sin ellas el bloque existe pero con poco dato):
1. **Umbral en un toque:** pulso umbral, ritmo umbral y umbral de cada ergo, declarables por atleta o coach y fijados por los tests. Es lo que convierte en carga la FC que ya tenemos (del 8 % a más de la mitad del tiempo).
2. **Kg y RIR por serie** — el vivo nuevo ya lo pide en el descanso (28-09).
3. **Series continuas del reloj en carrera** (pulso, velocidad, GPS, cadencia) → parciales por km, desacople, mejores dentro de la actividad.
4. **Todos los intervalos del ergo** con su papel (trabajo/recuperación).
5. **RPE de sesión** siempre al cerrar; reps en EMOM y estaciones.
6. **Tipo de actividad de las importaciones de Salud** (1.277 sin tipo).

**Fallos de datos** (se arreglan en el mismo lote): readiness guardado como texto JSON (1.367 filas; el sueño del coach sale vacío), tramos con más segundos en zona que duración, saltos imposibles (720 cm), duplicados de sesiones en vivo.

## 7. Contra qué se ha roto

Diez ejecuciones reales (4 × 1000 en cinta reclamada al plan; fartlek en cinta; rodaje de 4 km; remo 5 × 500 con un split; ski 8 × 250 truncado; sentadilla 4 × 5 a 100 kg; EMOM ski + dominadas; fuerza + trineos sin kg; libre superserie + trineo 150 kg; carrera importada de Salud) más el atleta vacío, el atleta solo con biometría y el coach con 100 atletas. Todos entran en el modelo sin texto libre: cada tramo tiene su peldaño de carga o un «no se sabe» declarado, su cumplimiento o «sin plan», y su familia de progreso. Los huecos que salen son de CAPTURA (§6), no del modelo.

## 8. Dónde puede fallar

- Carga desde anclas estimadas: se marca y el veredicto lo dice; aun así un umbral estimado mal empuja la curva entera.
- Equivalencia de la fuerza en unidades TSS vía esfuerzo (RPE/RIR): es una elección de modelo (TrainingPeaks no la hace; WHOOP sí, a su manera). Coeficiente = método del coach.
- Mejores DENTRO de una actividad necesitan series continuas: hasta que el reloj las mande, los mejores de correr son por actividad entera.
- Estaciones: sin tiempo por largo ni distancia, sus mejores dependen de que el vivo nuevo las guarde (ya lo hace por estación desde el 28-09).

## 9. Lo que se retira

Los siete contratos → el panel + detalles. `GET /api/athlete/analytics`, `lib/athlete/analytics/running.ts` (699 líneas), `AnaliticasCorrerView` y sus arrastres, `load.ts`/`recovery.ts` como segundas cargas y segundos ACWR, las bandas de readiness escritas en Swift, los chips y textos internos, la carga 42/7 fija del coach. `deep-dive-*` y `cohort` pasan a leer el motor (los usa el MCP). Todo se retira DESPUÉS de que las dos superficies nuevas estén en producción.

## 10. Construcción

1. **Motor y contrato** (objetivo, sin UI): carga única y planificada, forma/fatiga/frescura con proyección, cumplimiento por sesión y tramo, intensidad, progreso y récords por familia, recuperación con una basal; método del coach ampliado con editor; capturas de umbral; fallos de datos.
2. **Diseño:** propuestas en el doble (iPhone) y en el panel (web) sobre este contrato, para la firma de Alex.
3. **Construcción de las dos superficies** sobre lo firmado, y retirada de lo viejo.

## 11. Decisiones subjetivas para Alex (al enseñar las propuestas)

1. Nombre de la pestaña: «Analíticas» o «Progreso».
2. Portada del atleta: panel único con bloques (propuesto, estilo Garmin/WHOOP) o pastillas por familia (lo de hoy).
3. Panel del coach: bloques fijos bien elegidos (propuesto) o gráficos que el coach arrastra y configura (TrainingPeaks).
