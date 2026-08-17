import Foundation

// LA FORMA DE LA SERIE, DIBUJADA EN EL BISEL — el on/off alrededor del lienzo.
//
// ── QUÉ ESTABA MAL ────────────────────────────────────────────────────────────
// El aro de las series contaba SÓLO las piernas de trabajo (`WatchAroSegmentado`:
// «serie 3 de 8») y, al entrar la recuperación, cambiaba a un aro que drena. O
// sea: la mitad del entreno no existía en el bisel, y la referencia de dónde
// estabas desaparecía justo en el tramo en el que hay tiempo para mirarla. Un
// 5×(800 + trote 400) se dibujaba como cinco trozos iguales y cinco desapariciones.
//
// ── EL MODELO, DOS EJES Y NINGUNA EXCEPCIÓN ───────────────────────────────────
// El aro dibuja LA FASE ENTERA que se está corriendo, un arco por tramo y en
// orden:
//   · el HUE dice QUÉ ES el tramo — trabajo naranja, recuperación gris;
//   · el BRILLO dice DÓNDE ESTÁS — hecho, en curso, por venir.
// Con eso, de reojo y sin enfocar, se lee el ritmo del entreno (cuántas fuertes
// quedan) y la posición dentro de él, que son las dos preguntas de una serie.
//
// ── POR FASE, Y NO POR BLOQUE ─────────────────────────────────────────────────
// Un calentamiento de 10' junto a cinco de 800 m es UNA sola cosa en marcha
// pegada a una estructura: mezclarlos en el mismo aro se come la resolución de
// la serie, que es lo que de verdad se mira corriendo. Así que el aro dibuja la
// fase en la que estás; una fase de un solo tramo no es una estructura y ahí
// manda el aro continuo de siempre.

/// Un arco del bisel: un tramo de la fase que se está corriendo.
struct ArcoDeTramo: Equatable {
    let trabajo: Bool
    /// Peso relativo del arco (> 0). No es una unidad: es la parte del perímetro
    /// que le toca. Cómo se reparte, en `FormaDelAro.pesos`.
    let peso: Double
}

enum FormaDelAro {

    /// Los arcos de LA FASE del tramo `indice`, y la posición del tramo en curso
    /// dentro de ellos. `nil` cuando la fase tiene un solo tramo (o el índice no
    /// existe): ahí no hay estructura que dibujar.
    static func fase(legs: [RunLeg], indice: Int) -> (arcos: [ArcoDeTramo], enCurso: Int)? {
        guard legs.indices.contains(indice) else { return nil }
        let role = legs[indice].phaseRole

        // Los tramos de una fase son CONTIGUOS por construcción (`expandedLegs`
        // recorre las fases en orden), así que el rango se toma por posición y no
        // filtrando la lista: filtrar perdería dónde cae el tramo en curso.
        var desde = indice
        while desde > 0, legs[desde - 1].phaseRole == role { desde -= 1 }
        var hasta = indice
        while hasta + 1 < legs.count, legs[hasta + 1].phaseRole == role { hasta += 1 }

        let tramos = Array(legs[desde...hasta])
        guard tramos.count > 1 else { return nil }
        let repartos = pesos(tramos)
        let arcos = zip(tramos, repartos).map { ArcoDeTramo(trabajo: $0.isWork, peso: $1) }
        return (arcos, indice - desde)
    }

    /// EL ANCHO DE CADA ARCO, POR ORDEN DE EVIDENCIA.
    ///
    /// El arco promete «esto es esta parte de lo que queda», así que sólo puede
    /// repartirse con lo que de verdad se sabe:
    ///
    ///   1. si se saben los SEGUNDOS de todos los tramos (escritos, o los metros
    ///      a un ritmo escrito) → pesa por segundos, que es la respuesta honesta
    ///      a «cuánto falta»;
    ///   2. si no, y todos van por DISTANCIA → pesa por metros: un 800 ocupa el
    ///      doble que su trote de 400, que es verdad aunque no se sepan los minutos;
    ///   3. si no (una serie por metros con recuperación por tiempo, o un tramo
    ///      que cierra el atleta) → todos pesan igual. El aro sigue diciendo el
    ///      on/off y por dónde vas, y no promete una proporción que nadie sabe.
    ///
    /// Lo que NUNCA se hace es inventar un ritmo para poder estimar: ahí empieza
    /// la pantalla que se inventa los números.
    static func pesos(_ tramos: [RunLeg]) -> [Double] {
        let segundos = tramos.compactMap(segundos(de:))
        if segundos.count == tramos.count { return segundos }

        let metros = tramos.compactMap(\.distanceMeters)
        if metros.count == tramos.count { return metros.map(Double.init) }

        return Array(repeating: 1, count: tramos.count)
    }

    /// Los segundos que se SABEN de un tramo. `nil` hace bajar un peldaño al
    /// reparto de arriba, que es justo lo que tiene que pasar.
    private static func segundos(de leg: RunLeg) -> Double? {
        if let s = leg.durationSeconds { return Double(s) }
        guard let m = leg.distanceMeters, let ritmo = ritmoSegPorKm(leg), ritmo > 0 else { return nil }
        return Double(m) / 1000 * ritmo
    }

    /// El ritmo ESCRITO del tramo, en segundos por km.
    private static func ritmoSegPorKm(_ leg: RunLeg) -> Double? {
        if case let .pace(value, minS, maxS) = leg.target {
            if let v = value { return Double(v) }
            if let lo = minS, let hi = maxS { return Double(lo + hi) / 2 }
            if let v = minS ?? maxS { return Double(v) }
        }
        // Una zona que el servidor YA resolvió contra el benchmark del atleta no
        // es un ritmo inventado: es la MISMA banda que el atleta lee en su ficha.
        if let r = leg.resolved, r.paceUnit == "per_km", r.fastS > 0 {
            return (r.fastS + (r.slowS ?? r.fastS)) / 2
        }
        return nil
    }
}
