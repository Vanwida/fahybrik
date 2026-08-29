import XCTest
@testable import FAHYBRIK

// #61 — native execution of the structured run on a real WorkoutSession: the flat
// leg cursor walks the expanded legs, the treadmill model auto-closes DISTANCE
// bouts per-bout (heterogeneous pyramids included) while the session owns TIME
// legs, and the leg count / accessors match. Mirrors TreadmillAutoAdvanceTests'
// injected-source harness; asserts the LEGACY rotating path is never touched.
final class StructuredRunEngineTests: XCTestCase {

    // MARK: - Injected source doubles (no CoreBluetooth) — mirror the legacy harness

    final class FakeTreadmill: TreadmillDataSource {
        var onSample: ((TreadmillSample) -> Void)?
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
        func emit(_ totalDistanceM: Double, speedKmh: Double = 12) {
            onSample?(TreadmillSample(speedKmh: speedKmh, inclinePct: 1,
                                      totalDistanceM: totalDistanceM, elapsedS: nil,
                                      hrBpm: nil, lastUpdate: Date()))
        }
    }
    final class FakeHR: HeartRateSource {
        var onBpm: ((Int) -> Void)?
        var onBattery: ((Int) -> Void)?
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?
        func startScan() {}
        func connect(_ id: DeviceID) {}
        func disconnect() {}
        func stop() {}
        func diagnosticsText() -> String? { nil }
    }

    // MARK: - Structure builders

    private func work(_ m: RunSegmentMeasure, _ t: RunSegmentTarget? = nil,
                      incline: Double? = nil, cadence: Int? = nil) -> RunElement {
        .segment(RunSegment(kind: .work, measure: m, target: t, resolved: nil,
                            inclinePct: incline, cadenceSpm: cadence, recoveryMode: nil))
    }
    private func rec(_ m: RunSegmentMeasure, _ mode: RunRecoveryMode) -> RunElement {
        .segment(RunSegment(kind: .recovery, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: mode))
    }
    private func rep(_ n: Int, _ els: [RunElement]) -> RunElement { .repeatBlock(times: n, elements: els) }
    private func main(_ els: [RunElement]) -> RunPhase { RunPhase(role: .main, elements: els) }

    // MARK: - Manual leg walk through a full structure

    func testManualLegWalkFinishesAfterLastLeg() {
        // 3×(400m work + 60s parado) = 6 legs, ending on a recovery.
        let s = structuredSession([main([rep(3, [work(.distance(m: 400)), rec(.duration(s: 60), .parado)])])])
        XCTAssertTrue(s.isRunStructureActive)
        XCTAssertTrue(s.isRunCountIn)
        XCTAssertEqual(s.runLegTotal, 6)
        XCTAssertFalse(s.rotRoundIndex > 0)   // the rotating machine is NOT driving this

        s.primaryAdvance()                     // first tap only skips the 3-2-1
        XCTAssertFalse(s.isRunCountIn)
        XCTAssertEqual(s.runLegIndex, 0)
        XCTAssertTrue(s.isRunLegWork)
        XCTAssertTrue(s.currentRunLegIsDistance)

        s.primaryAdvance(); XCTAssertEqual(s.runLegIndex, 1); XCTAssertFalse(s.isRunLegWork)  // work0→rec0
        s.primaryAdvance(); XCTAssertEqual(s.runLegIndex, 2); XCTAssertTrue(s.isRunLegWork)   // rec0→work1
        s.primaryAdvance(); s.primaryAdvance(); s.primaryAdvance()                            // →3,4,5
        XCTAssertEqual(s.runLegIndex, 5)
        XCTAssertFalse(s.isFinished)

        // Last leg done → the PRESCRIBED work is complete. The session does not end
        // itself: it asks him once ("¿terminamos o sigues?"), which is the whole point
        // of routing every natural completion through `finishPrescribedWork`.
        s.primaryAdvance()
        XCTAssertTrue(s.isAwaitingFinishDecision)
        XCTAssertFalse(s.isFinished, "the session must never close behind the athlete's back")
        s.finish()                             // he answers "terminar"
        XCTAssertTrue(s.isFinished)
    }

