// LOS CUATRO ESCENARIOS — la prueba de que un solo modelo sirve a formatos
// distintos y a los dos hechos que puede haber o no en cualquiera de ellos
// (pulso, GPS), sin ramas raras en la pantalla.
//
// ① «Fuerza B + Trineos» es la sesión REAL del 20-ago que abrió la card 118:
// ocho tramos, sus duraciones y su pulso medio, tal y como los dio Alex — y
// AHORA también sus totales reales (card 124): duración 47:02, FC media 115
// ppm, FC máxima 149 ppm, de la traza real (620 muestras, mínimo 65). Esa
// sesión tuvo la cinta sin conectar (otra card) y ninguna carga de hierro
// logueada, así que sigue sin metros de carrera ni de fuerza — es el caso que
// prueba la regla de no mezclar distancias.
//
// ② «Simulacro HYROX» y ③ «Fuerza pura» son EJECUCIONES SIMULADAS —lo pide el
// encargo—: plausibles y coherentes con lo prescrito, pero inventadas. ④ es
// el MISMO simulacro que ②, al aire libre: misma fisiología simulada, con GPS.
// Las cuatro se declaran como lo que son en su `procedencia`.

import { hrZone } from '../../sim';
import { SIGNO_POR, UMBRAL } from '../../datos-reales';
import type { Zona } from '../../kit-vivo';
import type { PuntoRuta } from '../lectura-carrera/modelo';
import { trazaPulsoIlustrativa } from './senal';
import type { Bloque, Sesion } from './modelo';

// ---------------------------------------------------------------------------
// ① Fuerza B + Trineos — datos reales, 20 de agosto
// ---------------------------------------------------------------------------

const BLOQUES_FUERZA_TRINEOS: Bloque[] = [
  { modalidad: 'correr', etiqueta: 'Calentamiento', duracionS: 360, distanciaM: null, fcMediaPpm: null },
  { modalidad: 'correr', etiqueta: 'Rodaje', duracionS: 357, distanciaM: null, fcMediaPpm: 139 },
  { modalidad: 'fuerza', etiqueta: 'Peso muerto', duracionS: 669, grupos: null, descansoS: null, fcMediaPpm: 128 },
  { modalidad: 'fuerza', etiqueta: 'Peso muerto rumano', duracionS: 426, grupos: null, descansoS: null, fcMediaPpm: 113 },
  { modalidad: 'fuerza', etiqueta: 'Remo con barra', duracionS: null, grupos: null, descansoS: null, fcMediaPpm: 112 },
  { modalidad: 'fuerza', etiqueta: 'Fuerza', duracionS: null, grupos: null, descansoS: null, fcMediaPpm: 115 },
  { modalidad: 'funcional', etiqueta: 'Trineos', duracionS: 260, reps: null, metros: null, fcMediaPpm: 121 },
  { modalidad: 'funcional', etiqueta: 'Trineos', duracionS: null, reps: null, metros: null, fcMediaPpm: 107 },
];
const DURACION_FUERZA_TRINEOS = 2822; // 47:02, tal y como lo cerró el entreno

const FUERZA_TRINEOS: Sesion = {
  titulo: 'Fuerza B + Trineos',
  cuando: 'Hoy',
  // Real: arrancó a las 11:49:53 y cerró 47:02 después (12:36:55). Se
  // muestra sin segundos, como el resto de la ventana horaria de la app.
  horaInicio: '11:49',
  completitud: { completa: true },
  formato: { clase: 'libre' },
  duracionTotalS: DURACION_FUERZA_TRINEOS,
  bloques: BLOQUES_FUERZA_TRINEOS,
  fcMediaPpm: 115,
  fcMaxPpm: 149,
  kcal: null,
  ruta: [],
  dicho: { rpe: 10, dificultad: 'as_expected' },
  procedencia:
    'Datos reales del 20 de agosto: arrancó a las 11:49:53, duración 47:02, FC media (115 ppm) y FC máxima (149 ppm) tal y como los dio Alex. Sin metros de carrera (la cinta no llegó a conectarse, otra card) y sin carga de hierro logueada esa sesión: por eso esos recuadros no existen, y sin GPS ni caloría medida tampoco hay mapa ni recuadro de calorías. La gráfica del pulso es una curva RECONSTRUIDA (620 muestras) que respeta la media, la máxima y el mínimo reales (65 ppm) y sube en fuerza y trineos: la app real archivaría el latido a latido, el doble no lo tiene todavía.',
};

