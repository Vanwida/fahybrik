import XCTest
@testable import FAHYBRIK

// EL SOBRE DEL PANEL, PROBADO POR DONDE SE ROMPE. Dos mitades:
//  1. El JSON REAL del motor (`cargarPanel`) decodifica campo a campo y cada valor
//     que se lee sale tal cual lo sirvió el servidor: el cliente pinta, no calcula.
//  2. Un valor nuevo del servidor (bloque, ventana, unidad, familia, ancla, falta)
//     no tumba la pantalla: decodifica a su caso desconocido o se pierde solo.
final class PanelAnaliticasDecodeTests: XCTestCase {

    private func decodifica(_ json: String) throws -> PanelAnaliticas {
        try APIClient.makeJSONDecoder().decode(PanelAnaliticas.self, from: Data(json.utf8))
    }

    private func decodificaLectura(_ json: String) throws -> LecturaAnalitica {
        try APIClient.makeJSONDecoder().decode(LecturaAnalitica.self, from: Data(json.utf8))
    }

    private func lectura(_ p: PanelAnaliticas, _ bloque: BloqueDelPanel, _ id: String) throws -> LecturaAnalitica {
        try XCTUnwrap(AnaliticasDerivados.lectura(p.bloques[bloque], id), "falta la lectura \(id)")
    }

    // MARK: - Los paneles del motor real

    func testLosDiezPanelesDelMotorDecodifican() throws {
        for atleta in AnaliticasFixtures.Atleta.allCases {
            let p = try AnaliticasFixtures.panel(atleta)
            XCTAssertEqual(p.ventana.clave, .doceSemanas, atleta.rawValue)
            XCTAssertEqual(p.ventana.dias, 84, atleta.rawValue)
            XCTAssertEqual(p.hoy, "2026-09-29", atleta.rawValue)
            XCTAssertEqual(p.generadoIso, "2026-09-29T10:00:00.000Z", atleta.rawValue)
            XCTAssertTrue(p.pendientes.isEmpty, "\(atleta.rawValue): el servidor sirve ya los ocho bloques")
            XCTAssertEqual(p.bloques.estado.count, 4, "\(atleta.rawValue): disposición y las tres copias")
            XCTAssertEqual(p.bloques.forma.count, 6, atleta.rawValue)
            XCTAssertEqual(p.bloques.progreso.count, 7, "\(atleta.rawValue): las siete familias, con o sin dato")
            XCTAssertEqual(p.bloques.recuperacion.count, 4, atleta.rawValue)
            for b in BloqueDelPanel.delCuerpo {
                let ids = p.bloques[b].map(\.id)
                XCTAssertEqual(Set(ids).count, ids.count, "\(atleta.rawValue) \(b): ids repetidos")
            }
        }
        for v in VentanaClave.todas where v != .doceSemanas {
            XCTAssertNoThrow(try AnaliticasFixtures.panel(.lleno, v), v.rawValue)
        }
    }

    func testElMetodoSoloLeeLoQueElMotorSirve() throws {
        let m = try AnaliticasFixtures.panel(.lleno).metodo
        XCTAssertEqual(m.ctlDays, 42)
        XCTAssertEqual(m.atlDays, 7)
        XCTAssertEqual(m.rampAlertTssPerWeek, 5)
        XCTAssertEqual(m.coberturaVeredictoMinPct, 90)
        XCTAssertEqual(m.hrvMinNightsBaseline, 14)
        XCTAssertEqual(m.basalDias, 60)
    }

    func testLasSeisVentanasDelLleno() throws {
        let esperadas: [(VentanaClave, Int)] = [(.sieteDias, 7), (.cuatroSemanas, 28), (.doceSemanas, 84), (.seisMeses, 182), (.unAno, 364), (.todo, 359)]
        for (v, dias) in esperadas {
            let p = try AnaliticasFixtures.panel(.lleno, v)
            XCTAssertEqual(p.ventana.clave, v)
            XCTAssertEqual(p.ventana.dias, dias, v.rawValue)
            XCTAssertEqual(p.ventana.hasta, "2026-09-29", v.rawValue)
            if v == .todo {
                XCTAssertNil(p.ventana.anterior, "«todo» no tiene un antes")
                XCTAssertTrue(p.ventana.cubreTodo)
                XCTAssertEqual(p.ventana.desde, "2025-10-06", "desde el primer entreno")
            } else {
                XCTAssertEqual(p.ventana.anterior?.dias, dias, "el periodo anterior mide lo mismo: \(v.rawValue)")
            }
        }
        XCTAssertTrue(try AnaliticasFixtures.panel(.lleno, .unAno).ventana.cubreTodo, "un año ya abarca toda la historia")
        XCTAssertFalse(try AnaliticasFixtures.panel(.lleno, .doceSemanas).ventana.cubreTodo)
        XCTAssertEqual(try AnaliticasFixtures.panel(.lleno).historia.semanas, 51)
    }

