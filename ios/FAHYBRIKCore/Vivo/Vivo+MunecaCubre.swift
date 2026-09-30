import Foundation

// QUÉ FAMILIAS PINTA LA CARA NUEVA DE LA MUÑECA — UNA regla, para el reloj en solitario y para el espejo.
//
// La cara nueva (`Vivo.cuadroMuneca`) cubre tres familias: CORRER (calle, cinta, pista, series, la carrera de un
// circuito), FUERZA (series con su ficha, superserie, «Colócate», el descanso que anota) y ERGO (remo, ski y bici
// sueltos, no una estación de ruta). Lo demás (EMOM, AMRAP, For Time, las estaciones y la Roxzone de un circuito,
// dobles, movilidad, el reloj de pared) sigue con su cara de siempre hasta que le toque.
//
// La pregunta se hace por PASO, con el bloque de contexto: un descanso o una recuperación son de la familia del
// trabajo que los rodea (el descanso tras una serie de fuerza es de fuerza; el de tras una estación, no).

extension Vivo {

    enum FamiliaMuneca: Equatable { case correr, fuerza, ergo }

    /// El paso de trabajo que dice de qué familia es el bloque de `pasos[i]`: él mismo si trabaja; si no, el de trabajo
    /// anterior del mismo segmento del motor (o el siguiente, al empezar el bloque).
    private static func pasoDeReferencia(_ pasos: [Paso], _ i: Int) -> Paso? {
        let p = pasos[i]
        if p.rol == .trabajo { return p }
        let segmento = p.origen?.segmento
        let delBloque: (Paso) -> Bool = { $0.rol == .trabajo && $0.origen?.segmento == segmento }
        return pasos[..<i].last(where: delBloque) ?? pasos[(i + 1)...].first(where: delBloque)
    }

    /// La familia que la cara nueva pinta en `pasos[i]`, o `nil` si sigue con la de siempre.
    static func familiaMuneca(_ pasos: [Paso], _ i: Int) -> FamiliaMuneca? {
        guard pasos.indices.contains(i), let ref = pasoDeReferencia(pasos, i), ref.wod == nil, ref.dobles == nil, !esRelevo(pasos[i]) else { return nil }
        switch familiaDe(ref) {
        case .correr, .cinta: return .correr
        case .fuerza: return esFuerza(ref) ? .fuerza : nil
        // Una máquina suelta; la estación de una ruta (HYROX, circuito) es de otra familia.
        case .remo, .ski, .bici: return ref.clase == .estacion ? nil : .ergo
        default: return nil
        }
    }

    /// ¿Pinta la cara nueva este bloque? Es `familiaMuneca` para quien solo quiere el sí o el no.
    static func cubreLaMuneca(_ pasos: [Paso], _ i: Int) -> Bool { familiaMuneca(pasos, i) != nil }
}
