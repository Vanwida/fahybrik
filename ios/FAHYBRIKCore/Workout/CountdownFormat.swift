import Foundation

// One countdown formatter — rounding mode is the only mirror vs standalone difference.
enum CountdownFormat {

    enum Style {
        /// Wrist is sole display — CEIL keeps whole seconds through boundaries.
        case standalone
        /// Wrist mirrors iPhone — ROUND matches `Formato.clock`.
        case mirrored
    }

    static func format(_ seconds: Double, style: Style) -> String {
        let whole: Int
        switch style {
        case .standalone: whole = max(0, Int(seconds.rounded(.up)))
        case .mirrored:   whole = max(0, Int(seconds.rounded()))
        }
        return formatWhole(whole)
    }

    static func standalone(_ seconds: Double) -> String { format(seconds, style: .standalone) }
    static func mirrored(_ seconds: Double) -> String { format(seconds, style: .mirrored) }

    private static func formatWhole(_ wholeSeconds: Int) -> String {
        if wholeSeconds < 60 { return String(format: ":%02d", wholeSeconds) }
        return Formato.clock(Double(wholeSeconds), anchoFijo: true)
    }
}
