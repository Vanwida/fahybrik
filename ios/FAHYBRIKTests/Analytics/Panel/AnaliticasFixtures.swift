import XCTest
@testable import FAHYBRIK

// LOS PANELES DE EJEMPLO — el JSON EXACTO que sirve `cargarPanel`, generado con
// el motor REAL de `shared/domain/analytics` (lecturasForma, lecturasSemanas,
// lecturasEstado, hechosDe, resolverVentana) sobre las historias sintéticas de
// los cinco atletas del contrato (`analiticas-portada` del doble):
//
//   lleno   Marta · un año dentro, umbral medido, reloj, carrera en 39 días (las seis ventanas)
//   mixto   Pau · correr medido, ergo declarado, sin reloj (13 % con umbral estimado)
//   poco    Jordi · tres semanas, umbral estimado, sin carrera
//   vacio   recién dado de alta: nada de nada
//   viejo   Lucía · parada 25 días, reloj sin sincronizar 19
//
// Se regeneran con `scratchpad/analiticas-ios/generar-fixtures.mts` (no viaja en
// el repo: el motor es el de shared). `_propuesta` en la raíz marca lo que el
// contrato firmado añade y el servidor aún no sirve.
enum AnaliticasFixtures {
    enum Atleta: String, CaseIterable { case lleno, mixto, poco, vacio, viejo }

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

    private final class Marcador {}
}
