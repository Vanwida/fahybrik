# El vivo del iPhone, rehecho — el modelo (28-09-2026)

Especificación del rediseño de la pantalla EN VIVO del iPhone, para todos los tipos de entreno, del coach y libres. Sale de la petición de Alex del 28-09 («el vivo no me gusta nada: fallos, inconsistencias, pantallas antiguas, cosas feas; hazlo de nuevo, puedes hacerlo mucho mejor») y de cinco auditorías del mismo día (modelo y guardado, constructores, iPhone en vivo, reloj, analíticas). Las pantallas se diseñan como `propuesta` en el doble (`web/components/design-twin/screens/iphone-vivo-*`) sobre el kit `kit-iphone-vivo/`; el Swift va después de la firma de Alex.

**La idea en una frase:** un estado vivo, dos pintores. El iPhone pinta EL MISMO estado que la muñeca (`docs/reloj-muneca/modelo.md`), con las mismas reglas, la misma notación, el mismo veredicto y la misma voz. Cambia el lienzo, no el modelo. Un libre y uno del coach son el mismo objeto: nada en el vivo sabe de dónde vino el entreno.

**Listón:** Apple Fitness y Garmin para correr, Concept2 ErgData para las máquinas, Hevy/Strong para la fuerza, SmartWOD/Wodify para el WOD, y la app oficial de HYROX para la simulación. Ninguno hace los cinco en una app; nosotros sí, con un solo lenguaje.

---

## 1. Qué está mal hoy (causas raíz, de las auditorías del 28-09)

1. **Dos modelos para lo mismo.** El vivo del iPhone y el de la muñeca calculan distinto el número grande, el veredicto y la notación del objetivo.
2. **Un bloque no se parte en lo que haces.** Un continuo remo+ski+bici es UN tramo con la métrica del remo; una HYROX por bloques mete 15 puertas «ARRANCAR BLOQUE»; tabata y death by se quedan en «Ronda 1/N».
3. **La máquina no manda su métrica.** La BikeErg sale como remo (/500, s/min, «sin remar»); las calorías solo con objetivo en cal; el PM5 del AMRAP no aparece; la cadencia medida nunca se ve.
4. **El número miente.** El «Ritmo» es el medio de la vuelta y divide por el tiempo del segmento entero; «Zona» enseña la prescrita con el color de la medida; «Luego» anuncia el segmento y no el tramo; «TERMINAR» cierra solo una ronda.
5. **Tres lenguajes visuales** (tanda del 29-jul, añadidos de agosto, parches de septiembre): el sujeto baila de altura, la acción pesa como el dato, el título es «Run · SkiErg · …».

## 2. Principios (heredados de la muñeca, adaptados al móvil)

**I1 · Un estado, dos pintores.** El iPhone consume `EstadoSecuencia` + `laminaDelPaso` del kit de la muñeca (hoy en `kit-reloj/`: `paso.ts`, `secuencia.ts`, `lamina.ts`, `reglas.ts`, `tarea.ts`, `fuerza.ts`, `voz.ts`, `eventos.ts`, `despues.ts`). No se duplica lógica: el kit del iPhone importa de ahí. Con el reloj puesto, el iPhone es la segunda pantalla del mismo estado; sin reloj, el iPhone lleva el motor. Los dos se ven iguales en lo que comparten.

**I2 · El paso es la unidad** (P2 de la muñeca): medida × objetivo(s) × rol × fase, con su posición anidada, quién lo mide y el paso siguiente. Un bloque con N movimientos o máquinas son N pasos. El formato del bloque manda aunque tenga un solo ítem.

**I3 · El objetivo manda** (P3): el héroe es lo que el coach pide controlar; sin objetivo, lo que falta. El ritmo es el ACTUAL suavizado ~10 s, nunca la media; la media va rotulada «medio». El pulso está siempre en la pantalla principal. El veredicto lleva dirección ▲▼ y palabra, no solo color.