    func testElLlenoTraeLaFormaConLaProyeccionEnLaMismaSerie() throws {
        let p = try AnaliticasFixtures.panel(.lleno)
        let fondo = try lectura(p, .forma, "carga.fondo")
        XCTAssertEqual(fondo.grupo, .forma)
        XCTAssertEqual(fondo.estado, .medida)
        XCTAssertEqual(fondo.dato?.unidad, .tss)
        XCTAssertEqual(try XCTUnwrap(fondo.dato?.valor), 25.78, accuracy: 0.01)
        XCTAssertEqual(fondo.serie?.paso, .dia)
        XCTAssertEqual(fondo.serie?.puntos.count, 84, "los 84 días de la ventana")
        XCTAssertEqual(fondo.serie?.plan?.count, 39, "la proyección hasta la carrera, en la misma serie")
        XCTAssertEqual(fondo.procedencia.ancla, .declarada)
        XCTAssertEqual(fondo.comparacion?.unidad, .tss)
        XCTAssertEqual(try XCTUnwrap(fondo.comparacion?.delta), -2.71, accuracy: 0.01)
        XCTAssertEqual(fondo.comparacion?.cambioMinimo, 5)
        XCTAssertEqual(fondo.comparacion?.significativo, false, "-2,7 no llega al cambio mínimo del coach")
        XCTAssertEqual(fondo.cobertura.muestras, 62)
        XCTAssertEqual(fondo.cobertura.diasConDato, 62)
        XCTAssertNil(fondo.cobertura.falta)

        let frescura = try lectura(p, .forma, "carga.frescura")
        XCTAssertEqual(try XCTUnwrap(frescura.dato?.valor), -2.19, accuracy: 0.01)
        XCTAssertEqual(frescura.veredicto?.code, "mantener")
        XCTAssertEqual(frescura.veredicto?.etiquetaEs, "Manteniendo")
        XCTAssertEqual(frescura.veredicto?.tono, .neutro)
        XCTAssertNil(frescura.veredicto?.fraseEs)
        XCTAssertEqual(frescura.serie?.referencias?.map(\.valor), [-30, -11, 4, 29], "las cuatro bandas del coach, en unidades reales")
        XCTAssertEqual(frescura.dato?.referencia?.de, "equilibrio")

        XCTAssertEqual(try lectura(p, .forma, "carga.subida").veredicto?.etiquetaEs, "Subida sostenible")
        XCTAssertEqual(try lectura(p, .forma, "carga.cobertura").dato?.valor, 100)
        XCTAssertEqual(try XCTUnwrap(try lectura(p, .forma, "carga.proyeccion").dato?.valor), 7.72, accuracy: 0.01)

        let disposicion = try lectura(p, .estado, "estado.readiness")
        XCTAssertEqual(disposicion.tituloEs, "Disposición")
        XCTAssertEqual(disposicion.dato?.valor, 76)
        XCTAssertEqual(disposicion.dato?.unidad, .puntos)
        XCTAssertEqual(disposicion.dato?.referencia?.de, "hace_7d")
        XCTAssertEqual(disposicion.dato?.referencia?.valor, 61)
        XCTAssertEqual(disposicion.veredicto?.etiquetaEs, "Bien")
        XCTAssertEqual(disposicion.veredicto?.tono, .bien)
    }

