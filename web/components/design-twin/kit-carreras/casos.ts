// LOS CASOS DE «CARRERAS» — veinte atletas de ejemplo que recorren todos los
// estados. NINGUNO sale de la base de producción (CONTRATO-UI §7; memoria «no
// hay atletas reales»): son personas y carreras inventadas para romper el
// modelo, y lo que las hace útiles es qué estado de cada pieza ejercitan.
//
// El orden es el de una temporada, del caso lleno al mínimo (§6.3: «el caso
// mínimo es el caso de diseño»): el mínimo con objetivo (②), el que solo tiene
// historial (③) y el vacío total (④) van a la vista, no escondidos al final.
//
// Cada pieza de la pestaña tiene sus cuatro estados cubiertos por al menos un
// caso — matriz al pie de este fichero. Si añades una pieza, añade su estado.

import type { CasoCarreras, LecturaCarreras } from './contrato';
import {
  ANALISIS_VALENCIA,
  analisisSoloTiempos,
  DOBLES_2025_MAD,
  DOBLES_2026_GIR,
  ESTACIONES_VALENCIA,
  HOY,
  INDIVIDUAL_2024_BCN,
  INDIVIDUAL_2025_BCN,
  INDIVIDUAL_2025_MAD,
  INDIVIDUAL_2026_VLC,
  INDIVIDUAL_SIN_VUELTAS,
  RELEVO_2025_VLC,
  en,
  pasada,
  proxima,
} from './datos';

/** El atleta de partida: con coach, cargado y sin nada; cada caso pisa lo que ejercita. */
const BASE: LecturaCarreras = {
  hoy: HOY,
  conCoach: true,
  noLeidosChat: 0,
  carga: { hub: 'lista', analisis: 'lista' },
  proximas: [],
  pasadas: [],
  prediccion: { tipo: 'no-aplica' },
  analisis: null,
};

const caso = (id: string, titulo: string, mira: string, pisa: Partial<LecturaCarreras>, abre?: CasoCarreras['abre'], extra: Partial<CasoCarreras> = {}): CasoCarreras => ({
  id,
  titulo,
  mira,
  lectura: { ...BASE, ...pisa },
  abre,
  ...extra,
});

/** Las cinco formas que puede tener una fila de estación, y una sin dato que desaparece. */
const ESTACIONES_VARIADAS = [
  ESTACIONES_VALENCIA[0],
  { ...ESTACIONES_VALENCIA[1], deltaS: null },
  { ...ESTACIONES_VALENCIA[2], fraccion: null, severidad: null },
  { ...ESTACIONES_VALENCIA[3], fraccion: null, severidad: null, deltaS: null },
  { ...ESTACIONES_VALENCIA[4], tiempoS: null, deltaS: null, fraccion: null, severidad: null },
  ESTACIONES_VALENCIA[5],
  ESTACIONES_VALENCIA[6],
  ESTACIONES_VALENCIA[7],
];

const HISTORIAL_INDIVIDUAL = [INDIVIDUAL_2026_VLC, INDIVIDUAL_2025_BCN, INDIVIDUAL_2025_MAD, INDIVIDUAL_2024_BCN];
const HISTORIAL_MIXTO = [INDIVIDUAL_2026_VLC, DOBLES_2026_GIR, INDIVIDUAL_2025_BCN, INDIVIDUAL_2025_MAD, INDIVIDUAL_2024_BCN];

