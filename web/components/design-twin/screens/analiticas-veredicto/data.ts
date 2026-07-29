// Analíticas — las cinco secciones que sirve hoy el backend (Carrera · Ergo ·
// Fuerza · HYROX · Recuperación) con datos de producción del 28-jul-2026.
//
// El escenario del atleta 64 es interesante justo porque tres de sus cinco
// secciones NO pueden emitir veredicto, y cada una por una razón distinta y
// escrita en docs/DECISIONS.md:
//
//  · Carrera → sus 6 HYROX son de DOBLES. Correr en dobles es un SUELO, no una
//    medida, y «no se emite tendencia de correr sobre carreras de equipo, ni con
//    veinte carreras» (27-jul noche). Sin 5K de control, no hay nada que juzgar.
//  · Ergo → cero marcas de remo o ski en `athlete_benchmarks`.
//  · Fuerza → dos levantamientos de tres, y uno con dos únicas tomas. Hay
//    cifras, no hay tendencia: se enseñan los números y se calla el juicio.
//
// Y la que sí puede, HYROX, lo hace con el límite declarado: las estaciones no
// se le atribuyen porque en dobles se reparten entre los dos.

import type { Modalidad } from '../../kit-composicion/chrome';

export type SeccionId = 'carrera' | 'ergo' | 'fuerza' | 'hyrox' | 'recuperacion';

export interface Veredicto {
  /** La cifra que se lee a tres metros. */
  cifra: string;
  unidad?: string;
  /** Qué es esa cifra, en una línea. */
  etiqueta: string;
  /** El juicio, cuando la cobertura da para emitirlo. */
  juicio?: { texto: string; tono: 'ok' | 'aviso' | 'neutro' };
  /** El hueco declarado: qué parte del periodo no sabemos. */
  cobertura?: string;
}

export interface Tarjeta {
  titulo: string;
  valor: string;
  unidad?: string;
  pie?: string;
  /** Sello de procedencia cuando el número no es una medida limpia. */
  marca?: string;
}

export interface Seccion {
  id: SeccionId;
  label: string;
  modalidad: Modalidad;
  veredicto: Veredicto | null;
  tarjetas: Tarjeta[];
  /** Obligatorio cuando no hay veredicto NI tarjetas: por qué, y la salida. */
  vacio?: { porque: string; salida: string };
  /**
   * Cierre de una sección que tiene cifras pero no llega a llenar la pantalla.
   * El hueco de un Detalle se gana con lo que da sentido al dato (§6.2), y aquí
   * lo que le da sentido es lo que falta para poder juzgarlo. Nunca es aire.
   */
  completar?: { texto: string; accion: string };
}

export interface EstadoAnaliticas {
  id: string;
  periodo: string;
  periodos: string[];
  secciones: Seccion[];
}

const ORDEN: { id: SeccionId; label: string; modalidad: Modalidad }[] = [
  { id: 'carrera', label: 'Carrera', modalidad: 'run' },
  { id: 'ergo', label: 'Ergo', modalidad: 'ergo' },
  { id: 'fuerza', label: 'Fuerza', modalidad: 'strength' },
  { id: 'hyrox', label: 'HYROX', modalidad: 'hyrox' },
  { id: 'recuperacion', label: 'Recuperación', modalidad: 'support' },
];

function seccion(id: SeccionId, cuerpo: Omit<Seccion, 'id' | 'label' | 'modalidad'>): Seccion {
  const base = ORDEN.find((s) => s.id === id);
  if (!base) throw new Error(`sección desconocida: ${id}`);
  return { ...base, ...cuerpo };
}

// ---------------------------------------------------------------------------
// Recién dado de alta — las cinco vacías, cada una con su porqué
// ---------------------------------------------------------------------------

export const NUEVO: EstadoAnaliticas = {
  id: 'nuevo',
  periodo: 'Mes',
  periodos: ['7 días', 'Mes', 'Año'],
  secciones: ORDEN.map((s) =>
    seccion(s.id, {
      veredicto: null,
      tarjetas: [],
      vacio:
        s.id === 'recuperacion'
          ? { porque: 'Sin reloj conectado no hay sueño, pulso en reposo ni variabilidad que analizar.', salida: 'Conectar mi reloj' }
          : { porque: 'Todavía no has hecho ninguna sesión ni ningún test de esta modalidad.', salida: 'Ver mis tests' },
    }),
  ),
};

