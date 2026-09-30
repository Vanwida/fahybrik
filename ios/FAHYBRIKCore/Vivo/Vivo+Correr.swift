import Foundation

// LA CARRERA DEL COACH, EN PASOS CON NOMBRE — la parte del adaptador estático
// (`Vivo+PlanDeSesion.swift`) que es SOLO de correr. De la gramática de carrera
// (`RunStructure`: fases → elementos «tramo | repetir ×N») a la posición y la
// clase de cada paso, sin texto libre:
//
//   · lo que va dentro de un «repetir ×N» son SERIES: «Serie 3/6» cuenta la
//     vuelta de SU repetir (no todas las del día: 538 son 4 × 600 y 3 × 800, no
//     «Serie 9/15»); un repetir dentro de otro es la TANDA;
//   · los tramos de trabajo seguidos, sin recuperar entre ellos y fuera de un
//     repetir, son UN correr que cambia de objetivo: «tramo 3/8». Si cada uno
//     aprieta más que el anterior es un PROGRESIVO; si no, un FARTLEK;
//   · la recuperación que cierra una tanda es el DESCANSO ENTRE TANDAS;
//   · un tramo suelto es un RODAJE (a zona, a RPE o sin objetivo), un TEMPO (a
//     ritmo) o una TIRADA (un rodaje largo);
//   · una serie corta dentro de un repetir es un STRIDE.
//
// Dónde empieza «largo» y hasta dónde es «corto» es MÉTODO (HARD RULE Nº0: otro
// entrenador lo pondría en otro sitio): `UmbralesCorrer`, dato con defecto.
//
// Sin gramática (la serie derivada de la tabla de `sets` o del constructor
// viejo) no hay repetir que leer: se cuenta como siempre, todas las de trabajo.

extension Vivo {

    /// Los umbrales de nombre de la carrera: método del coach con defecto.
    struct UmbralesCorrer: Equatable {
        /// Un rodaje de al menos esto es una tirada (s).
        var tiradaDesdeS: Double = 75 * 60
        /// … o de al menos esto (m).
        var tiradaDesdeM: Double = 16_000
        /// Una serie de como mucho esto, dentro de un repetir, es un stride (s).
        var strideHastaS: Double = 30
        /// Un correr continuo a una zona de esta en adelante es un tempo, no un rodaje.
        /// La zona donde empieza el umbral depende de cuántas zonas use el coach: `nil`
        /// = nunca por zona (solo es tempo el que va a ritmo). Defecto: la 4.
        var tempoDesdeZona: Double? = 4
    }

    static let umbralesCorrerDefecto = UmbralesCorrer()

    /// Dónde cae una pierna en la gramática: su vuelta de cada repetir (veces > 1)
    /// que la envuelve, de fuera adentro. Vacío = fuera de todo repetir.
    struct LugarDePierna: Equatable {
        var repetir: [Contador]
    }

    /// El lugar de cada pierna, EN EL MISMO ORDEN que `RunStructure.expandedLegs()`.
    static func lugaresDePiernas(_ estructura: RunStructure) -> [LugarDePierna] {
        var out: [LugarDePierna] = []
        func recorrer(_ els: [RunElement], _ camino: [Contador]) {
            for el in els {
                switch el {
                case let .repeatBlock(veces, hijos):
                    guard veces > 0 else { continue }
                    // «Repetir ×1» (el constructor libre agrupa así una secuencia suelta) no es una serie.
                    for k in 0..<veces { recorrer(hijos, veces > 1 ? camino + [Contador(n: k + 1, de: veces)] : camino) }
                case .segment:
                    out.append(LugarDePierna(repetir: camino))
                }
            }
        }
        for fase in estructura { recorrer(fase.elements, []) }
        return out
    }

    /// La intensidad de un objetivo, para saber si un tramo aprieta más que el
    /// anterior: ritmo y /500 al revés (menos segundos = más), el resto al derecho.
    private static func intensidad(_ o: Objetivo?) -> Double? {
        guard let o, let lo = o.min ?? o.max else { return nil }
        let medio = (lo + (o.max ?? lo)) / 2
        switch o.eje {
        case .ritmo, .split500: return -medio
        case .zona, .ppm, .rpe, .potencia, .cadencia: return medio
        default: return nil
        }
    }

