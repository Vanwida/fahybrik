import XCTest
@testable import FAHYBRIK

// EL CONSTRUCTOR DE CORRER TIENE QUE PODER ESCRIBIR LOS ENTRENOS QUE EXISTEN.
//
// El constructor libre sabía escribir una sola cosa: N veces la misma dosis con
// un descanso parado. Con eso no entra casi ningún entreno de correr real, y por
// eso Alex se encontró el 8-ago con que «se pueden hacer series» era mentira: la
// recuperación no podía llevar ni medida propia, ni objetivo, ni modo.
//
// Estos tests son el STRESS-TEST del modelo contra siete entrenos reales. Si uno
// no entra con CERO texto libre, el modelo está mal — no el caso.
final class FreeRunPlanTests: XCTestCase {

    private func trabajo(_ medida: FreeRunPaso.Medida, m: Int = 0, s: Int = 0,
                         zona: Int? = nil, ritmo: Int? = nil, cuesta: Double? = nil) -> FreeRunPaso {
        FreeRunPaso(rol: .trabajo, medida: medida, metros: m, segundos: s,
                    objetivo: ritmo != nil ? .ritmo : (zona != nil ? .zona : .ninguno),
                    zona: zona ?? 4, ritmoSegPorKm: ritmo ?? FreeRunPlan.ritmoPorDefecto,
                    cuestaPct: cuesta)
    }

    private func recupera(_ medida: FreeRunPaso.Medida, m: Int = 0, s: Int = 0,
                          zona: Int? = nil, modo: RunRecoveryMode?) -> FreeRunPaso {
        FreeRunPaso(rol: .recuperacion, medida: medida, metros: m, segundos: s,
                    objetivo: zona != nil ? .zona : .ninguno, zona: zona ?? 1, modo: modo)
    }

    private func plan(_ grupos: [FreeRunGrupo],
                      cal: FreeRunPaso? = nil, vuelta: FreeRunPaso? = nil) -> FreeRunPlan {
        FreeRunPlan(calentamiento: cal, grupos: grupos, vuelta: vuelta)
    }

    // MARK: - Los siete casos reales

    /// 1 · LA SERIE DE VERDAD — y su recuperación con medida, zona y modo, que es
    /// exactamente lo que el constructor no sabía decir.
    func testSerieConRecuperacionTrotada() {
        let p = plan([
            FreeRunGrupo(repeticiones: 5, pasos: [
                trabajo(.distancia, m: 800, zona: 4),
                recupera(.distancia, m: 400, zona: 1, modo: .trote),
            ]),
        ])
        let legs = p.estructura().expandedLegs()
        XCTAssertEqual(legs.count, 10)
        XCTAssertEqual(legs.filter(\.isWork).count, 5)
        XCTAssertEqual(legs[0].distanceMeters, 800)
        XCTAssertEqual(legs[0].zoneLabel, "Z4")
        XCTAssertEqual(legs[1].distanceMeters, 400, "la recuperación se mide en METROS, no en segundos")
        XCTAssertEqual(legs[1].zoneLabel, "Z1", "y tiene su propio objetivo")
        XCTAssertEqual(legs[1].recoveryMode, .trote)
        XCTAssertTrue(legs[1].recuperaEnMovimiento)
    }

    /// 2 · FARTLEK — 5×(5' fuerte / 1' suave). Los dos tramos son de TIEMPO y la
    /// «recuperación» es una zona, no una parada.
    func testFartlek() {
        let p = plan([
            FreeRunGrupo(repeticiones: 5, pasos: [
                trabajo(.tiempo, s: 300, zona: 4),
                recupera(.tiempo, s: 60, zona: 2, modo: .trote),
            ]),
        ])
        let legs = p.estructura().expandedLegs()
        XCTAssertEqual(legs.count, 10)
        XCTAssertEqual(legs[0].durationSeconds, 300)
        XCTAssertEqual(legs[1].zoneLabel, "Z2")
    }

    /// 3 · PIRÁMIDE — tramos DISTINTOS entre sí. Es el caso que «N × lo mismo»
    /// no puede expresar de ninguna manera.
    func testPiramide() {
        let p = plan([
            FreeRunGrupo(repeticiones: 1, pasos: [
                trabajo(.distancia, m: 400, zona: 5),
                recupera(.tiempo, s: 90, modo: .trote),
                trabajo(.distancia, m: 800, zona: 4),
                recupera(.tiempo, s: 90, modo: .trote),
                trabajo(.distancia, m: 1200, zona: 4),
                recupera(.tiempo, s: 90, modo: .trote),
                trabajo(.distancia, m: 800, zona: 4),
                recupera(.tiempo, s: 90, modo: .trote),
                trabajo(.distancia, m: 400, zona: 5),
            ]),
        ])
        let series = p.estructura().expandedLegs().filter(\.isWork)
        XCTAssertEqual(series.map(\.distanceMeters), [400, 800, 1200, 800, 400])
    }

