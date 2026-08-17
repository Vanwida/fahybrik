import Foundation

// UNA SERIE DE CORRER ES UNA SERIE DE CORRER, LA ESCRIBA QUIEN LA ESCRIBA.
//
// ── EL FALLO QUE ESTO CIERRA ───────────────────────────────────────────────
// El mismo entreno se puede escribir de tres maneras y hasta hoy sólo dos
// llegaban al motor de tramos:
//
//   · gramática nativa (`structure`)      → tramos ✓
//   · el coach, tabla de `sets`           → tramos ✓  (plantilla 314, «3x1000m»)
//   · el constructor libre, `intervals`   → NADA      («5 × 800 m · r 1:30»)
//
// El tercero caía al motor rotativo de trabajo/descanso, que es binario y no
// tiene cursor de tramo. Lo que eso costó, medido corriendo por la calle el
// 8-ago: la muñeca pintaba la serie con el guion del RELOJ DE PARED —el escrito
// para burpees y planchas, documentado ahí mismo como «sin GPS que valga (estás
// en el sitio)»—, así que no había metros; y los que sí llegaban por el espejo
// eran los del BLOQUE ENTERO contra un objetivo POR SERIE, o sea que en la
// serie 2 ya arrastraban la 1 y el trote de vuelta. Números reales contra el
// denominador equivocado, que es peor que un número que falta.
//
// ── POR QUÉ AQUÍ Y NO EN LA VISTA ──────────────────────────────────────────
// Porque no es un problema de pintado: al motor le faltaba el tramo. Arreglarlo
// en la muñeca dejaría al móvil sin cursor —y con él sus HUD, los parciales que
// se graban y el contador de la máquina—, y habría dos verdades. Traduciendo a
// la MISMA gramática de tramos que el motor ya ejecuta, todo lo de aguas abajo
// se arregla solo y a la vez.
//
// ── LA REGLA ───────────────────────────────────────────────────────────────
// Una prescripción de CORRER que describe MÁS DE UN tramo se despliega a
// piernas. Hay dos formas de escribirlo y las dos acaban en la misma lista:
//
//   A · TABLA   — `sets` con dos filas o más, cada una con su medida y su
//                 descanso. Es como lo escribe el coach.
//   B · RONDAS  — `intervals` con `rounds > 1` y UNA dosis repetida. Es como lo
//                 escribe el constructor libre.
//
// Donde se para, y no se pasa de ahí: si la modalidad no es correr, si no hay
// más de un tramo, o si falta la medida de alguno, devuelve nil y el bloque
// sigue por el camino de siempre, byte a byte. Un `sets` de fuerza, uno de ergo
// o uno sin dosis no entran aquí ni de lejos.
//
// El descanso genera su pierna de RECUPERACIÓN salvo tras el último tramo: el
// descanso está ENTRE repeticiones, y colgarle uno al final inventaría un tramo
// que la sesión no tiene.

extension Prescription {

    /// Las piernas de una prescripción de correr que describe más de un tramo.
    /// Nil cuando no lo es — y entonces no cambia nada.
    var runLegsDerivadas: [RunLeg]? {
        // La modalidad manda antes que el formato: lo que decide si esto es una
        // serie de correr es QUÉ SE MIDE, no cómo se llama el esquema.
        guard modality == .run else { return nil }
        if let tabla = piernasDeTabla { return tabla }
        return piernasDeRondas
    }

    // MARK: - A · La tabla de `sets`

