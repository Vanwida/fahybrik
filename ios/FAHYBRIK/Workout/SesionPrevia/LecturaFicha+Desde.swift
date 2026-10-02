import Foundation

// DE LO QUE GUARDA LA BASE A LO QUE ENSEÑA LA FICHA — funciones puras, sin vista.
//
// Cada regla tiene su espejo en el doble (`kit-ficha/modelo.ts` y `casos.ts`, que además las prueba con
// dieciséis sesiones): qué rol tiene un bloque, qué forma, cuál es la dosis de un movimiento y contra qué.
// Todo sale de los formateadores que ya usan el motor y el vivo; aquí no se escribe ni un número nuevo.

/// Lo que la ficha necesita saber de FUERA del detalle: no está en `AssignmentDetail` y lo sabe quien abre la ficha.
struct ContextoFicha: Equatable {
    /// «Hoy», «Mañana»… Nil si quien abre no lo sabe.
    var cuando: String? = nil
    /// El nombre del coach.
    var coach: String? = nil
    /// Un entreno que montó el propio atleta.
    var esLibre = false
    var duracion: LecturaFicha.Duracion? = nil
    /// Un intento de marca: se mide, no tiene camino a mano.
    var esMarca = false
}

extension LecturaFicha {

    static func desde(plan: WorkoutPlan, detalle: AssignmentDetail?, contexto: ContextoFicha = ContextoFicha()) -> LecturaFicha {
        let ordenados = (detalle?.workout?.blocks ?? []).sorted { $0.blockPosition < $1.blockPosition }
        let reparto = RepartoDeDobles(plan: plan)
        let bloques = ordenados.map { BloqueFicha.desde($0, reparto: reparto) }
        let estaciones = detalle?.assignment.stationAssignment
        let enPareja = estaciones.map { !$0.stations.isEmpty } ?? false
        let nota = plan.coachNote
            .flatMap { $0.isEmpty ? nil : $0 }
            .map { Nota(texto: $0, firma: contexto.esLibre ? nil : contexto.coach) }
        let cabecera = Cabecera(
            titulo: plan.name,
            cuando: contexto.cuando,
            origen: contexto.esLibre ? .libre : .coach(nombre: contexto.coach),
            duracion: contexto.duracion,
            nota: nota,
            prueba: contexto.esMarca || !(detalle?.storeResults.isEmpty ?? true),
            pareja: enPareja ? Pareja(nombre: estaciones?.partnerFirstName) : nil,
            bloquesDeTrabajo: bloques.filter { $0.rol == .principal }.count
        )
        return LecturaFicha(cabecera: cabecera, bloques: bloques)
    }
}

// MARK: - Un bloque

extension BloqueFicha {

    static func desde(_ b: WorkoutBlock, reparto: RepartoDeDobles) -> BloqueFicha {
        let rol = rolDe(b)
        let resultado = formaDe(b, rol: rol, reparto: reparto)
        return BloqueFicha(
            id: b.uid,
            titulo: b.title,
            rol: rol,
            forma: resultado.forma,
            etiquetaFormato: resultado.etiqueta,
            explicacion: resultado.explicacion,
            resumen: resultado.resumen,
            nota: b.coachNote.flatMap { $0.isEmpty ? nil : $0 },
            movimientos: resultado.movimientos
        )
    }

    /// El rol sale del TÍTULO, con la misma clasificación que usa el motor (`BlockPhase`).
    static func rolDe(_ b: WorkoutBlock) -> Rol {
        switch BlockPhase.classify(title: b.title) {
        case .warmup:             return .calentamiento
        case .cooldown:           return .vuelta
        case .principal, .main:   return .principal
        }
    }

    private struct Resultado {
        let forma: Forma
        let etiqueta: String?
        let explicacion: String?
        let resumen: String
        let movimientos: [MovimientoFicha]
    }

