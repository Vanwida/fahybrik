import Foundation

// LO QUE DICEN LOS PANELES DE LA FICHA — las frases y las cuentas que la vista no decide.
//
// La vista (`Workout/SesionPrevia/Ficha/`) pinta; aquí se decide qué línea sale a la derecha de una fila, qué dice el
// reloj de un EMOM, qué movimiento toca en cada minuto, cuánto sube cada barra del perfil de una carrera o qué se
// avisa cuando el coach dejó un movimiento sin dosis. Funciones puras junto al resto de la lectura: una regla no
// cambia al cambiar la piel, y se puede leer sin renderizar nada. Espejo de `kit-ficha/modelo.ts` del doble.

// MARK: - La cabecera

extension LecturaFicha.Cabecera {
    /// «Hoy · Plan de Pablo», «Mañana · Entreno libre» o «Entreno libre» si no se sabe cuándo. Sin nombre de coach,
    /// «Plan de tu coach»: la ficha no inventa uno.
    var kicker: String {
        let quien: String
        switch origen {
        case .libre:             quien = "Entreno libre"
        case .coach(let nombre): quien = "Plan de \(nombre ?? "tu coach")"
        }
        return [cuando, quien].compactMap { $0 }.joined(separator: " · ")
    }
}

extension LecturaFicha.Nota {
    /// La inicial del avatar de la firma. Sin firma no hay avatar.
    var inicial: String? { firma?.first.map { String($0).uppercased() } }
}

extension LecturaFicha.Pareja {
    /// «Dobles con Marta»; sin nombre, «Dobles» a secas.
    var rotulo: String { nombre.map { "Dobles con \($0)" } ?? "Dobles" }
}

extension LecturaFicha.SinDetalle {
    var titular: String {
        switch self {
        case .noLlego:       return "Sin detalle de la sesión"
        case .sinEjercicios: return "Sin ejercicios todavía"
        }
    }

    /// Lo que pasa y la salida: con red se vuelve a abrir; sin ejercicios se empieza igualmente.
    var frase: String {
        switch self {
        case .noLlego:
            return "No pudimos cargar los ejercicios de esta sesión. Revisa tu conexión y vuelve a abrirla, o regístrala manualmente."
        case .sinEjercicios:
            return "Tu coach aún no ha detallado qué hacer. Puedes empezar igualmente y apuntar lo que hagas."
        }
    }
}

// MARK: - Un bloque

extension BloqueFicha {

    /// Cuántos movimientos no traen dosis ni un perfil de tramos que la sustituya: lo que el coach puede arreglar.
    var movimientosSinDosis: Int {
        movimientos.filter { $0.dosis == nil && $0.perfil == nil }.count
    }

    /// El aviso de lo que falta, dicho como se lo diría un compañero de box. Nil si no falta nada.
    var avisoSinDosis: String? {
        switch movimientosSinDosis {
        case 0: return nil
        case 1: return "A 1 movimiento tu coach aún no le ha puesto cuánto. Pregúntaselo antes de empezar."
        case let n: return "A \(n) movimientos tu coach aún no les ha puesto cuánto. Pregúntaselo antes de empezar."
        }
    }

    /// El titular de una superserie: «4 rondas de la pareja». Nil si el coach no escribió las rondas.
    var titularDeLaPareja: String? {
        guard case .superserie(let rondas?, _) = forma else { return nil }
        return "\(LecturaEjercicioPrevia.rondas(rondas)) de la pareja"
    }

    /// El descanso de al acabar cada ronda de la pareja: «desc. 1:30». Nil si no se sabe o cambia de una ronda a otra.
    var descansoDeLaPareja: String? {
        guard case .superserie(_, let descanso?) = forma else { return nil }
        return "desc. \(descanso)"
    }

    /// La cifra grande de un bloque con reloj: la de su formato (AMRAP, For Time, Tabata…) o los minutos de un EMOM.
    var reloj: Reloj? {
        switch forma {
        case .reloj(let reloj):
            return reloj
        case .emom(let minutos, _):
            return Reloj(grande: minutos.map { Formato.clock($0 * 60, subMinuto: .segundos) } ?? "EMOM", pie: "EMOM")
        default:
            return nil
        }
    }

