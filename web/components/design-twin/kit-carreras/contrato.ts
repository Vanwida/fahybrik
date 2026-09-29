// EL CONTRATO DE «CARRERAS» — lo que la pestaña recibe, y solo eso.
//
// Es el espejo, campo a campo, de lo que `CarrerasView.swift` lee hoy del
// `AppDataStore` (`racesHub` = próximas + pasadas, `raceOverview` = el análisis
// de la última carrera individual) más el «predicho hoy» del objetivo principal
// (`GET /api/athlete/goal-gap`, y `/dobles/race-gap` si es de dobles), que hoy
// solo lee el detalle y aquí sube a la pestaña (es la única lectura nueva).
// Nada de lo de aquí se calcula en la pantalla: una pestaña PINTA, no decide
// (el mismo principio que `kit-hoy/contrato` y `kit-analiticas/contrato`).
//
// ── LÍMITES YA DECIDIDOS (docs/DECISIONS.md), que esta pestaña respeta ────────
//  · 29-sep · Analíticas: el volumen, el ritmo y las tendencias del ENTRENO
//    viven allí. Aquí solo hay carreras: objetivos futuros y resultados.
//  · 27-jul · «Ningún hueco se cobra al objetivo»: mientras falte un tramo, el
//    total del predicho es NULO y los tramos sin dato se NOMBRAN. Nunca una
//    cifra a medias (`Prediccion.parcial`).
//  · 23-sep · Un solo «hoy» (el del atleta) para que una carrera nunca caiga
//    entre «próximas» y «pasadas»: llega resuelto en `hoy` y en `diasHasta`.
//  · Una carrera objetivo por sí sola no arranca ni cambia el plan: fijar una
//    nueva pasa la actual a secundaria (invariante de un solo principal, en el
//    servidor); la pantalla lo dice ANTES de fijar.
//  · HARD RULE Nº0: lo que otro entrenador haría distinto es dato con defecto;
//    aquí lo único que lo es (los días que una carrera recién corrida sigue
//    pidiendo su resultado) vive en `decide.ts` con su nombre y su porqué.
//
// ── DECISIONES DE MODELO (de romperlo contra 20 casos, ver casos.ts) ──────────
//  · La «última carrera» y la «evolución» ya NO salen de `overview.history`: esa
//    lista llega con la forma de `RaceHistoryItem` y la app la decodifica como
//    `RaceResultSummary`, así que cada fila falla y la lista queda vacía. Por eso
//    hoy la evolución no aparece nunca. Ambas salen del `past` del hub (que ya
//    lleva puesto, campo, vueltas y estaciones): una sola fuente. Y con ella se
//    retira `LegacyHistorySection`, que nunca se pintaba.
//  · Los tiempos viajan en SEGUNDOS. Hoy el servidor manda pre-formateados
//    `run_time`, `stations_time`, `roxzone_time`, `time`, `delta` y `pace`
//    (H:MM:SS y «+0:42»): con eso no hay una escala única para el atleta ni
//    analítica posible. El puerto decodifica segundos (o parsea el texto una vez).
//  · Las dos notas en prosa del servidor (`station_comparison_note`,
//    `pace_drop_note`) son estructura disfrazada de frase: la primera es «no hay
//    ni un puesto por estación» (se deduce de la lista) y la segunda «+18 s/km en
//    la segunda mitad» (`caidaRitmoS`). La frase la escribe la vista.
//  · `tune_up` se dice «Puesta a punto»: nada en inglés de cara al atleta.

/** `BenchmarkBarRow.Severity` en cable: better | slightly_worse | worse. */
export type Severidad = 'better' | 'slightly_worse' | 'worse';

// ---------------------------------------------------------------------------
// Vocabulario del servidor (tokens de cable, no texto)
// ---------------------------------------------------------------------------

/** `priority`. Ausente = `target` (una fila antigua sin prioridad cuenta como principal). */
export type Prioridad = 'target' | 'secondary' | 'tune_up';
export type Formato = 'singles' | 'doubles' | 'relay';
export type Division = 'open' | 'pro' | 'elite';
export type Categoria = 'men' | 'women' | 'mixed';
/** `event_type`. Solo `hyrox` tiene predicho tramo a tramo (`supportsHyroxGoalGap`). */
export type TipoEvento = 'hyrox' | 'deka' | 'other';

/** Cada pieza de datos es independiente: el hub y el análisis son dos rebanadas del store. */
export type EstadoCarga = 'fria' | 'lista' | 'error';

