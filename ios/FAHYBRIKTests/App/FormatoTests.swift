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

    // MARK: - La serie de fuerza (§2.1, canónico nuevo del 29-jul)

    func testLaSerieSeEscribeRepeticionesPorCarga() {
        // «5 × 100» + «kg», con la unidad aparte para que el sujeto la pinte más
        // pequeña sin recomponer el string a mano.
        let s = Formato.serie(reps: 5, cargaKg: 100)
        XCTAssertEqual(s?.cifra, "5 × 100")
        XCTAssertEqual(s?.unidad, "kg")
        XCTAssertEqual(s?.linea, "5 × 100 kg")
    }

    func testLaSerieLlevaElSignoDeMultiplicarNoLaEquisDelTeclado() {
        // La «x» del teclado se lee como letra al lado de una cifra («5 x 100»
        // parece una talla) y cambia de anchura en la monoespaciada.
        let cifra = try? XCTUnwrap(Formato.serie(reps: 5, cargaKg: 100)?.cifra)
        XCTAssertEqual(Formato.signoPor, "\u{00D7}")
        XCTAssertFalse(cifra?.contains("x") ?? true)
        XCTAssertFalse(cifra?.contains("X") ?? true)
    }

    func testLaSerieDegradaALoQueSEsabeYNuncaInventaLaOtraMitad() {
        // Sin repeticiones —el circuito real del coach llega con 30 kg y ninguna—
        // la serie es la carga sola. Sin carga (peso corporal), las repeticiones.
        XCTAssertEqual(Formato.serie(reps: nil, cargaKg: 30)?.linea, "30 kg")
        XCTAssertEqual(Formato.serie(reps: 12, cargaKg: nil)?.linea, "12 reps")
        // Sin ninguna de las dos NO hay cifra que inventar (§7).
        XCTAssertNil(Formato.serie(reps: nil, cargaKg: nil))
    }

    func testLaCargaDeLaSeriePasaPorLaComaEspanola() {
        XCTAssertEqual(Formato.serie(reps: 3, cargaKg: 82.5)?.cifra, "3 × 82,5")
    }

    func testSeriesPorRepeticionesEsOtroConceptoYVaPEGADO() {
        // «4×5» es la dosis de TODA la prescripción y se lee de un vistazo en una
        // franja; «5 × 100 kg» es el sujeto de la pantalla y respira. Que se
        // parezcan es justo por lo que tienen que estar los dos aquí.
        XCTAssertEqual(Formato.dosisDeSeries(series: 4, reps: 5), "4×5")
        XCTAssertNotEqual(Formato.dosisDeSeries(series: 4, reps: 5),
                          Formato.serie(reps: 4, cargaKg: nil)?.cifra)
        // Una sola serie no se anuncia como «1×5»: eso no es una dosis, es un 5.
        XCTAssertEqual(Formato.dosisDeSeries(series: 1, reps: 5), "5")
        // Sin repeticiones escritas no hay nada que multiplicar (§7).
        XCTAssertNil(Formato.dosisDeSeries(series: 4, reps: nil))
    }

    // MARK: - Vocabulario (contrato §3)

    func testElRirSeTraducePorqueElNumeroSoloNoDiceQueHacer() {
        // El atleta que entra hoy no ha visto la escala nunca.
        XCTAssertEqual(Vocab.rirTraducido(2), "RIR 2 · deja 2 dentro")
        XCTAssertEqual(Vocab.rirTraducido(0), "RIR 0 · hasta el fallo")
    }

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