    /// Qué movimiento toca cada minuto de un EMOM, por su posición en `movimientos`: si alternan, primero el primero,
    /// luego el segundo, luego otra vez el primero. Vacío si el bloque no es un EMOM o no dice cuántos minutos son.
    var movimientoDeCadaMinuto: [Int] {
        guard case .emom(let minutos?, let alterna) = forma, minutos > 0, !movimientos.isEmpty else { return [] }
        return (0..<minutos).map { alterna ? $0 % movimientos.count : 0 }
    }

    /// Lo que se corre ANTES de la estación `i`: «Sales corriendo 1 km» y, entre estación y estación, «Corres 1 km».
    func carreraAntesDeLaEstacion(_ i: Int) -> String? {
        guard case .estaciones(let carrera) = forma else { return nil }
        return i == 0 ? "Sales corriendo \(carrera)" : "Corres \(carrera)"
    }
}

// MARK: - Un movimiento

extension MovimientoFicha {

    /// Lo que se lee a la derecha de una fila (o bajo la dosis de una tarjeta): la dosis y, debajo, contra qué.
    struct Columna: Equatable {
        let principal: String?
        let zona: HRZone?
        let contra: String?

        /// La zona y, si la hay, el ritmo o la carga: «Z2 · @ 5:30/km». Nil si no se dice ninguna de las dos.
        var segundaLinea: String? {
            let partes = [zona?.label, contra].compactMap { $0 }
            return partes.isEmpty ? nil : partes.joined(separator: " · ")
        }

        /// Todo en una sola línea, apagada: lo que enseña una fila de calentamiento («5:00 · RPE 3»).
        var enUnaLinea: String? {
            let partes = [principal, segundaLinea].compactMap { $0 }
            return partes.isEmpty ? nil : partes.joined(separator: " · ")
        }
    }

    /// La columna de la fila. Un perfil de tramos manda («16 × 500 m»); en Dobles, la dosis grande es TU parte y debajo va
    /// el total; si la estación la hace tu pareja no hay dosis, solo quién la hace. Si no, la dosis escrita, que NO se
    /// inventa: sin dosis la fila enseña el nombre solo.
    var columna: Columna {
        if let perfil {
            let trabajo = perfil.repeticiones > 1 ? "\(perfil.repeticiones) \(Formato.signoPor) \(perfil.medida)" : perfil.medida
            return Columna(principal: trabajo, zona: perfil.zona, contra: perfil.ritmo)
        }
        switch reparto {
        case let .mitad(tuParte, total)?:
            return Columna(principal: tuParte, zona: nil, contra: "de \(total)")
        case let .suya(nombre)?:
            return Columna(principal: nil, zona: nil, contra: "Lo hace \(nombre ?? "tu pareja")")
        case .tuya?, nil:
            return Columna(principal: dosis, zona: zona, contra: contra)
        }
    }

    /// La columna de una FILA. Con las cargas de una rampa en su propia línea (`lineaDeSeries`) la derecha dice solo la dosis: no
    /// repite «60 → 80 kg» encima de «60 · 70 · 80 · 80 · 80 kg».
    var columnaDeFila: Columna {
        let c = columna
        return series.isEmpty ? c : Columna(principal: c.principal, zona: c.zona, contra: nil)
    }

    /// La hace tu pareja: la fila se enseña apagada, porque no te toca.
    var esDeLaPareja: Bool {
        if case .suya? = reparto { return true }
        return false
    }

    // MARK: Las series, una a una

    /// Las repeticiones que comparten TODAS las series cuando solo cambia la carga («5 reps»). Se dicen una vez y las
    /// fichas llevan solo los kilos. Nil si las series difieren también en el trabajo.
    var trabajoComun: String? {
        guard series.count > 1, let primero = series.first?.trabajo, series.allSatisfy({ $0.trabajo == primero }) else { return nil }
        return primero
    }

    /// Lo que dice cada ficha de serie: solo la carga si las repeticiones son las mismas; si no, trabajo y carga.
    var fichasDeSeries: [String] {
        let soloCarga = trabajoComun != nil
        return series.map { serie in
            soloCarga
                ? (serie.carga ?? serie.trabajo ?? "")
                : [serie.trabajo, serie.carga].compactMap { $0 }.joined(separator: " · ")
        }
    }

