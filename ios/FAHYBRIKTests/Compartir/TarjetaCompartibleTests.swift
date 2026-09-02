import XCTest
@testable import FAHYBRIK

/// LA TARJETA QUE SE COMPARTE (card 132) — el dominio, contra sus reglas.
///
/// Lo que se prueba son las FRASES del contrato, no las piezas: que lo que no
/// cabe se declara (nunca se recorta en silencio), que una tanda de series sale
/// como parciales y no como «8 × 400 m», que el calentamiento no va, y que la
/// semana no colapsa los estados que mentirían.
final class TarjetaCompartibleTests: XCTestCase {

    // MARK: - Andamio

    private func linea(_ n: Int) -> LineaCartel {
        LineaCartel(nombre: "Ejercicio \(n)", dato: "4×5", esHecho: false)
    }

    private func bloqueLista(_ titulo: String, lineas: Int) -> BloqueCartelCompartir {
        BloqueCartelCompartir(
            titulo: titulo, pauta: nil,
            cuerpo: .lista((0..<lineas).map(linea))
        )
    }

    /// El alto que el dibujo gastaría con este reparto — la misma aritmética
    /// del presupuesto, sumada desde fuera para auditar el recorte.
    private func altoDe(_ r: RecorteCartel.Resultado, conClub: Bool, conResultado: Bool) -> CGFloat {
        var alto = Presupuesto.padding * 2 + Presupuesto.titular
        if conClub { alto += Presupuesto.club }
        if conResultado { alto += Presupuesto.resultado }
        for b in r.visibles {
            alto += Presupuesto.cabeceraBloque + CGFloat(b.lineas) * Presupuesto.linea
        }
        if r.ocultos > 0 { alto += Presupuesto.mas }
        return alto
    }

    // MARK: - El recorte declara, nunca calla

    func testLoQueNoCabeSeDeclara() {
        let bloques = [bloqueLista("Estaciones", lineas: 8), bloqueLista("Core", lineas: 6)]
        let r = RecorteCartel.recortar(bloques, conClub: true, conResultado: false)
        let dentro = r.visibles.reduce(0) { $0 + $1.cosas }
        XCTAssertEqual(dentro + r.ocultos, 14, "cada ejercicio está dentro o está contado — ninguno desaparece")
        XCTAssertGreaterThan(r.ocultos, 0, "14 líneas no caben en la tarjeta: algo tiene que declararse")
    }

    /// El agujero que se midió en el doble (702 px de 700): cuando lo único que
    /// se cae es el ÚLTIMO bloque, la línea «+N más» también necesita su sitio.
    func testLaLineaDeMasTieneSitioReservado() {
        let bloques = [bloqueLista("Estaciones", lineas: 8), bloqueLista("Core", lineas: 6)]
        for conClub in [true, false] {
            let r = RecorteCartel.recortar(bloques, conClub: conClub, conResultado: false)
            XCTAssertLessThanOrEqual(
                altoDe(r, conClub: conClub, conResultado: conClub == false ? false : false),
                Presupuesto.altoMaximo,
                "la tarjeta jamás se pasa de su tope, tampoco contando la línea de «+N más»"
            )
        }
    }

    func testUnEntrenoNormalCabeEnteroSinLineaDeMas() {
        // Sin fila de héroe: la de ANTES. Fuerza + ski caben enteros.
        let bloques = [bloqueLista("Fuerza", lineas: 3), bloqueLista("SkiErg", lineas: 1)]
        let r = RecorteCartel.recortar(bloques, conClub: true, conResultado: false)
        XCTAssertEqual(r.ocultos, 0)
        XCTAssertEqual(r.visibles.count, 2)
    }

    /// El caso EXACTO que Alex aprobó en el doble (la tarjeta de después, con
    /// héroe y club): la fuerza entra, el ski se declara como «+1 más». Si un
    /// cambio del presupuesto hace que esto cambie, tiene que verse aquí.
    func testLaDeDespuesConHeroePriorizaYDeclara() {
        let bloques = [bloqueLista("Fuerza", lineas: 3), bloqueLista("SkiErg", lineas: 1)]
        let r = RecorteCartel.recortar(bloques, conClub: true, conResultado: true)
        XCTAssertEqual(r.visibles.map(\.titulo), ["Fuerza"])
        XCTAssertEqual(r.ocultos, 1, "el ski no desaparece: se cuenta")
    }

