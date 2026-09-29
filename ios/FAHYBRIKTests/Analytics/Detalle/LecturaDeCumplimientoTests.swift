import XCTest
@testable import FAHYBRIK

// EL CUMPLIMIENTO, LEÍDO: la puerta a los días, lo que te piden y el sello de cada tramo. Los veredictos son del servidor (las bandas y la
// holgura del coach); el cliente cuenta lo que ya viene juzgado y traduce «más» y «menos» sin cambiar su dirección (más = MÁS INTENSO).
// Traducción de `cumplimientoDe` y `CUMPLIMIENTO_PALABRA` del doble.
final class LecturaDeCumplimientoTests: XCTestCase {

    private func cumplimiento() throws -> CumplimientoAnaliticas { try DetalleFixtures.cumplimiento() }

    // MARK: - La marca

    func testUnVeredictoDeTramoSeTraduceSinCambiarDeDireccion() {
        XCTAssertEqual(MarcaDeCumplimiento(.dentro), .dentro)
        XCTAssertEqual(MarcaDeCumplimiento(.porEncima), .masDeLoPedido, "por encima = MÁS intenso, no «mejor»")
        XCTAssertEqual(MarcaDeCumplimiento(.porDebajo), .menosDeLoPedido)
        XCTAssertEqual(MarcaDeCumplimiento(.sinDato), .sinComprobar)
        XCTAssertEqual(MarcaDeCumplimiento(.desconocido), .sinComprobar)
    }

    func testCadaMarcaDiceSuPalabra() {
        XCTAssertEqual(MarcaDeCumplimiento.dentro.palabra, "dentro")
        XCTAssertEqual(MarcaDeCumplimiento.masDeLoPedido.palabra, "más de lo pedido")
        XCTAssertEqual(MarcaDeCumplimiento.menosDeLoPedido.palabra, "menos de lo pedido")
        XCTAssertEqual(MarcaDeCumplimiento.noHecha.palabra, "no hecha")
        XCTAssertEqual(MarcaDeCumplimiento.sinPlan.palabra, "sin plan")
        XCTAssertEqual(MarcaDeCumplimiento.sinComprobar.palabra, "sin comprobar")
    }

    // MARK: - La puerta a los días

    func testElCumplimientoDecodificaConSusSesionesLineasYTramos() throws {
        let c = try cumplimiento()
        XCTAssertEqual(c.sesiones.count, 6)
        XCTAssertEqual(c.hoy, "2026-09-29")
        XCTAssertEqual(c.sinPlan.sesiones, 1)
        let cinta = try XCTUnwrap(c.sesiones.first { $0.assignmentId == "7001" })
        XCTAssertEqual(cinta.executionId, "9001")
        XCTAssertEqual(cinta.lineas.flatMap(\.tramos).count, 8)
        XCTAssertEqual(cinta.tramos.detalle, "tramos")
    }

    func testCadaSesionDelPlanSaleConSuMarcaSuPalabraYContraQueSeJuzgo() throws {
        let filas = PuertaDeSesiones.filas(try cumplimiento())
        XCTAssertEqual(filas.map(\.id), ["7101", "7100", "7001", "7002", "7003", "7004"], "el orden del servidor: la más reciente primero")

        let hoy = try XCTUnwrap(filas.first { $0.id == "7101" })
        XCTAssertEqual(hoy.marca, .sinPlan)
        XCTAssertEqual(hoy.palabra, "para hoy")
        XCTAssertFalse(hoy.seAbre, "sin ejecución no hay detalle que abrir")

        let noHecha = try XCTUnwrap(filas.first { $0.id == "7100" })
        XCTAssertEqual(noHecha.marca, .noHecha)
        XCTAssertEqual(noHecha.palabra, "no hecha")

        let cinta = try XCTUnwrap(filas.first { $0.id == "7001" })
        XCTAssertEqual(cinta.marca, .dentro, "cumplida")
        XCTAssertEqual(cinta.detalle, "1 de 5 tramos dentro")
        XCTAssertEqual(cinta.hecho, "6,4 km")
        XCTAssertEqual(cinta.plan, "4 km")
        XCTAssertEqual(cinta.executionId, "9001")
        XCTAssertTrue(cinta.seAbre)
        XCTAssertEqual(cinta.familia, .correr)

        let remo = try XCTUnwrap(filas.first { $0.id == "7002" })
        XCTAssertEqual(remo.marca, .masDeLoPedido, "fuera de la banda y por ENCIMA del plan (230 %)")
        XCTAssertEqual(remo.detalle, "4 de 5 tramos dentro")
        XCTAssertEqual(remo.hecho, "36", "la base es la carga: sin unidad, la cifra sola")
        XCTAssertEqual(remo.plan, "16")

        let sin = try XCTUnwrap(filas.first { $0.id == "7003" })
        XCTAssertEqual(sin.marca, .sinPlan, "hecha sin medida: no tiene color")
        XCTAssertEqual(sin.palabra, "hecha, sin medir")
        XCTAssertNil(sin.hecho)
        XCTAssertTrue(sin.seAbre, "hecha sí se abre")
    }

