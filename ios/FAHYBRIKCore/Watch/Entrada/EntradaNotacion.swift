import Foundation

// LA NOTACIÓN DE LA ENTRADA DEL RELOJ — cómo se escribe cada dosis y cada objetivo
// en el brief, en una sola grafía.
//
// Espejo de `web/components/design-twin/kit-reloj/reglas.ts` (`fmtDuracion`,
// `fmtPrescrito`, `textoObjetivo`): «10′», «2′30″», «800 m», «a 3:45–3:55», «a Z5»,
// «RPE 8». Sin «@» (la grafía del teléfono en la ficha larga): en la muñeca el
// objetivo se escribe con un «a» y solo así.
//
// Foundation puro y sin vistas: compila en los dos targets y se prueba desde
// FAHYBRIKTests. Una cifra y su unidad van pegadas con un espacio duro (U+00A0)
// para que la línea se parta ENTRE datos y no a mitad de uno.

enum EntradaNotacion {

    /// Espacio duro: la cifra y su unidad no se separan al partir la línea.
    static let duro = "\u{00A0}"
    /// «6 × 800 m»: el signo va pegado a sus dos lados.
    static let por = "\u{00A0}\(Formato.signoPor)\u{00A0}"

    /// Une un fragmento (una dosis, un objetivo) para que la línea no lo parta: los
    /// espacios pasan a duros y el guion de un rango («3:45–3:55») se ata con un
    /// «word joiner» (U+2060), porque el guion medio es un sitio donde el texto parte.
    static func pegado(_ texto: String) -> String {
        texto
            .replacingOccurrences(of: " ", with: duro)
            .replacingOccurrences(of: "–", with: "\(unido)–\(unido)")
    }

    /// U+2060: invisible, prohíbe partir la línea por ese punto.
    static let unido = "\u{2060}"

    /// «3:45–3:55» sin que se parta a mitad del rango.
    static func rango(_ a: String, _ b: String) -> String { "\(a)\(unido)–\(unido)\(b)" }

    // MARK: - Medidas

    /// «20″», «90″», «1′», «2′30″», «50′» — la duración como se escribe en la pista.
    static func duracion(_ segundos: Int) -> String {
        if segundos < 60 || (segundos <= 90 && segundos % 60 != 0) { return "\(segundos)″" }
        let m = segundos / 60, r = segundos % 60
        return r == 0 ? "\(m)′" : "\(m)′" + String(format: "%02d″", r)
    }

    /// «800 m», «1000 m», «5 km», «10,5 km». La pista se escribe en metros hasta los
    /// 5 km; por encima, en kilómetros.
    static func distancia(_ metros: Int) -> String {
        if metros >= 5_000 {
            return pegado(Formato.esDecimal(Double(metros) / 1000) + " km")
        }
        return "\(metros)\(duro)m"
    }

    static func medida(_ m: RunSegmentMeasure) -> String? {
        switch m {
        case let .distance(metros): return metros > 0 ? distancia(metros) : nil
        case let .duration(s):      return s > 0 ? duracion(s) : nil
        case .unknown:              return nil
        }
    }

    /// Varias medidas del MISMO tipo en una sola secuencia: «1200/1000/800 m»,
    /// «3′/2′/1′». Nil si mezclan metros y tiempo (no hay unidad que compartir).
    static func secuencia(_ medidas: [RunSegmentMeasure]) -> String? {
        let metros = medidas.compactMap { m -> Int? in
            if case let .distance(v) = m, v > 0 { return v } else { return nil }
        }
        if metros.count == medidas.count, !metros.isEmpty {
            return metros.map(String.init).joined(separator: "/") + "\(duro)m"
        }
        let tiempos = medidas.compactMap { m -> Int? in
            if case let .duration(v) = m, v > 0 { return v } else { return nil }
        }
        if tiempos.count == medidas.count, !tiempos.isEmpty {
            return tiempos.map(duracion).joined(separator: "/")
        }
        return nil
    }

    // MARK: - Objetivos

    /// «a 3:45–3:55», «a 3:50», «a Z5», «RPE 8», «RPE 7–8». Nil sin objetivo.
    static func objetivo(_ target: RunSegmentTarget?) -> String? {
        switch target {
        case let .pace(valueS, minS, maxS):
            func c(_ s: Int) -> String { Formato.ritmoCifras(Double(s)) }
            if let v = valueS, v > 0 { return "a\(duro)\(c(v))" }
            if let lo = minS, let hi = maxS, lo > 0, hi > 0 {
                return lo == hi ? "a\(duro)\(c(lo))" : "a\(duro)\(rango(c(lo), c(hi)))"
            }
            if let lo = minS, lo > 0 { return "a\(duro)\(c(lo))+" }
            if let hi = maxS, hi > 0 { return "a\(duro)\(c(hi))" }
            return nil
        case let .paceZone(z), let .hrZone(z):
            return z > 0 ? "a\(duro)Z\(z)" : nil
        case let .rpe(value, min, max):
            func n(_ d: Double) -> String { Formato.esDecimal(d) }
            if let lo = min, let hi = max {
                return lo == hi ? "RPE\(duro)\(n(lo))" : "RPE\(duro)\(rango(n(lo), n(hi)))"
            }
            if let v = value ?? min ?? max { return "RPE\(duro)\(n(v))" }
            return nil
        case .unknown, .none:
            return nil
        }
    }

