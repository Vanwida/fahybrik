import Foundation

// QUÉ FAMILIAS PINTA LA CARA NUEVA DE LA MUÑECA: UNA regla, para el reloj en solitario y para el espejo.
//
// La cara nueva (`Vivo.cuadroMuneca`) cubre todo lo que se entrena con reloj: CORRER (calle, cinta, pista, series),
// FUERZA (series con su ficha, superserie, «Colócate», el descanso que anota), ERGO (remo, ski y bici sueltos), WOD
// (AMRAP, EMOM, For Time, Tabata, Death by), CIRCUITO (rondas y HYROX: estaciones, Roxzone y la carrera con el total
// en el contexto) y el RELEVO de dobles. Lo único que no cubre es la lista de movilidad de un calentamiento o una
// vuelta a la calma: ahí no hay nada que medir, solo una lista que se tacha.
//
// La pregunta se hace por PASO, con el bloque de contexto: un descanso o una recuperación son de la familia del
// trabajo que los rodea (el descanso tras una serie de fuerza es de fuerza; el de tras una estación, de circuito).

extension Vivo {

    enum FamiliaMuneca: Equatable { case correr, fuerza, ergo, wod, circuito, relevo }

    /// El paso de trabajo que dice de qué familia es el bloque de `pasos[i]`: él mismo si trabaja; si no, el de trabajo
    /// anterior del mismo segmento del motor (o el siguiente, al empezar el bloque).
    private static func pasoDeReferencia(_ pasos: [Paso], _ i: Int) -> Paso? {
        let p = pasos[i]
        if p.rol == .trabajo { return p }
        let segmento = p.origen?.segmento
        let delBloque: (Paso) -> Bool = { $0.rol == .trabajo && $0.origen?.segmento == segmento }
        return pasos[..<i].last(where: delBloque) ?? pasos[(i + 1)...].first(where: delBloque)
    }

    /// La familia que la cara nueva pinta en `pasos[i]`, o `nil` si es una lista de movilidad.
    static func familiaMuneca(_ pasos: [Paso], _ i: Int) -> FamiliaMuneca? {
        guard pasos.indices.contains(i) else { return nil }
        // La estación de la pareja es un paso propio, sin trabajo tuyo a su alrededor.
        if esRelevo(pasos[i]) { return .relevo }
        guard let ref = pasoDeReferencia(pasos, i) else { return nil }
        if ref.wod != nil { return .wod }
        if ref.circuito != nil { return .circuito }
        switch familiaDe(ref) {
        case .correr, .cinta: return .correr
        case .fuerza: return esFuerza(ref) ? .fuerza : nil
        // Una máquina suelta es ergo; la de una ruta (HYROX, circuito) es una estación.
        case .remo, .ski, .bici: return ref.clase == .estacion ? .circuito : .ergo
        case .estacion, .roxzone: return .circuito
        default: return nil
        }
    }

    /// ¿Pinta la cara nueva este bloque? Es `familiaMuneca` para quien solo quiere el sí o el no.
    static func cubreLaMuneca(_ pasos: [Paso], _ i: Int) -> Bool { familiaMuneca(pasos, i) != nil }
}
