'use client';

// El inventario del doble — la única lista de pantallas.
//
// Cada entrada es un módulo bajo ./screens/<id>/ que exporta { meta,
// escenarios, Screen }. El sello `estado` es el contrato de sinceridad del
// doble: «espejo» = réplica de Swift shipeado (con sus fuentes), «propuesta» =
// mockup de lo aún no construido, y PENDIENTES enumera los huecos para que el
// desfase se VEA en el índice en vez de sospecharse.

import type { TwinEstado, TwinPendiente, TwinScreenModule, TwinZona } from './types';

import * as benchmarkErg from './screens/benchmark-erg';
import * as runLive from './screens/run-live';
import * as devices from './screens/devices';
import * as watchLive from './screens/watch-live';
import * as marks from './screens/marks';
import * as rankingBox from './screens/ranking-box';
import * as perfilRendimiento from './screens/perfil-rendimiento';
import * as testsCalibracion from './screens/tests-calibracion';
import * as testComparativa from './screens/test-comparativa';
import * as testInforme from './screens/test-informe';
import * as chatCoach from './screens/chat-coach';
// Preguntar SOBRE algo (12-ago): el chat de arriba, pero sabiendo de qué va el
// mensaje. Vive aparte porque `chat-coach` ya se shipeó y esto todavía no.
import * as chatContexto from './screens/chat-contexto';
import * as analiticasVeredicto from './screens/analiticas-veredicto';
import * as gateBloque from './screens/gate-bloque';
import * as entrenoVivo from './screens/entreno-vivo';
import * as postEntreno from './screens/post-entreno';
import * as planBloque from './screens/plan-bloque';
import * as sesionPrevia from './screens/sesion-previa';
import * as vivoCorrer from './screens/vivo-correr';
import * as vivoErg from './screens/vivo-erg';
import * as vivoFuerza from './screens/vivo-fuerza';
import * as vivoEmom from './screens/vivo-emom';
import * as vivoFortime from './screens/vivo-fortime';
import * as vivoAmrap from './screens/vivo-amrap';
import * as vivoDobles from './screens/vivo-dobles';
import * as watchVivo from './screens/watch-vivo';
// La segunda vuelta del reloj (18-ago): `watch-vivo` ya resolvió el ANCHO del
// numeral; `watch-legible` ataca el CROMO que se quedó a 9–11 pt y suma la
// corona, el bloqueo por agua, Ahora/Después y terminar en modo espejo.
import * as watchLegible from './screens/watch-legible';
// La muñeca, rehecha (25-sep): la auditoría de seis lentes y el modelo de
// docs/reloj-muneca/modelo.md. Un kit (`kit-reloj`), una gramática, el objetivo manda.
import * as relojCorrer from './screens/reloj-correr';
import * as relojGramatica from './screens/reloj-gramatica';
import * as relojCircuito from './screens/reloj-circuito';
import * as relojFuerza from './screens/reloj-fuerza';
import * as relojWod from './screens/reloj-wod';
import * as relojAntesDespues from './screens/reloj-antes-despues';
// El vivo del iPhone, rehecho (28-sep): un estado, dos pintores. La gramática
// primero (el kit `kit-iphone-vivo` sobre el motor y las reglas de `kit-reloj`);
// las cinco familias (`iphone-vivo-*`) se construyen encima.
import * as iphoneVivoGramatica from './screens/iphone-vivo-gramatica';
import * as iphoneVivoCorrer from './screens/iphone-vivo-correr';
import * as iphoneVivoErgo from './screens/iphone-vivo-ergo';
import * as iphoneVivoFuerza from './screens/iphone-vivo-fuerza';
import * as iphoneVivoWod from './screens/iphone-vivo-wod';
import * as iphoneVivoCircuito from './screens/iphone-vivo-circuito';
import * as resumenCarrera from './screens/resumen-carrera';
import * as watchResumen from './screens/watch-resumen';
import * as planCiclo from './screens/plan-ciclo';
import * as planSemana from './screens/plan-semana';
import * as planDia from './screens/plan-dia';
// Compartir el entreno (24-ago): la story de Instagram. Vive en «Plan y hoy»
// porque se sale desde el día, y es propuesta pura — la app no tiene hoy
// ninguna forma de compartir un entreno.
import * as compartirEntreno from './screens/compartir-entreno';
// La muñeca, formato a formato (30-jul): nueve vistas cuyo diseño NO lo decide
// el formato sino qué mide el reloj de verdad en esa modalidad y si el atleta
// puede mirar y tocar en ese momento. Ver `kit-watch/modelo.ts`.
import * as watchRodaje from './screens/watch-rodaje';
import * as watchSeries from './screens/watch-series';
import * as watchCinta from './screens/watch-cinta';
import * as watchErgo from './screens/watch-ergo';
import * as watchFuerza from './screens/watch-fuerza';
import * as watchEmom from './screens/watch-emom';
import * as watchFortime from './screens/watch-fortime';
import * as watchAmrap from './screens/watch-amrap';
import * as watchDobles from './screens/watch-dobles';
// La décima (5-ago): la familia que se quedó sin pantalla al reordenar las
// superficies — series, tabata, death by y trabajo continuo cuando la modalidad
// no es ni correr ni ergo. Los cuatro los corta el reloj de pared; cada uno hace
// otra pregunta, y por eso son cuatro sujetos y no cuatro banderas.
import * as watchRelojDePared from './screens/watch-reloj-de-pared';
// La undécima (9-ago): la zona como SUJETO. «Z3» a 145 y a 158 dice lo mismo, y
// uno de los dos está a un latido de Z4 — así que el lienzo se llena del color
// de tu zona conforme te acercas a la siguiente. Idea de Alex tras hacer series.
import * as watchZona from './screens/watch-zona';
// «Del coach» (9-ago): comunicación estructurada coach→atleta FUERA del chat.
// El chat conversa; un comunicado se publica y se rastrea. Nace del caso real
// del plan rehecho a Singles Pro, donde todo lo que había que decirle —el
// porqué del objetivo, un calentamiento de siete pasos, dos tareas con fecha y
// una pregunta que bloquea el taper— viajó por el chat con el mismo peso y el
// mismo estado que un «ok»: ninguno. El modelo entero vive en `coach-com/`.
import * as coachBandeja from './screens/coach-bandeja';
import * as coachPregunta from './screens/coach-pregunta';
import * as coachProtocolo from './screens/coach-protocolo';
import * as coachNota from './screens/coach-nota';
// Muchas rondas (10-ago): la lista del vivo pinta una fila por ronda y la
// ranura no scrollea, así que a partir de cuatro EMPUJA — es el agujero que ese
// mismo día dejó EMPEZAR fuera de pantalla y que docs/DECISIONS.md dejó abierto
// como decisión de UX. La respuesta no vale para las 16 estaciones de un HYROX
// (ahí cada fila dice algo distinto): vale para las RONDAS, que se repiten.
import * as vivoRondas from './screens/vivo-rondas';
// La clave (11-ago): el tramo que corre el entreno lleva `videoUrl` y nada más
// de contenido, así que en mitad de una serie la única salida es pedir un vídeo
// y abrirlo pausa el cronómetro. Los consejos y la nota del coach ya viajan al
// móvil, pero se quedan en la ficha del plan. Esta pantalla los baja al vivo
// resueltos a UNA línea, con la nota de hoy ganando al catálogo.
import * as vivoClave from './screens/vivo-clave';
// Sensor fases 2–3 (11-ago): contador precargado + semáforo m/s. Propuesta —
// Grok el cable; Claude el HUD final en vivo-fuerza.
import * as contadorReps from './screens/contador-reps';
import * as velocidadSerie from './screens/velocidad-serie';
// La lectura de la carrera (12-ago): con el archivo guardado (tanda T0) aparece
// un sujeto que antes no podía existir — si el atleta CLAVÓ lo que le pidieron.
// `resumen-carrera` elegía el sujeto por la FORMA de lo corrido; esta le suma la
// otra mitad, la INTENCIÓN del coach, y con ella la curva lleva la banda
// dibujada y el troceado es por serie o por kilómetro, nunca los dos.
import * as lecturaCarrera from './screens/lectura-carrera';
// La otra sesión (card 118, 20-ago). `lectura-carrera` contesta «¿la carrera
// midió lo pedido?»; esta contesta la pregunta que viene antes — qué hiciste,
// cuando la sesión mezcla fuerza, ergómetro, correr y funcional en cualquier
// orden, o es puramente una de esas cosas. El sujeto lo elige el FORMATO
// (for time · AMRAP · EMOM · fuerza · libre), nunca el formato de otra.
import * as lecturaSesion from './screens/lectura-sesion';
// La otra pregunta del atleta (12-ago). `lectura-carrera` contesta qué pasó EN
// una carrera; esta contesta si todo esto sirve para algo. Sustituye la rejilla
// de tarjetas por un veredicto defendible y la evidencia ordenada por causa —
// lo que sale antes que lo que metes —, y sabe decir «todavía no lo sé».
import * as analiticasCorrer from './screens/analiticas-correr';
// El hogar del running (13-ago tarde, mapa v2): la pastilla Carrera deja de ser
// una tira y pasa a hub con puertas navegables. Seis propuestas de una tanda:
// el nivel 0 (hub), las dos vistas que el mapa v1 excluía y Alex revocó
// (historial DENTRO de la tab, tendencias por métrica y periodo), la ficha de
// sesión alcanzable por push días después (con la comparativa «vs tu último
// 6×800»), capacidad (umbral+zonas+VC+récords+predictor, y el CTA del test de
// zonas recolocado: solo sin ancla, y aterriza en SU test — jamás la batería),
// y por tipo («¿voy más rápido en series?»).
import * as correrHub from './screens/correr-hub';
import * as correrHistorial from './screens/correr-historial';
import * as correrFicha from './screens/correr-ficha';
import * as correrTendencias from './screens/correr-tendencias';
import * as correrCapacidad from './screens/correr-capacidad';
import * as correrPorTipo from './screens/correr-por-tipo';
// Lo que el atleta hizo no se pierde (25-sep, decisiones de Alex en la misma
// tanda que la cola que ya no tira un 4xx). Dos propuestas: qué ve si el
// servidor RECHAZA su entreno — «Guardado en tu móvil» y «Sin subir» en el
// historial, en vez de un REINTENTAR sin salida — y el permiso para subir lo que
// graba el reloj, que se pide una vez al acabar el primer entreno de muñeca.
import * as guardadoEnMovil from './screens/guardado-en-movil';
import * as consentimientoSensores from './screens/consentimiento-sensores';
// Las analíticas, rehechas (29-sep): un cálculo, dos pintores (docs/analiticas/
// modelo.md). La portada del atleta y sus detalles sobre `kit-analiticas`, y la
// pestaña Rendimiento del coach como dispositivo «escritorio» con tokens v2.
import * as analiticasPortada from './screens/analiticas-portada';
import * as analiticasFamiliaCorrer from './screens/analiticas-familia-correr';
import * as analiticasFamiliaErgo from './screens/analiticas-familia-ergo';
import * as analiticasFamiliaFuerza from './screens/analiticas-familia-fuerza';
import * as analiticasFamiliaEstaciones from './screens/analiticas-familia-estaciones';
import * as analiticasSesion from './screens/analiticas-sesion';
import * as analiticasPanelCoach from './screens/analiticas-panel-coach';
// Hoy, rehecho (29-sep): la portada del atleta (InicioView), «El día» — sujeto: el
// momento del día — sobre UN modelo (`kit-hoy/contrato`). La otra dirección
// («El pulso», sujeto: cómo llegas) se descartó; vive en git (f7b353da).
import * as hoyDia from './screens/hoy-dia';
// Las pestañas del atleta con el diseño de «Hoy · El día» (29-sep, firmado por Alex).
import * as planRehecho from './screens/plan-rehecho';
import * as carrerasRehecho from './screens/carreras-rehecho';
import * as perfilRehecho from './screens/perfil-rehecho';

