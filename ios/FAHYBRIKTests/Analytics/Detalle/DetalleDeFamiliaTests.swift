import XCTest
@testable import FAHYBRIK

// LO COMÚN DE LOS DETALLES: los treinta sobres del motor decodifican, la fila que abre cada detalle es su primera lectura, el estado
// de una familia se deriva de esa fila (vacío · poco · lleno · viejo) y el sujeto es la marca clave con su delta y su ancla — o el vacío,
// con su salida. Traducción a XCTest de `kit-analiticas/sujeto.ts` y de los estados de `mecanismo.ts#estadoDeBloque`.
final class DetalleDeFamiliaTests: XCTestCase {

    // MARK: - Los sobres

    func testCadaFamiliaEnCadaAtletaDecodificaConSuFilaPrimero() throws {
        for f in FamiliaDeDetalle.allCases where f != .desconocida {
            for a in DetalleFixtures.Atleta.allCases {
                let d = try DetalleFixtures.detalle(f, a)
                XCTAssertEqual(d.familia, f, "\(f) \(a)")
                XCTAssertEqual(d.ventana.clave, .doceSemanas)
                XCTAssertEqual(d.hoy, "2026-09-29")
                XCTAssertEqual(d.fila?.id, "progreso.\(f.rawValue)", "la primera lectura es la fila que abre el detalle: \(f) \(a)")
                XCTAssertEqual(d.lecturas.first?.id, d.fila?.id)
            }
        }
    }

    func testLaFamiliaDeUnaFilaDeLaPortadaAbreSuDetalle() {
        XCTAssertEqual(FamiliaDeDetalle(.correr), .correr)
        XCTAssertEqual(FamiliaDeDetalle(.remo), .remo)
        XCTAssertEqual(FamiliaDeDetalle(.wod), .estaciones, "el WOD vive dentro de estaciones")
        XCTAssertEqual(FamiliaDeDetalle(.estaciones), .estaciones)
        XCTAssertNil(FamiliaDeDetalle(.otro), "calentar o movilidad no tienen «¿mejoro?»")
        XCTAssertNil(FamiliaDeDetalle(.desconocida))
        XCTAssertNil(FamiliaDeDetalle(nil))
        XCTAssertTrue(FamiliaDeDetalle.remo.esErgo && FamiliaDeDetalle.ski.esErgo && FamiliaDeDetalle.bici.esErgo)
        XCTAssertFalse(FamiliaDeDetalle.correr.esErgo)
    }

    func testUnaFamiliaQueElBinarioNoConoceNoTumbaElSobre() throws {
        let json = #"{"athlete_id":"1","generado_iso":"2026-09-29T08:00:00Z","ventana":{"clave":"12s","desde":"2026-07-08","hasta":"2026-09-29","dias":84,"anterior":null,"cubre_todo":true},"historia":{"semanas":3,"desde":"2026-09-07","cubre_todo":true},"metodo":{"ctl_days":42,"atl_days":7},"anclas":{"pulso":null,"ritmo":{},"potencia":{}},"familia":"natacion","lecturas":[]}"#
        let d = try APIClient.makeJSONDecoder().decode(DetalleAnaliticas.self, from: Data(json.utf8))
        XCTAssertEqual(d.familia, .desconocida)
        XCTAssertNil(d.fila)
    }

    // MARK: - El estado

    func testElEstadoDeCorrerRecorreLosCuatroEstados() throws {
        let esperado: [DetalleFixtures.Atleta: EstadoDeFamilia] = [.lleno: .lleno, .mixto: .lleno, .poco: .poco, .viejo: .viejo, .vacio: .vacio]
        for (a, e) in esperado {
            XCTAssertEqual(SujetoDeFamilia.desde(try DetalleFixtures.detalle(.correr, a), .correr).estado, e, "\(a)")
        }
    }