    /// QUÉ FORMA TIENE un bloque principal, por este orden: superserie, EMOM que alterna, una simulación
    /// de estaciones, un reloj, carrera por tramos, continuo y, si nada de eso, series. El orden es el del
    /// doble y el de la previa de siempre: la superserie y el EMOM leen el MISMO pliegue que el motor, así
    /// que la ficha y el entreno no pueden discrepar (si el bloque degrada a series rectas, degrada en los dos).
    private static func formaDe(_ b: WorkoutBlock, rol: Rol, reparto: RepartoDeDobles) -> Resultado {
        if rol != .principal {
            let movs = b.items.map { MovimientoFicha.desde($0, reparto: reparto) }
            return Resultado(forma: .marco, etiqueta: nil, explicacion: nil,
                         resumen: cuantosEjercicios(movs.count), movimientos: movs)
        }
        if let pliegue = b.supersetFold {
            let movs = b.items.enumerated().map { i, item -> MovimientoFicha in
                let dosis = LecturaEjercicioPrevia.dosisDeSuperserie(item)
                return MovimientoFicha.desde(item, reparto: reparto, dosis: dosis.trabajo, contra: dosis.carga, rol: "\(i + 1)º")
            }
            return Resultado(
                forma: .superserie(rondas: pliegue.prescription.rounds),
                etiqueta: nil,
                explicacion: "Una detrás de otra, sin descanso entre ellas.",
                resumen: cuantosEjercicios(movs.count),
                movimientos: movs
            )
        }
        if let emom = b.alternatingEmom {
            let series = emom.sets ?? []
            let movs = b.items.enumerated().map { i, item -> MovimientoFicha in
                let intervalo = i < series.count
                    ? series[i].emomInterval(fallbackMovement: item.exerciseName, fallbackIsErg: series[i].modality?.isErg ?? false)
                    : nil
                return MovimientoFicha.desde(item, reparto: reparto, dosis: intervalo?.work, contra: intervalo?.detail,
                                             rol: LecturaEjercicioPrevia.turnoDelMinuto(i, de: b.items.count))
            }
            let minutos = emom.rounds
            return Resultado(
                forma: .emom(minutos: minutos, alterna: true),
                etiqueta: nil,
                explicacion: "Cada minuto toca una cosa distinta. Lo que sobra del minuto es descanso.",
                resumen: minutos.map { "\($0) min" } ?? cuantosEjercicios(movs.count),
                movimientos: movs
            )
        }

        let movs = b.items.map { MovimientoFicha.desde($0, reparto: reparto) }
        if let plegado = plegarEstaciones(movs) {
            return Resultado(
                forma: .estaciones(carrera: plegado.carrera),
                etiqueta: "For Time · \(plegado.estaciones.count) estaciones",
                explicacion: nil,
                resumen: "\(plegado.estaciones.count) estaciones",
                movimientos: plegado.estaciones
            )
        }

        let p = b.items.first?.prescription
        let esquema = p?.scheme ?? PrescriptionScheme(canonicalizing: b.format.lowercased())
        switch esquema {
        case .amrap?:
            let minutos = p?.totalS.flatMap { $0 > 0 ? $0 : nil }
            return Resultado(
                forma: .reloj(.init(grande: minutos.map { Formato.clock($0, subMinuto: .segundos) } ?? "AMRAP", pie: "AMRAP")),
                etiqueta: nil,
                explicacion: "Repite la lista tantas veces como puedas, hasta que acabe el tiempo.",
                resumen: minutos.map(minutosCortos) ?? cuantosEjercicios(movs.count),
                movimientos: movs
            )
        case .forTime?, .rounds?, .chipper?, .ladder?, .tabata?, .deathBy?:
            let reloj = relojDe(p, esquema: esquema!)
            return Resultado(
                forma: .reloj(reloj),
                etiqueta: nil,
                explicacion: esquema == .forTime || esquema == .rounds
                    ? "Hazlo lo más rápido que puedas."
                    : nil,
                resumen: reloj.grande,
                movimientos: movs
            )
        case .intervals?:
            return Resultado(forma: .intervalos, etiqueta: nil, explicacion: nil,
                         resumen: movs.first?.perfil.map { "\($0.repeticiones) \(Formato.signoPor) \($0.medida)" }
                             ?? movs.first?.dosis ?? cuantosEjercicios(movs.count),
                         movimientos: movs)
        case .steady?:
            return Resultado(forma: .continuo, etiqueta: nil, explicacion: nil,
                         resumen: movs.first?.dosis ?? cuantosEjercicios(movs.count), movimientos: movs)
        default:
            // Sin esquema que lo diga: una carrera con estructura es por tramos; un único movimiento sin series, continuo.
            if movs.contains(where: { $0.perfil != nil }) {
                return Resultado(forma: .intervalos, etiqueta: nil, explicacion: nil,
                             resumen: movs.first?.perfil.map { "\($0.repeticiones) \(Formato.signoPor) \($0.medida)" }
                                 ?? cuantosEjercicios(movs.count),
                             movimientos: movs)
            }
            if movs.count == 1, movs[0].series.isEmpty, movs[0].modalidad != .strength, movs[0].dosis != nil, !tieneVariasSeries(b.items[0]) {
                return Resultado(forma: .continuo, etiqueta: nil, explicacion: nil,
                             resumen: movs[0].dosis ?? cuantosEjercicios(1), movimientos: movs)
            }
            return Resultado(forma: .series, etiqueta: nil, explicacion: nil,
                         resumen: cuantosEjercicios(movs.count), movimientos: movs)
        }
    }

