import XCTest
@testable import FAHYBRIK

// LOS CUATRO ESTADOS DE UN BLOQUE (A10), derivados del panel real y sin un solo
// umbral escrito aquí: vacío, poco, lleno y viejo salen del JSON del motor y de
// los números del método del coach. Y la prosa de cada hueco, con su salida.
final class AnaliticasEstadosTests: XCTestCase {

    private func estados(_ atleta: AnaliticasFixtures.Atleta) throws -> (PanelAnaliticas, [BloqueDelPanel: EstadoBloque]) {
        let p = try AnaliticasFixtures.panel(atleta)
        return (p, ContextoDeBloque.estados(de: p))
    }

    func testLosCincoAtletasCaenEnSuEstado() throws {
        let (_, lleno) = try estados(.lleno)
        XCTAssertEqual(lleno[.estado], .lleno)
        XCTAssertEqual(lleno[.forma], .lleno)
        XCTAssertEqual(lleno[.semanas], .lleno)

        let (_, mixto) = try estados(.mixto)
        XCTAssertEqual(mixto[.forma], .lleno)

        let (_, poco) = try estados(.poco)
        XCTAssertEqual(poco[.estado], .poco, "tres semanas: espera historia")
        XCTAssertEqual(poco[.forma], .poco)

        let (_, vacio) = try estados(.vacio)
        XCTAssertEqual(vacio[.estado], .vacio)
        XCTAssertEqual(vacio[.forma], .vacio)
        XCTAssertEqual(vacio[.semanas], .vacio)

        let (_, viejo) = try estados(.viejo)
        XCTAssertEqual(viejo[.forma], .viejo, "25 días sin sesión > los 14 del coach")
        XCTAssertEqual(viejo[.estado], .viejo)
        XCTAssertEqual(viejo[.semanas], .viejo)
    }

    func testSinElUmbralDelCoachNadaSaleViejo() throws {
        // El servidor de hoy no sirve `dato_viejo_dias`: sin umbral no hay juicio.
        var p = try AnaliticasFixtures.panel(.viejo)
        let sinUmbral = MetodoDelPanel(ctlDays: 42, atlDays: 7, rampAlertTssPerWeek: 5, coberturaVeredictoMinPct: 90, hrvMinNightsBaseline: 14, basalDias: 60,
                                       datoViejoDias: nil, muestrasMinimas: nil, coberturaPocoPct: nil, semanasMinimasForma: nil, ventanaBasalDias: nil, recienteDias: nil)
        p = PanelAnaliticas(athleteId: p.athleteId, generadoIso: p.generadoIso, ventana: p.ventana, historia: p.historia, metodo: sinUmbral,
                            anclas: p.anclas, bloques: p.bloques, pendientes: p.pendientes, hechos: p.hechos)
        XCTAssertEqual(ContextoDeBloque.estados(de: p)[.forma], .lleno)
    }

    func testLosPendientesNoSeJuzgan() throws {
        let (p, e) = try estados(.lleno)
        for b in p.pendientes { XCTAssertEqual(e[b], .vacio, "\(b) está pendiente, no vacío por dato") }
    }

    // MARK: - La prosa de los huecos

