import Foundation

// LA CUENTA ATRÁS DE ENTRADA Y EL GO — funciones PURAS, espejo de
// `kit-reloj/secuencia.ts#cuentaDe` y del `goHasta` de `avanzar`.
//
// Se entra con cuenta a la parte principal desde algo que no es trabajo
// principal (una recuperación, un descanso, el calentamiento): los últimos 3 s
// de ese paso, a pantalla completa, con lo que VIENE. Y el primer segundo del
// trabajo que entra, el GO. De trabajo a trabajo (el progresivo) no se corta:
// ni cuenta ni GO en pantalla, solo háptico y voz.
//
// La cuenta de arranque del motor (`isTramoCountIn`) sigue mandando cuando la
// hay; esto cubre la de ENTRE pasos, que el motor no pinta.

extension Vivo {

    /// ¿Se entra en `sig` con cuenta desde `p`?
    static func entraConCuenta(_ p: Paso, _ sig: Paso?) -> Bool {
        guard let sig else { return false }
        return sig.rol == .trabajo && sig.fase == .principal && (p.rol != .trabajo || p.fase != .principal)
    }

    /// 3, 2 o 1 en los últimos segundos de un paso por tiempo que entra con cuenta; `nil` si no.
    static func cuentaDe(_ pasos: [Paso], _ i: Int, _ l: Lecturas) -> Int? {
        guard pasos.indices.contains(i) else { return nil }
        let p = pasos[i]
        guard p.medida.tipo == .tiempo, entraConCuenta(p, i + 1 < pasos.count ? pasos[i + 1] : nil), let f = faltaDe(p, l) else { return nil }
        return f > 0 && f <= 3 ? Int(f.rounded(.up)) : nil
    }

    /// Lo que dura el GO en pantalla al entrar en el trabajo (s).
    static let duracionGoS: Double = 1

    /// El GO: el primer segundo de un trabajo principal al que se entró con cuenta.
    static func goDe(_ pasos: [Paso], _ i: Int, _ l: Lecturas) -> Bool {
        guard i > 0, pasos.indices.contains(i) else { return false }
        return entraConCuenta(pasos[i - 1], pasos[i]) && l.t < duracionGoS
    }
}
