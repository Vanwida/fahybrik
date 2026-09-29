// LOS CASOS DE «HOY» — catorce atletas de ejemplo que recorren todos los
// estados. NINGUNO sale de la base de producción (CONTRATO-UI §7; memoria «no
// hay atletas reales»): son personas inventadas para probar el modelo, y lo
// que las hace útiles es qué estado de cada pieza ejercitan.
//
// El orden es el de un día real, del caso lleno al mínimo (§6.3: «el caso
// mínimo es el caso de diseño»): el mínimo (⑨ alta) y el vacío total (⑩ libre)
// van a la vista, no escondidos al final.
//
// Cada pieza de la portada tiene sus cuatro estados cubiertos por al menos un
// caso — matriz al pie de este fichero. Si añades una pieza, añade su estado.

import {
  type CasoHoy,
  type LecturaHoy,
  type Senal,
  type SesionHoy,
} from './contrato';

const FECHA = 'Martes 29 sep';

/** Las cuatro señales, con lo que llegó y lo que no. */
function senales(activas: { checkin?: boolean; hrv?: string; sueno?: string; fc?: string }): Senal[] {
  return [
    { clave: 'checkin', etiqueta: 'Check-in', activa: !!activas.checkin },
    { clave: 'hrv', etiqueta: 'HRV', activa: !!activas.hrv, valor: activas.hrv },
    { clave: 'sueno', etiqueta: 'Sueño', activa: !!activas.sueno, valor: activas.sueno },
    { clave: 'fc-reposo', etiqueta: 'FC reposo', activa: !!activas.fc, valor: activas.fc },
  ];
}

const sesion = (
  titulo: string,
  modalidad: SesionHoy['modalidad'],
  estado: SesionHoy['estado'] = 'pendiente',
  extra: Partial<SesionHoy> = {},
): SesionHoy => ({ franja: null, titulo, modalidad, estado, libre: false, ...extra });

/** El atleta de partida: con coach, plan y carrera; se le pisa lo que cada caso ejercita. */
const BASE: LecturaHoy = {
  nombre: 'Nora',
  fecha: FECHA,
  hora: '7:40',
  conCoach: true,
  coach: 'Mar',
  iniciales: 'NR',
  noLeidosChat: 0,
  comunicados: 0,
  checkinPendiente: false,
  cargando: false,
  disposicion: {
    tipo: 'medida',
    score: 84,
    delta7d: 6,
    senales: senales({ checkin: true, hrv: '68 ms', sueno: '7,4 h', fc: '48 ppm' }),
  },
  camino: {
    tipo: 'fijada',
    carrera: {
      nombre: 'HYROX Barcelona',
      dias: 39,
      meta: 'Sub-65',
      fase: 'Construcción · semana 4 de 12',
      semana: { n: 4, m: 12 },
      fondo: 'sled-push',
    },
  },
  simulacion: { tipo: 'programada', dia: 'el sábado', hoy: false },
  hoy: { tipo: 'sesiones', sesiones: [sesion('Series 6×800', 'run')] },
  reclamos: [],
  marca: {
    titulo: '5 km · prueba',
    valor: '19:58',
    delta: { texto: '−1:02 desde la primera', mejora: true },
  },
  pasos: { tipo: 'cifra', valor: '3.204' },
};

const caso = (
  id: string,
  titulo: string,
  mira: string,
  pisa: Partial<LecturaHoy>,
): CasoHoy => ({ id, titulo, mira, lectura: { ...BASE, ...pisa } });

