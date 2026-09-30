import SwiftUI

// Aquí vivía un `formatDuration` con una TERCERA grafía de la duración: los minutos
// redondos salían como «5'». El mismo tramo se leía «5'» en el plan y «5:00» en el
// entreno. Ahora los dos dicen «5:00» (`Formato.clock`).

// MARK: - Workout params formatter
//
// Context-aware param summary used by `ExerciseDetailView` (and any future
// session-detail rendering) so there is a single source of truth for how
// series/reps/load/zone/pace are rendered.

enum WorkoutItemParamsFormatter {
    // Item-level summary — the preferred entry point. PREFERS the structured
    // `prescription_json` (per-set pyramids, ranges, ergo/run pace+zone) and only
    // falls back to the flat scalar params for legacy items that lack it. Returns
    // a single line; per-set tables are rendered by views, not this formatter.
    static func summary(_ item: WorkoutItem) -> String? {
        if let p = item.prescription {
            let isStrength = p.modality == .strength
                || (p.modality == nil && item.exerciseCategory.lowercased() == "strength")
            if isStrength, let rows = PrescriptionRenderer.setRows(p), !rows.isEmpty {
                if PrescriptionRenderer.setsAreUniform(p),
                   let collapsed = PrescriptionRenderer.collapsedSetsLabel(p) {
                    return collapsed
                }
                // Pyramid → "5 series · 10→6 · 60→75% 1RM" (count + work/load spread).
                let works = rows.compactMap(\.work)
                let loads = rows.compactMap(\.load)
                var parts = ["\(rows.count) series"]
                if let first = works.first, let last = works.last, first != last {
                    parts.append("\(first)→\(last)")
                } else if let first = works.first {
                    parts.append("× \(first)")
                }
                if let lo = loads.first, let hi = loads.last, lo != hi {
                    parts.append("\(lo) → \(hi)")
                } else if let lo = loads.first {
                    parts.append(lo)
                }
                return parts.joined(separator: " · ")
            }
            // Non-strength → a modality summary line (run/ergo/functional/WOD…).
            let line = PrescriptionRenderer.summaryLine(p)
            var parts: [String] = []
            if let header = PrescriptionRenderer.wodHeader(p) { parts.append(header) }
            if let h = line.headline { parts.append(h) }
            if let pace = line.pace { parts.append(pace) }
            if let z = line.zone { parts.append(z.label) }
            if let det = line.detail { parts.append(det) }
            if !parts.isEmpty { return parts.joined(separator: " · ") }
        }
        return summary(item.paramsJson, category: item.exerciseCategory)
    }

    static func summary(_ p: WorkoutItemParams, category: String) -> String? {
        switch category.lowercased() {
        case "running":
            return runningSummary(p)
        case "rowing", "ski_erg", "bike_erg":
            return ergoSummary(p)
        case "strength":
            return strengthSummary(p)
        default:
            // functional / mobility / other — show whatever shape we have.
            return strengthSummary(p) ?? ergoSummary(p) ?? runningSummary(p)
        }
    }

    private static func strengthSummary(_ p: WorkoutItemParams) -> String? {
        var parts: [String] = []
        switch (p.sets, p.reps) {
        case let (s?, r?): parts.append("\(s) × \(r)")
        case (nil, let r?): parts.append("\(r) reps")
        case (let s?, nil): parts.append("\(s) sets")
        default: break
        }
        if let kg = p.loadKg {
            parts.append("@ \(formatKg(kg))")
        } else if let pct = p.loadPct {
            parts.append("@ \(Int(pct.rounded()))% 1RM")
        }
        if let rpe = p.rpe {
            parts.append("RPE \(formatRpe(rpe))")
        }
        if let rest = p.restSeconds {
            parts.append("descanso \(Formato.clock(rest, subMinuto: .segundos))")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private static func runningSummary(_ p: WorkoutItemParams) -> String? {
        var parts: [String] = []
        if let dur = p.durationSeconds {
            parts.append(Formato.clock(dur, subMinuto: .segundos))
        }
        if let km = p.distanceKm {
            parts.append(Formato.distancia(km * 1000, decimales: 2) ?? "")
        } else if let m = p.distanceMeters {
            parts.append("\(m) m")
        }
        if let zone = p.hrZone {
            parts.append("Z\(zone)")
        }
        if let pace = p.paceSecPerKm {
            parts.append("\(Formato.ritmoCifras(Double(pace)))/km")
        }
        if let spm = p.cadenceSpm {
            parts.append("\(spm) spm")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private static func ergoSummary(_ p: WorkoutItemParams) -> String? {
        var parts: [String] = []
        if let dur = p.durationSeconds {
            parts.append(Formato.clock(dur, subMinuto: .segundos))
        }
        if let m = p.distanceMeters {
            parts.append("\(m) m")
        }
        if let cal = p.caloriesPerMin {
            parts.append("\(cal) cal/min")
        } else if let cal = p.calories {
            parts.append("\(cal) cal")
        }
        if let zone = p.hrZone {
            parts.append("Z\(zone)")
        }
        if let pace = p.paceSecPerKm {
            // Ergo pace is conventionally /500m. The unified prescription model
            // normalizes pace to seconds-per-KM (`paceSecPerKm`), so halve it to
            // recover the /500m value the athlete reads on the erg monitor.
            parts.append("\(Formato.ritmoCifras(Double(pace / 2)))/500m")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private static func formatKg(_ kg: Double) -> String { Formato.kg(kg) }

    private static func formatRpe(_ rpe: Double) -> String { Formato.esDecimal(rpe) }

}
