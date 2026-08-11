import Foundation

/// Live pipeline: decimate → archive buffer → activity → reps → velocity.
/// Pure over samples; the watch capture wrapper feeds it.
///
/// Contar repeticiones tiene DOS condiciones, y las dos viven aquí:
/// la geometría (la pone `RepTracker`: sale y vuelve, con amplitud) y el
/// contexto (lo pone el llamante: hay una serie abierta de algo que se cuenta).
/// Sin la segunda, andar hacia la barra es una serie de ocho.
@MainActor
final class SensorPipeline {
    private(set) var samples: [SensorSample] = []
    private var decimator = SensorDecimator()
    private var openWindows: [SensorWindowLabel] = []
    private var closedWindows: [SensorWindowLabel] = []
    private let activity = ActivityDetector()
    private var tracker = RepTracker()

    private(set) var captureMode: SensorCaptureMode = .classic
    private(set) var startedAt: Date?
    var watchModel: String?
    var wrist: SensorWrist?
    var executionLocalId: String?

    // MARK: Live conclusions (what the phone paints)

    private(set) var lastRepResult: RepCountResult?
    private(set) var lastTiming: ActivityTimingResult?
    private(set) var lastVelocity: BarVelocityResult?

    /// Repeticiones cerradas de la SERIE en curso. Monotónica por construcción:
    /// cada una se emite una vez, al cerrarse, y nada la baja ni la reinicia
    /// mientras la ventana siga abierta.
    var liveCompletedReps: Int { tracker.count }
    /// m/s de la última repetición YA cerrada — nil hasta que se cierre la primera.
    var lastCompletedRepVelocityMs: Double? {
        guard let ms = tracker.last?.concentricMs, ms > 0 else { return nil }
        return ms
    }
    var lastCompletedRepVelocityConfidence: Double? {
        guard let rep = tracker.last, rep.concentricMs > 0 else { return nil }
        return rep.confidence
    }
    /// Índice de esa repetición, para que la pantalla sepa que el número cambió
    /// porque hay OTRA repetición, no porque el estimador se lo repensó.
    var lastCompletedRepIndex: Int? { tracker.last?.index }

    /// Traza para diagnosticar en vivo: la del contador más lo que decide la
    /// ventana. La vacía quien la publica (el reloj la manda al teléfono, y allí va
    /// a la consola de Xcode — mismo reparto que el diagnóstico de la cinta).
    private var pendingTrace: [String] = []

    /// Devuelve y limpia la traza acumulada.
    func drainTrace() -> [String] {
        var out = pendingTrace
        pendingTrace = []
        out.append(contentsOf: tracker.drainTrace())
        return out
    }

    private func note(_ line: String) {
        pendingTrace.append(line)
        if pendingTrace.count > 40 { pendingTrace.removeFirst(pendingTrace.count - 40) }
    }

    /// La ventana de trabajo activa: clave, si cuenta repeticiones, y si está en
    /// descanso. Nil = no hay serie abierta → no se cuenta nada.
    private(set) var activeWindowKey: String?
    private(set) var isCountableWindow = false
    private(set) var isRestingWindow = false
    /// Índice de la primera muestra aún sin pasar por el contador.
    private var trackerCursor = 0
    /// Índice de la primera muestra dentro del horizonte de trabajo/descanso, y
    /// cuándo se recalculó por última vez.
    private var timingCursor = 0
    private var lastTimingAt: Double = -.infinity

    private static let liveHorizonSeconds: Double = 35
    private static let mergeGapSeconds: Double = 1.8
    /// Cada cuánto se recalcula trabajo/descanso (s).
    private static let timingEverySeconds: Double = 0.5

    var sampleCount: Int { samples.count }

    /// Modalidades cuyo movimiento de muñeca NO es una repetición: correr y los
    /// ergos son cíclicos por naturaleza (y el PM5 ya cuenta paladas), y la
    /// movilidad no tiene repetición que precargar. Todo lo demás se cuenta —
    /// incluida una modalidad desconocida, porque la ventana ya restringe a una
    /// serie abierta y callarse ahí sería no contar el entreno libre.
    static func countsReps(modality: String?) -> Bool {
        switch modality?.lowercased() {
        case "run", "row", "ski", "bike", "mobility": return false
        default: return true
        }
    }

