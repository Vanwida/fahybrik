import Foundation

// Wire contract for MIRROR MODE — the 90% session: the athlete drives the workout
// from the iPhone (full UI: sets, loads, captura) while the watch RECORDS it
// (HKWorkoutSession → live HR, kcal, one HKWorkout) and shows a glanceable HUD in
// step. One engine only — the phone's; the wrist renders frames, it never runs a
// second engine that could drift.
//
// Transport: the HealthKit mirrored-session app-data channel
// (sendToRemoteWorkoutSession / didReceiveDataFromRemoteWorkoutSession), NOT
// WatchConnectivity — the system launches the watch app, keeps the session alive
// and carries these bytes both ways while the workout runs.
//
// Every message travels as a MirrorEnvelope so one decode dispatches by type.
// Coders are PLAIN JSON (same rationale as WatchWire: snake_case conversion is
// not a clean inverse for digit-boundary keys — do not change without a
// roundtrip re-verification).
//
// This file compiles into BOTH targets (see ios/project.yml) — it is the single
// source of truth for the protocol. Version the envelope type strings (v1 has
// none) rather than mutating field semantics.

enum MirrorWire {
    static let encoder = JSONEncoder()
    static let decoder = JSONDecoder()

    /// Envelope type strings — the protocol's full vocabulary.
    enum MessageType {
        /// Phone → watch: one frame of live engine state (see MirrorStateFrame).
        static let frame = "frame"
        /// Phone → watch: the session is over — finish (save) or discard.
        static let end = "end"
        /// Phone → watch: a workout-cue haptic (tick / go / stop / finish). The
        /// engine lives on the phone in mirror mode, so without this the wrist
        /// never feels the 3-2-1, GO or rest end. ADDITIVE: an older watch ignores
        /// the type and keeps running.
        static let haptic = "haptic"
        /// Watch → phone: a live heart-rate sample from the wrist sensor.
        static let hr = "hr"
        /// Watch → phone: a control tap relayed to the phone's engine.
        static let command = "command"
        /// Watch → phone: recording closed; carries the HKWorkout UUID (nil on
        /// discard) so the phone stamps source_workout_ref on the execution.
        static let ended = "ended"
        /// Watch → phone: live sensor conclusions (fase 1–3). Bytes only — never
        /// the raw stream. Older phones ignore the type and keep running.
        static let sensor = "sensor"
    }

    /// `MirrorHaptic.cue` values — keep the string small and stable.
    enum HapticCue {
        static let tick = "tick"
        static let go = "go"
        static let stop = "stop"
        static let finish = "finish"
        /// The work window rolled AND the movement changed — "cambia de máquina".
        /// Its own cue and not a `go` because in a multi-station EMOM (remo → ski →
        /// cinta) it is the single cue the athlete acts on: `go` says "empieza",
        /// this says "empieza OTRA COSA". An older wrist build that doesn't know
        /// the name falls back to a firm start (see `playEngineCue`), never silence.
        static let change = "change"
    }

    /// Wrist control vocabulary (MirrorCommand.kind).
    enum CommandKind {
        /// The big button: Empezar on a block gate, otherwise one primary advance.
        static let advance = "advance"
        static let pause = "pause"
        static let resume = "resume"
        /// El watch PIDE el frame actual. Existe porque los timers del iPhone
        /// mueren en background: si la muñeca se perdió el primer frame (app del
        /// watch arrancando en frío), sin esto se quedaba en 0:00 hasta que el
        /// iPhone volvía a foreground (IMG_2387). Un dato entrante por la sesión
        /// espejo SÍ despierta al teléfono; el timer, no.
        static let sync = "sync"
        /// EL RELOJ DE PARED: declarar que no llegaste a las repeticiones del
        /// minuto en un death by. No es el `advance` genérico a propósito — ese
        /// dispara `deathByLogged` (el camino de ÉXITO, el minuto cumplido, que
        /// el motor ya avanza solo). Confundir los dos marcaría como superado el
        /// minuto en el que el atleta acaba de fallar.
        static let deathByFail = "deathByFail"
    }