export const SCREENS: TwinScreenModule[] = [
  benchmarkErg,
  runLive,
  devices,
  watchLive,
  marks,
  rankingBox,
  // La tanda de composición (§6): todas declaran su ficha y se pueden ver
  // en «cómo está hoy» además de en propuesta.
  perfilRendimiento,
  testsCalibracion,
  // El resultado de un test contra otro (2-ago): el hub dice CUÁNTOS has hecho;
  // esta dice qué cambió y qué se movió en tu plan por haberlo hecho.
  testComparativa,
  testInforme,
  chatCoach,
  chatContexto,
  analiticasVeredicto,
  analiticasCorrer,
  // El hogar del running (13-ago tarde): el hub primero — es el nivel 0 — y
  // detrás sus vistas en el orden en que se navegan desde él.
  correrHub,
  correrHistorial,
  correrFicha,
  correrTendencias,
  correrCapacidad,
  correrPorTipo,
  gateBloque,
  entrenoVivo,
  postEntreno,
  // La tanda inmersiva (29-jul): una vista por quién gobierna el entreno
  // (el reloj en EMOM y AMRAP, el hito en series de calle y ergo, el atleta
  // en fuerza, el suceso en For Time, el relevo en dobles) más el contexto
  // (el plan del bloque, la ficha de sesión con vídeo) y la muñeca.
  planBloque,
  sesionPrevia,
  vivoCorrer,
  vivoErg,
  vivoFuerza,
  vivoEmom,
  vivoFortime,
  vivoAmrap,
  vivoDobles,
  watchVivo,
  watchLegible,
  // Al terminar de correr (29-jul): un fartlek no tiene un ritmo, tiene dos, y
  // promediarlos da un número que no describe ningún momento de la carrera.
  // El sujeto lo decide la FORMA de lo que corriste (`tramos.ts`), no el
  // formato de la pantalla. Móvil y muñeca leen el MISMO dato.
  resumenCarrera,
  lecturaCarrera,
  lecturaSesion,
  watchResumen,
  // El plan a tres distancias (29-jul): tres preguntas sobre el MISMO objeto —
  // hacia dónde voy (ciclo), qué me toca y qué llevo (semana), qué hay hoy y
  // con qué dosis (día). Comparten modelo, escenarios y vocabulario visual en
  // `plan/`, y van de lejos a cerca, que es como se navegan.
  planCiclo,
  planSemana,
  planDia,
  compartirEntreno,
  watchRodaje,
  watchSeries,
  watchCinta,
  watchErgo,
  watchFuerza,
  watchEmom,
  watchFortime,
  watchAmrap,
  watchDobles,
  watchRelojDePared,
  watchZona,
  // La tanda «Del coach» (9-ago): la bandeja primero, porque es la que da
  // sentido a las otras tres; los detalles después, en el orden en que se
  // abren desde ella.
  coachBandeja,
  coachPregunta,
  coachProtocolo,
  coachNota,
  vivoRondas,
  vivoClave,
  contadorReps,
  velocidadSerie,
  // La tanda de «nada se pierde» (25-sep): el rechazo primero, porque es el
  // resumen de siempre en otro estado; el consentimiento después, que sale del
  // mismo resumen la primera vez que el reloj graba.
  guardadoEnMovil,
  consentimientoSensores,
  // La muñeca, rehecha (25-sep).
  relojCorrer,
  relojGramatica,
  relojCircuito,
  relojFuerza,
  relojWod,
  relojAntesDespues,
  // El vivo del iPhone, rehecho (28-sep).
  iphoneVivoGramatica,
  iphoneVivoCorrer,
  iphoneVivoErgo,
  iphoneVivoFuerza,
  iphoneVivoWod,
  iphoneVivoCircuito,
  // Las analíticas, rehechas (29-sep): la portada, los detalles por familia y la sesión.
  analiticasPortada,
  analiticasFamiliaCorrer,
  analiticasFamiliaErgo,
  analiticasFamiliaFuerza,
  analiticasFamiliaEstaciones,
  analiticasSesion,
  // El panel del coach, como dispositivo «escritorio».
  analiticasPanelCoach,
  // Las pestañas del atleta, rehechas (29-sep): Hoy, Plan, Carreras y Perfil.
  // (Registradas en orden inverso: el índice pone primero lo último añadido, y Hoy va antes que Plan, Carreras y Perfil.)
  perfilRehecho,
  carrerasRehecho,
  planRehecho,
  hoyDia,
];

