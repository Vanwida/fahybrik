import XCTest
@testable import FAHYBRIK

// EL EMOM, DE CABO A RABO: motor → trama → cable → guion → páginas — Y en
// solitario, motor → guion → páginas sin cable de por medio. El fallo que
// arregla esta noche vivía justo en el punto donde ninguno de los dos tests
// de guion puro (`GuionEmomTests`) podía verlo: `PrescriptionSet.modality`
// YA sabía si una ronda era máquina, y ni el cable (`MirrorTramo`) ni el
// adaptador (`GuionDelEspejo.emom`) lo llevaban — así que toda ronda, ski o
// burpees, llegaba a la muñeca como `.ojeada`.
@MainActor
final class EspejoEmomTests: XCTestCase {

    private var mirror: PhoneMirrorService { PhoneMirrorService.shared }

    private func paginasEnLaMuneca(_ s: WorkoutSession) throws -> [WatchPagina] {
        let enviada = mirror.buildFrame(from: s)
        let bytes = try MirrorWire.encoder.encode(enviada)
        let recibida = try MirrorWire.decoder.decode(MirrorStateFrame.self, from: bytes)
        return GuionDelEspejo.paginas(recibida, bpm: nil, elapsed: 0, avanzar: {})
    }

    /// Ski/bici alternando con burpees a pulso — sin parada explícita
    /// (`restS: nil`), así que un toque basta para pasar de una ronda a la
    /// siguiente. La ronda 1 es máquina (`.ski`); la ronda 2, a pulso.
    private func alternatingEmomSession() -> WorkoutSession {
        let ski = PrescriptionSet(measure: .duration(seconds: 45), target: nil,
                                  modality: .ski, restS: nil, tempo: nil, note: "Ski")
        let burpees = PrescriptionSet(measure: .reps(10), target: nil,
                                      modality: .functional, restS: nil, tempo: nil, note: "Burpees")
        let rx = Prescription(scheme: .emom, modality: .functional, sets: [ski, burpees],
                              rounds: 20, workS: 45, restS: nil, totalS: nil,
                              target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "EMOM alternante", kind: .reps,
                                 blockTitle: "Principal", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "EMOM ski/burpees", format: .emom, estimatedDurationSeconds: 1_200,
            blockContext: "Metcon", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, demoVideoUrl: nil, warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    // MARK: - Espejo (cable)

    func testEspejoRondaDeSkiEsOjeada() throws {
        let s = alternatingEmomSession()
        s.primaryAdvance()                 // salta el 3-2-1 → ronda 1 (ski)
        let p = try XCTUnwrap(try paginasEnLaMuneca(s).first)
        XCTAssertEqual(p.contexto, "Ronda 1 / 20")
        XCTAssertEqual(p.modo, .ojeada, "ski es máquina: el cuerpo va estable, se puede mirar")
    }

    func testEspejoRondaDeBurpeesEsCiega() throws {
        let s = alternatingEmomSession()
        s.primaryAdvance()                 // salta el 3-2-1 → ronda 1 (ski)
        s.primaryAdvance()                 // sin parada explícita → ronda 2 (burpees)
        let p = try XCTUnwrap(try paginasEnLaMuneca(s).first)
        XCTAssertEqual(p.contexto, "Ronda 2 / 20")
        XCTAssertEqual(p.modo, .ciego,
            "ANTES de tareaEsErgo esto llegaba .ojeada siempre — burpees en el suelo no puede mirar")
    }

    // MARK: - En solitario (sin cable)

    func testSolitarioRondaDeSkiEsOjeada() throws {
        let s = alternatingEmomSession()
        s.primaryAdvance()
        let e = GuionEmom.estadoSolitario(s)
        let p = try XCTUnwrap(GuionEmom.paginas(e).first)
        XCTAssertEqual(p.contexto, "Ronda 1 / 20")
        XCTAssertEqual(p.modo, .ojeada)
    }

    func testSolitarioRondaDeBurpeesEsCiega() throws {
        let s = alternatingEmomSession()
        s.primaryAdvance()
        s.primaryAdvance()
        let e = GuionEmom.estadoSolitario(s)
        let p = try XCTUnwrap(GuionEmom.paginas(e).first)
        XCTAssertEqual(p.contexto, "Ronda 2 / 20")
        XCTAssertEqual(p.modo, .ciego)
    }

    /// El gesto de marcar tarea, en solitario, es el mismo `primaryAdvance()`
    /// que ya usa el resto del motor — no hace falta una acción nueva. Aquí se
    /// prueba que `gestosSolitario` lo enchufa de verdad: tocar avanza la
    /// ronda.
    func testSolitarioMarcarTareaAvanzaLaRonda() throws {
        let s = alternatingEmomSession()
        s.primaryAdvance()                 // ronda 1
        let g = GuionEmom.gestosSolitario(s)
        let antes = s.emomIntervalIndex
        g.marcarHecha?()
        XCTAssertEqual(s.emomIntervalIndex, antes + 1, "el toque en la muñeca tiene que rodar la ronda")
    }

    /// Cero Bluetooth en el reloj a solas: aunque la ronda sea máquina, no hay
    /// metros que enseñar — es arquitectónico, no un hueco.
    func testSolitarioNuncaEnseñaMetrosDeMaquina() throws {
        let s = alternatingEmomSession()
        s.primaryAdvance()                 // ronda 1, ski
        let e = GuionEmom.estadoSolitario(s)
        XCTAssertFalse(e.maquina)
        XCTAssertNil(e.metrosMaquina)
    }
}
