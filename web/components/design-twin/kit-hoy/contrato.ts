// EL CONTRATO DE «HOY» — lo que la portada del atleta recibe, y solo eso.
//
// Es el espejo, campo a campo, de lo que `InicioView.swift` lee hoy del
// `AppDataStore` (planWeek, readiness, macroProgress, runningAnalysis, unread,
// partner) más el estado local (check-in pendiente, pasos de HealthKit, entreno
// guardado a medias). Nada de lo de aquí se calcula en la pantalla: una
// portada PINTA, no decide (el mismo principio que `kit-analiticas/contrato`).
//
// Dos pintores, un modelo: `hoy-pulso` y `hoy-dia` reciben exactamente esto.
// Lo que cambia entre ellas es qué es el SUJETO y cómo se pinta, no qué se sabe.
//
// ── LÍMITES YA DECIDIDOS (docs/DECISIONS.md), que esta portada respeta ────────
//  · 6-ago: el PLAN es la única puerta que EMPIEZA un entreno. Hoy dice el
//    ESTADO de la sesión de hoy y, al tocarlo, lleva a la pestaña Plan; nunca
//    lanza el motor ni abre la sesión por su cuenta (dos puertas al mismo
//    entreno es la duplicación que se retiró).
//  · 29-sep: el PROGRESO vive en Analíticas. Hoy conserva UNA marca reciente
//    como prueba, no la tarjeta de progreso entera.
//  · La honestidad del dato (CONTRATO-UI §7): lo que no se sabe no se pinta; un
//    hueco que el atleta puede llenar con un acto se declara con su salida.
//  · HARD RULE Nº0: las bandas de disposición y los textos de fase son MÉTODO
//    del coach. Aquí van como dato con su defecto, nunca cableados en la vista.

/** Zona de disposición (mismo enum que `ReadinessZone` en ReadinessService.swift). */
export type ZonaDisposicion = 'alta' | 'media' | 'baja';

/**
 * Cortes de las tres zonas. ESPEJO de `READINESS_OK_MIN` / `READINESS_CAUTION_MIN`
 * (ReadinessZone.okMin = 67, .cautionMin = 45): son método, se leen del servidor
 * y aquí solo son el defecto. La pantalla NUNCA escribe un 67 ni un 45.
 */
export const BANDAS_DISPOSICION = { okMin: 67, cautionMin: 45 } as const;

export function zonaDe(score: number, bandas = BANDAS_DISPOSICION): ZonaDisposicion {
  if (score >= bandas.okMin) return 'alta';
  if (score >= bandas.cautionMin) return 'media';
  return 'baja';
}

/** La lectura de una línea del ESTADO DEL CUERPO — nunca una prescripción (ReadinessZone.interpretation). */
export const LECTURA_ZONA: Record<ZonaDisposicion, string> = {
  alta: 'Recuperado y listo',
  media: 'Recuperación parcial',
  baja: 'Cuerpo cargado',
};

/** El color de la zona: los tokens de estado del doble, jamás un hex. */
export const COLOR_ZONA: Record<ZonaDisposicion, string> = {
  alta: 'var(--twin-ok)',
  media: 'var(--twin-warning)',
  baja: 'var(--twin-danger)',
};

// ---------------------------------------------------------------------------
// Cómo llegas hoy
// ---------------------------------------------------------------------------

export type SenalClave = 'checkin' | 'hrv' | 'sueno' | 'fc-reposo';

/** Una de las cuatro señales que alimentan el número: encendida si llegó, apagada si no. */
export interface Senal {
  clave: SenalClave;
  /** «Check-in» · «HRV» · «Sueño» · «FC reposo» (Vocab.fcReposo). */
  etiqueta: string;
  activa: boolean;
  /** Solo si hay valor real («7,4 h»). Sin valor, la señal se dice, no se cifra. */
  valor?: string;
}

export type Disposicion =
  | {
      tipo: 'medida';
      /** 0–100. */
      score: number;
      /** Cambio en 7 días. Null si aún no hay semana anterior con la que comparar. */
      delta7d: number | null;
      senales: Senal[];
    }
  | {
      tipo: 'sin-datos';
      /**
       * Por qué no hay número, porque de ello depende la salida:
       *  · `checkin-pendiente` → hacer el check-in (el camino más rápido a un número)
       *  · `salud-conectada`   → Salud conectada, esperando muestras del reloj
       *  · `salud-sin-conectar`→ conectar Apple Salud o hacer el check-in
       */
      motivo: 'checkin-pendiente' | 'salud-conectada' | 'salud-sin-conectar';
    };

// ---------------------------------------------------------------------------
// Camino a la carrera
// ---------------------------------------------------------------------------

export interface Carrera {
  nombre: string;
  /** Días que faltan (ya en el «hoy» del atleta). */
  dias: number;
  /** «sub 65 min» / «1:04:30». Null si el atleta no fijó objetivo de tiempo. */
  meta: string | null;
  /**
   * «Construcción · semana 4 de 12»: el nombre de la fase lo pone el COACH
   * (agnóstico, HARD RULE Nº0). Null si el plan no tiene periodización.
   */
  fase: string | null;
  /** N de M, para la barra de posición. Null si `fase` no se pudo leer. */
  semana: { n: number; m: number } | null;
  /** Fondo de la tarjeta de carrera (los tres del catálogo de la app). */
  fondo: 'sled-push' | 'running' | 'wall-balls';
}