    func testUnaFamiliaQueNuncaSeHaHechoEsUnVacioAunqueElAtletaEntrene() throws {
        // Jordi entrena (correr, fuerza) pero nunca ha remado: el servidor lo dice `ocasion`, y el detalle es un vacío.
        let d = try DetalleFixtures.detalle(.remo, .poco)
        XCTAssertEqual(d.fila?.cobertura.falta, .ocasion)
        XCTAssertEqual(EstadoDeFamilia(fila: d.fila), .vacio)
    }

    func testSinFilaOSinNumeroEsVacio() {
        XCTAssertEqual(EstadoDeFamilia(fila: nil), .vacio)
    }

    // MARK: - El sujeto

    func testElSujetoEsLaMarcaClaveDeLaFilaConSuDeltaYSuAncla() throws {
        let d = try DetalleFixtures.detalle(.correr, .lleno)
        guard case .marca(let m) = SujetoDeFamilia.desde(d, .correr).cuerpo else { return XCTFail("lleno tiene marca") }
        XCTAssertEqual(m.etiqueta, "Motor", "el título del servidor sin el nombre de la familia")
        XCTAssertEqual(m.valor, d.fila?.dato?.valor)
        XCTAssertEqual(m.unidad, .sKm)
        XCTAssertEqual(m.ancla, .medida)
        XCTAssertNotNil(m.delta, "el periodo anterior existe")
        XCTAssertTrue(m.delta?.igual ?? false, "1 s/km no llega al cambio mínimo del coach (3): ≈")
        XCTAssertEqual(m.nota, d.fila?.procedencia.explicaEs, "la frase de dónde sale es del servidor")
    }

    func testElSujetoDeUnaMarcaEnArranqueEnFrioNoTieneDeltaNiPalabra() throws {
        let d = try DetalleFixtures.detalle(.correr, .poco)
        let s = SujetoDeFamilia.desde(d, .correr)
        guard case .marca(let m) = s.cuerpo else { return XCTFail() }
        XCTAssertEqual(s.estado, .poco)
        XCTAssertEqual(m.etiqueta, "Mejor 10 km")
        XCTAssertNil(m.delta, "sin periodo anterior no hay contra qué")
        XCTAssertNotNil(m.nota)
    }

    func testUnDatoViejoDiceDesdeCuandoYQueNoHaHabidoNada() throws {
        let d = try DetalleFixtures.detalle(.correr, .viejo)
        guard case .marca(let m) = SujetoDeFamilia.desde(d, .correr).cuerpo else { return XCTFail() }
        XCTAssertEqual(m.nota, "Última sesión 23 jun · nada desde entonces")
        XCTAssertNil(m.delta)
        XCTAssertEqual(m.valor, d.fila?.dato?.valor, "el número se queda: el último que hubo")
    }

    func testCadaFamiliaVaciaDiceSuFrase() throws {
        let esperado: [FamiliaDeDetalle: (titulo: String, accion: String)] = [
            .correr: ("Sin correr todavía", "Empezar a correr"),
            .remo: ("Sin remo todavía", "Hacer una pieza de remo"),
            .ski: ("Sin SkiErg todavía", "Hacer una pieza de SkiErg"),
            .bici: ("Sin BikeErg todavía", "Hacer una pieza de BikeErg"),
            .fuerza: ("Sin fuerza todavía", "Empezar una sesión de fuerza"),
            .estaciones: ("Sin estaciones todavía", "Hacer un circuito de estaciones"),
        ]
        for (f, e) in esperado {
            let s = SujetoDeFamilia.desde(try DetalleFixtures.detalle(f, .vacio), f)
            guard case .vacio(let t) = s.cuerpo else { XCTFail("\(f) debería ser vacío"); continue }
            XCTAssertEqual(t.titulo, e.titulo, "\(f)")
            XCTAssertEqual(t.accion, e.accion, "\(f)")
            XCTAssertFalse(t.cuerpo.isEmpty)
            XCTAssertEqual(s.familia, f.lectura, "el punto es el de la familia que se abrió")
        }
    }

