import Foundation
import os

// EL CONTEO DE REPETICIONES QUE VIENE DE LA MUÑECA. La geometría del gesto la
// resuelve el reloj; qué serie está abierta, de qué movimiento y si toca descanso
// solo lo sabe este motor — de ahí `sensorWindow`. Sin esa ventana el contador
// corría también mientras el atleta andaba hacia la barra, y ocho pasos son ocho
// repeticiones para cualquier detector honesto.
//
// Está en ALPHA y apagado por defecto: el sensor captura siempre (es el material
// para calibrar) pero sin el interruptor del perfil ni un número llega a la
// pantalla ni al entreno guardado. Y quien manda es el atleta: si ha tocado la
// cuenta, el sensor no la pisa.
extension WorkoutSession {
    var sensorWindow: SensorWindow {
        let resting = isPaused || isAwaitingBlockStart || isAwaitingFinishDecision
            || restRemainingSeconds > 0
        guard !isFinished, let segment = currentSegment else {
            return SensorWindow(key: nil, exerciseId: nil, modality: nil, name: nil, resting: resting)
        }
        // La serie ABIERTA dentro del tramo: en un 4×8 cada serie es su propia
        // ventana y su propio conteo, no las cuatro juntas.
        let openSet = setRecords.firstIndex(where: { !$0.confirmed && $0.status != "skipped" })
        let key = "\(currentSegmentIndex)|\(openSet.map(String.init) ?? "unica")|\(segment.title)"
        return SensorWindow(
            key: key,
            exerciseId: nil,
            modality: segment.prescription?.modality?.rawValue ?? segment.kind.modality,
            name: segment.title,
            resting: resting
        )
    }

    /// Apply live conclusions from the watch: velocity + live rep count.
    ///
    /// The pipeline already gates chair-stands and multi-bout gaps. Here we
    /// still refuse garbage numbers (0, jumps past the prescription ceiling)
    /// but we DO count — disabling the feature on bad feedback was wrong.
    func applySensorConclusions(_ c: MirrorSensorConclusions) {
        guard c.seq >= lastSensorSeq else { return }
        lastSensorSeq = c.seq
        // ALPHA, y apagado por defecto: sin el interruptor del perfil el sensor
        // sigue capturando (es el material para calibrar) pero ni un número llega a
        // la pantalla ni al entreno guardado. Un conteo que se equivoca cuesta más
        // que no dar conteo. La traza sí se registra: es lo que permite calibrar.
        for line in c.debug ?? [] {
            Self.repsLog.log("[REPS] \(line, privacy: .public)")
        }
        guard SensorRepCounting.isEnabled else { return }
        sensorConclusions = c

        let openIdx = setRecords.firstIndex(where: { !$0.confirmed && $0.status != "skipped" })
            ?? setRecords.indices.last
        if let openIdx {
            stampVelocity(on: openIdx, from: c)
        }

        let before = setRecords.isEmpty ? repsCurrentSegment : (setRecords[openIdx ?? 0].repsActual ?? 0)
        applySensorReps(c, openIdx: openIdx)
        let after = setRecords.isEmpty ? repsCurrentSegment : (setRecords[openIdx ?? 0].repsActual ?? 0)
        // Solo cuando cambia algo: a dos paquetes por segundo, registrar cada uno
        // sería ruido que tapa justo la línea que importa.
        if before != after || c.reps != lastLoggedSensorReps {
            lastLoggedSensorReps = c.reps
            let w = sensorWindow
            Self.repsLog.log("""
                [REPS] móvil · reloj dice \(c.reps.map(String.init) ?? "—", privacy: .public) \
                (\(c.repsLevel ?? "—", privacy: .public)) · m/s \
                \(c.lastRepVelocityMs.map { String(format: "%.2f", $0) } ?? "—", privacy: .public) \
                rep \(c.lastRepIndex.map(String.init) ?? "—", privacy: .public) · \
                pantalla \(before, privacy: .public)→\(after, privacy: .public) · \
                serie \(w.key ?? "ninguna", privacy: .public)\(w.resting ? " (descanso)" : "", privacy: .public)
                """)
        }
    }

    /// Consola del dispositivo — el canal por el que se depura en el gimnasio.
    private static let repsLog = Logger(subsystem: Marca.subsistemaLog("sensor"), category: "reps")

    /// Conteo en vivo. El número que manda la muñeca es el de LA SERIE ABIERTA y
    /// es absoluto: el contador del reloj emite cada repetición una vez, al
    /// cerrarse, y su ventana se reinicia con cada serie (`sensorWindow`).
    ///
    /// Por eso aquí no hay ni «+1 por paquete» ni techo del plan. Los dos existían
    /// para defenderse de un contador que daba saltos, y los dos hacían daño: el
    /// +1 dejaba la cuenta por detrás para siempre en cuanto se perdía un paquete,
    /// y el techo CONGELABA la serie entera —ni una repetición más— en cuanto un
    /// número inflado lo pasaba. Lo único que se respeta es quién manda: si el
    /// atleta ha tocado la cuenta, el sensor no la pisa.
    private func applySensorReps(_ c: MirrorSensorConclusions, openIdx: Int?) {
        guard let sensorReps = c.reps, sensorReps > 0 else { return }
        let level = c.repsLevel ?? ""
        guard level == RepConfidenceLevel.counted.rawValue
                || level == RepConfidenceLevel.doubtful.rawValue else { return }
        let conf = c.repsConfidence ?? 0

        if !setRecords.isEmpty {
            guard let idx = openIdx, !setRecords[idx].confirmed else { return }
            if setRecords[idx].repsSource == RepsSource.athleteTap.rawValue { return }
            let shown = setRecords[idx].repsSource == RepsSource.sensor.rawValue
                ? (setRecords[idx].repsActual ?? 0) : 0
            setRecords[idx].repsActual = max(shown, sensorReps)
            setRecords[idx].repsSource = RepsSource.sensor.rawValue
            setRecords[idx].repsConfidence = conf
            return
        }

        // Tramo de una sola serie: el número del plan viene precargado, y en cuanto
        // el sensor cierra la primera repetición manda lo contado.
        guard !repsConfirmed else { return }
        repsCurrentSegment = sensorReps
    }

    func stampVelocity(on index: Int, from c: MirrorSensorConclusions) {
        guard setRecords.indices.contains(index) else { return }
        setRecords[index].meanVelocityFirstMs = c.meanVelocityFirstMs
        setRecords[index].meanVelocityLastMs = c.meanVelocityLastMs ?? c.lastRepVelocityMs
        setRecords[index].velocityLossPct = c.velocityLossPct
        setRecords[index].velocityConfidence = c.velocityConfidence
    }
}
