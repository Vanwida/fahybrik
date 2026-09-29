import XCTest
@testable import FAHYBRIK

// LOS DETALLES DE EJEMPLO: el JSON que sirve el motor (`progresoAtleta`, `preciarSesion`, `cumplimientoDeSesion`…), volcado por
// `web/scripts/volcar-analiticas-detalle.ts` y `volcar-analiticas-sesion.ts` sobre las entradas sintéticas de cinco atletas a fecha
// 2026-09-29. Nada escrito a mano: si el contrato cambia, se vuelca otra vez.
//
//   lleno   un año dentro: correr con umbral medido, remo y ski medidos, bici declarada, fuerza, estaciones y simulaciones
//   mixto   correr medido, remo declarado, fuerza, tres estaciones y ningún WOD
//   poco    tres semanas, pulso estimado y nada de ergo
//   viejo   26 semanas de historia y NADA en la ventana
//   vacio   recién dado de alta
enum DetalleFixtures {
    /// Los mismos cinco atletas y las mismas cinco sesiones que las previews (`DetalleEjemplos`): un solo catálogo.
    typealias Atleta = AnaliticasEjemplos.Atleta
    typealias Caso = DetalleEjemplos.Sesion

    private final class Marcador {}

    private static func datos(_ nombre: String) throws -> Data {
        let url = try XCTUnwrap(Bundle(for: Marcador.self).url(forResource: nombre, withExtension: "json"), "falta el fixture \(nombre).json")
        return try Data(contentsOf: url)
    }

    /// Decodificados por el MISMO decodificador que la app (snake_case → camelCase).
    static func detalle(_ familia: FamiliaDeDetalle, _ atleta: Atleta) throws -> DetalleAnaliticas {
        try APIClient.makeJSONDecoder().decode(DetalleAnaliticas.self, from: datos("detalle-\(familia.rawValue)-\(atleta.rawValue)-12s"))
    }

    static func sesion(_ caso: Caso) throws -> DetalleDeSesion {
        try APIClient.makeJSONDecoder().decode(DetalleDeSesion.self, from: datos("sesion-\(caso.rawValue)"))
    }

    static func cumplimiento() throws -> CumplimientoAnaliticas {
        try APIClient.makeJSONDecoder().decode(CumplimientoAnaliticas.self, from: datos("cumplimiento-lleno-12s"))
    }

    /// La sesión del cumplimiento que corresponde a un caso (por el id de su ejecución).
    static func fila(de s: DetalleDeSesion, en c: CumplimientoAnaliticas) -> FilaDeSesion? {
        c.sesiones.first { $0.executionId == s.executionId }
    }
}
