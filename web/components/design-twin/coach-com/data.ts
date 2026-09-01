// Los comunicados del caso REAL: el atleta que se pasa de Doubles a Singles Pro
// con la carrera en noviembre y la wave sin confirmar.
//
// No es una demo: es el stress-test del modelo hecho visible. Estos seis
// comunicados son exactamente lo que hoy viaja por el chat como texto libre, y
// cada uno rompe una parte distinta del chat — uno bloquea, dos vencen, uno se
// marca paso a paso, uno hay que releerlo en octubre y otro no caduca nunca.
//
// El coach se lee de donde ya vive (`chat-coach/data.ts`): el nombre del coach
// es dato de escenario y no puede tener dos grafías en el mismo doble.

import { COACH } from '../screens/chat-coach/data';
import type { Foco, Nota, Pregunta, Protocolo, Tarea } from './modelo';

export { COACH };

// ---------------------------------------------------------------------------
// 1 · La pregunta que bloquea el taper
// ---------------------------------------------------------------------------

export const PREGUNTA_WAVE: Pregunta = {
  id: 'wave',
  tipo: 'pregunta',
  ancla: 'plan',
  bloquea: true,
  titulo: '¿Tu wave es el jueves o el sábado?',
  resumen: 'Sin esto el taper se queda montado a ciegas.',
  publicado: 'ayer',
  estado: 'publicado',
  contexto:
    'El taper está montado contando con el sábado 14. Si tu wave es el jueves 12, todo se adelanta dos días.',
  opciones: [
    {
      id: 'jueves',
      texto: 'Jueves 12',
      consecuencia: 'Openers el martes 10 y carbos desde el lunes 9. El resto no cambia.',
    },
    {
      id: 'sabado',
      texto: 'Sábado 14',
      consecuencia: 'El plan se queda como está.',
    },
  ],
};

// ---------------------------------------------------------------------------
// 2 · El briefing del plan rehecho
// ---------------------------------------------------------------------------

export const NOTA_PLAN: Nota = {
  id: 'plan-singles-pro',
  tipo: 'nota',
  ancla: 'plan',
  titulo: 'Tu plan, rehecho para Singles Pro',
  resumen: 'Por qué el objetivo son 1:15 a 1:18 y cómo se reparten las 12 semanas.',
  publicado: 'hoy',
  estado: 'publicado',
  secciones: [
    {
      etiqueta: 'Qué ha cambiado',
      bloques: [
        {
          clase: 'texto',
          texto: 'Pasar a Singles Pro rompe 5 de las 6 premisas con las que estaba escrito tu plan:',
        },
        {
          clase: 'lista',
          items: [
            'Haces el 100 % de cada estación, no la mitad.',
            'Cada trineo lleva 50 kg más.',
            'Los wall balls suben 3 kg.',
            'El remo va a damper 7.',
            'Una sesión al día, no dos.',
          ],
        },
      ],
    },
    {
      etiqueta: 'Tu objetivo',
      bloques: [
        {
          clase: 'objetivo',
          desde: '1:15',
          hasta: '1:18',
          pie: 'La banda se cierra con los tests de la semana 1.',
        },
        {
          clase: 'texto',
          texto:
            'Por qué no 1:05: ese número era de Doubles, con el trabajo repartido entre dos. Tu referencia real es el Singles Open de hace un año, 1h09, y el salto de Open a Pro cuesta entre 5 y 9 minutos.',
        },
        {
          clase: 'texto',
          texto:
            'A favor tienes unos 8 kg menos de peso, y en 8 km de carrera eso vale mucho.',
        },
      ],
    },
    {
      etiqueta: 'Las 6 sesiones',
      bloques: [
        {
          clase: 'reparto',
          titular: '6 sesiones sí, 6 a tope no',
          partes: [
            { intensidad: 'dura', sesiones: 3 },
            { intensidad: 'moderada', sesiones: 2 },
            { intensidad: 'absorcion', sesiones: 1 },
          ],
        },
        {
          clase: 'texto',
          texto:
            'El motivo: tu tiempo lo predice el VO2máx, y el VO2máx se construye con volumen por debajo del umbral, no machacándote a diario.',
        },
      ],
    },
    {
      etiqueta: 'La estructura',
      bloques: [
        {
          clase: 'linea-tiempo',
          hitos: [
            { semanas: 'W1', titulo: 'Tests', detalle: 'Cierran tus ritmos y la banda del objetivo', fase: 'tests' },
            { semanas: 'W2-4', titulo: 'Motor y fuerza', detalle: 'Volumen bajo umbral y carga en barra', fase: 'trabajo' },
            { semanas: 'W5', titulo: 'Descarga', fase: 'descarga' },
            {
              semanas: 'W6-8',
              titulo: 'Umbral y trabajo comprometido',
              detalle: 'Series a ritmo de carrera y estaciones encadenadas',
              fase: 'trabajo',
            },
            { semanas: 'W9', titulo: 'Descarga y medio simulacro', fase: 'descarga' },
            {
              semanas: 'W10-12',
              titulo: 'Específico',
              detalle: 'Simulacro completo el 25 de octubre',
              fase: 'simulacro',
            },
            { semanas: '2 últimas', titulo: 'Taper', detalle: 'Baja el volumen, se mantiene la intensidad', fase: 'taper' },
          ],
        },
      ],
    },
  ],
  cruce: { comunicadoId: 'wave', texto: 'Falta que me digas si tu wave es el jueves o el sábado.' },
};

