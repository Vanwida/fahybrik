import XCTest
@testable import FAHYBRIK

// EL MOMENTO DE «HOY · EL DÍA», CLAVADO SOBRE LOS CATORCE CASOS.
//
// La portada cambia de sujeto a lo largo del día. Que el sujeto sea el correcto no se ve mirando un
// mockup: se ve igual de bien un check-in que tapa una sesión que al revés. Así que la precedencia se
// fija aquí, caso a caso, y cada paso de la escalera tiene al menos un caso que lo ejercita.
//
// Es la TRADUCCIÓN de `web/tests/design-twin/hoy-dia-momento.test.ts` (los mismos 36 casos y los
// mismos resultados) sobre los mismos catorce atletas (`HoyCasos`): la app y el doble no pueden
// divergir sin que salte una de las dos. Los que siguen a los 36 son de lo que la app modela y el
// doble no (un descanso con lo siguiente ya publicado, un contador de tests sin batería).

final class MomentoHoyTests: XCTestCase {

    private func lectura(_ id: String) -> LecturaHoy { HoyCasos.lectura(id) }

    /// El sujeto que toca en cada uno de los catorce escenarios del doble.
    private static let esperado: [String: MomentoHoy.Tipo] = [
        "listo": .sesion,
        "manana": .checkin,
        "cargado": .sesion,
        "hecho": .hecho,
        "doble": .sesion,
        "descanso": .descanso,
        "pausado": .pausa,
        "sin-objetivo": .sesion,
        "alta": .checkin,
        "libre": .libre,
        "a-medias": .retoma,
        "avisos": .sesion,
        "cargando": .cargando,
        "error": .error,
    ]

    // MARK: - momento() sobre los catorce casos

    func testCubreExactamenteLosCatorceEscenariosDelDoble() {
        XCTAssertEqual(Set(Self.esperado.keys), Set(HoyCasos.todos.map(\.id)))
        XCTAssertEqual(HoyCasos.todos.count, 14)
    }

    func testCadaCasoTieneSuSujeto() {
        for caso in HoyCasos.todos {
            XCTAssertEqual(caso.lectura.momento.tipo, Self.esperado[caso.id], "caso \(caso.id)")
        }
    }

    func testLaSesionDeUnDiaDobleEsLaPrimeraPendienteYTraeLaOtraFranjaSinSerHeroe() {
        guard case .sesion(let sesion, let delDia) = lectura("doble").momento else {
            return XCTFail("un día doble con una pendiente tiene sujeto de sesión")
        }
        XCTAssertEqual(sesion.franja, .pm)
        XCTAssertEqual(sesion.titulo, "Fuerza tren superior")
        XCTAssertEqual(delDia.map(\.estado), [.hecha, .pendiente])
    }

    func testRetomarEsLaMismaSesionDeHoyEmpezada() {
        guard case .retoma(let titulo, let desde, let sesion) = lectura("a-medias").momento else {
            return XCTFail("un entreno guardado es el sujeto")
        }
        XCTAssertEqual(titulo, "Series 6×800")
        XCTAssertEqual(desde, "8:12")
        XCTAssertEqual(sesion?.modalidad, .run)
    }

    func testElDescansoDiceQueTocaDespues() {
        XCTAssertEqual(
            lectura("descanso").momento,
            .descanso(manana: Manana(titulo: "Series 8×400", modalidad: .run, dia: "mañana"), hayMasPublicado: true)
        )
    }

    // MARK: - La precedencia, paso a paso

    private var base: LecturaHoy { lectura("listo") }

    func testCargandoGanaATodoIncluidoUnError() {
        var l = base
        l.cargando = true
        l.hoy = .errorCarga
        XCTAssertEqual(l.momento.tipo, .cargando)
    }

    func testElErrorGanaANoTenerCoach() {
        var l = base
        l.conCoach = false
        l.hoy = .errorCarga
        XCTAssertEqual(l.momento.tipo, .error)
    }

