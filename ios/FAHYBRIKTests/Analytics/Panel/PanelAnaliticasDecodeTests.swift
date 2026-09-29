import XCTest
@testable import FAHYBRIK

// EL SOBRE DEL PANEL, PROBADO POR DONDE SE ROMPE: el JSON real del motor
// decodifica campo a campo (una clave mal leída tira el panel entero), y un
// valor nuevo del servidor —bloque, ventana, unidad, familia, ancla, falta— no
// tumba la pantalla: decodifica a su caso desconocido o se pierde solo.
final class PanelAnaliticasDecodeTests: XCTestCase {

    private func decodifica(_ json: String) throws -> PanelAnaliticas {
        try APIClient.makeJSONDecoder().decode(PanelAnaliticas.self, from: Data(json.utf8))
    }

    private func decodificaLectura(_ json: String) throws -> LecturaAnalitica {
        try APIClient.makeJSONDecoder().decode(LecturaAnalitica.self, from: Data(json.utf8))
    }

    // MARK: - Los paneles del motor real

    func testLosCincoAtletasDecodificanEnteros() throws {
        for atleta in AnaliticasFixtures.Atleta.allCases {
            let p = try AnaliticasFixtures.panel(atleta)
            XCTAssertEqual(p.ventana.clave, .doceSemanas, atleta.rawValue)
            XCTAssertEqual(p.ventana.dias, 84, atleta.rawValue)
            XCTAssertEqual(p.hoy, "2026-09-29", atleta.rawValue)
            XCTAssertEqual(p.pendientes, [.intensidad, .progreso, .records, .carrera, .recuperacion], atleta.rawValue)
            XCTAssertEqual(p.bloques.forma.count, 6, "\(atleta.rawValue): las seis lecturas de forma")
            XCTAssertEqual(p.bloques.estado.count, 4, "\(atleta.rawValue): readiness + las tres copias")
            XCTAssertEqual(p.metodo.ctlDays, 42)
            XCTAssertEqual(p.metodo.atlDays, 7)
            XCTAssertEqual(p.metodo.rampAlertTssPerWeek, 5)
            XCTAssertEqual(p.metodo.coberturaVeredictoMinPct, 90)
        }
    }

    func testLasSeisVentanasDelLlenoDecodifican() throws {
        for v in VentanaClave.todas {
            let p = try AnaliticasFixtures.panel(.lleno, v)
            XCTAssertEqual(p.ventana.clave, v)
            XCTAssertEqual(p.ventana.hasta, "2026-09-29")
            if v == .todo {
                XCTAssertNil(p.ventana.anterior, "«todo» no tiene un antes")
                XCTAssertTrue(p.ventana.cubreTodo)
            } else {
                XCTAssertNotNil(p.ventana.anterior)
                XCTAssertEqual(p.ventana.anterior?.dias, p.ventana.dias)
            }
        }
    }

    func testElLlenoTraeLaFormaConProyeccionYLasFamilias() throws {
        let p = try AnaliticasFixtures.panel(.lleno)
        let forma = try XCTUnwrap(AnaliticasDerivados.lectura(p.bloques.forma, "carga.fondo"))
        XCTAssertEqual(forma.grupo, .forma)
        XCTAssertEqual(forma.estado, .medida)
        XCTAssertEqual(forma.dato?.unidad, .tss)
        XCTAssertEqual(forma.serie?.paso, .dia)
        XCTAssertEqual(forma.serie?.puntos.count, 84, "los 84 días de la ventana")
        XCTAssertEqual(forma.serie?.plan?.count, 39, "la proyección hasta la carrera, en la misma serie")
        XCTAssertEqual(forma.procedencia.ancla, .medida)
        XCTAssertNotNil(forma.comparacion, "toda cifra contra algo (A3)")
        XCTAssertEqual(forma.comparacion?.unidad, .tss)
        XCTAssertEqual(forma.cobertura.ultimoDato, "2026-09-29", "el campo propuesto se lee cuando viaja")

        let frescura = try XCTUnwrap(AnaliticasDerivados.lectura(p.bloques.forma, "carga.frescura"))
        XCTAssertEqual(frescura.veredicto?.etiquetaEs, "Manteniendo")
        XCTAssertEqual(frescura.veredicto?.tono, .neutro)
        XCTAssertEqual(frescura.serie?.referencias?.map(\.valor), [-30, -11, 4, 29], "las cuatro bandas del coach, en unidades reales")
        XCTAssertEqual(frescura.dato?.referencia?.de, "equilibrio")

        let familias = AnaliticasDerivados.lecturas(p.bloques.semanas, prefijo: "semanas.carga.").compactMap(\.familia)
        XCTAssertEqual(Set(familias), [.correr, .remo, .ski, .fuerza, .estaciones, .wod])
        let carga = try XCTUnwrap(AnaliticasDerivados.lectura(p.bloques.semanas, "semanas.carga"))
        XCTAssertEqual(carga.serie?.paso, .semana)
        XCTAssertEqual(carga.comparacion?.unidad, .pct, "el delta de carga se juzga en % (el umbral del coach)")
        XCTAssertEqual(carga.reparto?.esProporcional, true)

        let disposicion = try XCTUnwrap(AnaliticasDerivados.lectura(p.bloques.estado, "estado.readiness"))
        XCTAssertEqual(disposicion.tituloEs, "Disposición")
        XCTAssertEqual(disposicion.dato?.valor, 63)
        XCTAssertEqual(disposicion.dato?.referencia?.de, "hace_7d")
    }