    /// La clase de un correr continuo (un tramo suelto): tempo si va a ritmo o a una
    /// zona de umbral; si no, rodaje, o tirada si es largo.
    static func claseContinua(_ medida: Medida, _ objetivos: [Objetivo], umbrales u: UmbralesCorrer = umbralesCorrerDefecto) -> Clase {
        if objetivos.contains(where: { $0.eje == .ritmo && $0.papel == .principal }) { return .tempo }
        if let desde = u.tempoDesdeZona, objetivos.contains(where: { $0.eje == .zona && $0.papel == .principal && ($0.min ?? 0) >= desde }) { return .tempo }
        let pr = medida.prescrito ?? 0
        if (medida.tipo == .tiempo && pr >= u.tiradaDesdeS) || (medida.tipo == .distancia && pr >= u.tiradaDesdeM) { return .tirada }
        return .rodaje
    }

    /// Clase y posición de cada pierna de trabajo de la parte principal, leídas de
    /// la gramática. `nil` si no hay gramática o no casa con las piernas (entonces
    /// manda el recuento de siempre).
    static func nombresDePiernas(_ legs: [RunLeg], estructura: RunStructure?, medidas: [Medida], objetivos: [[Objetivo]],
                                 umbrales u: UmbralesCorrer = umbralesCorrerDefecto) -> [(clase: Clase, posicion: Posicion?)?]? {
        guard let estructura, !estructura.isEmpty else { return nil }
        let lugares = lugaresDePiernas(estructura)
        guard lugares.count == legs.count, medidas.count == legs.count, objetivos.count == legs.count else { return nil }
        var out: [(clase: Clase, posicion: Posicion?)?] = Array(repeating: nil, count: legs.count)
        let principal = { (k: Int) in legs[k].isWork && legs[k].phaseRole == .main }

        // Los tramos seguidos fuera de un repetir: cada racha de trabajo sin recuperar.
        var k = 0
        while k < legs.count {
            guard principal(k), lugares[k].repetir.isEmpty else { k += 1; continue }
            var fin = k
            while fin + 1 < legs.count, principal(fin + 1), lugares[fin + 1].repetir.isEmpty { fin += 1 }
            if fin == k {
                out[k] = (claseContinua(medidas[k], objetivos[k], umbrales: u), nil)
            } else {
                let racha = Array(k...fin)
                let niveles = racha.map { intensidad(objetivos[$0].first { $0.papel == .principal }) }
                var aprieta = !niveles.contains { $0 == nil }
                if aprieta { for (a, b) in zip(niveles, niveles.dropFirst()) where (b ?? 0) <= (a ?? 0) { aprieta = false } }
                for (n, j) in racha.enumerated() {
                    out[j] = (aprieta ? .progresivo : .fartlek, Posicion(tramo: Contador(n: n + 1, de: racha.count)))
                }
            }
            k = fin + 1
        }

        // Lo que va dentro de un repetir: series (o strides), con su tanda si lo hay.
        for j in legs.indices where principal(j) && !lugares[j].repetir.isEmpty {
            let r = lugares[j].repetir
            var pos = Posicion(serie: r[r.count - 1])
            if r.count > 1 { pos.tanda = r[r.count - 2] }
            let corta = medidas[j].tipo == .tiempo && (medidas[j].prescrito ?? .infinity) <= u.strideHastaS
            out[j] = (corta ? .strides : .series, pos)
        }

        // Una recuperación que cierra una TANDA (la pierna de antes está más dentro que ella)
        // es el descanso entre tandas: la Estructura la lee como «5′ entre tandas», no como
        // una recuperación más de la serie.
        for j in legs.indices where legs[j].isRecovery && j > 0 && !lugares[j].repetir.isEmpty
            && lugares[j - 1].repetir.count > lugares[j].repetir.count {
            out[j] = (.descansoTandas, nil)
        }
        return out
    }
}
