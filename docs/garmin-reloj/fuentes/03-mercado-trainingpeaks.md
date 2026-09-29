# Garmin R3: mercado, TrainingPeaks en el reloj, Connect IQ (investigado 2026-09-29)

Etiquetas: VERIFICADO = leido en fuente oficial. SECUNDARIO = prensa, foro, reseñas, marketing del desarrollador. NO ENCONTRADO = buscado y sin resultado. INFERENCIA = deduccion mia, no dicha por la fuente.
Notas de metodo: support.garmin.com y help.trainingpeaks.com dan 403 a WebFetch. El help center de TP se leyo por su API publica Zendesk (misma pagina, https://help.trainingpeaks.com/api/v2/help_center/en-us/articles/<id>.json). Los datos de la Connect IQ Store salen de la API publica que usa la propia web (apps.garmin.com/api/appsLibraryExternalServices/api/asw/apps/keywords y .../apps/<id>/reviews). Descargas en la Store vienen en cubos (1, 10, 100, 1k, 10k, 50k, 100k...). Manuales Garmin en PDF descargados y buscados con grep.

## Correccion a nuestro registro previo
- La compra de TrainingPeaks y TrainHeroic es del 2026-07-22 (VERIFICADO, nota de prensa de Garmin).
- La pausa de altas de la Connect Developer Program EMPEZO EN PRIMAVERA 2026, ANTES de la compra (SECUNDARIO, ver P5). No hay fuente que las una. No atribuirle causa a la compra.

## P1. TrainingPeaks en Garmin HOY
Hallazgo
- Mecanismo: TP envia los entrenos estructurados al CALENDARIO de Garmin Connect; el reloj los baja en su siguiente sincronizacion con Garmin Connect (Bluetooth, WiFi, LTE, USB o ANT+ segun modelo). Ventana: solo los proximos 15 dias, rolling; solo entrenos de hoy en adelante.
- Tipos que sincronizan: Run, Bike, Swim, Cross-train, Mtn Bike, Custom, Rowing, Other, Walk. NO sincronizan: Strength, Day Off, Brick.
- Ediciones (mover dia, cambiar estructura, titulo, borrado por el coach) llegan a Garmin Connect al instante y al reloj en la siguiente sync. Un entreno de TP no se puede editar en Garmin Connect. Tras completarlo ya no se sincronizan cambios. Los umbrales (potencia, FC, ritmo) deben estar puestos en TP para que salgan los objetivos.
- Controles del atleta: al conectar TP con Garmin elige que sincronizar (actividades completadas, entrenos planificados, metricas de salud diarias), puede desconectar en TP y en Garmin Connect (Ajustes, Aplicaciones conectadas). Un icono de Garmin Connect en la vista rapida del entreno indica que ya esta enviado. No hay control por entreno ni horizonte configurable.
- Rango en el reloj: el reloj muestra +/-10% sobre el objetivo; en TP el rango es la zona. No coinciden (TP lo dice asi).
- RPE: un entreno en RPE en Garmin "corre el temporizador de intervalos" (no hay objetivo RPE en el reloj). Cadencia en bici sincroniza junto a la potencia. Paso "terminar con boton de vuelta" existe pero no todos los dispositivos lo soportan. Intervalo minimo 5 s / 10 m.
- Experiencia en la muñeca: es el reproductor de entrenos NATIVO de Garmin. Manual Forerunner 970 (sept 2026): el reloj muestra cada paso, notas del paso (opcionales), objetivo (opcional) y datos actuales; para fuerza/yoga/cardio/pilates sale una animacion; la puntuacion de ejecucion del entreno solo existe para carrera y bici; los entrenos programados enviados desde Garmin Connect SOBREESCRIBEN el calendario de entrenos del reloj; en el reloj solo aparecen los entrenos compatibles con la actividad elegida.
- App Connect IQ propia de TP: existio ("Daily Workout IQ"). TP misma recomienda quitarla porque el sync por calendario de Garmin Connect la sustituye (entrada de blog de 2019, actualizada 2026-09-22). Hoy: la ficha antigua (uuid 4b834c4a-96a9-422a-a945-08cea2ee571d) devuelve "the app ... does not exist" en la API de la Store, y no hay ninguna app de TrainingPeaks/Peaksware entre ~695 apps unicas devueltas por 6 busquedas. Conclusion: TP NO tiene app propia vigente en la Store (inferencia razonable, no anuncio de retirada).
- TP tampoco tiene app propia en el reloj para Garmin; en Apple Watch usa la app nativa Workout (pagina creada 2026-08-12).
- Si TP usa la Training API de Garmin: la ayuda de TP nunca nombra la API; Garmin describe la Training API como "publicar entrenos y planes en el calendario de Garmin Connect". Coincide, pero es INFERENCIA.
Fuente
- https://help.trainingpeaks.com/hc/en-us/articles/115000325647-Structured-Workout-sync-and-Manual-Export (act. 2026-08-24)
- https://help.trainingpeaks.com/hc/en-us/articles/204070864-Garmin-Connect-AutoSync-FAQ-and-tips-activities-workouts-and-daily-health-metrics (act. 2026-08-24)
- https://help.trainingpeaks.com/hc/en-us/articles/204070854-How-to-Sync-Garmin-Connect-With-TrainingPeaks (act. 2026-09-07)
- https://help.trainingpeaks.com/hc/en-us/articles/115003760832-Structured-Workout-Builder-FAQ (act. 2026-08-24; RPE, min intervalo)
- https://www.trainingpeaks.com/coach-blog/garmin-connect-autosync-integration/ (2019, act. 2026-09-22)
- Manual Forerunner 970, sept 2026 (v6): https://www8.garmin.com/manuals/webhelp/GUID-025D75CF-3445-49E1-8D81-1AA74AB4E00F/EN-US/Forerunner_970_OM_EN-US.pdf (paginas 11-15)
- https://developer.garmin.com/gc-developer-program/training-api/ (2026-09-29)
- Store: https://apps.garmin.com/api/appsLibraryExternalServices/api/asw/apps/4b834c4a-96a9-422a-a945-08cea2ee571d (404, 2026-09-29)
- https://help.trainingpeaks.com/hc/en-us/articles/48096960116749-TrainingPeaks-and-Apple-Watch (creada 2026-08-12)
Estado: VERIFICADO (mecanismo, 15 dias, tipos, RPE, +/-10%, manual). INFERENCIA (que sea la Training API). NO ENCONTRADO (app CIQ de TP vigente).

## P2. Quejas y huecos conocidos de TP en Garmin
Hallazgo
- Oficial (TP reconoce): fuerza no va al reloj. El Strength Workout Builder (1000+ ejercicios, RPE/RIR/tempo/descanso) se EJECUTA solo en la app movil de TP; "la exportacion de entrenos de fuerza a apps y dispositivos de terceros no esta disponible"; emparejar el archivo de fuerza del reloj con el plan aparece como "proximamente". Ojo: la intro de esa misma pagina (act. 2026-09-25) dice que "los Garmin sincronizaran archivos a los entrenos de fuerza estructurados" mientras la lista de novedades futuras aun dice "emparejar/desemparejar". Contradiccion interna, tratarlo como no confirmado.
- Oficial: sin objetivo RPE en el reloj (solo temporizador); rangos +/-10% que no coinciden con la zona; sin segundo objetivo salvo cadencia con potencia (bici); Strength, Brick y Day Off no viajan; hay que construir con el Structured Workout Builder (un entreno sin estructura no sincroniza); recomiendan un solo calentamiento al inicio y un solo enfriamiento al final "o algunos dispositivos lo manejaran mal"; solo 15 dias; el historial de Garmin solo se puede traer UNA vez por cuenta; en horas punta hay esperas; almacenamiento lleno del reloj impide recibir entrenos.
- Foros (SECUNDARIO, antiguos): (a) Epix 2, ~2021, 8 repeticiones de un fartlek se veian como 4 pasos; quitar TODAS las notas de los pasos lo arreglo; un empleado de Garmin (Garmin-Cody) dijo que estaba resuelto. (b) Garmin Connect Web, hace 7+ años: entrenos que no llegan tras cambiar zonas en TP; un empleado (Garmin-Kevin) solo aconsejo usar el Structured Workout Builder. (c) Edge 1030, hace 7+ años: soporte de TP dijo que cadencia y notas no se mostraban en ningun Garmin; hoy la ayuda de TP dice que la cadencia si sincroniza, asi que esta desactualizado. (d) FIT SDK foro, hace 3+ años, sin respuesta: los FIT de TP traen "Notes" muy largas (descripcion del entreno) que generan pantallas extra en Fenix 6. (e) 80/20 Endurance, 2021-11-10: un usuario relata que TP le dijo "solo se envian los proximos 5 dias"; hoy la ayuda oficial dice 15, dato caducado.
- Limite de entrenos guardados en el reloj: comentario de usuario sobre otra app (Type to Run); es limite de Garmin, no de TP.
Fuente
- https://help.trainingpeaks.com/hc/en-us/articles/23361947242381-Strength-Workout-Builder-FAQs (act. 2026-08-24)
- https://help.trainingpeaks.com/hc/en-us/articles/21397126893581-Using-the-Strength-Workout-Builder (act. 2026-09-25)
- https://help.trainingpeaks.com/hc/en-us/articles/23101911249165 (act. 2026-09-11)
- https://forums.garmin.com/outdoor-recreation/outdoor-recreation/f/epix-2/336658/issue-with-trainingpeaks-workouts-syncing-to-garmin-watch
- https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/163062/trainingpeaks-workout-sync-not-working
- https://forums.garmin.com/sports-fitness/sports-fitness/f/edge-1030/154082/trainingpeaks-structured-workout-issues
- https://forums.garmin.com/developer/fit-sdk/f/discussion/319506/how-are-workout-step-notes-displayed-can-it-add-an-additional-screen
- https://www.forum.8020endurance.com/topic/trainingpeaks-garmin-calendar-sync-issues/
Estado: VERIFICADO (lista de limites de TP). SECUNDARIO (foros, todos de 2018-2022). NO ENCONTRADO: quejas de 2026 especificas ni notas de version de TP sobre Garmin.

## P3. Garmin + HYROX
Hallazgo
- NO hay perfil de actividad HYROX nativo. Busque "HYROX" en el manual del Forerunner 970 (sept 2026) y en el del fenix 9 (ago 2026): 0 apariciones. Los PDFs oficiales de novedades de Garmin (feb 2026 y Q3 2026) no lo mencionan.
- Lo mas cercano nativo: Obstacle Racing (categoria Correr; boton para marcar inicio/fin de cada obstaculo; una empleada de Garmin, Garmin-Maeve, lo recomendo para HYROX y sugirio apagar el GPS), Mixed Session (categoria Multisport; el atleta elige cada tramo con "Siguiente actividad"; "no todas las actividades estan disponibles"; llego en la actualizacion de feb 2026 segun el PDF oficial de Garmin; dispositivos citados por the5krunner: Forerunner 970/570, fenix 8, Venu 4), multisport personalizado (Actividades, Editar, Añadir, Multisport, Custom) y Gym: Cardio, HIIT, Strength, Row Indoor.
- Alcance de "Mixed Session" en prensa: "demasiado torpe para carrera, valido para simulacion lenta" (opinion de the5krunner, SECUNDARIO). Garmin habria ampliado el multisport para incluir tramos de fuerza y cardio (release notes 16.28, 2026-02-12, citadas por the5krunner, SECUNDARIO).
- Alianza: el socio oficial de wearables de HYROX es AMAZFIT (Zepp Health), acuerdo global de 3 años anunciado 2026-04-15. Exclusiva en relojes, anillos, camaras, gafas y correas segun prensa (SECUNDARIO); la nota de Zepp que lei no detalla el alcance. HYROX cambio de propietarios el 2026-09-08 (the5krunner, SECUNDARIO); segun esa fuente Garmin y Coros siguen valiendo para entrenar y lo exclusivo es el nombre/software de marca. No hay acuerdo Garmin-HYROX.
- Afirmacion "perfil oficial de Garmin creado con HYROX HQ en Connect IQ" (hyroxvault.com, 2026-03-03): sin fuente, sin enlace a Garmin. En la Store hay 44 apps de dispositivo que mencionan HYROX y ninguna es de Garmin ni de HYROX GmbH. Tratarla como falsa hasta que alguien la pruebe.
- Que mide una actividad HYROX nativa: no aplica (no existe). Roxzone, estaciones y ritmos por estacion solo los dan apps CIQ de terceros (P6).
Fuente
- Manuales: Forerunner 970 (arriba) y fenix 9: https://www8.garmin.com/manuals/webhelp/GUID-708A8F4D-9A78-49CF-9528-DE109BBCC472/EN-US/fenix_9_Series_OM_EN-US.pdf (ago 2026 v1)
- https://www8.garmin.com/wearables/PDF/WearablesSoftwareUpdate/2026/February2026.pdf (2026-02-24; columna Mixed Session)
- https://forums.garmin.com/sports-fitness/running-multisport/f/forerunner-970/412374/hyrox-mode-on-970
- https://the5krunner.com/2025/12/23/garmin-2026-q1-update-features/ ; https://the5krunner.com/2026/02/12/garmin-forerunner-970-new-features-16-28/
- https://www.zepp.com/press-release/hyrox-and-amazfit-strengthen-alliance-with-global-three-year-partnership (2026-04-15)
- https://the5krunner.com/2026/09/09/hyrox-sold/ ; https://the5krunner.com/2026/09/23/amazfit-hyrox-roadmap-updates-2027/
- https://www.hyroxvault.com/blog/garmin-hyrox-activity-profile (2026-03-03, no fiable)
Estado: VERIFICADO (no hay perfil nativo, existen Obstacle Racing y Mixed Session, alianza Amazfit). SECUNDARIO (alcance de la exclusiva, venta de HYROX). NO ENCONTRADO (cualquier acuerdo Garmin-HYROX; fecha de inicio de "Obstacle Racing" en Garmin).

## P4. Garmin nativo para hibridos
Hallazgo (manual Forerunner 970, sept 2026)
- Perfiles: Correr (Run, Track, Treadmill, Trail, Ultra, Obstacle Racing), Gym (Boxing, Cardio, Climb Indoor, Elliptical, HIIT, Jump Rope, Mobility, Pilates, Row Indoor, Stair Stepper, Strength, Yoga...), Multisport (Brick, Duathlon, Mixed Session, Swimrun, Triathlon y multisport propio con 2+ actividades), Otros.
- Fuerza: se pueden crear y buscar entrenos de fuerza en Garmin Connect y enviarlos; el reloj cuenta repeticiones (las muestra tras 4 reps) pero solo de UN movimiento por serie; hay que cerrar la serie para cambiar de ejercicio; en un entreno estructurado se puede saltar una serie o cambiar la siguiente; animacion por ejercicio; editar reps y peso; "Rest Countdown".
- HIIT: temporizadores AMRAP, EMOM, Tabata y Custom (tiempo de movimiento, descanso, numero de movimientos, rondas), y "Workouts" para seguir uno guardado. Es una actividad de temporizadores, no un motor de estaciones con objetivo propio.
- Creador de entrenos de Garmin Connect (blog oficial 2025-05-06): calentamiento, entreno y enfriamiento; carrera, bici, natacion, fuerza, yoga y HIIT; biblioteca de mas de 1.500 ejercicios. Intervalos en carrera: reps, tiempo o distancia, descanso, calentamiento abierto.
- Especificacion publica FIT de entrenos (SDK oficial): duracion por tiempo, distancia, FC menor/mayor, calorias, abierto, repetir hasta (pasos, tiempo, distancia, calorias, FC, potencia), potencia menor/mayor; objetivos: velocidad/ritmo, FC, potencia, cadencia, abierto, tipo de brazada; cada paso admite "notes" (texto) y "equipment". La pagina publica NO lista repeticiones, RPE ni RIR como tipo de objetivo o duracion (fuerza con reps y peso existe en Garmin Connect, pero el detalle solo lo vi en una documentacion NO oficial en GitHub, feb 2026: paso de ejercicio con categoria, nombre y peso, fin por reps o tiempo, paso de descanso, grupos de repeticion).
- EMOM/AMRAP como entreno ESTRUCTURADO de Garmin Connect: NO ENCONTRADO en fuente oficial. Solo el desarrollador de Kinevo afirma que su app crea "circuitos: rondas, AMRAP y EMOM" como entreno nativo (SECUNDARIO, marketing).
- Lo que NO puede hacer (INFERENCIA desde el manual): un solo entreno estructurado que encadene tramos de carrera y estaciones con objetivo por estacion. En el manual los entrenos aparecen solo si son compatibles con la actividad elegida, y en Mixed Session el atleta elige cada tramo a mano; no hay documentado un plan de pasos entre tramos ni objetivos por estacion. Tampoco hay RPE/RIR/carga como objetivo en la especificacion publica.
Fuente
- Manual Forerunner 970 (URL en P1), paginas 11-15, 19-20, 28-30.
- https://www.garmin.com/en-US/blog/fitness/three-ways-your-garmin-smartwatch-can-help-you-work-out/ (2025-05-06); https://www.garmin.com/en-US/blog/fitness/making-the-most-of-hiit-workouts-with-garmin/ (2025-05-21; no describe EMOM/AMRAP en el creador)
- https://developer.garmin.com/fit/file-types/workout/ (leido via https://developer.garmin.com/fit/articles/file-types/workout.html)
- https://github.com/n1t3k/garmin-strength-api (no oficial)
Estado: VERIFICADO (perfiles, fuerza, HIIT, FIT). SECUNDARIO (detalle de fuerza en Connect, Kinevo). NO ENCONTRADO (EMOM/AMRAP estructurado oficial, doc oficial del creador con todos los tipos de paso). INFERENCIA (limite de circuito carrera+estaciones).

## P5. Estado de la Connect Developer Program
Hallazgo
- Hoy 2026-09-29 las paginas oficiales Overview, Training API y Program FAQ de developer.garmin.com/gc-developer-program muestran el aviso "Stay tuned for more updates on the program" y NO hay boton ni formulario de alta. La FAQ conserva textos antiguos (para uso empresarial, respuesta en dos dias habiles).
- Texto de Garmin a solicitantes, reproducido por terceros (SECUNDARIO): "temporarily paused the review and approval of new API access requests" y "evolving and modernizing the Garmin Connect Developer Program"; el 2026-05-20 hablo de "significant redesign and modernisation". Empezo en primavera 2026, antes de la compra (2026-07-22). Las integraciones ya aprobadas siguen funcionando (ejemplo: RunSync sigue empujando entrenos por la Training API, the5krunner 2026-08-31). Sin fecha de reapertura ni lista de aviso. Un hilo del foro de Garmin (>1 mes) tiene una solicitud enviada en abril 2026 sin respuesta, sin empleados de Garmin en el hilo.
- Nota de prensa de Garmin de la compra: no menciona API, programa de desarrolladores ni continuidad multi-marca (leida entera). TrainingPeaks, en un correo a entrenadores citado por DC Rainmaker: "seguira operando como ecosistema multiplataforma". Ni Garmin ni TP hablan del programa de desarrolladores.
- Hechos vs especulacion: HECHO la pausa, la ausencia de fecha, que Connect IQ es otro programa y no esta afectado (FAQ oficial: "One does not require the use of the other"). ESPECULACION: que la compra endurezca el acceso (DC Rainmaker cita el precedente Firstbeat, donde las licencias a terceros "fueron desapareciendo"); que la pausa venga del pleito de Strava (the5krunner, sin confirmacion de Garmin). Coachbox (competidor de TP, sesgado) afirma que los marcos TSS, NP e IF pasan a Garmin y que la API de TP es solo para desarrolladores comerciales aprobados (SECUNDARIO).
Fuente
- https://developer.garmin.com/gc-developer-program/ ; .../training-api/ ; .../program-faq/ (2026-09-29)
- https://www.garmin.com/en-US/newsroom/press-release/corporate/garmin-acquires-trainingpeaks-and-trainheroic-leading-endurance-and-strength-training-platforms-for-athletes-and-coaches/ (2026-07-22)
- https://www.dcrainmaker.com/2026/07/garmin-acquires-training-trainheroic.html (2026-07)
- https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/ (2026-09-14)
- https://tryterra.co/blog/garmin-connect-developer-program-pause ; https://sahha.ai/blog/garmin-developer-program-paused/ (2026-09-19)
- https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-mobile-andriod/441607/garmin-connect-api-access-paused-for-months-what-are-startups-supposed-to-do
- https://coachbox.app/en/compare/garmin-trainingpeaks-acquisition/
Estado: VERIFICADO (aviso oficial y sin formulario). SECUNDARIO (texto de Garmin a solicitantes, fechas de primavera y 20 mayo). NO ENCONTRADO (fecha de reapertura, cambios de terminos, cierre a competidores, anuncio oficial).

## P6. Connect IQ Store: apps de entrenamiento con plan y actividad propia
Metodo: crawl de la API de busqueda de la Store, 2026-09-29. Tipos: 1 watch face, 2 app de dispositivo (la que graba actividad), 3 widget, 4 campo de datos. Recuento propio con regex sobre nombre y descripcion, sobre 1.546 apps de dispositivo devueltas por 16 busquedas de fitness (no es el total de la Store; la busqueda es difusa).
- Apps de dispositivo que mencionan HYROX: 44. Mencionan EMOM o AMRAP: 45. Mencionan fuerza/gym/reps: 343. Tipo coach/plan/entreno del dia (regex laxa): 216. De las que son plan/coach/HYROX con cuenta o app externa y permiso Communications: 81 (heuristica). Ausentes de la Store: TrainingPeaks, TrainHeroic, TrainerRoad, Trainerize, TrueCoach, Everfit, Final Surge, Fitbod.
Competidoras HYROX/hibridas (nombre, descargas, valoracion x reseñas, version y fecha, que hace, que le falta segun reseñas de la Store)
1. HYROX Tracker: ROXZONE (ChanDigital): 10k+, 4.7 x199, v5.1.0 (2026-09-23), ~100 dispositivos. Formato oficial de 8 estaciones con cargas por categoria, transiciones Roxzone, entrenos propios (elegir estaciones, orden, carreras, reps, peso, bucles), simulacion parcial 25/50/75%, plan de carrera en el movil (beta) con ventaja/retraso en vivo. Pago unico en roxzone.app. Falta: crear entrenos en el reloj es poco practico, no se pueden cambiar los ejercicios (p.ej. bici), a veces no guarda (reseña 1 estrella, 2026-08-29).
2. Hyrox Tracker (RunLabs): 10k+, 3.6 x19, v1.5.0 (2026-09-20). Cronometro 8 carreras + 8 estaciones, FIT con 16 laps. Falta: sin pausa (reseña), no sincroniza con Strava (reseña), no funciona bien en vivoactive 6.
3. ROXFIT: 10k+, 3.4 x27, v1.0.36 (2026-09-26), 130 dispositivos. Crea entrenos y carreras PACEME en su app movil y los sincroniza al reloj, reproduccion guiada con ritmo en vivo, parciales por estacion, Roxzone. Falta: el boton de vuelta (lap) falla en varias versiones (reseñas 1-3 estrellas, sept 2026), lag, sin distancia en cinta.
4. Hybrid Smash for Hyrox: 1k+, 4.1 x41, v26.0. Race day, entreno libre, 8 programas por fases (Base, Build, Peak, Taper). Falta: en Garmin Connect la actividad sale como "correr indoor" y las estaciones como descanso, se cuelga en mitad de la carrera (reseñas 1 estrella, feb-abr 2026).
5. HYROX Tracker: RoxTrack (FerdinLabs): 1k+, 4.1 x18, v5.5. Carrera completa en una actividad, 11 ejercicios propios. Falta: "Garmin no interpreto bien las vueltas" (reseña 2026-05-07).
6. WodBuddy (Crossfit y Hyrox): 1k+, 3.6 x39. IA que convierte una foto de pizarra en entreno, EMOM/AMRAP. Falta: fallos de inicio de sesion y de sincronizacion con el reloj (reseñas 1 estrella, dic 2025-ene 2026).
7. Hyrox - Training (LouisValli): 1k+, 4.0 x11. Sin Roxzone ni informe en la app de Garmin (reseña 2026-03-19).
8. HYROX COACH y HYROX COACH PRO (bikintulis.de): 1k+, 5.0 x2. Plan entregado "un dia cada vez", prueba de 3 entrenos, compra unica en app aparte.
Con plan desde plataforma externa (mas parecidas a un TrainingPeaks en el reloj)
9. Kinevo Daily Workout: 10+, sin reseñas, v1.1.0. Baja el entreno que prescribio el coach en Kinevo y lo guarda como entreno NATIVO de Garmin (correr y circuitos); exige cuenta Kinevo y codigo de emparejamiento; no mide nada por si misma. FRENESIT Training: 1+, mismo patron con codigo de 6 caracteres.
10. Xert Workout Player: 10k+, 3.6 x61. Baja el entreno de Xert Online y lo ejecuta con potenciometro y rodillo. Stryd Workout App: 50k+, 3.4 x271 (2023), entrenos por potencia. Type to Run: 1k+, 4.2 x49, coach adaptativo con suscripcion en su web. Reckoner (fuerza): 100+, 5.0 x4, cuenta gratuita en reckoner.fit. Rack: 1k+, 4.3 x25, companera de app iOS. Strength Tracker (LiftSync): 1k+, 4.4 x7, plan construido en web, sync a reloj y de vuelta.
Genericas de gran volumen: F3b Silový Trénink+ 100k+ 4.0 x366; Tabata (Efflon) 100k+ 4.3 x148; Cross-Training (Juggus) 50k+ 4.5 x191.
Lo que le falta a casi todas segun reseñas: fiabilidad del boton de vuelta, como aparece la sesion en Garmin Connect (tramos, estaciones), cuelgues, y sincronizar el plan sin fricciones.
Fuente
- API de la Store (2026-09-29) y fichas, p.ej. https://apps.garmin.com/apps/63ce327f-0dfc-46a8-97cd-a9e0f05217af ; reseñas por app via .../apps/<id>/reviews (ids: ROXZONE 95ff2e3b-7417-4bcf-8ced-7e4b70113616, ROXFIT 3b6e31a6-b95b-4dc5-ae6c-dbc179a868e8, RunLabs d322c2aa-5fd0-4c32-bca6-a4f87d3074d6, Hybrid Smash c127ac62-342e-4995-a7b0-b091a3c2334b, RoxTrack 85116b79-e185-4022-a9be-4a102940b56c, WodBuddy 555e0c30-8608-4432-8db8-984921ed47bd, Kinevo aa4abbd2-8201-4e99-bb1e-b1598240f9ba)
- Datos crudos guardados en el scratchpad: .../scratchpad/r3/ciq_dev_all.json, ciq_hyrox.json
Estado: VERIFICADO como lectura de la Store oficial (datos y reseñas de usuarios, que son opiniones). Los recuentos por regex son MIOS. Descargas en cubos, no exactas.

## P7. Como se ve una actividad de una app CIQ de terceros en Garmin Connect
Hallazgo
- Oficial: una app CIQ crea un FIT con ActivityRecording (start, stop, save), el FIT se sincroniza con Garmin Connect y se muestra; con FitContributor añade campos propios que salen en graficos, vueltas (laps) y resumen de la pagina de detalle ("The FIT file will sync with Garmin Connect").
- Oficial: la app puede declarar deporte y subdeporte nativos: SPORT_HIIT y SUB_SPORT_HIIT/EMOM/AMRAP/TABATA/OBSTACLE (API 4.1.6), SPORT_TRAINING, SUB_SPORT_STRENGTH_TRAINING y CARDIO_TRAINING (API 3.2.0), SPORT_MULTISPORT (con aviso: un dispositivo sin multisport nativo no gana sus transiciones). No existe constante HYROX.
- Oficial: las reglas de revision prohiben sobrescribir datos ya sincronizados en Garmin Connect.
- Contarian para carga, Training Effect y Training Status? NO ENCONTRADO en fuente oficial. El manual del Forerunner 970 explica Training Status, carga aguda y Training Effect sin mencionar apps de terceros.
- SECUNDARIO, contradictorio: (a) foro de Xert, oct 2024: el personal de Xert y usuarios dicen que las actividades grabadas con su app CIQ no reciben Training Effect ni carga de Garmin (no es empleado de Garmin). (b) Descripciones de apps en la Store (marketing del desarrollador): Rack dice que su sesion "cuenta para Training Load, Training Effect y Training Readiness"; CrossFit Session dice que el deporte HIIT nativo cuenta para carga, tiempo de recuperacion y minutos de intensidad y que archivarlo como "Other" hace que nada lo lea bien. Ningun empleado de Garmin lo confirma. Un hilo antiguo (2013-14) de un desarrollador que parece ser de Garmin (Travis Vitek) dice que el tipo de deporte determina que metricas se registran.
- Como se ve en la practica (reseñas de la Store): Hybrid Smash, "sale como correr indoor y las estaciones como pausa"; RoxTrack, "Garmin no interpreto bien las vueltas"; Hyrox - Training, "sin informe en la app de Garmin". ROXZONE anuncia "una simulacion, una actividad guardada, parciales limpios".
Fuente
- https://developer.garmin.com/connect-iq/articles/core-topics/Activity_Recording.html
- https://developer.garmin.com/connect-iq/api-docs/Toybox/ActivityRecording.html ; https://developer.garmin.com/connect-iq/api-docs/Toybox/Activity.html
- https://developer.garmin.com/connect-iq/articles/app-review-guidelines/Overview.html (act. 2021-10-13)
- https://forum.xertonline.com/t/track-my-training-load-and-effect-via-garmin-using-xert/37343 (oct 2024)
- https://forums.garmin.com/developer/connect-iq/f/discussion/3624/type-of-sport-in-activity-recording-session
- Fichas de la Store: Rack 248b678a-4e1f-48f7-8d83-15bdf894bf7a, CrossFit Session (descripcion en la API)
Estado: VERIFICADO (grabacion, campos propios, constantes de deporte). NO ENCONTRADO (carga/TE oficial). SECUNDARIO (Xert y desarrolladores). Hay que probarlo con un reloj real antes de prometerlo.

## P8. Modelo de negocio en la Connect IQ Store
Hallazgo
- Apps de pago SI, con el sistema de monetizacion de Garmin (lanzado 2024-08-06): cuota anual NO reembolsable de 100 USD; el desarrollador debe tener entidad legal en EEUU, Canada, Australia, Singapur o la mayoria de la UE (España incluida), se admite "individual/autonomo" con documentos de identidad, direccion, impuestos e IVA; precios en escalones fijos de 2 a 100 USD (sin impuestos); Garmin se queda el 15% del precio sin impuestos; pagos el dia 1 de cada mes con saldo minimo de 10 USD; ventana de devolucion de 48 h; las apps de pago solo se ofrecen en la lista de dispositivos que Garmin publica (API 3.4 en adelante). La ayuda oficial habla de compra de app; SUSCRIPCIONES: NO ENCONTRADO en la documentacion oficial del sistema (un blog dice que si, sin base oficial; la nota de prensa habla de compras unicas).
- Pago propio y desbloqueo externo SI existen: modo prueba con "unlockURL" HTTPS y callback firmado (OAuth1) para que el desarrollador cobre y desbloquee fuera; no es obligatorio usar el Merchant Service. En la practica: ROXZONE "compra unica en roxzone.app", Type to Run "suscripcion de pago tras 3 semanas" en su web, Zone2AI "suscripcion en app iPhone", HYROX COACH "compra unica en app aparte".
- Cuenta externa obligatoria: permitida y habitual. Garmin ofrece OAuth para login en servicios web y las guias exigen declarar dependencias y requisitos. Ejemplos aprobados: Kinevo ("REQUIERE CUENTA KINEVO, no funciona sola"), Reckoner, BulkForged, FRENESIT (emparejamiento por codigo, sin pedir la contraseña de Garmin).
- Reglas de revision (guias, ultima actualizacion 2021-10-13): declarar si requiere pago; describir todas las funciones, limites y dependencias; avisar si es gratis solo un tiempo o un numero de usos; politica de reembolso; consentimiento expreso para renovacion automatica; no afirmar alianza con Garmin; no usar marcas ajenas sin permiso; politica de privacidad propia; cumplir RGPD; no anular datos ya sincronizados; no danar bateria ni otras funciones; apps medicas necesitan documentacion regulatoria; sin app para menores de 13; contenido de usuario exige moderacion.
- Plazos: la pagina oficial de publicacion dice que las revisiones se completan "en 72 horas, salvo circunstancias especiales" (+48 h si usa perfiles ANT+); una beta sirve para probar ajustes y campos propios en produccion sin publicar. Hilo de foro de dic 2023: retrasos de mas de 10 dias y una denegacion por "legal issues" (SECUNDARIO, sin empleados en el hilo). Fecha de la pagina de plazos: no consta.
- Marca HYROX: 44 apps ya lo usan en nombre y descripcion, pero Amazfit tiene la exclusiva del socio oficial y las guias de Garmin piden permiso para marcas ajenas. Riesgo legal a valorar, no probado.
Fuente
- https://developer.garmin.com/connect-iq/articles/monetization/Overview.html ; .../App_Sales.html ; .../Merchant_Onboarding.html ; .../Account_Management.html ; .../Price_Points.html (leidos 2026-09-29; paginas en https://developer.garmin.com/connect-iq/monetization/)
- https://developer.garmin.com/connect-iq/articles/core-topics/Trial_Apps.html ; .../Beta_Apps.html ; .../Publishing_to_the_Store.html ; .../Authenticated_Web_Services.html
- https://developer.garmin.com/connect-iq/articles/app-review-guidelines/Overview.html
- https://www.garmin.com/en-US/newsroom/press-release/wearables-health/garmin-enables-premium-app-purchases-in-the-connect-iq-store-and-unveils-fun-new-watch-faces-and-apps/ (2024-08-06)
- https://forums.garmin.com/developer/connect-iq/f/connect-iq-web-store/428068/app-approval-process-taking-longer-than-usual-10-days
Estado: VERIFICADO (monetizacion, cuotas, OAuth, unlock URL, guias, 72 h). NO ENCONTRADO (suscripciones en el Merchant Service, plazo real 2026). SECUNDARIO (retrasos de 2023).

## Que significa para nosotros (12 lineas)
1. Donde TP es fuerte en el reloj: llega a TODOS los Garmin (Edge 500 en adelante, Forerunner 910XT en adelante) por el calendario de Garmin Connect, con cambios del coach al instante y el reproductor nativo de Garmin con objetivos de FC, ritmo y potencia; y devuelve la actividad y metricas de salud solos.
2. Donde es debil: la fuerza NO llega al reloj (se ejecuta en el movil), RPE en el reloj es solo un temporizador, rango +/-10% que no es la zona, sin segundo objetivo (salvo cadencia), 15 dias de ventana, sin tipo Brick, y nada de circuito carrera+estaciones con objetivo por estacion.
3. Ni Garmin nativo ni TP resuelven el hibrido: no hay perfil HYROX (verificado en manuales de sept y ago 2026), Mixed Session es manual y sin plan de pasos, el creador de Garmin no tiene RPE/RIR como objetivo.
4. Ventaja real y verificable de una app CIQ propia: controlar la pantalla del reloj para sesiones hibridas (tramos y estaciones en UNA actividad, objetivo por tramo, reps/carga/RIR como campos propios FitContributor visibles en Garmin Connect) y no depender de la Training API pausada: Garmin documenta que una app CIQ puede bajar un FIT de entreno a Persisted Content y lanzarlo en el reproductor nativo, y que puede hacer OAuth con un servicio externo.
5. Prueba de mercado: 44 apps HYROX y varias con plan desde cuenta externa (Kinevo, FRENESIT, Xert, Reckoner) aprobadas; ROXZONE (10k+, 4.7 x199) cobra pago unico fuera de Garmin. El hueco no es "tener app", es fiabilidad (boton de vuelta, cuelgues) y como queda la sesion en Garmin Connect.
6. Lo que TP no podra copiar rapido: plan del coach hibrido con estaciones y reps ejecutable en el reloj y grabado como una sesion limpia. Lo que SI puede hacer Garmin: integrar TP en Connect+ o dar HYROX nativo (especulacion, sin anuncio).
7. Riesgo mayor sin resolver: NO esta verificado que una actividad CIQ cuente para Training Effect, carga y Training Status (docs oficiales callan; un hilo de Xert dice que no; marcas de apps dicen que si con deporte nativo). Probar con reloj real y sub-deporte HIIT/Strength antes de prometerlo.
8. Riesgos de marca y negocio: usar "HYROX" en nombre o texto (Amazfit tiene la exclusiva de socio) y cobrar: para cobrar con Garmin hace falta entidad legal en pais admitido (aviso: nuestro registro dice sin entidad legal) y suscripciones no constan en el sistema oficial; el cobro por Stripe con unlockURL o cuenta externa esta documentado y en uso.
9. Camino sin la API: aunque las altas sigan pausadas (sin fecha), Connect IQ esta abierto y separado. Revision oficial 72 h. Para el 100% de dispositivos habra que gestionar niveles de API y la lista de dispositivos.
10. No verificado: contenido de las paginas de soporte de Garmin (403), especificacion completa de la Training API (cerrada tras aprobacion), si Garmin Connect ya admite EMOM/AMRAP estructurado, y el plazo de revision actual.
