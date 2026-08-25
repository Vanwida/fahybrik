import Foundation

// CUÁNTO DURA — y qué se dice cuando no se puede saber.
//
// POR QUÉ EXISTE
// --------------
// El servidor dejó de estimar duraciones el 29-jul: una sesión o lleva el reloj
// ESCRITO por el coach, o su duración ES el resultado y no es una propiedad del
// plan (`shared/domain/prescription/duration.ts`). Desde ese cambio la mayoría de
// las plantillas de producción llegan sin número — 26 de 42 asignadas — y el móvil
// las estaba sumando como CERO:
//
//     sessions.reduce(0) { $0 + ($1.estDurationMinutes ?? 0) }
//
// Eso no es un total: es la suma de una fracción, presentada como el total. Y solo
// se ocultaba si el resultado salía exactamente 0, cosa que casi nunca pasa — así
// que la semana real de un atleta pasó de seis sesiones con número a una, y siguió
// enseñando un volumen semanal como si nada hubiera cambiado.
//
// LA REGLA
// --------
// Un total que no incluye todo NO es un total. Aquí se resuelve declarando el
// hueco, no escondiéndolo: se da el SUELO («desde 4 h 20» — el plan escribe al
// menos eso) y, al lado, cuántas sesiones no escriben reloj. Las dos mitades
// juntas son ciertas; cualquiera de las dos sola miente.
//
// Y funciona a cualquier cobertura precisamente porque el número es un suelo: que
// falten sesiones no lo vuelve falso, lo vuelve un suelo más flojo. Por eso no hay
// umbral mínimo de cobertura — un umbral sería otra constante inventada, y crearía
// un escalón donde el número desaparece sin que nadie lo diga.
//
// Ver docs/CONTRATO-UI.md §7 y la entrada «"No se sabe" es un valor de primera
// clase» de docs/DECISIONS.md.

// MARK: - Por qué no hay número

/// Espejo de `DurationUnknownReason` (`shared/domain/prescription/duration.ts`).
/// Los rawValue son los del cable tal cual: `convertFromSnakeCase` traduce CLAVES,
/// no valores.
enum DuracionDesconocida: String, Codable {
    /// El format se puntúa POR TIEMPO (`for_time`, `chipper`, `ladder`, `rounds`,
    /// `hyrox_sim`): la duración es el resultado, no una propiedad del plan.
    case scoredByTime = "scored_by_time"
    /// `death_by` — la sesión acaba cuando fallas.
    case untilFailure = "until_failure"
    /// El trabajo está prescrito pero nada lo convierte en tiempo: reps sin tempo,
    /// distancia sin ritmo, calorías sin ritmo, o series con el descanso abierto.
    case workNotTimed = "work_not_timed"
    /// La prescripción no dice qué trabajo hay. Hueco de contenido, no propiedad
    /// del dominio — este el coach sí lo puede arreglar.
    case undosed

    /// Lo tolerante: un motivo que esta versión de la app no conoce se trata como
    /// «no lo sé», nunca revienta la semana entera (mismo criterio que el resto de
    /// enums del cable).
    init?(cable: String?) {
        guard let cable, let v = DuracionDesconocida(rawValue: cable) else { return nil }
        self = v
    }

    /// La frase que lee el ATLETA. Espejo literal de `DURATION_UNKNOWN_ES`, para que
    /// la app y el dashboard digan lo mismo con las mismas palabras (contrato §2).
    /// Habla a alguien del box: ni «prescripción», ni «dosis», ni nombres de format.
    var frase: String {
        switch self {
        case .scoredByTime: return ""
        case .untilFailure: return ""
        case .workNotTimed: return ""
        case .undosed:      return ""
        }
    }
}

// MARK: - El volumen de un conjunto de sesiones

/// La lectura honesta de «cuánto entreno hay aquí» sobre una lista de sesiones de
/// las que unas escriben reloj y otras no. Puro: entra la lista de minutos, sale
/// qué se puede decir. Lo usan la semana del plan y la semana del free, que antes
/// tenían cada una su propia suma silenciosa.
enum VolumenPrevisto {

    struct Lectura: Equatable {
        /// Los minutos que el plan SÍ escribe, sumados. 0 = no escribe ninguno.
        let sueloMinutos: Int
        /// Cuántas sesiones no escriben reloj — el hueco, que se declara.
        let sinReloj: Int

        /// true cuando todas las sesiones escriben su reloj: ahí el suelo cubre
        /// la semana entera y no hay nada que declarar.
        var completo: Bool { sinReloj == 0 }

        /// «desde 4 h 20» — el suelo. nil cuando no hay ni un minuto escrito: sin
        /// número no se pinta número (§7).
        var suelo: String? { Formato.duracionPrevista(sueloMinutos) }

        /// «3 sin tiempo previsto» — el hueco DECLARADO. nil cuando no hay hueco.
        ///
        /// Es lo que convierte el suelo en una verdad completa: «desde 2 h 10» a
        /// secas, con tres sesiones fuera, se lee como el volumen de la semana. Con
        /// esta línea al lado se lee como lo que es. El sustantivo se sobreentiende
        /// porque el conteo de sesiones va justo encima («5 sesiones»).
        var hueco: String? {
            sinReloj > 0 ? "\(sinReloj) sin tiempo previsto" : nil
        }

        /// Las dos mitades en una frase, para una línea corrida o para la voz de
        /// accesibilidad. nil cuando no hay ninguna de las dos.
        var linea: String? {
            let partes = [suelo, hueco].compactMap { $0 }
            return partes.isEmpty ? nil : partes.joined(separator: " · ")
        }
    }

    /// Lee el volumen de un conjunto de sesiones a partir de sus minutos escritos
    /// (nil = esa sesión no escribe reloj).
    static func lee(_ minutos: [Int?]) -> Lectura {
        var suelo = 0
        var sinReloj = 0
        for m in minutos {
            // > 0 y no != nil: un 0 escrito tampoco es un reloj, y tratarlo como tal
            // reintroduciría el cero silencioso por la puerta de atrás.
            if let m, m > 0 { suelo += m } else { sinReloj += 1 }
        }
        return Lectura(sueloMinutos: suelo, sinReloj: sinReloj)
    }
}
