import XCTest
@testable import FAHYBRIK

// LA FAMILIA WOD: los planes del contrato (`screens/iphone-vivo-wod/`) entran en
// el modelo por el adaptador, el paso vivo sigue al motor, y lo que el atleta
// marca (el «Hecho» del EMOM y del death by, las rondas y la puntuación del
// AMRAP) se decide con las reglas puras de `Vivo+Wod`.
final class VivoWodTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba

    @MainActor
    private func estado(_ s: WorkoutSession) -> Vivo.EstadoVivo {
        Vivo.estadoDe(s, plan: Vivo.planDe(s.plan, zonas: s.hrZones, entorno: s.runEnvironment))
    }

    /// Los pasos en una línea cada uno: lo que sale en el mensaje si algo no casa.
    private func volcado(_ pasos: [Vivo.Paso]) -> String {
        pasos.enumerated().map { i, p in
            "\(i) \(p.id) \(p.clase.rawValue)/\(p.rol.rawValue) «\(p.nombre ?? "-")» pos=\(Vivo.posicionDe(p)) wod=\(p.wod?.formato.rawValue ?? "-") maq=\(p.maquina?.tipo.rawValue ?? "-") med=\(p.medida.tipo.rawValue):\(p.medida.prescrito.map { Vivo.num($0) } ?? "-")/\(p.medida.mide.rawValue) cierre=\(p.cierre.rawValue)"
        }.joined(separator: "\n")
    }

    // MARK: - EMOM (498)

    @MainActor
    func testElEmom498SonDoceMinutosAlternos() throws {
        let s = P.arranca(try P.emom498())
        s.skipCountIn()
        let e = estado(s)
        let v = volcado(e.pasos)
        XCTAssertEqual(e.pasos.count, 12, v)
        XCTAssertEqual(Vivo.posicionDe(e.paso), ["Minuto 1/12"], v)
        XCTAssertEqual(Vivo.formatoDe(e.paso), "EMOM 12′", v)
        XCTAssertEqual(Vivo.trabajoDe(e.paso, e.lecturas, heroe: .falta)?.valor, "6 Bench Press · 60 kg", v)
        let row = e.pasos[1]
        XCTAssertEqual(row.maquina?.tipo, .remo, v)
        XCTAssertEqual(Vivo.trabajoDe(row, e.lecturas, heroe: .falta)?.valor, "Row · todo el minuto", "«Row 1′» en un EMOM de 1′ es la ventana entera\n\(v)")
        // «Hecho» marca la tarea con dosis; el remo de todo el minuto lo lleva el reloj.
        XCTAssertTrue(Vivo.seMarca(e.paso))
        XCTAssertFalse(Vivo.seMarca(row))
        XCTAssertEqual(Vivo.primariaWod(e.paso, porDefecto: Vivo.clavePorDefecto(e.paso), .init()), .hecho)
        XCTAssertNil(Vivo.primariaWod(row, porDefecto: Vivo.clavePorDefecto(row), .init()))
        let hecho = Vivo.EstadoWod(hechas: [e.paso.id: 22])
        XCTAssertNil(Vivo.primariaWod(e.paso, porDefecto: .hecho, hecho), "marcada: manda el reloj")
        XCTAssertEqual(Vivo.heroeWod(e.paso, Vivo.heroeDeFamilia(e.paso, e.lecturas, e.zonas), hecho).etiqueta, "respiro")
        XCTAssertEqual(Vivo.avisoWod(e.paso), "Bench Press hecho")
        // La vez anterior es la de la MISMA tarea (el minuto 3 mira el 1, no el remo del 2).
        XCTAssertEqual(Vivo.ultimaVezDe(e.pasos, 2, [e.pasos[0].id: 22, e.pasos[1].id: 5]), 22)
        XCTAssertNil(Vivo.ultimaVezDe(e.pasos, 2, [:]))
    }

    // MARK: - AMRAP y su campana

    @MainActor
    func testElAmrapConRemoLlevaSuMaquinaYSuCampana() throws {
        let s = P.arranca(try P.amrapRemo())
        s.tickConditioning(dt: 3.5)
        let e = estado(s)
        let v = volcado(e.pasos)
        XCTAssertEqual(e.pasos.count, 2, "la ventana y su puntuación\n\(v)")
        XCTAssertEqual(e.paso.maquina?.tipo, .remo, v)
        guard case let .amrap(tareas, d)? = e.paso.wod else { return XCTFail(v) }
        XCTAssertEqual(d, 720)
        XCTAssertEqual(Vivo.repsPorRonda(tareas), 26, "el Row cuenta 1")
        XCTAssertEqual(Vivo.formatoDe(e.paso), "AMRAP 12′")
        XCTAssertEqual(Vivo.primariaWod(e.paso, porDefecto: Vivo.clavePorDefecto(e.paso), .init()), .rondaHecha)
        XCTAssertEqual(Vivo.luegoDe(e.pasos, e.i)?.que, "Puntuación")
        let m = Vivo.metricasDelPaso(e.paso, e.lecturas, heroe: .crono, e.zonas, .init(rondas: 3))
        XCTAssertEqual(m.map(\.clave), [.tarea, .split, .pulso], "\(m)")
        XCTAssertEqual(m.first?.valor, "250\u{00A0}m Row")
        XCTAssertEqual(Vivo.avisoWod(e.paso, ronda: 4), "Ronda 4 anotada")

        // Cinco rondas y la campana: el motor espera y el paso vivo es la puntuación.
        for _ in 0..<5 { s.bumpAmrapRound() }
        s.condStartElapsed = s.lapElapsedSeconds - 720
        s.tickConditioning(dt: 0.25)
        XCTAssertTrue(s.isAwaitingFinishDecision)
        XCTAssertTrue(Vivo.esperaPuntuacion(s))
        let c = estado(s)
        XCTAssertEqual(c.i, 1, v)
        XCTAssertEqual(Vivo.posicionDe(c.paso), ["Puntuación"])
        XCTAssertEqual(Vivo.primariaWod(c.paso, porDefecto: Vivo.clavePorDefecto(c.paso), .init()), .guardar)
        let dial = Vivo.dialDelMotor(rondas: s.capturedScoreRounds, reps: s.capturedScoreReps)
        XCTAssertEqual(dial, Vivo.Dial(rondas: 5, reps: nil), "sin contar, las reps son «—», nunca 0")
        let h = Vivo.heroeDeFamilia(c.paso, c.lecturas, c.zonas, .init(rondas: dial.rondas, repsSueltas: dial.reps))
        XCTAssertEqual(h.texto, "5 + —"); XCTAssertEqual(h.etiqueta, "rondas + reps")
        XCTAssertEqual(Vivo.textoPuntuacion(dial, tareas), "reps sin decir")
        let dicho = Vivo.girarPuntuacion(Vivo.girarPuntuacion(dial, campo: .reps, delta: 10, porRonda: 26), campo: .reps, delta: 6, porRonda: 26)
        XCTAssertEqual(dicho, Vivo.Dial(rondas: 5, reps: 16))
        XCTAssertEqual(Vivo.textoPuntuacion(dicho, tareas), "hasta Row + 15 Wall Ball")
    }

    @MainActor
    func testUnAmrapEnMedioNoPideLaPuntuacion() throws {
        // Detrás de un AMRAP que no cierra el plan el motor no para: no hay campana que prometer.
        let amrap = "{ \"scheme\": \"amrap\", \"total_s\": 600, \"sets\": [\(P.set(P.reps(10)))] }"
        let vuelta = "{ \"scheme\": \"steady\", \"modality\": \"run\", \"sets\": [\(P.set(P.segs(600)))] }"
        let plan = try P.plan("AMRAP y vuelta", [
            P.bloque("AMRAP 10", formato: "amrap", pos: 1, [P.item("a1", "Burpee", cat: "functional", rx: amrap), P.item("a2", "Air Squat", cat: "functional", rx: amrap)]),
            P.bloque("Vuelta a la calma", formato: "steady", pos: 2, [P.item("v1", "Carrera", cat: "running", rx: vuelta)])])
        let pasos = Vivo.planDe(plan, zonas: nil, entorno: .outdoor).pasos
        XCTAssertFalse(pasos.contains { if case .puntuacion = $0.wod { return true } else { return false } }, volcado(pasos))
    }

    // MARK: - For Time (chipper)

    @MainActor
    func testElChipperDeDiezEstaciones() throws {
        let s = P.arranca(try P.chipper10(), entorno: .outdoor)
        s.tickConditioning(dt: 3.5)
        s.markRoundDone()
        let e = estado(s)
        let v = volcado(e.pasos)
        XCTAssertEqual(e.pasos.count, 10, v)
        XCTAssertEqual(e.i, 1, v)
        XCTAssertEqual(Vivo.posicionDe(e.paso), ["Wall Ball", "Estación 2/10"], v)
        XCTAssertEqual(Vivo.formatoDe(e.paso), "For Time · cap 25′")
        XCTAssertEqual(Vivo.trabajoDe(e.paso, e.lecturas, heroe: .crono)?.valor, "40 Wall Ball · 9 kg")
        XCTAssertEqual(Vivo.textoEstacion(e.pasos[2]), "30 cal Row", v)
        XCTAssertEqual(Vivo.textoEstacion(e.pasos[8]), "100\u{00A0}m Farmers Carry · 2 × 24 kg", v)
        XCTAssertEqual(Vivo.textoEstacion(e.pasos[9]), "Run · 800\u{00A0}m", "la carrera usa la cara de correr\n\(v)")
        XCTAssertEqual(e.pasos[2].cierre, .medida, "el Row por calorías se cierra solo")
        XCTAssertEqual(Vivo.primariaWod(e.paso, porDefecto: Vivo.clavePorDefecto(e.paso), .init()), .estacionHecha)
        let a = Vivo.alrededorDe(e.pasos, e.i, e.parciales)
        XCTAssertEqual(a.anterior?.paso.nombre, "Double Under")
        XCTAssertEqual(a.siguiente?.nombre, "Row")
        XCTAssertEqual(a.masAdelante, 7)
        XCTAssertEqual(a.masAtras, 0)
    }

    // MARK: - Tabata

    @MainActor
    func testElTabataDeBurpeeARpe10() throws {
        let s = P.arranca(try P.tabataBurpee())
        s.tickConditioning(dt: 3.5)
        let e = estado(s)
        let v = volcado(e.pasos)
        XCTAssertEqual(e.pasos.count, 15, v)
        XCTAssertEqual(Vivo.posicionDe(e.paso), ["Burpee", "Ronda 1/8", "RPE 10"], v)
        XCTAssertNil(Vivo.primariaWod(e.paso, porDefecto: Vivo.clavePorDefecto(e.paso), .init()), "manda el reloj")
        XCTAssertEqual(Vivo.primariaWod(e.pasos[1], porDefecto: Vivo.clavePorDefecto(e.pasos[1]), .init()), .empezarYa)
        // Al descanso y vuelta: la ronda 2 empieza.
        s.tickConditioning(dt: 20)
        XCTAssertEqual(estado(s).i, 1)
        s.tickConditioning(dt: 10)
        XCTAssertEqual(estado(s).i, 2)
    }

    // MARK: - Death by

    @MainActor
    func testElDeathByMarcaYElRelojCaza() throws {
        let s = P.arranca(try P.deathByBurpee())
        s.tickConditioning(dt: 3.5)
        for _ in 0..<6 { s.tickConditioning(dt: 60) }
        let e = estado(s)
        let v = volcado(e.pasos)
        XCTAssertEqual(e.i, 6, v)
        XCTAssertEqual(Vivo.posicionDe(e.paso), ["Minuto 7"])
        XCTAssertEqual(Vivo.formatoDe(e.paso), "Death by · +1 cada 1′")
        let base = Vivo.heroeDeFamilia(e.paso, e.lecturas, e.zonas)
        XCTAssertEqual(base.texto, "7"); XCTAssertEqual(base.unidad, "Burpee"); XCTAssertEqual(base.etiqueta, "este minuto")
        let hechas = Dictionary(uniqueKeysWithValues: e.pasos.prefix(6).enumerated().map { ($1.id, Double([6, 9, 13, 18, 24, 31][$0])) })
        XCTAssertEqual(Vivo.ultimaVezDe(e.pasos, e.i, hechas), 31)
        XCTAssertEqual(Vivo.primariaWod(e.paso, porDefecto: Vivo.clavePorDefecto(e.paso), .init(hechas: hechas)), .hecho)
        var marcado = hechas
        marcado[e.paso.id] = 22
        XCTAssertEqual(Vivo.heroeWod(e.paso, base, .init(hechas: marcado)).etiqueta, "hecho en 0:22 · respiro")
        XCTAssertEqual(Vivo.avisoWod(e.paso), "7 Burpee hechos")
        XCTAssertEqual(Vivo.luegoDe(e.pasos, e.i)?.que, "Minuto 8 · 8 Burpee")
        // El minuto 7 cerrado sin marcar: te cazó; la puntuación son los seis marcados.
        XCTAssertTrue(Vivo.cazadoEn(e.pasos, iCerrado: 6, hechas: hechas))
        XCTAssertFalse(Vivo.cazadoEn(e.pasos, iCerrado: 6, hechas: marcado))
        XCTAssertEqual(Vivo.resultadoDeathBy(e.pasos, hechas), "6 minutos completos · te cazó el 7")
    }
}
