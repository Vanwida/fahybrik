# La muñeca, rehecha — el modelo (25-09-2026)

Especificación del rediseño de la app del Apple Watch. Sale de la auditoría de seis lentes del 25-09 (correr en solitario, espejo, fuerza/WOD/HYROX, sistema visual y nativo, referencia competitiva, 22 sesiones reales) y de las cuatro respuestas de Alex del mismo día. Las pantallas se diseñan como `propuesta` en el doble (`web/components/design-twin/screens/reloj-*`) con el kit `kit-reloj/`; el Swift va después de la firma de Alex.

**Listón (DECISIONS 2026-09-24):** «como Apple Workout, y midiendo lo que Apple Workout no mide», y por encima de TrainingPeaks, que en el Apple Watch no tiene muñeca propia (su techo es el entreno personalizado de Apple, sin RPE, sin segundo objetivo y sin fuerza).

---

## 1. Por qué se rehace — siete causas raíz

1. **La muñeca pinta, no manda.** Relojes, metros y hápticos dependen de quién lleve el motor; en espejo nada es local (números congelados, saltos de 5 s, cero hápticos, silencio al cortarse el enlace). Ni en solitario hay una autoridad única de tiempo y metros.
2. **Dos repartidores de pantallas** (motor frente a espejo) y tres lenguajes visuales, tres paginadores, tres flujos de terminar, dos descansos y tres cuentas atrás, sin tokens semánticos.
3. **El paso vivo no sabe contra qué se mide.** Sin objetivo, sin dirección, sin ritmo actual, sin pulso en la pantalla principal, sin «qué viene» durante el trabajo.
4. **Correr va montado sobre un motor de gimnasio:** puertas a mitad de carrera, final sin pantalla, todo se guarda «parcial», series anidadas aplanadas, fase deducida del título.
5. **El circuito se pliega en un segmento y nadie graba cada estación:** sin parciales, ritmo mezclado (9:30/km cuando se corrió a 4:50), sin Roxzone, sin datos para la carrera comprometida, descanso entre estaciones invisible y pisable.
6. **Interacción inventada, no nativa:** tocar cualquier sitio cierra una serie, paginador propio dentro del del sistema, controles a la derecha, sin corona, doble toque, botón Acción ni Water Lock, un háptico con cuatro significados.
7. **La muñeca no declara:** ni reps, ni RIR, ni RPE de sesión, ni deshacer; la fuerza se atasca tras la última serie; la plataforma sin usar (ruta en Salud, complicación, Smart Stack, esfuerzo, voz en el propio reloj).

## 2. Principios

**P1 · Un estado vivo, un pintor.** Quien lleve el motor produce el estado; la muñeca pinta siempre lo mismo con el mismo código. Los relojes se calculan en la muñeca desde anclas (inicio del paso + pausas) y los hápticos salen de las transiciones del estado en la muñeca: iguales con móvil o sin él. Un dato que deja de llegar se marca viejo; nunca se congela en silencio.

**P2 · El paso es la unidad:** medida × objetivo(s) × rol (trabajo, recuperación, descanso, transición) × fase (calentamiento, principal, vuelta a la calma), con su posición anidada (tanda r/R · serie k/K · ronda/estación), quién lo mide (GPS, cinta, ergómetro, sensor, «lo dices tú»), el paso siguiente y el cue del coach.

**P3 · El objetivo manda (Alex, 25-09).** El número grande es lo que el coach pide controlar: ritmo si el paso va a ritmo; pulso y zona si va a zona; si va a RPE, lo que falta con la instrucción del RPE; sin objetivo, lo que falta. Debajo, lo que falta; el pulso siempre en la pantalla principal; el ritmo es el ACTUAL (suavizado ~10 s), no la media. El veredicto lleva dirección (▲ rápido / ▼ lento) en la banda y en palabra, no solo color.

**P4 · Gramática nativa, la misma en todas las familias.** Izquierda = controles (Pausa, Vuelta / Siguiente paso, Water Lock, Terminar). Centro = una pila vertical que se recorre con la corona (Paso → Datos → Vueltas → Estructura). Derecha = Ahora suena. Corriendo, tocar la pantalla no cierra nada. Cerrar a mano = doble toque (S9/Ultra 2+), botón Acción (Ultra) o un botón visible y acotado (≥ 44 pt), con 5 s para deshacer.

