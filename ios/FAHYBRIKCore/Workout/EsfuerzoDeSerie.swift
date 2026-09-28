import Foundation

// EL ESFUERZO DE CADA SERIE, PREGUNTADO CUANDO HAY TIEMPO DE CONTESTAR.
//
// El hueco (auditoría 28-sep): 0 de 94 series reales llevaban RPE ni RIR. El motor
// y el cable las aceptaban desde hace meses, pero solo se podían escribir abriendo
// «ajustar serie» — la excepción, en una hoja aparte —, así que nadie lo hacía. La
// analítica por serie del coach (el RIR que se come una progresión) estaba vacía.
//
// Se pregunta en el DESCANSO que sigue a la serie: es el único momento en que el
// atleta tiene la serie fresca y las manos libres. Un toque, y se puede no contestar
// (§7: lo que sintió se pregunta, no se copia del plan). La ESCALA la decide lo que
// el coach prescribió: si pidió RIR, se pregunta RIR; si no, RPE.
enum EscalaEsfuerzo: Equatable {
    case rpe
    case rir

    /// Las respuestas de un toque. El editor de la serie sigue admitiendo el medio
    /// punto y el resto de la escala; esto es el camino corto.
    var opciones: [Double] {
        switch self {
        case .rpe: return [6, 7, 8, 9, 10]
        case .rir: return [0, 1, 2, 3, 4]
        }
    }

    var etiqueta: String { self == .rpe ? Vocab.rpe : Vocab.rir }
}

extension WorkoutSession {

    /// La serie recién cerrada cuyo esfuerzo se pregunta: la última confirmada (y no
    /// saltada) mientras corre su descanso. Nil fuera de una tabla de series o fuera
    /// del descanso.
    var serieParaEsfuerzo: Int? {
        guard restRemainingSeconds > 0, currentSegment?.usesMultiSetStrength == true else { return nil }
        return setRecords.lastIndex { $0.confirmed && $0.status != "skipped" }
    }

    /// Qué escala se pregunta para la serie `i`: RIR cuando el coach prescribió RIR
    /// (en la serie o en el bloque), RPE en todo lo demás.
    func escalaDeEsfuerzo(serie i: Int) -> EscalaEsfuerzo {
        let sets = currentSegment?.prescription?.sets
        if let sets, sets.indices.contains(i), sets[i].prescribedRir != nil { return .rir }
        if case .rir? = currentSegment?.prescription?.target { return .rir }
        return .rpe
    }

    /// Lo que el atleta contestó para la serie `i`, en la escala que se le preguntó.
    func esfuerzoAnotado(serie i: Int) -> Double? {
        guard setRecords.indices.contains(i) else { return nil }
        return escalaDeEsfuerzo(serie: i) == .rir ? setRecords[i].rir : setRecords[i].rpe
    }

    /// Anotar (o quitar, con nil) el esfuerzo de la serie `i`.
    func anotarEsfuerzo(serie i: Int, _ valor: Double?) {
        switch escalaDeEsfuerzo(serie: i) {
        case .rpe: setSetRPE(i, valor)
        case .rir: setSetRIR(i, valor)
        }
    }
}