**I4 · Una pregunta por familia, y el héroe la responde:**
- Correr: ¿voy al ritmo/zona que toca? → ritmo actual o pulso contra su banda.
- Ergo: ¿voy al /500 (/1000 en bici) o a la zona? → split actual contra su banda.
- Fuerza: ¿qué levanto ahora y cuánto? → «5 × 100 kg» del ejercicio, y en el descanso la cuenta atrás.
- EMOM: ¿cuánto queda de este minuto? → la ventana.
- AMRAP: ¿cuántas rondas llevo? → rondas + reps; lo que queda, arriba.
- For Time / chipper: ¿cuánto llevo? → el crono total (la puntuación) con el cap.
- Tabata / intervalos a reloj: ¿trabajo o descanso y cuánto queda? → la fase con su palabra.
- Death by: ¿cuántas reps este minuto? → las reps del minuto y lo que queda de él.
- Circuito / HYROX: ¿qué estación y cuánto llevo? → la estación con su dosis; la carrera usa el pintor de correr con el crono total en la cabecera.

**I5 · Anatomía fija, la misma en todas las familias** (de arriba abajo, el sujeto nunca baila):
1. **Cabecera:** posición en palabras («Serie 3/6 · 1000 m», «Ronda 2/5 · Estación 3/4», «A1 · Serie 2/4») + crono de sesión + chips de enlace (reloj, GPS, máquina, pulsómetro) que se tocan para abrir Conectividad. Nunca el título plegado del bloque.
2. **Sujeto:** el héroe, legible a 2-3 m (el móvil vive en la consola de la cinta, en el soporte del remo o en el suelo junto a la barra). Su centro óptico cae a la misma altura en todas las familias (§10.3 del CONTRATO-UI).
3. **Banda del objetivo** con la marca ▲▼ y la palabra («dentro», «rápido», «lento»). Sin objetivo, no hay banda.
4. **El trabajo** (§10.6): lo que falta del paso y la dosis, nunca en gris.
5. **Rejilla de apoyo:** 2-4 métricas propias de la máquina o familia (§4 abajo), el pulso siempre.
6. **Luego:** el siguiente PASO con su objetivo («Luego · Recupera 90″ trote · después 1000 m a 3:45–3:55»).
7. **Tira de estructura:** la sesión entera como barra segmentada por pasos (trabajo en naranja, recuperación y descanso monocromos), con el paso vivo marcado. Tocar abre la estructura completa.
8. **Franja de acción** (zona del pulgar): UNA acción primaria por estado, grande (≥ 64 pt) sin pesar como el sujeto (§10.5): «Serie hecha», «+1 ronda», «Siguiente estación», «Empezar ya». Pausa a su lado. **Terminar = mantener pulsado 1 s** (estándar de Apple Fitness/Strava), con hoja de confirmación que dice lo hecho. Nunca un botón que diga «Terminar» y cierre otra cosa.

**I6 · Páginas laterales, pocas y fijas:** Vivo · Estructura (pasos hechos contra objetivo, vueltas, parciales) · Mapa (solo si hay GPS). Lo crítico nunca está fuera de la página Vivo.

**I7 · El descanso es una fase común** (P8): cuenta atrás como héroe, «Viene: …» con su objetivo, «+30 s», «Empezar ya», aviso a 10 s, 3-2-1. En fuerza, el descanso es donde se ANOTA la serie (patrón Hevy/Strong): reps · kg · RIR prerrellenados con lo prescrito, pasos de ± grandes, confirmados con un toque; lo prerrellenado no cuenta como declarado hasta confirmarlo.

**I8 · Un color, un significado** (P6): fondo negro; naranja de marca SOLO para acción y el trabajo en la tira; zonas con el espectro del coach (Z1 azul pizarra, nunca gris) y tinte de fondo SOLO cuando el paso va a zona; recuperación y descanso monocromos. Esto sustituye al §10.1 del CONTRATO-UI («la zona tiñe siempre») en el vivo del iPhone y de la muñeca.

**I9 · Un numeral** para toda la app (§10.2), cifras de ancho fijo. Es UN token del kit: cambiarlo cambia todas. Propuesta por defecto: SF tabular, como la muñeca. La cara del numeral es decisión de Alex (§7).

**I10 · Honestidad del dato:** lo que no llega en 5 s se pinta «—» con su nota («sin señal del remo»); nunca un número congelado. Nada se conecta solo: reconectar es un toque (memoria del proyecto). GPS «buscando» antes de empezar, no a mitad.