    func testUnBloqueDeUnaSolaLineaNoSeCaePorPedirSitioParaDos() {
        // Tras el bloque de 5 queda sitio para una fila y pico: un bloque de
        // UNA línea entra (partirlo era imposible, pedirle sitio para dos
        // sería echarlo sin motivo).
        let bloques = [bloqueLista("Principal", lineas: 5), bloqueLista("Remate", lineas: 1)]
        let r = RecorteCartel.recortar(bloques, conClub: false, conResultado: false)
        XCTAssertEqual(r.ocultos, 0, "un bloque de una línea cabe donde cabe una línea")
    }

    // MARK: - La tanda de series sale como parciales

    /// Una sesión con un bloque de carrera estructurada MEDIDA tramo a tramo
    /// tiene que salir como `serie` — el porqué entero de la tarjeta.
    @MainActor
    func testLaTandaMedidaSaleComoParcialesConLaMejorMarcada() {
        let s = sesionConTramosMedidos(tiempos: [88, 87, 86, 85, 84, 82])
        let tarjeta = TarjetaCompartibleBuilder.despues(session: s, totalSeconds: 1800)

        guard case .serie(let reps)? = tarjeta.bloques.first?.cuerpo else {
            return XCTFail("una tanda medida tramo a tramo no puede salir como lista")
        }
        XCTAssertEqual(reps.count, 6)
        XCTAssertEqual(reps.filter(\.mejor).count, 1, "la mejor se marca sola, y es una")
        XCTAssertTrue(reps.last!.mejor, "la de 82 s es la mejor")
        XCTAssertTrue(reps.allSatisfy { $0.etiqueta == nil },
                      "tramos uniformes: la etiqueta por repetición sobra, la pauta ya lo dice")
    }

    // MARK: - El antes no lleva calentamiento

    func testElCalentamientoNoVaEnLaTarjetaDeAntes() {
        let calentamiento = segmento("Movilidad", bloque: "Calentamiento", scheme: .warmup)
        let fuerza = segmento("Back squat", bloque: "Fuerza", scheme: .sets)
        let plan = plan(segmentos: [calentamiento, fuerza])

        let tarjeta = TarjetaCompartibleBuilder.antes(plan: plan)
        XCTAssertEqual(tarjeta.bloques.map(\.titulo), ["Fuerza"],
                       "nadie publica su movilidad — y no cuenta como recorte")
    }

    // MARK: - La semana no miente

    func testLaSemanaConservaLosEstadosQueMentirianColapsados() {
        let semana = SemanaDelPlan(
            dias: [
                dia("L", estado: .hecha, sesiones: 1),
                dia("M", estado: .parcial, sesiones: 1),
                dia("X", estado: .descanso, sesiones: 0),
                dia("J", estado: .saltada, sesiones: 1),
                dia("V", estado: .pendiente, sesiones: 1),
            ],
            indiceHoy: nil, intencion: "Semana de carga", nombreBloque: "Carga · 3", planStartsOn: nil
        )
        let tarjeta = TarjetaCompartibleBuilder.semana(semana)

        XCTAssertEqual(tarjeta.dias.map(\.estado),
                       [.hecha, .parcial, .descanso, .saltada, .pendiente],
                       "cinco estados entran, cinco salen: parcial no es hecha y saltada no es descanso")
        // Trabajadas = hecha + parcial (las dos dejaron trabajo); previstas = 4.
        XCTAssertEqual(tarjeta.totales, "2/4 sesiones")
        XCTAssertEqual(tarjeta.titulo, "Carga · 3", "el título es el nombre del COACH")
        XCTAssertEqual(tarjeta.sesiones.count, 2, "la lista lleva solo lo trabajado")
    }

    // MARK: - Constructores de andamio

