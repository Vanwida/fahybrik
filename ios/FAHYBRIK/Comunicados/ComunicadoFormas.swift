import Foundation

// LAS FORMAS DE UNA NOTA — y el comunicado al que ésta apunta.
//
// Un briefing es prosa, pero su ESTRUCTURA no: cada sección sabe cómo se pinta,
// y por eso una cifra sale de cifra, un reparto sale de barra y doce semanas
// salen de espina. El fallo que esto evita es el de siempre — meter «1:15 a
// 1:18», «3 duras, 2 moderadas y 1 de absorción» y la estructura del ciclo en
// el mismo párrafo gris: son tres cosas distintas, se leen en tres momentos
// distintos, y el atleta vuelve a la del medio en octubre sin querer releer las
// otras dos.
//
// Contrato: `shared/domain/coach-communications-dto.ts` (migración 0163).
// MECANISMO vs MÉTODO: las cuatro formas son mecanismo y viven aquí; lo que el
// coach escribe dentro de cada una es su método y es dato.

// MARK: - Cómo se pinta una sección

/// Cuatro, porque un briefing real mezcla cuatro cosas:
///
///   texto   — la prosa: el porqué, lo que cambió
///   cifra   — el número que el atleta viene a buscar, en grande y en mono
///   reparto — una PROPORCIÓN, que se lee de un vistazo en una barra
///   camino  — por dónde va a pasar: NO se teclea, se resuelve con SU plan
///
/// Es propiedad de la SECCIÓN y no de la nota (una nota mezcla las cuatro), y
/// fuera de una nota es inerte: un paso de protocolo y una opción de pregunta
/// llegan como `texto` y nadie lo mira.
enum ComunicadoForma: String, CaseIterable {
    case texto
    case cifra
    case reparto
    case camino

    /// Lo que llega por el cable, con dos tolerancias que no son lo mismo:
    ///
    /// · AUSENTE — una sección de antes de la 0163 (y las que sigue mandando la
    ///   propia app) es exactamente lo que era: `texto`.
    /// · DESCONOCIDA — una forma que este binario no conoce todavía. También
    ///   `texto`, y NO se descarta la sección: un briefing al que le falta un
    ///   capítulo se lee como si el coach no lo hubiera escrito, y eso es peor
    ///   que enseñarlo con la forma pobre.
    init(cable: String?) {
        self = cable.flatMap(ComunicadoForma.init(rawValue:)) ?? .texto
    }

    /// ¿Se teclea su contenido? El reparto ES sus segmentos y el camino ES el
    /// plan del atleta: en los dos, `content` llega vacío a propósito.
    var seTeclea: Bool {
        switch self {
        case .texto, .cifra: return true
        case .reparto, .camino: return false
        }
    }
}

// MARK: - Un trozo de reparto

/// Cuánto pesa una parte y cómo se llama. El color NO viaja: sale de su sitio en
/// la barra, porque un catálogo de intensidades («dura», «moderada») sería el
/// vocabulario de un entrenador metido en el producto.
struct TrozoReparto: Codable, Equatable, Identifiable {
    var id: Int { position }
    let position: Int
    let valueNum: Double
    let label: String

    /// El peso, en la voz de la app: sin decimal cuando es redondo y con coma
    /// cuando no («3», «2,5»).
    var cantidad: String { Formato.esDecimal(valueNum) }
}

// MARK: - El comunicado enlazado

/// El comunicado que le falta a éste para cerrarse, tal y como se enseña en su
/// pie. Uno, no varios: un briefing que apuntara a cinco sitios ya no diría
/// «esto es lo que queda pendiente», sería un índice.
struct ComunicadoEnlazado: Codable, Equatable, Identifiable {
    let id: String
    /// Nulo si el servidor manda un tipo que este binario no conoce. Se decide
    /// aquí y no dejando caer la fila: perder el enlace es perder un chip;
    /// dejar caer la fila es perder la nota entera de la bandeja.
    let kind: ComunicadoTipo?
    let title: String
    let blocks: Bool
    /// MI estado con él. Nulo cuando no hay un atleta delante (la lista del
    /// coach): un comunicado publicado a ocho no tiene UN estado.
    let state: ComunicadoEstado?

    /// ¿Ya lo he resuelto? Es lo que convierte el pie de llamada a la acción en
    /// recibo de lo que decidí.
    var resuelto: Bool { state == .hecho || state == .respondido }