// ---------------------------------------------------------------------------
// PRÓXIMAS — `racesHub.upcoming` (UpcomingRace)
// ---------------------------------------------------------------------------

export interface ProximaCarrera {
  /** `races.id`. Es la clave de todo: quitar, hacer principal, la foto, el chat. */
  raceId: number;
  nombre: string;
  tipoEvento: TipoEvento;
  /** Solo cuentan para `tipoEvento` hyrox o deka: en el resto el servidor pone los defectos (individual, open, hombres). */
  formato: Formato;
  division: Division;
  categoria: Categoria;
  /** ISO YYYY-MM-DD. Null = «fecha por confirmar». */
  fecha: string | null;
  lugar: string | null;
  /** Meta en segundos. Null = sin tiempo objetivo. */
  metaS: number | null;
  /** Días que faltan desde `hoy` (0 = hoy es la carrera). Null si no hay fecha. */
  diasHasta: number | null;
  /** Null = principal (`AthleteNextRace.priority` ausente). */
  prioridad: Prioridad | null;
}

/**
 * El «predicho hoy» del objetivo principal. Lo lee `GoalGap` (individual) o
 * `DoblesRaceGap` (pareja) y aquí llega ya reducido a lo que la pestaña pinta.
 * Sea cual sea el motivo de que no haya cifra, se DECLARA (ley del dato, §7).
 */
export type Prediccion =
  /** Todavía pidiéndolo (esqueleto con la forma final). */
  | { tipo: 'cargando' }
  /** La lectura falló: se dice y se reintenta. */
  | { tipo: 'error' }
  /** No hay predicho que dar: sin objetivo principal, o una carrera que no es HYROX. */
  | { tipo: 'no-aplica' }
  /** `no_goal`: sin tiempo objetivo no hay contra qué medir. Salida: fijarlo. */
  | { tipo: 'sin-meta' }
  /** Dobles sin pareja conectada (`no_pair`). Salida: conectarla. */
  | { tipo: 'sin-pareja' }
  /** `no_data`: nada medido todavía. Se llena solo al entrenar. */
  | { tipo: 'sin-datos'; pareja?: string }
  /**
   * `ok` con `predictedTotalS` nulo: hay tramos medidos y faltan otros. SIN cifra,
   * con los tramos que faltan por su nombre.
   */
  | { tipo: 'parcial'; medidos: number; de: number; faltan: string[]; pareja?: string }
  /** El predicho completo. `huecoS` = predicho − objetivo (negativo = por delante). Null si el servidor no lo manda. */
  | { tipo: 'cifra'; totalS: number; huecoS: number | null; pareja?: string };

// ---------------------------------------------------------------------------
// PASADAS — `racesHub.past` (ImportedRace)
// ---------------------------------------------------------------------------

export interface CompaneroDeEquipo {
  posicion: number;
  nombre: string;
}

export interface ParcialEstacion {
  /** Índice canónico HYROX (2, 4, … 16). */
  indice: number;
  segundos: number | null;
}

export interface CarreraPasada {
  raceId: number;
  nombre: string;
  /** Null = «fecha por confirmar». */
  fecha: string | null;
  tipoEvento: TipoEvento;
  formato: Formato;
  division: Division;
  /** Null = todavía sin resultado importado («resultado pendiente»). Un objetivo vencido cae aquí. */
  resultadoS: number | null;
  correrS: number | null;
  roxzoneS: number | null;
  /** Hasta 8 vueltas de 1 km; una que la importación no trajo es null (no ocupa celda). */
  vueltas: Array<number | null>;
  estaciones: ParcialEstacion[];
  /** Equipo en dobles y relevos (vacío en individual). Con equipo, todo parcial es DEL EQUIPO. */
  companeros: CompaneroDeEquipo[];
  /** Puesto general y tamaño del campo (`overall_rank`, `field_size`). Null si no se sabe. */
  puesto: number | null;
  campo: number | null;
}

// ---------------------------------------------------------------------------
// ANÁLISIS — `raceOverview` (CarrerasOverview). Solo de carreras INDIVIDUALES:
// el tiempo de una estación de dobles es del equipo, no del atleta.
// ---------------------------------------------------------------------------

export interface EstacionVsReferencia {
  /** Nombre canónico de la estación (`HyroxStation.labels`). */
  estacion: string;
  tiempoS: number | null;
  /** Carrera − tu nivel de entreno (positivo = más lento que entrenando). Null sin entreno con el que comparar. */
  deltaS: number | null;
  /** 0…1 según tu puesto entre el campo (más corta = mejor puesto). Null sin puesto: sin barra ni veredicto. */
  fraccion: number | null;
  severidad: Severidad | null;
}

