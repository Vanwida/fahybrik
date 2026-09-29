import XCTest
@testable import FAHYBRIK

// LOS CUATRO ESTADOS DE UN BLOQUE (A10), derivados del panel REAL del motor y sin
// un solo umbral escrito en el cliente: vacío, poco, lleno y viejo salen de lo que
// el servidor dice en cada lectura (`estado`, `cobertura.falta`). Y la prosa de
// cada hueco, con su salida. Los casos que ningún atleta de prueba produce
// (todo el bloque «viejo», esfuerzo, pareja, noches) van con lecturas construidas.
final class AnaliticasEstadosTests: XCTestCase {

    private func estados(_ atleta: AnaliticasFixtures.Atleta, _ ventana: VentanaClave = .doceSemanas) throws -> (PanelAnaliticas, [BloqueDelPanel: EstadoBloque]) {
        let p = try AnaliticasFixtures.panel(atleta, ventana)
        return (p, ContextoDeBloque.estados(de: p))
    }

    private func estado(_ lecturas: [LecturaAnalitica]) -> EstadoBloque { AnaliticasEstados.estado(de: lecturas) }

    private func hueco(_ p: PanelAnaliticas, _ b: BloqueDelPanel, _ e: EstadoBloque) -> TextoHueco {
        AnaliticasEstados.textoHueco(bloque: b, estado: e, lecturas: p.bloques[b], hoy: p.hoy, metodo: p.metodo)
    }

    // MARK: - Los cinco atletas del motor caen en su estado

    func testElLlenoTieneLosOchoBloquesLlenosEnTodasLasVentanas() throws {
        for v in VentanaClave.todas where v != .unAno {
            let (_, e) = try estados(.lleno, v)
            for b in BloqueDelPanel.allCases where b != .desconocido {
                XCTAssertEqual(e[b], .lleno, "\(v.rawValue) \(b)")
            }
        }
    }

    func testUnAnoDeHistoriaCasiCompletaDejaElProgresoEnPoco() throws {
        // 51 de 53 semanas: el servidor sigue diciendo `historia`, y el cliente no lo corrige.
        let (_, e) = try estados(.lleno, .unAno)
        XCTAssertEqual(e[.progreso], .poco)
        for b in BloqueDelPanel.allCases where b != .desconocido && b != .progreso {
            XCTAssertEqual(e[b], .lleno, "\(b)")
        }
    }

    func testElMixtoEsperaHistoriaEnProgresoYNoTieneRelojNiCarrera() throws {
        let (_, e) = try estados(.mixto)
        XCTAssertEqual(e[.estado], .lleno)
        XCTAssertEqual(e[.forma], .lleno)
        XCTAssertEqual(e[.semanas], .lleno)
        XCTAssertEqual(e[.intensidad], .lleno, "el ritmo medido basta aunque no haya zonas")
        XCTAssertEqual(e[.progreso], .poco)
        XCTAssertEqual(e[.records], .lleno)
        XCTAssertEqual(e[.carrera], .vacio, "sin carrera objetivo")
        XCTAssertEqual(e[.recuperacion], .vacio, "sin reloj")
    }

    func testElPocoEsperaTresSemanas() throws {
        let (_, e) = try estados(.poco)
        XCTAssertEqual(e[.estado], .poco)
        XCTAssertEqual(e[.forma], .poco)
        XCTAssertEqual(e[.semanas], .lleno)
        XCTAssertEqual(e[.intensidad], .lleno)
        XCTAssertEqual(e[.progreso], .poco)
        XCTAssertEqual(e[.records], .lleno)
        XCTAssertEqual(e[.carrera], .vacio)
        XCTAssertEqual(e[.recuperacion], .vacio)
    }

    func testElVacioEsVacioEnLosOchoBloques() throws {
        let (_, e) = try estados(.vacio)
        for b in BloqueDelPanel.allCases where b != .desconocido {
            XCTAssertEqual(e[b], .vacio, "\(b)")
        }
    }

