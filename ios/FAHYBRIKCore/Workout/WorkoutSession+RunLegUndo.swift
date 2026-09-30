import Foundation

// DESHACER EL CIERRE DE UN TRAMO DE CORRER (P4: «5 s para deshacer, que Garmin no tiene»).
//
// `stepBack` retrocede de SEGMENTO, no de tramo: no sirve para reabrir la serie 3 que el atleta
// cerró sin querer con un doble toque. Esto reabre el ÚLTIMO tramo cerrado a mano de una carrera
// estructurada, y solo durante `Vivo.deshacerMs`. La instantánea vive esos 5 s y se borra sola:
// la cuenta atrás sale de los tics del motor (`tickRunLegUndo`), nunca de un temporizador aparte.
//
// Lo que se restaura es lo que el cierre tocó: el cursor del tramo, la vuelta que se grabó (se
// retira), las bases desde las que se mide el tramo (metros, segundos, pulso, zonas, pendiente,
// cadencia), la ventana del tramo (la que el HUD lee para «hecho») y lo que quedaba de su reloj.
// El tiempo NO se deshace: el tramo reabierto sigue contando como si nunca se hubiera cerrado, así
// que los segundos y los metros que corrieron mientras tanto son suyos (`kit-reloj/secuencia.ts`,
// `deshacerCierre`). Cerrar el ÚLTIMO tramo de la carrera no se puede deshacer: cierra el bloque.

/// Desde dónde se mide el tramo (lo que fija cada GO): la instantánea de los `runLeg*` del motor.
struct RunLegBaselines: Equatable {
    var beltStart: Double
    var gpsStart: Double
    var startElapsed: Double
    var hrStartCount: Int
    var zoneStart: [Int: Double]
    var inclineSumStart: Double
    var inclineCountStart: Int
    var cadenceSampleStart: Int
}

/// La ventana del tramo que el HUD lee (`tramo*` del motor). Se guarda entera para que reabrir el
/// tramo no la re-ancle al instante del deshacer: un tramo por distancia perdería sus metros.
struct TramoWindow: Equatable {
    var key: String
    var startElapsed: Double
    var clockArmed: Bool
    var ergStartDistance: Double?
    var ergStartCalories: Int?
    var beltStartDistance: Double
    var gpsStartDistance: Double?
    var lastElapsedSeconds: Double?
    var hrPeak: Int?
    var lastHRPeak: Int?
    var restLatched: Bool
    var hrStartCount: Int
    var paceSampleStart: Int
    var powerSampleStart: Int
    var spmSampleStart: Int
    var inclineSumStart: Double
    var inclineCountStart: Int
    var cadenceSampleStart: Int
}

/// El cierre a mano de un tramo de correr, mientras se puede deshacer.
struct RunLegUndo: Equatable {
    var segmentIndex: Int
    /// El tramo que se cerró (el que se reabre).
    var legIndex: Int
    /// La vuelta que se grabó al cerrarlo: al deshacer se retira.
    var lapId: UUID
    /// Lo que quedaba de su cuenta atrás al cerrarlo (0 en un tramo por distancia).
    var legRemaining: Double
    var baselines: RunLegBaselines
    var tramo: TramoWindow
    /// Segundos que le quedan a la ventana de deshacer.
    var windowRemaining: Double
}

extension WorkoutSession {

    /// Lo que dura la ventana de deshacer: el mismo dato del núcleo que usa el iPhone.
    static let runLegUndoWindowS: Double = Vivo.deshacerMs / 1000

    /// Un tramo por tiempo reabierto con su reloj ya agotado se cierra en el siguiente tic, como si
    /// nunca se hubiera cerrado; esto solo evita dejarlo en 0, que el motor lee como «tramo por distancia».
    private static let runLegRemainingMinimum: Double = 0.001

    /// Segundos que quedan para deshacer el último cierre; `nil` = no hay nada que deshacer.
    var runLegUndoRemainingS: Double? { runLegUndo?.windowRemaining }

    // MARK: - Captura (antes de cerrar) y cuenta atrás (en cada tic)