    private static func tieneVariasSeries(_ item: WorkoutItem) -> Bool {
        (item.prescription?.sets?.count ?? 0) > 1
    }

    /// «4 ejercicios» / «1 ejercicio».
    static func cuantosEjercicios(_ n: Int) -> String { "\(n) \(n == 1 ? "ejercicio" : "ejercicios")" }

    /// «12 min»; «12:30» cuando los segundos no son redondos.
    private static func minutosCortos(_ segundos: Int) -> String {
        segundos % 60 == 0 ? "\(segundos / 60) min" : Formato.clock(segundos, subMinuto: .segundos)
    }

    /// El reloj de un formato con tiempo: la cifra que lo define y qué formato es.
    private static func relojDe(_ p: Prescription?, esquema: PrescriptionScheme) -> Reloj {
        let rondas = p?.rounds.flatMap { $0 > 0 ? $0 : nil }
        let tope = p?.totalS.flatMap { $0 > 0 ? $0 : nil }
        func nRondas(_ n: Int) -> String { "\(n) ronda\(n == 1 ? "" : "s")" }
        switch esquema {
        case .forTime:
            return Reloj(grande: rondas.map(nRondas) ?? "For Time",
                         pie: tope.map { "Tope \(Formato.clock($0, subMinuto: .segundos))" } ?? "Sin tope")
        case .rounds:
            return Reloj(grande: rondas.map(nRondas) ?? "Circuito",
                         pie: (p?.restS).flatMap { $0 > 0 ? "descanso \(Formato.clock($0, subMinuto: .segundos))" : nil } ?? "Circuito")
        case .tabata:
            let trabajo = (p?.workS).flatMap { $0 > 0 ? $0 : nil }
            let descanso = (p?.restS).flatMap { $0 > 0 ? $0 : nil }
            let reparto: String
            if let trabajo {
                reparto = descanso.map { "\(trabajo)/\($0)" } ?? "\(trabajo)s"
            } else {
                reparto = "Tabata"
            }
            return Reloj(grande: reparto, pie: ["Tabata", rondas.map(nRondas)].compactMap { $0 }.joined(separator: " · "))
        case .deathBy:
            let desde = (p?.start).flatMap { $0 > 0 ? "desde \($0)" : nil }
            let sube = (p?.increment).flatMap { $0 > 0 ? "+\($0) por ronda" : nil }
            return Reloj(grande: "Death By", pie: [desde, sube].compactMap { $0 }.joined(separator: " · "))
        default:
            return Reloj(grande: esquema.displayName,
                         pie: tope.map { "Tope \(Formato.clock($0, subMinuto: .segundos))" } ?? "Sin tope")
        }
    }

    /// «Run 1 km, estación, Run 1 km, estación…» son N estaciones precedidas de la MISMA carrera, no 2N filas.
    /// Solo se pliega cuando la alternancia es exacta: una carrera distinta en medio rompe el patrón y el
    /// bloque se queda como lista.
    private static func plegarEstaciones(_ movs: [MovimientoFicha]) -> (carrera: String, estaciones: [MovimientoFicha])? {
        guard movs.count >= 4, movs.count % 2 == 0, let carrera = movs.first, let dosis = carrera.dosis else { return nil }
        for i in stride(from: 0, to: movs.count, by: 2) {
            guard movs[i].nombre == carrera.nombre, movs[i].dosis == dosis else { return nil }
        }
        for i in stride(from: 1, to: movs.count, by: 2) {
            guard movs[i].nombre != carrera.nombre else { return nil }
        }
        return (dosis, movs.enumerated().filter { $0.offset % 2 == 1 }.map(\.element))
    }
}

// MARK: - Un movimiento

extension MovimientoFicha {

