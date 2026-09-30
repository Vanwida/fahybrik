import Foundation

// LO DECLARADO EN EL DESCANSO, EN EL MOTOR — la única puerta por la que una
// `Vivo.Declaracion` llega a `WorkoutSession` (reps, carga, RIR o RPE de una serie).
// La usan tres sitios y ninguno escribe el motor por su cuenta: el reloj en solitario
// (`MunecaAlimentador`), el móvil cuando la muñeca le manda lo anotado en espejo
// (`PhoneMirrorCommandRelay`) y el vivo del iPhone (`VivoIphoneView`).

extension WorkoutSession {

    /// La serie del motor a la que apunta un paso de fuerza del plan, si es del segmento en curso.
    func vivoIndiceDeSerie(_ paso: Vivo.Paso) -> Int? {
        guard let o = paso.origen, o.segmento == currentSegmentIndex, case let .serie(k) = o.ventana, setRecords.indices.contains(k) else { return nil }
        return k
    }

    /// Escribe lo declarado en la serie. Solo toca el motor si el valor cambia: confirmar lo que ya está no lo pisa
    /// (una serie contada por el sensor sigue siendo del sensor). La carga que se GIRA (`cascada`) la heredan las
    /// series pendientes de detrás; la que se confirma, no.
    func vivoDeclarar(_ d: Vivo.Declaracion, pasos: [Vivo.Paso]) {
        guard let p = pasos.first(where: { $0.id == d.paso }), let k = vivoIndiceDeSerie(p) else { return }
        switch d.campo {
        case .reps:
            if setRecords[k].repsActual != Int(d.valor) { setSetReps(k, Int(d.valor)) }
        case .kg:
            guard setRecords[k].loadActualKg != d.valor else { return }
            if d.cascada { setSetLoadCascade(k, d.valor) } else { setSetLoad(k, d.valor) }
        case .esfuerzo:
            if p.fuerza?.esfuerzo?.eje == .rir { setSetRIR(k, d.valor) } else { setSetRPE(k, d.valor) }
        }
    }

    /// Lo que contó el sensor de cada serie ya cerrada: sus reps son `medido`, no propuesto, y confirmar no las pisa.
    func vivoMedidasDeSensor(_ pasos: [Vivo.Paso]) -> [String: Vivo.MedidaSerie] {
        var out: [String: Vivo.MedidaSerie] = [:]
        for p in pasos where p.fuerza != nil {
            guard let k = vivoIndiceDeSerie(p), setRecords[k].confirmed, setRecords[k].repsSource == RepsSource.sensor.rawValue,
                  let reps = setRecords[k].repsActual else { continue }
            out[p.id] = Vivo.MedidaSerie(segundos: 0, reps: Double(reps))
        }
        return out
    }
}