    // MARK: - Treadmill auto-closes each DISTANCE bout; session owns the recovery

    func testTreadmillClosesHeterogeneousPyramidPerBout() {
        // 1200 / 1000 / 800 as a structure, 60s parado recoveries between.
        let s = structuredSession([main([
            work(.distance(m: 1200)), rec(.duration(s: 60), .parado),
            work(.distance(m: 1000)), rec(.duration(s: 60), .parado),
            work(.distance(m: 800)),
        ])])
        s.primaryAdvance()                     // skip the count-in
        let (m, src) = makeModel(s)

        XCTAssertEqual(m.currentLeg.goal, .distance(meters: 1200))  // per-bout, not a scalar
        src.emit(100); src.emit(1310)                              // covered 1210 ≥ 1200
        XCTAssertEqual(s.runLegIndex, 1)                           // → recovery
        XCTAssertFalse(s.isRunLegWork)

        // Recovery is a TIME leg → the belt must NOT advance it (session-owned).
        src.emit(2000); src.emit(3000)
        XCTAssertEqual(s.runLegIndex, 1)

        s.primaryAdvance()                                         // skip the recovery manually
        XCTAssertEqual(s.currentRunLeg?.distanceMeters, 1000)      // the SECOND, different distance
        src.emit(3100); src.emit(4110)                            // covered 1010 ≥ 1000
        XCTAssertEqual(s.runLegIndex, 3)                          // → its recovery
        m.teardown()
    }

    // MARK: - Manual override (no treadmill) closes a distance bout — the #64 seam

    func testDistanceBoutWithoutBeltClosesManually() {
        let s = structuredSession([main([work(.distance(m: 800)), work(.distance(m: 600))])])
        s.primaryAdvance()                     // skip count-in
        XCTAssertTrue(s.currentRunLegIsDistance)
        XCTAssertEqual(s.runLegIndex, 0)
        s.primaryAdvance()                     // "TRAMO HECHO" with no belt → manual close
        XCTAssertEqual(s.runLegIndex, 1)
        XCTAssertEqual(s.currentRunLeg?.distanceMeters, 600)
    }

    // MARK: - Pure resolver / count units

    func testStructuredLegResolvesPerBoutAndOwnership() {
        // A distance work bout is belt-owned; a distance RECOVERY is belt-owned too
        // (the trota-200m seam); a TIME work bout is session-owned.
        let distSeg = structuredSegment([main([rep(6, [work(.distance(m: 1000)), rec(.distance(m: 200), .trote)])])])
        let w = TreadmillLegResolver.leg(for: distSeg, structureLegIndex: 0)
        XCTAssertEqual(w.goal, .distance(meters: 1000)); XCTAssertTrue(w.ownsAutoAdvance)
        let r = TreadmillLegResolver.leg(for: distSeg, structureLegIndex: 1)
        XCTAssertEqual(r.phase, .recovery)
        XCTAssertEqual(r.goal, .distance(meters: 200)); XCTAssertTrue(r.ownsAutoAdvance)   // the seam
        XCTAssertEqual(r.target, .none)

        let timeSeg = structuredSegment([main([work(.duration(s: 180))])])
        let t = TreadmillLegResolver.leg(for: timeSeg, structureLegIndex: 0)
        XCTAssertEqual(t.goal, .time(seconds: 180)); XCTAssertFalse(t.ownsAutoAdvance)      // session clock
    }

    func testStructuredLegCountAndPosition() {
        let seg = structuredSegment([main([rep(6, [work(.distance(m: 1000)), rec(.distance(m: 200), .trote)])])])
        XCTAssertEqual(WorkoutLegCount.legs(in: seg), 12)
        // 3rd work bout = 5th global leg: w r w r w …
        XCTAssertEqual(WorkoutLegCount.current([seg], index: 0, structureLegIndex: 4), 5)
        XCTAssertEqual(WorkoutLegCount.total([seg]), 12)
    }

