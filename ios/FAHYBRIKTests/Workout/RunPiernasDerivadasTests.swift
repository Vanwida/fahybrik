import XCTest
@testable import FAHYBRIK

// UNA SERIE DE CORRER ES UNA SERIE, LA ESCRIBA QUIEN LA ESCRIBA.
//
// El fallo que estos tests fijan (Alex, corriendo por la calle el 8-ago): el
// constructor de entreno libre escribe una serie como `intervals` + `rounds`, y
// ese esquema no producía tramos. Sin tramos, el motor caía al rotativo binario
// trabajo/descanso: la muñeca la pintaba con el guion de burpees (sin metros que
// valgan, «estás en el sitio») y los metros que sí llegaban por el espejo eran
// los del BLOQUE entero contra un objetivo POR SERIE.
//
// La otra mitad del contrato, igual de importante: lo que NO es una serie de
// correr no puede entrar aquí. Un EMOM, una tabata, una ruta de estaciones o un
// bloque mixto tienen que salir intactos por el camino de siempre.
final class RunPiernasDerivadasTests: XCTestCase {

    // MARK: - Constructores

    private func set(_ m: Measure, rest: Int? = nil, target: Target? = nil,
                     modality: PrescriptionModality? = nil) -> PrescriptionSet {
        PrescriptionSet(measure: m, target: target, modality: modality,
                        restS: rest, tempo: nil, note: nil)
    }

    private func pres(_ scheme: PrescriptionScheme,
                      modality: PrescriptionModality?,
                      sets: [PrescriptionSet]?,
                      rounds: Int? = nil,
                      restS: Int? = nil,
                      target: Target? = nil) -> Prescription {
        Prescription(scheme: scheme, modality: modality, sets: sets, rounds: rounds,
                     workS: nil, restS: restS, totalS: nil, target: target,
                     note: nil, start: nil, increment: nil)
    }

    // MARK: - B · Las rondas del constructor libre (el fallo del 8-ago)

    /// «Correr · Series · 5 × 800 m · r 1:30 · Z4» tal cual lo escribe
    /// `FreeWorkoutDraft.buildPrescription()`: una dosis, `rounds`, y el descanso
    /// en los dos sitios.
    func testLaSerieDelConstructorLibreProduceTramos() throws {
        let objetivo = Target.hrZone(value: 4, min: nil, max: nil)
        let p = pres(.intervals, modality: .run,
                     sets: [set(.distance(meters: 800), rest: 90, target: objetivo)],
                     rounds: 5, restS: 90, target: objetivo)

        let legs = try XCTUnwrap(p.runStructureLegs)
        // 5 series + 4 recuperaciones. La quinta NO lleva recuperación detrás: el
        // descanso está ENTRE repeticiones.
        XCTAssertEqual(legs.count, 9)
        XCTAssertEqual(legs.filter(\.isWork).count, 5)
        XCTAssertEqual(legs.filter(\.isRecovery).count, 4)
        XCTAssertEqual(legs.first?.distanceMeters, 800)
        XCTAssertEqual(legs.first?.zoneLabel, "Z4", "el objetivo del atleta viaja a cada serie")
        XCTAssertEqual(legs[1].durationSeconds, 90)
        XCTAssertEqual(legs.last?.isWork, true, "la última pierna es una serie, no un descanso")
    }

    /// Sin descanso escrito las series van seguidas — pero SIGUEN siendo cinco
    /// tramos. Antes esto era un bout continuo y el atleta no veía en cuál iba.
    func testSinDescansoSiguenSiendoCincoTramos() throws {
        let p = pres(.intervals, modality: .run,
                     sets: [set(.duration(seconds: 180))], rounds: 5)
        let legs = try XCTUnwrap(p.runStructureLegs)
        XCTAssertEqual(legs.count, 5)
        XCTAssertTrue(legs.allSatisfy(\.isWork))
    }

    /// UNA sola ronda no es una serie: es un bout, y sigue por el camino de
    /// siempre. Fabricar un cursor de «1 de 1» sería ruido.
    func testUnaSolaRondaNoEsUnaSerie() {
        let p = pres(.intervals, modality: .run,
                     sets: [set(.distance(meters: 5000))], rounds: 1)
        XCTAssertNil(p.runStructureLegs)
    }

    /// Un EMOM de correr lo gobierna su minuto y tiene motor propio. Si esto lo
    /// tradujera, `onEnterSegment` arrancaría el cursor de tramos en vez del EMOM
    /// y el formato entero dejaría de funcionar.
    func testUnEmomDeCorrerNoSeTraduce() {
        let p = pres(.emom, modality: .run,
                     sets: [set(.distance(meters: 200))], rounds: 10)
        XCTAssertNil(p.runStructureLegs)
    }