    /// `dosis`, `contra` y `rol` solo se pasan cuando el BLOQUE los dicta (la rotación de una superserie o de un
    /// EMOM trae su propia dosis por turno); en todo lo demás sale de la prescripción del ítem.
    static func desde(_ item: WorkoutItem, reparto: RepartoDeDobles,
                      dosis dosisImpuesta: String? = nil, contra contraImpuesta: String? = nil,
                      rol: String? = nil) -> MovimientoFicha {
        let modalidad = LecturaEjercicioPrevia.modalidad(de: item)
        let impuesta = dosisImpuesta != nil || contraImpuesta != nil || rol != nil
        let lectura = impuesta ? LecturaDeItem() : LecturaDeItem.de(item, modalidad: modalidad)

        let medida = item.prescription?.sets?.first?.measure ?? item.scalarMeasure
        let segunTuRm = item.resolvedLoad.map { SegunTuRm(kg: $0.kgLabel, sinConfirmar: $0.needsReview) }

        // Con el %RM resuelto, lo que se carga son los KILOS: el porcentaje baja a la segunda línea.
        let contra = contraImpuesta ?? (lectura.uniforme ? (segunTuRm?.kg ?? lectura.contra) : lectura.contra)
        let pctRm = (segunTuRm != nil && lectura.uniforme) ? lectura.contra : nil

        let secundaria = [rol, pctRm, lectura.tempo.map { "tempo \($0)" }, lectura.descanso.map { "desc. \($0)" }]
            .compactMap { $0 }
            .map { $0.replacingOccurrences(of: " ", with: "\u{00A0}") }
            .joined(separator: " · ")

        return MovimientoFicha(
            id: item.uid,
            item: item,
            modalidad: modalidad,
            dosis: dosisImpuesta ?? lectura.dosis,
            contra: contra,
            zona: lectura.zona,
            secundaria: secundaria.isEmpty ? nil : secundaria,
            series: lectura.series,
            rangoDeCarga: lectura.rangoDeCarga,
            segunTuRm: segunTuRm,
            perfil: lectura.perfil,
            reparto: reparto.de(item, medida: medida),
            nota: item.notes.flatMap { $0.isEmpty ? nil : $0 }
        )
    }
}

/// Lo que se lee de la prescripción de UN ítem, antes de componer el movimiento.
private struct LecturaDeItem {
    var dosis: String?
    var contra: String?
    var zona: HRZone?
    var tempo: String?
    var descanso: String?
    var series: [MovimientoFicha.Serie] = []
    var rangoDeCarga: String?
    var perfil: MovimientoFicha.Perfil?
    /// Las series son todas iguales (o hay una): el «contra» es UNA carga, no una progresión.
    var uniforme = true

    static func de(_ item: WorkoutItem, modalidad: PrescriptionModality) -> LecturaDeItem {
        if LecturaEjercicioPrevia.forma(de: item) == .tablaDeSeries, let p = item.prescription {
            return deSeries(p)
        }
        return deLinea(item)
    }

    /// Una tabla de series: una línea si son iguales; si no, la dosis resume («5 × 5»), la carga dice de dónde
    /// a dónde va («60 → 80 kg») y las series se enseñan una a una.
    private static func deSeries(_ p: Prescription) -> LecturaDeItem {
        var l = LecturaDeItem()
        guard let filas = PrescriptionRenderer.setRows(p), let primera = filas.first else { return l }
        if PrescriptionRenderer.setsAreUniform(p) {
            l.dosis = primera.work.map { filas.count > 1 ? "\(filas.count) \(Formato.signoPor) \($0)" : $0 } ?? "\(filas.count) series"
            l.contra = primera.load
            l.tempo = primera.tempo
            l.descanso = primera.rest
            return l
        }
        let rotacion = PrescriptionRenderer.rotationDose(p)
        l.dosis = rotacion.work
        l.contra = rotacion.load
        l.uniforme = false
        l.series = filas.map { MovimientoFicha.Serie(trabajo: $0.work, carga: $0.load, descanso: $0.rest) }
        l.rangoDeCarga = rotacion.load.flatMap { $0.contains("→") ? $0 : nil }
        let tempos = Set(filas.map { $0.tempo })
        if tempos.count == 1 { l.tempo = filas[0].tempo }
        return l
    }

    /// Correr, ergo, funcional, un movimiento suelto: la línea de siempre (`summaryLine`), con la estructura
    /// de tramos cuando el coach la dictó.
    private static func deLinea(_ item: WorkoutItem) -> LecturaDeItem {
        var l = LecturaDeItem()
        let linea = LecturaEjercicioPrevia.linea(de: item)
        let p = item.prescription
        let set = p?.sets?.first
        let target = set?.target ?? p?.target
        l.dosis = linea.headline
        l.zona = linea.zone
        // El ritmo manda; sin él, la carga o la intensidad que pide la línea (152 kg, RPE 3, peso corporal).
        l.contra = linea.pace ?? item.resolvedIntensity?.paceChip ?? PrescriptionRenderer.targetLoad(target)
        if let restS = set?.restS ?? p?.restS, restS > 0 {
            l.descanso = Formato.clock(restS, subMinuto: .segundos)
        }
        l.tempo = set?.tempo
        if let p, let perfil = perfilDe(p) { l.perfil = perfil }
        return l
    }

