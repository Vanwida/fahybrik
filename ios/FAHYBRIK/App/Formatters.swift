import Foundation
import SwiftUI

// Rasgos de presentación por modalidad + parseo de fechas de analítica. Vino aquí
// de la pestaña Stats borrada, para que los muchos llamantes que la sobrevivieron
// (Rendimiento / GoalGap / Predicho-vs-Real / Hyresult de Carreras) tuvieran un
// sitio estable.
//
// La GRAFÍA ya no está aquí: cómo se escribe un número vive en `Theme/Formato.swift`,
// compartido con el reloj. Aquí queda solo lo que es propio de la modalidad —
// etiqueta, color, símbolo y qué convención de ritmo le toca.

// MARK: - Modality classification
//
// The backend's `modality` strings (running / rowing / ski_erg / bike_erg, and
// any future values) map to a small closed set of display traits: a short
// chip label, a brand-consistent color, an SF Symbol, and — crucially — which
// pace convention applies (per-km for running, per-500m for ergometers). This
// is the single source of truth so chips, cards, and charts stay coherent.

// Raw values mirror the backend's canonical modality vocabulary emitted by
// `buildModalityAnalytics` / `normalizeModality` (run | row | ski | bike |
// strength | other). `init(raw:)` also tolerates the long-form aliases
// (running / rowing / ski_erg / bike_erg) so a future server change can't
// silently dump everything into `.other`.
enum AnalyticsModality: String {
    case run
    case row
    case ski
    case bike
    case strength
    case other

    init(raw: String) {
        switch raw.trimmingCharacters(in: .whitespaces).lowercased() {
        case "run", "running":                     self = .run
        case "row", "rowing", "rowerg", "row_erg": self = .row
        case "ski", "skierg", "ski_erg":           self = .ski
        case "bike", "bikeerg", "bike_erg", "cycling": self = .bike
        case "strength", "lift", "weights":        self = .strength
        default:                                   self = .other
        }
    }

    /// Short uppercase chip label (RUN / ROW / SKI / BIKE / FUERZA).
    var shortLabel: String {
        switch self {
        case .run:      return "RUN"
        case .row:      return "ROW"
        case .ski:      return "SKI"
        case .bike:     return "BIKE"
        case .strength: return "FUERZA"
        case .other:    return "OTRO"
        }
    }

    /// Full Spanish name for VoiceOver and card titles.
    var fullName: String {
        switch self {
        case .run:      return "Carrera"
        case .row:      return "Remo"
        case .ski:      return "SkiErg"
        case .bike:     return "BikeErg"
        case .strength: return "Fuerza"
        case .other:    return "Otro"
        }
    }

    var symbol: String {
        switch self {
        case .run:      return "figure.run"
        case .row:      return "figure.rower"
        case .ski:      return "figure.skiing.crosscountry"
        case .bike:     return "figure.indoor.cycle"
        case .strength: return "dumbbell.fill"
        case .other:    return "circle.dotted"
        }
    }

    /// Brand-consistent FILL color (bars, dots, tints). Orange is reserved for
    /// the global accent, so running owns it (the dominant HYROX modality) and
    /// ergs borrow zone hues to stay distinguishable without inventing new
    /// palette entries. Use this where the color is a FILL (≥3:1 floor). For
    /// the SAME identity rendered as TEXT / a small icon / a thin chart line on
    /// the white canvas, use `textColor` instead (run's #F06A2A fails AA there).
    var color: Color {
        switch self {
        case .run:      return Theme.Color.accent
        case .row:      return HRZone.z2.color   // blue
        case .ski:      return HRZone.z3.color   // green
        case .bike:     return HRZone.z4.color   // amber
        case .strength: return HRZone.z5.color   // red
        case .other:    return Theme.Color.muted
        }
    }

    /// Text/glyph/thin-line variant of `color`, role-split exactly like
    /// `Theme.Color.accent` vs `accentText`. Identical to `color` in every mode
    /// EXCEPT running on the LIGHT canvas, where brand orange (#F06A2A, ~2.6:1)
    /// is replaced by the darkened `accentText` (#B5430B, ≥4.5:1 as text). The
    /// erg zone hues already darken for light (text-safe in both modes), so they
    /// pass straight through. Use for labels, icons, and chart lines/points.
    var textColor: Color {
        switch self {
        case .run:  return Theme.Color.accentText
        default:    return color
        }
    }

    /// Pace convention for this modality: distance-running shows min/km,
    /// ergometers show the /500 m split. Strength / other have no pace.
    enum PaceKind { case perKm, per500m, none }
    var paceKind: PaceKind {
        switch self {
        case .run:                  return .perKm
        case .row, .ski, .bike:     return .per500m
        case .strength, .other:     return .none
        }
    }
}

// El bloque `StatsFormat` que vivía aquí ha desaparecido: era una segunda copia
// entera de la grafía (duración, ritmo, distancia, peso, RPE) que además escribía
// los decimales con PUNTO («32.4 km») y el ritmo con espacio («4:35 /km»). Todo eso
// vive ahora en `Theme/Formato.swift`, una sola vez. Seis de sus ocho funciones no
// las llamaba nadie — se han borrado, no reubicado.

// MARK: - Date parsing
//
// Analytics dates arrive as "YYYY-MM-DD" (session/week dates have no clock
// time). We parse with a fixed POSIX formatter and fall back to full ISO-8601
// so a future timestamped value still resolves. Never guesses on failure.

enum StatsDateParser {
    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func parse(_ raw: String) -> Date? {
        if let d = ymd.date(from: raw) { return d }
        return ISO8601DateFormatters.parse(raw)
    }

    /// "lun 2 jun" — short weekday + day + month, Spanish.
    static func shortLabel(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "EEE d MMM"
        return f.string(from: date)
    }

    /// "2 jun" — day + month, for tight chart axes / week labels.
    static func dayMonth(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "d MMM"
        return f.string(from: date)
    }
}