// ---------------------------------------------------------------------------
// ② y ④ Simulacro HYROX — ejecución SIMULADA de la plantilla 687 real
// ---------------------------------------------------------------------------
//
// NUEVE bloques, no treinta y dos: la plantilla prescribe cuatro RONDAS ya
// expandidas una a una (correr 1.000 m + su estación de cierre), no cuatro
// repeticiones de un circuito de ocho. Las notas del coach lo dicen
// literalmente —«Ronda 1. A race pace» / «Cierra la ronda 1» / «Ronda 2» / …
// / «Cierra la ronda 4»—, y son las que fijan qué bloque abre y cuál cierra
// cada ronda.

/** Una ronda: correr 1 km a ritmo de carrera + su estación de cierre. */
function ronda(n: number, estacion: Bloque): Bloque[] {
  // El ritmo de correr sube 5 s/km por ronda (4:15 → 4:30) y el pulso con él,
  // de Z3 en la primera a Z5 en la última: «RPE 9» a ritmo de carrera, con la
  // fatiga acumulándose ronda a ronda.
  const correrSkm = 255 + n * 5;
  const pulsoCorrer = 146 + n * 6;
  return [
    { modalidad: 'correr', etiqueta: 'Correr', duracionS: correrSkm, distanciaM: 1000, fcMediaPpm: pulsoCorrer, ronda: n },
    { ...estacion, ronda: n },
  ];
}

const BLOQUES_SIMULACRO: Bloque[] = [
  // Calentamiento, fuera de las rondas: por tiempo y zona, no por distancia.
  { modalidad: 'correr', etiqueta: 'Calentamiento', duracionS: 360, distanciaM: null, fcMediaPpm: 138 },
  ...ronda(1, { modalidad: 'ergometro', etiqueta: 'Ski erg', maquina: 'ski', duracionS: 115, distanciaM: 500, fcMediaPpm: 158, descansoS: 120 }),
  // Burpee Broad Jump, no trineo (Alex, 20-ago: resuelto contra el catálogo
  // real). Es funcional medido en METROS, no en reps — y mucho más lento que
  // empujar un trineo: 40 m a burpee + salto son ~30 reps, no 30 segundos.
  ...ronda(2, { modalidad: 'funcional', etiqueta: 'Burpee Broad Jump', duracionS: 75, reps: null, metros: 40, fcMediaPpm: 168, descansoS: 120 }),
  ...ronda(3, { modalidad: 'ergometro', etiqueta: 'Remo', maquina: 'remo', duracionS: 118, distanciaM: 500, fcMediaPpm: 170, descansoS: 120 }),
  ...ronda(4, { modalidad: 'funcional', etiqueta: 'Wall balls · 9 kg', duracionS: 65, reps: 25, metros: null, fcMediaPpm: 176, descansoS: 120 }),
];

// El total incluye el trabajo Y los descansos prescritos: los 2′ entre
// estaciones son tiempo real que pasa, no un hueco que el reloj se salta.
const DURACION_SIMULACRO = BLOQUES_SIMULACRO.reduce((acc, b) => acc + (b.duracionS ?? 0) + (b.descansoS ?? 0), 0);

// Física simulada del simulacro entero — la MISMA para la versión de interior
// (②) y la de calle (④): es el mismo entreno, solo cambia dónde se hizo.
const FC_MEDIA_SIMULACRO = 156;
const FC_MAX_SIMULACRO = 186;
const KCAL_SIMULACRO = 510;

const PROCEDENCIA_SIMULACRO =
  'Plantilla 687 real: calentamiento + 4 rondas de correr 1.000 m a RPE 8-9 cerradas con ski, burpee broad jump, remo y 25 wall balls de 9 kg. La ejecución entera (ritmo, pulso, calorías) es SIMULADA — la plantilla no trae todavía una sesión ejecutada. La distancia se midió en dos modalidades (correr y ergómetro, y dentro de ergómetro en dos máquinas distintas): por eso el total no enseña un metraje único y si acaso ritmo medio, solo el de correr. La gráfica del pulso es una curva reconstruida a partir de los objetivos por bloque, no una traza medida.';

