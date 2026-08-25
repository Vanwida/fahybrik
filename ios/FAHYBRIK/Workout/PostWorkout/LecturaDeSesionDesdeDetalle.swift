import Foundation

// EL DECODIFICADOR: `AssignmentDetail` → `SesionEjecutada`.
//
// Hermano de `LecturaDeCarreraDesdeDetalle`. Arma la foto de la sesión
// entera: totales, pulso, desglose bloque a bloque.
//
// Card 144: el desglose sale del `recap` que el servidor proyecta desde
// la ejecución guardada. Nunca de la prescripción. Si el recap no tiene
// bloques, se cae a los segmentos (payload viejo / cache anterior).
//
// SIN recap y SIN segmentos con sustancia: la sesión sigue existiendo
// (cabecera, tiempo, pulso) — un desglose vacío no es un fallo.
//
// FC MEDIA / MÁXIMA / CALORÍAS DE LA SESIÓN vienen de `execution.avg_hr`
// / `max_hr` / `total_calories`. Aquí NUNCA se derivan de los segmentos.

enum LecturaDeSesionDesdeDetalle {

    /// LA SESIÓN QUE HAY EN ESTE DETALLE, o nil si no hay ejecución que leer.
    static func sesion(
        de detalle: AssignmentDetail,
        tituloAlternativo: String? = nil,
        ahora: Date = Date()
    ) -> SesionEjecutada? {
        guard let ejecucion = detalle.execution else { return nil }

        let itemsPorUid = itemsDelPlan(detalle)
        let segmentos = ejecucion.segments.sorted { $0.position < $1.position }
        let bloques: [Bloque]
        if let recap = ejecucion.recap, !recap.blocks.isEmpty {
            bloques = recap.blocks
                .sorted { $0.position < $1.position }
                .compactMap { bloqueDe(recap: $0) }
        } else {
            bloques = segmentos.compactMap { bloqueDe($0, itemsPorUid: itemsPorUid) }
        }

        let formatosDeBloques = (detalle.workout?.blocks ?? []).map(\.format)
        let duracionSegmentos = segmentos.compactMap(\.durationSeconds).reduce(0, +)
        let duracionTotalS = ejecucion.totalDurationSeconds.map(Double.init)
            ?? Double(duracionSegmentos)

        let ancla = ejecucion.startedAt.flatMap(ISO8601DateFormatters.parse)
        let fin = ejecucion.endedAt.flatMap(ISO8601DateFormatters.parse)

        return SesionEjecutada(
            titulo: detalle.workout?.name ?? tituloAlternativo ?? "Entreno",
            cuando: FechaES.cuando(detalle.assignment.scheduledFor, ahora: ahora) ?? "",
            horaInicio: ancla.map(Self.horaLocal),
            horaFin: fin.map(Self.horaLocal),
            completitud: ejecucion.isPartial ? .parcial : .completa,
            tipo: tipoDeSesion(bloques: bloques, formatosDeBloques: formatosDeBloques),
            duracionTotalS: duracionTotalS,
            bloques: bloques,
            resultado: resultadoDe(ejecucion, bloques: bloques),
            fcMediaPpm: ejecucion.avgHr,
            fcMaxPpm: ejecucion.maxHr,
            kcal: ejecucion.totalCalories,
            ruta: ejecucion.trace.map(LecturaDeCarreraDesdeDetalle.rutaDe) ?? [],
            pulso: pulsoDe(ejecucion.trace),
            zonas: zonasDe(segmentos),
            rpe: ejecucion.perceivedExertion,
            dificultadLabel: ejecucion.perceivedDifficulty
                .flatMap(PerceivedDifficulty.init(rawValue:))?.label,
            molestiaLabel: molestiaDe(ejecucion)
        )
    }

    // MARK: - El desglose

    private static func itemsDelPlan(_ detalle: AssignmentDetail) -> [String: WorkoutItem] {
        var salida: [String: WorkoutItem] = [:]
        for bloque in detalle.workout?.blocks ?? [] {
            for item in bloque.items { salida[item.uid] = item }
        }
        return salida
    }

    /// UN BLOQUE DEL RECAP — números de ejecución, ya proyectados.
    static func bloqueDe(recap b: RecapBlockDTO) -> Bloque? {
        let modalidad = modalidadDe(b.modality ?? wireModality(for: b.kind))
        var bloque = Bloque(
            modalidad: modalidad,
            etiqueta: b.label.isEmpty ? etiquetaGenerica(b.modality ?? "") : b.label,
            duracionS: b.durationS.map(Double.init),
            ronda: recapRound(b.round),
            descansoS: nil
        )
        switch modalidad {
        case .correr, .ergometro:
            bloque.distanciaM = b.distanceM
            bloque.ritmoMedidoSkm = b.paceSPerKm
            bloque.ritmoMedidoS500m = b.paceSPer500m
        case .fuerza:
            bloque.repsTotal = b.reps
            bloque.kg = b.loadKg
            bloque.series = b.sets.map {
                SerieEjecutada(
                    setIndex: $0.setIndex,
                    reps: $0.reps,
                    kg: $0.loadKg,
                    isApproach: $0.isApproach
                )
            }
        case .funcional:
            if let d = b.distanceM, d > 0 {
                bloque.metros = d
            } else if let reps = b.reps {
                bloque.reps = reps
            }
        }
        return bloque
    }

