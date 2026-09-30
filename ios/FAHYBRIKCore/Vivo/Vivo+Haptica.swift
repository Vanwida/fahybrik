import Foundation

// LA HÁPTICA — de una emisión (lo que decidió el director) a los golpes que tocan en la
// muñeca, y quién puede tocarlos.
//
// Dos cosas puras, sin WatchKit, para que se prueben sin aparato:
//   · `pulsos`: una emisión → la lista de golpes con su retraso. «Dos veces» es un tipo
//     repetido con un hueco; el reloj solo los programa.
//   · `PoliticaHaptica`: el «director activo». Con la cara nueva de correr en pantalla el
//     director es la ÚNICA fuente de vibraciones (P5: un evento, un háptico); todo lo
//     heredado (los `Haptics.*` del motor en solitario, los avisos locales de la cara de
//     siempre) consulta aquí y calla. Fuera de correr, o con la cara vieja, nadie activa
//     nada y todo suena como hasta hoy.

extension Vivo {

    /// Un golpe: qué tipo y a los cuántos segundos del primero.
    struct Pulso: Equatable {
        var haptico: HapticoWK
        var despuesS: Double
    }

    /// Mecanismo nuestro: el hueco entre dos golpes de un mismo evento. Con menos de ~0,1 s
    /// el reloj los funde en uno; con más de ~0,2 s se oyen como dos eventos. A VALIDAR EN APARATO.
    static let huecoEntreGolpesS: Double = 0.14

    /// Los golpes de una emisión: el del evento que vibra (`vibra`), repetido `veces` veces.
    /// Una emisión que no vibra (el resultado de una serie es solo voz) no lleva ninguno.
    static func pulsos(de e: Emision) -> [Pulso] {
        guard let evento = e.vibra, let v = vocabulario[evento], let h = v.haptico else { return [] }
        return (0..<Swift.max(1, v.veces)).map { Pulso(haptico: h, despuesS: Double($0) * huecoEntreGolpesS) }
    }

    /// De dónde sale una vibración: del director de la cara nueva, o de lo heredado.
    enum OrigenHaptico: Equatable {
        case director
        case heredado
    }

    /// El «director activo»: cuántas caras nuevas de correr hay en pantalla (solitario o espejo).
    /// Un contador y no un booleano: al cambiar de cara una aparece antes de que la otra se vaya.
    final class PoliticaHaptica: @unchecked Sendable {
        static let compartida = PoliticaHaptica()

        private let cerrojo = NSLock()
        private var caras = 0

        init() {}

        var directorActivo: Bool {
            cerrojo.lock(); defer { cerrojo.unlock() }
            return caras > 0
        }

        /// Una cara nueva sale a pantalla: desde ahora manda el director.
        func activar() {
            cerrojo.lock(); defer { cerrojo.unlock() }
            caras += 1
        }

        /// Esa cara se va. Nunca por debajo de cero (un `soltar` de más no deja mudo lo de siempre).
        func soltar() {
            cerrojo.lock(); defer { cerrojo.unlock() }
            caras = Swift.max(0, caras - 1)
        }

        func permite(_ origen: OrigenHaptico) -> Bool {
            origen == .director || !directorActivo
        }
    }
}