    func testElVacioDelErgoNombraLaMaquinaQueSeAbrioAunqueLaLecturaNoLaNombre() throws {
        // El atleta abrió «SkiErg»: se le dice «Sin SkiErg», venga la lectura como venga.
        let d = try DetalleFixtures.detalle(.remo, .vacio)
        guard case .vacio(let t) = SujetoDeFamilia.desde(d, .ski).cuerpo else { return XCTFail() }
        XCTAssertEqual(t.titulo, "Sin SkiErg todavía")
    }

    func testLosTitulosDeLasPantallas() {
        XCTAssertEqual(TextosDeFamilia.titulo(.correr), "Correr")
        XCTAssertEqual(TextosDeFamilia.titulo(.remo), "Ergo")
        XCTAssertEqual(TextosDeFamilia.titulo(.bici), "Ergo")
        XCTAssertEqual(TextosDeFamilia.titulo(.fuerza), "Fuerza")
        XCTAssertEqual(TextosDeFamilia.titulo(.estaciones), "Estaciones y WOD")
        XCTAssertEqual(TextosDeFamilia.etiquetaDelVacio(.ski), "SkiErg")
        XCTAssertEqual(TextosDeFamilia.etiquetaDelVacio(.estaciones), "Estaciones y WOD")
    }

    // MARK: - El día de una marca, y si es nueva

    func testElDiaDeUnaSerieDiariaEsExactoYElDeUnaSemanalEsSuSemana() throws {
        let estaciones = try DetalleFixtures.detalle(.estaciones, .lleno)
        let sled = try XCTUnwrap(estaciones.lectura("estaciones.sled_push.50m.152kg"))
        XCTAssertEqual(sled.diaDelMejor(ventana: estaciones.ventana), .dia("2026-07-25"), "el mejor de la ventana (184 s), no el último punto")
        let correr = try DetalleFixtures.detalle(.correr, .lleno)
        let cinco = try XCTUnwrap(correr.lectura("correr.mejor.5000"))
        XCTAssertEqual(cinco.diaDelMejor(ventana: correr.ventana), .semana("2026-09-07"))
        XCTAssertEqual(DiaDeMarca.semana("2026-09-07").texto(hoy: "2026-09-29"), "sem. 7 sep")
        XCTAssertEqual(DiaDeMarca.dia("2026-07-25").texto(hoy: "2026-09-29"), "25 jul")
        XCTAssertNil(DiaDeMarca.ninguno.texto(hoy: "2026-09-29"), "una fecha inventada es peor que ninguna")
    }

    func testUnDatoViejoTraeSuDiaExacto() throws {
        let d = try DetalleFixtures.detalle(.correr, .viejo)
        let mil = try XCTUnwrap(d.lectura("correr.mejor.1000"))
        XCTAssertTrue(mil.esViejo)
        XCTAssertEqual(mil.diaDelMejor(ventana: d.ventana), .dia("2026-06-25"))
    }

    func testUnaMarcaEsNuevaSiIgualaSuRecordDeSiempre() throws {
        let d = try DetalleFixtures.detalle(.correr, .lleno)
        XCTAssertTrue(try XCTUnwrap(d.lectura("correr.mejor.5000")).esRecordDeLaVentana)
        XCTAssertFalse(try XCTUnwrap(d.lectura("correr.umbral")).esRecordDeLaVentana, "sin referencia de récord no hay «nuevo»")
        let hecha = try AnaliticasFixtures.lectura(extra: #","x":0"#)
        XCTAssertFalse(hecha.esRecordDeLaVentana)
    }

    // MARK: - El cambio de método del panel

    func testElMetodoLlevaLaHolguraDelCoachSiElServidorLaSirve() throws {
        let d = try DetalleFixtures.detalle(.correr, .lleno)
        XCTAssertEqual(d.metodo.holguraRitmoSKm, 3)
        XCTAssertEqual(d.metodo.holguraRir, 1)
        XCTAssertEqual(d.metodo.ctlDays, 42)
    }
}