export type CaminoEstado =
  | { tipo: 'fijada'; carrera: Carrera }
  /** Plan cargado y sin carrera objetivo: se invita a elegirla (con su salida). */
  | { tipo: 'sin-objetivo' };

/** Simulación HYROX: lo único que afila la previsión de carrera (la «puerta honesta»). */
export type Simulacion =
  | { tipo: 'programada'; dia: string; hoy: boolean }
  | { tipo: 'abierta' };

// ---------------------------------------------------------------------------
// El entreno de hoy — ESTADO, nunca puerta
// ---------------------------------------------------------------------------

/** Cubos canónicos de modalidad (Theme.Modality.Kind). */
export type ModalidadHoy = 'run' | 'ergo' | 'strength' | 'functional' | 'hyrox' | 'support' | 'other';

export type EstadoSesion = 'pendiente' | 'hecha' | 'parcial' | 'saltada';

export interface SesionHoy {
  /** Solo hay franja cuando el día trae dos sesiones. */
  franja: 'AM' | 'PM' | null;
  titulo: string;
  modalidad: ModalidadHoy;
  estado: EstadoSesion;
  /** Una sesión que el atleta montó (no del coach): lleva la insignia «Libre». */
  libre: boolean;
}

export type EntrenoHoy =
  | { tipo: 'sesiones'; sesiones: SesionHoy[] }
  /** El plan cargó y hoy no hay nada. `manana` es lo que toca a continuación, si lo hay. */
  | { tipo: 'descanso'; manana: { titulo: string; modalidad: ModalidadHoy; dia: string } | null }
  /** El coach pausó el plan del atleta: se dice, no se enseña una sesión vieja. */
  | { tipo: 'pausado' }
  /** Aún sin plan cargado y sin caché (instalación nueva con fallo de red). */
  | { tipo: 'error-carga' };

// ---------------------------------------------------------------------------
// Lo que reclama al atleta (todo autocargado y silencioso si no hay nada)
// ---------------------------------------------------------------------------

export type Reclamo =
  /** Batería de calibración del coach: «1 de 4». Un CONTADOR se pinta también en cero (§6.2 bis). */
  | { clave: 'tests'; hechos: number; total: number }
  /** Revisión 1:1 recurrente: el coach propone hueco, o ya está reservada. */
  | { clave: 'revision'; estado: 'propuesta' | 'reservada'; cuando: string | null }
  /** Su pareja de dobles está entrenando ahora: «únete en vivo». */
  | { clave: 'pareja-en-vivo'; nombre: string }
  /** Un entreno guardado para luego (pausado, en disco). */
  | { clave: 'a-medias'; titulo: string; desde: string };

/** Una marca reciente como prueba (5 km · prueba). Una sola, la que tenga. */
export interface MarcaReciente {
  titulo: string;
  valor: string;
  /** «−1:02 desde la primera». Null con una sola prueba: no hay tendencia que afirmar. */
  delta: { texto: string; mejora: boolean } | null;
}

export type Pasos =
  | { tipo: 'cifra'; valor: string }
  /** Salud no está conectada: la salida es conectarla (Perfil). */
  | { tipo: 'conectar' }
  /** Salud conectada y sin muestras de hoy: no es un cero medido, se dice. */
  | { tipo: 'sin-datos' };

// ---------------------------------------------------------------------------
// La lectura entera de la portada
// ---------------------------------------------------------------------------

export interface LecturaHoy {
  /** Primer nombre. Null → saludo de la hora («Buenos días»). */
  nombre: string | null;
  /** «Martes 29 sep». Fecha larga capitalizada. */
  fecha: string;
  /** Hora local en la que se ve la portada, «7:40». Solo la usa el saludo de la hora. */
  hora: string;
  /**
   * Con coach o sin él. SIN coach (tier libre): no hay plan, ni chat, ni
   * comunicados, ni revisión, ni batería de tests; el sujeto natural es montar
   * un entreno. Ninguna pieza de coach se pinta, ni siquiera vacía.
   */
  conCoach: boolean;
  /** Nombre del coach (dato), para «tu entrenador ha…». Null sin coach. */
  coach: string | null;
  /** Iniciales del avatar. */
  iniciales: string;
  /** Sin leer en el chat (globito). 0 = sin globito. */
  noLeidosChat: number;
  /** Comunicados del coach que reclaman (globito de la bandeja «Del coach»). */
  comunicados: number;
  /** El check-in matinal de hoy sigue por hacer. */
  checkinPendiente: boolean;

  /**
   * Arranque en frío: todavía no ha contestado nada y no hay caché. Cada pieza
   * que depende de datos se pinta como esqueleto (`redacted`), NUNCA como un
   * vacío ni con una invitación: aún no sabemos cuál de las dos toca. Los
   * campos de abajo llevan valores de relleno que la pantalla no debe leer.
   */
  cargando: boolean;

  disposicion: Disposicion;
  /** Null = no aplica (sin coach: no hay plan ni carrera de plan). */
  camino: CaminoEstado | null;
  /** Null = no aplica (sin coach). */
  simulacion: Simulacion | null;
  /** Null = no aplica (sin coach: no hay plan de hoy; el sujeto natural es montar un entreno). */
  hoy: EntrenoHoy | null;
  reclamos: Reclamo[];
  marca: MarcaReciente | null;
  pasos: Pasos;
}

/** Un escenario del doble = un caso con su título y lo que hay que mirar. */
export interface CasoHoy {
  id: string;
  titulo: string;
  /** Qué simula y qué hay que mirar (va tal cual al selector de escenarios del doble). */
  mira: string;
  lectura: LecturaHoy;
}