    func testSinCoachGanaAUnEntrenoAMediasYAlCheckinYElAMediasBajaAContigo() {
        var l = base
        l.conCoach = false
        l.checkinPendiente = true
        l.reclamos = [.aMedias(titulo: "Libre", desde: "8:00")]
        let m = l.momento
        XCTAssertEqual(m.tipo, .libre)
        XCTAssertEqual(l.itemsContigo(m).map(\.clave), [.aMedias])
    }

    func testLaPausaGanaAUnEntrenoAMedias() {
        var l = base
        l.hoy = .pausado
        l.reclamos = [.aMedias(titulo: "X", desde: "8:00")]
        XCTAssertEqual(l.momento.tipo, .pausa)
    }

    func testElEntrenoAMediasGanaAlCheckin() {
        var l = base
        l.checkinPendiente = true
        l.reclamos = [.aMedias(titulo: "Series 6×800", desde: "8:12")]
        XCTAssertEqual(l.momento.tipo, .retoma)
    }

    func testConElCheckinHechoLaRecienDadaDeAltaPasaASuPrimerDia() {
        var l = lectura("alta")
        l.checkinPendiente = false
        XCTAssertEqual(l.momento.tipo, .primerDia)
    }

    func testUnVeteranoSinNadaPublicadoDespuesDeHoyNoEsUnPrimerDia() {
        var l = base
        l.hoy = .descanso(manana: nil, hayMasPublicado: false)
        XCTAssertEqual(l.momento, .descanso(manana: nil, hayMasPublicado: false))
    }

    func testConTodasLasSesionesCerradasHechaAMediasOSinHacerEsHechoHoy() {
        var l = base
        l.hoy = .sesiones([
            HoyCasos.sesion("A", .run, .parcial, franja: .am),
            HoyCasos.sesion("B", .strength, .saltada, franja: .pm),
        ])
        XCTAssertEqual(l.momento.tipo, .hecho)
    }

    // MARK: - La línea del día

    func testAntesDeEntrenarEntreDosSesionesConUnoAMediasYDespues() {
        XCTAssertEqual(lectura("listo").instanteDelDia, .recorrido(ahora: .antes, cerradas: 0, total: 1))
        XCTAssertEqual(lectura("doble").instanteDelDia, .recorrido(ahora: .entreno, cerradas: 1, total: 2))
        XCTAssertEqual(lectura("a-medias").instanteDelDia, .recorrido(ahora: .entreno, cerradas: 0, total: 1))
        XCTAssertEqual(lectura("hecho").instanteDelDia, .recorrido(ahora: .despues, cerradas: 1, total: 1))
    }

    func testSinSesionesDiceQueDiaEsEnVezDeDibujarUnRecorridoVacio() {
        XCTAssertEqual(lectura("descanso").instanteDelDia, .rotulo("Día de descanso"))
        XCTAssertEqual(lectura("pausado").instanteDelDia, .rotulo("Plan en pausa"))
        XCTAssertEqual(lectura("alta").instanteDelDia, .rotulo("Primer día"))
    }

    func testSinCoachCargandoOConErrorNoHayDiaQueContar() {
        XCTAssertNil(lectura("libre").instanteDelDia)
        XCTAssertNil(lectura("cargando").instanteDelDia)
        XCTAssertNil(lectura("error").instanteDelDia)
    }

    func testElSaludoSigueLaHoraElCorteDeSiempreDeInicio() {
        XCTAssertEqual(SaludoDeLaHora.texto(hora: "7:40", nombre: "Nora"), "Buenos días, Nora")
        XCTAssertEqual(SaludoDeLaHora.texto(hora: "13:05", nombre: "Marina"), "Buenas tardes, Marina")
        XCTAssertEqual(SaludoDeLaHora.texto(hora: "21:30", nombre: nil), "Buenas noches")
        XCTAssertEqual(SaludoDeLaHora.texto(hora: "5:59", nombre: "Iván"), "Buenas noches, Iván")
    }

