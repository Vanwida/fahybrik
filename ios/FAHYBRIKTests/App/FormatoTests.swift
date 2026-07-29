import XCTest
@testable import FAHYBRIK

// LA GRAFÍA — el contrato de cómo se escribe cada número que ve el atleta.
//
// Estas pruebas existen porque el 28-jul el mismo dato salía de dos maneras en dos
// pantallas seguidas: «42,4» y «42.4», «5:00» y «05:00», «4:15/km» y «4:15 /km».
// La causa fue que cada pantalla tenía su propia copia del formateador. Ahora hay
// una sola, y esto es lo que la fija: si alguien cambia la grafía sin querer, salta
// aquí y no en la pantalla de un atleta.

final class FormatoTests: XCTestCase {

    // MARK: - Decimales

    func testDecimalUsaComaEspanolaNuncaPunto() {
        XCTAssertEqual(Formato.esDecimal(42.4), "42,4")
        XCTAssertFalse(Formato.esDecimal(42.4).contains("."), "El punto decimal delata que el número no pasó por Formato")
    }

    func testDecimalRedondoPierdeElDecimal() {
        // «5» y no «5,0»: el decimal en cero sugiere una precisión que no existe.
        XCTAssertEqual(Formato.esDecimal(5.0), "5")
        XCTAssertEqual(Formato.esDecimal(82.5), "82,5")
    }

    func testDecimalSiempreDecimalesMantieneLaCifra() {
        // La velocidad de la cinta cambia en pasos de 0,1: perder el decimal al pasar
        // por 12 haría saltar el ancho del número en vivo.
        XCTAssertEqual(Formato.esDecimal(12.0, siempreDecimales: true), "12,0")
    }

    func testDecimalSobreTextoDelServidorSoloCambiaElSeparador() {
        XCTAssertEqual(Formato.esDecimal("42.4"), "42,4")
    }

    // MARK: - Duración

    func testRelojSinCeroDelante() {
        XCTAssertEqual(Formato.clock(300), "5:00")
        XCTAssertEqual(Formato.clock(65), "1:05")
    }

    func testRelojConAnchoFijoLlevaElCeroDelante() {
        // El cronómetro en vivo, y SOLO él: así el layout no baila al pasar de 9:59.
        XCTAssertEqual(Formato.clock(300, anchoFijo: true), "05:00")
        XCTAssertEqual(Formato.clock(599, anchoFijo: true), "09:59")
        XCTAssertEqual(Formato.clock(600, anchoFijo: true), "10:00")
    }

    func testRelojPasaAHorasYAhiElAnchoYaEsFijo() {
        XCTAssertEqual(Formato.clock(3730), "1:02:10")
        XCTAssertEqual(Formato.clock(3730, anchoFijo: true), "1:02:10")
    }

    func testRelojSubMinutoEnSegundos() {
        // Un descanso se lee «45s» de un vistazo; «0:45» hace pensar.
        XCTAssertEqual(Formato.clock(45, subMinuto: .segundos), "45s")
        XCTAssertEqual(Formato.clock(45), "0:45")
        // Por encima del minuto la regla no cambia.
        XCTAssertEqual(Formato.clock(90, subMinuto: .segundos), "1:30")
    }

    func testRelojEnMinutosNoPasaAHoras() {
        // El marcador de carrera habla en minutos («sub-60»): 3825 es 63:45.
        XCTAssertEqual(Formato.clock(3825, enHoras: false), "63:45")
        XCTAssertEqual(Formato.clock(3825), "1:03:45")
    }

    func testRelojNuncaEsNegativo() {
        XCTAssertEqual(Formato.clock(-5), "0:00")
        XCTAssertEqual(Formato.clock(0), "0:00")
    }

    // MARK: - Ritmo

    func testRitmoPegaLaUnidadSinEspacio() {
        XCTAssertEqual(Formato.ritmo(255, .porKm), "4:15/km")
        XCTAssertEqual(Formato.ritmo(112, .por500m), "1:52/500m")
    }

    func testUnidadDelErgoLlevaLaEme() {
        // «/500» a secas se lee «quinientos» y no dice de qué.
        XCTAssertEqual(Formato.UnidadRitmo.por500m.rawValue, "/500m")
    }

    func testRitmoCifrasNoTraeUnidad() {
        // Para las celdas que pintan la unidad en su propia etiqueta.
        XCTAssertEqual(Formato.ritmoCifras(255), "4:15")
    }

    // MARK: - Distancia

    func testDistanciaPrescritaUnDecimalYComa() {
        XCTAssertEqual(Formato.distancia(2500), "2,5 km")
        XCTAssertEqual(Formato.distancia(5000), "5 km")
        XCTAssertEqual(Formato.distancia(450), "450 m")
    }

    func testDistanciaCubiertaLlevaDosDecimales() {
        // Lo que has cubierto es una MEDIDA: la precisión es el dato.
        XCTAssertEqual(Formato.distanciaCubierta(2340), "2,34 km")
        XCTAssertEqual(Formato.distanciaCubierta(2000), "2,00 km")
    }

    func testDistanciaCeroNoSePinta() {
        // Lo que no se sabe no se pinta (contrato §7).
        XCTAssertNil(Formato.distancia(0))
        XCTAssertNil(Formato.distancia(-10))
    }

    // MARK: - Carga

    func testKilosConComaYUnidad() {
        XCTAssertEqual(Formato.kg(80), "80 kg")
        XCTAssertEqual(Formato.kg(82.5), "82,5 kg")
    }

    // MARK: - Vocabulario (contrato §3)

    func testElPulsoSeLlamaFCYSeMideEnPpm() {
        XCTAssertEqual(Vocab.fc, "FC")
        XCTAssertEqual(Vocab.ppm, "ppm")
        XCTAssertEqual(Vocab.fcMedia, "FC media")
    }

    func testLaCadenciaNoCompartUnidadConElPulso() {
        // Las dos se escribían «ppm» en las mismas pantallas.
        XCTAssertNotEqual(Vocab.cadencia, Vocab.ppm)
    }
}
