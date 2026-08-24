// Los entrenos que se enseñan en el cartel. Simulados a propósito y con forma
// real: un día de fuerza corriente, un simulacro HYROX que NO cabe (es el caso
// que prueba el recorte) y el mismo día de fuerza ya hecho, con sus números.

import type { Club, Entreno, Semana } from './modelo';

export const CLUB: Club = {
  nombre: 'Fabrik Training Club',
  // El acento del club, que ya viaja del servidor a la app y al reloj. Aquí es
  // un valor de ejemplo: en la app sale de `ClubThemeStore`, nunca cableado.
  acento: '#f06a2a',
};

/** ① Un martes de fuerza + ergo. Cabe entero con holgura. */
const FUERZA_ERGO: Entreno = {
  dia: 'Martes',
  titulo: 'Fuerza B + Ski',
  bloques: [
    {
      clase: 'lista',
      titulo: 'Calentamiento',
      formato: 'warmup',
      ejercicios: [
        { nombre: 'Movilidad de cadera', dosis: '5 min' },
        { nombre: 'Remo suave', dosis: '500 m' },
      ],
    },
    {
      clase: 'lista',
      titulo: 'Fuerza',
      formato: 'strength',
      ejercicios: [
        { nombre: 'Back squat', dosis: '4×5 · 80%' },
        { nombre: 'Front squat', dosis: '3×6 · RIR 2' },
        { nombre: 'Búlgaras', dosis: '3×10 · 24 kg' },
      ],
    },
    {
      clase: 'lista',
      titulo: 'SkiErg',
      formato: 'rounds',
      pauta: '4 rondas',
      ejercicios: [{ nombre: 'Ski', dosis: '250 m · 45 s descanso' }],
    },
  ],
};

/** ② Un simulacro HYROX entero. NO cabe: es el caso que prueba el recorte. */
const SIMULACRO: Entreno = {
  dia: 'Sábado',
  titulo: 'Simulacro HYROX',
  bloques: [
    {
      clase: 'lista',
      titulo: 'Calentamiento',
      formato: 'warmup',
      ejercicios: [{ nombre: 'Trote + movilidad', dosis: '10 min' }],
    },
    {
      clase: 'lista',
      titulo: 'Estaciones',
      formato: 'hyrox_sim',
      pauta: '8 rondas · 1 km entre estación',
      ejercicios: [
        { nombre: 'SkiErg', dosis: '1.000 m' },
        { nombre: 'Sled push', dosis: '50 m · 152 kg' },
        { nombre: 'Sled pull', dosis: '50 m · 103 kg' },
        { nombre: 'Burpee broad jump', dosis: '80 m' },
        { nombre: 'Remo', dosis: '1.000 m' },
        { nombre: 'Farmers carry', dosis: '200 m · 2×24 kg' },
        { nombre: 'Sandbag lunges', dosis: '100 m · 20 kg' },
        { nombre: 'Wall balls', dosis: '100 reps · 9 kg' },
      ],
    },
    {
      clase: 'lista',
      titulo: 'Core',
      formato: 'rounds',
      pauta: '3 rondas',
      ejercicios: [
        { nombre: 'Plancha', dosis: '60 s' },
        { nombre: 'Hollow rock', dosis: '20 reps' },
        { nombre: 'Russian twist', dosis: '30 reps' },
        { nombre: 'Dead bug', dosis: '20 reps' },
        { nombre: 'Elevación de piernas', dosis: '15 reps' },
        { nombre: 'Plancha lateral', dosis: '45 s por lado' },
      ],
    },
    {
      clase: 'lista',
      titulo: 'Vuelta a la calma',
      formato: 'cooldown',
      ejercicios: [{ nombre: 'Bici suave', dosis: '8 min' }],
    },
  ],
};

