import Foundation

// CÓMO SE LLENA LA TARJETA — tres constructores, uno por momento.
//
// Los tres beben de datos que YA existen (la sesión viva, el plan del día, la
// semana resuelta) y no inventan ninguno: un campo sin dato real se queda
// fuera, nunca se rellena. Es la misma regla del resto del resumen (§7): lo
// que no se midió no aparece, y lo que aparece se midió.

enum TarjetaCompartibleBuilder {

    // MARK: - DESPUÉS · lo que salió

    /// La tarjeta del entreno terminado, desde la sesión en memoria. Lo hecho
    /// manda sobre lo prescrito: cada línea lleva el número que SALIÓ.
    @MainActor
    static func despues(session: WorkoutSession, totalSeconds: Int?) -> TarjetaEntrenoDatos {
        let total = totalSeconds ?? Int(session.elapsedSeconds.rounded())

        var resultado: [(String, String)] = [("Tiempo", Formato.clock(total))]
        if let ritmo = ritmoDeCorrer(session.laps) {
            resultado.append(("Ritmo", ritmo))
        } else if let volumen = volumenLevantado(session.laps) {
            resultado.append(("Volumen", volumen))
        }
        if let fc = pulsoMedio(session.laps) {
            resultado.append(("Pulso medio", "\(fc)"))
        }

        // Los bloques, en el orden del plan, SOLO con lo que dejó trabajo. Un
        // segmento sin ningún lap no se hizo, y la tarjeta de después cuenta lo
        // que pasó — no es un recorte por espacio y no se cuenta como tal.
        var bloques: [BloqueCartelCompartir] = []
        for segmento in session.plan.segments {
            let laps = session.laps.filter { $0.segmentId == segmento.id }
            guard !laps.isEmpty else { continue }
            if let b = bloqueEjecutado(segmento: segmento, laps: laps) {
                bloques.append(b)
            }
        }

        return TarjetaEntrenoDatos(
            chip: diaDeLaSemana(session.startedAt),
            titulo: session.plan.name,
            resultado: resultado,
            bloques: bloques
        )
    }

    // MARK: - ANTES · lo que toca

    /// La tarjeta del plan del día, antes de entrenar. Calentamiento y vuelta a
    /// la calma fuera por defecto: nadie publica su movilidad, y gastan el
    /// sitio de lo que el atleta quiere enseñar. No se cuentan como recorte —
    /// no es que no quepan, es que no van.
    static func antes(plan: WorkoutPlan) -> TarjetaEntrenoDatos {
        var bloques: [BloqueCartelCompartir] = []

        for grupo in agrupadosPorBloque(plan.segments) {
            let esCalentamiento = grupo.segmentos.allSatisfy {
                $0.prescription?.scheme == .warmup || $0.prescription?.scheme == .cooldown
            }
            if esCalentamiento { continue }

            let lineas: [LineaCartel] = grupo.segmentos.map { seg in
                LineaCartel(nombre: seg.title, dato: dosisPrescrita(seg), esHecho: false)
            }
            guard !lineas.isEmpty else { continue }
            bloques.append(BloqueCartelCompartir(
                titulo: grupo.titulo,
                pauta: pautaDelBloque(grupo.segmentos),
                cuerpo: .lista(lineas)
            ))
        }

        return TarjetaEntrenoDatos(
            chip: diaDeLaSemana(Date()),
            titulo: plan.name,
            resultado: [],
            bloques: bloques
        )
    }

    // MARK: - LA SEMANA

    /// La tarjeta semanal, desde la semana resuelta del plan. Solo lo que la
    /// semana SABE: la lista lleva las sesiones trabajadas sin duración (el
    /// plan no guarda cuánto duró lo hecho — ponerlo sería inventar), y los
    /// totales son el conteo, que sí es verdad.
    static func semana(_ semana: SemanaDelPlan) -> TarjetaSemanaDatos {
        let dias = semana.dias.map { DiaCartelSemana(letra: $0.inicial, estado: $0.estado) }

        let trabajadas = semana.dias
            .filter { $0.estado.trabajado }
            .flatMap { dia in dia.sesiones.map { SesionCartelSemana(dia: dia.inicial, titulo: $0.title) } }
        let previstas = semana.dias.reduce(0) { $0 + $1.sesiones.count }

        // El chip: el número ISO de la semana del primer día servido. Si la
        // fecha no parsea (payload raro), el chip degrada a la palabra sola.
        var chip = "Semana"
        if let primero = semana.dias.first,
           let fecha = ISO8601DateFormatter.soloFecha.date(from: primero.isoDate) {
            let n = Calendar(identifier: .iso8601).component(.weekOfYear, from: fecha)
            chip = "Semana \(n)"
        }

        return TarjetaSemanaDatos(
            chip: chip,
            // El nombre del microciclo o el foco — lo que el COACH escribió. Sin
            // nada escrito, «Mi semana»: genérico y verdadero.
            titulo: semana.nombreBloque ?? semana.intencion ?? "Mi semana",
            dias: dias,
            totales: "\(trabajadas.count)/\(previstas) sesiones",
            sesiones: trabajadas
        )
    }