    /// ¿Sigue reteniendo algo del plan? Un bloqueo ya resuelto no bloquea.
    var bloqueaTodavia: Bool { blocks && !resuelto }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try? c.decode(ComunicadoTipo.self, forKey: .kind)
        title = try c.decode(String.self, forKey: .title)
        blocks = (try? c.decode(Bool.self, forKey: .blocks)) ?? false
        state = try? c.decode(ComunicadoEstado.self, forKey: .state)
    }

    init(id: String, kind: ComunicadoTipo?, title: String, blocks: Bool, state: ComunicadoEstado?) {
        self.id = id
        self.kind = kind
        self.title = title
        self.blocks = blocks
        self.state = state
    }
}

extension ComunicadoEnlazado {
    /// La línea bajo el título, en la voz del atleta. Sin responder es una
    /// llamada a la acción; resuelto no desaparece, se convierte en el recibo de
    /// lo que decidió — en octubre va a querer saber sobre qué está montado su
    /// plan.
    var linea: String {
        switch kind {
        case .pregunta:
            if resuelto { return "Ya la contestaste." }
            return bloqueaTodavia
                ? "Hasta que la contestes, esa parte de tu plan se queda a la espera."
                : "Te falta contestarla."
        case .tarea:
            if resuelto { return "Ya la cerraste." }
            return bloqueaTodavia
                ? "Hasta que la cierres, esa parte de tu plan se queda a la espera."
                : "Te falta cerrarla."
        case .protocolo:
            return resuelto ? "Ya lo has hecho." : "Te falta hacerlo."
        case .nota, .foco, nil:
            return resuelto ? "Ya lo has leído." : "Te falta leerlo."
        }
    }
}

// MARK: - Lo que una sección sabe de sí misma

extension ComunicadoItem {
    /// La forma con la que se pinta, ya resuelta y tolerante.
    var forma: ComunicadoForma { ComunicadoForma(cable: display) }

    /// ¿Hay algo que pintar? Una sección sin su dato no se dibuja VACÍA: se
    /// salta entera. Un camino sin plan o un reparto sin trozos dejarían una
    /// tarjeta con cabecera y nada debajo, que se lee como un capítulo en
    /// blanco — y lo que pasa es que ese atleta aún no tiene plan.
    var tieneAlgoQuePintar: Bool {
        switch forma {
        case .texto, .cifra:
            return !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .reparto:
            return trozos.contains { $0.valueNum > 0 }
        case .camino:
            return !(camino?.estaVacio ?? true)
        }
    }

    /// Los trozos que de verdad pesan algo, en su orden. Un trozo de peso cero
    /// no es un trozo: es una parte que no existe ocupando sitio en la barra.
    var trozos: [TrozoReparto] {
        segments.filter { $0.valueNum > 0 }.sorted { $0.position < $1.position }
    }

    /// Una cifra partida en sus dos extremos, cuando es una BANDA («1:15 a
    /// 1:18»). Nil cuando es un número solo.
    ///
    /// Los dos extremos tienen que ser cortos y llevar un número: sin eso, «de 3
    /// a 5 series por bloque» se partiría en dos cifras que no lo son. Es la
    /// misma regla que la previa del coach, y tiene que serlo — si no, él
    /// aprobaría una nota que en el móvil del atleta se lee distinta.
    var bandaDeLaCifra: (desde: String, hasta: String)? {
        Self.banda(content.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// El separador, carácter por carácter el mismo patrón que la previa del
    /// coach: dos extremos de 12 caracteres como mucho unidos por un «a»
    /// suelto. Más largo que eso ya no es una cifra, es una frase con un «a»
    /// dentro. Se escribe igual en los dos sitios a propósito — si aquí se
    /// partiera con otra regla, él aprobaría una banda que en este móvil sale
    /// como una frase.
    private static let separadorBanda = try? NSRegularExpression(
        pattern: #"^(.{1,12}?)\s+a\s+(.{1,12})$"#
    )

    static func banda(_ cifra: String) -> (desde: String, hasta: String)? {
        guard let regla = separadorBanda else { return nil }
        let texto = cifra as NSString
        guard let m = regla.firstMatch(in: cifra, range: NSRange(location: 0, length: texto.length)),
              m.numberOfRanges == 3
        else { return nil }
        let desde = texto.substring(with: m.range(at: 1))
        let hasta = texto.substring(with: m.range(at: 2))
        // Los dos lados tienen que llevar un número: sin esto, «de 3 a 5 series
        // por bloque» se partiría en dos cifras que no lo son.
        guard desde.rangeOfCharacter(from: .decimalDigits) != nil,
              hasta.rangeOfCharacter(from: .decimalDigits) != nil
        else { return nil }
        return (desde, hasta)
    }
}

extension Comunicado {
    /// Las secciones que se pintan. Una sección cuyo dato no ha llegado se salta
    /// ENTERA, sin hueco: un atleta sin plan no tiene por qué ver el sitio donde
    /// iría su camino.
    var seccionesVisibles: [ComunicadoItem] { items.filter(\.tieneAlgoQuePintar) }
}
