import Foundation

// Del contador al cable, en UN solo sitio.
//
// El paquete de conclusiones lo mandan dos caminos —el espejo (reloj → teléfono)
// y el solitario (reloj → su propio motor)— y hasta aquí cada uno lo armaba a
// mano con su propia mezcla de campos. Eso es exactamente cómo la velocidad
// acabó saliendo de un sitio distinto que el conteo. Una función, dos llamantes.
extension SensorPipeline {

    /// Lo que el reloj tiene que contar del sensor, listo para el cable.
    /// `seq` es monotónica para que el receptor descarte paquetes atrasados.
    func conclusions(seq: Int) -> MirrorSensorConclusions {
        let reps = liveCompletedReps
        let summary = lastVelocity
        return MirrorSensorConclusions(
            sensorWorkS: lastTiming?.workSeconds,
            sensorRestS: lastTiming?.restSeconds,
            sensorTimingConfidence: lastTiming?.confidence,
            // Cero repeticiones NO es «cero»: es «todavía no sé». El teléfono no
            // debe pisar el número del plan con un cero del sensor.
            reps: reps > 0 ? reps : nil,
            repsConfidence: reps > 0 ? lastRepResult?.confidence : nil,
            repsLevel: reps > 0 ? (lastRepResult?.level.rawValue ?? RepConfidenceLevel.doubtful.rawValue)
                                : RepConfidenceLevel.unknown.rawValue,
            lastRepVelocityMs: lastCompletedRepVelocityMs,
            lastRepIndex: lastCompletedRepIndex,
            meanVelocityFirstMs: summary?.meanVelocityFirst,
            meanVelocityLastMs: summary?.meanVelocityLast,
            velocityLossPct: summary?.velocityLossPct,
            velocityConfidence: lastCompletedRepVelocityConfidence ?? summary?.confidence,
            seq: seq
        )
    }
}