    func testElVacioLlevaSuSalidaYLaFaltaConcretaManda() throws {
        let (p, _) = try estados(.vacio)
        let forma = AnaliticasEstados.textoHueco(bloque: .forma, estado: .vacio, lecturas: p.bloques.forma, hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(forma.titulo, "Tu forma aparece con los entrenos")
        // La proyección falta por OBJETIVO (sin carrera): su salida concreta gana a la genérica.
        XCTAssertEqual(forma.salida, .accion("Elegir tu carrera objetivo", .carreras))
        let semanas = AnaliticasEstados.textoHueco(bloque: .semanas, estado: .vacio, lecturas: p.bloques.semanas, hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(semanas.salida, .accion("Ver mi plan", .plan))
        let recuperacion = AnaliticasEstados.textoHueco(bloque: .recuperacion, estado: .vacio, lecturas: [], hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(recuperacion.salida, .accion("Conectar tu reloj", .dispositivos))
    }

    func testElPocoDibujaElPlazoEnSemanas() throws {
        let (p, _) = try estados(.poco)
        let t = AnaliticasEstados.textoHueco(bloque: .forma, estado: .poco, lecturas: p.bloques.forma, hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(t.titulo, "Todavía es pronto")
        XCTAssertEqual(t.plazo, PlazoHueco(llevas: 3, hacen: 6, unidad: "semanas"))
        XCTAssertTrue(t.cuerpo.contains("media de 42 días"))
        XCTAssertEqual(t.salida, .espera("Se llena solo con las semanas"))
    }

    func testElViejoDiceDesdeCuandoYQueLoReanuda() throws {
        let (p, _) = try estados(.viejo)
        let forma = AnaliticasEstados.textoHueco(bloque: .forma, estado: .viejo, lecturas: p.bloques.forma, hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(forma.titulo, "Último entreno hace 25 días")
        XCTAssertEqual(forma.salida, .accion("Empezar un entreno", .inicio))
        let semanas = AnaliticasEstados.textoHueco(bloque: .semanas, estado: .viejo, lecturas: p.bloques.semanas, hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(semanas.salida, .accion("Escribir a mi coach", .chat))
    }

    // MARK: - El Estado fijo

    func testElEstadoFijoPintaSoloLasCeldasQueExisten() throws {
        let (lleno, eL) = try estados(.lleno)
        let e = AnaliticasDerivados.estado(lleno, estadoBloque: eL[.estado]!)
        XCTAssertEqual(e.palabra, "Manteniendo")
        XCTAssertEqual(e.celdas.map(\.etiqueta), ["Forma", "Fatiga", "Frescura", "Disposición"])
        XCTAssertNil(e.nota)

        let (poco, eP) = try estados(.poco)
        let p = AnaliticasDerivados.estado(poco, estadoBloque: eP[.estado]!)
        XCTAssertNil(p.palabra)
        XCTAssertEqual(p.sinPalabra, "Todavía es pronto")
        XCTAssertEqual(p.celdas.map(\.etiqueta), ["Fatiga", "Disposición"], "en frío, forma y frescura no se enseñan")
        XCTAssertEqual(p.nota, "Forma y frescura a partir de la semana 6 · llevas 3")

        let (vacio, eV) = try estados(.vacio)
        let v = AnaliticasDerivados.estado(vacio, estadoBloque: eV[.estado]!)
        XCTAssertEqual(v.sinPalabra, "Sin carga todavía")
        XCTAssertTrue(v.celdas.isEmpty)

        let (viejo, eX) = try estados(.viejo)
        let x = AnaliticasDerivados.estado(viejo, estadoBloque: eX[.estado]!)
        XCTAssertEqual(x.palabra, "Recargando")
        XCTAssertEqual(x.nota, "Sin entrenar desde el 4 sep · la fatiga ya cayó y la forma baja un poco cada día")
        XCTAssertEqual(x.celdas.last?.palabra, "del 10 sep", "la disposición que no es de hoy dice de cuándo es")
    }

    func testLaFraseDeFormaSoloEnlazaPalabrasDelServidor() throws {
        let (mixto, _) = try estados(.mixto)
        let f = try XCTUnwrap(AnaliticasDerivados.fraseDeForma(mixto))
        XCTAssertTrue(f.fuerte)
        XCTAssertTrue(f.texto.hasPrefix("Manteniendo: la forma "), f.texto)
        XCTAssertTrue(f.texto.contains("umbral estimado"), f.texto)

        let (poco, _) = try estados(.poco)
        XCTAssertNil(AnaliticasDerivados.fraseDeForma(poco), "en frío la palabra no se sustituye por otra")
    }

    func testLosCubosDeCargaApilanPorFamiliaGrandeConElPlan() throws {
        let (p, _) = try estados(.lleno)
        let cubos = AnaliticasDerivados.cubosCarga(p, agrupar: 1)
        XCTAssertEqual(cubos.count, 13, "doce semanas más la partida")
        XCTAssertEqual(cubos.first?.partes.map(\.code), ["correr", "ergo", "fuerza", "estacionesWod"])
        XCTAssertTrue(cubos.last!.enCurso)
        XCTAssertNotNil(cubos[5].plan, "el plan viaja en la misma serie")
        let agrupados = AnaliticasDerivados.cubosCarga(p, agrupar: 4)
        XCTAssertEqual(agrupados.count, 4)
    }
}
