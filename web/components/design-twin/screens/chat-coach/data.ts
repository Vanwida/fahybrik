// Conversación REAL, leída de `chat_messages` el 28-jul-2026 (hilo 276, coach
// Pablo Amigo ↔ su atleta). Se usa tal cual porque es exactamente el registro
// que hay que saber componer: mensajes largos del coach, cortos del atleta,
// preguntas de ritmo, y una respuesta que condiciona el entreno de mañana.
//
// El hilo vacío también es real: el hilo 265 (Pablo ↔ atleta 65) lleva desde el
// 9 de julio con `last_message_at` a null. Cero mensajes. Ese es el mínimo.

export interface Mensaje {
  id: number;
  de: 'atleta' | 'coach';
  texto: string;
  /** Hora local Europe/Madrid, como la ve el atleta. */
  hora: string;
  /** Cabecera de día cuando cambia. */
  dia?: string;
  /** Estado de envío del propio mensaje del atleta. */
  envio?: 'enviando' | 'fallido';
  adjunto?: 'imagen';
}

export const COACH = { nombre: 'Pablo Amigo', nombreCorto: 'Pablo', inicial: 'P' } as const;

/** Hilo 276 íntegro, en orden. */
export const CONVERSACION: Mensaje[] = [
  {
    id: 15,
    de: 'atleta',
    dia: 'Viernes 17 de julio',
    hora: '19:42',
    texto: 'Acabo la simulación de HYROX. Las series de carrera bien, pero en el sled se me volvió a disparar el pulso.',
  },
  {
    id: 16,
    de: 'coach',
    hora: '20:15',
    texto:
      'Es normal, el sled siempre manda el pulso arriba. Sal más controlado los primeros 10 metros y no bloquees la respiración. El lunes lo afinamos.',
  },
  { id: 17, de: 'atleta', dia: 'Sábado 18', hora: '09:05', texto: 'Perfecto. Para el remo de mañana, ¿a qué ritmo tiro los 500?' },
  {
    id: 18,
    de: 'coach',
    hora: '10:20',
    texto:
      'Ve a 1:54-1:56 el 500, remada larga sobre 28 paladas. Que los cuatro primeros sean cómodos y aprietas los cuatro últimos.',
  },
  {
    id: 19,
    de: 'atleta',
    dia: 'Domingo 19',
    hora: '12:30',
    texto: 'Hecho. Salí a 1:56 y cerré a 1:51, muy buenas sensaciones y el pulso controlado hasta el final.',
  },
  {
    id: 20,
    de: 'coach',
    hora: '13:10',
    texto: 'Muy bien ese negativo, justo lo que buscábamos. Mañana pierna: si vienes cargado baja un pelín la sentadilla, sin forzar.',
  },
  {
    id: 21,
    de: 'atleta',
    dia: 'Martes 21',
    hora: '21:10',
    texto: 'Las series de umbral de hoy durísimas, pero dentro de ritmo. Mañana metcon, ¿algo que cuidar?',
  },
  {
    id: 22,
    de: 'coach',
    dia: 'Miércoles 22',
    hora: '08:30',
    texto:
      'Si notas las piernas del umbral, prioriza técnica en el metcon y no vayas al fallo. Y esta noche a dormir bien, que la recuperación baja un poco.',
  },
];

/** El mismo hilo con el último mensaje del atleta caído. */
export const CON_FALLO: Mensaje[] = [
  ...CONVERSACION,
  {
    id: 23,
    de: 'atleta',
    dia: 'Hoy',
    hora: '07:12',
    texto: 'Me he despertado con la pierna cargada, ¿cambio el metcon por rodillo?',
    envio: 'fallido',
  },
];

/**
 * Las tres primeras cosas que un atleta le escribe a su coach, sacadas de lo
 * que de verdad se escriben en producción: sensaciones de la sesión, una duda
 * de ritmo y un aviso de molestia. NO son plantillas de marketing: al tocarlas
 * rellenan el compositor y él las edita.
 */
export const ARRANQUES = [
  'Hoy me he encontrado…',
  '¿A qué ritmo tiro mañana?',
  'Tengo una molestia en…',
] as const;