export const CASOS_CARRERAS: CasoCarreras[] = [
  caso(
    'lleno',
    '① Objetivo a 39 días, con todo',
    'El caso LLENO: el objetivo principal a 39 días es el sujeto (foto, cuenta atrás enorme, meta y predicho completo con su hueco), una carrera de puesta a punto a 12 días debajo, y el historial con el análisis de la última individual. Mira qué es lo primero que se ve, que el predicho no lleve color en la cifra, y que dobles e individuales convivan en el historial.',
    {
      noLeidosChat: 1,
      proximas: [
        proxima(201, 'HYROX Barcelona', 39, { lugar: 'Fira de Barcelona', metaS: 3900 }),
        proxima(202, 'HYROX Madrid', 12, { prioridad: 'tune_up', lugar: 'IFEMA Madrid', metaS: 4080 }),
      ],
      pasadas: HISTORIAL_MIXTO,
      prediccion: { tipo: 'cifra', totalS: 3790, huecoS: -110 },
      analisis: ANALISIS_VALENCIA,
    },
  ),
  caso(
    'solo-objetivo',
    '② Solo un objetivo, sin historial',
    'EL CASO MÍNIMO CON OBJETIVO (§6.3): una carrera fijada y nada más. El predicho no puede dar cifra y lo dice («aún sin datos» y por qué se llena solo); «Próximas» ofrece otra carrera diciendo lo que pasa al fijarla; «Pasadas» es una invitación con su salida (importar el historial). Ningún hueco es gris sin acto.',
    {
      proximas: [proxima(211, 'HYROX Barcelona', 39, { lugar: 'Fira de Barcelona', metaS: 4200 })],
      prediccion: { tipo: 'sin-datos' },
    },
  ),
  caso(
    'solo-historial',
    '③ Solo historial, sin objetivos',
    'Sin nada por delante el sujeto pasa a ser tu última carrera (con su tiempo enorme, el parcial y el puesto) y su salida es fijar la siguiente. Debajo, el análisis de esa carrera y el historial. «Próximas» no repite el vacío: el sujeto ya invita.',
    { pasadas: HISTORIAL_INDIVIDUAL, analisis: ANALISIS_VALENCIA },
  ),
  caso(
    'vacio',
    '④ Recién dada de alta, sin nada',
    'EL VACÍO TOTAL (§6.3): ni carreras por delante ni por detrás. El sujeto es la invitación, con sus DOS salidas (buscar carrera, importar historial) y lo que da cada una. Sin cola muerta: la foto crece hasta llenar el alto.',
    {},
  ),
  caso(
    'dobles',
    '⑤ Solo dobles y relevos',
    'Historial solo de equipo: cada tiempo es DEL EQUIPO y se dice (chip, «con Aina» y aviso al abrir los parciales); no hay análisis por estación ni gráfica (eso sale de individuales) y la pestaña lo explica en una frase. El objetivo es de dobles con su predicho conjunto y su pareja.',
    {
      proximas: [
        proxima(231, 'HYROX Barcelona', 26, { formato: 'doubles', categoria: 'mixed', lugar: 'Fira de Barcelona', metaS: 3660 }),
      ],
      pasadas: [DOBLES_2026_GIR, DOBLES_2025_MAD, RELEVO_2025_VLC],
      prediccion: { tipo: 'cifra', totalS: 3702, huecoS: 42, pareja: 'Aina' },
    },
  ),
  caso(
    'parcial',
    '⑥ Predicho parcial (faltan estaciones)',
    'Hay 8 tramos medidos de 10 y faltan dos (la carrera a pie y la RoxZone, que su única carrera no trajo): la previsión NO inventa un tiempo. Sin cifra, con la regleta de tramos y los que faltan por su nombre. El análisis viene de esa carrera sin vueltas ni puestos: las estaciones van sin barra y la sección lo dice.',
    {
      proximas: [proxima(241, 'HYROX Girona', 26, { lugar: 'Fira de Girona', metaS: 4200 })],
      pasadas: [INDIVIDUAL_SIN_VUELTAS],
      prediccion: { tipo: 'parcial', medidos: 8, de: 10, faltan: ['Carrera · 8 km', 'RoxZone'] },
      analisis: analisisSoloTiempos(INDIVIDUAL_SIN_VUELTAS),
    },
  ),
  caso(
    'dia-de-carrera',
    '⑦ Hoy es la carrera',
    'Cuenta atrás a cero: la cifra de «39 días» pasa a la palabra «Hoy» y el kicker a «Día de carrera». El predicho ya está congelado (se fija justo antes de la prueba) y sigue leyéndose. Nada que hacer sino correr: el sujeto lo celebra, no pide.',
    {
      proximas: [proxima(251, 'HYROX Barcelona', 0, { lugar: 'Fira de Barcelona', metaS: 3900 })],
      pasadas: [INDIVIDUAL_2026_VLC, INDIVIDUAL_2025_BCN, INDIVIDUAL_2025_MAD],
      prediccion: { tipo: 'cifra', totalS: 3790, huecoS: -110 },
      analisis: ANALISIS_VALENCIA,
    },
  ),
  caso(
    'ayer',
    '⑧ Corriste ayer, falta tu resultado',
    'El momento manda: una carrera de ayer sin resultado importado es LO PRIMERO (lo único que se puede hacer con ella), por delante del objetivo, que pasa a la primera fila de «Próximas». La salida es importar. Cuando el resultado llega, el sujeto vuelve al objetivo.',
    {
      proximas: [proxima(261, 'HYROX Barcelona', 39, { lugar: 'Fira de Barcelona', metaS: 3900 })],
      pasadas: [pasada(262, 'HYROX Madrid', en(-1), null), INDIVIDUAL_2026_VLC, INDIVIDUAL_2025_BCN, INDIVIDUAL_2025_MAD],
      prediccion: { tipo: 'cifra', totalS: 3790, huecoS: -110 },
      analisis: ANALISIS_VALENCIA,
    },
  ),
  caso(
    'varios',
    '⑨ Muchos objetivos, dos el mismo día',
    'El denso: un principal con nombre largo y seis más (una de puesta a punto, dos el MISMO día que el principal, una DEKA, una carrera a pie que no es HYROX, otra sin fecha confirmada). Mira el orden (por día, el principal primero en empate, sin fecha al final), el pliegue «Ver 3 más» y que la de a pie no lleve individual/open/hombres inventado.',
    {
      proximas: [
        proxima(271, 'HYROX Barcelona · Campeonato de España', 39, { division: 'elite', categoria: 'women', lugar: 'Fira de Barcelona', metaS: 3660 }),
        proxima(272, 'HYROX Barcelona', 39, { prioridad: 'secondary', formato: 'doubles', categoria: 'mixed', lugar: 'Fira de Barcelona', metaS: 3780 }),
        proxima(273, 'HYROX Madrid', 12, { prioridad: 'tune_up', lugar: 'IFEMA Madrid', metaS: 3960 }),
        proxima(274, 'DEKA Mile Sevilla', 96, { prioridad: 'secondary', tipoEvento: 'deka', lugar: 'Sevilla' }),
        proxima(275, 'HYROX Valencia', null, { prioridad: 'secondary', lugar: 'Valencia' }),
        proxima(276, 'Mitja Marató de Barcelona', 141, { prioridad: 'secondary', tipoEvento: 'other', lugar: 'Barcelona', metaS: 5940 }),
        proxima(277, 'HYROX Lisboa', 124, { prioridad: 'secondary', division: 'pro', lugar: 'Lisboa' }),
      ],
      pasadas: [INDIVIDUAL_2026_VLC, INDIVIDUAL_2025_BCN],
      prediccion: { tipo: 'cifra', totalS: 3702, huecoS: 42 },
      analisis: ANALISIS_VALENCIA,
    },
  ),
  caso(
    'sin-coach',
    '⑩ Sin coach (tier libre)',
    'Sin coach no hay chat en la cabecera ni «Preguntar al coach» en el menú de la carrera, y nada dice «tu entrenador». Todo lo demás es del atleta y se queda: objetivo, historial, análisis. Aquí además NO ha fijado tiempo: el hueco se declara con su salida («Fijar tiempo objetivo»).',
    {
      conCoach: false,
      proximas: [
        proxima(281, 'HYROX Barcelona', 39, { lugar: 'Fira de Barcelona' }),
        proxima(282, 'HYROX Madrid', 12, { prioridad: 'tune_up', lugar: 'IFEMA Madrid' }),
      ],
      pasadas: [INDIVIDUAL_2026_VLC, INDIVIDUAL_2025_BCN, INDIVIDUAL_2025_MAD],
      prediccion: { tipo: 'sin-meta' },
      analisis: ANALISIS_VALENCIA,
    },
  ),
  caso(
    'cargando',
    '⑪ Arranque en frío',
    'Primera carga sin caché. Cada pieza es un esqueleto con la MISMA forma que tendrá (sujeto, próximas, pasadas): ni un vacío ni una invitación, porque aún no sabemos cuál de las dos toca. Nada salta de sitio cuando llegan los datos.',
    { carga: { hub: 'fria', analisis: 'fria' } },
  ),
  caso(
    'error',
    '⑫ Primer arranque sin red',
    'La carga falló y no hay caché. Hoy la pestaña lo pinta como «Sin objetivos todavía» (un fallo que parece un vacío); aquí es un error dicho, con su salida («Reintentar»), que además ejecuta: vuelve a cargar y entra el caso lleno.',
    { carga: { hub: 'error', analisis: 'error' } },
  ),
  caso(
    'importando',
    '⑬ Importación en curso',
    'La hoja «Importar carrera» a mitad de camino: perfil elegido, «Importando…» sin poder repetir el toque. A los 4 segundos termina, la hoja se cierra y el historial entra de golpe, con su análisis y sin saltos. El resto de la pantalla espera detrás.',
    {},
    'importando',
  ),
  caso(
    'no-soy-yo',
    '⑭ «No soy yo»: confirmar el borrado',
    'El historial importado era de otra persona. Tocar «¿No eres tú?» abre la confirmación que dice qué se borra y que se podrá buscar de nuevo. Confirmar borra todo lo importado, la pantalla vuelve a la invitación y la búsqueda se reabre con el campo limpio.',
    { pasadas: HISTORIAL_INDIVIDUAL, analisis: ANALISIS_VALENCIA },
    'no-soy-yo',
  ),
  caso(
    'sin-pareja',
    '⑮ Dobles sin pareja conectada',
    'El objetivo es de dobles y su pareja no está conectada: el predicho conjunto no se puede calcular y la pantalla lo dice con su salida («Conecta a tu pareja»), en vez de un número de uno solo. Ha corrido dobles y relevos, y el historial lo muestra igual.',
    {
      proximas: [
        proxima(291, 'HYROX Madrid', 12, { formato: 'doubles', categoria: 'mixed', lugar: 'IFEMA Madrid', metaS: 3720 }),
      ],
      pasadas: [DOBLES_2025_MAD, RELEVO_2025_VLC],
      prediccion: { tipo: 'sin-pareja' },
    },
  ),
  caso(
    'informe',
    '⑯ Informe de la IA y filas de estación variadas',
    'Todo lo que puede llevar el análisis: el informe «a priorizar» (hoy el servidor lo manda vacío, pero la pestaña lo pinta si llega) y las formas de una fila de estación: con barra y delta, sin delta (sin entreno con el que comparar), sin barra (sin puesto), solo el tiempo, y una sin tiempo que desaparece (son siete filas, no ocho). Predicho con una sola estación por medir.',
    {
      proximas: [proxima(301, 'HYROX Barcelona', 39, { lugar: 'Fira de Barcelona', metaS: 3900 })],
      pasadas: HISTORIAL_INDIVIDUAL,
      prediccion: { tipo: 'parcial', medidos: 9, de: 10, faltan: ['Wall ball'] },
      analisis: {
        ...ANALISIS_VALENCIA,
        estaciones: ESTACIONES_VARIADAS,
        informe: {
          resumen:
            'Pierdes tiempo en el sled pull y en los wall balls con el cuerpo ya cargado. Trabaja empuje y tirón con carga y llega a los km finales con mejor ritmo.',
          grupos: ['G03 · Ergómetros', 'G09 · Circuitos f-r'],
        },
        predichoVsReal: null,
      },
    },
  ),
  caso(
    'llegando',
    '⑰ El análisis todavía llega',
    'El hub ya cargó y el análisis y el predicho siguen en camino: el historial y las próximas se ven y los bloques que faltan son esqueletos con su forma final, no un hueco que luego se llena de golpe.',
    {
      carga: { hub: 'lista', analisis: 'fria' },
      proximas: [proxima(311, 'HYROX Barcelona', 39, { lugar: 'Fira de Barcelona', metaS: 3900 })],
      pasadas: HISTORIAL_INDIVIDUAL,
      prediccion: { tipo: 'cargando' },
    },
  ),
  caso(
    'fallos',
    '⑱ El predicho y el análisis fallaron',
    'Lo principal cargó, dos lecturas secundarias no. Cada fallo es local y dicho con su salida («Reintentar»); ninguno tumba la pantalla ni se hace pasar por un vacío. Prueba los dos botones: vuelven a pedir su pieza. Y aquí las ACCIONES también fallan: elimina o promueve una carrera, o intenta fijar una nueva, y verás su aviso de error sin que cambie nada.',
    {
      carga: { hub: 'lista', analisis: 'error' },
      proximas: [proxima(321, 'HYROX Barcelona', 39, { lugar: 'Fira de Barcelona', metaS: 3900 })],
      pasadas: HISTORIAL_INDIVIDUAL,
      prediccion: { tipo: 'error' },
    },
    undefined,
    { fallaAcciones: true },
  ),
  caso(
    'sin-principal',
    '⑲ Sin objetivo principal',
    'Quitó el principal y le quedan dos carreras (puesta a punto y secundaria). El sujeto es la más próxima, con su rol dicho, y su acción es la salida: «Hacer objetivo principal». El predicho se calcula solo para el principal y aquí no se inventa.',
    {
      proximas: [
        proxima(331, 'HYROX Madrid', 12, { prioridad: 'tune_up', lugar: 'IFEMA Madrid', metaS: 4080 }),
        proxima(332, 'HYROX Girona', 71, { prioridad: 'secondary', lugar: 'Fira de Girona' }),
      ],
      pasadas: HISTORIAL_INDIVIDUAL,
      analisis: ANALISIS_VALENCIA,
    },
  ),
  caso(
    'no-hyrox',
    '⑳ Objetivo que no es HYROX',
    'Una media maratón como objetivo: solo hay fecha, meta y lugar, sin predicho tramo a tramo (eso es solo de HYROX) y sin «Individual · Open · Hombres», que el servidor rellena por defecto en las que no lo son. La acción es cambiar el tiempo objetivo.',
    {
      proximas: [proxima(341, 'Mitja Marató de Barcelona', 141, { tipoEvento: 'other', lugar: 'Barcelona', metaS: 5940 })],
    },
  ),
];