    /// Ni una tabata, ni un AMRAP, ni una ruta de estaciones (`rounds`), que es
    /// la lista de un HYROX sim y no repeticiones de un mismo tramo.
    func testLosDemasFormatosRotativosYDeRutaNoSeTraducen() {
        for scheme in [PrescriptionScheme.tabata, .deathBy, .amrap, .forTime, .rounds] {
            let p = pres(scheme, modality: .run,
                         sets: [set(.distance(meters: 200))], rounds: 8, restS: 60)
            XCTAssertNil(p.runStructureLegs, "\(scheme.rawValue) no es una serie de correr")
        }
    }

    /// Lo que no es de correr no entra aquí ni de lejos.
    func testUnasSeriesDeErgoNoSeTraducen() {
        let p = pres(.intervals, modality: .row,
                     sets: [set(.distance(meters: 500), rest: 60)],
                     rounds: 5, restS: 60)
        XCTAssertNil(p.runStructureLegs)
    }

    /// Con DOS dosis distintas manda la tabla, no las rondas: repetirla `rounds`
    /// veces inventaría un entreno más largo del que escribió nadie.
    func testDosDosisEnIntervalsNoSeMultiplicanPorRondas() {
        let p = pres(.intervals, modality: .run,
                     sets: [set(.distance(meters: 800), rest: 90),
                            set(.distance(meters: 400), rest: 90)],
                     rounds: 5, restS: 90)
        XCTAssertNil(p.runStructureLegs)
    }

    // MARK: - A · La tabla del coach (lo que ya funcionaba, y sigue igual)

    func testLaTablaDeSetsDelCoachSigueDandoLasMismasPiernas() throws {
        let p = pres(.sets, modality: .run,
                     sets: [set(.distance(meters: 1000), rest: 90),
                            set(.distance(meters: 1000), rest: 90),
                            set(.distance(meters: 1000), rest: 90)])
        let legs = try XCTUnwrap(p.runStructureLegs)
        XCTAssertEqual(legs.count, 5, "3 series + 2 recuperaciones")
        XCTAssertEqual(legs.filter(\.isWork).count, 3)
    }

    /// Un bloque mixto —una plancha de 60 s entre series— no es una serie de
    /// correr, y traducirlo convertiría la plancha en una pierna de carrera.
    func testUnBloqueMixtoNoEsUnaSerieDeCorrer() {
        let p = pres(.sets, modality: .run,
                     sets: [set(.distance(meters: 400), rest: 60),
                            set(.duration(seconds: 60), modality: .functional)])
        XCTAssertNil(p.runStructureLegs)
    }

    // MARK: - La recuperación: se mide, no se supone

    /// Sin modo escrito NO se supone que está parado: se mide. Es lo que devuelve
    /// el trote de vuelta al dato — sus metros, su ritmo y su zona.
    func testLaRecuperacionSinModoSeMide() throws {
        let p = pres(.intervals, modality: .run,
                     sets: [set(.distance(meters: 800), rest: 90)],
                     rounds: 3, restS: 90)
        let legs = try XCTUnwrap(p.runStructureLegs)
        XCTAssertTrue(legs[1].isRecovery)
        XCTAssertTrue(legs[1].recuperaEnMovimiento,
                      "sin modo se MIDE lo que pase; suponer que está parado tira dato real")
    }

    /// `parado` es el único que para de verdad — y entonces sí es un descanso.
    func testSoloParadoEsUnDescansoDeVerdad() {
        let parado = RunLeg(kind: .recovery, measure: .duration(s: 120), target: nil,
                            resolved: nil, inclinePct: nil, cadenceSpm: nil,
                            recoveryMode: .parado, phaseRole: .main)
        let trote = RunLeg(kind: .recovery, measure: .distance(m: 200), target: nil,
                           resolved: nil, inclinePct: nil, cadenceSpm: nil,
                           recoveryMode: .trote, phaseRole: .main)
        let trabajo = RunLeg(kind: .work, measure: .distance(m: 800), target: nil,
                             resolved: nil, inclinePct: nil, cadenceSpm: nil,
                             recoveryMode: nil, phaseRole: .main)
        XCTAssertFalse(parado.recuperaEnMovimiento)
        XCTAssertTrue(trote.recuperaEnMovimiento)
        XCTAssertFalse(trabajo.recuperaEnMovimiento, "el trabajo no es una recuperación")
    }
}
