import Foundation

// LA CUENTA ATRÁS DE ENTRADA Y EL GO — funciones PURAS, espejo de
// `kit-reloj/secuencia.ts#cuentaDe` y del `goHasta` de `avanzar`. UNA regla para
// todas las familias (correr, ergo, fuerza, WOD, circuito): antes la llevaban
// tres copias (`cuentaHaciaFuerza`, la `entrada` del cuadro y esta).
//
// Se entra con cuenta a la parte principal desde algo que no es trabajo
// principal (una recuperación, un descanso, un «Colócate», el calentamiento):
// los últimos 3 s de ese paso, a pantalla completa, con lo que VIENE. Y el primer
// segundo del trabajo que entra, el GO. De trabajo a trabajo (el progresivo) no
// se corta: ni cuenta ni GO en pantalla, solo háptico y voz — salvo que el
// trabajo lo cerrara el atleta (`veGo(cerroElAtleta:)`, lo decide el pintor).
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

    /// La cuenta con el paso al que se entra (la cuenta enseña lo que VIENE, no lo que acaba).
    static func cuentaDeEntrada(_ pasos: [Paso], _ i: Int, _ l: Lecturas) -> (n: Int, paso: Paso)? {
        guard let n = cuentaDe(pasos, i, l) else { return nil }
        return (n, pasos[i + 1])
    }

    /// Lo que dura el GO en pantalla al entrar en el trabajo (s).
    static let duracionGoS: Double = 1

    /// ¿Se enseña «GO» al pasar de `p` a `sig`? Al entrar en trabajo de la parte
    /// principal desde algo que no es trabajo, o cuando el trabajo lo cerró el atleta.
    static func veGo(desde p: Paso, hacia sig: Paso, cerroElAtleta: Bool) -> Bool {
        sig.rol == .trabajo && sig.fase == .principal && (p.rol != .trabajo || cerroElAtleta)
    }

    /// El GO del estado: el primer segundo de un trabajo principal al que se entra
    /// desde algo que no es trabajo. Es el DISPARO: el pintor lo enseña una vez y
    /// 1 s de reloj (el reloj del paso puede estar armado o congelado y no pasar
    /// nunca de 0). El del cierre por el atleta lo añade el pintor.
    static func goDe(_ pasos: [Paso], _ i: Int, _ l: Lecturas) -> Bool {
        guard i > 0, pasos.indices.contains(i) else { return false }
        return veGo(desde: pasos[i - 1], hacia: pasos[i], cerroElAtleta: false) && l.t < duracionGoS
    }
}
