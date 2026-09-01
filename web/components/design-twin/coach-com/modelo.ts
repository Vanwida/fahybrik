// EL COMUNICADO — la comunicación estructurada del coach al atleta, fuera del chat.
//
// La frontera con el chat es la razón entera de que esto exista: el chat
// CONVERSA (dos voces, un hilo, sin estado), y un comunicado se PUBLICA y se
// RASTREA. Por eso todo comunicado tiene ciclo de vida — publicado → visto →
// hecho/respondido. El coach no necesita saber que lo leíste; necesita saber si
// lo hiciste, y hoy eso no se sabe porque todo viaja como texto libre.
//
// MECANISMO vs MÉTODO (HARD RULE Nº0): los cinco tipos, las siete anclas y el
// ciclo de vida son MECANISMO y viven aquí, en código. Lo que el coach escribe
// dentro de cada uno (los pasos de su calentamiento, las opciones de su
// pregunta, el porqué de su plan) es su MÉTODO y es dato — `data.ts`.

// ---------------------------------------------------------------------------
// Los cinco tipos
// ---------------------------------------------------------------------------

/**
 * Cinco, y son cinco porque cada uno pide una cosa distinta del atleta:
 * marcar pasos · decidir · cerrar una acción con fecha · entender · recordar.
 * Si algo no encaja en los cinco, el modelo está mal y se arregla aquí.
 */
export type TipoComunicado =
  /** Pasos ordenados que se marcan uno a uno (un calentamiento, un protocolo de test). */
  | 'protocolo'
  /** Una decisión con opciones. Bloquea: hasta que no contestas, el plan no se cierra. */
  | 'pregunta'
  /** Una acción con fecha límite. Se cierra en hecho / no hecho. */
  | 'tarea'
  /** Briefing: el porqué, por secciones. No pide acto, pide que lo entiendas. */
  | 'nota'
  /** Persistente, sin fecha de caducidad. Lo que no se te puede olvidar. */
  | 'foco';

/** Dónde aflora en la app. El ancla no es una etiqueta: decide la superficie. */
export type AnclaComunicado =
  | 'plan'
  | 'semana'
  | 'sesion'
  | 'test'
  | 'carrera'
  | 'checkin'
  | 'general';

/**
 * El ciclo de vida. `visto` no es el final de nada: es el paso intermedio que
 * hoy la app confunde con el final (un push abierto no es una tarea cerrada).
 */
export type EstadoComunicado = 'publicado' | 'visto' | 'hecho' | 'respondido';

export interface FichaTipo {
  /** Cara al atleta, en versales (§3: español, cero jerga de producto). */
  etiqueta: string;
  /** Siempre una var `--twin-*`. Un hex aquí sería un color fuera del tema. */
  color: string;
  /** ¿Pide un acto? Es lo que decide si sube a «Para hacer» en la bandeja. */
  pideAccion: boolean;
}

export const TIPO: Record<TipoComunicado, FichaTipo> = {
  // Lo que pide acción se lleva el naranja de marca: en la bandeja el color ES
  // la cola de trabajo, no un adorno por familia.
  protocolo: { etiqueta: 'PROTOCOLO', color: 'var(--twin-accent-text)', pideAccion: true },
  pregunta: { etiqueta: 'PREGUNTA', color: 'var(--twin-accent-text)', pideAccion: true },
  tarea: { etiqueta: 'TAREA', color: 'var(--twin-accent-text)', pideAccion: true },
  // La nota informa y el foco acompaña: ni uno ni otro pueden competir con la
  // cola de trabajo, así que salen del naranja.
  nota: { etiqueta: 'NOTA', color: 'var(--twin-muted)', pideAccion: false },
  foco: { etiqueta: 'FOCO', color: 'var(--twin-info)', pideAccion: false },
};

/**
 * El ancla, dicha como la diría el atleta. `general` no se pinta: un comunicado
 * que no cuelga de nada no gana nada por decir «general» (§6.2 bis).
 */
export const ANCLA_ETIQUETA: Record<AnclaComunicado, string | null> = {
  plan: 'Tu plan',
  semana: 'Esta semana',
  sesion: 'La sesión',
  test: 'Tus tests',
  carrera: 'Día de carrera',
  checkin: 'Tu check-in',
  general: null,
};

export interface Insignia {
  etiqueta: string;
  color: string;
}

const INSIGNIA_ESTADO: Record<EstadoComunicado, Insignia> = {
  publicado: { etiqueta: 'NUEVO', color: 'var(--twin-accent-text)' },
  visto: { etiqueta: 'VISTO', color: 'var(--twin-muted)' },
  hecho: { etiqueta: 'HECHO', color: 'var(--twin-ok)' },
  respondido: { etiqueta: 'RESPONDIDO', color: 'var(--twin-ok)' },
};

/** El vencimiento gana al estado: lo urgente se ve antes que lo administrativo. */
const INSIGNIA_VENCE_HOY: Insignia = { etiqueta: 'VENCE HOY', color: 'var(--twin-warning)' };

// ---------------------------------------------------------------------------
// Las formas por tipo
// ---------------------------------------------------------------------------

interface Base {
  id: string;
  ancla: AnclaComunicado;
  titulo: string;
  /** La línea que se lee en la bandeja SIN abrir. No es un resumen del título. */
  resumen: string;
  /** Cuándo lo publicó, como lo lee el atleta. */
  publicado: string;
  estado: EstadoComunicado;
}

