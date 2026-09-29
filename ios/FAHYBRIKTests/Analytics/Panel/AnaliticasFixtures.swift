import XCTest
@testable import FAHYBRIK

// LOS PANELES DE EJEMPLO: el JSON EXACTO que sirve `cargarPanel` (el motor real de
// `shared/domain/analytics`, el mismo que `GET /api/athlete/analytics/panel`),
// volcado sobre una base desechable con cinco atletas de prueba a fecha
// 2026-09-29. Nada escrito a mano: si el contrato cambia, se vuelca otra vez.
//
//   lleno   un año dentro, umbral medido, reloj y carrera en 39 días (las seis ventanas)
//   mixto   correr medido y ergo declarado, sin reloj ni carrera
//   poco    tres semanas de historia, umbral estimado, sin carrera
//   vacio   recién dado de alta: nada de nada
//   viejo   26 semanas de historia, parado, reloj sin sincronizar y marcas por medir
enum AnaliticasFixtures {
    /// Los mismos cinco atletas que las previews (`AnaliticasEjemplos`): un solo catálogo.
    typealias Atleta = AnaliticasEjemplos.Atleta

    static func url(_ atleta: Atleta, _ ventana: VentanaClave = .doceSemanas) throws -> URL {
        let nombre = "panel-\(atleta.rawValue)-\(ventana.rawValue)"
        return try XCTUnwrap(Bundle(for: Marcador.self).url(forResource: nombre, withExtension: "json"), "falta el fixture \(nombre).json")
    }

    static func datos(_ atleta: Atleta, _ ventana: VentanaClave = .doceSemanas) throws -> Data {
        try Data(contentsOf: url(atleta, ventana))
    }

    /// Decodificado por el MISMO decodificador que la app (snake_case → camelCase).
    static func panel(_ atleta: Atleta, _ ventana: VentanaClave = .doceSemanas) throws -> PanelAnaliticas {
        try APIClient.makeJSONDecoder().decode(PanelAnaliticas.self, from: datos(atleta, ventana))
    }

    // MARK: - Lecturas hechas a mano (lo que ningún atleta de prueba cubre)

    /// El JSON de UNA lectura del contrato. `falta` va ya como JSON (`{"por":"viejo","ultimo":"2026-09-01"}`).
    static func lecturaJSON(id: String = "x", grupo: String = "forma", familia: String = "\"correr\"", ancla: String = "\"medida\"",
                            unidad: String = "tss", estado: String = "medida", falta: String = "null",
                            veredicto: String = "null", extra: String = "") -> String {
        let medida = estado == "medida"
        let dato = medida ? #"{"valor":1,"unidad":"\#(unidad)","referencia":null}"# : "null"
        let serie = medida
            ? #"{"unidad":"\#(unidad)","paso":"dia","puntos":[{"t":"2026-09-28","v":1},{"t":"2026-09-29","v":null}],"plan":null,"referencias":null}"#
            : "null"
        let muestras = medida ? 1 : 0
        return """
        {"id":"\(id)","grupo":"\(grupo)","familia":\(familia),"titulo_es":"X","estado":"\(estado)",
         "dato":\(dato),"comparacion":null,"serie":\(serie),"reparto":null,"veredicto":\(veredicto),
         "cobertura":{"muestras":\(muestras),"dias_ventana":1,"dias_con_dato":\(muestras),"pct":\(muestras * 100),"falta":\(falta)},
         "procedencia":{"de":"m","explica_es":"e","medida":true,"ancla":\(ancla),"proveedor":null}\(extra)}
        """
    }

    static func lectura(id: String = "x", grupo: String = "forma", familia: String = "\"correr\"", ancla: String = "\"medida\"",
                        unidad: String = "tss", estado: String = "medida", falta: String = "null",
                        veredicto: String = "null", extra: String = "") throws -> LecturaAnalitica {
        let json = lecturaJSON(id: id, grupo: grupo, familia: familia, ancla: ancla, unidad: unidad, estado: estado,
                               falta: falta, veredicto: veredicto, extra: extra)
        return try APIClient.makeJSONDecoder().decode(LecturaAnalitica.self, from: Data(json.utf8))
    }

    private final class Marcador {}
}
