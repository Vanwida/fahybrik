import Foundation

// «COLÓCATE» — el paso corto antes de una serie por tiempo (una plancha, una
// isometría) que no viene de un descanso: sin él, la serie de 20″ empezaría a
// contar mientras el atleta todavía se está tumbando (espejo de
// `reloj-fuerza/planes.ts#colocate`). Lleva su 3-2-1 como cualquier paso por
// tiempo que desemboca en trabajo.
//
// Lo usan las dos mitades del adaptador: el plan (`Vivo.planDe`, que lo pone en
// la lista de pasos) y el vivo del iPhone (que lo corre con la cuenta atrás del
// descanso del motor). Una regla, un sitio.

extension Vivo {

    /// Segundos para colocarse. MÉTODO (HARD RULE Nº0): dato con defecto; un coach
    /// que no lo toca se comporta como hoy.
    static let colocateSDefecto: Double = 5

    /// El descanso que el MOTOR abre tras la serie `k` (`primeSetsIfNeeded`): el de
    /// la serie o, si no lo trae, el del bloque — salvo la última, que no abre ninguno.
    static func descansoTrasSerie(_ seg: WorkoutSegment, _ k: Int) -> Int {
        guard let sets = seg.prescription?.sets, sets.indices.contains(k) else { return 0 }
        return sets[k].restS ?? (k < sets.count - 1 ? seg.prescription?.restS ?? 0 : 0)
    }

    /// Segundos de la serie `k` si es por tiempo; nil si es de reps.
    static func segundosDeSerie(_ seg: WorkoutSegment, _ k: Int) -> Int? {
        guard let sets = seg.prescription?.sets, sets.indices.contains(k),
              case let .duration(s, _)? = sets[k].measure, s > 0 else { return nil }
        return s
    }

    /// ¿La serie `k` necesita «Colócate» delante? Es por tiempo y la anterior del
    /// mismo tramo (otra serie u otro hueco de la superserie) no abre descanso.
    static func necesitaColocate(_ seg: WorkoutSegment, serie k: Int) -> Bool {
        guard k > 0, seg.usesMultiSetStrength, segundosDeSerie(seg, k) != nil else { return false }
        return descansoTrasSerie(seg, k - 1) <= 0
    }
}