    func testUnaSesionDesviadaOFueraDependeDelSentidoDelPorcentaje() throws {
        func fila(_ estado: String, pct: Double) throws -> FilaDeSesion {
            let json = """
            {"ventana":{"clave":"12s","desde":"2026-07-08","hasta":"2026-09-29","dias":84,"anterior":null,"cubre_todo":true},"sin_plan":{"sesiones":0,"segundos":0,"tss":null},
             "sesiones":[{"assignment_id":"1","execution_id":"2","dia":"2026-09-20","dia_hecha":"2026-09-20","titulo":"F","estado":"\(estado)","color":"ambar","hecha":true,"saltada":false,
               "base":"duracion","unidad":"segundos","plan":3600,"hecho":\(3600 * pct / 100),"pct":\(pct),"plan_minimo":false,
               "tramos":{"detalle":"sin_detalle","total":0,"evaluables":0,"dentro":0,"por_encima":0,"por_debajo":0,"sin_dato":0,"sin_ejecutar":0},"lineas":[]}]}
            """
            return try XCTUnwrap(APIClient.makeJSONDecoder().decode(CumplimientoAnaliticas.self, from: Data(json.utf8)).sesiones.first)
        }
        XCTAssertEqual(PuertaDeSesiones.marcaDe(try fila("desviada", pct: 60)), .menosDeLoPedido)
        XCTAssertEqual(PuertaDeSesiones.marcaDe(try fila("desviada", pct: 140)), .masDeLoPedido)
        XCTAssertEqual(PuertaDeSesiones.marcaDe(try fila("fuera", pct: 30)), .menosDeLoPedido)
        XCTAssertEqual(PuertaDeSesiones.marcaDe(try fila("fuera", pct: 180)), .masDeLoPedido)
        // Sin detalle por tramos, la fila dice el porcentaje de su base y la cifra en su unidad.
        let f = PuertaDeSesiones.fila(try fila("desviada", pct: 60))
        XCTAssertEqual(f.detalle, "60 % del tiempo")
        XCTAssertEqual(f.hecho, "36 min")
        XCTAssertEqual(f.plan, "1 h")
    }

    // MARK: - Lo que te piden

    func testLasSeriesDeCorrerSeCuentanPorSuVeredictoDeRitmo() throws {
        guard case .series(let p) = LoQueTePiden.correr(try cumplimiento()) else { return XCTFail() }
        // El calentamiento y las cuatro series de trabajo, cada una con su comprobación de ritmo: una dentro, una por debajo y tres por encima.
        XCTAssertEqual(p.dentro, 1)
        XCTAssertEqual(p.menos, 1)
        XCTAssertEqual(p.mas, 3)
        XCTAssertEqual(p.series, 5)
        XCTAssertEqual(p.sesiones, 1, "las recuperaciones no cuentan como series, y el remo es otra familia")
    }

    func testElRirSeCuentaSerieASerie() throws {
        guard case .series(let p) = LoQueTePiden.rir(try cumplimiento()) else { return XCTFail() }
        XCTAssertEqual(p.dentro, 5)
        XCTAssertEqual(p.menos + p.mas, 0)
        XCTAssertEqual(p.sesiones, 2, "la sentadilla y el peso muerto")
    }

    func testSinCumplimientoLaSeccionNoSeAnuncia() {
        XCTAssertEqual(LoQueTePiden.correr(nil), .sinCargar)
        XCTAssertEqual(LoQueTePiden.rir(nil), .sinCargar)
    }

    func testConElCumplimientoYSinSeriesConObjetivoSeDice() throws {
        // Solo el remo: el cumplimiento llegó y no hay ni ritmo de correr ni RIR de fuerza pedidos.
        let c = try cumplimiento()
        let solo = CumplimientoAnaliticas(ventana: c.ventana, sesiones: c.sesiones.filter { $0.assignmentId == "7002" }, sinPlan: c.sinPlan)
        XCTAssertEqual(LoQueTePiden.correr(solo), .sinSeries)
        XCTAssertEqual(LoQueTePiden.rir(solo), .sinSeries)
    }

