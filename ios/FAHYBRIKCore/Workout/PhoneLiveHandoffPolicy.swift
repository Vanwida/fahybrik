import Foundation

// FH-97 / FH-56 — phone ↔ watch handoff decisions (pure, unit-tested on iOS).
// The phone is coach, not connector: it asks the wrist for the PRIMARY on start
// (`startWatchApp`, always, unasked), adopts whatever Apple hands back, and never
// decides on its own that a recording is worthless.

enum PhoneLiveHandoffPolicy {

    /// What the phone does with a mirrored session Apple just handed over.
    enum AdoptAction: Equatable, Sendable {
        /// Live coach engine — frame it.
        case coach
        /// No engine in this process but a fresh coach plan on disk — reopen the
        /// SAME cover (`LiveWorkoutResume`), then `begin` links it.
        case reopenFromDisk
        /// No engine and nothing to reopen (or the engine already finished) —
        /// end the wrist recording SAVING. The recording is the athlete's;
        /// the phone never discards it on adopt (FH-56, Owner P0 #2).
        case endSaving
    }

    /// Por qué el móvil NO lanza (o no relanza) el reloj. Cada caso viaja tal cual al
    /// registro técnico (`start_watch_app_skipped`, `detail=reason=<raw>`): el
    /// próximo «no conecta» tiene que dejar rastro, nunca un silencio.
    enum WatchLaunchSkip: String, Equatable, Sendable {
        /// No hay motor de coach en marcha (nada que lanzar todavía, o ya terminó).
        case noEngine = "no_engine"
        /// Este intent ya pidió el reloj: el primer lanzamiento es único (FH-96).
        case alreadyRequested = "already_requested"
        /// El canal espejo ya está atado: el reloj ya está grabando.
        case channelBound = "channel_bound"
        /// HealthKit no está disponible en este aparato.
        case healthUnavailable = "health_unavailable"
        /// Relanzar solo tiene sentido si Apple devolvió un error al lanzar.
        case launchNotFailed = "launch_not_failed"
        /// Se agotaron los relanzamientos de este intent.
        case retryCapReached = "retry_cap_reached"
    }

    enum WatchLaunchDecision: Equatable, Sendable {
        case launch
        case skip(WatchLaunchSkip)
    }

    /// El reloj se lanza SIEMPRE al empezar y sin esperar a nadie: ni a calle o cinta,
    /// ni a una respuesta del atleta. Apple Entreno, Strava y Nike Run Club hacen lo
    /// mismo. UN `startWatchApp` por intent (FH-96): un segundo `begin` sobre la misma
    /// sesión no relanza; un canal atado significa que el reloj ya está ahí.
    ///
    /// Antes una carrera con `runEnvironment == nil` no lanzaba nada y no decía nada
    /// (causa raíz del «no conecta», 29-sep): el entorno real viaja luego en la trama
    /// (`MirrorStateFrame.runEnvironment`) y el reloj cambia de actividad al recibirlo.
    static func watchLaunchDecision(
        alreadyRequested: Bool,
        channelBound: Bool,
        hasEngine: Bool
    ) -> WatchLaunchDecision {
        if !hasEngine { return .skip(.noEngine) }
        if channelBound { return .skip(.channelBound) }
        if alreadyRequested { return .skip(.alreadyRequested) }
        return .launch
    }

    /// Relanzamientos por intent tras un error de Apple, dirigidos por el evento de
    /// que el reloj vuelve a estar alcanzable (nunca por temporizador, FH-56). Dos
    /// cubre un reloj que despierta tarde y una segunda ventana de alcance; más
    /// sería un bucle de reintentos disfrazado.
    static let maxWatchRelaunchesPerIntent = 2

    /// El reloj pasó de no alcanzable a alcanzable (`WCSession.reachabilityDidChange`)
    /// con el entreno en marcha. Solo se relanza si el lanzamiento anterior FALLÓ
    /// (Apple devolvió error), aún no hay canal espejo atado (con canal, un segundo
    /// lanzamiento fue el bug de la build 78) y queda cupo.
    static func watchRelaunchDecision(
        coaching: Bool,
        channelBound: Bool,
        lastLaunchFailed: Bool,
        relaunchesDone: Int
    ) -> WatchLaunchDecision {
        if !coaching { return .skip(.noEngine) }
        if channelBound { return .skip(.channelBound) }
        if !lastLaunchFailed { return .skip(.launchNotFailed) }
        if relaunchesDone >= maxWatchRelaunchesPerIntent { return .skip(.retryCapReached) }
        return .launch
    }

    /// Stage end when mirror channel is not up yet; flush on adopt.
    static func shouldStagePendingEnd(mirroredSessionPresent: Bool) -> Bool {
        !mirroredSessionPresent
    }

    /// Adopt links and does not judge — except to pick where the coach plan is.
    static func adoptAction(
        hasEngine: Bool,
        engineFinished: Bool,
        hasFreshSnapshot: Bool
    ) -> AdoptAction {
        if hasEngine { return engineFinished ? .endSaving : .coach }
        return hasFreshSnapshot ? .reopenFromDisk : .endSaving
    }

    /// Athlete ended on wrist — phone must not send a second MirrorEnd.
    static func phoneEndIsNoOp(wristFinishedByAthlete: Bool) -> Bool {
        wristFinishedByAthlete
    }
}