    private var piernasDeTabla: [RunLeg]? {
        guard scheme == .sets, let sets, sets.count > 1 else { return nil }
        // LA MODALIDAD TIENE QUE CUADRAR EN LOS DOS SITIOS, y esto no es celo:
        // con un `||` bastaba que el BLOQUE se declarara de correr para que sus
        // sets entraran sin mirarse, y un bloque mixto —una plancha de 60 s entre
        // series— convertía la plancha en una pierna de carrera. El bloque dice
        // de qué va; cada set puede desmentirlo, y si lo desmiente, no es una
        // serie de correr y se va por el camino de siempre.
        guard sets.allSatisfy({ $0.modality == nil || $0.modality == .run }) else { return nil }

        var legs: [RunLeg] = []
        for (i, set) in sets.enumerated() {
            guard let medida = Self.medidaDeCorrer(set.measure) else { return nil }
            legs.append(Self.trabajo(medida: medida, objetivo: set.target ?? target))
            // El descanso, SÓLO el que lleva el propio set. Cogerlo del bloque
            // fabricaba piernas de recuperación donde el coach no las escribió:
            // en un `sets` importado, `restS` de bloque es un valor que las
            // importaciones rellenan por defecto.
            if let descanso = set.restS, descanso > 0, i < sets.count - 1 {
                legs.append(Self.recuperacion(segundos: descanso))
            }
        }
        return legs.isEmpty ? nil : legs
    }

    // MARK: - B · Las rondas de `intervals`

    /// `intervals` es el esquema cuyo nombre YA significa «N repeticiones de lo
    /// mismo con descanso»: es lo que escribe el constructor libre y lo que el
    /// motor rotativo ejecuta hoy leyendo `rounds` + `restS`. Se traduce sólo
    /// ese, no toda la familia rotativa: un EMOM lo gobierna su minuto y una
    /// tabata su 20/10, y los dos tienen motor propio. `rounds` (presentación
    /// fija) tampoco entra: ahí la lista son ESTACIONES —la ruta de un HYROX
    /// sim, un chipper— y no repeticiones de un mismo tramo.
    private var piernasDeRondas: [RunLeg]? {
        guard scheme == .intervals, let rondas = rounds, rondas > 1 else { return nil }
        // UNA dosis repetida. Con dos o más, quien manda es la tabla (rama A) y
        // repetirla `rounds` veces se inventaría un entreno más largo.
        guard let dosis = sets?.first, (sets?.count ?? 0) <= 1 else { return nil }
        guard dosis.modality == nil || dosis.modality == .run else { return nil }
        guard let medida = Self.medidaDeCorrer(dosis.measure) else { return nil }

        // Aquí el descanso del BLOQUE sí es dato y no relleno: en `intervals` es
        // el que el propio motor rotativo ejecuta como fase de parada, y es el
        // que el constructor libre escribe en los dos sitios a la vez.
        let descanso = dosis.restS ?? restS
        let objetivo = dosis.target ?? target

        var legs: [RunLeg] = []
        for i in 0..<rondas {
            legs.append(Self.trabajo(medida: medida, objetivo: objetivo))
            if let descanso, descanso > 0, i < rondas - 1 {
                legs.append(Self.recuperacion(segundos: descanso))
            }
        }
        return legs
    }

    // MARK: - Piezas compartidas

    private static func trabajo(medida: RunSegmentMeasure, objetivo: Target?) -> RunLeg {
        RunLeg(kind: .work, measure: medida, target: objetivoDeCorrer(objetivo),
               resolved: nil, inclinePct: nil, cadenceSpm: nil,
               recoveryMode: nil, phaseRole: .main)
    }

    private static func recuperacion(segundos: Int) -> RunLeg {
        RunLeg(kind: .recovery, measure: .duration(s: segundos), target: nil,
               resolved: nil, inclinePct: nil, cadenceSpm: nil,
               // Ni el coach ni el constructor libre escriben todavía CÓMO se
               // recupera, sólo cuánto dura. No se inventa «trotando» ni
               // «parado»: sin modo, el motor MIDE lo que pase (ver
               // `RunLeg.recuperaEnMovimiento`) en vez de suponerlo.
               recoveryMode: nil, phaseRole: .main)
    }

    private static func medidaDeCorrer(_ m: Measure?) -> RunSegmentMeasure? {
        switch m {
        // El SUELO es lo que define el tramo. Una banda («800-1000 m») se corre
        // hasta donde diga el atleta; el cursor de la serie no puede rematarlo en
        // un techo que nadie ha prometido.
        case let .distance(meters, _) where meters > 0: return .distance(m: Int(meters))
        case let .duration(seconds, _) where seconds > 0: return .duration(s: seconds)
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