    /// Frame phases (MirrorStateFrame.phase). ADDITIVE: a new phase is a new VALUE in
    /// the existing `phase` string, never a new field — an older decoder that doesn't
    /// know it just renders its default (active) branch, so no wire re-version needed.
    enum Phase {
        static let gate = "gate"          // parked on a block preview (Empezar)
        static let countIn = "countIn"    // structured-run 3-2-1 pre-roll (Prepárate)
        static let active = "active"
        static let paused = "paused"
        static let finished = "finished"
    }
}

/// One decode point for every mirror message; `type` is a MirrorWire.MessageType
/// and `body` the encoded payload struct for that type (empty Data when the type
/// carries nothing).
struct MirrorEnvelope: Codable {
    let type: String
    let body: Data
}

/// Phone → watch: a compact snapshot of what the engine is doing, built from the
/// SAME accessors the live HUDs read. All content fields are optional — the wrist
/// renders what's present and never fabricates. The watch ticks elapsed locally
/// between frames while `phase == active`; a frame re-bases it.
struct MirrorStateFrame: Codable, Equatable {
    /// MirrorWire.Phase — drives the wrist layout AND the HK session pause state
    /// (paused frames pause the recording, active frames resume it).
    let phase: String
    /// Block header, e.g. "CALENTAMIENTO", "BLOQUE 2 · EMOM 12'".
    let blockTitle: String?
    /// Current work line, e.g. "Run 800m", "Back squat".
    let lineTitle: String?
    /// Human target line, e.g. "Z2 · 4:45 /km", "4×8 @ 60 kg".
    let detailLine: String?
    /// Progress within the format, e.g. "RONDA 3/5", "SERIE 2/4".
    let progressText: String?
    /// Whole-session clock, seconds.
    let sessionElapsed: Double
    /// Current lap/segment clock, seconds.
    let lapElapsed: Double
    /// Format countdown when the phone shows one (AMRAP/steady remaining, a structured
    /// TIME tramo's remaining, or the 3-2-1 pre-roll while phase == countIn), seconds.
    let countdownRemaining: Double?
    /// Target HR zone 1...5 → wrist zone bar + out-of-zone haptic (local HR).
    let targetZone: Int?
    /// True when the wrist's advance would FINISH the whole session (last segment /
    /// last block). The watch then shows "Terminar" + a confirmation instead of
    /// "Siguiente ▸" — a workout must never end from one accidental tap (IMG_2385).
    /// Optional so an older counterpart decodes frames without it. `var` with a
    /// default, like every other additive field here — as a defaulted-less `let` it
    /// broke every existing `MirrorStateFrame(...)` construction, and with it the
    /// whole iOS test target.
    var isFinalStep: Bool? = nil
    /// Rest overlay countdown, seconds. Present ⇒ the wrist shows the rest banner.
    let restRemaining: Double?
    /// #56 — the current HYROX dobles station's TURN (whose station + the rep reparto),
    /// or nil for individual work. Present ⇒ the wrist shows the turn hero and fires the
    /// double "entras tú" haptic when it flips from the partner's relay back to the
    /// athlete. OPTIONAL and ADDITIVE: an older watch simply ignores it (the existing
    /// lineTitle/detailLine still carry the relay for it); an older phone omits it → nil.
    /// `var` with a default so the existing `MirrorStateFrame(...)` construction (which
    /// doesn't pass it) and older encoded frames keep decoding.
    var dobles: MirrorDoblesTurn? = nil
    /// Live TREADMILL belt progress (indoor run): the meters covered THIS tramo and its
    /// distance objetivo, so the wrist FILLS a progress ring instead of showing a naked
    /// count-up — a DISTANCE leg has no countdown to tick, and the wrist can't derive
    /// belt distance locally (it doesn't know the belt speed). Set only when a belt is
    /// live on a continuous distance run; nil otherwise. `beltPaceSecPerKm` is the honest
    /// covered pace (sec/km). Zone reuses `targetZone` + the wrist's local HR. OPTIONAL +
    /// ADDITIVE (same pattern as `dobles`): an older watch ignores them, an older phone
    /// omits them → nil.
    var beltDistanceM: Double? = nil
    var beltTargetM: Double? = nil
    var beltPaceSecPerKm: Int? = nil
    /// Workout-cue haptic to play on the wrist (MirrorWire.HapticCue). Carried
    /// on the frame as a REDUNDANT path to the dedicated `haptic` message — if
    /// either packet lands, the athlete feels it. Seq must strictly increase so
    /// the same cue isn't re-played on a heartbeat resend. OPTIONAL + ADDITIVE.
    var hapticCue: String? = nil
    var hapticSeq: Int? = nil
    /// EL TRAMO — la ventana de trabajo activa, en DATO en vez de en frases.
    ///
    /// Por qué existe: hasta aquí el cable mandaba tres strings ya redactados por
    /// el móvil (`lineTitle` / `detailLine` / `progressText`) y la muñeca los
    /// pintaba tal cual. Con eso el reloj NO PUEDE saber qué formato corre — no hay
    /// un solo campo que lo diga — ni si el minuto en curso es trabajo o el cambio
    /// de un EMOM, ni cuál es la dosis de ESTA ronda. Y como el reloj corre en
    /// espejo la inmensa mayoría de las sesiones, eso convertía en genérico todo
    /// lo que se pintara en la muñeca, por bien diseñado que estuviera.
    ///
    /// Mandando el tramo, los MISMOS guiones (`Guiones/`) sirven las dos vías:
    /// en solitario leen el motor, en espejo leen esto. Una pantalla por formato,
    /// no dos. OPTIONAL + ADDITIVE como el resto: un reloj viejo lo ignora y
    /// sigue con las frases; un móvil viejo lo omite → nil y el reloj degrada.
    var tramo: MirrorTramo? = nil
    /// LA SERIE ABIERTA, para el contador de repeticiones de la muñeca.
    ///
    /// El reloj tiene la señal pero no el contexto: sin saber qué serie está
    /// abierta cuenta también mientras el atleta anda hacia la barra (y ocho pasos
    /// son ocho repeticiones para cualquier detector honesto). El motor ya lo sabe
    /// —`WorkoutSession.sensorWindow`— y en solitario el reloj lee ese mismo
    /// accesor, así que las dos vías usan UNA definición de «serie abierta».
    /// OPTIONAL + ADDITIVE: un reloj viejo lo ignora; un móvil viejo lo omite y la
    /// muñeca cae a deducirlo del tramo.
    var sensorWindow: MirrorSensorWindow? = nil
}