    func testElMixtoDiceCuantoVaEstimadoYElVacioSoloFaltas() throws {
        let mixto = try AnaliticasFixtures.panel(.mixto)
        let frescura = try XCTUnwrap(AnaliticasDerivados.lectura(mixto.bloques.forma, "carga.frescura"))
        XCTAssertEqual(frescura.procedencia.ancla, .estimada, "la ancla más débil manda")
        XCTAssertTrue(frescura.veredicto?.fraseEs?.contains("umbral estimado") == true)
        let readiness = try XCTUnwrap(AnaliticasDerivados.lectura(mixto.bloques.estado, "estado.readiness"))
        XCTAssertEqual(readiness.estado, .sinDato)
        XCTAssertEqual(readiness.cobertura.falta, .dispositivo)

        let vacio = try AnaliticasFixtures.panel(.vacio)
        XCTAssertNil(vacio.historia.semanas)
        XCTAssertTrue(vacio.bloques.forma.allSatisfy { $0.estado == .sinDato })
        XCTAssertEqual(AnaliticasDerivados.lectura(vacio.bloques.forma, "carga.proyeccion")?.cobertura.falta, .objetivo)
        XCTAssertEqual(AnaliticasDerivados.lectura(vacio.bloques.forma, "carga.fondo")?.cobertura.falta, .historia(llevas: 0, hacen: 42))
        XCTAssertTrue(vacio.hechos.isEmpty)
    }

    func testElPocoLlevaElPlazoYElViejoElUltimoDato() throws {
        let poco = try AnaliticasFixtures.panel(.poco)
        let forma = try XCTUnwrap(AnaliticasDerivados.lectura(poco.bloques.forma, "carga.fondo"))
        XCTAssertEqual(forma.estado, .medida, "el número se queda")
        XCTAssertNil(AnaliticasDerivados.lectura(poco.bloques.forma, "carga.frescura")?.veredicto, "la palabra se retira en frío")
        XCTAssertEqual(forma.cobertura.falta, .historia(llevas: 21, hacen: 42))

        let viejo = try AnaliticasFixtures.panel(.viejo)
        XCTAssertEqual(AnaliticasDerivados.lectura(viejo.bloques.forma, "carga.fondo")?.cobertura.ultimoDato, "2026-09-04")
        XCTAssertEqual(viejo.metodo.datoViejoDias, 14, "el campo propuesto del método se lee cuando viaja")
        XCTAssertEqual(viejo.hechos.count, 1)
        XCTAssertEqual(viejo.hechos.first?.id, "carga.baja")
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
        XCTAssertNil(p.metodo.datoViejoDias)
        XCTAssertEqual(p.bloques.recuperacion, [], "un bloque ausente es una lista vacía")
        XCTAssertEqual(p.pendientes, [.intensidad, .desconocido], "un bloque nuevo no tumba la lista")
        XCTAssertNil(p.anclas.pulso)
        XCTAssertEqual(p.anclas.ritmo.count, 4)
        XCTAssertNil(p.anclas.ritmo["run"] ?? nil)
    }

    func testUnaVentanaDesconocidaNoLanza() throws {
        let json = Self.panelMinimo.replacingOccurrences(of: "\"clave\":\"12s\"", with: "\"clave\":\"2a\"")
        XCTAssertEqual(try decodifica(json).ventana.clave, .desconocida)
    }

