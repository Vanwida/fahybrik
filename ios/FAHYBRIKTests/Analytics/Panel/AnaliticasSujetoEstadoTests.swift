import XCTest
import SwiftUI
@testable import FAHYBRIK

// EL SUJETO DE LA PORTADA — lo que dice el bloque grande de arriba en sus cuatro estados, sobre el
// panel REAL del motor. Es la traducción a XCTest de `kit-analiticas-piel.test.ts` («el sujeto de la
// portada dice lo del contrato en los cuatro estados») sobre `SujetoEstado.desde`: así la app y el doble
// no pueden divergir. Donde el contrato de Swift es el del servidor y no el de la propuesta (las palabras
// y la disposición las dice el servidor con las bandas del coach), los casos son los mismos y las
// palabras, las que sirve el motor.
final class AnaliticasSujetoEstadoTests: XCTestCase {

    private func sujeto(_ atleta: AnaliticasFixtures.Atleta, bloque: EstadoBloque? = nil) throws -> (PanelAnaliticas, SujetoEstado) {
        let p = try AnaliticasFixtures.panel(atleta)
        let estado = bloque ?? ContextoDeBloque.estados(de: p)[.estado] ?? .vacio
        return (p, SujetoEstado.desde(p, bloque: estado))
    }

    // MARK: - Los cuatro estados

    func testLlenoLaPalabraDelServidorDeTituloSuVeredictoDeApoyoLasTresCifrasYLaDisposicion() throws {
        let (p, s) = try sujeto(.lleno)
        XCTAssertEqual(s.bloque, .lleno)
        XCTAssertEqual(s.titulo, p.bloques.estado.first { $0.id == IdsDelPanel.estadoFrescura }?.veredicto?.etiquetaEs)
        XCTAssertEqual(s.titulo, "Manteniendo")
        XCTAssertEqual(s.apoyo, "La forma sube 0,3 por semana · subida sostenible.")
        XCTAssertEqual(s.celdas.map(\.clave), [.forma, .fatiga, .frescura])
        XCTAssertEqual(s.celdas.map(\.texto), ["26", "25", "−2"])
        XCTAssertEqual(s.disposicion, SujetoEstado.Disposicion(valor: 76, palabra: "Bien", nivel: .alto, esDeHoy: true))
        XCTAssertNil(s.salida)
        XCTAssertNil(s.plazo)
        XCTAssertEqual(s.tono, .neutro)
        XCTAssertEqual(s.marca, .neutra)
    }

    func testMixtoSinRelojNoTieneDisposicionYLoDemasEsIgual() throws {
        let (_, s) = try sujeto(.mixto)
        XCTAssertEqual(s.bloque, .lleno)
        XCTAssertNil(s.disposicion, "sin reloj no hay cifra de disposición ni un guion en su lugar")
        XCTAssertEqual(s.celdas.map(\.clave), [.forma, .fatiga, .frescura])
    }

    func testVacioSinCifrasNiPalabraElHuecoEsElTituloYLaSalidaUnaAccion() throws {
        let (_, s) = try sujeto(.vacio)
        XCTAssertEqual(s.bloque, .vacio)
        XCTAssertTrue(s.celdas.isEmpty)
        XCTAssertNil(s.disposicion)
        XCTAssertEqual(s.tono, .neutro)
        XCTAssertEqual(s.titulo, "Sin carga todavía")
        XCTAssertEqual(s.apoyo, "Tu estado sale de la carga de tus entrenos. Con el primero ya aparece.")
        XCTAssertEqual(s.salida, .accion("Empezar un entreno", .inicio),
                       "la falta de reloj (disposición) no sustituye a la salida de la CARGA")
    }

    func testPocoSinPalabraNiFormaNiFrescuraSoloLaFatigaConElPlazoDibujadoYSinAccion() throws {
        let (_, s) = try sujeto(.poco)
        XCTAssertEqual(s.bloque, .poco)
        XCTAssertEqual(s.titulo, "Todavía es pronto")
        XCTAssertEqual(s.celdas.map(\.clave), [.fatiga], "en frío, forma y frescura suben por pura aritmética: no se enseñan")
        XCTAssertEqual(s.plazo, PlazoHueco(llevas: 3, hacen: 6, unidad: "semanas"))
        XCTAssertEqual(s.apoyo, "La palabra de hoy necesita semanas de carga detrás para no engañar.")
        XCTAssertEqual(s.salida, .espera("Se llena solo con las semanas"))
        XCTAssertEqual(s.tono, .neutro)
    }