// ---------------------------------------------------------------------------
// Atleta 64 — lo que de verdad se puede decir hoy
// ---------------------------------------------------------------------------

export const ALEX: EstadoAnaliticas = {
  id: 'alex',
  periodo: 'Mes',
  periodos: ['7 días', 'Mes', 'Año'],
  secciones: [
    seccion('carrera', {
      veredicto: null,
      tarjetas: [],
      vacio: {
        porque:
          'Tus seis HYROX son de dobles: ahí corréis juntos, así que tu ritmo es un suelo de la pareja, no una medida tuya. No hay tendencia que sacar de eso.',
        salida: 'Probarme el 5K de control',
      },
    }),
    seccion('ergo', {
      veredicto: null,
      tarjetas: [],
      vacio: { porque: 'Aún no tienes ninguna marca de remo ni de ski.', salida: 'Probarme el Remo 2K' },
    }),
    seccion('fuerza', {
      // Hay cifras pero no hay juicio: dos levantamientos de tres, y dos tomas.
      veredicto: {
        cifra: '2',
        unidad: 'de 3',
        etiqueta: 'levantamientos medidos',
        cobertura: 'Sin press banca y con dos tomas, todavía no hay tendencia que juzgar.',
      },
      tarjetas: [
        { titulo: 'Sentadilla', valor: '186,7', unidad: 'kg', pie: 'ayer · 10 reps a 140 kg', marca: 'Estimado (Epley)' },
        { titulo: 'Peso muerto', valor: '245', unidad: 'kg', pie: 'hace 2 días · levantada real' },
      ],
      completar: {
        texto:
          'Con el press banca tendrás los tres grandes, y a partir de la segunda toma de cada uno esto empieza a tener curva.',
        accion: 'Completar la batería 1RM',
      },
    }),
    seccion('hyrox', {
      veredicto: {
        cifra: '1:02:02',
        etiqueta: 'tu mejor HYROX · Berlín, en dobles',
        juicio: { texto: '6 carreras · puesto 152 el mejor', tono: 'neutro' },
        cobertura: 'Las estaciones no se te atribuyen: en dobles os las repartís y no sabemos cuáles hiciste tú.',
      },
      tarjetas: [
        { titulo: 'Correr, 8 km', valor: '32:39', pie: '4:05/km · Berlín', marca: 'Suelo de la pareja' },
        { titulo: 'Mejor vuelta', valor: '3:20', pie: 'Berlín', marca: 'Suelo de la pareja' },
        { titulo: 'Roxzone', valor: '6:52', pie: 'Berlín · lo mejor de las seis' },
        { titulo: 'Última carrera', valor: '1:05:53', pie: 'Barcelona, mayo · pro dobles' },
      ],
    }),
    seccion('recuperacion', {
      veredicto: {
        cifra: '88',
        etiqueta: 'tu recuperación de hoy',
        juicio: { texto: 'Listo para apretar', tono: 'ok' },
      },
      tarjetas: [
        { titulo: 'Variabilidad', valor: '48,7', unidad: 'ms', pie: 'hoy · tu línea base son 40,9' },
        { titulo: 'FC en reposo', valor: '52', unidad: 'ppm', pie: 'ayer · hoy aún no ha llegado' },
        { titulo: 'Sueño', valor: '8:11', pie: 'anoche · tu objetivo son 8:00' },
        { titulo: 'VO₂ máx', valor: '42,4', unidad: 'ml/kg/min', pie: 'hoy · +1,0 en 30 días' },
      ],
    }),
  ],
};

// ---------------------------------------------------------------------------
// Un año dentro — las cinco con veredicto
// ---------------------------------------------------------------------------

