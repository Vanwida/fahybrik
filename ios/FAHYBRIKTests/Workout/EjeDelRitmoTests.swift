import XCTest
@testable import FAHYBRIK

// EL EJE LO FIJA LO QUE SE CORRIÓ. Esta regla se afinó TRES veces y las dos primeras
// versiones suenan razonables, así que alguien las reintroducirá. Cada una tiene aquí
// su test para que salte antes de llegar a la pantalla.
final class EjeDelRitmoTests: XCTestCase {

    private func muestras(_ pares: [(Double, Double)]) -> [Muestra] {
        pares.map { Muestra(t: $0.0, v: $0.1) }
    }

    private func tramo(
        _ papel: PapelDeTramo, modo: ModoRecuperacion? = nil,
        inicio: Double, dur: Double
    ) -> Repeticion {
        Repeticion(n: 1, papel: papel, modo: modo, inicioS: inicio, duracionS: dur,
                   distanciaM: nil, ritmoSkm: nil, fcMediaPpm: nil,
                   pendientePct: nil, veredicto: nil)
    }

    // ANDAR NO ES CORRER. Bajar andando de una cuesta son 11:40/km (700 s): metido en
    // el eje junto a subidas de 4:30 aplasta las repeticiones contra el borde y la
    // curva deja de leerse justo donde está el sujeto.
    func testAndarNoEnsanchaElEje() {
        let ritmo = muestras([(0, 270), (10, 275), (100, 700), (110, 690), (200, 272)])
        let reps = [tramo(.recuperacion, modo: .andando, inicio: 95, dur: 60)]

        let d = EjeDelRitmo.dominio(ritmo: ritmo, repeticiones: reps, banda: nil)

        XCTAssertLessThan(d.max, 400, "los 700 s/km del paseo no pueden fijar el techo")
        XCTAssertGreaterThan(d.max, 275, "pero lo que SÍ se corrió entra entero")
    }

    // TROTAR SÍ ES CORRER. Un trote a 6:10 entre series a 3:30 entra en el eje, con su
    // franja y su veredicto — y de hecho suele ser LA explicación de que la quinta
    // repetición se caiga.
    func testTrotarEntraEnElEje() {
        let ritmo = muestras([(0, 210), (10, 212), (100, 370), (110, 372), (200, 208)])
        let reps = [tramo(.recuperacion, modo: .trote, inicio: 95, dur: 60)]

        let d = EjeDelRitmo.dominio(ritmo: ritmo, repeticiones: reps, banda: nil)

        XCTAssertGreaterThan(d.max, 372, "el trote va DENTRO del eje")
    }

    // VERSIÓN ERRÓNEA Nº1, anotada para que no vuelva: «el eje se escala al rango del
    // TRABAJO». En una serie el calentamiento va mucho más lento que las repeticiones,
    // así que ceñirlo al trabajo convierte «seis picos que nacen de un rodaje» en
    // «seis mesetas flotando». Rompía las gráficas buenas para arreglar la mala.
    func testElCalentamientoNoSeSaleDelEje() {
        // Calentamiento a 5:20 (320) y seis repeticiones a 3:30 (210). Sin papel de
        // recuperación: es un tramo suelto, y tiene que caber.
        let ritmo = muestras([(0, 320), (60, 318), (600, 210), (700, 212), (800, 209)])

        let d = EjeDelRitmo.dominio(ritmo: ritmo, repeticiones: [], banda: nil)

        XCTAssertGreaterThan(d.max, 320, "el calentamiento cabe: los picos nacen de él")
        XCTAssertLessThan(d.min, 209)
    }

    // VERSIÓN ERRÓNEA Nº2: «el trabajo y lo continuo; la recuperación entra solo si
    // cabe». Apuntaba al PAPEL del tramo, que era correlación y no causa: con
    // recuperación EN TROTE —lo normal en carrera— el escenario estrella se salvaba
    // por dos segundos y el de cinta salía roto. El criterio es la LOCOMOCIÓN, y por
    // eso una recuperación en trote cuenta igual que cualquier otro tramo corrido.
    func testElCriterioEsLaLocomocionNoElPapel() {
        let ritmo = muestras([(0, 210), (100, 370), (200, 208)])
        let comoRecuperacionEnTrote = EjeDelRitmo.dominio(
            ritmo: ritmo,
            repeticiones: [tramo(.recuperacion, modo: .trote, inicio: 95, dur: 60)],
            banda: nil
        )
        let comoTramoSuelto = EjeDelRitmo.dominio(ritmo: ritmo, repeticiones: [], banda: nil)

        XCTAssertEqual(comoRecuperacionEnTrote.min, comoTramoSuelto.min, accuracy: 0.001)
        XCTAssertEqual(comoRecuperacionEnTrote.max, comoTramoSuelto.max, accuracy: 0.001,
                       "el PAPEL no decide nada: decide cómo te moviste")
    }