    func testViejoConLaPalabraDelServidorElHuecoDiceDesdeCuandoYQueLoReanuda() throws {
        // El motor no emite hoy un Estado `viejo` (solo el progreso lleva la falta): el caso se fuerza
        // sobre el atleta parado para afirmar el mecanismo.
        let (_, s) = try sujeto(.viejo, bloque: .viejo)
        XCTAssertEqual(s.bloque, .viejo)
        XCTAssertEqual(s.titulo, "Fresco", "la palabra sigue: es lo que pasa al parar")
        XCTAssertTrue(s.apoyo?.hasPrefix("Sin entrenar desde hace") == true, s.apoyo ?? "nil")
        XCTAssertEqual(s.salida, .accion("Empezar un entreno", .inicio))
        XCTAssertEqual(s.tono, .info)
    }

    func testElAtletaParadoDelMotorSigueLlenoConLaDisposicionDeOtroDia() throws {
        let (_, s) = try sujeto(.viejo)
        XCTAssertEqual(s.bloque, .lleno)
        XCTAssertEqual(s.titulo, "Fresco")
        XCTAssertEqual(s.tono, .info)
        XCTAssertEqual(s.marca, .info)
        let d = try XCTUnwrap(s.disposicion)
        XCTAssertFalse(d.esDeHoy)
        XCTAssertEqual(d.palabra, "del 10 sep", "el reloj no la renovó hoy: no lleva palabra del coach, lleva fecha")
        XCTAssertEqual(d.nivel, .sinPalabra, "una lectura que no describe hoy no pinta el arco de un estado")
        XCTAssertEqual(d.rotulo, "Última disposición")
    }

