// EL CONTRATO DE «PERFIL» — lo que la pestaña del atleta recibe, y solo eso.
//
// Es el espejo, campo a campo, de lo que `ProfileView.swift` lee hoy:
//   · la identidad (`AthleteIdentity`, MeService.swift): nombre, foto, fecha de
//     nacimiento → edad, años entrenando, altura, peso, FC máx, objetivo, días,
//     y las zonas de pulso que viajan DENTRO de ella (`hrZones`);
//   · la división (`AthleteNextRace.divisionLabel(objetivoRace.division)`), que
//     sale de la carrera objetivo, no del perfil;
//   · las cinco fuentes de Rendimiento (`RendimientoSection.swift`): batería de
//     tests, marcas, VO₂ máx, zonas y 1RM, cada una con su «ya contestó»;
//   · el store: suscripción, pareja de Dobles, nombre del coach;
//   · lo que el propio móvil sabe: Apple Salud conectado, el permiso del
//     movimiento del reloj, la versión;
//   · los proveedores de reloj (`WearablesService`) y su pregunta pendiente de
//     COROS («¿esto es el entreno?»).
//
// Una pantalla PINTA, no decide: todo lo que se decide vive en `decision.ts`
// (puro, con test). Un modelo, un pintor (`perfil-rehecho`).
//
// ── LÍMITES YA DECIDIDOS (docs/DECISIONS.md) que esta pestaña respeta ─────────
//  · 28-jul (Rendimiento): un CONTADOR se pinta también en cero; un VALOR MEDIDO
//    no existe hasta que se mide. Sin ancla de pulso NO hay zonas y no se
//    inventa ninguna; un umbral estimado dice SIEMPRE de dónde sale.
//  · 25-sep (Privacidad): puerta nueva; el movimiento del reloj se retira en un
//    toque, sin «¿seguro?».
//  · 29-sep: el PROGRESO vive en Analíticas. Aquí Rendimiento son las cifras de
//    identidad (1RM, VO₂ máx, zonas, marcas, tests), no gráficas.
//  · SIN COACH (tier libre): cero suscripción, tests, zonas ni metodología.
//  · Las pantallas que cuelgan (Identidad, Entreno, Dispositivos, Cuenta,
//    Privacidad, Ayuda y legal) NO se rehacen aquí: solo su puerta.
//  · HARD RULE Nº0: el catálogo de marcas y los tests son del coach; el nombre
//    del coach es un dato. Nada de esto está cableado en la vista.

// ---------------------------------------------------------------------------
// Lo que una fuente puede decir
// ---------------------------------------------------------------------------

/**
 * Una fuente de datos que se pide por separado. Son TRES estados, no dos, y toda
 * la honestidad de Rendimiento vive en no confundirlos:
 *  · `cargando`      aún no ha contestado (ni cifra ni invitación: no se sabe cuál toca);
 *  · `contesto`      contestó, con lo que sea, incluido «no hay nada» (`valor` null o vacío);
 *  · `sin-respuesta` FALLÓ. Hoy Swift lo deja en `cargando` para siempre (el
 *    esqueleto no se va nunca); aquí se declara, con su salida. Ver decisiones
 *    en `casos.ts` (caso ⑭) y el informe.
 */
export type Fuente<V> = { tipo: 'cargando' } | { tipo: 'sin-respuesta' } | { tipo: 'contesto'; valor: V };

// ---------------------------------------------------------------------------
// Identidad (AthleteIdentity + la división de su carrera objetivo)
// ---------------------------------------------------------------------------

/** `AthleteNextRace.divisionLabel`: open · pro · elite. Viene de la carrera, no del perfil. */
export type Division = 'Open' | 'Pro' | 'Elite';

/** `GoalTypeOption` (ProfileView/ProfileShared). El texto lo pone `ETIQUETA_OBJETIVO`. */
export type Objetivo = 'first_hyrox' | 'improve_hyrox_mark' | 'improve_running' | 'complete_fun' | 'other';

export const ETIQUETA_OBJETIVO: Record<Objetivo, string> = {
  first_hyrox: 'Mi primer HYROX',
  improve_hyrox_mark: 'Mejorar mi marca de HYROX',
  improve_running: 'Mejorar mi carrera',
  complete_fun: 'Completar y disfrutar',
  other: 'Otro',
};

