import Foundation

// POR QUÉ FALTA UN DATO — el vocabulario de faltas de todo el producto (`Falta` de `shared/domain/running/progress.ts`), tal y como
// llega en `cobertura.falta` de cada lectura del motor y en las coberturas de Hoy, Carreras, Plan y los tests.
//
// UN CERO NUNCA SUSTITUYE A UN HUECO: sin dato llega una falta que dice por qué, y ninguna se colapsa a 0 al leer.

/// Las razones, y se agrupan en DOS tratamientos. Esa agrupación es toda la
/// diferencia entre una pantalla honesta y una que da pena.
///
/// ES EL VOCABULARIO DE TODA LA APP, no el de esta pantalla: el contrato de
/// analíticas (`shared/domain/analytics/lectura.ts`) reutiliza estas mismas seis
/// razones a propósito, para que a un atleta sin test no se le pida el test tres
/// veces en la misma pantalla. Por eso vive aquí una sola vez.
enum Falta: Equatable {
    /// Le falta TIEMPO. Se le dibuja el plazo.
    case historia(llevas: Int, hacen: Int)
    /// No hay test de zonas: no se sabe qué es «suave» para él.
    case ancla
    /// No hay pulso medido, así que no hay nada que anclar.
    case sensor
    /// NO HAY RELOJ QUE LO MIDA, y es distinto de `sensor`: una banda de pulso no
    /// le da el sueño ni la variabilidad nocturna, así que pedirle la banda para
    /// desbloquear el sueño sería mandarle a comprar lo que no le sirve.
    case dispositivo
    /// La ocasión no se ha dado todavía (nunca corrió cansado).
    case ocasion
    /// Nadie le ha pedido nunca un ritmo: no hay contra qué cumplir.
    case intencion
    /// No hay carrera objetivo: sin ella no hay a qué proyectar la forma (29-09).
    case objetivo
    /// Sesiones sin puntuar el esfuerzo: sin RPE ni umbral, su carga no se sabe (29-09).
    case esfuerzo(sesiones: Int)
    /// No hay entrenos planificados: no hay plan que seguir ni proyectar (29-09).
    case plan
    /// Hay dato, pero ninguno dentro de la ventana: el número es el último que hubo,
    /// del día `ultimo` (ISO). Cuarto estado de un bloque: «dato viejo» (29-09).
    case viejo(ultimo: String)
    /// La previsión de carrera no tiene con qué predecir `faltan` de sus tramos (29-09).
    case marcas(faltan: Int)
    /// La carrera objetivo es de dobles y no hay pareja activa: lo fija el coach (29-09).
    case pareja
    /// UNA RAZÓN QUE ESTE BINARIO NO CONOCE. No se puede decir por qué falta ni
    /// ofrecer salida, así que se trata como silencio: enseñar un candado sin
    /// motivo es exactamente el hueco mudo que este vocabulario existe para
    /// evitar. Y decodificar en vez de lanzar es lo que impide que una razón
    /// nueva en el servidor deje al atleta la pantalla entera en blanco.
    case desconocida
}

extension Falta {
    /// «AÚN NO» Y «NO APLICA» PARECEN LO MISMO Y NO LO SON. Al recién llegado le falta TIEMPO y se le dibuja el plazo. Al que no ha
    /// corrido nunca cansado no le falta nada: esa lectura no existe en su vida, y enseñarle un hueco prometiéndosela es ruido con
    /// forma de dato.
    ///
    /// Una razón DESCONOCIDA también calla, y por el mismo motivo con otra causa: no se puede decir por qué falta ni ofrecer salida, y
    /// un candado sin motivo es el hueco mudo que este vocabulario existe para no enseñar.
    var seCalla: Bool {
        switch self {
        case .ocasion, .intencion, .desconocida: return true
        case .historia, .ancla, .sensor, .dispositivo, .objetivo, .esfuerzo, .plan, .viejo, .marcas, .pareja: return false
        }
    }
}

extension Falta: Codable {
    private enum K: String, CodingKey { case por, llevas, hacen, sesiones, ultimo, faltan }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: K.self)
        let por = try c.decode(String.self, forKey: .por)
        switch por {
        case "historia":
            self = .historia(llevas: try c.decode(Int.self, forKey: .llevas),
                             hacen: try c.decode(Int.self, forKey: .hacen))
        case "ancla": self = .ancla
        case "sensor": self = .sensor
        case "dispositivo": self = .dispositivo
        case "ocasion": self = .ocasion
        case "intencion": self = .intencion
        case "objetivo": self = .objetivo
        case "esfuerzo": self = .esfuerzo(sesiones: (try? c.decode(Int.self, forKey: .sesiones)) ?? 0)
        case "plan": self = .plan
        case "viejo":
            // Sin el día no se puede decir de cuándo es el número: razón desconocida, no un fallo.
            if let ultimo = try? c.decode(String.self, forKey: .ultimo) { self = .viejo(ultimo: ultimo) } else { self = .desconocida }
        case "marcas": self = .marcas(faltan: (try? c.decode(Int.self, forKey: .faltan)) ?? 0)
        case "pareja": self = .pareja
        default: self = .desconocida
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        switch self {
        case .historia(let llevas, let hacen):
            try c.encode("historia", forKey: .por)
            try c.encode(llevas, forKey: .llevas)
            try c.encode(hacen, forKey: .hacen)
        case .ancla: try c.encode("ancla", forKey: .por)
        case .sensor: try c.encode("sensor", forKey: .por)
        case .dispositivo: try c.encode("dispositivo", forKey: .por)
        case .ocasion: try c.encode("ocasion", forKey: .por)
        case .intencion: try c.encode("intencion", forKey: .por)
        case .objetivo: try c.encode("objetivo", forKey: .por)
        case .esfuerzo(let sesiones):
            try c.encode("esfuerzo", forKey: .por)
            try c.encode(sesiones, forKey: .sesiones)
        case .plan: try c.encode("plan", forKey: .por)
        case .viejo(let ultimo):
            try c.encode("viejo", forKey: .por)
            try c.encode(ultimo, forKey: .ultimo)
        case .marcas(let faltan):
            try c.encode("marcas", forKey: .por)
            try c.encode(faltan, forKey: .faltan)
        case .pareja: try c.encode("pareja", forKey: .por)
        case .desconocida: try c.encode("desconocida", forKey: .por)
        }
    }
}