export function casoCarreras(id: string): CasoCarreras {
  const c = CASOS_CARRERAS.find((x) => x.id === id);
  if (!c) throw new Error(`Caso de Carreras desconocido: ${id}`);
  return c;
}

// ── MATRIZ: cada pieza, sus cuatro estados ───────────────────────────────────
//  Sujeto          objetivo ①⑦⑨  · postcarrera ⑧ · última ③   · vacío ④ (dos salidas)  · cargando ⑪ · error ⑫
//  Predicho        cifra ①⑤     · parcial ⑥⑯ · sin datos ②⑮ · sin meta ⑩ (salida)      · cargando ⑰ · error ⑱
//                  no aplica ⑲⑳ (sin principal, no HYROX) · sin pareja ⑮ (salida: conectarla)
//  Próximas        una ② · varias ①⑧ · muchas y plegadas ⑨ · vacío con salida ③④⑫(error)⑭ · cargando ⑪
//  Pasadas         historial ①③ · solo de equipo ⑤ · pendiente ⑧ · vacío con salida ②⑳ · cargando ⑪ · error ⑫
//  Análisis        completo ①③ · sin puestos ni vueltas ⑥ · variantes ⑯ · no hay (solo equipo) ⑤⑮ · cargando ⑰ · error ⑱
//  Evolución       con 3 o 4 carreras ①③ · con menos de 2: se calla ⑥ (una carrera)
//  Hojas           importar ⑬⑭ · buscar y fijar (desde ④②) · confirmar ⑭ · acciones (⋯ en cualquier carrera)
//  Sin coach       ⑩ (sin chat, sin «Preguntar al coach», sin informe de la IA del método)
