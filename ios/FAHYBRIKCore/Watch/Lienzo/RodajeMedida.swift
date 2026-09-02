import Foundation

/// Vivo / Datos decision for a Watch run. The lámina only paints this.
///
/// Apple meters (`distanceWalkingRunning`) are the only figure. The prescribed
/// target is never a stand-in for a measurement: `?? 0` on nil covered is how
/// a 5×500 looked like "500 m done" before the first sample.
enum RodajeMedida {

    struct Entrada: Equatable {
        /// Street (outdoor / unknown). Indoor / treadmill never says `sin señal`.
        var esCalle: Bool
        /// Session or piece meters from Apple. Nil = HealthKit has not spoken.
        var metrosApple: Double?
        var ritmoSecPorKm: Int?
        var objetivoMetros: Double?
        var objetivoSegundos: Double?
        var segundosPieza: Double
        var esSerie: Bool
    }

    struct Lectura: Equatable {
        var sujeto: String
        var unidad: String
        var quedan: Bool
        var ritmoSecPorKm: Int?
        /// Outdoor + no Apple meters. Indoor is always false.
        var notaSinSenal: Bool
    }

    static func vivo(_ e: Entrada) -> Lectura {
        let hayApple = e.metrosApple != nil
        let ritmo = hayApple ? e.ritmoSecPorKm.flatMap { $0 > 0 ? $0 : nil } : nil
        let nota = e.esCalle && !hayApple

        if let objetivo = e.objetivoMetros, objetivo > 0 {
            guard let cubiertos = e.metrosApple else {
                return Lectura(
                    sujeto: WatchFormat.clock(e.segundosPieza),
                    unidad: "",
                    quedan: false,
                    ritmoSecPorKm: nil,
                    notaSinSenal: nota
                )
            }
            let faltan = max(0, objetivo - cubiertos)
            if e.esSerie {
                return Lectura(
                    sujeto: String(Int(faltan.rounded(.up))),
                    unidad: "m",
                    quedan: true,
                    ritmoSecPorKm: ritmo,
                    notaSinSenal: false
                )
            }
            return Lectura(
                sujeto: WatchDistancia.cifra(faltan),
                unidad: WatchDistancia.unidad(faltan),
                quedan: true,
                ritmoSecPorKm: ritmo,
                notaSinSenal: false
            )
        }

        if let total = e.objetivoSegundos, total > 0 {
            let queda = max(0, total - e.segundosPieza)
            return Lectura(
                sujeto: WatchFormat.countdown(queda),
                unidad: "",
                quedan: true,
                ritmoSecPorKm: ritmo,
                notaSinSenal: nota && !hayApple
            )
        }

        return Lectura(
            sujeto: WatchFormat.clock(e.segundosPieza),
            unidad: "",
            quedan: false,
            ritmoSecPorKm: ritmo,
            notaSinSenal: nota
        )
    }

    /// Street unless the athlete (or the phone) said indoor / treadmill.
    static func esCalle(environment: RunEnvironment?) -> Bool {
        switch environment {
        case .indoor, .treadmill: return false
        case .outdoor, nil: return true
        }
    }
}

/// Vivo tap: prescribed series advances; libre does not.
/// The motor already has `applyCommand(.advance)`. This only decides IF the
/// gesture fires — it is not a second tap engine.
enum RodajeVivoToca {
    /// Work or recovery of a structured run, while the clock is live.
    static func avanza(_ session: WorkoutSession) -> Bool {
        session.isRunStructureActive && !session.isPaused && !session.isFinished
    }

    /// Controls: a new cut only when the athlete owns the cuts.
    static func muestraNuevoTramo(_ session: WorkoutSession) -> Bool {
        session.isFreeRun
            && session.currentSegment?.kind == .running
            && !session.isRunStructureActive
    }
}