    /// La forma de una carrera o un ergo por tramos: el trabajo de la fase PRINCIPAL (un «10' + 5×800» no son
    /// seis series) y su recuperación, dicha como se hace.
    private static func perfilDe(_ p: Prescription) -> MovimientoFicha.Perfil? {
        guard let estructura = p.structure, !estructura.isEmpty else { return nil }
        let tramos = estructura.expandedLegs()
        let principales = tramos.filter { $0.phaseRole == .main }
        let cuentan = principales.isEmpty ? tramos : principales
        let trabajos = cuentan.filter(\.isWork)
        guard let primero = trabajos.first,
              let medida = PrescriptionRenderer.measureWork(primero.measure.asMeasure) else { return nil }
        // Tramos desiguales (una pirámide) no son un «N × medida»: manda la línea de siempre, sin perfil.
        guard trabajos.allSatisfy({ PrescriptionRenderer.measureWork($0.measure.asMeasure) == medida }) else { return nil }

        let iguales = trabajos.allSatisfy { $0.target == primero.target }
        let linea = PrescriptionRenderer.structuredRunLine(p)
        let recuperaciones = cuentan.filter(\.isRecovery)
        let primeraRec = recuperaciones.first
        let recuperacionIgual = primeraRec.map { r in
            recuperaciones.allSatisfy { $0.measure == r.measure && $0.recoveryMode == r.recoveryMode && $0.target == r.target }
        } ?? false
        return MovimientoFicha.Perfil(
            repeticiones: trabajos.count,
            medida: medida,
            zona: iguales ? linea?.zone : nil,
            ritmo: iguales ? linea?.pace : nil,
            recuperacion: recuperacionIgual ? primeraRec.flatMap(PrescriptionRenderer.fraseDeRecuperacion) : nil,
            recuperacionActiva: primeraRec.map { $0.recuperaEnMovimiento } ?? false
        )
    }
}

// MARK: - Dobles

/// El reparto de cada estación cuando se entrena en pareja. Sale de la MISMA anotación que el motor
/// (`WorkoutSegment.doblesSplit`, que ya resuelve quién es quién): la ficha no vuelve a interpretar el pacto.
struct RepartoDeDobles {
    private let porSegmento: [Int: SegmentDoblesSplit]

    init(plan: WorkoutPlan) {
        var d: [Int: SegmentDoblesSplit] = [:]
        for s in plan.segments {
            if let id = s.templateSegmentId, let split = s.doblesSplit { d[id] = split }
        }
        porSegmento = d
    }

    func de(_ item: WorkoutItem, medida: Measure?) -> MovimientoFicha.Reparto? {
        guard let id = item.templateSegmentId, let split = porSegmento[id] else { return nil }
        switch split.role {
        case .mine:    return MovimientoFicha.Reparto.tuya
        case .partner: return .suya(nombre: split.partnerName)
        case .split:
            guard let (tuya, total) = Self.partes(medida, parteTuya: split.selfShare) else { return nil }
            return .mitad(tuParte: tuya, total: total)
        }
    }

    /// Tu parte y el total, en la unidad de la medida. Solo cuando se puede decir sin inventar: una medida
    /// desconocida o «al fallo» no se reparte.
    private static func partes(_ medida: Measure?, parteTuya share: Double) -> (String, String)? {
        guard let medida else { return nil }
        switch medida {
        case let .reps(n, _):
            let mia = Int((Double(n) * share).rounded())
            return ("\(mia) reps", "\(n) reps")
        case let .distance(metros, _):
            guard let mia = Formato.distancia((metros * share).rounded()), let total = Formato.distancia(metros) else { return nil }
            return (mia, total)
        case let .duration(segundos, _):
            return (Formato.clock(Int((Double(segundos) * share).rounded()), subMinuto: .segundos),
                    Formato.clock(segundos, subMinuto: .segundos))
        case let .calories(n, _):
            return ("\(Int((Double(n) * share).rounded())) cal", "\(n) cal")
        case .repsToFailure, .unknown:
            return nil
        }
    }
}