export interface Identidad {
  /** `fullName`. Cadena vacía = todavía sin nombre (`@DefaultEmptyString`): silueta, no iniciales vacías. */
  nombre: string;
  /** Hay foto de perfil (`avatarURLResuelta != nil`). */
  foto: boolean;
  division: Division | null;
  /** Años cumplidos derivados de `dob`. Null = sin fecha de nacimiento (nunca se adivina). */
  edad: number | null;
  /** `trainingExperienceYears`, en años enteros; null si no hay o es 0. */
  anosEntrenando: number | null;
  alturaCm: number | null;
  pesoKg: number | null;
  /** FC máxima declarada (`maxHrBpm`). Entrada de una estimación de zonas, no un ancla. */
  fcMax: number | null;
  objetivo: Objetivo | null;
}

// ---------------------------------------------------------------------------
// Rendimiento: las cinco fuentes
// ---------------------------------------------------------------------------

/** `BatteryStatus` (TestBatteryService): la batería de calibración que programa el coach. */
export interface Bateria {
  /** Programados. 0 = el coach aún no la programó (jamás se pinta «0 de 0»). */
  total: number;
  /** Con resultado CAPTURADO (no basta con que la sesión se haya hecho). */
  completados: number;
  /** Hechos pero sin su número: `resultPending`. */
  aMedias: number;
}

/** `MarkView` agregado: cuántas pruebas del catálogo del coach tienen ya un récord. */
export interface Marcas {
  conRecord: number;
  /** Tamaño del catálogo (0 = aún no hay marcas que probar). */
  catalogo: number;
}

/** `AthleteVo2Max.headline`. `reloj` = lo estima el reloj; `cooper` = test de campo de 12 min. */
export interface Vo2 {
  valor: number;
  fuente: 'reloj' | 'cooper';
}

/**
 * `HRZoneProfile`: la ancla de pulso resuelta por el SERVIDOR. `origen` es la
 * explicación que escribe para el atleta («Estimado por tu edad»), y va SIEMPRE:
 * un umbral inferido que se lee como medido es cómo un número que nadie midió
 * se convierte en evidencia. (Swift trae además `confidence`: medido, declarado o
 * estimado; aquí no hace falta, porque lo que se pinta es siempre el texto del
 * servidor, no una etiqueta propia.)
 */
export interface ZonasFC {
  umbralPpm: number;
  origen: string;
}

/** `StrengthMaxProfile`: un 1RM vigente. */
export interface Levantamiento {
  etiqueta: string;
  kg: number;
}

export interface FuentesRendimiento {
  /** Null (o total 0) = sin batería programada. Solo se pide con coach. */
  bateria: Fuente<Bateria | null>;
  marcas: Fuente<Marcas>;
  /** Null = nadie lo ha medido. */
  vo2: Fuente<Vo2 | null>;
  /** Viaja con la identidad: `cargando` hasta que llega; `sin-respuesta` si la identidad falló. Null = sin ancla. */
  zonas: Fuente<ZonasFC | null>;
  /** Vacío = sin 1RM registrado. Viene de la porción `strengthMaxes` del store. */
  fuerza: Fuente<Levantamiento[]>;
}

export type ClaveFila = 'tests' | 'marcas' | 'vo2' | 'zonas' | 'fuerza';

/** `EstadoDelDato` (Theme/ScreenScaffold.swift) + el que le faltaba: la fuente que no contestó. */
export type EstadoFila =
  | { tipo: 'cargando' }
  | { tipo: 'sin-respuesta' }
  | {
      tipo: 'valor';
      cifra: string;
      /** Unidad o resto del contador («kg», «de 4»). */
      sufijo: string | null;
      /** De dónde sale: lo que convierte un número en un dato. */
      pie: string | null;
      /** Solo en contadores: n de m, para la regleta. */
      avance: { n: number; m: number } | null;
    }
  | {
      tipo: 'vacio';
      /** Qué ACTO lo llena (no qué hay dentro de la puerta). */
      invitacion: string;
      /** El verbo de la salida cuando el atleta PUEDE llenarlo; null cuando no (lo programa el coach). */
      salida: string | null;
    };

export interface Fila {
  clave: ClaveFila;
  etiqueta: string;
  estado: EstadoFila;
  /** Tiene ALGO del atleta ahí. Un contador en cero NO es un logro (`FilaRendimiento.logrado`). */
  logrado: boolean;
  /** La batería está programada y sin cerrar: la única fila que pide un acto. */
  pideActo: boolean;
}

// ---------------------------------------------------------------------------
// Puertas: lo que el store y el móvil saben de cada una
// ---------------------------------------------------------------------------

/**
 * `SubscriptionInfo` (SubscriptionService.swift), ya en el vocabulario de la
 * pantalla. Solo con coach: sin coach no hay suscripción (nada que pagar).
 * Fechas ya formateadas («12 oct», `FechaES.corta`). La puerta solo dice lo que es
 * NOTICIA: una suscripción al día no cuenta su renovación aquí (eso vive dentro).
 */