export const VETERANO: EstadoAnaliticas = {
  id: 'veterano',
  periodo: 'Mes',
  periodos: ['7 días', 'Mes', 'Año'],
  secciones: [
    seccion('carrera', {
      veredicto: {
        cifra: '4:12',
        unidad: '/km',
        etiqueta: 'tu ritmo umbral',
        juicio: { texto: '9 s/km más rápido en 3 meses', tono: 'ok' },
      },
      tarjetas: [
        { titulo: '5K de control', valor: '20:48', pie: 'hace 12 días · 4:10/km' },
        { titulo: 'Volumen del mes', valor: '84,6', unidad: 'km', pie: '14 sesiones' },
        { titulo: 'En Z2 o menos', valor: '71', unidad: '%', pie: 'del tiempo corriendo' },
        { titulo: 'Mejor kilómetro', valor: '3:44', pie: 'series del 21 de julio' },
      ],
    }),
    seccion('ergo', {
      veredicto: {
        cifra: '1:45',
        unidad: '/500m',
        etiqueta: 'tu ritmo umbral de remo',
        juicio: { texto: '3 s más rápido que en abril', tono: 'ok' },
      },
      tarjetas: [
        { titulo: 'Remo 2K', valor: '7:02', pie: 'hace 12 días · 1:45,5/500m' },
        { titulo: 'Metros del mes', valor: '18 400', unidad: 'm', pie: '9 sesiones' },
        { titulo: 'Paladas', valor: '27', unidad: 'spm', pie: 'media en umbral' },
      ],
    }),
    seccion('fuerza', {
      veredicto: {
        cifra: '562,5',
        unidad: 'kg',
        etiqueta: 'la suma de tus tres levantamientos',
        juicio: { texto: '+17,5 kg en 6 meses', tono: 'ok' },
      },
      tarjetas: [
        { titulo: 'Sentadilla', valor: '190', unidad: 'kg', pie: 'hace 12 días' },
        { titulo: 'Peso muerto', valor: '250', unidad: 'kg', pie: 'hace 12 días' },
        { titulo: 'Press banca', valor: '122,5', unidad: 'kg', pie: 'hace 12 días' },
        { titulo: 'Relativo al peso', valor: '2,4', unidad: '× peso', pie: 'sentadilla · 79 kg' },
      ],
    }),
    seccion('hyrox', {
      veredicto: {
        cifra: '1:08:47',
        etiqueta: 'tu mejor HYROX · Valencia, individual',
        juicio: { texto: '4:11 mejor que hace un año', tono: 'ok' },
      },
      tarjetas: [
        { titulo: 'Correr, 8 km', valor: '36:12', pie: '4:31/km en carrera' },
        { titulo: 'Estaciones', valor: '26:48', pie: 'las ocho sumadas' },
        { titulo: 'Roxzone', valor: '5:47', pie: 'tu punto fuerte' },
        { titulo: 'Wall balls', valor: '4:38', pie: 'la estación que más te cuesta' },
      ],
    }),
    seccion('recuperacion', {
      veredicto: {
        cifra: '74',
        etiqueta: 'tu recuperación de hoy',
        juicio: { texto: 'Entrena, pero no fuerces', tono: 'aviso' },
      },
      tarjetas: [
        { titulo: 'Variabilidad', valor: '61,2', unidad: 'ms', pie: 'hoy · tu línea base son 64,8' },
        { titulo: 'FC en reposo', valor: '46', unidad: 'ppm', pie: 'hoy' },
        { titulo: 'Sueño', valor: '6:48', pie: 'anoche · tu objetivo son 8:00' },
        { titulo: 'VO₂ máx', valor: '52,8', unidad: 'ml/kg/min', pie: 'hoy · +0,6 en 30 días' },
      ],
    }),
  ],
};

export const ESTADOS: Record<string, EstadoAnaliticas> = { nuevo: NUEVO, alex: ALEX, veterano: VETERANO };

/**
 * Los títulos que HOY pinta la sección de Fuerza cuando está vacía: cuatro
 * tarjetas grises idénticas, cada una repitiendo que no hay datos, ninguna con
 * salida (AnalyticsCardView.swift:150 `emptyNoteCard`).
 */
export const TARJETAS_VACIAS_HOY = [
  'Tus 1RM',
  'Progresión de carga',
  'Volumen por levantamiento',
  'Equilibrio empuje / tirón',
] as const;