**I11 · Fuera de la app:** Live Activity en la pantalla de bloqueo y en la Isla Dinámica con el héroe, la posición y la acción primaria (interactiva, iOS 17+), igual que Apple Fitness y Strava.

**I12 · Copy de box** (memoria del proyecto): «el remo», «la cinta», «la bici», nunca PM5/FTMS/BLE. Español natural.

## 3. Horizontal

Ergo y cinta admiten horizontal (soportes de remo y consolas de cinta): sujeto a la izquierda, rejilla y acción a la derecha. El resto, vertical.

## 4. Métricas por máquina y familia (la rejilla de apoyo)

| Familia | Héroe (por defecto) | Rejilla | Fuente |
|---|---|---|---|
| Correr calle | ritmo actual /km o pulso+zona | lo que falta, pulso+zona, distancia del paso, cadencia | GPS + reloj/banda |
| Cinta | ritmo o velocidad según prescripción | lo que falta, pulso, inclinación, distancia | cinta conectada o «lo dices tú» |
| Remo, SkiErg | split actual /500 | lo que falta (m, tiempo o cal), s/min, vatios, calorías | la máquina |
| BikeErg | ritmo /1000 m | lo que falta, rpm, vatios, calorías | la máquina |
| Fuerza | ejercicio + «5 × 100 kg · RIR 2» | serie k/K, tempo, descanso prescrito, última serie hecha | lo dices tú |
| EMOM | ventana del minuto | tarea con carga, ronda x/N, «Luego», pulso | reloj + máquina si la hay |
| AMRAP | rondas + reps | tiempo que queda, tarea actual, reps por ronda, pulso | tú (+ máquina) |
| For Time / chipper | crono total | cap, estación actual y su dosis, parcial de la estación, pulso | reloj + máquina |
| Tabata / a reloj | fase y lo que queda | ronda x/N, reps de la ronda, pulso | reloj |
| Death by | reps de este minuto | minuto n, lo que queda del minuto, pulso | reloj |
| Estación sin medida (trineo, wall balls) | crono de la estación | dosis y carga («Sled Push · 50 m · 152 kg»), crono total, pulso | lo dices tú |

Las calorías del remo, ski y bici se ven siempre, no solo con objetivo en cal.

## 5. Las pantallas (propuestas del doble)

- `iphone-vivo-gramatica`: la anatomía I5 con un paso de cada familia; pausa; descanso común; deshacer 5 s; estados de enlace (buscando GPS, máquina perdida, reloj como segunda pantalla); terminar con pulsación larga y su hoja; Live Activity e Isla Dinámica.
- `iphone-vivo-correr`: rodaje a zona (calle), 6 × 1000 m a ritmo con recuperación, tempo en cinta, progresivo, página de mapa.
- `iphone-vivo-ergo`: series de remo a /500, SkiErg por calorías, BikeErg a /1000 y rpm, horizontal.
- `iphone-vivo-fuerza`: series rectas, superserie A1/A2, pirámide con %RM, anotar en el descanso, paso al siguiente ejercicio sin atasco.
- `iphone-vivo-wod`: EMOM alterno con máquina, AMRAP con remo, For Time chipper con cap, Tabata, Death by.
- `iphone-vivo-circuito`: rondas de circuito, HYROX completa (8 × 1 km + 8 estaciones + Roxzone), bloque continuo multi-máquina (remo 15′ + ski 15′ + bici 15′).

Cada escenario reutiliza las sesiones reales y los simuladores de `screens/reloj-*/planes.ts` y `casos.ts` cuando existan, y añade casos LIBRES equivalentes para demostrar que se ven igual.

## 6. Lo que no se toca

El modelo de la muñeca (`docs/reloj-muneca/modelo.md`) y sus propuestas: el iPhone se alinea con ellas, no al revés. Si al construir aparece una regla nueva de mecanismo, va al kit compartido y la muñeca la hereda.

## 7. Decisiones subjetivas para Alex (al enseñar las propuestas)

1. La cara del numeral del vivo: SF tabular (como la muñeca) o la itálica de marca.
2. El tinte de zona: solo cuando el paso va a zona (propuesto, igual que la muñeca) o siempre que haya pulso (CONTRATO-UI §10.1 actual).
3. Página de mapa en correr: sí por defecto o solo al deslizar.
