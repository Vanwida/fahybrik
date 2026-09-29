import Foundation

// LA BANDERA DE LA CARA NUEVA DE CORRER — el vuelta-atrás de TestFlight.
//
// Encendida (el defecto), el reloj en solitario corre con la pila de la muñeca
// (`MunecaVivo`: Controles | Paso · Datos · Vueltas · Estructura | Ahora suena).
// Apagada, todo vuelve EXACTAMENTE a lo de hoy (Datos | Vivo | Controles con la
// lámina `RodajeLamina`). Mientras exista la bandera lo viejo se queda; se retira
// (F8) tras probar en aparato.
//
// Es un interruptor de la app, no un ajuste del atleta: no tiene pantalla. Se
// apaga escribiendo la clave en los ajustes de la app, o, en DEBUG, lanzando con
// `--muneca-correr-off`.

enum MunecaBandera {

    /// La clave con el espacio de nombres del proyecto (como el resto de las del reloj).
    static let clave = "fahybrik.watch.munecaCorrer.v1"

    /// El argumento de lanzamiento que la apaga (solo DEBUG): `simctl launch … --muneca-correr-off`.
    static let argumentoApagar = "--muneca-correr-off"

    static var encendida: Bool {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains(argumentoApagar) { return false }
        #endif
        return UserDefaults.standard.object(forKey: clave) as? Bool ?? true
    }

    static func poner(_ encendida: Bool) {
        UserDefaults.standard.set(encendida, forKey: clave)
    }
}
