import Foundation

// EL RESUMEN DE UNA SESIÓN DE SALTOS — lo que sale de los intentos conservados, sin vista.
//
// La captura decidía esto dentro de la pantalla (la mejor altura de cada serie y el LRI). Vive aquí para
// que la pantalla solo pinte y para poder comprobar la cuenta.

struct ResumenDeSalto: Equatable {
    /// La mejor altura sin carga, en cm. Nil si no se conservó ningún salto.
    let libreCm: Double?
    /// La mejor altura con carga, en cm.
    let cargadoCm: Double?
    /// El índice de respuesta a la carga: cuánto cae la altura por cada fracción de peso corporal que se
    /// carga. Solo con las dos series, la carga y el peso del atleta.
    let lri: Double?

    /// - Parameters:
    ///   - loadKg: la carga de la serie cargada.
    ///   - bodyMassKg: el peso del atleta; sin él no hay LRI (y jamás se supone uno).
    static func de(intentos: [JumpDraftAttempt], loadKg: Double, bodyMassKg: Double?) -> ResumenDeSalto {
        let libre = mejor(de: JumpSeries.cmj.rawValue, en: intentos)
        let cargado = mejor(de: JumpSeries.loaded.rawValue, en: intentos)
        var lri: Double?
        if let libre, libre > 0, let cargado, let peso = bodyMassKg, peso > 0, loadKg > 0 {
            lri = ((libre - cargado) / libre) / (loadKg / peso)
        }
        return ResumenDeSalto(libreCm: libre, cargadoCm: cargado, lri: lri)
    }

    /// La mejor altura conservada de una serie.
    static func mejor(de tipo: String, en intentos: [JumpDraftAttempt]) -> Double? {
        intentos.filter { $0.kind == tipo && $0.kept }.compactMap(\.heightCm).max()
    }

    /// «0,85»: el LRI con dos decimales y coma.
    static func textoLri(_ lri: Double) -> String {
        String(format: "%.2f", lri).replacingOccurrences(of: ".", with: ",")
    }
}
