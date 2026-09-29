import XCTest
@testable import FAHYBRIK

// EL CONTRATO DE LECTURAS, PROBADO POR DONDE SE ROMPE.
//
// Los motores (carga, capacidad, recuperación) viven en `shared/domain/analytics` y ya están probados allí: repetirlos aquí sería
// probar el servidor desde el móvil. Lo que sí es nuestro es la promesa de la que depende cada pantalla de la pestaña:
//
//  **UN VALOR NUEVO DEL SERVIDOR NO TUMBA LA PANTALLA.** Grupo, unidad, estado, paso, tono y falta decodifican a su caso desconocido
//  en vez de lanzar. Un enum ampliado en el servidor dejaría al atleta con la pantalla en blanco, que es el fallo opuesto y peor.
//
// Cómo se ESCRIBE cada unidad lo prueba `AnaliticasFormatoTests` (barre el enum entero); aquí solo se prueba que se lee.
final class LecturasTests: XCTestCase {

    private func decodifica(_ json: String) throws -> LecturaAnalitica {
        try APIClient.makeJSONDecoder().decode(LecturaAnalitica.self, from: Data(json.utf8))
    }

    // MARK: - Lo que llega tal cual

    /// UN HUECO ES UN HUECO. `v` a nulo es un día que nadie midió y llega nulo, nunca colapsado a cero: un cero afirma «durmió cero horas».
    func testUnHuecoDeLaSerieLlegaNuloYNoCero() throws {
        let l = try decodifica(Self.lectura(serie: #"{"unidad":"horas","paso":"dia","puntos":[{"t":"2026-08-11","v":7.2},{"t":"2026-08-12","v":null},{"t":"2026-08-13","v":6.4}]}"#))
        XCTAssertEqual(l.serie?.puntos.map(\.v), [7.2, nil, 6.4])
    }

    func testUnaLecturaCompletaSeLeeCampoACampo() throws {
        let l = try decodifica(Self.lectura(dato: #"{"valor":48,"unidad":"ms","referencia":{"valor":55,"delta":-7,"de":"basal_60_14d"}}"#))
        XCTAssertEqual(l.id, "carga.fondo")
        XCTAssertEqual(l.grupo, .carga)
        XCTAssertEqual(l.estado, .medida)
        XCTAssertEqual(l.dato?.unidad, .ms)
        XCTAssertEqual(l.dato?.referencia?.delta, -7)
        XCTAssertEqual(l.dato?.referencia?.de, "basal_60_14d")
        XCTAssertEqual(l.cobertura.diasVentana, 84)
        XCTAssertEqual(l.procedencia.de, "banister_ctl")
        XCTAssertTrue(l.procedencia.medida)
    }

    // MARK: - Lo que NO puede tumbar la pantalla

    /// Un grupo nuevo en el servidor decodifica, y la vista lo ignora: si lanzara, el atleta perdería la pantalla entera por una lectura
    /// que ni siquiera se iba a dibujar.
    func testUnGrupoDesconocidoNoTumbaLaLectura() throws {
        XCTAssertEqual(try decodifica(Self.lectura(grupo: "hidratacion")).grupo, .desconocido)
    }

    /// Una unidad que este binario no sabe escribir: la lectura existe. Un número sin unidad miente por omisión.
    func testUnaUnidadDesconocidaSeDecodificaYLaLecturaSeCalla() throws {
        let l = try decodifica(Self.lectura(dato: #"{"valor":62.4,"unidad":"vatios","referencia":null}"#))
        XCTAssertEqual(l.dato?.unidad, .desconocida)
        XCTAssertFalse(l.sePinta)
    }

    func testUnEstadoUnPasoYUnTonoDesconocidosNoLanzan() throws {
        let estado = try decodifica(Self.lectura(estado: "en_revision"))
        XCTAssertEqual(estado.estado, .desconocido)
        XCTAssertFalse(estado.sePinta)
        let paso = try decodifica(Self.lectura(serie: #"{"unidad":"tss","paso":"mes","puntos":[{"t":"2026-08-11","v":61},{"t":"2026-08-12","v":62}]}"#))
        XCTAssertEqual(paso.serie?.paso, .desconocido)
        XCTAssertTrue(paso.sePinta, "sin paso legible la serie no se dibuja, pero la cifra sí")
        let hecho = try APIClient.makeJSONDecoder().decode(
            Hecho.self,
            from: Data(#"{"id":"x","frase_es":"f","pide_es":null,"de":[],"tono":"urgente"}"#.utf8)
        )
        XCTAssertEqual(hecho.tono, .desconocido)
    }

    /// LA RAZÓN QUE FALTABA. El contrato emite `dispositivo` en casi todas las lecturas de recuperación, y este cliente lanzaba con ella:
    /// un atleta sin reloj no habría visto la pantalla en absoluto.
    func testLaFaltaPorDispositivoSeDecodifica() throws {
        let l = try decodifica(Self.lectura(estado: "sin_dato", falta: #"{"por":"dispositivo"}"#))
        XCTAssertEqual(l.cobertura.falta, .dispositivo)
        XCTAssertFalse(Falta.dispositivo.seCalla, "falta un aparato que el atleta puede conectar: se dice")
        XCTAssertTrue(l.sePinta)
    }

    /// Una razón nueva decodifica a `desconocida`: no se puede decir por qué falta ni ofrecer salida, y cada pantalla la trata como silencio.
    func testUnaFaltaDesconocidaDecodificaYNoLanza() throws {
        let l = try decodifica(Self.lectura(estado: "sin_dato", falta: #"{"por":"lo_que_sea"}"#))
        XCTAssertEqual(l.cobertura.falta, .desconocida)
        XCTAssertTrue(Falta.desconocida.seCalla)
        XCTAssertFalse(l.sePinta)
    }

    /// «Aún no» y «no aplica» no son lo mismo: al recién llegado le falta tiempo (se dibuja el plazo); a quien nunca corrió cansado no le falta
    /// nada, y la lectura se calla.
    func testAunNoSeDiceYNoAplicaSeCalla() {
        XCTAssertTrue(Falta.ocasion.seCalla)
        XCTAssertTrue(Falta.intencion.seCalla)
        let seDicen: [Falta] = [.ancla, .sensor, .historia(llevas: 3, hacen: 6), .objetivo, .esfuerzo(sesiones: 2), .plan, .viejo(ultimo: "2026-07-01"), .marcas(faltan: 1), .pareja]
        for f in seDicen {
            XCTAssertFalse(f.seCalla, "\(f) es algo que el atleta puede llenar: se dice")
        }
    }

    /// Un `sin_dato` SIN falta declarada tampoco se pinta: un hueco mudo es exactamente lo que el contrato existe para no enseñar.
    func testUnSinDatoSinFaltaNoSePinta() throws {
        XCTAssertFalse(try decodifica(Self.lectura(estado: "sin_dato", falta: "null")).sePinta)
    }

    /// Las faltas con dato propio (`llevas/hacen`, `ultimo`, `faltan`) lo llevan; sin el dato, `viejo` no puede decir de cuándo es el
    /// número y se queda en razón desconocida en vez de fallar.
    func testLasFaltasConDatoLoLlevanYSinElNoLanzan() throws {
        XCTAssertEqual(try decodifica(Self.lectura(estado: "sin_dato", falta: #"{"por":"historia","llevas":5,"hacen":14}"#)).cobertura.falta, .historia(llevas: 5, hacen: 14))
        XCTAssertEqual(try decodifica(Self.lectura(estado: "sin_dato", falta: #"{"por":"viejo","ultimo":"2026-07-01"}"#)).cobertura.falta, .viejo(ultimo: "2026-07-01"))
        XCTAssertEqual(try decodifica(Self.lectura(estado: "sin_dato", falta: #"{"por":"viejo"}"#)).cobertura.falta, .desconocida)
        XCTAssertEqual(try decodifica(Self.lectura(estado: "sin_dato", falta: #"{"por":"marcas","faltan":3}"#)).cobertura.falta, .marcas(faltan: 3))
    }

    // MARK: - Datos de prueba

    private static func lectura(
        grupo: String = "carga",
        estado: String = "medida",
        dato: String = #"{"valor":62.4,"unidad":"tss","referencia":null}"#,
        serie: String = #"{"unidad":"tss","paso":"dia","puntos":[{"t":"2026-08-11","v":61},{"t":"2026-08-12","v":62}]}"#,
        falta: String = "null"
    ) -> String {
        let sinDato = estado == "sin_dato"
        return """
        {
          "id": "carga.fondo",
          "grupo": "\(grupo)",
          "titulo_es": "Fondo",
          "estado": "\(estado)",
          "dato": \(sinDato ? "null" : dato),
          "serie": \(sinDato ? "null" : serie),
          "reparto": null,
          "cobertura": {"muestras": 41, "dias_ventana": 84, "dias_con_dato": 41, "pct": 48.8, "falta": \(falta)},
          "procedencia": {"de": "banister_ctl", "explica_es": "Media móvil de 42 días.", "medida": true, "proveedor": null}
        }
        """
    }
}