    func testUnaSerieDeAproximacionNoCuentaComoTrabajo() throws {
        let json = #"""
        {"ventana":{"clave":"12s","desde":"2026-07-08","hasta":"2026-09-29","dias":84,"anterior":null,"cubre_todo":true},
         "sin_plan":{"sesiones":0,"segundos":0,"tss":null},
         "sesiones":[{"assignment_id":"1","execution_id":"2","dia":"2026-09-20","dia_hecha":"2026-09-20","titulo":"F","estado":"cumplida","color":"verde","hecha":true,"saltada":false,
           "base":"carga","unidad":"tss","plan":50,"hecho":50,"pct":100,"plan_minimo":false,
           "tramos":{"detalle":"tramos","total":1,"evaluables":1,"dentro":1,"por_encima":0,"por_debajo":0,"sin_dato":0,"sin_ejecutar":0},
           "lineas":[{"familia":"fuerza","tramos":[{"segment_execution_id":"9","papel":"trabajo","veredicto":"dentro","comprobaciones":[],
             "series":[{"aproximacion":true,"veredicto":"por_debajo","comprobaciones":[{"eje":"rir","pregunta":"intensidad","veredicto":"por_debajo"}]},
                       {"aproximacion":false,"veredicto":"dentro","comprobaciones":[{"eje":"rir","pregunta":"intensidad","veredicto":"dentro"}]}]}]}]}]}
        """#
        let c = try APIClient.makeJSONDecoder().decode(CumplimientoAnaliticas.self, from: Data(json.utf8))
        guard case .series(let p) = LoQueTePiden.rir(c) else { return XCTFail() }
        XCTAssertEqual(p.series, 1, "la de aproximación se enseña y no cuenta")
        XCTAssertEqual(p.dentro, 1)
    }

    // MARK: - El sello de cada tramo

    func testElSelloDeUnTramoSaleDelCumplimientoPorSuId() throws {
        let c = try cumplimiento()
        let v = VeredictosDeSesion(c.sesiones.first { $0.assignmentId == "7001" })
        XCTAssertFalse(v.estaVacio)
        let sesion = try DetalleFixtures.sesion(.cinta)
        let marcas = sesion.tramos.map { v.marca(de: $0.id, tienePlan: true) }
        XCTAssertEqual(marcas, [.menosDeLoPedido, .masDeLoPedido, .dentro, .masDeLoPedido, .dentro, .dentro, .dentro, .masDeLoPedido])
    }

    func testSinPlanNoHaySelloYSinElCumplimientoElTramoDiceQueNoSeHaComprobado() throws {
        let v = VeredictosDeSesion(nil)
        XCTAssertTrue(v.estaVacio)
        XCTAssertEqual(v.marca(de: "T3", tienePlan: true), .sinComprobar, "hay plan pero aún no llegó el veredicto")
        XCTAssertEqual(v.marca(de: "T3", tienePlan: false), .sinPlan)
    }

    func testUnEstadoOUnVeredictoNuevosNoTumbanLaLista() throws {
        let json = #"""
        {"ventana":{"clave":"12s","desde":"2026-07-08","hasta":"2026-09-29","dias":84,"anterior":null,"cubre_todo":true},
         "sin_plan":{"sesiones":0,"segundos":0,"tss":null},
         "sesiones":[{"assignment_id":"1","execution_id":null,"dia":"2026-09-20","dia_hecha":null,"titulo":"Nueva","estado":"aplazada","color":"morado","hecha":false,"saltada":false,
           "base":"kilometros","unidad":"tss","plan":null,"hecho":null,"pct":null,"plan_minimo":false,
           "tramos":{"detalle":"tramos","total":0,"evaluables":0,"dentro":0,"por_encima":0,"por_debajo":0,"sin_dato":0,"sin_ejecutar":0},"lineas":[]},
          {"roto":true}]}
        """#
        let c = try APIClient.makeJSONDecoder().decode(CumplimientoAnaliticas.self, from: Data(json.utf8))
        XCTAssertEqual(c.sesiones.count, 1, "la fila rota se pierde sola")
        XCTAssertEqual(c.sesiones[0].estado, .desconocido)
        XCTAssertEqual(c.sesiones[0].color, .desconocido)
        XCTAssertEqual(c.sesiones[0].base, .desconocida)
        let fila = PuertaDeSesiones.fila(c.sesiones[0])
        XCTAssertEqual(fila.marca, .sinPlan)
        XCTAssertNil(fila.detalle, "una base que este binario no conoce no se dice")
    }
}