    func reset() {
        samples = []
        pendingTrace = []
        decimator = SensorDecimator()
        openWindows = []
        closedWindows = []
        lastRepResult = nil
        lastTiming = nil
        lastVelocity = nil
        tracker.reset()
        trackerCursor = 0
        timingCursor = 0
        lastTimingAt = -.infinity
        activeWindowKey = nil
        isCountableWindow = false
        isRestingWindow = false
        startedAt = nil
        captureMode = .classic
    }

    func beginSession(mode: SensorCaptureMode, at date: Date = Date()) {
        reset()
        captureMode = mode
        startedAt = date
    }

    func pushRaw(t: Double, ax: Double, ay: Double, az: Double,
                 gx: Double, gy: Double, gz: Double,
                 grx: Double = 0, gry: Double = 0, grz: Double = 0) {
        let out = decimator.push(t: t, ax: ax, ay: ay, az: az, gx: gx, gy: gy, gz: gz,
                                 grx: grx, gry: gry, grz: grz)
        if !out.isEmpty {
            samples.append(contentsOf: out)
            recomputeLive()
        }
    }

    func finishSampling() {
        let tail = decimator.finish()
        if !tail.isEmpty {
            samples.append(contentsOf: tail)
            recomputeLive()
        }
    }

    // MARK: - windows

    /// ÚNICA entrada para el contexto: qué serie está abierta ahora mismo.
    /// Idempotente — llamarla en cada tic con la misma clave no toca nada; en
    /// cuanto la clave cambia, cierra la anterior, abre la nueva y el contador
    /// vuelve a cero (una serie cuenta SUS repeticiones, no las de la anterior).
    ///
    /// `key` la compone el llamante con lo que identifica el tramo (serie/ronda +
    /// movimiento). `nil` = no hay trabajo abierto → no se cuenta.
    func setActiveWindow(key: String?, exerciseId: Int? = nil, modality: String? = nil,
                         name: String? = nil, resting: Bool = false, at t: Double) {
        isRestingWindow = resting
        guard key != activeWindowKey else { return }
        if activeWindowKey != nil { closeWindow(at: t) }
        activeWindowKey = key
        tracker.reset()
        trackerCursor = samples.count
        lastRepResult = nil
        lastVelocity = nil
        guard let key else {
            isCountableWindow = false
            note("serie cierra · no hay trabajo abierto → no se cuenta")
            return
        }
        isCountableWindow = Self.countsReps(modality: modality)
        note("serie abre · \(name ?? key) · \(modality ?? "modalidad ?") · "
             + (isCountableWindow ? "se cuenta" : "NO se cuenta esta modalidad"))
        openWindow(tramoId: key, exerciseId: exerciseId, modality: modality, name: name, at: t)
    }

    func openWindow(tramoId: String?, exerciseId: Int?, modality: String?, name: String?, at t: Double) {
        openWindows.append(SensorWindowLabel(
            t0: t, t1: nil, tramoId: tramoId, exerciseId: exerciseId,
            modality: modality, movementName: name
        ))
    }

    func closeWindow(at t: Double) {
        guard var w = openWindows.popLast() else { return }
        w = SensorWindowLabel(
            t0: w.t0, t1: t, tramoId: w.tramoId, exerciseId: w.exerciseId,
            modality: w.modality, movementName: w.movementName
        )
        closedWindows.append(w)
        recomputeLive()
    }

    var allWindows: [SensorWindowLabel] {
        closedWindows + openWindows
    }

    // MARK: - conclusions