**P5 · Un evento, un háptico.** Vocabulario en §4. El destello visual no lleva háptico propio. Aviso fuera de objetivo con histéresis y cadencia como DATO del coach. Voz en el propio reloj a los auriculares, en español: al cambiar de paso y cada km (Alex, 25-09); los avisos de ritmo son solo vibración.

**P6 · Un color, un significado.** Espectro de zonas con las bandas del coach (3–9 zonas, Z1 nunca gris). Naranja de marca SOLO para acción (botones, control activo) y el trabajo en el aro. La recuperación y el descanso son monocromos: sin tinte, gris y blanco. El tinte de zona de fondo solo cuando el paso va a zona. El veredicto no cambia de color: cambia la marca en la banda (▲▼) y la palabra.

**P7 · Números en SF nativo (Alex, 25-09)**, cifras de ancho fijo, rectas. Una escala por papel (héroe / segundo / tercero / contexto / nota), el héroe ajustado al ancho útil. Nada de texto por debajo de 15 pt.

**P8 · El descanso es una fase común** a todas las familias: cuenta atrás, «Viene: …» con su objetivo, «+30 s», «Empezar ya», aviso a 10 s, 3-2-1 y GO.

**P9 · Correr es correr.** Sin puertas a mitad de carrera: de calentamiento a series se pasa solo con un preaviso de 10 s («hasta pulsar» es dato del coach). El final natural tiene pantalla («Sesión completada»); la completitud la decide el motor. Vuelta automática por km en rodajes y tiradas (dato del coach). El tope de FC solo avisa por encima. Avituallamiento como dato. «GPS listo» antes de empezar. Calle, cinta o pista salen de la prescripción. La ruta va a Salud.

**P10 · Circuito y HYROX.** Cada estación y cada tramo de carrera es su propia vuelta. La carrera dentro del circuito usa LA MISMA pantalla de correr, con el crono total (la puntuación) en el contexto. La estación muestra nombre, dosis y carga («Sled Push · 50 m · 152 kg»); si nada la mide, el número grande es el crono de la estación con «lo dices tú». Roxzone como paso propio si el coach la activa. Posición «Ronda 2/5 · Estación 3/4». La carrera comprometida se juzga en vivo contra el objetivo del coach; el coste propio (s/km sobre tu fresco) sale en el resumen (Alex, 25-09).

**P11 · Fuerza.** Nombre del ejercicio primero (A1/A2 en superserie), la dosis con sus dos ejes («5 × 100 kg · RIR 2 · 3-1-1»). Tras la serie se anota en el propio descanso (reps, carga en cascada y RIR con la corona; por defecto lo prescrito, que no cuenta como declarado hasta confirmarlo). La última serie lleva al siguiente ejercicio: nunca un atasco.

**P12 · WOD.** EMOM: la ventana del minuto y la tarea con su carga. AMRAP: rondas y reps con la corona, la tarea en la muñeca. For Time: el crono total es la puntuación y siempre está a la vista, con el cap.

**P13 · Antes y después.** Complicación y Smart Stack con lo de hoy (un toque). El brief dice la estructura real («6 × 1000 m @3:45–3:55 · r 90″ trote»), no «N bloques». 3-2-1 al empezar. Al terminar: RPE en la corona (también a Salud como esfuerzo) y un resumen primero de corredor (distancia, ritmo de lo fuerte, «5 de 6 dentro», lista de series frente a su objetivo; en circuitos, parciales por carrera y estación, Roxzone y coste comprometido). Estado de guardado honesto.

## 3. Tokens del kit (`kit-reloj`)

- **Lienzo:** 208 × 248 pt (46 mm); safe arriba 24, lados 10, abajo 12. El ajuste por ancho sirve también a 42 mm (187 × 223) y 49 mm (205 × 251).
- **Tipo (SF, `tabular-nums`, recto):** héroe 44–96 pt ajustado al ancho; segundo 30 pt; tercero 22 pt; contexto 16 pt semibold; nota 15 pt; botones ≥ 44 pt de alto.
- **Color:** fondo #000; superficie #141414 / #1F1F1F; tinta #FFF; tinta2 #A1A1A6; acción = naranja de marca #F06A2A (solo acción); zonas por espectro azul → verde → ámbar → rojo con N zonas del coach, Z1 azul pizarra (#8FB3D9), nunca el gris de tinta2; descanso y recuperación monocromos.
- **Always-On:** fondo negro, sin tintes, números en tinta al 60 %, aro atenuado, 1 Hz.
- **Dato viejo:** el campo que depende del móvil y no llega en 5 s se pinta «—» con la nota «sin enlace · la muñeca sigue grabando».