export function getScreen(id: string): TwinScreenModule | undefined {
  return SCREENS.find((s) => s.meta.id === id);
}

/** Un grupo de una colección: un título y las pantallas, en el orden en que se navegan. */
export interface GrupoColeccion {
  grupo: string;
  ids: string[];
}

/**
 * Una COLECCIÓN del doble: una tanda con dirección propia (`/design/<id>`),
 * agrupada por su propia lógica y con una card en su zona del índice. Existe
 * porque el índice general mezcla épocas y propuestas que se solapan; la
 * colección es la dirección canónica de un trabajo y se enseña sola.
 */
export interface Coleccion {
  id: 'entreno' | 'analiticas' | 'pestanas';
  zona: TwinZona;
  titulo: string;
  /** Lo que dice la card en el índice. */
  descripcion: string;
  /** Los párrafos de la portada de la colección. */
  intro: string[];
  grupos: ReadonlyArray<GrupoColeccion>;
}

/**
 * La tanda inmersiva del entreno (29-jul) con dirección PROPIA:
 * `/design/entreno`.
 */
export const TANDA_ENTRENO: ReadonlyArray<GrupoColeccion> = [
  // El vivo del iPhone, rehecho (28-sep): manda sobre «En vivo, por quién
  // gobierna», que queda como historia. La gramática primero; las familias,
  // cuando se construyan, detrás.
  { grupo: 'El vivo del iPhone, rehecho', ids: ['iphone-vivo-gramatica', 'iphone-vivo-correr', 'iphone-vivo-ergo', 'iphone-vivo-fuerza', 'iphone-vivo-wod', 'iphone-vivo-circuito'] },
  // La dirección vigente de la muñeca (25-sep): va primero porque manda sobre
  // las tandas «La muñeca» de abajo, que quedan como historia de cómo se llegó.
  {
    grupo: 'La muñeca, rehecha',
    ids: [
      'reloj-correr',
      'reloj-gramatica',
      'reloj-circuito',
      'reloj-fuerza',
      'reloj-wod',
      'reloj-antes-despues',
    ],
  },
  { grupo: 'Antes de entrenar', ids: ['plan-bloque', 'sesion-previa'] },
  {
    grupo: 'En vivo, por quién gobierna',
    ids: [
      'vivo-correr',
      'vivo-erg',
      'vivo-fuerza',
      'vivo-emom',
      'vivo-fortime',
      'vivo-amrap',
      'vivo-dobles',
      'vivo-rondas',
      // No es un formato más: es lo que se puede LEER mientras corre cualquiera
      // de los de arriba. Va con ellos porque es donde se juzga.
      'vivo-clave',
    ],
  },
  { grupo: 'Al terminar', ids: ['resumen-carrera', 'lectura-carrera', 'lectura-sesion'] },
  { grupo: 'La muñeca', ids: ['watch-vivo', 'watch-legible', 'watch-resumen'] },
  {
    grupo: 'La muñeca, formato a formato',
    ids: [
      'watch-rodaje',
      'watch-series',
      'watch-cinta',
      'watch-ergo',
      'watch-fuerza',
      'watch-emom',
      'watch-fortime',
      'watch-amrap',
      'watch-dobles',
      'watch-reloj-de-pared',
      'watch-zona',
    ],
  },
];