    // MARK: - Un bloque ejecutado

    /// La forma del bloque la decide EL DATO: tramos de carrera medidos o
    /// rondas de ergómetro → `serie` (los parciales son el porqué de la
    /// tarjeta); lo demás → `lista` con lo que salió.
    private static func bloqueEjecutado(segmento: WorkoutSegment, laps: [LapRecord]) -> BloqueCartelCompartir? {
        // Tramos de carrera medidos uno a uno (la tanda de 400): la fuente es
        // TramosMedidos, la MISMA lectura del resumen — la tarjeta no puede
        // contar una historia distinta de la que el atleta acaba de ver.
        let tramos = TramosMedidos.lee(segmento: segmento, laps: laps)
        let fuertes = tramos.filas.filter { !($0.leg?.isRecovery ?? false) }
        if fuertes.count > 1 {
            return BloqueCartelCompartir(
                titulo: segmento.blockTitle ?? segmento.title,
                pauta: pautaDeTramos(segmento: segmento, filas: fuertes, cobertura: tramos.cobertura),
                cuerpo: .serie(repeticiones(de: fuertes))
            )
        }

        // Rondas de ergómetro: varios laps del mismo segmento, cada uno con su
        // tiempo. La historia es cómo fueron cayendo.
        if segmento.kind == .rowOrSki, laps.count > 1 {
            let mejor = laps.map(\.durationSeconds).min()
            let reps = laps.map { lap in
                RepeticionCartel(
                    etiqueta: nil,
                    valor: Formato.clock(lap.durationSeconds),
                    segundos: lap.durationSeconds,
                    ritmo: nil,
                    mejor: lap.durationSeconds == mejor && laps.count > 2
                )
            }
            return BloqueCartelCompartir(
                titulo: segmento.blockTitle ?? segmento.title,
                pauta: pautaDelBloque([segmento]),
                cuerpo: .serie(reps)
            )
        }

        // Lo demás: una línea con lo que salió.
        guard let linea = lineaEjecutada(segmento: segmento, laps: laps) else { return nil }
        return BloqueCartelCompartir(
            titulo: segmento.blockTitle ?? segmento.title,
            pauta: nil,
            cuerpo: .lista([linea])
        )
    }

    private static func repeticiones(de filas: [TramosMedidos.Fila]) -> [RepeticionCartel] {
        // La etiqueta por repetición solo cuando los tramos NO son iguales (una
        // pirámide): ahí es lo único que los hace comparables. En una tanda
        // uniforme la pauta ya lo dice y repetirlo roba sitio al número.
        let medidas = Set(filas.compactMap { $0.leg.map(metrosDelTramo) })
        let uniforme = medidas.count <= 1
        let mejor = filas.map(\.lap.durationSeconds).min()

        return filas.map { fila in
            RepeticionCartel(
                etiqueta: uniforme ? nil : fila.leg.flatMap(etiquetaDelTramo),
                valor: fila.tiempo,
                segundos: fila.lap.durationSeconds,
                ritmo: fila.lap.avgPaceSecPerKm.map { Formato.ritmo($0, .porKm) },
                mejor: fila.lap.durationSeconds == mejor && filas.count > 2
            )
        }
    }

    private static func lineaEjecutada(segmento: WorkoutSegment, laps: [LapRecord]) -> LineaCartel? {
        // Fuerza con series registradas: lo hecho, comprimido como lo diría el
        // atleta — «4×5 · 110 kg» (series no saltadas; la carga más alta).
        let series = laps.compactMap(\.sets).flatMap { $0 }
            .filter { $0.status != "skipped" && !$0.isApproach }
        if !series.isEmpty {
            var partes: [String] = []
            let reps = series.compactMap(\.repsActual)
            if let moda = valorModa(reps) {
                partes.append("\(series.count)×\(moda)")
            } else {
                partes.append("\(series.count) series")
            }
            if let kg = series.compactMap({ $0.loadActualKg ?? $0.loadPrescribedKg }).max(), kg > 0 {
                partes.append("\(Formato.esDecimal(kg)) kg")
            }
            return LineaCartel(nombre: segmento.title, dato: partes.joined(separator: " · "), esHecho: true)
        }

        // Sin series: la medida agregada que dejó el lap.
        let lap = laps[0]
        if let metros = lap.distanceCoveredMeters, metros >= 1,
           let texto = Formato.distanciaCubierta(metros) {
            return LineaCartel(nombre: segmento.title, dato: texto, esHecho: true)
        }
        if let reps = lap.repsCompleted, reps > 0 {
            return LineaCartel(nombre: segmento.title, dato: "\(reps) reps", esHecho: true)
        }
        if lap.durationSeconds >= 1 {
            return LineaCartel(nombre: segmento.title, dato: Formato.clock(lap.durationSeconds), esHecho: true)
        }
        return LineaCartel(nombre: segmento.title, dato: nil, esHecho: true)
    }

    // MARK: - Dosis y pautas (antes)