    /// Fallback: un segmento medido → un bloque. Lee ritmo y series si vienen.
    static func bloqueDe(_ s: SegmentActualDTO, itemsPorUid: [String: WorkoutItem]) -> Bloque? {
        let item = s.itemUid.flatMap { itemsPorUid[$0] }
        let modalidad = modalidadDe(s.modality)

        var b = Bloque(
            modalidad: modalidad,
            etiqueta: item?.exerciseName ?? etiquetaGenerica(s.modality),
            duracionS: s.durationSeconds.map(Double.init),
            fcMediaPpm: s.avgHr.map(Double.init),
            ronda: recapRound(s.roundIndex),
            descansoS: nil
        )

        switch modalidad {
        case .correr, .ergometro:
            b.distanciaM = s.distanceMeters
            b.ritmoMedidoSkm = s.avgPaceSPerKm
            b.ritmoMedidoS500m = s.avgPaceSPer500m
        case .fuerza:
            b.repsTotal = s.repsCompleted
            b.kg = (s.weightUsedKg ?? 0) > 0 ? s.weightUsedKg : nil
            b.series = s.sets.map {
                SerieEjecutada(
                    setIndex: $0.setIndex,
                    reps: $0.repsActual,
                    kg: $0.loadActualKg,
                    isApproach: $0.isApproach
                )
            }
        case .funcional:
            if let d = s.distanceMeters, d > 0 {
                b.metros = d
            } else if let reps = s.repsCompleted {
                b.reps = reps
            }
        }
        return b
    }

    static func modalidadDe(_ wire: String) -> ModalidadDeBloque {
        switch wire {
        case "run": return .correr
        case "row", "ski", "bike":
            return .ergometro(ErgMachineRole(rawValue: wire) ?? .row)
        case "strength": return .fuerza
        default: return .funcional
        }
    }

    private static func wireModality(for kind: String) -> String {
        switch kind {
        case "run": return "run"
        case "ergo": return "row"
        case "strength": return "strength"
        default: return "other"
        }
    }

    private static func recapRound(_ raw: Int?) -> Int? {
        guard let raw, raw > 0 else { return nil }
        return raw
    }

    private static func etiquetaGenerica(_ modalidad: String) -> String {
        if let maquina = ErgMachineRole(rawValue: modalidad) { return maquina.titleES }
        let label = Theme.Modality.label(modalidad)
        return label.prefix(1).uppercased() + label.dropFirst()
    }

    // MARK: - El resultado propio del formato

    static func resultadoDe(_ ejecucion: ExecutionSummary, bloques: [Bloque]) -> ResultadoDeSesion? {
        let (volumenKg, serieMasPesada) = volumenDeFuerza(bloques)
        if volumenKg > 0 {
            return .fuerza(volumenKg: volumenKg, serieMasPesada: serieMasPesada)
        }
        if let emom = emomRoundsDe(ejecucion) {
            return .emom(rondasCompletadas: emom.completadas, rondasPrescritas: emom.prescritas)
        }
        if let score = ejecucion.scoreLabel, !score.isEmpty {
            return .texto(score)
        }
        return nil
    }

    static func emomRoundsDe(_ ejecucion: ExecutionSummary) -> (completadas: Int, prescritas: Int)? {
        guard let seg = ejecucion.segments.first(where: { $0.emomRoundsCompleted != nil }),
              let completadas = seg.emomRoundsCompleted,
              let prescritas = seg.emomRoundsPrescribed
        else { return nil }
        return (completadas, prescritas)
    }

    // MARK: - Lo medido

    static func pulsoDe(_ trace: ExecutionTrace?) -> [Muestra] {
        guard let trace, trace.available else { return [] }
        return trace.displayCurve.hr?.muestras ?? []
    }

    static func zonasDe(_ segmentos: [SegmentActualDTO]) -> ZoneCoverage? {
        var totales: [String: Int] = [:]
        var ventana = 0.0
        for s in segmentos {
            guard let duracion = s.durationSeconds, duracion > 0 else { continue }
            ventana += Double(duracion)
            for (clave, segundos) in s.zoneSeconds ?? [:] { totales[clave, default: 0] += segundos }
        }
        return ZoneCoverage.read(zoneSecondsByKey: totales, windowSeconds: ventana)
    }

    static func molestiaDe(_ e: ExecutionSummary) -> String? {
        let area = (e.painArea ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let nota = (e.painNote ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !area.isEmpty || !nota.isEmpty else { return nil }
        let nombre = area.isEmpty
            ? "molestia"
            : (PainArea(rawValue: area)?.label.lowercased() ?? area)
        let base = "Molestia en \(nombre)"
        return nota.isEmpty ? base : "\(base) · \(nota)"
    }

    private static let formatoHora: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "HH:mm"
        f.timeZone = .current
        return f
    }()

    private static func horaLocal(_ fecha: Date) -> String { formatoHora.string(from: fecha) }
}