    func testElLlenoTraeLasSemanasConSuRepartoYElCumplimiento() throws {
        let p = try AnaliticasFixtures.panel(.lleno)
        let carga = try lectura(p, .semanas, "semanas.carga")
        XCTAssertEqual(try XCTUnwrap(carga.dato?.valor), 2250.53, accuracy: 0.01)
        XCTAssertEqual(carga.serie?.paso, .semana)
        XCTAssertEqual(carga.serie?.puntos.count, 13)
        XCTAssertEqual(carga.serie?.plan?.count, 13)
        XCTAssertEqual(carga.comparacion?.unidad, .pct, "el delta de carga se juzga en % (el umbral del coach)")
        XCTAssertEqual(try XCTUnwrap(carga.comparacion?.delta), -5.48, accuracy: 0.01)
        XCTAssertEqual(carga.reparto?.esProporcional, true)
        XCTAssertEqual(carga.reparto?.partes.map(\.code), ["correr", "remo", "fuerza", "estaciones", "otro"])
        XCTAssertEqual(try XCTUnwrap(carga.reparto?.partes.first?.pct), 74.97, accuracy: 0.01)

        let familias = AnaliticasDerivados.lecturas(p.bloques.semanas, prefijo: "semanas.carga.").compactMap(\.familia)
        XCTAssertEqual(familias, [.correr, .remo, .fuerza, .estaciones, .otro])

        let cumplimiento = try lectura(p, .semanas, "semanas.cumplimiento")
        XCTAssertEqual(cumplimiento.tituloEs, "Adherencia")
        XCTAssertEqual(cumplimiento.dato?.valor, 89)
        XCTAssertEqual(cumplimiento.dato?.unidad, .pct)
        XCTAssertEqual(cumplimiento.veredicto?.etiquetaEs, "Regular")
        XCTAssertEqual(cumplimiento.veredicto?.tono, .atencion)
        XCTAssertEqual(cumplimiento.comparacion?.unidad, .puntos, "un porcentaje contra otro se compara en puntos")
        XCTAssertEqual(cumplimiento.comparacion?.anterior, 94)
        XCTAssertEqual(cumplimiento.comparacion?.delta, -5)
        XCTAssertEqual(cumplimiento.serie?.referencias?.map(\.code), ["bien", "regular"])
        XCTAssertEqual(cumplimiento.serie?.referencias?.map(\.valor), [90, 70])
        XCTAssertEqual(cumplimiento.reparto?.unidad, .sesiones)
        XCTAssertEqual(cumplimiento.reparto?.total, 68)
        XCTAssertEqual(cumplimiento.reparto?.partes.map(\.code), ["cumplida", "desviada", "fuera", "no_hecha", "hecha_sin_medida", "sin_plan"])
        XCTAssertEqual(try lectura(p, .semanas, "semanas.adherencia").dato?.valor, 89)
    }

    func testElLlenoTraeIntensidadProgresoRecordsCarreraYRecuperacion() throws {
        let p = try AnaliticasFixtures.panel(.lleno)
        let polarizacion = try lectura(p, .intensidad, IdsDelPanel.polarizacion)
        XCTAssertEqual(polarizacion.dato?.valor, 73)
        XCTAssertEqual(polarizacion.veredicto?.etiquetaEs, "Mucha zona media")
        XCTAssertEqual(polarizacion.veredicto?.tono, .atencion)
        XCTAssertEqual(polarizacion.dato?.referencia?.de, "objetivo_coach")

        let esperado: [(String, Double, UnidadLectura)] = [
            ("progreso.correr", 321, .sKm), ("progreso.remo", 99, .s500m), ("progreso.fuerza", 118.1, .kg),
            ("progreso.estaciones", 137, .segundos), ("progreso.wod", 283, .segundos),
        ]
        for (id, valor, unidad) in esperado {
            let l = try lectura(p, .progreso, id)
            XCTAssertEqual(l.dato?.valor, valor, id)
            XCTAssertEqual(l.dato?.unidad, unidad, id)
            XCTAssertEqual(l.veredicto?.etiquetaEs, "Vas a más", id)
        }
        for id in ["progreso.ski", "progreso.bici"] {
            let l = try lectura(p, .progreso, id)
            XCTAssertEqual(l.estado, .sinDato, id)
            XCTAssertEqual(l.cobertura.falta, .ocasion, "\(id): sin ocasión de medirse, no es un fallo")
        }

        XCTAssertEqual(p.bloques.records.count, 7)
        XCTAssertTrue(p.bloques.records.allSatisfy { $0.veredicto?.etiquetaEs == "Nuevo récord" })
        XCTAssertTrue(p.bloques.records.contains { $0.id == "records.test.back_squat_1rm" })

        XCTAssertEqual(try lectura(p, .carrera, IdsDelPanel.carreraObjetivo).dato?.valor, 39)
        XCTAssertEqual(try lectura(p, .carrera, IdsDelPanel.carreraObjetivo).dato?.unidad, .dias)
        XCTAssertEqual(try lectura(p, .carrera, "carrera.disposicion").dato?.valor, 65)
        let prevision = try lectura(p, .carrera, "carrera.prevision")
        XCTAssertEqual(prevision.dato?.valor, 4940)
        XCTAssertEqual(prevision.dato?.unidad, .segundos)
        XCTAssertEqual(prevision.dato?.rango, RangoDeLectura(bajo: 4811, alto: 5069), "el rango viaja con la previsión")
        XCTAssertEqual(prevision.dato?.referencia?.de, "objetivo")
        XCTAssertEqual(AnaliticasDerivados.lecturas(p.bloques.carrera, prefijo: IdsDelPanel.prefijoTramo).count, 10)

        XCTAssertEqual(try lectura(p, .recuperacion, IdsDelPanel.readiness).dato?.valor, 76)
        XCTAssertEqual(try lectura(p, .recuperacion, "recuperacion.variabilidad").dato?.unidad, .ms)
        XCTAssertEqual(try lectura(p, .recuperacion, "recuperacion.pulso_reposo").dato?.valor, 50)
        XCTAssertEqual(try lectura(p, .recuperacion, "recuperacion.sueno").dato?.valor, 7.2)
        XCTAssertEqual(try lectura(p, .recuperacion, "recuperacion.sueno").veredicto?.etiquetaEs, "En tu normal")

        XCTAssertEqual(p.anclas.pulso?.valor, 172)
        XCTAssertEqual(p.anclas.pulso?.ancla, .medida)
        XCTAssertEqual(p.anclas.ritmo["run"]??.valor, 270)
        XCTAssertEqual(p.anclas.ritmo["run"]??.ancla, .declarada)
        XCTAssertNil(p.anclas.ritmo["row"] ?? nil)
        XCTAssertTrue(p.hechos.isEmpty)
    }