/**
 * Las analíticas, rehechas (29-sep): un cálculo, dos pintores. La portada
 * del atleta y sus detalles (iPhone) y la pestaña Rendimiento de la ficha del
 * coach (escritorio), sobre el contrato de docs/analiticas/modelo.md §5.
 */
export const TANDA_ANALITICAS: ReadonlyArray<GrupoColeccion> = [
  { grupo: 'La portada del atleta', ids: ['analiticas-portada'] },
  {
    grupo: 'Los detalles, por familia y por sesión',
    ids: ['analiticas-familia-correr', 'analiticas-familia-ergo', 'analiticas-familia-fuerza', 'analiticas-familia-estaciones', 'analiticas-sesion'],
  },
  { grupo: 'El panel del coach', ids: ['analiticas-panel-coach'] },
];

/** Las pestañas del atleta con el diseño de «Hoy · El día» (29-sep). */
export const TANDA_PESTANAS: ReadonlyArray<GrupoColeccion> = [
  { grupo: 'Hoy', ids: ['hoy-dia'] },
  { grupo: 'Plan', ids: ['plan-rehecho'] },
  { grupo: 'Carreras', ids: ['carreras-rehecho'] },
  { grupo: 'Perfil', ids: ['perfil-rehecho'] },
];

export const COLECCIONES: ReadonlyArray<Coleccion> = [
  {
    id: 'pestanas',
    zona: 'Plan y hoy',
    titulo: 'Las pestañas, rehechas',
    descripcion:
      'Hoy, Plan, Carreras y Perfil con un solo diseño: el sujeto de cada pantalla en bloque editorial de marca, tipografía itálica pesada, un póster de carrera y todos los estados resueltos.',
    intro: [
      'El diseño lo fijó «Hoy · El día» (firmado por Alex el 29-sep): cada pestaña tiene UN sujeto que se ve primero y por mucho más grande, tinte propio por momento, el naranja sólido solo para «haz esto ahora» y las piezas compartidas en `kit-dia`. Las cuatro pantallas comparten el vocabulario visual y el contrato de UI, no el contenido.',
      'Cada pestaña se prueba con atletas de ejemplo (ninguno sale de la base de producción) que recorren los cuatro estados de cada pieza: el lleno, el recién dado de alta, el que no tiene coach, el cargando y el error. Las pantallas que cuelgan de cada pestaña (ciclo, sesión, detalle de carrera, ajustes) heredan este lenguaje cuando se construyan; aquí solo está la raíz de cada una.',
    ],
    grupos: TANDA_PESTANAS,
  },
  {
    id: 'analiticas',
    zona: 'Marcas y tests',
    titulo: 'Analíticas, rehechas',
    descripcion:
      'Una pestaña digna de TrainingPeaks: Estado, Forma y fatiga con proyección a la carrera, Semana a semana plan frente a hecho, Intensidad, Progreso por familia, Récords, Carrera y Recuperación — y el mismo contrato en la ficha del coach.',
    intro: [
      'Un cálculo, dos pintores (docs/analiticas/modelo.md): la portada del atleta en el iPhone y la pestaña Rendimiento del coach devuelven EXACTAMENTE lo mismo para el mismo atleta y ventana. Cada cifra dice de dónde sale (ancla), contra qué se lee (comparación) y sobre cuánto (cobertura). Toda sección obedece una sola ventana.',
      'Cada bloque resuelve sus cuatro estados —vacío, poco dato, lleno y dato viejo— con cinco atletas de ejemplo que no salen de la base de producción. Las variantes para el dueño (§11 del modelo) van marcadas como tales dentro de cada pantalla.',
    ],
    grupos: TANDA_ANALITICAS,
  },
  {
    id: 'entreno',
    zona: 'Entreno en vivo',
    titulo: 'El entreno, en vivo',
    descripcion:
      'La tanda inmersiva completa — antes / en vivo / al terminar / la muñeca — agrupada por su propia lógica en su dirección canónica.',
    intro: [
      'La regla que ordena el móvil: cada formato tiene una vista con sujeto propio según QUIÉN gobierna la transición (el reloj, el hito medido, el atleta, el suceso, el relevo). Girado con máquina delante sale la cara de monitor y el formato se queda en la franja.',
      'En la muñeca la regla es OTRA, y por eso hay nueve vistas más (30-jul). Ahí no decide el formato: deciden qué mide el reloj de verdad en esa modalidad —en cinta y en ergo no ve la máquina, en fuerza no ve ni la carga ni las reps— y si el atleta puede mirar y puede tocar en ese momento. Lo segundo manda sobre lo primero. Donde esta colección choque con propuestas más viejas del índice general, manda esta.',
    ],
    grupos: TANDA_ENTRENO,
  },
];