const SIMULACRO_HYROX: Sesion = {
  titulo: 'Simulacro HYROX',
  cuando: 'Hoy',
  horaInicio: '18:30',
  completitud: { completa: true },
  formato: { clase: 'for-time' },
  duracionTotalS: DURACION_SIMULACRO,
  bloques: BLOQUES_SIMULACRO,
  fcMediaPpm: FC_MEDIA_SIMULACRO,
  fcMaxPpm: FC_MAX_SIMULACRO,
  kcal: KCAL_SIMULACRO,
  ruta: [],
  dicho: { rpe: 9, dificultad: 'as_expected' },
  procedencia: `${PROCEDENCIA_SIMULACRO} Hecho en el box, sin GPS: por eso no hay mapa.`,
};

// ---------------------------------------------------------------------------
// ④ El mismo simulacro, al aire libre — para el mapa
// ---------------------------------------------------------------------------

/** Encaja el trazo en un lienzo 1×0,62, igual que `lectura-carrera/senal.ts`
 *  (no se reexpone desde allí: es privada de ese módulo). */
function normalizarRuta(crudo: Array<{ x: number; y: number; zona: Zona | null }>): PuntoRuta[] {
  if (crudo.length < 2) return [];
  const xs = crudo.map((p) => p.x);
  const ys = crudo.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const ancho = Math.max(...xs) - minX || 1;
  const alto = Math.max(...ys) - minY || 1;
  const escala = Math.min(1 / ancho, 0.62 / alto);
  const dx = (1 - ancho * escala) / 2;
  const dy = (0.62 - alto * escala) / 2;
  const mil = (v: number) => Math.round(v * 1000) / 1000;
  return crudo
    .filter((_, i) => i % 3 === 0)
    .map((p) => ({ x: mil((p.x - minX) * escala + dx), y: mil((p.y - minY) * escala + dy), zona: p.zona }));
}

/**
 * La ruta PLAUSIBLE de un simulacro al aire libre: cuatro vueltas casi
 * cerradas a un mismo bucle de parque (la firma de un simulacro corrido fuera
 * — se sale y se vuelve al mismo punto para la estación), con las estaciones
 * y los descansos quietos en ese punto. Se colorea por la ZONA DE PULSO de su
 * tramo (§9.1: el color es dato) — no hay tabla de ritmo por zona en esta
 * pantalla, y usar la de pulso es honesto con lo que de verdad se tiene aquí.
 * Declarado como lo que es en `procedencia`: nadie corrió esta calle.
 */
function generarRutaSimulacroCalle(bloques: Bloque[]): PuntoRuta[] {
  const CADA_S = 5;
  const crudo: Array<{ x: number; y: number; zona: Zona | null }> = [];
  let px = 0;
  let py = 0;
  let rumbo = 0;

  for (const b of bloques) {
    const zona = b.fcMediaPpm != null ? hrZone(b.fcMediaPpm, UMBRAL.ppm) : null;

    if (b.modalidad === 'correr' && b.distanciaM != null && b.duracionS != null) {
      // Una vuelta casi cerrada de parque: gira algo menos de una vuelta
      // completa por kilómetro, así que cada ronda sale y vuelve cerca de la
      // estación sin ser un bucle perfecto (el rumbo real nunca lo es).
      const pasos = Math.max(1, Math.round(b.duracionS / CADA_S));
      const giroTotal = Math.PI * 1.85;
      for (let i = 0; i < pasos; i += 1) {
        rumbo += giroTotal / pasos + Math.sin(i / 5) * 0.06;
        const avance = b.distanciaM / pasos;
        px += Math.cos(rumbo) * avance;
        py += Math.sin(rumbo) * avance;
        crudo.push({ x: px, y: py, zona });
      }
    } else if (b.duracionS != null) {
      // Estación: el atleta se queda en su sitio — un temblor de GPS parado,
      // no un desplazamiento.
      const pasos = Math.max(1, Math.round(b.duracionS / CADA_S));
      for (let i = 0; i < pasos; i += 1) {
        crudo.push({ x: px + Math.sin(i) * 1.4, y: py + Math.cos(i * 1.3) * 1.4, zona });
      }
    }

    if (b.descansoS != null && b.descansoS > 0) {
      const pasos = Math.max(1, Math.round(b.descansoS / CADA_S));
      for (let i = 0; i < pasos; i += 1) crudo.push({ x: px + Math.sin(i) * 0.8, y: py + Math.cos(i) * 0.8, zona: null });
    }
  }

  return normalizarRuta(crudo);
}