/// Phone → watch: LA VENTANA DE TRABAJO ACTIVA, en dato.
///
/// Es la proyección de `LiveTramo` + lo que el motor ya sabe derivar de ella
/// (quién la cierra, cuánto le queda, qué se lleva medido). Todo opcional menos
/// `enDescanso`: la muñeca pinta lo que hay y JAMÁS fabrica — un campo ausente
/// significa «nadie lo sabe», que es una respuesta, no un hueco.
struct MirrorTramo: Codable, Equatable {
    /// `PrescriptionScheme.rawValue`. Es el campo que hoy no existe y sin el cual
    /// la muñeca no puede elegir guion.
    let formato: String?
    /// `PrescriptionModality.rawValue` del tramo. El formato no basta para elegir
    /// guion: unas «series» de correr y unas de remo son el mismo `intervals` y
    /// distinta pantalla, porque el reloj mide una y no la otra.
    let modalidad: String?
    /// La tarea de AHORA: «SkiErg», «Back squat», «Run 3». No el título plegado
    /// del bloque, que es el mismo los doce minutos.
    let etiqueta: String?
    /// Su dosis, tal como la escribió el coach: «12 cal», «500 m», «5 reps».
    let dosis: String?
    /// La ronda / serie / tramo en curso sobre el total. Unificado por el motor
    /// (`tramoRoundIndex` / `tramoRoundTotal`), no por formato.
    let rondaN: Int?
    let rondaTotal: Int?
    /// Trabajo o descanso DENTRO del formato. Hoy el reloj recibe el descanso de
    /// un EMOM como un countdown cualquiera, sin marca: no puede teñirlo.
    let enDescanso: Bool
    /// QUIÉN CIERRA la ventana (`ErgCounterPolicy.Close`): `machineGoal`,
    /// `sessionClock`, `formatClock`, `athleteTap`. Decide el sujeto y decide si
    /// hay aro — sin ello la muñeca prometería una fracción que nadie sabe.
    let cierre: String?
    /// El objetivo del tramo y lo que se lleva hecho, en su unidad (metros o
    /// calorías). Nil si el tramo no va por medida de máquina.
    let objetivoMedida: Double?
    let hechoMedida: Double?
    /// La ventana de tiempo, cuando la cierra un reloj. `total` es lo que el aro
    /// necesita y hoy la muñeca se inventa (asume 60 s en un EMOM).
    let ventanaQueda: Double?
    let ventanaTotal: Double?
    /// Segundos DENTRO de esta ventana. No es `lapElapsed`, que cuenta desde que
    /// se abrió el tramo y en un 4×10 suma las cuatro series y sus tres descansos
    /// de corrido — la misma «vuelta» que no contestaba ninguna pregunta en el
    /// móvil (f4c7f0e9). La muñeca necesita el reloj de LA repetición.
    let enTramoS: Double?
    /// El ritmo medido de ESTE tramo (no la media del segmento) y el objetivo
    /// prescrito con su veredicto ya juzgado por el motor compartido, para que
    /// muñeca y teléfono no puedan discrepar.
    let ritmoSecPorKm: Int?
    let objetivoLabel: String?
    /// `TargetStatus`: `inTarget` | `tooFast` | `tooSlow` | `unknown`.
    let objetivoEstado: String?
    /// La zona que se está midiendo AHORA (1…5). La resuelve el móvil, que es
    /// quien tiene el perfil de umbrales: sin ella no hay tinte ni veredicto.
    let zonaViva: Int?
    /// Lo que viene después, ya redactado. Nil = no lo escribió nadie.
    let siguiente: String?
    /// Fuerza: la carga y las reps de la serie EN CURSO — no las de la primera,
    /// que es lo único que viajaba hasta ahora dentro de `detailLine`.
    let cargaKg: Double?
    let reps: Int?
    /// EMOM: ¿la ronda de AHORA es una máquina? — row/ski/bike, no burpees.
    /// Decide si el cuerpo puede mirar el reloj (`.ojeada`) o no (`.ciego`),
    /// independiente de si el móvil está de verdad reportando metros: antes de
    /// este campo, toda ronda de EMOM viajaba como `.ojeada` sin excepción.
    var tareaEsErgo: Bool = false
    /// La recuperación de una serie de correr que se hace EN MOVIMIENTO (el
    /// trote de vuelta). Va aparte de `enDescanso` —que sigue siendo cierto—
    /// porque lo que cambia no es la fase sino si hay algo que medir: con esto
    /// la muñeca pinta metros, ritmo y zona en vez de una cuenta atrás pelada, y
    /// deja de ofrecer controles a alguien que está corriendo.
    var recuperacionEnMovimiento: Bool = false
    /// LA FORMA de la parte que se está corriendo — un arco por tramo, en orden,
    /// diciendo si es trabajo o recuperación y cuánto pesa (ver `FormaDelAro`).
    /// Sin esto la muñeca sólo sabía CONTAR series de trabajo, así que el bisel
    /// dibujaba cinco trozos iguales y hacía desaparecer las recuperaciones: la
    /// mitad del entreno no existía en el aro. Nil fuera de una serie de correr.
    var forma: [MirrorArco]? = nil
    /// La posición del tramo en curso dentro de `forma`.
    var formaIndice: Int? = nil
    /// `RunPhaseRole` del tramo. Un calentamiento también es una pierna de
    /// trabajo: sin esto la muñeca lo llamaba «Serie 1 / 6».
    var parte: String? = nil
}