    // EL SUELO: si no se corrió NADA —una caminata, o una vuelta a la calma andada
    // entera— andar deja de ser la excepción porque es lo único que hay, y manda. Sin
    // esto el eje se queda sin nada que lo fije y la curva sale degenerada.
    func testSiNoSeCorrioNadaMandaLoQueHaya() {
        let ritmo = muestras([(0, 700), (10, 710), (20, 690)])
        let reps = [tramo(.recuperacion, modo: .andando, inicio: 0, dur: 60)]

        let d = EjeDelRitmo.dominio(ritmo: ritmo, repeticiones: reps, banda: nil)

        XCTAssertGreaterThan(d.max, 710, "sin nada corrido, el paseo ES la carrera")
        XCTAssertLessThan(d.min, 690)
    }

    // Una sola muestra corrida no basta para fijar un eje: también cae al suelo.
    func testUnaSolaMuestraCorridaNoFijaElEje() {
        let ritmo = muestras([(0, 700), (10, 710), (100, 210)])
        let reps = [tramo(.recuperacion, modo: .andando, inicio: 0, dur: 60)]

        let d = EjeDelRitmo.dominio(ritmo: ritmo, repeticiones: reps, banda: nil)
        XCTAssertGreaterThan(d.max, 710, "con un punto no se dibuja una curva")
    }

    // Parar ya era un hueco: no emite muestras, pero su ventana tampoco ensancha nada.
    func testPararTampocoEnsanchaElEje() {
        let ritmo = muestras([(0, 210), (10, 212), (200, 208), (210, 209)])
        let reps = [tramo(.recuperacion, modo: .parado, inicio: 20, dur: 170)]

        let d = EjeDelRitmo.dominio(ritmo: ritmo, repeticiones: reps, banda: nil)
        XCTAssertLessThan(d.max, 250)
    }

    // LA BANDA ENTRA EN EL EJE: si el objetivo cae fuera del rango corrido, la franja
    // tiene que verse igual — es contra ella contra lo que se lee la curva.
    func testLaBandaDeRitmoEntraEnElEje() {
        let ritmo = muestras([(0, 210), (10, 212)])
        let d = EjeDelRitmo.dominio(
            ritmo: ritmo, repeticiones: [],
            banda: .ritmo(rapidoSkm: 195, lentoSkm: 240)
        )
        XCTAssertLessThan(d.min, 195)
        XCTAssertGreaterThan(d.max, 240)
    }

    // Una banda de PULSO no toca el eje del ritmo: vive en otra señal.
    func testLaBandaDePulsoNoTocaElEjeDelRitmo() {
        let ritmo = muestras([(0, 270), (10, 272)])
        let conPulso = EjeDelRitmo.dominio(
            ritmo: ritmo, repeticiones: [],
            banda: .pulso(minPpm: 130, maxPpm: 148, zona: 2)
        )
        let sinBanda = EjeDelRitmo.dominio(ritmo: ritmo, repeticiones: [], banda: nil)
        XCTAssertEqual(conPulso.min, sinBanda.min, accuracy: 0.001)
        XCTAssertEqual(conPulso.max, sinBanda.max, accuracy: 0.001)
    }

    // Un rango degenerado (todo el mismo ritmo) no colapsa la curva en una línea sin
    // altura: recibe margen 1.
    func testUnRangoPlanoNoColapsa() {
        let d = EjeDelRitmo.extremos([270, 270, 270], [])
        XCTAssertEqual(d.min, 269)
        XCTAssertEqual(d.max, 271)
    }

    // Sin ninguna muestra el eje no revienta.
    func testSinMuestrasNoRevienta() {
        let d = EjeDelRitmo.dominio(ritmo: [], repeticiones: [], banda: nil)
        XCTAssertLessThan(d.min, d.max)
    }

    // El margen es el 12 % del rango, arriba y abajo.
    func testElMargenEsDocePorCiento() {
        let d = EjeDelRitmo.extremos([200, 300], [])
        XCTAssertEqual(d.min, 188, accuracy: 0.001)
        XCTAssertEqual(d.max, 312, accuracy: 0.001)
    }
}
