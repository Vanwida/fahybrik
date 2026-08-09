'use client';

// El inventario del doble — la única lista de pantallas.
//
// Cada entrada es un módulo bajo ./screens/<id>/ que exporta { meta,
// escenarios, Screen }. El sello `estado` es el contrato de sinceridad del
// doble: «espejo» = réplica de Swift shipeado (con sus fuentes), «propuesta» =
// mockup de lo aún no construido, y PENDIENTES enumera los huecos para que el
// desfase se VEA en el índice en vez de sospecharse.

import type { TwinEstado, TwinPendiente, TwinScreenModule } from './types';

import * as benchmarkErg from './screens/benchmark-erg';
import * as runLive from './screens/run-live';
import * as devices from './screens/devices';
import * as watchLive from './screens/watch-live';
import * as marks from './screens/marks';
import * as rankingBox from './screens/ranking-box';
import * as perfilRendimiento from './screens/perfil-rendimiento';
import * as testsCalibracion from './screens/tests-calibracion';
import * as testComparativa from './screens/test-comparativa';
import * as chatCoach from './screens/chat-coach';
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
import * as resumenCarrera from './screens/resumen-carrera';
import * as watchResumen from './screens/watch-resumen';
import * as planCiclo from './screens/plan-ciclo';
import * as planSemana from './screens/plan-semana';
import * as planDia from './screens/plan-dia';
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
  chatCoach,
  analiticasVeredicto,
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
  // Al terminar de correr (29-jul): un fartlek no tiene un ritmo, tiene dos, y
  // promediarlos da un número que no describe ningún momento de la carrera.
  // El sujeto lo decide la FORMA de lo que corriste (`tramos.ts`), no el
  // formato de la pantalla. Móvil y muñeca leen el MISMO dato.
  resumenCarrera,
  watchResumen,
  // El plan a tres distancias (29-jul): tres preguntas sobre el MISMO objeto —
  // hacia dónde voy (ciclo), qué me toca y qué llevo (semana), qué hay hoy y
  // con qué dosis (día). Comparten modelo, escenarios y vocabulario visual en
  // `plan/`, y van de lejos a cerca, que es como se navegan.
  planCiclo,
  planSemana,
  planDia,
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
];

export function getScreen(id: string): TwinScreenModule | undefined {
  return SCREENS.find((s) => s.meta.id === id);
}

/**
 * La tanda inmersiva del entreno (29-jul) con dirección PROPIA:
 * `/design/entreno`. Existe porque el índice general mezcla épocas y
 * propuestas que se solapan; esta colección es la dirección canónica del
 * entreno en vivo y se enseña sola, agrupada por su propia lógica.
 */
export const TANDA_ENTRENO: ReadonlyArray<{ grupo: string; ids: string[] }> = [
  { grupo: 'Antes de entrenar', ids: ['plan-bloque', 'sesion-previa'] },
  {
    grupo: 'En vivo, por quién gobierna',
    ids: ['vivo-correr', 'vivo-erg', 'vivo-fuerza', 'vivo-emom', 'vivo-fortime', 'vivo-amrap', 'vivo-dobles'],
  },
  { grupo: 'Al terminar', ids: ['resumen-carrera'] },
  { grupo: 'La muñeca', ids: ['watch-vivo', 'watch-resumen'] },
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