const SIMULACRO_CALLE: Sesion = {
  ...SIMULACRO_HYROX,
  titulo: 'Simulacro HYROX · en la calle',
  ruta: generarRutaSimulacroCalle(BLOQUES_SIMULACRO),
  procedencia: `${PROCEDENCIA_SIMULACRO} Esta vez al aire libre: la ruta es un trazo INVENTADO y plausible (cuatro vueltas cortas a un mismo punto, como un simulacro corrido en un parque) — no hay un GPS de ejemplo real que reutilizar en la base todavía, así que se declara aquí en vez de fingir que se midió.`,
};

// ---------------------------------------------------------------------------
// ③ Fuerza pura — ejecución SIMULADA, sin correr ni ergo
// ---------------------------------------------------------------------------

const FUERZA_PURA: Sesion = {
  titulo: 'Fuerza · Tren inferior y empuje',
  cuando: 'Hoy',
  horaInicio: '19:05',
  completitud: { completa: true },
  formato: { clase: 'fuerza' },
  // Sin pulso en ningún bloque: una sesión de hierro sin pulsómetro puesto es
  // el caso más común de la base, y aquí sirve para probar que sin FC no hay
  // recuadros de pulso, ni gráfica, ni barra de zonas — ninguna, no una vacía.
  duracionTotalS: 32 * 60,
  bloques: [
    {
      modalidad: 'fuerza',
      etiqueta: 'Sentadilla',
      duracionS: 13 * 60,
      grupos: [{ sets: 5, reps: 5, kg: 100 }],
      descansoS: 150,
      fcMediaPpm: null,
    },
    {
      modalidad: 'fuerza',
      etiqueta: 'Press banca',
      duracionS: 11 * 60,
      grupos: [{ sets: 4, reps: 8, kg: 70 }],
      descansoS: 120,
      fcMediaPpm: null,
    },
    {
      modalidad: 'fuerza',
      etiqueta: 'Dominadas',
      duracionS: 8 * 60,
      // Peso corporal: no hay carga que sumar al tonelaje (§7 del modelo).
      grupos: [{ sets: 4, reps: 8, kg: null }],
      descansoS: 90,
      fcMediaPpm: null,
    },
  ],
  fcMediaPpm: null,
  fcMaxPpm: null,
  kcal: null,
  ruta: [],
  dicho: { rpe: 7, dificultad: 'as_expected' },
  procedencia:
    `Ejecución simulada: sentadilla 5${SIGNO_POR}5 a 100 kg, press banca 4${SIGNO_POR}8 a 70 kg y dominadas 4${SIGNO_POR}8 a peso corporal. No hay ejecución real de esta sesión todavía. Sin pulsómetro: por eso no hay gráfica de pulso, ni recuadros de FC, ni barra de zonas.`,
};

// ---------------------------------------------------------------------------
// La traza de pulso — RECONSTRUIDA, calculada una vez por escena
// ---------------------------------------------------------------------------

export const TRAZA_PULSO: Record<string, ReturnType<typeof trazaPulsoIlustrativa>> = {
  'fuerza-trineos': trazaPulsoIlustrativa(FUERZA_TRINEOS.bloques, FUERZA_TRINEOS.duracionTotalS, 620),
  'simulacro-hyrox': trazaPulsoIlustrativa(SIMULACRO_HYROX.bloques, SIMULACRO_HYROX.duracionTotalS, 220),
  'simulacro-calle': trazaPulsoIlustrativa(SIMULACRO_CALLE.bloques, SIMULACRO_CALLE.duracionTotalS, 220),
  // Fuerza pura no tiene pulso: sin entrada aquí, y la pantalla no dibuja nada.
};

export const ESCENAS: Record<string, Sesion> = {
  'fuerza-trineos': FUERZA_TRINEOS,
  'simulacro-hyrox': SIMULACRO_HYROX,
  'fuerza-pura': FUERZA_PURA,
  'simulacro-calle': SIMULACRO_CALLE,
};
