import Foundation

// LOS DOBLES EN EL VIVO — el turno de cada estación, como DATO del paso.
//
// El motor ya decide quién hace cada estación (`SegmentDoblesSplit`, #23): toda
// tuya, toda de tu pareja (tú esperas y recuperas) o repartida por reps. El vivo
// no decide nada de eso; lo LEE y lo pinta con la anatomía de siempre:
//   · cabecera   el turno y la pareja («Dobles · le toca a Marta»);
//   · sujeto     en la espera, lo que llevas esperando (tu salida no la mide nadie:
//                ni el reloj ni el móvil ven a tu pareja, `watch-dobles/guion.ts`);
//   · primaria   «Relevo»: el cambio lo declara SIEMPRE el atleta.
//
// La estación de la pareja es UN paso (el motor la salta entera con
// `advanceRelay`, sin grabar nada tuyo). En una repartida, la dosis del paso es
// TU parte (`prescribedRepsForLog`), no la estación entera.

extension Vivo {

    struct Dobles: Equatable {
        enum Turno: String, Equatable { case tuyo, pareja, reparto }
        var turno: Turno
        /// El nombre de pila de la pareja. `nil` → «tu pareja» (nunca se inventa).
        var pareja: String?
        /// La estación tal como la nombra el coach («SkiErg 1km»).
        var estacion: String
        /// Tus reps y las suyas, solo si la estación tiene un total de reps.
        var tuyas: Int? = nil
        var suyas: Int? = nil
        /// Tu parte, 0…100 (la barra del reparto sin reps).
        var pctTuyo: Int = 100
        /// El pacto del coach («alterna 250m»).
        var nota: String? = nil
    }

    /// El turno del segmento, del lado del atleta que mira. `nil` = trabajo individual.
    static func doblesDe(_ seg: WorkoutSegment) -> Dobles? {
        guard let split = seg.doblesSplit, let t = seg.doblesTurn else { return nil }
        let turno: Dobles.Turno
        switch split.role {
        case .mine: turno = .tuyo
        case .partner: turno = .pareja
        case .split: turno = .reparto
        }
        let nombre = t.partnerName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let nota = t.note?.trimmingCharacters(in: .whitespacesAndNewlines)
        return Dobles(turno: turno, pareja: (nombre?.isEmpty == false) ? nombre : nil, estacion: t.station,
                      tuyas: t.selfReps, suyas: t.partnerReps, pctTuyo: t.selfSharePct,
                      nota: (nota?.isEmpty == false) ? nota : nil)
    }

    /// Cómo se llama a la pareja en pantalla.
    static func nombrePareja(_ d: Dobles) -> String { d.pareja ?? "tu pareja" }

    /// ¿Es la estación de la pareja (tú esperas y das el relevo)?
    static func esRelevo(_ p: Paso) -> Bool { p.dobles?.turno == .pareja }

    /// El turno en palabras, para la cabecera y la Estructura.
    static func textoTurno(_ d: Dobles) -> String {
        switch d.turno {
        case .tuyo: return "te toca"
        case .pareja: return "le toca a \(nombrePareja(d))"
        case .reparto: return "con \(nombrePareja(d))"
        }
    }

    /// La parte de la cabecera que dice el turno: «Dobles · le toca a Marta».
    static func formatoDobles(_ d: Dobles) -> String { "Dobles · \(textoTurno(d))" }

    /// El pacto de una estación repartida, en una línea («Tú 50 · Marta 50 · alterna 250m»).
    /// `nil` fuera de un reparto: una estación entera ya la dice el turno.
    static func pactoDe(_ d: Dobles) -> String? {
        guard d.turno == .reparto else { return nil }
        let quien = nombrePareja(d)
        let quienMayus = quien.prefix(1).uppercased() + quien.dropFirst()
        var partes: [String]
        if let t = d.tuyas, let s = d.suyas { partes = ["Tú \(t)", "\(quienMayus) \(s)"] }
        else { partes = ["Tú \(d.pctTuyo) %", "\(quienMayus) \(100 - d.pctTuyo) %"] }
        if let n = d.nota { partes.append(n) }
        return partes.joined(separator: " · ")
    }

    /// El paso de la estación de la pareja: esperas (recuperas) y lo cierras tú con
    /// «Relevo». No se mide nada tuyo: la medida es abierta y la cierra el atleta.
    static func pasoRelevo(_ d: Dobles, id: String, fase: Fase, bloque: Int, origen: Origen) -> Paso {
        Paso(id: id, clase: .recuperacion, rol: .recuperacion, fase: fase,
             medida: Medida(tipo: .abierta, prescrito: nil, mide: .atleta),
             nombre: d.estacion, cierre: .atleta, bloque: bloque, dobles: d, origen: origen)
    }

    /// Los pasos de un segmento de dobles: la estación de la pareja es UN relevo; la
    /// tuya o la repartida llevan su turno, y en la repartida la dosis en reps es TU parte.
    static func conDobles(_ pasos: [Paso], _ d: Dobles, segmento s: Int) -> [Paso] {
        if d.turno == .pareja {
            let primero = pasos.first
            return [pasoRelevo(d, id: "s\(s)", fase: primero?.fase ?? .principal, bloque: primero?.bloque ?? s,
                               origen: Origen(segmento: s, ventana: .segmento))]
        }
        return pasos.map { p in
            var q = p
            q.dobles = d
            if d.turno == .reparto, p.rol == .trabajo, p.medida.tipo == .reps, let t = d.tuyas { q.medida.prescrito = Double(t) }
            return q
        }
    }

    /// El héroe de la espera: lo que llevas esperando. Tu salida no se estima (nadie
    /// mide a tu pareja), así que no se promete una cuenta atrás.
    static func heroeRelevo(_ l: Lecturas) -> HeroeVista {
        HeroeVista(clase: .crono, texto: fmtReloj(l.t), etiqueta: "recuperas")
    }

    /// La nota de honestidad bajo el héroe de la espera.
    static let notaRelevo = "el relevo lo dices tú"
}