    /// 4 · PROGRESIVO — tres tramos seguidos subiendo de zona, sin recuperación.
    func testProgresivo() {
        let p = plan([
            FreeRunGrupo(repeticiones: 1, pasos: [
                trabajo(.distancia, m: 3000, zona: 2),
                trabajo(.distancia, m: 3000, zona: 3),
                trabajo(.distancia, m: 3000, zona: 4),
            ]),
        ])
        let legs = p.estructura().expandedLegs()
        XCTAssertEqual(legs.count, 3)
        XCTAssertEqual(legs.map(\.zoneLabel), ["Z2", "Z3", "Z4"])
        XCTAssertTrue(legs.allSatisfy(\.isWork))
    }

    /// 5 · TEMPO CON SUS EXTREMOS — calentamiento y vuelta a la calma son FASES,
    /// no tramos más del entreno.
    func testTempoConCalentamientoYVuelta() {
        let p = plan([FreeRunGrupo(repeticiones: 1, pasos: [trabajo(.tiempo, s: 1200, zona: 4)])],
                     cal: trabajo(.tiempo, s: 600, zona: 2),
                     vuelta: trabajo(.tiempo, s: 600, zona: 1))
        let estructura = p.estructura()
        XCTAssertEqual(estructura.map(\.role), [.warmup, .main, .cooldown])
        let legs = estructura.expandedLegs()
        XCTAssertEqual(legs.count, 3)
        XCTAssertEqual(legs.map(\.phaseRole), [.warmup, .main, .cooldown])
    }

    /// 6 · CUESTAS — el % viaja en el tramo, que es donde el motor y la cinta lo
    /// leen. Sin cuesta escrita no se manda un 0 con cara de dato.
    func testCuestas() {
        let p = plan([
            FreeRunGrupo(repeticiones: 8, pasos: [
                trabajo(.tiempo, s: 45, zona: 5, cuesta: 6),
                recupera(.tiempo, s: 90, modo: .trote),
            ]),
        ])
        let legs = p.estructura().expandedLegs()
        XCTAssertEqual(legs[0].inclinePct, 6)
        XCTAssertNil(legs[1].inclinePct, "la bajada no lleva cuesta inventada")
        XCTAssertEqual(legs.filter(\.isWork).count, 8)
    }

    /// 7 · RODAJE LARGO CON ACELERONES — DOS bloques distintos en el mismo
    /// entreno. Es el caso que obliga a que la parte principal sea una lista de
    /// grupos y no un solo grupo.
    func testRodajeLargoConAcelerones() {
        let p = plan([
            FreeRunGrupo(repeticiones: 1, pasos: [trabajo(.tiempo, s: 3600, zona: 2)]),
            FreeRunGrupo(repeticiones: 6, pasos: [
                trabajo(.tiempo, s: 30, zona: 5),
                recupera(.tiempo, s: 60, modo: .trote),
            ]),
        ])
        let legs = p.estructura().expandedLegs()
        XCTAssertEqual(legs.count, 13, "1 rodaje + 6×(acelerón + trote)")
        XCTAssertEqual(legs[0].durationSeconds, 3600)
        XCTAssertEqual(legs[1].durationSeconds, 30)
    }

    // MARK: - Lo que no se inventa

    /// Un tramo ABIERTO lo cierra el atleta: no lleva medida, y no se le fabrica
    /// una. La gramática ya sabe ejecutar una pierna manual.
    func testUnTramoAbiertoNoLlevaMedida() {
        let p = plan([FreeRunGrupo(pasos: [trabajo(.abierto, zona: 3)])])
        let leg = p.estructura().expandedLegs()[0]
        XCTAssertNil(leg.distanceMeters)
        XCTAssertNil(leg.durationSeconds)
        XCTAssertFalse(leg.isTimed, "sin medida no hay reloj que lo cierre")
    }

    /// Sin objetivo es una respuesta legítima: hay entrenos que se corren por
    /// sensaciones. Lo que no se hace es rellenar una zona por él.
    func testSinObjetivoNoSeRellenaConUnaZona() {
        let p = plan([FreeRunGrupo(pasos: [trabajo(.distancia, m: 5000)])])
        let leg = p.estructura().expandedLegs()[0]
        XCTAssertNil(leg.target)
        XCTAssertNil(leg.zoneLabel)
    }