export interface OpcionPregunta {
  id: string;
  texto: string;
  /** Qué pasa si eliges esta. Sin esto la pregunta es una encuesta a ciegas. */
  consecuencia: string;
}

export interface Pregunta extends Base {
  tipo: 'pregunta';
  /** Bloqueante: hay algo del plan que no se cierra sin tu respuesta. */
  bloquea: boolean;
  contexto: string;
  opciones: OpcionPregunta[];
  /** Id de la opción elegida. Ausente = sin responder. */
  elegida?: string;
}

export interface PasoProtocolo {
  id: string;
  /** Marca temporal, en la voz del instrumento. Ausente = paso sin reloj. */
  marca?: string;
  texto: string;
}

export interface Protocolo extends Base {
  tipo: 'protocolo';
  pasos: PasoProtocolo[];
  /** Cuántos pasos llegan ya marcados en este escenario. */
  hechos: number;
  notaCoach: string;
}

export interface Tarea extends Base {
  tipo: 'tarea';
  /** Cuándo vence, dicho como lo diría el atleta. */
  vence: string;
  venceHoy: boolean;
  /** Por qué importa. Una tarea sin porqué es un recado. */
  porque: string;
}

/** Cómo se reparte la carga de la semana. El color lo pone `COLOR_INTENSIDAD`. */
export type IntensidadSesion = 'dura' | 'moderada' | 'absorcion';

export const COLOR_INTENSIDAD: Record<IntensidadSesion, string> = {
  dura: 'var(--twin-accent)',
  moderada: 'var(--twin-info)',
  absorcion: 'var(--twin-ok)',
};

export const NOMBRE_INTENSIDAD: Record<IntensidadSesion, string> = {
  dura: 'duras',
  moderada: 'moderadas',
  absorcion: 'de absorción',
};

export interface ParteReparto {
  intensidad: IntensidadSesion;
  sesiones: number;
}

/** Las fases de un ciclo. Descargas y simulacros llevan color propio a propósito. */
export type FaseCiclo = 'tests' | 'trabajo' | 'descarga' | 'simulacro' | 'taper';

export const COLOR_FASE: Record<FaseCiclo, string> = {
  tests: 'var(--twin-info)',
  trabajo: 'var(--twin-muted)',
  descarga: 'var(--twin-ok)',
  simulacro: 'var(--twin-accent)',
  taper: 'var(--twin-warning)',
};

export interface HitoPlan {
  /** Qué semanas ocupa, como las nombra el coach. */
  semanas: string;
  titulo: string;
  detalle?: string;
  fase: FaseCiclo;
}

/**
 * Un briefing es prosa, pero su ESTRUCTURA no: cada bloque sabe cómo se pinta.
 * Así una cifra sale de cifra y un reparto sale de barra, en vez de acabar los
 * dos en el mismo párrafo gris.
 */
export type BloqueNota =
  | { clase: 'texto'; texto: string }
  | { clase: 'lista'; items: string[] }
  /**
   * Una banda de objetivo tiene DOS extremos, y por eso son dos campos y no una
   * cadena: el «a» que los une es una palabra, y dentro del monoespaciado
   * saldría con el espaciado de una columna de instrumento (§4).
   */
  | { clase: 'objetivo'; desde: string; hasta: string; pie: string }
  | { clase: 'reparto'; titular: string; partes: ParteReparto[] }
  | { clase: 'linea-tiempo'; hitos: HitoPlan[] };

export interface SeccionNota {
  etiqueta: string;
  bloques: BloqueNota[];
}

export interface Nota extends Base {
  tipo: 'nota';
  secciones: SeccionNota[];
  /** Enlace a otro comunicado: un briefing que deja una pregunta abierta lo dice. */
  cruce?: { comunicadoId: string; texto: string };
}

export interface Foco extends Base {
  tipo: 'foco';
  /** Por qué es EL foco y no un consejo más. */
  linea: string;
}

export type Comunicado = Pregunta | Protocolo | Tarea | Nota | Foco;

// ---------------------------------------------------------------------------
// Mecanismo: qué reclama, qué insignia lleva, cuándo la bandeja está en calma
// ---------------------------------------------------------------------------

/**
 * Lo que aún te reclama: sin ver, sin responder o sin hacer.
 *
 * Un protocolo o una nota ya vistos NO reclaman: leerlos ERA el acto pendiente.
 * El foco no se cierra nunca, y por eso tampoco reclama: si lo hiciera, la
 * bandeja no podría estar en calma jamás.
 */
export function reclama(c: Comunicado): boolean {
  if (c.estado === 'publicado') return true;
  if (c.tipo === 'pregunta') return c.estado !== 'respondido';
  if (c.tipo === 'tarea') return c.estado !== 'hecho';
  return false;
}

/** La bandeja en calma: nada sin ver, nada sin responder, nada sin hacer. */
export function alDia(comunicados: Comunicado[]): boolean {
  return comunicados.every((c) => !reclama(c));
}

/** La insignia que le toca. El vencimiento de hoy manda sobre el estado. */
export function insignia(c: Comunicado): Insignia {
  if (c.tipo === 'tarea' && c.venceHoy && c.estado !== 'hecho') return INSIGNIA_VENCE_HOY;
  return INSIGNIA_ESTADO[c.estado];
}

/** Copia con otro estado, conservando el tipo concreto (los escenarios remontan). */
export function conEstado<T extends Comunicado>(c: T, estado: EstadoComunicado): T {
  return { ...c, estado };
}
