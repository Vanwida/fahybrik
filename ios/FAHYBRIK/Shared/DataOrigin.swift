import Foundation

/// De dónde salió un número del atleta.
///
/// Espeja `athlete_benchmarks.source` y `athlete_strength_maxes.source`
/// (migración 0139). Vive aquí, fuera de toda feature, porque lo comparten
/// Marcas y Mi fuerza: cuando cada pantalla tenía su copia, el mismo origen
/// acabó con dos nombres — «test del coach» en la biblioteca y «test con tu
/// coach» en el detalle (CONTRATO-UI §2, un formateador por concepto).
///
/// Existe sobre todo por `onboarding`: un número que el atleta DECLARÓ al entrar
/// no se puede pintar igual que uno que se midió (CONTRATO-UI §7). Sin sello, lo
/// declarado es indistinguible de lo medido de un vistazo, y una estimación
/// disfrazada de medición es peor que un hueco.
enum DataOrigin {
    static let coachTest = "coach_test"
    static let athleteTest = "athlete_test"
    static let onboarding = "onboarding"
    static let registered = "registered"

    /// La frase que lee el atleta. `nil` cuando el origen no añade nada
    /// (`unknown`): ahí el llamante cae a lo que sí sabe.
    static func label(_ source: String, eventName: String? = nil) -> String? {
        switch source {
        case coachTest:   return "test del coach"
        case athleteTest: return "te probaste"
        case onboarding:  return "lo dijiste tú"
        case registered:  return eventName ?? "carrera registrada"
        default:          return nil
        }
    }

    /// True cuando el número lo declaró el atleta y NADIE lo midió.
    static func isDeclared(_ source: String) -> Bool { source == onboarding }

    /// Lo que produjo el atleta lo puede retirar él. El test del coach no: es el
    /// registro con el que programa. Espeja `markIsDeletableByAthlete`.
    static func isDeletableByAthlete(_ source: String) -> Bool {
        source == onboarding || source == athleteTest || source == registered
    }
}