    /// La dosis prescrita en una línea, por la MISMA vía que la previa del
    /// entreno (PrescriptionRenderer): «4 × 5 · 75% 1RM», «6 km · Z2». Nunca
    /// texto libre nuestro.
    private static func dosisPrescrita(_ seg: WorkoutSegment) -> String? {
        guard let p = seg.prescription else { return nil }
        let dosis = PrescriptionRenderer.rotationDose(p)
        let partes = [dosis.work, dosis.load].compactMap { $0 }
        if !partes.isEmpty { return partes.joined(separator: " · ") }
        let linea = PrescriptionRenderer.summaryLine(p)
        return [linea.headline, linea.pace].compactMap { $0 }.first
    }

    private static func pautaDelBloque(_ segmentos: [WorkoutSegment]) -> String? {
        guard let p = segmentos.first?.prescription else { return nil }
        if let rondas = p.rounds, rondas > 1 { return "\(rondas) rondas" }
        return nil
    }

    private static func pautaDeTramos(
        segmento: WorkoutSegment,
        filas: [TramosMedidos.Fila],
        cobertura: String?
    ) -> String? {
        // «400 m · 90 s rec» cuando los tramos son uniformes; la cobertura
        // («4 de 6») se añade cuando falta alguno — el hueco se declara.
        var partes: [String] = []
        if let leg = filas.first?.leg, let etiqueta = etiquetaDelTramo(leg) {
            let metros = Set(filas.compactMap { $0.leg.map(metrosDelTramo) })
            if metros.count <= 1 { partes.append(etiqueta) }
        }
        if let cobertura { partes.append(cobertura) }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    private static func metrosDelTramo(_ leg: RunLeg) -> Int {
        if case .distance(let m) = leg.measure { return m }
        if case .duration(let s) = leg.measure { return -s }   // clave distinta, no metros
        return 0
    }

    private static func etiquetaDelTramo(_ leg: RunLeg) -> String? {
        switch leg.measure {
        case .distance(let m): return Formato.distanciaCubierta(Double(m))
        case .duration(let s): return Formato.clock(s, subMinuto: .segundos)
        case .unknown: return nil
        }
    }

    // MARK: - Totales (después)

    private static func ritmoDeCorrer(_ laps: [LapRecord]) -> String? {
        let corridos = laps.filter { $0.modality == "run" }
        let dist = corridos.compactMap(\.distanceCoveredMeters).reduce(0, +)
        guard dist > 0 else { return nil }
        let tiempo = corridos
            .filter { ($0.distanceCoveredMeters ?? 0) > 0 }
            .map(\.durationSeconds).reduce(0, +)
        guard tiempo > 0 else { return nil }
        return Formato.ritmo(tiempo / (dist / 1000), .porKm)
    }

    private static func volumenLevantado(_ laps: [LapRecord]) -> String? {
        var kg = 0.0
        for lap in laps {
            guard let sets = lap.sets else { continue }
            for s in sets where s.status != "skipped" && !s.isApproach {
                guard let reps = s.repsActual, let carga = s.loadActualKg ?? s.loadPrescribedKg else { continue }
                kg += Double(reps) * carga
            }
        }
        guard kg > 0 else { return nil }
        return "\(Formato.esDecimal(kg / 1000, decimals: 1)) t"
    }

    private static func pulsoMedio(_ laps: [LapRecord]) -> Int? {
        let conPulso = laps.filter { $0.avgHRBpm != nil && $0.durationSeconds > 0 }
        let total = conPulso.map(\.durationSeconds).reduce(0, +)
        guard total > 0 else { return nil }
        let suma = conPulso.reduce(0.0) { $0 + Double($1.avgHRBpm!) * $1.durationSeconds }
        return Int((suma / total).rounded())
    }

    // MARK: - Utilidades

    private static func diaDeLaSemana(_ fecha: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "EEEE"
        return f.string(from: fecha)
    }

    /// El valor más repetido — «4×5» sale de la moda de las repeticiones, no de
    /// un promedio que nadie hizo. Empate → el más alto (da igual cuál, pero
    /// determinista).
    private static func valorModa(_ valores: [Int]) -> Int? {
        guard !valores.isEmpty else { return nil }
        var conteo: [Int: Int] = [:]
        for v in valores { conteo[v, default: 0] += 1 }
        return conteo.max { ($0.value, $0.key) < ($1.value, $1.key) }?.key
    }

    private struct GrupoDeBloque {
        let titulo: String
        let segmentos: [WorkoutSegment]
    }

    private static func agrupadosPorBloque(_ segmentos: [WorkoutSegment]) -> [GrupoDeBloque] {
        var grupos: [GrupoDeBloque] = []
        for seg in segmentos {
            let titulo = seg.blockTitle ?? seg.title
            if let ultimo = grupos.last, ultimo.titulo == titulo {
                grupos[grupos.count - 1] = GrupoDeBloque(titulo: titulo, segmentos: ultimo.segmentos + [seg])
            } else {
                grupos.append(GrupoDeBloque(titulo: titulo, segmentos: [seg]))
            }
        }
        return grupos
    }
}

private extension ISO8601DateFormatter {
    /// «2026-08-24» a secas — el formato de `DiaDelPlan.isoDate`.
    static let soloFecha: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate]
        return f
    }()
}
