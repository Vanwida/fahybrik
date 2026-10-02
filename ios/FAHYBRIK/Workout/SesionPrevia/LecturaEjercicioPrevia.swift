import Foundation

// CÓMO SE LEE UN EJERCICIO EN LA FICHA PREVIA — funciones puras, sin vista.
//
// Todo sale de los MISMOS formateadores que usan el motor y el vivo (`PrescriptionRenderer`,
// `block.alternatingEmom`, `block.supersetFold`): la ficha no puede contar una sesión y el entreno
// otra. Cuando un ítem no trae prescripción estructurada se lee de sus escalares heredados, y lo que
// no declara no se pinta (§7): ni un guion, ni un valor por defecto que parezca del atleta.
//
// Es la materia prima de `LecturaFicha+Desde.swift`, que compone con ella lo que enseña cada movimiento.

enum LecturaEjercicioPrevia {

    /// Cómo se pinta un ítem suelto.
    enum Forma: Equatable {
        /// Tabla por series: la prescripción ES una tabla de series (`sets` escritos). Un core de 3×20 o
        /// una movilidad de 3×30 s tienen la misma forma que un 4×10 de banca; lo que decide es la forma
        /// de la prescripción, no la modalidad.
        case tablaDeSeries
        /// Una tarjeta de una línea: correr, ergo, funcional, un movimiento suelto de un WOD.
        case tarjeta
    }

    static func forma(de item: WorkoutItem) -> Forma {
        let series = item.prescription?.scheme == .sets ? (item.prescription?.sets?.count ?? 0) : 0
        return series > 0 && (modalidad(de: item) == .strength || series > 1) ? .tablaDeSeries : .tarjeta
    }

    // MARK: Modalidad

    static func modalidad(de item: WorkoutItem) -> PrescriptionModality {
        if let m = item.prescription?.modality { return m }
        switch item.exerciseCategory.lowercased() {
        case "running":    return .run
        case "rowing":     return .row
        case "ski_erg":    return .ski
        case "bike_erg":   return .bike
        case "strength":   return .strength
        case "functional": return .functional
        case "mobility":   return .mobility
        default:           return .other
        }
    }

    // MARK: La línea de un ítem

    /// La línea de un ítem: prescripción estructurada primero, escalares heredados si no la trae.
    static func linea(de item: WorkoutItem) -> PrescriptionRenderer.Line {
        item.prescription.map { PrescriptionRenderer.summaryLine($0) } ?? lineaDeEscalares(item)
    }

    /// Una `Line` construida con los escalares heredados, para que un ítem sin prescripción estructurada
    /// siga enseñando su medida dominante y su ritmo o zona.
    static func lineaDeEscalares(_ item: WorkoutItem) -> PrescriptionRenderer.Line {
        let p = item.paramsJson
        let esErgo = ["rowing", "ski_erg", "bike_erg"].contains(item.exerciseCategory.lowercased())
        var cabeza: String?
        if let m = p.distanceMeters, m > 0 {
            cabeza = Formato.distancia(Double(m))
        } else if let km = p.distanceKm, km > 0 {
            cabeza = Formato.distancia(km * 1000)
        } else if let d = p.durationSeconds, d > 0 {
            cabeza = Formato.clock(d, subMinuto: .segundos)
        } else if let r = p.reps, r > 0 {
            cabeza = "\(r) reps"
        } else if let cal = p.calories, cal > 0 {
            cabeza = "\(cal) cal"
        }
        var ritmo: String?
        if let pk = p.paceSecPerKm, pk > 0 {
            ritmo = esErgo ? "@ \(Formato.ritmo(Double(pk) / 2, .por500m))" : "@ \(Formato.ritmo(Double(pk), .porKm))"
        }
        var detalle: [String] = []
        if let kg = p.loadKg, kg > 0 { detalle.append(Formato.kg(kg)) }
        if let descanso = p.restSeconds, descanso > 0 {
            detalle.append("descanso \(Formato.clock(descanso, subMinuto: .segundos))")
        }
        return PrescriptionRenderer.Line(
            headline: cabeza, pace: ritmo,
            detail: detalle.isEmpty ? nil : detalle.joined(separator: " · "),
            zone: p.hrZone.flatMap { HRZone(rawValue: $0) }
        )
    }

    // MARK: Las rotaciones

    /// Qué turno ocupa cada fila de un EMOM que alterna: con dos movimientos, minutos impares y pares;
    /// con tres o más, Min 1 / 2 / 3…
    static func turnoDelMinuto(_ indice: Int, de total: Int) -> String {
        if total == 2 { return indice == 0 ? "Min impar" : "Min par" }
        return "Min \(indice + 1)"
    }

    /// La dosis de un ejercicio de una superserie: la prescripción escrita o, si no la trae, la que se
    /// materializa de sus escalares. Las MISMAS series que va a ejecutar el motor.
    static func dosisDeSuperserie(_ item: WorkoutItem) -> (trabajo: String?, carga: String?) {
        guard let p = item.prescription ?? item.scalarStrengthPrescription else { return (nil, nil) }
        let d = PrescriptionRenderer.rotationDose(p)
        return (d.work, d.load)
    }

    /// «4 rondas», «1 ronda».
    static func rondas(_ n: Int) -> String {
        "\(n) \(Vocab.ronda.lowercased())\(n == 1 ? "" : "s")"
    }

    // MARK: La ficha de técnica

    /// ¿Hay ficha que enseñar? La ficha pinta vídeo, consejos, descripción del catálogo y la nota del
    /// coach para hoy: cualquiera de las cuatro basta para ofrecer el acceso.
    static func tieneTecnica(_ item: WorkoutItem) -> Bool {
        tieneVideo(item) || [item.exerciseDescription, item.cues, item.notes].contains { $0?.isEmpty == false }
    }

    /// Solo con vídeo REPRODUCIBLE: lo que decide si el acceso se anuncia como vídeo o solo como técnica.
    static func tieneVideo(_ item: WorkoutItem) -> Bool {
        VideoDeTecnica.hay(en: item.exerciseVideoUrl)
    }
}