/// Un arco del bisel: un tramo de la parte que se corre, con su peso relativo.
/// Espejo en el cable de `ArcoDeTramo` — el reparto lo calcula el móvil con la
/// MISMA función que usa el reloj en solitario, para que las dos vías no puedan
/// dibujar aros distintos del mismo entreno.
struct MirrorArco: Codable, Equatable {
    let trabajo: Bool
    let peso: Double
}

/// Phone → watch: the current dobles station's turn, resolved for the reading athlete
/// (a wire projection of `DoblesTurn`). `role` is "mine" | "partner" | "split";
/// `selfReps`/`partnerReps` are nil for a time/distance station (never fabricated).
struct MirrorDoblesTurn: Codable, Equatable {
    let role: String
    let station: String
    let selfReps: Int?
    let partnerReps: Int?
    let partnerName: String?
    /// 0…100 self-share for the wrist's split legend.
    let selfSharePct: Int
}

/// Phone → watch: close the recording. `save` false = the athlete exited without
/// recording (phone discarded the run) → discard the builder, no HKWorkout.
struct MirrorEnd: Codable {
    let save: Bool
}

/// Phone → watch: fire a workout-cue haptic on the wrist NOW. Carries the
/// cue name (`MirrorWire.HapticCue`) + a monotonic seq so the wrist de-dupes.
struct MirrorHaptic: Codable, Equatable {
    let cue: String
    var seq: Int? = nil
}