    func testElMixtoNoTieneRelojNiCarreraNiZonasMedidas() throws {
        let p = try AnaliticasFixtures.panel(.mixto)
        let readiness = try lectura(p, .estado, "estado.readiness")
        XCTAssertEqual(readiness.estado, .sinDato)
        XCTAssertEqual(readiness.cobertura.falta, .dispositivo)
        XCTAssertTrue(p.bloques.recuperacion.allSatisfy { $0.estado == .sinDato && $0.cobertura.falta == .dispositivo })
        XCTAssertEqual(try lectura(p, .forma, "carga.proyeccion").cobertura.falta, .objetivo)
        XCTAssertEqual(try lectura(p, .carrera, IdsDelPanel.carreraObjetivo).cobertura.falta, .objetivo)
        XCTAssertEqual(p.bloques.carrera.count, 1, "sin carrera solo viaja el objetivo")
        XCTAssertEqual(try lectura(p, .forma, "carga.frescura").procedencia.ancla, .declarada)
        XCTAssertEqual(try XCTUnwrap(try lectura(p, .forma, "carga.subida").dato?.valor), 0.2646, accuracy: 0.001)

        let zonas = p.bloques.intensidad.filter { $0.id != "intensidad.ritmo.correr" }
        XCTAssertTrue(zonas.allSatisfy { $0.estado == .sinDato && $0.cobertura.falta == .sensor }, "sin pulso medido no hay zonas")
        XCTAssertEqual(try lectura(p, .intensidad, "intensidad.ritmo.correr").estado, .medida)

        let historia: [(String, Int, Int)] = [("progreso.correr", 11, 13), ("progreso.remo", 10, 13), ("progreso.fuerza", 10, 13), ("progreso.wod", 10, 13)]
        for (id, llevas, hacen) in historia {
            let l = try lectura(p, .progreso, id)
            XCTAssertEqual(l.estado, .medida, id)
            XCTAssertEqual(l.cobertura.falta, .historia(llevas: llevas, hacen: hacen), id)
        }
        for id in ["progreso.estaciones", "progreso.ski", "progreso.bici"] {
            XCTAssertEqual(try lectura(p, .progreso, id).cobertura.falta, .ocasion, id)
        }
        XCTAssertEqual(p.bloques.records.count, 4)
        XCTAssertEqual(p.historia.semanas, 11)
        XCTAssertTrue(p.historia.cubreTodo)
    }