    func testCuandoLaPalabraSeRetiraElSujetoDiceSinVeredictoYPorQue() throws {
        // La cobertura de la carga baja del mínimo del coach: el servidor retira la palabra de la frescura.
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: try AnaliticasFixtures.datos(.lleno)) as? [String: Any])
        var bloques = try XCTUnwrap(json["bloques"] as? [String: Any])
        func retoca(_ bloque: String, _ id: String, _ cambio: (inout [String: Any]) -> Void) {
            var ls = bloques[bloque] as? [[String: Any]] ?? []
            for i in ls.indices where ls[i]["id"] as? String == id { cambio(&ls[i]) }
            bloques[bloque] = ls
        }
        retoca("estado", "estado.frescura") { $0["veredicto"] = NSNull() }
        retoca("forma", "carga.frescura") { $0["veredicto"] = NSNull() }
        retoca("forma", "carga.cobertura") { $0["dato"] = ["valor": 60.0, "unidad": "pct", "referencia": NSNull()] }
        json["bloques"] = bloques
        let panel = try APIClient.makeJSONDecoder().decode(PanelAnaliticas.self, from: JSONSerialization.data(withJSONObject: json))
        let s = SujetoEstado.desde(panel, bloque: .lleno)
        XCTAssertEqual(s.titulo, "Sin veredicto")
        XCTAssertEqual(s.apoyo, "Solo el 60 % de tu carga se ha podido calcular; la palabra de hoy necesita el 90 %.")
        XCTAssertEqual(s.tono, .neutro)
        XCTAssertEqual(s.celdas.map(\.clave), [.forma, .fatiga, .frescura], "el número se queda siempre; se retira la palabra")
    }

    // MARK: - Lo que el diseño prohíbe

    func testElTinteNuncaEsElAcentoSolidoNiCambiaElColorDeLaCifra() throws {
        for estado in EstadoDeFrescura.allCases { XCTAssertNotEqual(estado.tinte.tono, .accion, "\(estado)") }
        for atleta in AnaliticasFixtures.Atleta.allCases {
            XCTAssertNotEqual(try sujeto(atleta).1.tono, .accion, "\(atleta)")
        }
    }

    func testCadaEstadoDeFrescuraTieneSuTinteYUnaClaveDesconocidaCaeANeutro() {
        typealias E = EstadoDeFrescura
        XCTAssertTrue(E.sobrecarga.tinte == (TonoDia.peligro, MarcaEstado.peligro))
        XCTAssertTrue(E.optimo.tinte == (TonoDia.ok, MarcaEstado.ok))
        XCTAssertTrue(E.mantener.tinte == (TonoDia.neutro, MarcaEstado.neutra))
        XCTAssertTrue(E.fresco.tinte == (TonoDia.info, MarcaEstado.info))
        XCTAssertTrue(E.recargando.tinte == (TonoDia.neutro, MarcaEstado.aviso))
        XCTAssertEqual(Set(E.allCases.map(\.rawValue)), ["sobrecarga", "optimo", "mantener", "fresco", "recargando"])
        XCTAssertNil(E(rawValue: "una-clave-nueva"), "una clave que este binario no conoce no se inventa: cae a neutro en `desde`")
    }

    func testLoQueNoSeSabeNoSePintaNingunTextoSaleComoNilNaNONulo() throws {
        for atleta in AnaliticasFixtures.Atleta.allCases {
            let (_, s) = try sujeto(atleta)
            var textos = [s.titulo, s.apoyo ?? ""] + s.celdas.map(\.texto)
            if let d = s.disposicion { textos += [d.palabra ?? "", d.rotulo] }
            if case .accion(let t, _)? = s.salida { textos.append(t) }
            for t in textos { XCTAssertNil(t.range(of: #"nil|NaN|null|undefined|—|–"#, options: .regularExpression), "\(atleta): «\(t)»") }
        }
    }

    func testLasCifrasUsanElMenosTipograficoYLaFrescuraLlevaSuSigno() {
        XCTAssertEqual(AnaliticasFormato.entero(51), "51")
        XCTAssertEqual(AnaliticasFormato.entero(-4), "−4")
        XCTAssertEqual(AnaliticasFormato.entero(22, conSigno: true), "+22")
        XCTAssertEqual(AnaliticasFormato.entero(-4, conSigno: true), "−4")
        XCTAssertEqual(AnaliticasFormato.entero(0, conSigno: true), "0")
        XCTAssertEqual(AnaliticasFormato.entero(-0.4, conSigno: true), "0", "redondea antes de ponerle signo: no hay «−0»")
        XCTAssertEqual(AnaliticasFormato.entero(1234), "1.234")
        XCTAssertFalse(AnaliticasFormato.entero(-4).contains("-"))
    }

    // MARK: - La disposición

    func testElArcoDeLaDisposicionSigueElTonoDelServidorNoLaCifra() {
        typealias T = VeredictoDeLectura.Tono
        XCTAssertEqual(NivelDeDisposicion(tono: T.bien), .alto)
        XCTAssertEqual(NivelDeDisposicion(tono: T.atencion), .medio)
        XCTAssertEqual(NivelDeDisposicion(tono: T.aviso), .bajo)
        XCTAssertEqual(NivelDeDisposicion(tono: T.neutro), .sinPalabra)
        XCTAssertEqual(NivelDeDisposicion(tono: T.desconocido), .sinPalabra)
        XCTAssertEqual(NivelDeDisposicion(tono: nil), .sinPalabra)
    }

    // MARK: - La ventana dicha en una frase (A4)

    func testCadaVentanaTieneSuFraseSinGuionesLargos() {
        let frases = VentanaClave.todas.map(\.frase)
        XCTAssertEqual(Set(frases).count, VentanaClave.todas.count)
        for f in frases { XCTAssertNil(f.range(of: #"[—–]"#, options: .regularExpression), f); XCTAssertFalse(f.isEmpty) }
        XCTAssertEqual(VentanaClave.doceSemanas.frase, "Últimas 12 semanas")
        XCTAssertEqual(VentanaClave.todo.frase, "Desde que empezaste")
    }
}
