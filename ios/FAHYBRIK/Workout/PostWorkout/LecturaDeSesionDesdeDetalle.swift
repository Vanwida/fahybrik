import Foundation

// EL DECODIFICADOR: `AssignmentDetail` → `SesionEjecutada`.
//
// Hermano de `LecturaDeCarreraDesdeDetalle` — mismo principio, otra pregunta.
// Aquella decide «¿esto fue una carrera?»; esta se llama cuando la respuesta es
// NO (o cuando no hay carrera que leer) y arma la foto de la sesión entera: sus
// totales, su pulso, su desglose bloque a bloque.
//
// LO QUE ESTE FICHERO NO HACE, otra vez la mitad del diseño: no inventa una
// duración, no reparte un total entre bloques que no la tienen, y CUALQUIER dato
// que el cable de hoy no da simplemente no se rellena (§7 CONTRATO-UI).
//
// LO QUE EL CABLE DA DESDE EL 28-SEP (DECISIONS «los lectores»):
//
//  1. FUERZA SERIE A SERIE. Cada tramo trae `sets[]` y su `volume_kg`, calculado
//     por la regla única del servidor. Aquí se pinta y se suma lo servido; no se
//     recalcula (antes se multiplicaba el total de reps por la carga más alta).
//  2. RONDA. `round_index` en la escala GUARDADA (0155): 0 = la unidad no se
//     repite, N = ronda N (base 1; la app sube base 0 y el servidor suma uno). Con
//     0 o sin el campo el desglose es lista plana: el agrupado sale del dato, nunca
//     de una rama especial de la pantalla.
//  3. SIN DESCANSO MEDIDO entre bloques. El descanso de CADA SERIE sí viaja
//     (`sets[].rest_s`) y se pinta en su serie; `Bloque.descansoS` sigue `nil`.

// FC MEDIA / MÁXIMA / CALORÍAS DE LA SESIÓN vienen de `execution.avg_hr` /
// `execution.max_hr` / `execution.total_calories` — el servidor los calcula UNA
// vez (ver AssignmentDetail.swift). Aquí NUNCA se derivan de los segmentos: dos
// motores para la misma media es cómo el coach y el atleta acaban leyendo dos
// números distintos de la misma sesión.

enum LecturaDeSesionDesdeDetalle {

