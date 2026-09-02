import XCTest
@testable import FAHYBRIK

// FH-33 — Vivo/Datos: Apple meters or an honest hole. Never the plan target.
final class RodajeMedidaTests: XCTestCase {

    private func calle(
        metros: Double? = nil,
        ritmo: Int? = nil,
        objetivoM: Double? = nil,
        objetivoS: Double? = nil,
        segundos: Double = 90,
        serie: Bool = false
    ) -> RodajeMedida.Entrada {
        RodajeMedida.Entrada(
            esCalle: true,
            metrosApple: metros,
            ritmoSecPorKm: ritmo,
            objetivoMetros: objetivoM,
            objetivoSegundos: objetivoS,
            segundosPieza: segundos,
            esSerie: serie
        )
    }

    // 1. Calle, no Apple meters → clock + sin señal. No 0,00.
    func testCalleSinMetrosNoInventaCero() {
        let l = RodajeMedida.vivo(calle(objetivoM: 5_000, segundos: 42))
        XCTAssertEqual(l.sujeto, WatchFormat.clock(42))
        XCTAssertTrue(l.notaSinSenal)
        XCTAssertNil(l.ritmoSecPorKm)
        XCTAssertFalse(l.sujeto.contains("0,00"))
        XCTAssertNotEqual(l.sujeto, "5000")
        XCTAssertNotEqual(l.unidad, "km")
    }

    // 2. Calle + Apple meters → remaining of the piece + pace.
    func testCalleConMetrosMueveElRestante() {
        let l = RodajeMedida.vivo(calle(metros: 1_200, ritmo: 300, objetivoM: 5_000))
        XCTAssertEqual(l.sujeto, WatchDistancia.cifra(3_800))
        XCTAssertEqual(l.unidad, WatchDistancia.unidad(3_800))
        XCTAssertEqual(l.ritmoSecPorKm, 300)
        XCTAssertTrue(l.quedan)
        XCTAssertFalse(l.notaSinSenal)
    }

    // 3. Meters arrived; pace 0 is not a reading.
    func testTrasMetrosUnRitmoCeroNoSePinta() {
        let l = RodajeMedida.vivo(calle(metros: 400, ritmo: 0, objetivoM: 1_000))
        XCTAssertNil(l.ritmoSecPorKm)
        XCTAssertFalse(l.notaSinSenal)
        XCTAssertNotEqual(l.sujeto, "0")
    }

    // 4. Indoor + Apple meters → Watch figure. Never "sin señal".
    func testIndoorConMetrosEsCifraWatch() {
        var e = calle(metros: 220, ritmo: 330, objetivoM: 1_000)
        e.esCalle = false
        let l = RodajeMedida.vivo(e)
        XCTAssertEqual(l.sujeto, WatchDistancia.cifra(780))
        XCTAssertEqual(l.ritmoSecPorKm, 330)
        XCTAssertFalse(l.notaSinSenal)
    }

    // 5. Indoor + no meters → hole, not the plan target.
    func testIndoorSinMetrosNoPintaElPlan() {
        var e = calle(objetivoM: 1_000, segundos: 15)
        e.esCalle = false
        let l = RodajeMedida.vivo(e)
        XCTAssertEqual(l.sujeto, WatchFormat.clock(15))
        XCTAssertFalse(l.notaSinSenal)
        XCTAssertNotEqual(l.sujeto, "1000")
        XCTAssertNotEqual(l.unidad, "m")
    }

    // 6. 5×500, covered nil → subject is the piece clock, not "500".
    func testSerieSinAppleNoCongelaElObjetivo() {
        let l = RodajeMedida.vivo(calle(objetivoM: 500, segundos: 8, serie: true))
        XCTAssertEqual(l.sujeto, WatchFormat.clock(8))
        XCTAssertNotEqual(l.sujeto, "500")
        XCTAssertTrue(l.notaSinSenal)
        XCTAssertFalse(l.quedan)
    }

    // 7. 5×500 + 180 m HK → remaining drops.
    func testSerieLosMetrosQueFaltanBajan() {
        let l = RodajeMedida.vivo(calle(metros: 180, ritmo: 295, objetivoM: 500, serie: true))
        XCTAssertEqual(l.sujeto, "320")
        XCTAssertEqual(l.unidad, "m")
        XCTAssertTrue(l.quedan)
        XCTAssertFalse(l.notaSinSenal)
    }