    func testElPocoLlevaElPlazoEnLasCifrasEnArranqueEnFrio() throws {
        let p = try AnaliticasFixtures.panel(.poco)
        for id in ["carga.fondo", "carga.reciente", "carga.frescura"] {
            let l = try lectura(p, .forma, id)
            XCTAssertEqual(l.estado, .medida, "\(id): el número se queda")
            XCTAssertEqual(l.cobertura.falta, .historia(llevas: 21, hacen: 42), id)
        }
        XCTAssertNil(try lectura(p, .forma, "carga.frescura").veredicto, "la palabra se retira en frío")
        XCTAssertEqual(try lectura(p, .forma, "carga.fondo").procedencia.ancla, .estimada)
        XCTAssertNil(try lectura(p, .forma, "carga.fondo").serie?.plan, "sin carrera no hay proyección")
        XCTAssertEqual(try lectura(p, .estado, "estado.fatiga").tituloEs, "Fatiga")
        XCTAssertEqual(try XCTUnwrap(try lectura(p, .semanas, "semanas.carga").dato?.valor), 395.26, accuracy: 0.01)
        XCTAssertEqual(try lectura(p, .semanas, "semanas.cumplimiento").dato?.valor, 75)
        XCTAssertEqual(try lectura(p, .semanas, "semanas.tramos").cobertura.falta, .ancla)
        XCTAssertEqual(try lectura(p, .intensidad, "intensidad.ritmo.correr").cobertura.falta, .ancla)
        XCTAssertEqual(try lectura(p, .progreso, "progreso.correr").cobertura.falta, .historia(llevas: 2, hacen: 13))
        XCTAssertEqual(p.bloques.records.count, 2)
        XCTAssertEqual(p.historia.semanas, 3)
    }

    func testElVacioSoloTieneFaltasYNingunNumero() throws {
        let p = try AnaliticasFixtures.panel(.vacio)
        XCTAssertNil(p.historia.semanas)
        XCTAssertTrue(p.bloques.todas.allSatisfy { $0.estado == .sinDato }, "ni un número inventado")
        XCTAssertEqual(try lectura(p, .estado, "estado.readiness").cobertura.falta, .dispositivo)
        XCTAssertEqual(try lectura(p, .forma, "carga.proyeccion").cobertura.falta, .objetivo)
        XCTAssertEqual(try lectura(p, .forma, "carga.fondo").cobertura.falta, .historia(llevas: 0, hacen: 42))
        XCTAssertNil(try lectura(p, .forma, "carga.fondo").serie, "sin carga no hay curva")
        XCTAssertEqual(try lectura(p, .semanas, "semanas.carga").cobertura.falta, .historia(llevas: 0, hacen: 84))
        for id in ["semanas.cumplimiento", "semanas.adherencia", "semanas.tramos"] {
            XCTAssertEqual(try lectura(p, .semanas, id).cobertura.falta, .plan, id)
        }
        XCTAssertEqual(try lectura(p, .progreso, "progreso.correr").cobertura.falta, .historia(llevas: 0, hacen: 13))
        XCTAssertTrue(p.bloques.records.isEmpty)
        XCTAssertTrue(p.hechos.isEmpty)
    }

