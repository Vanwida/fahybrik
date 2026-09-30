import SwiftUI

// LOS FORMATOS DE FECHA DEL DETALLE DE LA DISPOSICIÓN: puros, sin vista.
extension ReadinessDetailSheet {
    // MARK: - Formatting helpers

    /// "Jueves 2 jul" from an ISO date (athlete-local wall date, no tz math).
    static func longDate(_ iso: String) -> String {
        guard let date = isoDate(iso) else { return "Hoy" }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.dateFormat = "EEEE d MMM"
        let raw = out.string(from: date)
        return raw.prefix(1).uppercased() + raw.dropFirst()
    }

    /// How old an athlete-local day is, said the way a person says it: "ayer",
    /// "anteayer", "hace 4 días". Compared in the device's own calendar, which is
    /// the athlete's — the ISO day already arrives athlete-local, no tz math.
    static func relativeDay(_ iso: String) -> String {
        // Both sides become the UTC-midnight anchor of a WALL date (the reading's,
        // and the device's today), so the difference is a clean day count with no
        // timezone arithmetic in the middle.
        let wall = DateFormatter()
        wall.locale = Locale(identifier: "en_US_POSIX")
        wall.dateFormat = "yyyy-MM-dd"
        wall.timeZone = .current
        guard let then = isoDate(iso), let now = isoDate(wall.string(from: Date())) else {
            return "sin fecha"
        }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC") ?? .current
        let days = cal.dateComponents([.day], from: then, to: now).day ?? 0
        switch days {
        case ..<1: return "hoy"
        case 1: return "ayer"
        case 2: return "anteayer"
        default: return "hace \(days) días"
        }
    }

    /// "−3 vs tu media" / "+4 vs tu media" / "En tu media" — today vs the trend
    /// mean. Nil with fewer than two days (the section is hidden then anyway).
    static func deltaChip(_ points: [ReadinessTrendPoint]) -> String? {
        guard points.count >= 2, let today = points.last?.score else { return nil }
        let mean = Double(points.reduce(0) { $0 + $1.score }) / Double(points.count)
        let delta = today - Int(mean.rounded())
        if delta == 0 { return "En tu media" }
        return "\(delta > 0 ? "+" : "\u{2212}")\(abs(delta)) vs tu media"
    }

    static func isoDate(_ iso: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.date(from: iso)
    }
}