    func testResolvedZoneBandJudgesAsPaceAndInclineReaches() {
        let seg = structuredSegment([main([
            work(.distance(m: 200), .hrZone(4), incline: 8, cadence: 182),
        ])])
        // No resolved band supplied → an hr_zone shows the zone label, not a fake pace.
        let leg = seg.runStructureLegs![0]
        if case .zone = leg.runTarget {} else { XCTFail("hr_zone with no resolved band should judge as zone") }
        XCTAssertEqual(leg.inclinePct, 8)
        XCTAssertEqual(leg.cadenceSpm, 182)
    }

    // MARK: - Legacy is untouched

    func testLegacySeriesDoesNotEnterStructureEngine() {
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: 4, workS: nil,
                              restS: 60, totalS: nil, target: nil, note: nil, start: nil, increment: nil)
        let seg = WorkoutSegment(order: 1, title: "4×400", kind: .running,
                                 targetDistanceMeters: 400, blockTitle: "Series", blockPosition: 1, prescription: rx)
        XCTAssertFalse(seg.hasRunStructure)
        let s = WorkoutSession(plan: plan([seg]))
        s.start(); s.beginBlock(); s.stop()
        XCTAssertFalse(s.isRunStructureActive)
        XCTAssertTrue(s.isCondCountIn)     // legacy still runs the conditioning engine
    }

    // MARK: - #62 · treadmill incline folds into the ONE segment lap

    func testTreadmillInclineAveragesIntoSegmentLap() {
        let s = structuredSession([main([work(.distance(m: 1000))])])
        s.primaryAdvance()                     // skip the count-in
        s.sampleTreadmillIncline(2.0)          // belt grade readings over the segment
        s.sampleTreadmillIncline(4.0)
        s.primaryAdvance()                     // last leg done → close the segment lap
        let lap = try! XCTUnwrap(s.laps.last)
        XCTAssertEqual(try XCTUnwrap(lap.inclinePct), 3.0, accuracy: 0.001)  // mean(2, 4)
        XCTAssertNil(lap.runCadenceSpm)        // no on-device cadence source → stays nil
    }

    func testNoTreadmillLeavesInclineNil() {
        let s = structuredSession([main([work(.distance(m: 1000))])])
        s.primaryAdvance()                     // skip count-in
        s.primaryAdvance()                     // close with NO belt readings
        XCTAssertNil(s.laps.last?.inclinePct)  // never a fabricated 0
    }

    func testInclineIgnoredOffRunSegmentAndWhilePaused() {
        let s = structuredSession([main([work(.distance(m: 1000))])])
        s.primaryAdvance()                     // skip count-in
        s.sampleTreadmillIncline(6.0)
        s.togglePause()
        s.sampleTreadmillIncline(100.0)        // paused → must NOT count
        s.togglePause()
        s.primaryAdvance()                     // close
        XCTAssertEqual(try XCTUnwrap(s.laps.last?.inclinePct), 6.0, accuracy: 0.001)
    }

    // MARK: - #break-2 · per-WORK-leg execution (no blended aggregate lap)

    func testStructuredRunRecordsOneLapPerWorkLegNotBlended() throws {
        // Una pirámide 1000 / recuperación / 500 graba TRES laps: los dos tramos de
        // trabajo con su distancia y su ritmo PROPIOS, y la recuperación de en medio.
        //
        // Las recuperaciones se graban a propósito (mig 0146): una sesión de series es
        // un CONTRASTE, y guardar solo los fuertes deja cinco números sin nada contra
        // lo que compararlos. Cada lap lleva su `runLegIndex` (el índice en la lista
        // PLANA de tramos, recuperaciones incluidas) y su `runLegRole`, así que la
        // analítica distingue una cosa de la otra sin adivinarlo por el ritmo.
        //
        // La cinta ancla su odómetro en la PRIMERA muestra de cada tramo, así que se
        // cubre ≥ el objetivo DESDE esa base (igual que testTreadmillClosesHeterogeneousPyramid).
        let s = structuredSession([main([
            work(.distance(m: 1000)), rec(.duration(s: 60), .parado), work(.distance(m: 500)),
        ])])
        s.primaryAdvance()                       // skip the count-in (leg 0 GO)
        let (m, src) = makeModel(s)

        // Leg 0 (work 1000m) over 4:00 → covers ~1100 (≥1000) → auto-closes → records leg 0.
        s.lapElapsedSeconds = 240
        src.emit(100); src.emit(1200)
        XCTAssertEqual(s.laps.count, 1, "The first WORK leg is recorded at its boundary.")
        XCTAssertEqual(s.runLegIndex, 1)         // now parked on the recovery

        s.primaryAdvance()                       // cierra la recuperación → leg 2 (work 500m) GO
        XCTAssertEqual(s.laps.count, 2, "La recuperación también se graba, no se tira.")
        // Leg 2 (work 500m) over 1:00 → covers ~600 (≥500) → auto-closes → records leg 2.
        s.lapElapsedSeconds = 300
        src.emit(1300); src.emit(1900)
        XCTAssertEqual(s.laps.count, 3, "Dos tramos de trabajo + la recuperación de en medio.")

        // El rol y la fase viajan en cada lap — es lo que hace legible el contraste.
        XCTAssertEqual(s.laps.map(\.runLegRole), ["work", "recovery", "work"])
        XCTAssertEqual(s.laps.map(\.runLegPhase), ["main", "main", "main"])
        // `runLegIndex` es el índice PLANO (recuperaciones incluidas), no el ordinal
        // entre los tramos de trabajo: es lo único que casa con la prescripción.
        XCTAssertEqual(s.laps.map(\.runLegIndex), [0, 1, 2])

        let a = s.laps[0], b = s.laps[2]
        let da = try XCTUnwrap(a.distanceCoveredMeters)
        let db = try XCTUnwrap(b.distanceCoveredMeters)
        // Each leg carries its OWN covered distance — distinct, so NOT one blended lap.
        XCTAssertGreaterThanOrEqual(da, 1000)
        XCTAssertGreaterThanOrEqual(db, 500)
        XCTAssertGreaterThan(da, db, "The 1000m leg covered more than the 500m leg (per-leg, not blended).")
        // Each leg's pace = ITS OWN duration / ITS OWN distance (the whole point).
        XCTAssertEqual(try XCTUnwrap(a.avgPaceSecPerKm), 240.0 / (da / 1000.0), accuracy: 1)
        XCTAssertEqual(try XCTUnwrap(b.avgPaceSecPerKm), 60.0 / (db / 1000.0), accuracy: 1)
        XCTAssertNotEqual(a.avgPaceSecPerKm, b.avgPaceSecPerKm, "The two legs must not share a blended pace.")
        XCTAssertEqual(a.modality, "run")
        XCTAssertEqual(b.modality, "run")
        m.teardown()
    }

    func testSteadyStructuredRunStaysOneLap() throws {
        // A steady/continuous run is ONE work leg → ONE lap. The per-leg path must not
        // break the steady case (it degrades to a single recorded leg).
        let s = structuredSession([main([work(.distance(m: 3000))])])
        s.primaryAdvance()                       // skip count-in
        let (m, src) = makeModel(s)
        s.lapElapsedSeconds = 720                // 12:00
        src.emit(100); src.emit(3200)            // covers ~3100 (≥3000) → closes the single leg
        XCTAssertEqual(s.laps.count, 1, "A steady run stays a single lap.")
        XCTAssertEqual(s.laps.first?.runLegIndex, 0)
        XCTAssertGreaterThanOrEqual(try XCTUnwrap(s.laps.first?.distanceCoveredMeters), 3000)
        m.teardown()
    }

    // MARK: - Fixtures

    /// THE session's belt feeder — one per session, alive for the whole test, exactly
    /// as `ActiveWorkoutView` owns one for the whole workout.
    private var feeder: TreadmillSessionFeeder?

    private func makeModel(_ session: WorkoutSession) -> (TreadmillHUDModel, FakeTreadmill) {
        let src = FakeTreadmill()
        let model = TreadmillHUDModel(session: session, hrZones: nil, treadmill: src, hr: FakeHR())
        model.start()
        // Same fan-out and SAME ORDER as `DeviceHub`: the recording first (it owns the
        // belt → session feed for the whole workout), the HUD second — its auto-advance
        // closes the leg's lap on the very sample that completes it.
        if feeder == nil { feeder = TreadmillSessionFeeder(session: session) }
        let toModel = src.onSample
        src.onSample = { [feeder] sample in
            feeder?.ingest(sample)
            toModel?(sample)
        }
        src.onLink?(.connected(name: "Test"))
        return (model, src)
    }

    /// `times: N` de solo work en una serie: el rest es un tramo. Cerrar el
    /// 5:00 no arma el siguiente 5:00. El gesto sobre el rest sí.
    func testSerieDeSoloWorkElRestEsUnTramo() {
        let s = structuredSession([main([rep(3, [work(.duration(s: 300))])])], scheme: .rounds)
        XCTAssertEqual(s.runLegTotal, 5)
        s.primaryAdvance()
        XCTAssertTrue(s.isRunLegWork)
        XCTAssertFalse(s.isTramoResting)
        s.primaryAdvance()
        XCTAssertTrue(s.isTramoResting)
        XCTAssertFalse(s.isRunLegWork)
        XCTAssertEqual(s.currentTramo.label, "Descanso")
        XCTAssertEqual(s.livePicture.label, "Descanso")
        XCTAssertTrue(s.tramoIsRun, "el rest se queda en el HUD de correr")
        XCTAssertFalse(s.tramoMide)
        XCTAssertNil(s.currentRunLeg?.durationSeconds)
        XCTAssertEqual(s.runLegIndex, 1)
        s.primaryAdvance()
        XCTAssertTrue(s.isRunLegWork)
        XCTAssertEqual(s.runLegIndex, 2)
        s.primaryAdvance()
        XCTAssertTrue(s.isTramoResting)
        s.primaryAdvance()
        XCTAssertTrue(s.isRunLegWork)
        XCTAssertEqual(s.runLegIndex, 4)
    }

    /// Tras el último work de la serie el motor arma el siguiente bloque,
    /// no inventa otro Run. Tres works + dos rests = cinco cierres.
    func testAlAcabarLaSerieArmaElSiguienteBloque() {
        let series = structuredSegment([main([rep(3, [work(.duration(s: 300))])])], scheme: .rounds)
        let calma = WorkoutSegment(order: 2, title: "BikeErg", kind: .rowOrSki,
                                   blockTitle: "Vuelta a la calma", blockPosition: 2)
        let s = WorkoutSession(plan: plan([series, calma]))
        s.start(); s.beginBlock(); s.stop()
        s.primaryAdvance()
        for _ in 0..<5 { s.primaryAdvance() }
        XCTAssertTrue(s.isAwaitingBlockStart)
        XCTAssertEqual(s.currentSegment?.title, "BikeErg")
        XCTAssertFalse(s.isRunStructureActive)
    }

    private func structuredSegment(_ structure: RunStructure, scheme: PrescriptionScheme = .intervals) -> WorkoutSegment {
        let rx = Prescription(scheme: scheme, modality: .run, sets: nil, rounds: nil, workS: nil,
                              restS: nil, totalS: nil, target: nil, note: nil, start: nil, increment: nil,
                              structure: structure)
        return WorkoutSegment(order: 1, title: "Series", kind: .running,
                              blockTitle: "Series", blockPosition: 1, prescription: rx)
    }

    private func structuredSession(_ structure: RunStructure,
                                  scheme: PrescriptionScheme = .intervals) -> WorkoutSession {
        let s = WorkoutSession(plan: plan([structuredSegment(structure, scheme: scheme)]))
        s.start()        // arms the block (isAwaitingBlockStart = true) + schedules the timer
        s.beginBlock()   // clears the gate → startRunStructure (count-in, runLegIndex 0)
        s.stop()         // kill the timer; the leg-cursor state is preserved
        return s
    }

    private func plan(_ segments: [WorkoutSegment]) -> WorkoutPlan {
        WorkoutPlan(id: UUID(), name: "Test", format: .intervals, estimatedDurationSeconds: 900,
                    blockContext: "Test", zoneTargets: [], equipment: [], segments: segments,
                    coachNote: nil, warmupChecklist: [])
    }

    // MARK: - Una recuperación medida en DISTANCIA se cierra sola
    //
    // Debugger 29-ago (serie de umbral): «el motor no cierra el rest, la distancia se
    // queda clavada, el siguiente Run no se arma». Las tres eran la MISMA línea.
    //
    // `sampleRunDistance` tenía una puerta `tramoMide` que tiraba el sample cuando el
    // tramo era una recuperación sin MODO escrito. Los metros que cierran una
    // recuperación de distancia son precisamente los que esa puerta descartaba, así que
    // no podía cerrarse nunca: el atleta trotaba, la cifra no se movía y el cursor no
    // avanzaba. La puerta era de la CINTA (una banda rodando sin el atleta encima), no
    // del GPS: si está parado, CoreLocation no reporta movimiento y no hay nada que
    // filtrar.

    /// Una recuperación de 200 m SIN modo escrito. El label sigue siendo «Descanso» —
    /// no se inventa un trote — pero los metros son un hecho y la cierran.
    func testUnaRecuperacionDeDistanciaSinModoSeCierraConSusMetros() {
        let recuperacionSinModo = RunElement.segment(
            RunSegment(kind: .recovery, measure: .distance(m: 200), target: nil, resolved: nil,
                       inclinePct: nil, cadenceSpm: nil, recoveryMode: nil)
        )
        let s = structuredSession([main([
            work(.distance(m: 1000)), recuperacionSinModo, work(.distance(m: 1000)),
        ])])
        s.runEnvironment = .outdoor
        s.primaryAdvance()                                   // salta el 3-2-1 → tramo 0 (work)

        // Cierra el primer trabajo con sus mil metros.
        s.sampleRunDistance(deltaMeters: 1000, source: .gps)
        XCTAssertEqual(s.runLegIndex, 1, "el work de 1.000 se cierra al cruzar su meta")
        XCTAssertFalse(s.isRunLegWork, "y el tramo 1 es la recuperación")
        XCTAssertEqual(s.livePicture.label, "Descanso", "sin modo escrito no se inventa un trote")

        // El ancla de la ventana la mueve `syncTramoIfNeeded`, que en la app corre en el
        // tick de 0,25 s. Aquí el timer está parado (`structuredSession` lo mata para
        // preservar el cursor), así que se llama a mano — sin esto los metros del tramo
        // anterior contarían como de la recuperación.
        s.syncTramoIfNeeded()

        // LOS METROS DE LA RECUPERACIÓN CUENTAN. Antes se tiraban aquí.
        s.sampleRunDistance(deltaMeters: 120, source: .gps)
        XCTAssertEqual(s.runLegIndex, 1, "a 120 de 200 todavía no ha llegado")
        XCTAssertEqual(s.tramoRunCoveredMeters ?? 0, 120, accuracy: 0.001,
                       "la distancia no se queda clavada mientras trota la recuperación")

        // Y al cruzar los 200, el motor cierra el rest y ARMA el siguiente Run.
        s.sampleRunDistance(deltaMeters: 90, source: .gps)
        XCTAssertEqual(s.runLegIndex, 2, "el rest se cierra solo y el siguiente Run se arma")
        XCTAssertTrue(s.isRunLegWork)
    }

    /// Y el volumen de la sesión los lleva: lo trotado en la recuperación no desaparece
    /// del total de carrera, que es el daño que `advanceRunLeg` dice que evita grabar
    /// las recuperaciones.
    func testLoTrotadoEnLaRecuperacionEntraEnElTotalDeLaSesion() {
        let recuperacionSinModo = RunElement.segment(
            RunSegment(kind: .recovery, measure: .distance(m: 200), target: nil, resolved: nil,
                       inclinePct: nil, cadenceSpm: nil, recoveryMode: nil)
        )
        let s = structuredSession([main([work(.distance(m: 400)), recuperacionSinModo])])
        s.runEnvironment = .outdoor
        s.primaryAdvance()
        s.sampleRunDistance(deltaMeters: 400, source: .gps)   // cierra el work
        s.sampleRunDistance(deltaMeters: 150, source: .gps)   // trota parte de la recuperación
        XCTAssertEqual(s.lapGpsDistanceMeters ?? 0, 550, accuracy: 0.001)
    }
}