    func testElViejoTraeLaDisposicionAtrasadaLasMarcasPorMedirYUnHecho() throws {
        let p = try AnaliticasFixtures.panel(.viejo)
        XCTAssertEqual(p.hechos.count, 1)
        let hecho = try XCTUnwrap(p.hechos.first)
        XCTAssertEqual(hecho.id, "carga.baja")
        XCTAssertEqual(hecho.fraseEs, "Has bajado un 29 % en dos semanas.")
        XCTAssertNil(hecho.pideEs)
        XCTAssertEqual(hecho.de, ["carga.fondo"])
        XCTAssertEqual(hecho.tono, .nota)

        let disposicion = try lectura(p, .estado, "estado.readiness")
        XCTAssertEqual(disposicion.estado, .medida, "el último número que hubo")
        XCTAssertEqual(disposicion.dato?.valor, 80)
        XCTAssertEqual(disposicion.cobertura.diasConDato, 0)
        XCTAssertEqual(disposicion.cobertura.falta, .dispositivo)
        XCTAssertNil(disposicion.veredicto, "un número atrasado no lleva palabra")
        XCTAssertEqual(AnaliticasDerivados.ultimoDeLaSerie(try lectura(p, .recuperacion, IdsDelPanel.readiness)), "2026-09-10")

        XCTAssertEqual(try lectura(p, .forma, "carga.frescura").veredicto?.etiquetaEs, "Fresco")
        XCTAssertEqual(try lectura(p, .forma, "carga.proyeccion").cobertura.falta, .plan)
        XCTAssertEqual(try lectura(p, .semanas, "semanas.tramos").cobertura.falta, .ancla)
        XCTAssertEqual(try lectura(p, .carrera, "carrera.prevision").cobertura.falta, .marcas(faltan: 8))
        XCTAssertEqual(try lectura(p, .carrera, "carrera.disposicion").cobertura.falta, .historia(llevas: 0, hacen: 7))
        let sinMarca = p.bloques.carrera.filter { $0.id.hasPrefix(IdsDelPanel.prefijoTramo) && $0.cobertura.falta == .marcas(faltan: 1) }
        XCTAssertEqual(sinMarca.count, 8)
        XCTAssertEqual(try lectura(p, .carrera, "carrera.tramo.run").estado, .medida)
        XCTAssertEqual(p.historia.semanas, 26)
    }

    func testUnaCifraAtrasadaDelLleno7dYUnaHistoriaCortaDelLleno1a() throws {
        let p7 = try AnaliticasFixtures.panel(.lleno, .sieteDias)
        let wod = try lectura(p7, .progreso, "progreso.wod")
        XCTAssertEqual(wod.estado, .medida)
        XCTAssertEqual(wod.cobertura.falta, .viejo(ultimo: "2026-09-18"), "la última marca de la ventana anterior")
        XCTAssertEqual(wod.cobertura.diasConDato, 0)
        XCTAssertEqual(try lectura(p7, .progreso, "progreso.correr").cobertura.falta, .ocasion)
        XCTAssertNil(try lectura(p7, .progreso, "progreso.remo").cobertura.falta)

        let p1a = try AnaliticasFixtures.panel(.lleno, .unAno)
        for (id, llevas, hacen) in [("progreso.correr", 51, 53), ("progreso.remo", 50, 53), ("progreso.fuerza", 50, 53), ("progreso.estaciones", 48, 53), ("progreso.wod", 49, 53)] {
            XCTAssertEqual(try lectura(p1a, .progreso, id).cobertura.falta, .historia(llevas: llevas, hacen: hacen), id)
        }
        let todo = try AnaliticasFixtures.panel(.lleno, .todo)
        XCTAssertEqual(todo.historia.semanas, 51)
        XCTAssertNil(todo.ventana.anterior)
    }

    // MARK: - Lo que NO puede tumbar la pantalla

    private static let panelMinimo = """
    {"athlete_id":"1","generado_iso":"2026-09-29T10:00:00.000Z",
     "ventana":{"clave":"12s","desde":"2026-07-08","hasta":"2026-09-29","dias":84,"anterior":{"desde":"2026-04-15","hasta":"2026-07-07","dias":84},"cubre_todo":false},
     "historia":{"semanas":3,"desde":"2026-09-08","cubre_todo":true},
     "metodo":{"ctl_days":42,"atl_days":7},
     "anclas":{"pulso":null,"ritmo":{"run":null,"row":null,"ski":null,"bike":null},"potencia":{"row":null,"ski":null,"bike":null}},
     "bloques":{"estado":[],"forma":[],"semanas":[]},
     "pendientes":["intensidad","hidratacion"],
     "hechos":[]}
    """

    func testUnPanelMinimoConMetodoCortoBloquesAusentesYUnBloqueDesconocido() throws {
        let p = try decodifica(Self.panelMinimo)
        XCTAssertNil(p.metodo.rampAlertTssPerWeek, "un campo del método que no viaja es nulo, no un fallo")
        XCTAssertNil(p.metodo.hrvMinNightsBaseline)
        XCTAssertEqual(p.bloques.recuperacion, [], "un bloque ausente es una lista vacía")
        XCTAssertEqual(p.pendientes, [.intensidad, .desconocido], "un bloque nuevo no tumba la lista")
        XCTAssertTrue(p.estaPendiente(.intensidad))
        XCTAssertNil(p.anclas.pulso)
        XCTAssertEqual(p.anclas.ritmo.count, 4)
        XCTAssertNil(p.anclas.ritmo["run"] ?? nil)
    }