    /// La dosis con su objetivo detrás: «800 m a Z5», «5′ a Z2», «50′ RPE 6».
    static func dosis(_ tramo: RunSegment) -> String? {
        guard let medida = medida(tramo.measure) else { return nil }
        guard let objetivo = objetivo(tramo.target) else { return medida }
        return "\(medida) \(objetivo)"
    }

    // MARK: - Recuperación

    /// «r 2′30″ suave a Z2»: la recuperación con su modo y su objetivo, si los tiene.
    /// `conR: false` la deja sin la «r» («5′ entre tandas» la lleva detrás).
    /// La palabra del modo es la del vivo (`RunLegDisplay`): una sola en la muñeca.
    static func recuperacion(_ tramo: RunSegment, conR: Bool = true) -> String? {
        guard let medida = medida(tramo.measure) else { return nil }
        // Solo se nombra la recuperación que SE MUEVE (suave, caminando): «r 90″» a secas
        // ya se lee como parado, y «parado» detrás sería decir lo mismo dos veces.
        let modo = tramo.recoveryMode == .parado ? "" : RunLegDisplay.recoveryModeWord(tramo.recoveryMode)
        let partes = [medida, modo.isEmpty ? nil : modo, objetivo(tramo.target)].compactMap { $0 }
        let frase = partes.joined(separator: " ")
        return conR ? "r \(frase)" : frase
    }

    // MARK: - Lo que el plan escribe por ejercicio (`Measure` / `Target`)

    /// La dosis de un ejercicio: «500 m», «5′», «12 reps», «20 cal», «8–12 reps». Con
    /// `sinUnidad` las repeticiones van sin «reps» («4 × 8»). Nil sin medida.
    static func medida(_ m: Measure?, sinUnidad: Bool = false) -> String? {
        guard let m else { return nil }
        func banda(_ suelo: String, _ techo: String?) -> String { techo.map { rango(suelo, $0) } ?? suelo }
        switch m {
        case let .reps(v, max):
            guard v > 0 else { return nil }
            let cifra = banda("\(v)", max.map(String.init))
            return sinUnidad ? cifra : "\(cifra)\(duro)\(Vocab.reps)"
        case let .distance(meters, max):
            guard meters > 0 else { return nil }
            guard let max, max > meters else { return distancia(Int(meters.rounded())) }
            return "\(rango(String(Int(meters.rounded())), String(Int(max.rounded()))))\(duro)m"
        case let .duration(seconds, max):
            guard seconds > 0 else { return nil }
            return banda(duracion(seconds), max.map(duracion))
        case let .calories(v, max):
            guard v > 0 else { return nil }
            return "\(banda("\(v)", max.map(String.init)))\(duro)cal"
        case .repsToFailure:
            return pegado(Vocab.alFallo)
        case .unknown:
            return nil
        }
    }

    /// El objetivo de un ejercicio, en la misma grafía que el de la carrera: «a Z2»,
    /// «a 3:45–3:55», «a 1:50/500m»; la carga y el esfuerzo (kg, % RM, RPE, RIR) con el
    /// formateador de la ficha, que ya es el del resto de la app.
    static func objetivo(_ t: Target?, esErg: Bool) -> String? {
        guard let t else { return nil }
        switch t {
        case let .pace(unit, valueS, minS, maxS):
            let enErg = unit == .per500m || (unit == .perKm && esErg)
            let escala = (unit == .perKm && esErg) ? 0.5 : 1.0
            func c(_ s: Int) -> String { Formato.ritmoCifras((Double(s) * escala).rounded()) }
            let unidad = enErg ? Formato.UnidadRitmo.por500m.rawValue : (unit == .perMile ? Formato.UnidadRitmo.porMilla.rawValue : "")
            if let v = valueS, v > 0 { return "a\(duro)\(c(v))\(unidad)" }
            if let lo = minS, let hi = maxS, lo > 0, hi > 0 { return "a\(duro)\(rango(c(lo), c(hi)))\(unidad)" }
            if let lo = minS, lo > 0 { return "a\(duro)\(c(lo))+\(unidad)" }
            if let hi = maxS, hi > 0 { return "a\(duro)\(c(hi))\(unidad)" }
            return nil
        case .hrZone:
            return PrescriptionRenderer.zoneFromTarget(t).map { "a\(duro)\($0.label)" }
        default:
            return PrescriptionRenderer.targetLoad(t).map(pegado)
        }
    }

    /// Un objetivo que se lee «a …»: se pega a la dosis («500 m a Z4»). La carga o el
    /// esfuerzo («100 kg», «RPE 8») van aparte, como dato propio.
    static func esRitmoOZona(_ objetivo: String) -> Bool {
        objetivo.hasPrefix("a\(duro)")
    }
}