    private func segmento(_ titulo: String, bloque: String, scheme: PrescriptionScheme) -> WorkoutSegment {
        WorkoutSegment(
            order: 1, title: titulo, kind: .strength,
            blockTitle: bloque, blockPosition: 1,
            prescription: Prescription(
                scheme: scheme, modality: nil,
                sets: [PrescriptionSet(measure: .reps(5), target: nil, modality: nil,
                                       restS: nil, tempo: nil, note: nil)],
                rounds: nil, workS: nil, restS: nil, totalS: nil,
                target: nil, note: nil, start: nil, increment: nil
            )
        )
    }

    private func plan(segmentos: [WorkoutSegment]) -> WorkoutPlan {
        WorkoutPlan(id: UUID(), name: "Prueba", format: .sets,
                    estimatedDurationSeconds: 3600, blockContext: "",
                    zoneTargets: [], equipment: [], segments: segmentos,
                    coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    }

    private func dia(_ inicial: String, estado: EstadoDiaPlan, sesiones: Int) -> DiaDelPlan {
        DiaDelPlan(
            isoDate: "2026-08-24",
            diaSemana: 1, inicial: inicial, nombre: inicial, numero: 1,
            sesiones: (0..<sesiones).map { i in sesionDeSemana(id: "\(inicial)-\(i)", titulo: "Sesión \(inicial)") },
            estado: estado, esHoy: false
        )
    }

    /// `AthleteWeekDaySession` solo se construye decodificando (su init es el
    /// del cable): la prueba lo fabrica por el mismo camino que producción.
    private func sesionDeSemana(id: String, titulo: String) -> AthleteWeekDaySession {
        let json = """
        {"assignmentId": "\(id)", "slot": "am", "title": "\(titulo)", "status": "assigned"}
        """
        return try! JSONDecoder().decode(AthleteWeekDaySession.self, from: Data(json.utf8))
    }

    /// Una sesión de series de calle con los tramos MEDIDOS uno a uno, por el
    /// mismo camino que los graba el motor: laps con `runLegIndex` apuntando al
    /// índice PLANO de la pierna de trabajo (recuperaciones incluidas), que es
    /// como los escribe el vivo. Las piernas se DERIVAN de la prescripción de
    /// intervals — la misma derivación que usa la muñeca.
    @MainActor
    private func sesionConTramosMedidos(tiempos: [Double]) -> WorkoutSession {
        let series = tiempos.map { _ in
            PrescriptionSet(measure: .distance(meters: 400), target: nil, modality: .run,
                            restS: 90, tempo: nil, note: nil)
        }
        let seg = WorkoutSegment(
            order: 1, title: "Series", kind: .running,
            blockTitle: "Series", blockPosition: 1,
            prescription: Prescription(
                scheme: .sets, modality: .run, sets: series,
                rounds: nil, workS: nil, restS: nil, totalS: nil,
                target: nil, note: nil, start: nil, increment: nil
            )
        )
        let plan = WorkoutPlan(id: UUID(), name: "8 × 400", format: .sets,
                               estimatedDurationSeconds: 1800, blockContext: "",
                               zoneTargets: [], equipment: [], segments: [seg],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        let s = WorkoutSession(plan: plan)
        s.start()

        let piernas = seg.runStructureLegs ?? []
        let indicesDeTrabajo = piernas.enumerated().filter { $0.element.isWork }.map(\.offset)
        XCTAssertGreaterThanOrEqual(indicesDeTrabajo.count, tiempos.count,
                                    "la derivación tiene que dar una pierna de trabajo por serie")

        for (i, t) in tiempos.enumerated() {
            s.laps.append(LapRecord(
                id: UUID(), segmentId: seg.id, templateSegmentId: nil, position: 1,
                modality: "run", startedAt: Date(), endedAt: Date().addingTimeInterval(t),
                durationSeconds: t, avgHRBpm: nil, maxHRBpm: nil, zoneSecondsByZone: [:],
                repsCompleted: nil, distanceCoveredMeters: 400,
                avgPaceSecPer500m: nil, avgPaceSecPerKm: t / 0.4, avgPowerWatts: nil,
                strokeRateSpm: nil, calories: nil, weightUsedKg: nil, source: "manual",
                runLegIndex: indicesDeTrabajo[i]
            ))
        }
        return s
    }
}