    /// Un grupo de un solo paso sin repetir NO mete un «repetir ×1» que nadie
    /// escribió en la gramática.
    func testUnGrupoDeUnoSinRepetirNoEnvuelveNada() {
        let p = plan([FreeRunGrupo(repeticiones: 1, pasos: [trabajo(.distancia, m: 5000, zona: 2)])])
        let elementos = p.estructura()[0].elements
        guard case .segment = elementos[0] else {
            return XCTFail("un paso suelto es un segmento, no un repeat de uno")
        }
    }

    /// Sin ningún tramo de TRABAJO no hay entreno, sólo calentamiento — y eso no
    /// se puede empezar.
    func testUnPlanSinTrabajoNoEsEjecutable() {
        XCTAssertFalse(plan([], cal: trabajo(.tiempo, s: 600, zona: 2)).esEjecutable)
        XCTAssertTrue(plan([FreeRunGrupo(pasos: [trabajo(.distancia, m: 400, zona: 4)])]).esEjecutable)
    }

    // MARK: - El puente al motor

    /// LA PRUEBA QUE CIERRA EL CÍRCULO: lo que monta el atleta llega al motor
    /// como tramos, con `structure` mandando sobre los campos planos.
    func testLoQueMontaElAtletaLlegaAlMotorComoTramos() throws {
        let draft = FreeWorkoutDraft()
        draft.selectModality(.run)
        draft.runPlan = plan([
            FreeRunGrupo(repeticiones: 4, pasos: [
                trabajo(.distancia, m: 1000, zona: 4),
                recupera(.distancia, m: 200, zona: 1, modo: .trote),
            ]),
        ], cal: trabajo(.tiempo, s: 600, zona: 2))

        let ctx = try XCTUnwrap(draft.buildContext())
        let seg = try XCTUnwrap(ctx.plan.segments.first)
        XCTAssertTrue(seg.hasRunStructure, "sin esto el motor cae al rotativo binario")
        let legs = try XCTUnwrap(seg.runStructureLegs)
        XCTAssertEqual(legs.count, 9, "calentamiento + 4×(serie + trote)")
        XCTAssertEqual(legs.filter(\.isWork).count, 5, "el calentamiento también se corre")
        XCTAssertEqual(draft.runPlan.tramosDelEntreno().count, 4,
                       "pero los tramos DEL ENTRENO son cuatro: la fase manda, no el rol")

        // Y los campos PLANOS siguen viajando (contrato aditivo del cable): lo que
        // aún no sabe leer la gramática ve algo cierto, no un hueco.
        let p = try XCTUnwrap(seg.prescription)
        XCTAssertEqual(p.modality, .run)
        XCTAssertEqual(p.scheme, .intervals, "cuatro tramos de trabajo no son un rodaje")
        XCTAssertEqual(seg.targetDistanceMeters, 1000, "el escalar describe el primer tramo de trabajo")
        XCTAssertEqual(seg.targetZone, .z4)
    }

    /// Un solo tramo de trabajo es un RODAJE, y el esquema plano lo dice.
    func testUnSoloTramoDeTrabajoEsUnRodaje() throws {
        let draft = FreeWorkoutDraft()
        draft.selectModality(.run)
        draft.runPlan = plan([FreeRunGrupo(pasos: [trabajo(.tiempo, s: 2700, zona: 2)])])
        let ctx = try XCTUnwrap(draft.buildContext())
        XCTAssertEqual(ctx.plan.format, .steady)
        XCTAssertEqual(ctx.plan.segments.first?.targetDurationSeconds, 2700)
    }

    /// La duración prevista es best-effort y HONESTA: un tramo por distancia sin
    /// ritmo escrito no se estima con un ritmo inventado.
    func testLaDuracionPrevistaNoInventaUnRitmo() {
        let porTiempo = plan([FreeRunGrupo(repeticiones: 3, pasos: [trabajo(.tiempo, s: 120, zona: 4)])])
        XCTAssertEqual(porTiempo.segundosEstimados, 360)

        let porDistanciaSinRitmo = plan([FreeRunGrupo(pasos: [trabajo(.distancia, m: 5000, zona: 2)])])
        XCTAssertEqual(porDistanciaSinRitmo.segundosEstimados, 0)

        let porDistanciaConRitmo = plan([FreeRunGrupo(pasos: [trabajo(.distancia, m: 5000, ritmo: 300)])])
        XCTAssertEqual(porDistanciaConRitmo.segundosEstimados, 1500)
    }
}