## 4. Vocabulario háptico y de voz

| Evento | Háptico (WKHapticType) | Voz (auriculares) |
|---|---|---|
| 3-2-1 antes de un paso de trabajo | `.click` por segundo | — |
| Empieza trabajo (GO) | `.start` × 2 | «Serie 3 de 6. Mil metros a 3:50.» |
| Empieza recuperación | `.stop` | «Recupera, 90 segundos trotando. Luego mil metros.» |
| Preaviso (10 s o 100 m) | `.notification` | «Quedan cien.» |
| Afloja (rápido / pulso por encima) | `.directionDown` × 2 | — (solo vibración) |
| Aprieta (lento) | `.directionUp` × 2 | — (solo vibración) |
| Vuelta automática (km) | `.click` × 2 | «Kilómetro 5: 4:52.» |
| Fin de serie (resultado) | — (ya vibra el paso siguiente) | «Serie 3: 3:48, dentro.» |
| Bloque hecho | `.success` | — |
| Sesión hecha | `.success` × 2 | «Sesión completada.» |
| Acción del atleta (pausa, serie hecha…) | `.click` | — |
| Enlace perdido | `.failure` | — |

Reglas: ningún aviso fuera de objetivo en calentamiento ni en recuperación (salvo que la recuperación tenga objetivo propio y el coach lo pida); histéresis y cadencia mínima son dato del coach (defecto 20 s).

## 5. Pantallas (una por lo que haces)

- **Paso de correr** (calle, cinta, pista; rodaje, tirada, tempo, series, progresivo, fartlek, cuestas, carrera): contexto («Serie 3/6 · 1000 m», «Rodaje · Z2», «Tanda 2/3 · Serie 4/6 · 1′», «Progresivo · tramo 3/8»), héroe según el objetivo, banda del objetivo con marca (▲▼ fuera), lo que falta, la otra métrica (ritmo o pulso), aro = la sesión.
- **Recupera:** «Recupera · trote», cuenta atrás (o metros), «Luego · 1000 m a 3:45–3:55», pulso bajando, «doble toque · empezar ya».
- **Descanso común** (fuerza, circuito, entre tandas).
- **Serie de fuerza** + anotar en el descanso.
- **Estación / circuito / HYROX** (medida o «lo dices tú»), Roxzone.
- **EMOM, AMRAP, For Time, ergo.**
- **Controles** (izquierda), **Datos / Vueltas / Estructura** (corona), **Pausa**, **Deshacer**, **Sesión completada**, **RPE**, **Resumen**, **Brief** con GPS listo y calle/cinta, **Complicación / Smart Stack**.

## 6. Arreglos de modelo aguas arriba (sin ellos, el dato cae a texto)

- **M1** Dos objetivos por paso: principal + techo o secundario; en fuerza, carga + esfuerzo.
- **M2** Modo de recuperación como dato (trote, andar, parado), con su objetivo.
- **M3** Entorno (calle, cinta, pista) e inclinación como dato.
- **M4** Series anidadas y cuentas por ítem sin aplanar ni plegar (3×(6×…), rondas con distinto N× por ítem, escaleras, AMRAP anidado).
- **M5** EMOM con duración total explícita.
- **M6** HYROX sim y half-sim como estructura, no como nota.
- **M7** Máquina e implemento como dato (damper, kg por implemento, «peso competición» resuelto por la carrera objetivo).
- **M8** Cue del coach por paso: texto corto de coaching (no prescripción) que sí llega a la muñeca.

## 7. Contra qué se ha roto

22 sesiones reales asignadas (atletas 63, 64 y 65): 491, 494, 573, 479, 551, 509, 511, 535, 538, 488, 529, 492, 498, 572, 506, 552, 542, 493, 482, 505, 530, 536, 513, 514. Todas entran en el modelo con M1–M8. 542 (HYROX half-sim) solo entra con M6; 536 (escalera de ergo), solo con M4.

**Dónde puede fallar:** el doble toque solo existe en S9 / Ultra 2 en adelante y el botón Acción solo en Ultra (en el resto, botón visible acotado); los toques con la muñeca bajada; el GPS en series cortas y en los km del circuito; la Roxzone detectada por movimiento y el coste comprometido, sin validar; P1 exige mover el motor al reloj (fases 2–3 de `docs/el-reloj-primero/`), y hasta entonces el espejo tiene que calcular relojes y hápticos en local.
