import Foundation

// Dobles · predicho conjunto de una carrera (RaceDetailView, modo DOBLES).
//
// GET /api/athlete/dobles/race-gap?race_id={id} — el predicho de la PAREJA para
// una carrera dobles, tramo a tramo, contra el objetivo de esa carrera, con el
// reparto por estación (quién lleva cada una) y los consejos del coach. Es el
// hermano dobles del goal-gap individual (GoalGap), pero pair-scoped: cada tramo
// trae el reparto (`carrier` + `self_share`) y los tiempos individuales
// (`self_solo_s` / `partner_solo_s`) para recomputar el efecto EN VIVO cuando el
// atleta ajusta el reparto.
//
// DECODE: los NÚMEROS son estrictos (Int/Double). Un valor presente del tipo
// equivocado (p.ej. un id/segundo como string) LANZA y el service devuelve nil —
// cero fallbacks silenciosos (hubo un bug real por un número que llegó string).
// Las cadenas enum-ish (`availability` / `kind` / `carrier` / `tier`) se decodean
// como String y se interpretan con tolerancia al render, así un valor que la app
// no conoce no tumba el payload. Property names camelCase → APIClient decodifica
// con `.convertFromSnakeCase` (wire `pair_predicted_s` → `pairPredictedS`, …).

// MARK: - Models

/// `GET /api/athlete/dobles/race-gap`. `availability` gobierna la pantalla:
/// ok | partial | no_pair | no_data. Los números son estrictos (ver arriba).
struct DoblesRaceGap: Codable, Hashable {
    /// ok | partial | no_pair | no_data (tolerante — un valor desconocido con
    /// datos se trata como "hay predicho").
    let availability: String
    let raceName: String
    let raceDate: String?
    let partnerName: String?
    /// Objetivo de ESTA carrera en segundos, o nil si no hay objetivo fijado.
    let goalS: Int?
    /// Etiqueta del objetivo, p.ej. "Sub-65". Nil sin objetivo.
    let goalLabel: String?
    /// Predicho conjunto de la pareja (segundos), o nil sin datos suficientes.
    let predictedTotalS: Int?
    let segments: [DoblesRaceGapSegment]
    let coachTips: [String]
    /// Nombre de quién tocó el reparto por última vez (coach o atleta), o nil.
    let strategyLastEditedBy: String?

    var isOK: Bool { availability.lowercased() == "ok" }
    var isPartial: Bool { availability.lowercased() == "partial" }
    /// La pareja no está vinculada → aviso honesto, sin predicho.
    var hasPair: Bool { availability.lowercased() != "no_pair" }
    /// Hay predicho que pintar (ok o partial, o un valor desconocido con datos).
    var hasPrediction: Bool {
        switch availability.lowercased() {
        case "no_pair", "no_data": return false
        default: return true
        }
    }

    enum CodingKeys: String, CodingKey {
        case availability, raceName, raceDate, partnerName
        case goalS, goalLabel, predictedTotalS, segments, coachTips, strategyLastEditedBy
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        availability = (try? c.decode(String.self, forKey: .availability)) ?? "no_data"
        raceName = (try? c.decode(String.self, forKey: .raceName)) ?? ""
        raceDate = try c.decodeIfPresent(String.self, forKey: .raceDate)
        partnerName = try c.decodeIfPresent(String.self, forKey: .partnerName)
        // Números ESTRICTOS: si están presentes con el tipo equivocado, `try`
        // (sin `try?`) propaga el error → el service devuelve nil (sin fallback).
        goalS = try c.decodeIfPresent(Int.self, forKey: .goalS)
        goalLabel = try c.decodeIfPresent(String.self, forKey: .goalLabel)
        predictedTotalS = try c.decodeIfPresent(Int.self, forKey: .predictedTotalS)
        // Segmentos NO lossy: un tramo malformado hace fallar el payload entero
        // (a propósito — un número corrupto debe verse, no colarse). Ausencia → [].
        segments = try c.decodeIfPresent([DoblesRaceGapSegment].self, forKey: .segments) ?? []
        coachTips = try c.decodeIfPresent([String].self, forKey: .coachTips) ?? []
        strategyLastEditedBy = try c.decodeIfPresent(String.self, forKey: .strategyLastEditedBy)
    }
}