/// Watch → phone: live HR off the wrist sensor. The phone injects it into the
/// engine (and stops its own sparse HealthKit HR reader while the wrist streams).
struct MirrorHRSample: Codable {
    let bpm: Int
}

/// Watch → phone: a wrist control tap (MirrorWire.CommandKind). The phone's
/// engine is the only mutator — the wrist never advances state locally.
struct MirrorCommand: Codable {
    let kind: String
}

/// Watch → phone: the recording is closed. `workoutUuid` is the finished
/// HKWorkout's UUID (nil when discarded or the save failed) — the phone carries
/// it as the execution's source_workout_ref so the later HealthKit ingest of the
/// same workout never double-counts.
struct MirrorEnded: Codable {
    let workoutUuid: String?
}

/// Phone → watch: qué serie está abierta ahora mismo. `key` identifica LA SERIE
/// (tramo + vuelta + movimiento): mientras no cambia, el contador sigue sumando en
/// la misma; en cuanto cambia, la anterior se cierra y el conteo vuelve a cero.
/// `key` nil = no hay trabajo abierto y no se cuenta nada.
struct MirrorSensorWindow: Codable, Equatable {
    let key: String?
    let modality: String?
    let name: String?
    let resting: Bool
}

/// Watch → phone: live conclusions from the wrist inertial pipeline (plan fases 1–3).
/// The raw signal never crosses the wire — only these few bytes per update.
struct MirrorSensorConclusions: Codable, Equatable {
    /// Work/rest timing for the open window (seconds).
    var sensorWorkS: Double? = nil
    var sensorRestS: Double? = nil
    var sensorTimingConfidence: Double? = nil
    /// Rep count from the sensor (nil = unknown / not countable).
    var reps: Int? = nil
    var repsConfidence: Double? = nil
    /// "counted" | "doubtful" | "unknown"
    var repsLevel: String? = nil
    /// Velocidad concéntrica media de la ÚLTIMA repetición YA CERRADA (m/s), con su
    /// índice dentro de la serie. Una velocidad por repetición: si el número cambia
    /// es porque hay otra repetición, no porque el estimador se lo repensó a mitad
    /// de recorrido. Nil hasta que se cierra la primera.
    var lastRepVelocityMs: Double? = nil
    var lastRepIndex: Int? = nil
    var meanVelocityFirstMs: Double? = nil
    var meanVelocityLastMs: Double? = nil
    var velocityLossPct: Double? = nil
    var velocityConfidence: Double? = nil
    /// Monotonic so the phone can drop out-of-order packets.
    var seq: Int = 0
}

// MARK: - Envelope helpers

extension MirrorEnvelope {
    /// Encode `payload` under `type`. Returns nil only on an encoding failure —
    /// callers treat that as "nothing to send", never a crash.
    static func encoding<P: Encodable>(type: String, _ payload: P) -> Data? {
        guard let body = try? MirrorWire.encoder.encode(payload),
              let data = try? MirrorWire.encoder.encode(MirrorEnvelope(type: type, body: body))
        else { return nil }
        return data
    }

    /// Decode an incoming envelope; nil for foreign/undecodable bytes (tolerant —
    /// a newer peer may speak types this build doesn't know).
    static func decoding(_ data: Data) -> MirrorEnvelope? {
        try? MirrorWire.decoder.decode(MirrorEnvelope.self, from: data)
    }

    /// Decode this envelope's body as `P`; nil when the body doesn't match.
    func body<P: Decodable>(as type: P.Type) -> P? {
        try? MirrorWire.decoder.decode(P.self, from: body)
    }
}