export const CASOS_HOY: CasoHoy[] = [
  caso(
    'listo',
    '① Nora · 7:40, todo en su sitio',
    'El caso LLENO: disposición alta con sus cuatro señales, la sesión de hoy pendiente, la carrera a 39 días con su fase y posición, una simulación programada, una marca reciente y los pasos. Mira qué es lo primero que se ve y si el resto se ordena por la pregunta con la que se abre la app.',
    {},
  ),
  caso(
    'manana',
    '② Iván · 6:55, check-in por hacer',
    'Hay número (lo dio el reloj) pero el check-in matinal sigue pendiente y su señal está apagada. La salida de un toque tiene que estar a la vista, sin taparse con el número. Se abre sola una vez al día en la app; aquí es la tarjeta que queda si la cerró.',
    {
      nombre: 'Iván',
      iniciales: 'IV',
      hora: '6:55',
      checkinPendiente: true,
      disposicion: {
        tipo: 'medida',
        score: 71,
        delta7d: 2,
        senales: senales({ hrv: '55 ms', sueno: '6,8 h', fc: '52 ppm' }),
      },
      hoy: { tipo: 'sesiones', sesiones: [sesion('Fuerza tren inferior', 'strength')] },
      pasos: { tipo: 'cifra', valor: '812' },
    },
  ),
  caso(
    'cargado',
    '③ Carla · cuerpo cargado, sesión por delante',
    'Disposición BAJA (38, −14 en 7 días): la portada dice el estado del cuerpo, jamás una prescripción (eso es método del coach). El color de la zona no puede parecer una alarma ni un aplauso; y la sesión de hoy sigue ahí, sin esconderse. Dos mensajes sin leer del coach.',
    {
      nombre: 'Carla',
      iniciales: 'CA',
      noLeidosChat: 2,
      disposicion: {
        tipo: 'medida',
        score: 38,
        delta7d: -14,
        senales: senales({ checkin: true, hrv: '41 ms', sueno: '5,1 h', fc: '57 ppm' }),
      },
      hoy: { tipo: 'sesiones', sesiones: [sesion('Fuerza tren inferior', 'strength')] },
      camino: {
        tipo: 'fijada',
        carrera: {
          nombre: 'HYROX Madrid',
          dias: 12,
          meta: 'Sub-75',
          fase: 'Puesta a punto · semana 11 de 12',
          semana: { n: 11, m: 12 },
          fondo: 'wall-balls',
        },
      },
      simulacion: { tipo: 'abierta' },
    },
  ),
  caso(
    'hecho',
    '④ Dídac · ya ha entrenado',
    'La sesión de hoy está HECHA: el bucle se cierra en la portada (círculo cerrado, memoria «nada huérfano»). Disposición media. El estado no relanza nada: tocar lleva al Plan, donde vive lo que registró.',
    {
      nombre: 'Dídac',
      iniciales: 'DI',
      hora: '19:20',
      disposicion: {
        tipo: 'medida',
        score: 58,
        delta7d: -3,
        senales: senales({ checkin: true, hrv: '49 ms', sueno: '7,0 h', fc: '51 ppm' }),
      },
      hoy: { tipo: 'sesiones', sesiones: [sesion('Rodaje suave 8 km', 'run', 'hecha')] },
      pasos: { tipo: 'cifra', valor: '11.480' },
    },
  ),
  caso(
    'doble',
    '⑤ Marina · dos sesiones, una hecha',
    'AM hecha y PM pendiente: el estado por sesión con su franja, sin que la segunda pase a ser un segundo héroe (decisión del 6-ago). Aquí aparece además la batería de tests del coach, con su contador.',
    {
      nombre: 'Marina',
      iniciales: 'MA',
      hora: '13:05',
      hoy: {
        tipo: 'sesiones',
        sesiones: [
          sesion('Remo 5×1000', 'ergo', 'hecha', { franja: 'AM' }),
          sesion('Fuerza tren superior', 'strength', 'pendiente', { franja: 'PM' }),
        ],
      },
      reclamos: [{ clave: 'tests', hechos: 1, total: 4 }],
      pasos: { tipo: 'cifra', valor: '6.930' },
    },
  ),
  caso(
    'descanso',
    '⑥ Biel · día de descanso',
    'El plan cargó y hoy no hay nada: no se fabrica una sesión. Se dice qué toca mañana. Disposición alta y sin nada que hacer con ella: el día de descanso tiene que sentirse como un día bueno, no como una pantalla vacía. Simulación abierta (la puerta honesta).',
    {
      nombre: 'Biel',
      iniciales: 'BI',
      disposicion: {
        tipo: 'medida',
        score: 91,
        delta7d: 8,
        senales: senales({ checkin: true, hrv: '74 ms', sueno: '8,1 h', fc: '46 ppm' }),
      },
      hoy: {
        tipo: 'descanso',
        manana: { titulo: 'Series 8×400', modalidad: 'run', dia: 'mañana' },
      },
      simulacion: { tipo: 'abierta' },
      pasos: { tipo: 'cifra', valor: '2.140' },
    },
  ),
  caso(
    'pausado',
    '⑦ Aina · plan en pausa',
    'El coach ha pausado su plan: una pausa tranquila, sin sesión vieja ni tests. Sigue la disposición, la carrera y los pasos. Tiene que quedar claro que no es un fallo.',
    {
      nombre: 'Aina',
      iniciales: 'AI',
      disposicion: {
        tipo: 'medida',
        score: 64,
        delta7d: 1,
        senales: senales({ checkin: true, hrv: '52 ms', sueno: '7,2 h', fc: '50 ppm' }),
      },
      hoy: { tipo: 'pausado' },
      simulacion: { tipo: 'abierta' },
    },
  ),
  caso(
    'sin-objetivo',
    '⑧ Pol · sin carrera fijada',
    'Plan cargado y ninguna carrera objetivo: el ancla se convierte en invitación («Elige tu carrera») con su salida (buscarla). La fase y la posición desaparecen: sin destino no hay camino que contar.',
    {
      nombre: 'Pol',
      iniciales: 'PO',
      camino: { tipo: 'sin-objetivo' },
      simulacion: { tipo: 'abierta' },
      hoy: { tipo: 'sesiones', sesiones: [sesion('Rodaje 45 min', 'run')] },
      marca: null,
      // Salud conectada y sin muestras de hoy: no es un cero medido, se dice.
      pasos: { tipo: 'sin-datos' },
    },
  ),
  caso(
    'alta',
    '⑨ Lía · recién dada de alta (con coach)',
    'EL CASO MÍNIMO (§6.3): sin número de disposición ni carrera ni marca ni pasos, sin nada publicado en el plan, con un check-in por hacer, la batería de tests en 0 de 4 (un contador se pinta en cero) y el primer comunicado del coach. Cada hueco lleva su salida; ninguno es gris sin acto. Es lo que ve todo el mundo el primer día.',
    {
      nombre: 'Lía',
      iniciales: 'LI',
      hora: '9:10',
      checkinPendiente: true,
      comunicados: 1,
      noLeidosChat: 1,
      disposicion: { tipo: 'sin-datos', motivo: 'checkin-pendiente' },
      camino: { tipo: 'sin-objetivo' },
      simulacion: { tipo: 'abierta' },
      hoy: { tipo: 'descanso', manana: null },
      reclamos: [{ clave: 'tests', hechos: 0, total: 4 }],
      marca: null,
      pasos: { tipo: 'conectar' },
    },
  ),
  caso(
    'libre',
    '⑩ Marc · sin coach',
    'EL TIER LIBRE: no hay plan, ni chat, ni «Del coach», ni carrera de plan, ni revisión, ni tests. NINGUNA pieza de coach se pinta, ni vacía ni con «tu entrenador…». El sujeto natural es montar el entreno de hoy. La disposición, los pasos y la marca siguen.',
    {
      nombre: 'Marc',
      iniciales: 'MC',
      conCoach: false,
      coach: null,
      camino: null,
      simulacion: null,
      hoy: null,
      disposicion: {
        tipo: 'medida',
        score: 79,
        delta7d: 4,
        senales: senales({ checkin: true, hrv: '61 ms', sueno: '7,6 h', fc: '49 ppm' }),
      },
      pasos: { tipo: 'cifra', valor: '5.320' },
    },
  ),
  caso(
    'a-medias',
    '⑪ Nora · dejó un entreno a medias',
    'Guardó «Series 6×800» para luego a las 8:12 (pausado, en disco). Retomarlo es lo que reclama, y no compite con la sesión de hoy: es LA MISMA sesión, empezada. (El entreno minimizado en marcha NO sale aquí: lo lleva la barra del sistema sobre las pestañas.)',
    {
      reclamos: [{ clave: 'a-medias', titulo: 'Series 6×800', desde: '8:12' }],
      hora: '9:30',
    },
  ),
  caso(
    'avisos',
    '⑫ Nora · todo reclama a la vez',
    'El peor caso de densidad: mensajes sin leer, dos comunicados, una batería de tests a medias, una revisión propuesta, su pareja entrenando ahora y la sesión de hoy. Qué se pliega y en qué orden decide la portada, pero la sesión y la disposición no se pierden.',
    {
      noLeidosChat: 3,
      comunicados: 2,
      reclamos: [
        { clave: 'pareja-en-vivo', nombre: 'Biel' },
        { clave: 'revision', estado: 'propuesta', cuando: 'el jueves, 18:30' },
        { clave: 'tests', hechos: 1, total: 4 },
      ],
    },
  ),
  caso(
    'cargando',
    '⑬ Arranque en frío (todavía sin datos)',
    'Primera carga sin caché. Cada pieza es un esqueleto con la MISMA forma que tendrá: ni un vacío ni una invitación (aún no sabemos cuál de las dos toca). Nada salta de sitio cuando llegan los datos.',
    { cargando: true },
  ),
  caso(
    'error',
    '⑭ Primer arranque sin red',
    'Instalación nueva cuyo primer plan no cargó y sin caché: el ancla no puede quedarse girando para siempre. Error con su salida («Reintentar»). Sigue lo que no depende del plan (disposición, pasos).',
    {
      nombre: 'Nora',
      hoy: { tipo: 'error-carga' },
      camino: null,
      simulacion: null,
      marca: null,
    },
  ),
];

export function casoHoy(id: string): CasoHoy {
  const c = CASOS_HOY.find((x) => x.id === id);
  if (!c) throw new Error(`Caso de Hoy desconocido: ${id}`);
  return c;
}

// ── MATRIZ: cada pieza, sus cuatro estados ───────────────────────────────────
//  Disposición   con datos ①②③   · sin datos ⑨(check-in) · cargando ⑬ · (error: cae a sin datos ⑭)
//  Camino        fijada ①③      · sin objetivo ⑧⑨          · n/a ⑩     · cargando ⑬ · error ⑭
//  Hoy           sesiones ①⑤    · descanso ⑥⑨ · pausado ⑦  · n/a ⑩     · cargando ⑬ · error ⑭
//  Reclamos      ninguno ①      · uno ⑤⑪                   · varios ⑫
//  Marca         una ①          · sin marca ⑧⑨
//  Pasos         cifra ①        · conectar ⑨               · sin datos ⑧
