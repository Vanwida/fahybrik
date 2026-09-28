import Foundation

// LA ENTRADA A UN PASO Y LO QUE DEPENDE DEL ENLACE — funciones PURAS, espejo de
// `kit-reloj/secuencia.ts` (`cuentaDe`, `entraConCuenta`, el preaviso y el GO de
// la transición) y de lo que en el doble es el plan «sin máquina»
// (`screens/iphone-vivo-ergo/planes.ts#planRemoSeries(false)`).
//
// El motor de hoy (`WorkoutSession`) solo cuenta 3-2-1 al arrancar un bloque;
// entre una recuperación y la serie siguiente no cuenta ni dice GO. Estas reglas
// lo deciden desde el estado, sin tocar el motor: el pintor las lee.

extension Vivo {

    // MARK: - 3-2-1 y GO (I7: la recuperación es fase común)

    /// ¿Se entra al siguiente paso con cuenta atrás? Solo al entrar en un paso de
    /// TRABAJO de la parte principal desde algo que no lo es.
    static func entraConCuenta(_ p: Paso, _ sig: Paso?) -> Bool {
        guard let sig else { return false }
        return sig.rol == .trabajo && sig.fase == .principal && (p.rol != .trabajo || p.fase != .principal)
    }

    /// La cuenta atrás a pantalla completa del final de un paso de tiempo que
    /// entra en trabajo: 3, 2, 1 o nil. Devuelve también el paso al que se entra
    /// (la cuenta enseña lo que VIENE, no lo que acaba).
    static func cuentaDeEntrada(_ pasos: [Paso], _ i: Int, _ l: Lecturas) -> (n: Int, paso: Paso)? {
        guard pasos.indices.contains(i), i + 1 < pasos.count else { return nil }
        let p = pasos[i]
        let sig = pasos[i + 1]
        guard p.medida.tipo == .tiempo, entraConCuenta(p, sig), let f = faltaDe(p, l), f > 0, f <= 3 else { return nil }
        return (Int(f.rounded(.up)), sig)
    }

    /// ¿Se enseña «GO» al pasar de `p` a `sig`? Al entrar en trabajo de la parte
    /// principal desde algo que no es trabajo, o cuando el trabajo lo cerró el atleta.
    static func veGo(desde p: Paso, hacia sig: Paso, cerroElAtleta: Bool) -> Bool {
        sig.rol == .trabajo && sig.fase == .principal && (p.rol != .trabajo || cerroElAtleta)
    }

    // MARK: - El preaviso (10 s / 100 m, dato del coach)

    /// Lo que falta cuando toca preavisar este paso, o nil. Solo en pasos que no
    /// son cortos (`preavisoMinimoS`, 4 × `preavisoM`). Quien lo emite recuerda
    /// que ya sonó: suena UNA vez por paso.
    static func preavisoDe(_ p: Paso, _ l: Lecturas, _ reglas: ReglasAviso) -> Double? {
        guard let f = faltaDe(p, l), f > 0 else { return nil }
        let pr = p.medida.prescrito ?? 0
        if p.medida.tipo == .tiempo, f <= reglas.preavisoS, pr >= reglas.preavisoMinimoS { return reglas.preavisoS }
        if p.medida.tipo == .distancia, f <= reglas.preavisoM, pr >= 4 * reglas.preavisoM { return reglas.preavisoM }
        return nil
    }

    // MARK: - Sin la máquina: lo dices tú

    /// El plan, con lo que mide la máquina pasado al atleta cuando esa máquina no
    /// está enlazada: los metros y las calorías «los dices tú» y la serie la
    /// cierras tú («Serie hecha»). Lo que mide el reloj (un continuo por tiempo)
    /// no cambia. Una máquina que estaba y se ha perdido NO entra aquí: sigue
    /// siendo suya, con sus datos marcados viejos («—»).
    static func segunEnlace(_ plan: PlanVivo, maquina enlazada: Maquina.Tipo?) -> PlanVivo {
        var out = plan
        out.pasos = plan.pasos.map { p in
            guard let m = p.maquina?.tipo, m != .cinta, m != enlazada, p.medida.mide == .ergo else { return p }
            var q = p
            q.medida.mide = .atleta
            q.cierre = .atleta
            return q
        }
        return out
    }

    // MARK: - El nombre de la máquina en la cabecera

    /// Los nombres de catálogo que, en un paso de máquina, solo dicen «la máquina
    /// genérica» en otro idioma: en la cabecera va el nombre de box («Remo»), no
    /// «Row Erg». Un nombre propio («SkiErg», «BikeErg», «Remo 2K del club») se
    /// respeta. Normalizados: minúsculas, sin espacios, guiones ni acentos.
    static let nombresGenericosMaquina: [Maquina.Tipo: Set<String>] = [
        .remo: ["rowerg", "row", "rowing", "rower", "rowingmachine", "rowergometer", "concept2", "concept2row", "concept2rower",
                "remo", "remoergometro", "ergometroderemo", "ergometro"],
    ]

    /// El nombre del paso de máquina para la cabecera: nil si el de catálogo solo
    /// dice la máquina genérica y el box la llama de otra forma (entonces se usa
    /// `nombreMaquinaCorto`). «SkiErg» y «BikeErg» son palabra de box: se quedan.
    static func nombreDeBox(_ nombre: String?, _ m: Maquina?) -> String? {
        guard let nombre, let m, let genericos = nombresGenericosMaquina[m.tipo] else { return nombre }
        let clave = nombre.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "es"))
            .lowercased().filter { $0.isLetter || $0.isNumber }
        return genericos.contains(clave) ? nil : nombre
    }
}