    private func recomputeLive() {
        // 1. Trabajo / descanso sobre la ventana reciente — alimenta las columnas
        //    sensor_work_s / sensor_rest_s del tramo. Independiente del conteo.
        //
        //    Dos cuidados de BATERÍA, que en el reloj es un criterio de aceptación
        //    del plan: la ventana se acota moviendo un índice (filtrar el array
        //    entero cada 20 ms son 135.000 muestras por sesión, seis millones de
        //    comparaciones por segundo al final), y el detector corre dos veces por
        //    segundo, no cincuenta — el trabajo acumulado no cambia en 20 ms.
        if samples.count >= 50, let tEnd = samples.last?.t,
           tEnd - lastTimingAt >= Self.timingEverySeconds {
            let cutoff = tEnd - Self.liveHorizonSeconds
            while timingCursor < samples.count, samples[timingCursor].t < cutoff {
                timingCursor += 1
            }
            let recent = Array(samples[min(timingCursor, samples.count)...])
            if recent.count >= 40, let t0 = recent.first?.t {
                lastTimingAt = tEnd
                let raw = activity.analyze(recent)
                // La pausa de un segundo arriba de la barra sigue siendo trabajo:
                // los huecos cortos se cosen antes de sumar.
                let merged = Self.mergeWorkIntervals(raw.workIntervals, maxGap: Self.mergeGapSeconds)
                let work = merged.reduce(0.0) { $0 + max(0, $1.1 - $1.0) }
                lastTiming = ActivityTimingResult(
                    workSeconds: work,
                    restSeconds: max(0, (tEnd - t0) - work),
                    confidence: raw.confidence,
                    workIntervals: merged
                )
            }
        }

        // 2. Repeticiones: muestra a muestra, en orden, sin recalcular nada.
        //    Cada muestra entra UNA vez; el contador decide cuándo se cierra una
        //    repetición y ese número ya no se toca.
        guard trackerCursor <= samples.count else {
            trackerCursor = samples.count
            return
        }
        let pending = samples[trackerCursor..<samples.count]
        trackerCursor = samples.count
        guard isCountableWindow, !isRestingWindow, activeWindowKey != nil else { return }
        for sample in pending {
            tracker.push(sample)
        }

        // 3. Trabajo y descanso de una serie CONTABLE los dicen las repeticiones, no
        //    un umbral de energía. El detector por energía está calibrado para
        //    burpees y wall balls: un back squat de 45 cm en 3,5 s pica a 0,4 m/s²,
        //    por debajo de su umbral (0,96), así que declaraba «trabajo 0,0 s» en una
        //    serie de seis repeticiones reales — lo cazó el reproductor de archivos.
        //    Derivarlo de las repeticiones además impide que las dos cifras se
        //    contradigan: son el mismo mecanismo.
        if let first = tracker.reps.first, let lastRep = tracker.reps.last,
           let tEnd = samples.last?.t, let openedAt = openWindows.last?.t0 {
            let work = tracker.reps.reduce(0.0) { $0 + max(0, $1.cycleSeconds) }
            let span = max(work, tEnd - openedAt)
            lastTiming = ActivityTimingResult(
                workSeconds: min(work, span),
                restSeconds: max(0, span - work),
                confidence: tracker.confidence,
                workIntervals: [(max(openedAt, first.closedAt - first.cycleSeconds), lastRep.closedAt)]
            )
        }

        lastVelocity = tracker.setSummary
        lastRepResult = RepCountResult(
            reps: tracker.count,
            confidence: tracker.confidence,
            level: tracker.level,
            periodSeconds: tracker.last?.cycleSeconds,
            alternatingPattern: false
        )
    }

    /// Collapse work intervals separated by less than `maxGap` into one bout.
    static func mergeWorkIntervals(
        _ intervals: [(Double, Double)],
        maxGap: Double
    ) -> [(Double, Double)] {
        let sorted = intervals.sorted { $0.0 < $1.0 }
        guard var current = sorted.first else { return [] }
        var out: [(Double, Double)] = []
        for next in sorted.dropFirst() {
            if next.0 - current.1 <= maxGap {
                current = (current.0, max(current.1, next.1))
            } else {
                out.append(current)
                current = next
            }
        }
        out.append(current)
        return out
    }

    /// Build the archive file bytes for transfer (fase 0). Nil if nothing useful.
    func encodeArchive(appVersion: String?) throws -> Data? {
        finishSampling()
        guard !samples.isEmpty, let startedAt else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let header = SensorFileHeader(
            formatVersion: Int(SensorFileFormat.version),
            executionLocalId: executionLocalId,
            startedAt: iso.string(from: startedAt),
            sampleHz: SensorFileFormat.targetHz,
            channels: SensorFileFormat.channels,
            captureMode: captureMode.rawValue,
            watchModel: watchModel,
            wrist: wrist?.rawValue,
            appVersion: appVersion,
            windows: allWindows,
            sampleCount: samples.count
        )
        return try SensorFileCodec.encode(header: header, samples: samples)
    }
}
