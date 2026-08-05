import Foundation

// LAS SERIES DE CORRER ESCRITAS COMO `sets` TAMBIÉN SON SERIES.
//
// ── EL FALLO QUE ESTO CIERRA ───────────────────────────────────────────────
// Las dos fuentes de entreno no escriben lo mismo para la misma cosa:
//
//   · El constructor de entreno libre escribe «Correr · Series» como
//     `scheme: intervals` con `rounds` (`FreeWorkout.swift:108`).
//   · El COACH las escribe como `scheme: sets`, con la distancia y el descanso
//     DENTRO de cada set — plantilla 314, «3x1000m (1'30" rest)» — y el fartlek
//     de la 318 igual, pero con medida de tiempo.
//
// El motor sólo levanta el cursor de tramos cuando la prescripción trae
// `structure` (#61). Sin cursor no hay ventana, sin ventana el cable no lleva
// ronda, y sin ronda la muñeca pinta un RODAJE donde tocaba la pantalla de
// series: ni «Serie 2 de 3», ni los metros que faltan, ni el aro segmentado.
// O sea que el mismo entreno se veía distinto según quién lo había escrito, que
// es exactamente lo que no puede pasar.
//
// ── POR QUÉ AQUÍ Y NO EN LA VISTA ──────────────────────────────────────────
// Porque no es un problema de pintado: es que al motor le faltaba el tramo. Si
// se arreglara en la muñeca, el móvil seguiría sin cursor (y sus HUD, y los
// parciales que se graban, y el contador de la máquina) — y habría dos verdades.
// Traduciendo `sets` a la MISMA gramática de tramos que ya ejecuta el motor,
// todo lo de aguas abajo se arregla solo y a la vez: el reloj, el espejo, el
// móvil y lo que se guarda.
//
// Es el mismo camino que ya hace la cinta al resolver sus tramos: una serie
// plegada se despliega a piernas, no se trata como un bout continuo.
//
// ── LA REGLA, Y DÓNDE SE PARA ──────────────────────────────────────────────
// Se traduce sólo lo que es INEQUÍVOCAMENTE una serie de correr:
//   · modalidad de correr,
//   · dos sets o más (uno solo es un bout, no una serie),
//   · y CADA set con una medida de verdad (metros o segundos).
// Si falta cualquiera de las tres, devuelve nil y el bloque sigue por el camino
// legacy de siempre, byte a byte. Un `sets` de fuerza, uno de ergo o uno sin
// dosis no entran aquí ni de lejos.
//
// El descanso de un set genera su pierna de RECUPERACIÓN salvo en el último: el
// descanso que escribe el coach es ENTRE repeticiones, y colgarle uno al final
// inventaría un tramo que la sesión no tiene.

extension Prescription {

    /// Las piernas derivadas de una tabla de `sets` que en realidad describe una
    /// serie de correr. Nil cuando no lo es — y entonces no cambia nada.
    var runLegsDesdeSets: [RunLeg]? {
        guard esSerieDeCorrerEnSets, let sets else { return nil }

        var legs: [RunLeg] = []
        for (i, set) in sets.enumerated() {
            guard let medida = Self.medidaDeCorrer(set.measure) else { return nil }
            legs.append(RunLeg(
                kind: .work,
                measure: medida,
                target: Self.objetivoDeCorrer(set.target ?? target),
                resolved: nil,
                inclinePct: nil,
                cadenceSpm: nil,
                recoveryMode: nil,
                phaseRole: .main
            ))
            // El descanso va ENTRE repeticiones: el último set no lo lleva.
            let descanso = set.restS ?? restS
            if let descanso, descanso > 0, i < sets.count - 1 {
                legs.append(RunLeg(
                    kind: .recovery,
                    measure: .duration(s: descanso),
                    target: nil,
                    resolved: nil,
                    inclinePct: nil,
                    cadenceSpm: nil,
                    // El coach escribe los segundos, no cómo se recuperan. No se
                    // inventa «trotando»: sin modo, la muñeca dice «Descanso» a
                    // secas, que es lo único cierto.
                    recoveryMode: nil,
                    phaseRole: .main
                ))
            }
        }
        return legs.isEmpty ? nil : legs
    }

    /// ¿Esta tabla de sets es, sin lugar a dudas, una serie de correr?
    private var esSerieDeCorrerEnSets: Bool {
        guard scheme == .sets else { return false }
        guard let sets, sets.count > 1 else { return false }
        // La modalidad puede venir en la prescripción o en cada set.
        let esCorrer = modality == .run || sets.allSatisfy { $0.modality == .run }
        guard esCorrer else { return false }
        // Y TODOS los sets tienen que traer una medida de correr: si uno no la
        // trae, no se sabe dónde acaba ese tramo y traducir sería inventarlo.
        return sets.allSatisfy { Self.medidaDeCorrer($0.measure) != nil }
    }

    private static func medidaDeCorrer(_ m: Measure?) -> RunSegmentMeasure? {
        switch m {
        case let .distance(meters) where meters > 0: return .distance(m: Int(meters))
        case let .duration(seconds) where seconds > 0: return .duration(s: seconds)
        default: return nil
        }
    }

    /// El objetivo del tramo, con las mismas grafías que la gramática nativa. Lo
    /// que no se sabe traducir se queda en nil: un objetivo mal traducido pinta
    /// un veredicto falso, y eso es peor que no pintar ninguno.
    private static func objetivoDeCorrer(_ t: Target?) -> RunSegmentTarget? {
        switch t {
        case let .pace(unit, valueS, minS, maxS) where unit == .perKm:
            return .pace(valueS: valueS, minS: minS, maxS: maxS)
        case let .hrZone(value, min, _):
            guard let z = value ?? min, z >= 1, z <= 5 else { return nil }
            return .hrZone(Int(z))
        case let .rpe(value, min, max):
            return .rpe(value: value, min: min, max: max)
        default:
            return nil
        }
    }
}