export function coleccionDe(id: Coleccion['id']): Coleccion {
  return COLECCIONES.find((c) => c.id === id)!;
}

export const ESTADO_LABEL: Record<TwinEstado, string> = {
  espejo: 'Espejo',
  propuesta: 'Propuesta',
  construida: 'Construida',
  pendiente: 'Pendiente',
};

/**
 * Pantallas que EXISTEN en la app y aún no tienen doble — el hueco reconocido.
 * (3-ago: «Tests guiados» salió de aquí — su doble es `tests-calibracion`.)
 */
export const PENDIENTES: TwinPendiente[] = [
  { titulo: 'Hoy', zona: 'Plan y hoy', descripcion: 'La portada diaria (InicioView: readiness, sesión del día, avisos) — sin doble.' },
  { titulo: 'Entreno libre (builder)', zona: 'Entreno en vivo', descripcion: 'FreeWorkoutBuilderView: modalidad → formato → configura — sin doble.' },
  { titulo: 'Onboarding día 1', zona: 'Perfil y ajustes', descripcion: 'OnboardingFlow + Day1Flow: alta, datos, dispositivos, permisos — sin doble.' },
];

/** Mockups históricos (pre-doble) — enlaces de consulta, congelados. */
export interface ArchivoItem {
  titulo: string;
  url?: string;
  nota?: string;
  fecha: string; // YYYY-MM-DD
}

