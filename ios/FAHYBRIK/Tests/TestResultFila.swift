import Foundation

// UN RESULTADO EDITABLE de la hoja de captura, sin vista: lo que el atleta teclea y cómo se lee.
//
// Va con TEXTO (no con `Double`) para que teclear nunca pelee con un formateador; el valor se interpreta
// al guardar. Sale de la hoja para poder comprobarse sin pintarla.
struct FilaDeResultado: Identifiable {
    var id: String { spec.slug }
    let spec: StoreResultSpec
    var measure: TestMeasure
    /// Tiempo: minutos y segundos.
    var minText: String
    var secText: String
    /// Carga, distancia, reps, calorías y el resto: un número.
    var amountText: String

    /// Una fila OPCIONAL nunca bloquea el guardado: el contrato puede marcar cualquier resultado
    /// `optional`, y un `hrr` lo es de por sí (lo mide la app; sin señal se omite, jamás se teclea).
    var isOptional: Bool { spec.isOptional || measure == .hrr }

    var value: Double? {
        switch measure {
        case .time:
            let m = Int(minText.trimmingCharacters(in: .whitespaces)) ?? 0
            let s = Int(secText.trimmingCharacters(in: .whitespaces)) ?? 0
            let total = m * 60 + s
            return total > 0 ? Double(total) : nil
        default:
            let cleaned = amountText.replacingOccurrences(of: ",", with: ".")
                .trimmingCharacters(in: .whitespaces)
            guard let v = Double(cleaned), v > 0 else { return nil }
            return v
        }
    }

    /// La fila precargada con lo medido en la ejecución (o vacía, si no hay nada medido: el atleta lo pone).
    static func sembrada(spec: StoreResultSpec, precarga: Double?) -> FilaDeResultado {
        let measure = TestMeasure(spec.measure)
        if measure == .time {
            let segundos = Int((precarga ?? 0).rounded())
            return FilaDeResultado(
                spec: spec, measure: measure,
                minText: segundos > 0 ? String(segundos / 60) : "",
                secText: segundos > 0 ? String(format: "%02d", segundos % 60) : "",
                amountText: ""
            )
        }
        let texto: String
        if let precarga {
            texto = measure.usesDecimals ? decimalSinCeros(precarga) : String(Int(precarga.rounded()))
        } else {
            texto = ""
        }
        return FilaDeResultado(spec: spec, measure: measure, minText: "", secText: "", amountText: texto)
    }

    /// «142,5» sin un «,0» de cola: los kg de la precarga.
    static func decimalSinCeros(_ v: Double) -> String {
        let redondeado = (v * 10).rounded() / 10
        return redondeado == redondeado.rounded() ? String(Int(redondeado)) : Formato.esDecimal(redondeado)
    }
}