/// Un tramo del predicho conjunto: una carrera a pie, una estación o la roxzone.
/// `budgetS` es lo que pide el objetivo de ese tramo; `pairPredictedS` es donde
/// caería HOY la pareja con el reparto actual. `carrier` + `selfShare` describen
/// el reparto; `selfSoloS` / `partnerSoloS` son los tiempos individuales con los
/// que se recomputa el reparto en vivo. Codable sintetizado → los números no
/// opcionales (`budgetS` / `pairPredictedS`) son estrictos por construcción.
struct DoblesRaceGapSegment: Codable, Hashable, Identifiable {
    let key: String
    let labelEs: String
    /// run | station | roxzone (tolerante).
    let kind: String
    /// 1..8 sólo para kind=station; nil en run/roxzone.
    let stationIndex: Int?
    /// self | partner | split | together (tolerante).
    let carrier: String
    /// Parte que lleva el atleta, 0..1 (pareja = 1 − esto). Nil si carrier=together.
    let selfShare: Double?
    let budgetS: Int
    let pairPredictedS: Int
    /// Tiempo individual del atleta en ese tramo (segundos), o nil si no hay dato.
    let selfSoloS: Int?
    /// Tiempo individual de la pareja (segundos), o nil si no hay dato.
    let partnerSoloS: Int?
    /// observado | estimado | sin_datos (tolerante).
    let tier: String

    var id: String { key }
}

extension DoblesRaceGapSegment {
    var isRoxzone: Bool { kind.lowercased() == "roxzone" }
    var isStation: Bool { kind.lowercased() == "station" }
    var isTogether: Bool { carrier.lowercased() == "together" }

    /// Editable = una estación con reparto (no "juntos") y con índice para el PUT.
    /// El caso self_solo_s / partner_solo_s nulo se maneja DENTRO del editor
    /// (slider deshabilitado), así que no lo gateamos aquí.
    var isEditable: Bool { isStation && !isTogether && stationIndex != nil }

    /// Delta del tramo = predicho pareja − presupuesto (rojo si te pasas).
    var deltaS: Int { pairPredictedS - budgetS }

    /// Opacidad del relleno de la barra por tier de evidencia (misma escala que el
    /// goal-gap individual: observado sólido, estimado/sin_datos atenuados).
    var barFillOpacity: Double { GoalGapVis.fillOpacity(tier: tier) }

    /// Etiqueta de evidencia bajo la barra; nil para observado (limpio) o un tier
    /// que la app no conoce.
    var tierCaption: String? {
        switch tier.lowercased() {
        case "estimado":  return "estimado"
        case "sin_datos": return "sin datos suficientes"
        default:          return nil
        }
    }

    /// Chip de "quién lo lleva": TÚ · {PAREJA} · 50/50 · TÚ 60% · JUNTOS.
    func carrierChipText(partnerName: String) -> String {
        switch carrier.lowercased() {
        case "self":     return "TÚ"
        case "partner":  return partnerName.uppercased()
        case "together": return "JUNTOS"
        case "split":
            let pct = Int((max(0, min(1, selfShare ?? 0.5)) * 100).rounded())
            return pct == 50 ? "50/50" : "TÚ \(pct)%"
        default:         return carrier.uppercased()
        }
    }
}

// MARK: - Reparto math (pura, testeable)

/// Aritmética del reparto por estación — extraída para poder testear el recomputo
/// en vivo sin instanciar la vista. El predicho de un tramo con reparto es la
/// media ponderada de los tiempos individuales por la parte que lleva cada uno.
enum DoblesRepartoMath {
    /// pair_predicted del tramo = share·self_solo + (1−share)·partner_solo,
    /// redondeado al segundo (media al alza a .5).
    static func stationPairPredicted(selfShare: Double, selfSoloS: Int, partnerSoloS: Int) -> Int {
        let s = max(0, min(1, selfShare))
        return Int((s * Double(selfSoloS) + (1 - s) * Double(partnerSoloS)).rounded())
    }

    /// carrier derivado del share (misma regla que DoblesStationSplit.resolvedCarrier):
    /// share pleno → "self", cero → "partner", intermedio → "split".
    static func carrier(forShare share: Double) -> String {
        if share >= 0.999 { return "self" }
        if share <= 0.001 { return "partner" }
        return "split"
    }
}

// MARK: - Service

extension DoblesService {
    /// El predicho conjunto de la pareja para una carrera dobles.
    ///
    /// `GET /api/athlete/dobles/race-gap?race_id={id}` — mismo auth que el resto de
    /// `/api/athlete/dobles/*`. Devuelve nil sin bearer o si la petición/decodificación
    /// falla, así la sección muestra su estado honesto (aviso / reintentar) en vez de
    /// un número inventado. Los estados no_pair / no_data / partial llegan en el
    /// campo `availability` (HTTP 200), no como error.
    static func fetchRaceGap(raceId: String, bearer: String?) async -> DoblesRaceGap? {
        guard let bearer, !bearer.isEmpty else { return nil }
        let encoded = raceId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? raceId
        return try? await APIClient.shared.get(
            path: "api/athlete/dobles/race-gap?race_id=\(encoded)",
            bearer: bearer
        )
    }
}
