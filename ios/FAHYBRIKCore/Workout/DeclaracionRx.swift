import Foundation

// RX / ESCALADO, DECLARADO AL TERMINAR (DECISIONS 2026-09-28: «RX / Escalado
// no está en el vivo: se declara al terminar, con la puntuación guardada»; el
// patrón de SmartWOD / Wodify). El vivo nuevo no lo pinta; el motor sigue
// sellando cada vuelta de un metcon con su valor por defecto (`rx`,
// `primeRxScaledIfNeeded`), y el resumen post-entreno deja declararlo BLOQUE A
// BLOQUE. Viaja en el MISMO campo que usaba el conmutador de la vista vieja
// (`RxScaledToggle`): `rx_scaled` + `scaled_note` de cada tramo
// (`SegmentExecutionDTO`, `workout_execution_segments`).
//
// Qué bloques lo llevan: los de la familia metcon (`PrescriptionScheme.isMetconFamily`:
// For Time, AMRAP, EMOM, Tabata, Death by, chipper, escalera, rondas, HYROX),
// fuera del calentamiento y la vuelta a la calma — el mismo eje donde el motor lo
// sella —, y solo si el bloque dejó algo medido (sin tramos no hay dónde guardarlo).

/// Cómo se hizo un WOD: como está escrito o escalado. El valor del cable.
enum NivelRx: String, CaseIterable, Equatable {
    case rx
    case scaled
}

/// Lo que el atleta declara de UN bloque puntuado.
struct DeclaracionRx: Equatable {
    var nivel: NivelRx = .rx
    /// Cómo lo escaló (libre, opcional). Solo viaja si está escalado.
    var nota: String = ""

    /// La nota tal como va al servidor: recortada, y nil si está como está escrito o vacía.
    var notaParaEnviar: String? {
        guard nivel == .scaled else { return nil }
        let t = nota.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}

/// Un bloque del entreno que admite RX / Escalado.
struct BloqueRx: Identifiable, Equatable {
    /// El índice del bloque en la sesión (`WorkoutBlockRegion.id`).
    let id: Int
    let titulo: String
    /// Los segmentos del bloque cuyas vueltas llevan la declaración.
    let segmentIds: Set<UUID>
}

enum DeclaracionesRx {

    /// Los bloques del plan que admiten RX / Escalado y dejaron vueltas medidas.
    static func bloques(plan: WorkoutPlan, laps: [LapRecord]) -> [BloqueRx] {
        let conVueltas = Set(laps.map(\.segmentId))
        return plan.blockRegions.compactMap { region in
            guard region.phase != .warmup, region.phase != .cooldown else { return nil }
            let ids = Set(plan.segments(in: region).filter(\.isMetconFamily).map(\.id))
                .intersection(conVueltas)
            guard !ids.isEmpty else { return nil }
            return BloqueRx(id: region.id, titulo: region.title, segmentIds: ids)
        }
    }

    /// Lo que ya dicen las vueltas del bloque (el defecto del motor, o lo que se
    /// marcó en la vista vieja): la primera vuelta que lleve un valor.
    static func semilla(_ b: BloqueRx, laps: [LapRecord]) -> DeclaracionRx {
        guard let lap = laps.first(where: { b.segmentIds.contains($0.segmentId) && $0.rxScaled != nil }),
              let nivel = lap.rxScaled.flatMap(NivelRx.init(rawValue:)) else { return DeclaracionRx() }
        return DeclaracionRx(nivel: nivel, nota: nivel == .scaled ? (lap.scaledNote ?? "") : "")
    }

    /// Las declaraciones por bloque, repartidas a cada segmento (la clave del
    /// `ManualSegmentOverlay`). Un bloque sin declarar no entra: sus vueltas viajan como están.
    static func porSegmento(_ bloques: [BloqueRx], _ declaradas: [Int: DeclaracionRx]) -> [UUID: DeclaracionRx] {
        var x: [UUID: DeclaracionRx] = [:]
        for b in bloques {
            guard let d = declaradas[b.id] else { continue }
            for id in b.segmentIds { x[id] = d }
        }
        return x
    }
}