    private static func lectura(familia: String = "\"correr\"", ancla: String = "\"medida\"", unidad: String = "tss", veredicto: String = "null", extra: String = "") -> String {
        """
        {"id":"x","grupo":"forma","familia":\(familia),"titulo_es":"X","estado":"medida",
         "dato":{"valor":1,"unidad":"\(unidad)","referencia":null},"comparacion":null,
         "serie":{"unidad":"\(unidad)","paso":"dia","puntos":[{"t":"2026-09-28","v":1},{"t":"2026-09-29","v":null}],"plan":null,"referencias":null},
         "reparto":null,"veredicto":\(veredicto),
         "cobertura":{"muestras":1,"dias_ventana":1,"dias_con_dato":1,"pct":100,"falta":null},
         "procedencia":{"de":"m","explica_es":"e","medida":true,"ancla":\(ancla),"proveedor":null}\(extra)}
        """
    }

    func testFamiliaAnclaYTonoDesconocidosDecodificanASuCaso() throws {
        let l = try decodificaLectura(Self.lectura(familia: "\"natacion\"", ancla: "\"adivinada\"", veredicto: #"{"code":"x","etiqueta_es":"X","frase_es":null,"tono":"rojo"}"#))
        XCTAssertEqual(l.familia, .desconocida)
        XCTAssertEqual(l.procedencia.ancla, .desconocida)
        XCTAssertEqual(l.veredicto?.tono, .desconocido)
        XCTAssertNil(l.cobertura.ultimoDato, "el campo propuesto puede no viajar")
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
        XCTAssertEqual(l.forma, .cifraYSerie)
    }

    func testLasUnidadesNuevasYLasFaltasNuevas() throws {
        for (u, esperada) in [("watts", UnidadLectura.watts), ("reps", .reps), ("dias", .dias), ("furlongs", .desconocida)] {
            XCTAssertEqual(try decodificaLectura(Self.lectura(unidad: u)).dato?.unidad, esperada, u)
        }
        let dec = APIClient.makeJSONDecoder()
        XCTAssertEqual(try dec.decode(Falta.self, from: Data(#"{"por":"objetivo"}"#.utf8)), .objetivo)
        XCTAssertEqual(try dec.decode(Falta.self, from: Data(#"{"por":"esfuerzo","sesiones":3}"#.utf8)), .esfuerzo(sesiones: 3))
        XCTAssertEqual(try dec.decode(Falta.self, from: Data(#"{"por":"plan"}"#.utf8)), .plan)
        XCTAssertFalse(ProgresoDeCarrera.seCalla(.objetivo))
        XCTAssertFalse(ProgresoDeCarrera.seCalla(.plan))
        XCTAssertEqual(ProgresoDeCarrera.salidaDe(.objetivo), "Elegir tu carrera objetivo")
        XCTAssertEqual(ProgresoDeCarrera.salidaDe(.esfuerzo(sesiones: 2)), "Puntuar el esfuerzo al terminar")
        XCTAssertNil(ProgresoDeCarrera.salidaDe(.plan), "un plan que no existe no lo escribe el atleta")
        XCTAssertEqual(AnaliticasEstados.salida(de: .dispositivo), .accion("Conectar tu reloj", .dispositivos), "aquí conectar el reloj sí tiene botón")
    }

    func testUnaLecturaRotaDentroDeUnBloqueSePierdeSolaYNoTumbaElPanel() throws {
        let rota = #"{"id":"rota","grupo":"forma"}"#
        let json = Self.panelMinimo.replacingOccurrences(of: "\"forma\":[]", with: "\"forma\":[\(Self.lectura()),\(rota)]")
        let p = try decodifica(json)
        XCTAssertEqual(p.bloques.forma.map(\.id), ["x"])
    }

    func testElPanelPersisteYVuelveConElCodificadorPlano() throws {
        // La porción va a disco con un JSONEncoder/JSONDecoder sin estrategias
        // (AppDataPersistence): el sobre tiene que ir y volver entero.
        let p = try AnaliticasFixtures.panel(.mixto)
        let datos = try JSONEncoder().encode(p)
        let vuelto = try JSONDecoder().decode(PanelAnaliticas.self, from: datos)
        XCTAssertEqual(vuelto, p)
    }
}