export type Suscripcion =
  | { tipo: 'activa' }
  | { tipo: 'termina'; el: string }
  | { tipo: 'prueba'; hasta: string | null }
  | { tipo: 'pago-pendiente' }
  | { tipo: 'cancelada' }
  | { tipo: 'pausada' };

/**
 * La pareja de Dobles (`PartnerEnvelope`). Null en la lectura = individual.
 *  · `con-pareja`  emparejados: `PartnerInfo.firstName`;
 *  · `sin-pareja`  Dobles y nadie invitado aún;
 *  · `invitacion`  hay una invitación enviada (`SentInvitation`): pendiente,
 *                  caducada o rechazada. Solo las dos últimas son un ACTO.
 */
export type Pareja =
  | { tipo: 'con-pareja'; nombre: string }
  | { tipo: 'sin-pareja' }
  | { tipo: 'invitacion'; estado: 'pendiente' | 'caducada' | 'rechazada'; email: string; caduca: string | null };

/** Lo que puede estar conectado (`HealthKitConnection`, `AppleWatchWorkoutScheduler`, `WearablesService`). */
export type Dispositivo = 'salud' | 'watch' | 'polar' | 'coros';

export const NOMBRE_DISPOSITIVO: Record<Dispositivo, string> = {
  salud: 'Apple Salud',
  watch: 'Apple Watch',
  polar: 'Polar',
  coros: 'COROS',
};

/**
 * El permiso del movimiento del reloj (`SensorCaptureConsent`, 25-sep):
 *  · `sin-preguntar` aún no ha entrenado con el reloj: la hoja no ha salido;
 *  · `permitido`     dijo que sí;
 *  · `retirado`      «Ahora no» o apagó el interruptor. No es un fallo: es una decisión.
 */
export type MovimientoReloj = 'sin-preguntar' | 'permitido' | 'retirado';

/** `WearablePendingLink` de COROS: una actividad nueva que puede ser el entreno previsto de hoy. */
export interface PreguntaCoros {
  /** Hora de inicio de la actividad («7:12»), si el proveedor la trae. */
  inicio: string | null;
}

/**
 * Lo que dijo la sincronización de COROS al abrir Perfil (`refreshCorosBackground`):
 * «Importados 2 entrenos de COROS.» o por qué no pudo. El TEXTO ya viene escrito
 * (`WearablesService.corosSyncResultMessage` / `corosSyncErrorMessage`), y si hay
 * que avisar o no lo decide Swift (`shouldAlert`): aquí solo se pinta. Hoy es una
 * alerta que hay que descartar; en el doble, un aviso sobre las pestañas.
 * Excluyente con la pregunta pendiente: si la hay, Swift la hace y no avisa.
 */
export interface AvisoCoros {
  tono: 'ok' | 'fallo';
  texto: string;
}

// ---------------------------------------------------------------------------
// La lectura entera de la pestaña
// ---------------------------------------------------------------------------

export interface LecturaPerfil {
  /**
   * Arranque en frío: la identidad aún no ha contestado y no hay caché. Cada pieza
   * que depende de datos se pinta como esqueleto, NUNCA como un vacío ni con una
   * invitación (aún no sabemos cuál de las dos toca). Los campos de abajo llevan
   * valores de relleno que la pantalla no debe leer.
   */
  cargando: boolean;
  /**
   * La identidad no cargó y no hay caché (`Slice.loadFailed`, AUDIT-B5). Hoy Swift
   * enseña «Tu perfil» con silueta y nada más: aquí se declara con su salida.
   */
  errorCarga: boolean;

  /** Con coach o sin él (`hasCoach`). Sin coach: sin suscripción, tests, zonas ni metodología. */
  conCoach: boolean;
  /** `planWeek.coachName`. Null sin coach o si el nombre no llegó. */
  coach: string | null;

  identidad: Identidad;
  rendimiento: FuentesRendimiento;

  /** Null = sin coach (no aplica) o aún no leída. */
  suscripcion: Suscripcion | null;
  /** Null = individual (o aún no leída). */
  dobles: Pareja | null;

  dispositivos: Dispositivo[];
  movimientoReloj: MovimientoReloj;
  corosPendiente: PreguntaCoros | null;
  corosAviso: AvisoCoros | null;

  /** `AppBundleMetadata.displayVersion`. Siete toques abren el diagnóstico del reloj (no es producto). */
  version: string | null;
}

/** Un escenario del doble = un caso con su título y lo que hay que mirar. */
export interface CasoPerfil {
  id: string;
  titulo: string;
  /** Qué simula y qué hay que mirar (va tal cual al selector de escenarios del doble). */
  mira: string;
  lectura: LecturaPerfil;
}