export interface VueltaRitmo {
  km: number;
  ritmoS: number | null;
  /** 0…1 respecto a la vuelta más lenta (más alta = más lenta). */
  altura: number;
  severidad: Severidad;
}

/** `RaceIAReport`. El servidor hoy lo manda siempre nulo; la vista lo pinta si llega. */
export interface InformeIA {
  resumen: string;
  grupos: string[];
}

/** `PredictionReview`, solo lo que enseña la puerta. El detalle completo no se rehace aquí. */
export interface PredichoVsReal {
  predijimosS: number | null;
  hicisteS: number | null;
  /** 0-100, más alto = más cerca. */
  precisionPct: number | null;
  /** La palabra del servidor («clavado», «muy afinado», «afinando», «aún lejos»). */
  precisionPalabra: string | null;
}

export interface AnalisisCarrera {
  /** La carrera individual de la que salen estos bloques (la última con resultado). */
  deCarrera: { raceId: number; nombre: string; fecha: string | null };
  estaciones: EstacionVsReferencia[];
  /** Segundos por km que se pierde en la segunda mitad. Null = no hay caída que decir. */
  caidaRitmoS: number | null;
  ritmoPorKm: VueltaRitmo[];
  informe: InformeIA | null;
  predichoVsReal: PredichoVsReal | null;
}

// ---------------------------------------------------------------------------
// La lectura entera de la pestaña
// ---------------------------------------------------------------------------

export interface LecturaCarreras {
  /** El «hoy» del atleta, ISO YYYY-MM-DD. Toda cuenta atrás y toda ventana se miden desde aquí. */
  hoy: string;
  /**
   * Con coach o sin él (tier libre). Sin coach: no hay chat ni «Preguntar al
   * coach» en el menú de la carrera ni informe de la IA del método. Nada más
   * cambia: las carreras y su predicho son del atleta.
   */
  conCoach: boolean;
  /** Sin leer en el chat (globito). 0 = sin globito. */
  noLeidosChat: number;
  carga: { hub: EstadoCarga; analisis: EstadoCarga };

  /** `racesHub.upcoming`, la más próxima primero (el orden lo pone `ordenarProximas`, no se fía del cable). */
  proximas: ProximaCarrera[];
  /** `racesHub.past`, la más reciente primero. */
  pasadas: CarreraPasada[];
  /** Del objetivo principal; `no-aplica` si no lo hay. */
  prediccion: Prediccion;
  /** Null = ninguna carrera individual con resultado todavía. */
  analisis: AnalisisCarrera | null;
}

// ---------------------------------------------------------------------------
// Los datos de las dos hojas de entrada (se piden DENTRO de la hoja, no del hub)
// ---------------------------------------------------------------------------

export type FamiliaObjetivo = 'running' | 'hybrid' | 'crossfit' | 'ocr' | 'other';

/** Una carrera del calendario (`RaceCalendarEvent`). */
export interface EventoCalendario {
  id: string;
  nombre: string;
  familia: FamiliaObjetivo;
  /** «HYROX», «DEKA»… ya en texto de cara al atleta. */
  serie: string | null;
  pais: string | null;
  ciudad: string | null;
  fecha: string | null;
  /** Fecha sin confirmar por el organizador. */
  provisional: boolean;
  tipoEvento: TipoEvento;
}

/** Un perfil de la búsqueda por nombre (`HyresultCandidate`). */
export interface CandidatoHyresult {
  id: string;
  nombre: string;
  slug: string;
  nCarreras: number;
  /** ISO-3 (ESP). */
  pais: string | null;
  nivel: 'PRO' | 'ELITE' | null;
}

/** Un caso de ejemplo = una lectura con su título y lo que hay que mirar. */
export interface CasoCarreras {
  id: string;
  titulo: string;
  /** Qué simula y qué hay que mirar (va tal cual al selector de escenarios del doble). */
  mira: string;
  lectura: LecturaCarreras;
  /** Solo del doble: una hoja abierta al entrar, para ver los estados que no se alcanzan con un toque. */
  abre?: 'importando' | 'no-soy-yo';
  /** Solo del doble: las acciones (quitar, hacer principal, deshacer, fijar) fallan, para ver su error. */
  fallaAcciones?: boolean;
}
