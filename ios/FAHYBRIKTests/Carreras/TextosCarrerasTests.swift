import XCTest
@testable import FAHYBRIK

// LO QUE DICE EL PÓSTER — traducción de la sección «lo que dice el póster» de
// `carreras-decide.test.ts`. Cada estado del predicho declara su porqué y NINGUNO inventa una cifra.
final class TextosCarrerasTests: XCTestCase {

    private let ctx = ContextoPredicho(principal: true, tipoEvento: .hyrox, formato: .individual)

    private func texto(_ p: PrediccionCarrera, _ c: ContextoPredicho? = nil) -> TextoPredicho {
        TextosCarreras.textoPredicho(p, contexto: c ?? ctx)
    }

    func testCifraElHuecoSeDiceComoSeHablaYLaMarcaDiceSiVasPorDelante() {
        let delante = texto(.cifra(totalS: 3790, huecoS: -110, pareja: nil))
        XCTAssertEqual(delante.valor, "63:10")
        XCTAssertEqual(delante.frase, "Vas 1:50 por delante de tu objetivo")
        XCTAssertEqual(delante.marca, .ok)
        XCTAssertTrue(delante.valorEsCifra)

        let detras = texto(.cifra(totalS: 3702, huecoS: 42, pareja: nil))
        XCTAssertEqual(detras.frase, "Te faltan 0:42 para tu objetivo")
        XCTAssertEqual(detras.marca, .aviso)

        let justo = texto(.cifra(totalS: 3900, huecoS: 0, pareja: nil))
        XCTAssertEqual(justo.frase, "Justo en tu objetivo")
        XCTAssertNil(justo.marca)

        XCTAssertNil(texto(.cifra(totalS: 3900, huecoS: nil, pareja: nil)).frase)
    }

    func testParcialSinCifraConLaRegletaYLoQueFaltaPorSuNombre() {
        let t = texto(.parcial(medidos: 8, de: 10, faltan: ["Carrera · 8 km", "RoxZone"], pareja: nil))
        XCTAssertEqual(t.valor, "Aún sin cifra")
        XCTAssertFalse(t.valorEsCifra)
        XCTAssertEqual(t.regleta, TextoPredicho.Regleta(n: 8, de: 10))
        XCTAssertEqual(t.frase, "8 de 10 tramos medidos. Te faltan Carrera · 8 km y RoxZone.")
        XCTAssertTrue(texto(.parcial(medidos: 9, de: 10, faltan: ["Wall ball"], pareja: nil)).frase?.contains("Te falta Wall ball") ?? false)
    }

    func testEnDoblesElPredichoLlevaALaParejaYSinParejaLaSalida() {
        let dobles = ContextoPredicho(principal: true, tipoEvento: .hyrox, formato: .dobles)
        XCTAssertEqual(texto(.cifra(totalS: 3702, huecoS: 42, pareja: "Aina"), dobles).etiqueta, "Predicho hoy · con Aina")
        XCTAssertEqual(texto(.sinDatos(pareja: nil), dobles).etiqueta, "Predicho hoy · pareja")
        XCTAssertTrue(texto(.sinPareja, dobles).frase?.contains("pareja conectada") ?? false)
    }

    func testCadaHuecoDeclaraSuPorqueYNoLlevaCifra() {
        let huecos: [PrediccionCarrera] = [.sinDatos(pareja: nil), .sinMeta, .sinPareja, .error, .noAplica]
        for p in huecos {
            let t = texto(p)
            XCTAssertFalse(t.valorEsCifra, "\(p)")
            XCTAssertNotNil(t.frase, "\(p)")
        }
        XCTAssertTrue(texto(.cargando).esqueleto)
        XCTAssertTrue(texto(.error).reintentar)
    }

    func testSinSerElPrincipalOSinSerHyroxElPredichoDicePorQueNoHay() {
        let secundaria = ContextoPredicho(principal: false, tipoEvento: .hyrox, formato: .individual)
        XCTAssertTrue(texto(.noAplica, secundaria).frase?.contains("objetivo principal") ?? false)
        let otra = ContextoPredicho(principal: true, tipoEvento: .otro, formato: .individual)
        XCTAssertTrue(texto(.noAplica, otra).frase?.contains("solo de HYROX") ?? false)
    }

    func testLaVozDeUnPanelDiceLoQueSeVe() {
        XCTAssertEqual(TextosCarreras.vozPredicho(texto(.cargando)), "Calculando tu predicho")
        XCTAssertEqual(
            TextosCarreras.vozPredicho(texto(.cifra(totalS: 3790, huecoS: -110, pareja: nil))),
            "Predicho hoy. 63:10. Vas 1:50 por delante de tu objetivo"
        )
    }

    func testLaCuentaAtrasCifraYUnidadHoySinUnidad() {
        XCTAssertEqual(CuentaAtrasDia.cifra(dias: 39), "39")
        XCTAssertEqual(CuentaAtrasDia.unidad(dias: 39), "días")
        XCTAssertEqual(CuentaAtrasDia.unidad(dias: 1), "día")
        XCTAssertEqual(CuentaAtrasDia.cifra(dias: 0), "Hoy")
        XCTAssertNil(CuentaAtrasDia.unidad(dias: 0))
    }

    /// Ningún texto de cara al atleta lleva lo que el contrato prohíbe: guiones largos, marcas de
    /// tenant, jerga en inglés. Se barre sobre todo lo que dice el póster en los veinte casos.
    func testNingunTextoDelPosterLlevaLoProhibido() {
        let prohibido = try! NSRegularExpression(pattern: "—|–|pablo|fabrik|fahybrik|\\bHR\\b|bpm|PM5|FTMS|tune-up|\\bsplits?\\b|benchmark", options: [.caseInsensitive])
        for c in CasosCarreras.todos {
            let l = c.lectura
            guard case .objetivo(let carrera, let principal) = DecideCarreras.sujeto(l) else { continue }
            let t = TextosCarreras.textoPredicho(l.prediccion, contexto: ContextoPredicho(principal: principal, tipoEvento: carrera.tipoEvento, formato: carrera.formato))
            let junto = [t.etiqueta, t.valor, t.frase, carrera.prioridad.etiqueta, DecideCarreras.lineaCategoria(carrera)].compactMap { $0 }.joined(separator: " ")
            XCTAssertNil(prohibido.firstMatch(in: junto, range: NSRange(junto.startIndex..., in: junto)), "\(c.id): «\(junto)»")
        }
    }
}
