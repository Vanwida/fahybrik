#if DEBUG
import SwiftUI

// EL ESCAPARATE: ver la pantalla REAL del reloj sin tener que entrenar.
//
// Por qué existe: un cuadro es una función pura y sus tests dicen que devuelve lo correcto, pero NO dicen cómo
// se ve un `73:00` sobre el bisel, ni si «te pasas · afloja» cabe en su fila. Eso sólo se ve mirando la muñeca, y
// llegar a la muñeca exige crear un entreno, arrancarlo desde el móvil y hacer la primera serie. Una pantalla
// que sólo se puede mirar entrenando es una pantalla que no se mira.
//
// Con esto, cada caso de diseño se abre en un toque:
//
//     xcrun simctl launch <sim> com.fahybrid.app.watchkitapp -guion muneca-serie-dentro
//     xcrun simctl io <sim> screenshot serie.png
//
// Sólo en DEBUG y sólo con el argumento: la app de verdad no lo ve ni lo compila en release. Cada caso pinta con
// las MISMAS vistas del entreno (la pila de la muñeca, `MunecaVivo`), así que el escaparate no puede enseñar una
// pantalla que el cuadro no produzca.

enum GuionEscaparate {

    /// El argumento que enciende el escaparate, y el id del caso a pintar.
    static let bandera = "-guion"

    static var casoPedido: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: bandera), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    /// Un caso: su id para la línea de comandos y lo que pinta.
    struct Caso {
        let id: String
        let titulo: String
        let vista: () -> AnyView
    }

    // MARK: - El catálogo

    static let casos: [Caso] = munecaCorrer + munecaEspejo

    static func caso(_ id: String) -> Caso? { casos.first { $0.id == id } }
}

/// El lienzo del escaparate: la MISMA pila que pinta el entreno de verdad. Si aquí se ve mal, se ve mal en la muñeca.
struct GuionEscaparateView: View {
    let caso: GuionEscaparate.Caso

    var body: some View { caso.vista() }
}
#endif