/** ③ El mismo martes, ya hecho. Cambia el sujeto: lo que pasó, no lo que toca. */
const HECHO: Entreno = {
  dia: 'Martes',
  titulo: 'Fuerza B + Ski',
  resultado: [
    { etiqueta: 'Tiempo', valor: '1:04:12' },
    { etiqueta: 'Volumen', valor: '6,4 t' },
    { etiqueta: 'Pulso medio', valor: '128' },
  ],
  bloques: [
    {
      clase: 'lista',
      titulo: 'Fuerza',
      formato: 'strength',
      ejercicios: [
        { nombre: 'Back squat', dosis: '4×5 · 80%', hecho: '4×5 · 110 kg' },
        { nombre: 'Front squat', dosis: '3×6 · RIR 2', hecho: '3×6 · 85 kg' },
        { nombre: 'Búlgaras', dosis: '3×10 · 24 kg', hecho: '3×8 · 24 kg' },
      ],
    },
    {
      clase: 'lista',
      titulo: 'SkiErg',
      formato: 'rounds',
      pauta: '4 rondas',
      ejercicios: [{ nombre: 'Ski', dosis: '250 m', hecho: '4×250 m · 1:52 /500' }],
    },
  ],
};


/**
 * ④ La tanda de 400. EL CASO QUE MÁS SE COMPARTE: lo que la gente enseña de una
 * sesión de series no es «8 × 400 m», son los ocho parciales — cómo aguantó el
 * ritmo, dónde se cayó y cuál fue la mejor. Por eso el bloque de serie existe
 * como forma propia y no como una línea de lista.
 */
const SERIES_400: Entreno = {
  dia: 'Jueves',
  titulo: '8 × 400',
  resultado: [
    { etiqueta: 'Media', valor: '1:26' },
    { etiqueta: 'Ritmo', valor: '3:35' },
    { etiqueta: 'Total', valor: '9,4 km' },
  ],
  bloques: [
    {
      clase: 'serie',
      titulo: 'Series',
      formato: 'intervals',
      pauta: '400 m · 90 s rec',
      repeticiones: [
        { valor: '1:28', ritmo: '3:40' },
        { valor: '1:27', ritmo: '3:37' },
        { valor: '1:27', ritmo: '3:37' },
        { valor: '1:26', ritmo: '3:35' },
        { valor: '1:26', ritmo: '3:35' },
        { valor: '1:25', ritmo: '3:32' },
        { valor: '1:25', ritmo: '3:32' },
        { valor: '1:22', ritmo: '3:25', mejor: true },
      ],
    },
  ],
};


/**
 * ⑤ La semana entera. La tira es el titular; los totales van en la cabecera de
 * la lista. El viernes SALTADO existe a propósito: es el estado que prueba que
 * la tira cuenta la semana que fue, no la que quedaría bonita. El título es el
 * nombre que el COACH le puso a la semana — dato del coach, nunca nuestro.
 */
export const SEMANA: Semana = {
  etiqueta: 'Semana 34',
  titulo: 'Carga · 3',
  dias: [
    { letra: 'L', estado: 'hecho' },
    { letra: 'M', estado: 'hecho' },
    { letra: 'X', estado: 'descanso' },
    { letra: 'J', estado: 'hecho' },
    { letra: 'V', estado: 'saltado' },
    { letra: 'S', estado: 'hecho' },
    { letra: 'D', estado: 'descanso' },
  ],
  totales: '4/5 · 4:15 · 17,4 km',
  sesiones: [
    { dia: 'L', titulo: 'Fuerza B + Ski', dato: '1:04' },
    { dia: 'M', titulo: '8 × 400', dato: '52′' },
    { dia: 'J', titulo: 'Fuerza C', dato: '58′' },
    { dia: 'S', titulo: 'Simulacro HYROX', dato: '1:21' },
  ],
};

export const ESCENAS: Record<string, Entreno> = {
  'dia-normal': FUERZA_ERGO,
  'no-cabe': SIMULACRO,
  'ya-hecho': HECHO,
  'series-400': SERIES_400,
};