    /// LA SESIÓN QUE HAY EN ESTE DETALLE, o nil si no hay ejecución que leer.
    ///
    /// A diferencia de `LecturaDeCarreraDesdeDetalle.carrera`, esto NO exige que
    /// haya segmentos: una sesión sin desglose (solo agregado) sigue teniendo
    /// cabecera, tiempo y — si los hay — pulso y lo que dijo el atleta. Un
    /// desglose vacío no es un fallo, es una sesión sin per-ejercicio logueado.
    static func sesion(
        de detalle: some DetalleDeEntrenoHecho,
        tituloAlternativo: String? = nil,
        ahora: Date = Date()
    ) -> SesionEjecutada? {
        guard let ejecucion = detalle.execution else { return nil }

        let itemsPorUid = itemsDelPlan(detalle)
        let segmentos = ejecucion.segments.sorted { $0.position < $1.position }
        let bloques = segmentos.compactMap { bloqueDe($0, itemsPorUid: itemsPorUid) }

        let formatosDeBloques = (detalle.workout?.blocks ?? []).map(\.format)
        let duracionSegmentos = segmentos.compactMap(\.durationSeconds).reduce(0, +)
        let duracionTotalS = ejecucion.totalDurationSeconds.map(Double.init)
            ?? Double(duracionSegmentos)

        let ancla = ejecucion.startedAt.flatMap(ISO8601DateFormatters.parse)
        let fin = ejecucion.endedAt.flatMap(ISO8601DateFormatters.parse)

        return SesionEjecutada(
            titulo: detalle.workout?.name ?? tituloAlternativo ?? "Entreno",
            cuando: detalle.fechaISO.flatMap { FechaES.cuando($0, ahora: ahora) } ?? "",
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

    private static func itemsDelPlan(_ detalle: some DetalleDeEntrenoHecho) -> [String: WorkoutItem] {
        var salida: [String: WorkoutItem] = [:]
        for bloque in detalle.workout?.blocks ?? [] {
            for item in bloque.items { salida[item.uid] = item }
        }
        return salida
    }

    /// UN SEGMENTO MEDIDO → UN BLOQUE DEL DESGLOSE. `nil` solo cuando el wire trae
    /// una modalidad que hoy no se sabe dibujar (ninguna, hasta que aparezca una
    /// nueva) — nunca por falta de números: un bloque sin duración ni distancia
    /// sigue siendo una fila con su nombre y, si acaso, su pulso.
    static func bloqueDe(_ s: SegmentActualDTO, itemsPorUid: [String: WorkoutItem]) -> Bloque? {
        let item = s.itemUid.flatMap { itemsPorUid[$0] }
        let modalidad = modalidadDe(s.modality)

        var b = Bloque(
            modalidad: modalidad,
            etiqueta: item?.exerciseName ?? etiquetaGenerica(s.modality),
            duracionS: s.durationSeconds.map(Double.init),
            fcMediaPpm: s.avgHr.map(Double.init),
            // Escala GUARDADA: 0 = la unidad no se repite; N = ronda N (base 1).
            ronda: s.roundIndex.flatMap { $0 > 0 ? $0 : nil },
            descansoS: nil       // ver cabecera del fichero
        )
        // Lo que viaja para cualquier modalidad: una estación funcional también
        // puede anotarse por series, y el tonelaje es del tramo, no del tipo.
        b.series = (s.sets ?? []).map(SerieHecha.init)
        b.volumenKg = s.volumeKg
        b.parciales = (s.ergSplits ?? []).map(ParcialDeErgo.init)

        switch modalidad {
        case .correr, .ergometro:
            b.distanciaM = s.distanceMeters
        case .fuerza:
            // La línea única, para cuando no hay serie a serie.
            b.repsTotal = s.repsCompleted
            b.kg = (s.weightUsedKg ?? 0) > 0 ? s.weightUsedKg : nil
        case .funcional:
            if let d = s.distanceMeters, d > 0 {
                b.metros = d
            } else if let reps = s.repsCompleted {
                b.reps = reps
            }
        }
        return b
    }

    /// La modalidad del wire (`run | row | ski | bike | strength | other`, ver
    /// `normalizeModality` en `ingest-execution-segments.ts`) a la de este
    /// modelo. `other` recoge todo lo funcional/sled: la fuerza ya tiene su
    /// propio valor (`strength`), así que no hay ambigüedad que resolver aquí.
    static func modalidadDe(_ wire: String) -> ModalidadDeBloque {
        switch wire {
        case "run": return .correr
        case "row", "ski", "bike":
            return .ergometro(ErgMachineRole(rawValue: wire) ?? .row)
        case "strength": return .fuerza
        default: return .funcional
        }
    }

    /// Etiqueta cuando el segmento no casa con ningún ítem del plan (un lap
    /// libre, o un `item_uid` que ya no está en el detalle). La máquina concreta
    /// para un ergómetro («Remo»), la voz genérica del resto en el resto de casos.
    private static func etiquetaGenerica(_ modalidad: String) -> String {
        if let maquina = ErgMachineRole(rawValue: modalidad) { return maquina.titleES }
        let label = Theme.Modality.label(modalidad)
        return label.prefix(1).uppercased() + label.dropFirst()
    }

    // MARK: - El resultado propio del formato (§ card 124, punto 2)

    /**
     EL RECUADRO EXTRA, cuando el tiempo no cuenta ya toda la historia.

     Precedencia: fuerza (si hubo algo con carga) → EMOM (rondas estructuradas,
     reales) → el `score_label` que ya redactó el servidor (AMRAP y cualquier
     otro formato puntuado) → nada, que es lo que corresponde a un for-time o una
     sesión libre (el tiempo ya es la respuesta).
     */
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

    /// Mismo criterio que `ExecutedWorkoutView.emomRounds`: el primer segmento
    /// que trajo el marcador de EMOM manda — un solo sitio calcula esto en toda
    /// la sesión, aunque varias estaciones lo compartan. Las dos cifras o
    /// ninguna: «7 de ?» no es una lectura.
    static func emomRoundsDe(_ ejecucion: ExecutionSummary) -> (completadas: Int, prescritas: Int)? {
        guard let seg = ejecucion.segments.first(where: { $0.emomRoundsCompleted != nil }),
              let completadas = seg.emomRoundsCompleted,
              let prescritas = seg.emomRoundsPrescribed
        else { return nil }
        return (completadas, prescritas)
    }

    // MARK: - Lo medido

    /// El pulso de la sesión ENTERA, tal y como lo archivó el motor — nunca
    /// reconstruido. Sin traza disponible no hay curva que dibujar.
    static func pulsoDe(_ trace: ExecutionTrace?) -> [Muestra] {
        guard let trace, trace.available else { return [] }
        return trace.displayCurve.hr?.muestras ?? []
    }

    /// El reparto de pulso — MISMO cálculo que `ExecutedWorkoutView.zoneCoverage`:
    /// solo los segmentos con duración medida entran en la ventana, y sus
    /// segundos por zona (`raw_lap_data_json.zone_seconds`, ya decodificados en
    /// `SegmentActualDTO.zoneSeconds`) se suman antes de leer el reparto. Un solo
    /// sitio calcula esto en toda la app.
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