    func testElViejoSoloEsPocoEnCarreraPorLasMarcas() throws {
        // Ninguno de sus bloques trae TODOS los números con la falta `viejo`: el
        // servidor solo la emite en el progreso y aquí las marcas por medir mandan.
        let (_, e) = try estados(.viejo)
        for b in BloqueDelPanel.allCases where b != .desconocido && b != .carrera {
            XCTAssertEqual(e[b], .lleno, "\(b)")
        }
        XCTAssertEqual(e[.carrera], .poco)
    }

    func testLosPendientesNoSeJuzgan() throws {
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: AnaliticasFixtures.datos(.lleno)) as? [String: Any])
        json["pendientes"] = ["intensidad", "progreso"]
        let p = try APIClient.makeJSONDecoder().decode(PanelAnaliticas.self, from: JSONSerialization.data(withJSONObject: json))
        let e = ContextoDeBloque.estados(de: p)
        XCTAssertEqual(e[.intensidad], .vacio, "está pendiente, no vacío por dato")
        XCTAssertEqual(e[.progreso], .vacio)
        XCTAssertEqual(e[.forma], .lleno)
    }

    // MARK: - La derivación con lecturas construidas

    func testUnBloqueSoloEsViejoSiTodosSusNumerosLlevanLaFaltaViejo() throws {
        let viejo = #"{"por":"viejo","ultimo":"2026-09-01"}"#
        let a = try AnaliticasFixtures.lectura(id: "a", falta: viejo)
        let b = try AnaliticasFixtures.lectura(id: "b", falta: viejo)
        let c = try AnaliticasFixtures.lectura(id: "c", falta: viejo)
        XCTAssertEqual(estado([a, b, c]), .viejo)
        XCTAssertEqual(estado([a, b, try AnaliticasFixtures.lectura(id: "d")]), .lleno, "un solo número al día lo desmiente")
        XCTAssertEqual(estado([a, b, try AnaliticasFixtures.lectura(id: "e", estado: "sin_dato", falta: #"{"por":"ocasion"}"#)]), .viejo, "una lectura sin número no cuenta")
    }

    func testEsfuerzoMarcasYParejaDejanElBloqueEnPoco() throws {
        let base = try AnaliticasFixtures.lectura(id: "base")
        for falta in [#"{"por":"esfuerzo","sesiones":2}"#, #"{"por":"marcas","faltan":3}"#, #"{"por":"pareja"}"#] {
            let l = try AnaliticasFixtures.lectura(id: "x", falta: falta)
            XCTAssertEqual(estado([base, l]), .poco, falta)
        }
    }

    func testLaHistoriaSoloEsperaSiYaHayAlgoAndado() throws {
        let empezada = try AnaliticasFixtures.lectura(estado: "sin_dato", falta: #"{"por":"historia","llevas":2,"hacen":42}"#)
        let sinEmpezar = try AnaliticasFixtures.lectura(estado: "sin_dato", falta: #"{"por":"historia","llevas":0,"hacen":42}"#)
        XCTAssertEqual(estado([empezada]), .poco)
        XCTAssertEqual(estado([sinEmpezar]), .vacio)
    }

    func testUnaFaltaSinAccionDelAtletaNoQuitaElLleno() throws {
        let base = try AnaliticasFixtures.lectura(id: "base")
        let sinReloj = try AnaliticasFixtures.lectura(id: "r", falta: #"{"por":"dispositivo"}"#)
        XCTAssertEqual(estado([base, sinReloj]), .lleno, "el dato atrasado del reloj no es un bloque a medias")
        let ocasion = try AnaliticasFixtures.lectura(id: "o", estado: "sin_dato", falta: #"{"por":"ocasion"}"#)
        XCTAssertEqual(estado([ocasion]), .vacio, "sin ocasión de medir no hay nada que esperar")
        XCTAssertEqual(estado([]), .vacio)
    }

    // MARK: - La prosa de los huecos

    func testElVacioLlevaSuSalidaYLaFaltaConcretaManda() throws {
        let (p, _) = try estados(.vacio)
        let forma = hueco(p, .forma, .vacio)
        XCTAssertEqual(forma.titulo, "Tu forma aparece con los entrenos")
        // La proyección falta por OBJETIVO (sin carrera): su salida concreta gana a la genérica.
        XCTAssertEqual(forma.salida, .accion("Elegir tu carrera objetivo", .carreras))
        XCTAssertNil(forma.plazo)
        XCTAssertEqual(hueco(p, .semanas, .vacio).titulo, "Nada hecho todavía")
        XCTAssertEqual(hueco(p, .semanas, .vacio).salida, .accion("Ver mi plan", .plan))
        XCTAssertEqual(hueco(p, .recuperacion, .vacio).salida, .accion("Conectar tu reloj", .dispositivos), "la falta `dispositivo` del servidor")
        XCTAssertEqual(hueco(p, .carrera, .vacio).salida, .accion("Elegir tu carrera objetivo", .carreras))
        let sinLecturas = AnaliticasEstados.textoHueco(bloque: .recuperacion, estado: .vacio, lecturas: [], hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(sinLecturas.titulo, "Sin reloj conectado")
        XCTAssertEqual(sinLecturas.salida, .accion("Conectar tu reloj", .dispositivos))
    }

    func testElPocoDibujaElPlazoEnSemanas() throws {
        let (p, _) = try estados(.poco)
        let t = hueco(p, .forma, .poco)
        XCTAssertEqual(t.titulo, "Todavía es pronto")
        XCTAssertEqual(t.plazo, PlazoHueco(llevas: 3, hacen: 6, unidad: "semanas"), "21 y 42 días, en semanas")
        XCTAssertTrue(t.cuerpo.contains("media de 42 días"), t.cuerpo)
        XCTAssertEqual(t.salida, .espera("Se llena solo con las semanas"))
        let progreso = hueco(p, .progreso, .poco)
        XCTAssertEqual(progreso.plazo, PlazoHueco(llevas: 2, hacen: 13, unidad: "semanas"), "en el progreso la historia ya viene en semanas")
    }

    func testLaRecuperacionCuentaEnNochesYDiceCuantasNecesitaLaBasal() throws {
        let p = try AnaliticasFixtures.panel(.lleno)
        let l = try AnaliticasFixtures.lectura(grupo: "recuperacion", falta: #"{"por":"historia","llevas":5,"hacen":14}"#)
        let t = AnaliticasEstados.textoHueco(bloque: .recuperacion, estado: .poco, lecturas: [l], hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(t.plazo, PlazoHueco(llevas: 5, hacen: 14, unidad: "noches"))
        XCTAssertTrue(t.cuerpo.contains("La basal necesita 14 noches"), t.cuerpo)
        XCTAssertEqual(t.salida, .espera("Se llena solo con las noches"))
    }

    func testFaltanMarcasNombraLosTramosYLlevaAMedirlas() throws {
        // La historia en cero de la disposición no tapa el motivo real del hueco.
        let (p, e) = try estados(.viejo)
        XCTAssertEqual(e[.carrera], .poco)
        let t = hueco(p, .carrera, .poco)
        XCTAssertEqual(t.titulo, "Faltan marcas de 8 tramos")
        XCTAssertTrue(t.cuerpo.hasPrefix("Sin marca de SkiErg 1km, Sled push, Sled pull y 5 más. "), t.cuerpo)
        XCTAssertEqual(t.salida, .accion("Medir tus marcas", .tests))
        XCTAssertNil(t.plazo)
    }

    func testFaltaUnaMarcaEnSingular() throws {
        let p = try AnaliticasFixtures.panel(.lleno)
        let l = try AnaliticasFixtures.lectura(id: "\(IdsDelPanel.prefijoTramo)ski-erg", grupo: "carrera", estado: "sin_dato", falta: #"{"por":"marcas","faltan":1}"#)
        let t = AnaliticasEstados.textoHueco(bloque: .carrera, estado: .poco, lecturas: [l], hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(t.titulo, "Falta la marca de un tramo")
    }

    func testSinParejaLoConfiguraElCoachYNoHayBoton() throws {
        let p = try AnaliticasFixtures.panel(.lleno)
        let l = try AnaliticasFixtures.lectura(grupo: "carrera", estado: "sin_dato", falta: #"{"por":"pareja"}"#)
        let t = AnaliticasEstados.textoHueco(bloque: .carrera, estado: .poco, lecturas: [l], hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(t, AnaliticasEstados.sinPareja)
        XCTAssertEqual(t.titulo, "Falta tu pareja")
        XCTAssertEqual(t.salida, .espera("Lo configura tu coach"))
    }

    func testLasSesionesSinPuntuarElEsfuerzoSeDicenSinPrometerUnBoton() throws {
        let p = try AnaliticasFixtures.panel(.lleno)
        let l = try AnaliticasFixtures.lectura(falta: #"{"por":"esfuerzo","sesiones":4}"#)
        let t = AnaliticasEstados.textoHueco(bloque: .forma, estado: .poco, lecturas: [l], hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(t.titulo, "1 sesión de momento", "las muestras que el servidor cuenta")
        XCTAssertEqual(t.salida, .espera("Puntúa el esfuerzo al terminar cada entreno"))
    }

    func testUnBloquePendienteDiceQueEstaEnConstruccion() {
        XCTAssertEqual(AnaliticasEstados.pendiente.titulo, "Muy pronto")
        XCTAssertEqual(AnaliticasEstados.pendiente.salida, .espera("Se llena solo"))
    }

    func testElViejoDiceDesdeCuandoYComoLoReanuda() throws {
        let p = try AnaliticasFixtures.panel(.lleno)
        let viejo = try AnaliticasFixtures.lectura(falta: #"{"por":"viejo","ultimo":"2026-09-01"}"#)
        XCTAssertEqual(AnaliticasEstados.ultimoDato([viejo]), "2026-09-01")
        let forma = AnaliticasEstados.textoHueco(bloque: .forma, estado: .viejo, lecturas: [viejo], hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(forma.titulo, "Último entreno hace 28 días")
        XCTAssertEqual(forma.salida, .accion("Empezar un entreno", .inicio))
        let semanas = AnaliticasEstados.textoHueco(bloque: .semanas, estado: .viejo, lecturas: [viejo], hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(semanas.titulo, "Ninguna sesión en 28 días")
        XCTAssertEqual(semanas.salida, .accion("Escribir a mi coach", .chat))
        let recuperacion = AnaliticasEstados.textoHueco(bloque: .recuperacion, estado: .viejo, lecturas: [viejo], hoy: p.hoy, metodo: p.metodo)
        XCTAssertEqual(recuperacion.salida, .accion("Sincronizar el reloj", .dispositivos))
    }

    // MARK: - La nota de una lectura a la que le falta algo, y su salida

    func testLaNotaDeCadaFaltaEsLoQueSeLeDiceAlAtleta() {
        let hoy = "2026-09-29"
        let casos: [(Falta, BloqueDelPanel, String?)] = [
            (.historia(llevas: 21, hacen: 42), .forma, "Llevas 3 de 6 semanas para que salga"),
            (.historia(llevas: 5, hacen: 14), .recuperacion, "Llevas 5 de 14 noches para que salga"),
            (.historia(llevas: 2, hacen: 13), .progreso, "Llevas 2 de 13 semanas para que salga"),
            (.esfuerzo(sesiones: 1), .forma, "Una sesión sin puntuar el esfuerzo"),
            (.esfuerzo(sesiones: 3), .forma, "3 sesiones sin puntuar el esfuerzo"),
            (.marcas(faltan: 1), .carrera, "Falta una marca para afinarlo"),
            (.marcas(faltan: 8), .carrera, "Faltan 8 marcas para afinarlo"),
            (.dispositivo, .recuperacion, "Lo mide tu reloj"),
            (.sensor, .intensidad, "Necesita el pulso medido"),
            (.ancla, .intensidad, "Necesita tu test de zonas"),
            (.objetivo, .forma, "Necesita una carrera objetivo"),
            (.plan, .semanas, "Necesita entrenos en tu plan"),
            (.pareja, .carrera, "Lo configura tu coach"),
            (.viejo(ultimo: "2026-09-18"), .progreso, "Último dato del 18 sep"),
            (.viejo(ultimo: "2025-11-03"), .progreso, "Último dato del 3 nov 2025"),
            (.ocasion, .progreso, nil),
            (.intencion, .semanas, nil),
            (.desconocida, .forma, nil),
        ]
        for (falta, bloque, esperada) in casos {
            XCTAssertEqual(AnaliticasEstados.notaDeFalta(falta, bloque: bloque, hoy: hoy), esperada, "\(falta) en \(bloque)")
        }
    }

    func testLaSalidaDeCadaFaltaLlevaDondeSeArregla() {
        XCTAssertEqual(AnaliticasEstados.salida(de: .ancla), .accion("Hacer el test de zonas", .tests))
        XCTAssertEqual(AnaliticasEstados.salida(de: .sensor), .accion("Conectar banda de pulso", .dispositivos))
        XCTAssertEqual(AnaliticasEstados.salida(de: .dispositivo), .accion("Conectar tu reloj", .dispositivos))
        XCTAssertEqual(AnaliticasEstados.salida(de: .objetivo), .accion("Elegir tu carrera objetivo", .carreras))
        XCTAssertEqual(AnaliticasEstados.salida(de: .marcas(faltan: 2)), .accion("Medir tus marcas", .tests))
        XCTAssertEqual(AnaliticasEstados.salida(de: .esfuerzo(sesiones: 2)), .espera("Puntúa el esfuerzo al terminar cada entreno"))
        for sinSalida in [Falta.historia(llevas: 1, hacen: 2), .ocasion, .intencion, .plan, .viejo(ultimo: "2026-09-01"), .pareja, .desconocida] {
            XCTAssertNil(AnaliticasEstados.salida(de: sinSalida), "\(sinSalida): lo resuelve el tiempo o el coach")
        }
    }

    // MARK: - Los cubos de la carga

    func testLosCubosDeCargaApilanPorFamiliaGrandeConElPlan() throws {
        let p = try AnaliticasFixtures.panel(.lleno)
        let cubos = AnaliticasDerivados.cubosCarga(p, agrupar: 1)
        XCTAssertEqual(cubos.count, 13, "doce semanas más la partida")
        XCTAssertEqual(cubos.first?.partes.map(\.code), ["correr", "ergo", "fuerza", "estacionesWod", "otro"])
        XCTAssertEqual(cubos.last?.enCurso, true)
        XCTAssertNotNil(cubos[5].plan, "el plan viaja en la misma serie")
        XCTAssertEqual(AnaliticasDerivados.cubosCarga(p, agrupar: 4).count, 4)
        XCTAssertTrue(AnaliticasDerivados.cubosCarga(try AnaliticasFixtures.panel(.vacio), agrupar: 1).isEmpty, "sin carga no hay columnas")
    }

    // MARK: - El nombre con que se pinta una lectura

    func testLaDisposicionNuncaSePintaConSuNombreTecnico() throws {
        let p = try AnaliticasFixtures.panel(.lleno)
        let readiness = try XCTUnwrap(AnaliticasDerivados.lectura(p.bloques.recuperacion, IdsDelPanel.readiness))
        XCTAssertEqual(readiness.tituloEs, "Readiness", "el servidor la titula así; el cliente la traduce al pintar")
        XCTAssertEqual(AnaliticasDerivados.etiqueta(de: readiness), "Disposición")
        let variabilidad = try XCTUnwrap(AnaliticasDerivados.lectura(p.bloques.recuperacion, "recuperacion.variabilidad"))
        XCTAssertEqual(AnaliticasDerivados.etiqueta(de: variabilidad), variabilidad.tituloEs)
    }
}