    func testEsCallePorDefectoYIndoorLoApaga() {
        XCTAssertTrue(RodajeMedida.esCalle(environment: nil))
        XCTAssertTrue(RodajeMedida.esCalle(environment: .outdoor))
        XCTAssertFalse(RodajeMedida.esCalle(environment: .indoor))
        XCTAssertFalse(RodajeMedida.esCalle(environment: .treadmill))
    }

    // 10. A cumulative HK sum produces a positive delta, never a 0 sample.
    func testDeltaDeDistanciaSoloSiAppleAvanza() {
        XCTAssertEqual(WatchHKActivityPlan.distanceDelta(fromCumulative: 12.5, lastReported: 0), 12.5)
        XCTAssertNil(WatchHKActivityPlan.distanceDelta(fromCumulative: 12.5, lastReported: 12.5))
        XCTAssertNil(WatchHKActivityPlan.distanceDelta(fromCumulative: 10, lastReported: 12.5))
    }

    // MARK: - FH-34 · Vivo tap = applyCommand(.advance), not a second engine

    func testSeriePrescritaElToqueAvanza() {
        let s = structuredSession()
        s.primaryAdvance()
        XCTAssertTrue(RodajeVivoToca.avanza(s))
        XCTAssertEqual(s.runLegIndex, 0)
        s.applyCommand(MirrorWire.CommandKind.advance)
        XCTAssertEqual(s.runLegIndex, 1)
        XCTAssertFalse(s.isRunLegWork)
    }

    func testLibreElToqueNoAvanzaYNuevoTramoSoloSiEsLibre() {
        let s = continuousSession(free: true)
        XCTAssertTrue(s.isFreeRun)
        XCTAssertFalse(RodajeVivoToca.avanza(s))
        XCTAssertTrue(RodajeVivoToca.muestraNuevoTramo(s))
        let prescrito = continuousSession(free: false)
        XCTAssertFalse(RodajeVivoToca.avanza(prescrito))
        XCTAssertFalse(RodajeVivoToca.muestraNuevoTramo(prescrito))
        XCTAssertFalse(RodajeVivoToca.muestraNuevoTramo(structuredSession()))
    }

    func testPausaYRodajeContinuoNoSonBoton() {
        let s = structuredSession()
        s.primaryAdvance()
        s.togglePause()
        XCTAssertFalse(RodajeVivoToca.avanza(s))
        s.togglePause()
        XCTAssertTrue(RodajeVivoToca.avanza(s))
    }

    func testDobleToquePorApplyCommandCuentaComoUno() {
        let s = structuredSession()
        s.primaryAdvance()
        s.applyCommand(MirrorWire.CommandKind.advance)
        XCTAssertEqual(s.runLegIndex, 1)
        s.applyCommand(MirrorWire.CommandKind.advance)
        XCTAssertEqual(s.runLegIndex, 1, "el antirrebote del dedo vive en applyCommand")
        s.lastPrimaryAdvanceAt = Date(timeIntervalSinceNow: -5)
        s.applyCommand(MirrorWire.CommandKind.advance)
        XCTAssertEqual(s.runLegIndex, 2)
    }

    private func work(_ m: RunSegmentMeasure) -> RunElement {
        .segment(RunSegment(kind: .work, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
    }
    private func rec(_ m: RunSegmentMeasure) -> RunElement {
        .segment(RunSegment(kind: .recovery, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: .parado))
    }

    private func structuredSession() -> WorkoutSession {
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: nil, workS: nil,
                              restS: nil, totalS: nil, target: nil, note: nil, start: nil, increment: nil,
                              structure: [RunPhase(role: .main, elements: [
                                work(.distance(m: 400)), rec(.duration(s: 60)),
                                work(.distance(m: 400)), rec(.duration(s: 60)),
                            ])])
        let seg = WorkoutSegment(order: 1, title: "Series", kind: .running,
                                 blockTitle: "Series", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: plan([seg], format: .intervals))
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    private func continuousSession(free: Bool) -> WorkoutSession {
        let seg = WorkoutSegment(order: 1, title: "Rodaje", kind: .running,
                                 targetDistanceMeters: 5000, blockTitle: "Carrera", blockPosition: 1)
        let s = WorkoutSession(plan: plan([seg], format: .steady))
        s.isFreeRun = free
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    private func plan(_ segments: [WorkoutSegment], format: WorkoutFormat) -> WorkoutPlan {
        WorkoutPlan(id: UUID(), name: "Test", format: format, estimatedDurationSeconds: 900,
                    blockContext: "Test", zoneTargets: [], equipment: [], segments: segments,
                    coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
    }
}