    // MARK: - «Contigo»

    func testLoQueCaducaAntesVaPrimeroYLosComunicadosCierran() {
        let l = lectura("avisos")
        XCTAssertEqual(l.itemsContigo(l.momento).map(\.clave), [.parejaEnVivo, .revision, .tests, .comunicados])
    }

    func testElEntrenoAMediasNoSeRepiteCuandoYaEsElSujeto() {
        let l = lectura("a-medias")
        XCTAssertEqual(l.itemsContigo(l.momento), [])
    }

    func testSinCoachNoApareceNingunaPiezaDeCoach() {
        var l = lectura("libre")
        l.comunicados = 3
        l.reclamos = [
            .tests(hechos: 0, total: 4),
            .revision(.propuesta, cuando: nil, minutos: nil, enlace: nil),
            .parejaEnVivo(nombre: "Biel", detalle: "Metcon"),
        ]
        XCTAssertEqual(l.itemsContigo(l.momento), [])
    }

    func testConElPlanEnPausaNoHayTestsQueHacer() {
        var l = lectura("pausado")
        l.reclamos = [.tests(hechos: 1, total: 4)]
        XCTAssertEqual(l.itemsContigo(l.momento), [])
    }

    func testElPrimerDiaSeLlevaLosTestsAlSujetoYNoSeRepitenAbajo() {
        var l = lectura("alta")
        l.checkinPendiente = false
        XCTAssertEqual(l.itemsContigo(l.momento).map(\.clave), [.comunicados])
        // Con el check-in aún por hacer, el sujeto es el check-in y los tests siguen abajo.
        let antes = lectura("alta")
        XCTAssertEqual(antes.itemsContigo(antes.momento).map(\.clave), [.tests, .comunicados])
    }

    func testUneteEnVivoSoloConTuSesionPendienteYElPlanEnMarcha() {
        XCTAssertTrue(lectura("avisos").puedeUnirse)
        XCTAssertFalse(lectura("hecho").puedeUnirse)
        XCTAssertFalse(lectura("pausado").puedeUnirse)
        XCTAssertFalse(lectura("descanso").puedeUnirse)
    }

    // MARK: - Lo que la app modela y el doble no

    func testUnDescansoConLoSiguienteYaPublicadoNoEsUnPrimerDiaNiDiceNadaPublicado() {
        var l = lectura("alta")
        l.checkinPendiente = false
        l.hoy = .descanso(manana: nil, hayMasPublicado: true)
        XCTAssertEqual(l.momento, .descanso(manana: nil, hayMasPublicado: true))
        XCTAssertEqual(l.instanteDelDia, .rotulo("Día de descanso"))
    }

    func testSinBateriaPublicadaTambienSeLlevanLosTestsAlPrimerDia() {
        var l = lectura("alta")
        l.checkinPendiente = false
        l.reclamos = [.tests(hechos: 0, total: nil)]
        XCTAssertNotNil(l.testsDelPrimerDia)
        XCTAssertEqual(l.itemsContigo(l.momento).map(\.clave), [.comunicados])
        // Una batería completa no es por dónde empezar.
        l.reclamos = [.tests(hechos: 4, total: 4)]
        XCTAssertNil(l.testsDelPrimerDia)
    }

    func testLosEstadosDeUnaSesionHablanElVocabularioDeLaApp() {
        XCTAssertEqual(EstadoSesion.hecha.etiqueta, "Completada")
        XCTAssertEqual(EstadoSesion.parcial.etiqueta, "A medias")
        XCTAssertEqual(EstadoSesion.saltada.etiqueta, "Sin hacer")
        XCTAssertEqual(EstadoSesion.pendiente.etiqueta, "Por hacer")
        XCTAssertEqual(ModalidadHoy.functional.nombre, "Funcional")
        XCTAssertEqual(ModalidadHoy.hyrox.nombre, "HYROX")
    }
}