    /// Las series de una rampa en UNA línea, con la unidad una sola vez cuando es la misma: «60 · 70 · 80 · 80 · 80 kg». Es lo que
    /// enseña una fila (una tarjeta las enseña una a una). Nil si las series son todas iguales.
    var lineaDeSeries: String? {
        let textos = fichasDeSeries
        guard textos.count > 1 else { return nil }
        let partes = textos.map { $0.split(separator: " ").map(String.init) }
        if partes.allSatisfy({ $0.count == 2 }), let unidad = partes.first?.last, partes.allSatisfy({ $0.last == unidad }) {
            return partes.map { $0[0] }.joined(separator: " · ") + " " + unidad
        }
        return textos.joined(separator: " · ")
    }

    /// La frase que explica por qué las fichas llevan solo kilos: «Cada serie, 5 reps».
    var notaDeSeries: String? { trabajoComun.map { "Cada serie, \($0)" } }
}

// MARK: - El perfil de una carrera por tramos

/// Lo que se dibuja de una carrera o un ergo por tramos. No es un gráfico de datos (antes de correr no hay ritmos
/// medidos): es la FORMA de lo que el coach dictó, que es lo que un «16 × 500 m» no deja ver.
extension MovimientoFicha.Perfil {

    struct Barra: Equatable {
        /// 0…1 sobre el alto del dibujo.
        let alto: Double
        /// La zona del trabajo; la recuperación no la lleva.
        let zona: HRZone?
        /// Una recuperación se dibuja baja y atenuada.
        let esRecuperacion: Bool
    }

    /// Una barra por tramo: el trabajo alto, la recuperación baja, y algo más alta si se trota que si se para.
    var barras: [Barra] {
        (0..<repeticiones).flatMap { _ -> [Barra] in
            var tramo = [Barra(alto: AltoDeBarra.trabajo(zona), zona: zona, esRecuperacion: false)]
            if recuperacion != nil {
                tramo.append(Barra(alto: recuperacionActiva ? AltoDeBarra.trotando : AltoDeBarra.parado, zona: nil, esRecuperacion: true))
            }
            return tramo
        }
    }

    struct Dato: Equatable {
        let etiqueta: String
        let valor: String
    }

    /// Lo que dice el perfil como pares «Ritmo · 4:10/km»: se lee de un vistazo, no como una frase.
    var datos: [Dato] {
        var datos: [Dato] = []
        if let ritmo {
            datos.append(Dato(etiqueta: "Ritmo", valor: ritmo.replacingOccurrences(of: "^@\\s*", with: "", options: .regularExpression)))
        }
        if let zona {
            datos.append(Dato(etiqueta: "Zona", valor: zona.label))
        }
        if let recuperacion {
            let sinLaPalabra = recuperacion.replacingOccurrences(of: "^(recuperación|descanso)\\s*", with: "", options: [.regularExpression, .caseInsensitive])
            datos.append(Dato(etiqueta: recuperacionActiva ? "Recuperas" : "Descansas", valor: sinLaPalabra))
        }
        return datos
    }

    /// Lo que lee VoiceOver del dibujo: «6 series de 800 m, recuperación 1:30 suave».
    var descripcion: String {
        "\(repeticiones) series de \(medida)" + (recuperacion.map { ", \($0)" } ?? "")
    }
}

/// El alto de las barras del perfil, como fracción del dibujo.
private enum AltoDeBarra {
    /// Un trabajo con zona sube con ella: la Z1 queda baja y la Z5 llena el dibujo.
    private static let base = 0.2
    private static let porZona = 0.16
    /// Un trabajo sin zona (a ritmo, a sensaciones): alto, pero sin llegar al techo de la Z5.
    private static let trabajoSinZona = 0.78
    /// La recuperación que se trota pesa más que la que se para: se sigue corriendo.
    static let trotando = 0.3
    static let parado = 0.14

    static func trabajo(_ zona: HRZone?) -> Double {
        zona.map { base + Double($0.rawValue) * porZona } ?? trabajoSinZona
    }
}