    func testUnaVentanaDesconocidaNoLanza() throws {
        let json = Self.panelMinimo.replacingOccurrences(of: "\"clave\":\"12s\"", with: "\"clave\":\"2a\"")
        XCTAssertEqual(try decodifica(json).ventana.clave, .desconocida)
    }

    func testUnHechoRotoSePierdeSoloYUnTonoNuevoNoLanza() throws {
        let hechos = #"[{"id":"a","frase_es":"Uno.","pide_es":null,"de":["carga.fondo"],"tono":"nota"},{"id":"b"},{"id":"c","frase_es":"Tres.","pide_es":"Dilo.","de":[],"tono":"urgente"}]"#
        let json = Self.panelMinimo.replacingOccurrences(of: "\"hechos\":[]", with: "\"hechos\":\(hechos)")
        let p = try decodifica(json)
        XCTAssertEqual(p.hechos.map(\.id), ["a", "c"], "el hecho sin campos se pierde solo")
        XCTAssertEqual(p.hechos.last?.tono, .desconocido)
        XCTAssertEqual(p.hechos.last?.pideEs, "Dilo.")
    }

    func testFamiliaAnclaYTonoDesconocidosDecodificanASuCaso() throws {
        let l = try AnaliticasFixtures.lectura(familia: "\"natacion\"", ancla: "\"adivinada\"", veredicto: #"{"code":"x","etiqueta_es":"X","frase_es":null,"tono":"rojo"}"#)
        XCTAssertEqual(l.familia, .desconocida)
        XCTAssertEqual(l.procedencia.ancla, .desconocida)
        XCTAssertEqual(l.veredicto?.tono, .desconocido)
    }

    func testUnaLecturaSinLosCamposDelContratoNuevoSigueDecodificando() throws {
        // La forma exacta del contrato de agosto (`/analytics/lecturas`): sin familia,
        // comparación, veredicto, plan, referencias ni ancla.
        let agosto = """
        {"id":"carga.fondo","grupo":"carga","titulo_es":"Fondo","estado":"medida",
         "dato":{"valor":62.4,"unidad":"tss","referencia":null},
         "serie":{"unidad":"tss","paso":"dia","puntos":[{"t":"2026-08-01","v":60},{"t":"2026-08-02","v":62.4}]},
         "reparto":null,
         "cobertura":{"muestras":40,"dias_ventana":84,"dias_con_dato":40,"pct":47.6,"falta":null},
         "procedencia":{"de":"banister_ctl","explica_es":"e","medida":true,"proveedor":null}}
        """
        let l = try decodificaLectura(agosto)
        XCTAssertNil(l.familia)
        XCTAssertNil(l.comparacion)
        XCTAssertNil(l.veredicto)
        XCTAssertNil(l.serie?.plan)
        XCTAssertNil(l.procedencia.ancla)
        XCTAssertNil(l.dato?.rango)
        XCTAssertEqual(l.forma, .cifraYSerie)
    }

    func testTodasLasUnidadesDelContratoDecodificanYUnaNuevaNoLanza() throws {
        let contrato: [(String, UnidadLectura)] = [
            ("tss", .tss), ("tss_semana", .tssSemana), ("ratio", .ratio), ("ms", .ms), ("bpm", .bpm), ("horas", .horas), ("pct", .pct),
            ("metros", .metros), ("m_s", .mS), ("s_km", .sKm), ("s_500m", .s500m), ("segundos", .segundos), ("kcal", .kcal), ("kg", .kg),
            ("puntos", .puntos), ("ml_kg_min", .mlKgMin), ("sesiones", .sesiones), ("watts", .watts), ("reps", .reps), ("dias", .dias),
            ("pp", .pp), ("rpe", .rpe), ("rir", .rir), ("tramos", .tramos), ("s_1000m", .s1000m), ("spm", .spm), ("rpm", .rpm),
            ("series", .series), ("cm", .cm), ("rondas", .rondas), ("furlongs", .desconocida),
        ]
        for (u, esperada) in contrato {
            let l = try AnaliticasFixtures.lectura(unidad: u)
            XCTAssertEqual(l.dato?.unidad, esperada, u)
            XCTAssertEqual(l.serie?.unidad, esperada, u)
        }
    }

    func testElRangoDeUnaCifraViajaYSeVuelveAlDecodificar() throws {
        let dato = #"{"valor":4940,"unidad":"segundos","referencia":null,"rango":{"bajo":4811,"alto":5069}}"#
        let json = AnaliticasFixtures.lecturaJSON(unidad: "segundos").replacingOccurrences(of: #""dato":{"valor":1,"unidad":"segundos","referencia":null}"#, with: "\"dato\":\(dato)")
        let l = try decodificaLectura(json)
        XCTAssertEqual(l.dato?.rango, RangoDeLectura(bajo: 4811, alto: 5069))
        XCTAssertEqual(try APIClient.makeJSONDecoder().decode(LecturaAnalitica.self, from: JSONEncoder().encode(l)).dato?.rango, l.dato?.rango, "el rango vuelve del disco")
    }

    func testTodasLasFaltasDelContratoDecodifican() throws {
        let dec = APIClient.makeJSONDecoder()
        func falta(_ json: String) throws -> Falta { try dec.decode(Falta.self, from: Data(json.utf8)) }
        XCTAssertEqual(try falta(#"{"por":"historia","llevas":21,"hacen":42}"#), .historia(llevas: 21, hacen: 42))
        XCTAssertEqual(try falta(#"{"por":"ancla"}"#), .ancla)
        XCTAssertEqual(try falta(#"{"por":"sensor"}"#), .sensor)
        XCTAssertEqual(try falta(#"{"por":"dispositivo"}"#), .dispositivo)
        XCTAssertEqual(try falta(#"{"por":"ocasion"}"#), .ocasion)
        XCTAssertEqual(try falta(#"{"por":"intencion"}"#), .intencion)
        XCTAssertEqual(try falta(#"{"por":"objetivo"}"#), .objetivo)
        XCTAssertEqual(try falta(#"{"por":"esfuerzo","sesiones":3}"#), .esfuerzo(sesiones: 3))
        XCTAssertEqual(try falta(#"{"por":"plan"}"#), .plan)
        XCTAssertEqual(try falta(#"{"por":"viejo","ultimo":"2026-09-18"}"#), .viejo(ultimo: "2026-09-18"))
        XCTAssertEqual(try falta(#"{"por":"marcas","faltan":8}"#), .marcas(faltan: 8))
        XCTAssertEqual(try falta(#"{"por":"pareja"}"#), .pareja)
    }

    func testUnaFaltaIncompletaONuevaNoTumbaLaLectura() throws {
        let dec = APIClient.makeJSONDecoder()
        func falta(_ json: String) throws -> Falta { try dec.decode(Falta.self, from: Data(json.utf8)) }
        XCTAssertEqual(try falta(#"{"por":"viejo"}"#), .desconocida, "un «viejo» sin fecha no se puede pintar: cae a desconocida")
        XCTAssertEqual(try falta(#"{"por":"marcas"}"#), .marcas(faltan: 0))
        XCTAssertEqual(try falta(#"{"por":"esfuerzo"}"#), .esfuerzo(sesiones: 0))
        XCTAssertEqual(try falta(#"{"por":"telepatia","x":1}"#), .desconocida)
        let l = try AnaliticasFixtures.lectura(estado: "sin_dato", falta: #"{"por":"telepatia"}"#)
        XCTAssertEqual(l.cobertura.falta, .desconocida)
    }

    func testUnaLecturaRotaDentroDeUnBloqueSePierdeSolaYNoTumbaElPanel() throws {
        let rota = #"{"id":"rota","grupo":"forma"}"#
        let json = Self.panelMinimo.replacingOccurrences(of: "\"forma\":[]", with: "\"forma\":[\(AnaliticasFixtures.lecturaJSON()),\(rota)]")
        let p = try decodifica(json)
        XCTAssertEqual(p.bloques.forma.map(\.id), ["x"])
    }

    func testElPanelPersisteYVuelveConElCodificadorPlano() throws {
        // La porción va a disco con un JSONEncoder/JSONDecoder sin estrategias
        // (AppDataPersistence): el sobre tiene que ir y volver entero.
        for atleta in [AnaliticasFixtures.Atleta.mixto, .viejo] {
            let p = try AnaliticasFixtures.panel(atleta)
            let datos = try JSONEncoder().encode(p)
            let vuelto = try JSONDecoder().decode(PanelAnaliticas.self, from: datos)
            XCTAssertEqual(vuelto, p, atleta.rawValue)
        }
    }
}