    /// Lo que hay que guardar ANTES de cerrar el tramo: el cierre graba la vuelta y sitúa el tramo siguiente,
    /// y ambas cosas pisan estas bases.
    func captureRunLegState() -> (baselines: RunLegBaselines, tramo: TramoWindow) {
        (RunLegBaselines(beltStart: runLegBeltStart, gpsStart: runLegGpsStart, startElapsed: runLegStartElapsed,
                         hrStartCount: runLegHRStartCount, zoneStart: runLegZoneStart, inclineSumStart: runLegInclineSumStart,
                         inclineCountStart: runLegInclineCountStart, cadenceSampleStart: runLegCadenceSampleStart),
         TramoWindow(key: tramoKey, startElapsed: tramoStartElapsed, clockArmed: tramoClockArmed,
                     ergStartDistance: tramoErgStartDistance, ergStartCalories: tramoErgStartCalories,
                     beltStartDistance: tramoBeltStartDistance, gpsStartDistance: tramoGpsStartDistance,
                     lastElapsedSeconds: lastTramoElapsedSeconds, hrPeak: tramoHRPeak, lastHRPeak: lastTramoHRPeak,
                     restLatched: tramoRestLatched, hrStartCount: tramoHRStartCount, paceSampleStart: tramoPaceSampleStart,
                     powerSampleStart: tramoPowerSampleStart, spmSampleStart: tramoSpmSampleStart,
                     inclineSumStart: tramoInclineSumStart, inclineCountStart: tramoInclineCountStart,
                     cadenceSampleStart: tramoCadenceSampleStart))
    }

    /// La ventana corre con el reloj del motor: al llegar a cero la instantánea se borra.
    func tickRunLegUndo(dt: Double) {
        guard var u = runLegUndo else { return }
        u.windowRemaining -= dt
        runLegUndo = u.windowRemaining > 0 ? u : nil
    }

    // MARK: - Deshacer

    /// Reabre el último tramo cerrado a mano. Devuelve si había algo que reabrir: pasados los 5 s, o si el
    /// cursor ya no está justo detrás del tramo cerrado, no hace nada.
    @discardableResult
    func undoRunLegClose() -> Bool {
        guard let u = runLegUndo, u.windowRemaining > 0, !isFinished,
              runStructureSegmentIndex == u.segmentIndex, currentSegmentIndex == u.segmentIndex,
              runLegIndex == u.legIndex + 1,
              let lap = laps.lastIndex(where: { $0.id == u.lapId }) else {
            runLegUndo = nil
            return false
        }
        laps.remove(at: lap)
        let interim = Self.runLegUndoWindowS - u.windowRemaining
        runLegIndex = u.legIndex
        restore(u.baselines)
        restore(u.tramo)
        runLegRemaining = u.legRemaining > 0 ? Swift.max(Self.runLegRemainingMinimum, u.legRemaining - interim) : 0
        runLegUndo = nil
        return true
    }

    private func restore(_ b: RunLegBaselines) {
        runLegBeltStart = b.beltStart
        runLegGpsStart = b.gpsStart
        runLegStartElapsed = b.startElapsed
        runLegHRStartCount = b.hrStartCount
        runLegZoneStart = b.zoneStart
        runLegInclineSumStart = b.inclineSumStart
        runLegInclineCountStart = b.inclineCountStart
        runLegCadenceSampleStart = b.cadenceSampleStart
    }

    private func restore(_ t: TramoWindow) {
        tramoKey = t.key
        tramoStartElapsed = t.startElapsed
        tramoClockArmed = t.clockArmed
        tramoErgStartDistance = t.ergStartDistance
        tramoErgStartCalories = t.ergStartCalories
        tramoBeltStartDistance = t.beltStartDistance
        tramoGpsStartDistance = t.gpsStartDistance
        lastTramoElapsedSeconds = t.lastElapsedSeconds
        tramoHRPeak = t.hrPeak
        lastTramoHRPeak = t.lastHRPeak
        tramoRestLatched = t.restLatched
        tramoHRStartCount = t.hrStartCount
        tramoPaceSampleStart = t.paceSampleStart
        tramoPowerSampleStart = t.powerSampleStart
        tramoSpmSampleStart = t.spmSampleStart
        tramoInclineSumStart = t.inclineSumStart
        tramoInclineCountStart = t.inclineCountStart
        tramoCadenceSampleStart = t.cadenceSampleStart
    }
}
