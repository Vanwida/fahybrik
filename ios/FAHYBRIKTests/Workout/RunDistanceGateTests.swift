import XCTest
@testable import FAHYBRIK

// LOS METROS QUE SE PERDÍAN. Cada prueba de aquí es un caso que la puerta anterior
// tiraba a la basura, con números de carrera real.
//
// La puerta vieja aceptaba un tramo sólo si medía entre 2 y 60 metros. 60 metros no
// son implausibles: lo son sólo si ocurren DEPRISA. Y como el punto de referencia
// avanzaba igual aunque el tramo se descartara, esos metros no volvían nunca.
final class RunDistanceGateTests: XCTestCase {

    // MARK: - Lo que la puerta vieja tiraba

    // EL CASO QUE LO DESTAPÓ. Treinta segundos de hueco de señal a ritmo de rodaje
    // (5:00/km = 3,33 m/s) son 100 metros. La puerta vieja los tiraba enteros por
    // pasar de 60; son perfectamente humanos y ahora cuentan.
    func testAThirtySecondGapAtEasyPaceCountsItsMetres() {
        XCTAssertEqual(
            RunDistanceGate.judge(meters: 100, seconds: 30),
            .accept(meters: 100)
        )
    }

    // Y CUANTO MÁS RÁPIDO IBAS, ANTES PERDÍAS. A 3:30/km (4,76 m/s) se cruzaban los
    // 60 m en 12 s; a 5:00/km, en 18. Las series perdían más que los rodajes, que es
    // justo al revés de lo que uno querría.
    func testTheFasterYouRunTheSoonerTheOldGateBitYou() {
        // 13 s a 3:30/km ≈ 62 m — moría por 2 metros.
        XCTAssertEqual(RunDistanceGate.judge(meters: 62, seconds: 13), .accept(meters: 62))
        // Un minuto entero de túnel a ritmo de maratón: 200 m, y son suyos.
        XCTAssertEqual(RunDistanceGate.judge(meters: 200, seconds: 60), .accept(meters: 200))
    }

    // Un bache de precisión largo: tres minutos entre edificios altos a ritmo suave.
    // 540 metros que antes se evaporaban en un solo `if`.
    func testALongSignalHoleIsRecoveredWhole() {
        XCTAssertEqual(RunDistanceGate.judge(meters: 540, seconds: 180), .accept(meters: 540))
    }

    // MARK: - Lo que sigue sin colar

    // UN SALTO DEL GPS. 300 metros en 2 segundos son 150 m/s: eso no lo hace nadie.
    func testATeleportIsRejected() {
        XCTAssertEqual(RunDistanceGate.judge(meters: 300, seconds: 2), .implausible)
    }

    // El techo está por encima del pico de Usain Bolt (12,42 m/s), así que ningún
    // humano corriendo cae por aquí — sólo el GPS mintiendo o un trayecto en coche.
    func testTheCeilingIsAboveTheFastestHumanAlive() {
        let boltPeak = 12.42
        XCTAssertEqual(
            RunDistanceGate.judge(meters: boltPeak, seconds: 1),
            .accept(meters: boltPeak),
            "el hombre más rápido de la historia tiene que contar"
        )
        // Un coche a 80 km/h (22,2 m/s), no.
        XCTAssertEqual(RunDistanceGate.judge(meters: 22.2, seconds: 1), .implausible)
    }

    // Sin tiempo entre fixes no hay velocidad que juzgar: ni se cuenta ni se mueve nada.
    func testWithoutTimeThereIsNoJudgement() {
        XCTAssertEqual(RunDistanceGate.judge(meters: 10, seconds: 0), .unmeasurable)
        XCTAssertEqual(RunDistanceGate.judge(meters: 10, seconds: -5), .unmeasurable)
        XCTAssertEqual(RunDistanceGate.judge(meters: .nan, seconds: 1), .unmeasurable)
    }

    // MARK: - El goteo de los avances cortos

    // Andar despacio en una recuperación daba avances por debajo de 2 m que se
    // descartaban Y movían la referencia: restaba siempre, nunca sumaba. Ahora no
    // cuentan TODAVÍA, que es distinto de perderse.
    func testASmallAdvanceIsNotLostJustNotCountedYet() {
        XCTAssertEqual(RunDistanceGate.judge(meters: 1.5, seconds: 2), .tooSmallYet)
    }

    // Y COMO EL ANCLA NO SE MUEVE, SUMAN SOLOS. Cuatro avances de 1,5 m medidos
    // siempre desde el último punto bueno cruzan el umbral al tercero.
    func testSmallAdvancesAccumulateFromTheSameAnchor() {
        // Medidos desde el ancla, no entre sí: 1,5 · 3,0 · 4,5 · 6,0
        XCTAssertEqual(RunDistanceGate.judge(meters: 1.5, seconds: 2), .tooSmallYet)
        XCTAssertEqual(RunDistanceGate.judge(meters: 3.0, seconds: 4), .accept(meters: 3.0))
    }

    // MARK: - La invariante que hacía irreversible el fallo

    // SÓLO `accept` AUTORIZA A MOVER EL ANCLA. Es la regla entera: mientras la
    // referencia no avance, lo no contado se vuelve a medir desde el último punto
    // bueno y nada se pierde para siempre.
    func testOnlyAcceptMayAdvanceTheAnchor() {
        let rejections: [RunDistanceGate.Verdict] = [
            RunDistanceGate.judge(meters: 300, seconds: 2),    // implausible
            RunDistanceGate.judge(meters: 1.0, seconds: 2),    // tooSmallYet
            RunDistanceGate.judge(meters: 10, seconds: 0),     // unmeasurable
        ]
        for verdict in rejections {
            if case .accept = verdict {
                XCTFail("un descarte no puede parecer una aceptación: \(verdict)")
            }
        }
    }

    // MARK: - La composición con el filtro de precisión

    // Un fix flojo no entra (y no mueve el ancla), pero el hueco que abre lo rescata
    // ENTERO el primer fix bueno: antes ese rescatador moría por pasar de 60 m.
    func testTheFixThatRescuesTheHoleNoLongerDies() {
        XCTAssertFalse(RunDistanceGate.isFixUsable(horizontalAccuracyM: 40))
        XCTAssertFalse(RunDistanceGate.isFixUsable(horizontalAccuracyM: -1))
        XCTAssertTrue(RunDistanceGate.isFixUsable(horizontalAccuracyM: 25))
        XCTAssertTrue(RunDistanceGate.isFixUsable(horizontalAccuracyM: 8))

        // 25 s de bache a 4 m/s = 100 m, recuperados de una pieza.
        XCTAssertEqual(RunDistanceGate.judge(meters: 100, seconds: 25), .accept(meters: 100))
    }

    // LA INSIGNIA DICE LA VERDAD. Decía «GPS débil» hasta 40 m mientras la distancia
    // cortaba en 25: entre esos dos números el atleta leía «va flojo pero va» con el
    // contador a cero. Ahora comparten el número.
    func testTheBadgeCannotClaimWeakWhileNothingIsCounted() {
        XCTAssertEqual(GPSSignalQuality.weakThresholdM, RunDistanceGate.accuracyGateMeters)
        XCTAssertEqual(GPSSignalQuality.from(horizontalAccuracyM: 30), .searching,
                       "30 m no cuenta metros, así que no puede decir «débil»")
        XCTAssertEqual(GPSSignalQuality.from(horizontalAccuracyM: 20), .weak)
        XCTAssertEqual(GPSSignalQuality.from(horizontalAccuracyM: 8), .strong)
    }
}
