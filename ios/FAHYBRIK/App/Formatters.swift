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

    /// "mar 12" — short weekday + day, Spanish. Para etiquetas estrechas donde el
    /// mes se sobreentiende (el chip de contexto del chat, su selector).
    static func dayShort(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "EEE d"
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

// `timestamptz::text` — LO QUE ESCRIBE POSTGRES cuando el servidor castea un
// instante a texto, que es como llegan `execution.started_at` / `ended_at` y el
// `started_at` de cada tramo (`web/lib/athlete/assignment-detail.ts`,
// `web/lib/dashboard/coach/session-actuals.ts`):
//
//     2026-08-20 11:49:53+00      2026-08-20 11:49:53.561668+00
//     2026-08-20 13:49:53+02      2026-08-20 17:19:53+05:30
//
// NO es ISO 8601 —espacio entre fecha y hora, desfase que puede venir solo con
// horas— y `ISO8601DateFormatter` lo rechaza. Sin leerlo, la lectura de la
// sesión se quedaba sin hora de inicio y de fin, y los tramos de una carrera se
// colocaban encadenando duraciones en vez de en su marca de tiempo real.
//
// Se lee a mano y SIEMPRE con el desfase que trae el texto, sobre un calendario
// gregoriano fijo en UTC: nunca con el huso, la región ni el calendario del
// aparato. El mismo texto es el mismo instante en un móvil en Madrid, en Nueva
// York o con el calendario budista puesto.
enum InstanteDePostgres {
    private static let calendarioUTC: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(secondsFromGMT: 0)!
        return c
    }()

    static func parse(_ raw: String) -> Date? {
        let texto = raw.trimmingCharacters(in: .whitespaces)
        // AAAA-MM-DD (10) + separador + HH:MM:SS (8) + desfase (al menos `Z`).
        guard texto.count >= 20 else { return nil }
        let separador = texto.index(texto.startIndex, offsetBy: 10)
        guard texto[separador] == " " || texto[separador] == "T" else { return nil }
        let resto = texto[texto.index(after: separador)...]
        // El desfase empieza en el primer signo o en la `Z`: la hora no lleva ninguno.
        guard let corte = resto.firstIndex(where: { $0 == "+" || $0 == "-" || $0 == "Z" })
        else { return nil }

        let fecha = String(texto[..<separador]).components(separatedBy: "-")
        let hora = String(resto[..<corte]).components(separatedBy: ".")
        guard fecha.count == 3, hora.count == 1 || hora.count == 2 else { return nil }
        let reloj = hora[0].components(separatedBy: ":")
        guard reloj.count == 3,
              let anio = entero(fecha[0], cifras: 4),
              let mes = entero(fecha[1], cifras: 2),
              let dia = entero(fecha[2], cifras: 2),
              let h = entero(reloj[0], cifras: 2),
              let m = entero(reloj[1], cifras: 2),
              let s = entero(reloj[2], cifras: 2),
              let fraccion = fraccionDe(hora.count == 2 ? hora[1] : nil),
              let desfase = segundosDeDesfase(String(resto[corte...]))
        else { return nil }

        let componentes = DateComponents(
            year: anio, month: mes, day: dia, hour: h, minute: m, second: s
        )
        // `isValidDate` descarta un 31 de febrero en vez de rodarlo al 3 de marzo.
        guard componentes.isValidDate(in: calendarioUTC),
              let enUTC = calendarioUTC.date(from: componentes)
        else { return nil }
        return enUTC.addingTimeInterval(fraccion - desfase)
    }

    /// Los decimales de los segundos (Postgres escribe hasta seis). Sin decimales
    /// es 0; unos decimales mal formados son nil, no 0.
    private static func fraccionDe(_ cifras: String?) -> Double? {
        guard let cifras else { return 0 }
        guard (1...9).contains(cifras.count), soloCifras(cifras) else { return nil }
        return Double("0.\(cifras)")
    }

    /// `Z`, `±HH`, `±HH:MM` o `±HH:MM:SS` (Postgres), y `±HHMM` — en segundos.
    private static func segundosDeDesfase(_ texto: String) -> Double? {
        if texto == "Z" { return 0 }
        guard let signo = texto.first, signo == "+" || signo == "-" else { return nil }
        var partes = String(texto.dropFirst()).components(separatedBy: ":")
        if partes.count == 1, partes[0].count == 4 {
            partes = [String(partes[0].prefix(2)), String(partes[0].suffix(2))]
        }
        guard (1...3).contains(partes.count) else { return nil }
        let pesos = [3600, 60, 1]
        var total = 0
        for (i, parte) in partes.enumerated() {
            guard let n = entero(parte, cifras: 2), n < (i == 0 ? 24 : 60) else { return nil }
            total += n * pesos[i]
        }
        return Double(signo == "-" ? -total : total)
    }

    private static func entero(_ texto: String, cifras: Int) -> Int? {
        guard texto.count == cifras, soloCifras(texto) else { return nil }
        return Int(texto)
    }

    private static func soloCifras(_ texto: String) -> Bool {
        !texto.isEmpty && texto.allSatisfy { $0.isASCII && $0.isNumber }
    }
}