// ---------------------------------------------------------------------------
// 3 · El calentamiento del día de carrera
// ---------------------------------------------------------------------------

export const PROTOCOLO_CALENTAMIENTO: Protocolo = {
  id: 'calentamiento-carrera',
  tipo: 'protocolo',
  ancla: 'carrera',
  titulo: 'Calentamiento del día de carrera',
  resumen: 'Siete pasos, cronometrados hacia atrás desde tu salida.',
  publicado: 'hoy',
  estado: 'publicado',
  hechos: 0,
  pasos: [
    { id: 'movilidad', marca: "−40'", texto: "Movilidad de cadera y tobillo, 5'." },
    { id: 'trote', marca: "−35'", texto: "Trote progresivo 10', acabando a tu ritmo de carrera." },
    { id: 'tecnica', marca: "−25'", texto: '3 × 30" de skipping y técnica.' },
    { id: 'remo', marca: "−20'", texto: "Remo suave 4', damper 5." },
    { id: 'aceleraciones', marca: "−12'", texto: '2 aceleraciones de 60 m.' },
    { id: 'openers', marca: "−8'", texto: 'Openers: 5 wall balls y 5 burpees, tranquilos.' },
    { id: 'boxes', marca: "−5'", texto: 'Ropa de carrera, gel y a boxes.' },
  ],
  notaCoach: 'Nada de potenciación pesada: la evidencia no supera el efecto del propio calentamiento.',
};

// ---------------------------------------------------------------------------
// 4 · Las dos tareas con fecha
// ---------------------------------------------------------------------------

export const TAREA_BETA_ALANINA: Tarea = {
  id: 'beta-alanina',
  tipo: 'tarea',
  ancla: 'general',
  titulo: 'Empieza la beta-alanina',
  resumen: 'Lleva pendiente desde mayo y ya no admite más retraso.',
  publicado: 'hoy',
  estado: 'publicado',
  vence: 'hoy',
  venceHoy: true,
  porque: 'Necesita 4 a 6 semanas de carga y lleva pendiente desde mayo. En septiembre ya no llega útil.',
};

export const TAREA_TESTS: Tarea = {
  id: 'tests-semana-1',
  tipo: 'tarea',
  ancla: 'test',
  titulo: 'Haz los tests de la semana 1',
  resumen: 'Son los que fijan los ritmos de los tres primeros bloques.',
  publicado: 'hoy',
  estado: 'publicado',
  vence: 'el domingo',
  venceHoy: false,
  porque: 'Sin ellos, los bloques 1 a 3 van con ritmos estimados.',
};

// ---------------------------------------------------------------------------
// 5 · El foco, que no caduca
// ---------------------------------------------------------------------------

export const FOCO_SUENO: Foco = {
  id: 'dormir',
  tipo: 'foco',
  ancla: 'checkin',
  titulo: 'Dormir más de 6 horas',
  resumen: 'Sigues por debajo de 6 h desde mayo.',
  publicado: 'desde mayo',
  estado: 'visto',
  linea:
    'Sigues en menos de 6 h desde mayo. Es lo único de esta lista que puede darte más minutos que cualquier sesión.',
};