export const ARCHIVO: ArchivoItem[] = [
  { titulo: 'Marcas — tu posición en el box', url: 'https://claude.ai/code/artifact/95578d56-164f-4f63-b784-bc95d7d7e56e', fecha: '2026-07-27', nota: 'Ya absorbido: pantalla «Ranking del box» (propuesta).' },
  { titulo: 'El Hoy: el fondo', url: 'https://claude.ai/code/artifact/b99f054a-91e9-4704-b6ea-5bc9a04a424d', fecha: '2026-07-27' },
  { titulo: 'Relojes — el entreno en la muñeca', url: 'https://claude.ai/code/artifact/37d6126f-d556-4115-8b3b-bf400ed0a32a', fecha: '2026-07-26' },
  { titulo: 'Las apps de reloj', url: 'https://claude.ai/code/artifact/962e666a-6668-4d04-8927-394b889fe605', fecha: '2026-07-26' },
  { titulo: 'Pantalla de conexiones', url: 'https://claude.ai/code/artifact/1e4f50fa-de18-405c-8e0d-801384a74d0f', fecha: '2026-07-26' },
  { titulo: 'Remo / erg — HUD horizontal', url: 'https://claude.ai/code/artifact/5ba73eea-ee45-4666-824b-a16ad49363ac', fecha: '2026-07-19' },
  { titulo: 'Control de cinta', url: 'https://claude.ai/code/artifact/c485282c-a13a-4745-b2c9-8cc5041501f3', fecha: '2026-07-19' },
  { titulo: 'Flujo de carrera — ¿dónde corres?', url: 'https://claude.ai/code/artifact/2c678acd-3d33-4058-ad09-00c3e6adb1d0', fecha: '2026-07-19' },
  { titulo: '3 pantallas de control del atleta', url: 'https://claude.ai/code/artifact/f406dad1-ea6b-42d9-844b-028533bac5c8', fecha: '2026-07-21' },
  { titulo: 'Tests guiados + benchmarks', url: 'https://claude.ai/code/artifact/a2c86419-5165-487a-a202-7d2b77cf0561', fecha: '2026-07-16' },
  { titulo: 'Biblioteca — 4 niveles', url: 'https://claude.ai/code/artifact/a1e3827c-d791-4c5d-80e5-73ae76ff7b3a', fecha: '2026-07-16' },
  { titulo: 'Nav móvil del dashboard', url: 'https://claude.ai/code/artifact/74587566-a943-4fdd-bcc3-8f5b5a0848c8', fecha: '2026-07-16' },
  { titulo: 'Dobles en vivo + historial', url: 'https://claude.ai/code/artifact/5b5fca80-ada3-435a-8275-11cc55244a0c', fecha: '2026-07-12' },
  { titulo: 'Wearables — estado y acciones de hoy', url: 'https://claude.ai/code/artifact/ea89aeaf-e237-4f57-9444-4ebdcef09827', fecha: '2026-07-14' },
  { titulo: 'Ola 2 running: post-entreno, outdoor, reloj', url: 'https://claude.ai/code/artifact/698ada95-95cd-4bdb-855d-4683fbc0c625', fecha: '2026-07-12' },
  { titulo: 'Mockups HTML del repo', nota: 'docs/design/*.html — quedan como histórico; lo nuevo entra aquí.', fecha: '2026-07-27' },
];
