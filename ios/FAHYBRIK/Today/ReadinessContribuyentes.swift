import SwiftUI

// MARK: - Los contribuyentes: view-model
//
// Pure presentation over the breakdown — each row's value/reference, its
// qualitative status (label + color) and its component-bar fraction. Derived
// from what the compute ALREADY provides: HRV vs its baseline, sleep vs its
// target, RHR by its component (no personal baseline exists), the check-in
// sub-score. Nothing invented; a missing input becomes an honest "Sin dato aún".
struct Contribuyente: Identifiable {
    let id = UUID()
    let icon: String
    let name: String
    let valueText: String?
    let referenceText: String?
    let statusLabel: String
    let statusColor: Color
    let barFraction: Double?
    let barColor: Color
    let isAction: Bool
    let axLabel: String

    /// Qualitative row status → color (label + bar share it).
    fileprivate enum Status { case good, mid, low
        var color: Color {
            switch self {
            case .good: return Theme.Color.ok
            case .mid:  return Theme.Color.warning
            case .low:  return Theme.Color.danger
            }
        }
    }

    static func all(from breakdown: ReadinessBreakdown?, bands: ReadinessBands?, checkinDone: Bool) -> [Contribuyente] {
        let b = breakdown
        return [
            sleep(b),
            hrv(b),
            restingHR(b),
            checkin(b, bands: bands, done: checkinDone),
        ]
    }

    // MARK: rows

    fileprivate static func sleep(_ b: ReadinessBreakdown?) -> Contribuyente {
        let icon = "moon.zzz.fill", name = "Sueño"
        guard let hours = b?.sleepHours else {
            return empty(icon: icon, name: name, ax: "Sueño, sin dato aún")
        }
        let value = esHours(hours)
        let target = b?.sleepTargetH ?? 8
        let reference = "objetivo \(Int(target.rounded())) h"
        let status: (String, Status)
        if hours >= target { status = ("Completo", .good) }
        else if hours >= target - 1.5 { status = ("Algo corto", .mid) }
        else { status = ("Corto", .low) }
        return Contribuyente(
            icon: icon, name: name, valueText: value, referenceText: reference,
            statusLabel: status.0, statusColor: status.1.color,
            barFraction: b?.sleepComponent.map { $0 / 100 }, barColor: status.1.color,
            isAction: false,
            axLabel: "Sueño, \(value), \(reference), \(status.0)"
        )
    }

    fileprivate static func hrv(_ b: ReadinessBreakdown?) -> Contribuyente {
        let icon = "waveform.path.ecg", name = "HRV"
        guard let ms = b?.hrvMs else {
            return empty(icon: icon, name: name, ax: "HRV, sin dato aún")
        }
        let value = "\(Int(ms.rounded())) ms"
        var reference: String?
        var status: (String, Status) = ("En tu base", .mid)
        if let base = b?.hrvBaselineMs, base > 0 {
            reference = "tu base \(Int(base.rounded())) ms"
            let ratio = ms / base
            if ratio >= 1.0 { status = ("Sobre tu base", .good) }
            else if ratio >= 0.90 { status = ("En tu base", .mid) }
            else { status = ("Bajo tu base", .low) }
        }
        return Contribuyente(
            icon: icon, name: name, valueText: value, referenceText: reference,
            statusLabel: status.0, statusColor: status.1.color,
            barFraction: b?.hrvComponent.map { $0 / 100 }, barColor: status.1.color,
            isAction: false,
            axLabel: "HRV, \(value)\(reference.map { ", \($0)" } ?? ""), \(status.0)"
        )
    }

    fileprivate static func restingHR(_ b: ReadinessBreakdown?) -> Contribuyente {
        let icon = "heart.fill", name = "FC en reposo"
        guard let bpm = b?.rhrBpm else {
            // Apple publishes the daily resting HR hours after the night it
            // describes and skips days the watch was off the wrist, so "todavía no
            // ha llegado la de hoy" is the normal morning state — not "no tienes".
            // Show the last one WITH its age and WITHOUT a bar: it never scored.
            if let last = b?.rhrLastBpm, let on = b?.rhrLastOn {
                let value = "\(Int(last.rounded())) ppm"
                let age = ReadinessDetailSheet.relativeDay(on)
                return Contribuyente(
                    icon: icon, name: name, valueText: value, referenceText: age,
                    statusLabel: "Falta la de hoy", statusColor: Theme.Color.muted,
                    barFraction: nil, barColor: Theme.Color.muted,
                    isAction: false,
                    axLabel: "Frecuencia cardíaca en reposo, \(value) de \(age). Falta la de hoy."
                )
            }
            return empty(icon: icon, name: name, ax: "Frecuencia cardíaca en reposo, sin dato aún")
        }
        let value = "\(Int(bpm.rounded())) ppm"
        // No personal RHR baseline exists in the model — status comes from the
        // component (lower RHR → higher component → better), no fabricated reference.
        // Sin componente NO hay veredicto. El `?? 0` que había caía en el peor tramo,
        // así que un dato que falta se leía como «Elevada» — una valoración negativa
        // sobre el atleta fabricada con un cero (§7). Ahora falta la etiqueta, no se
        // inventa: la barra ya era honesta (nil) y el color iba por libre.
        let status: (String, Status)? = b?.rhrComponent.map {
            if $0 >= 80 { return ("Excelente", .good) }
            if $0 >= 50 { return ("Correcta", .mid) }
            return ("Elevada", .low)
        }
        return Contribuyente(
            icon: icon, name: name, valueText: value, referenceText: nil,
            statusLabel: status?.0 ?? "sin valorar",
            statusColor: status?.1.color ?? Theme.Color.muted,
            barFraction: b?.rhrComponent.map { $0 / 100 },
            barColor: status?.1.color ?? Theme.Color.muted,
            isAction: false,
            axLabel: "Frecuencia cardíaca en reposo, \(value), \(status?.0 ?? "sin valorar")"
        )
    }

    fileprivate static func checkin(_ b: ReadinessBreakdown?, bands: ReadinessBands?, done: Bool) -> Contribuyente {
        let icon = "checklist", name = "Check-in"
        if done {
            let mood = moodLabel(b?.subScore)
            // Sin sub-score no hay zona, y por tanto no hay color de zona: el `?? 0`
            // teñía la barra del peor tramo con un cero que nadie había medido. La
            // fracción ya era nil, así que la barra no se pintaba — pero el color sí
            // viajaba, y en cuanto alguien pinte la barra sin dato sale roja (§7).
            let barColor = b?.subScore
                .map { ReadinessZone.of(score: Int($0.rounded()), bands: bands).color } ?? Theme.Color.muted
            return Contribuyente(
                icon: icon, name: name, valueText: "\(mood) · hoy", referenceText: nil,
                statusLabel: "Editar", statusColor: Theme.Color.muted,
                barFraction: b?.subScore.map { $0 / 100 }, barColor: barColor,
                isAction: true,
                axLabel: "Check-in de hoy, \(mood). Editar."
            )
        }
        return Contribuyente(
            icon: icon, name: name, valueText: "Sin hacer hoy", referenceText: nil,
            statusLabel: "Hacer", statusColor: Theme.Color.accentText,
            barFraction: nil, barColor: Theme.Color.accent,
            isAction: true,
            axLabel: "Check-in de hoy sin hacer. Hazlo para afinar tu score."
        )
    }

    fileprivate static func empty(icon: String, name: String, ax: String) -> Contribuyente {
        Contribuyente(
            icon: icon, name: name, valueText: nil, referenceText: nil,
            statusLabel: "Sin dato aún", statusColor: Theme.Color.muted,
            barFraction: nil, barColor: Theme.Color.muted, isAction: false, axLabel: ax
        )
    }

    // MARK: value formatting

    /// "6,6 h" (Spanish decimal comma, one place) / "8 h" for a whole number.
    fileprivate static func esHours(_ h: Double) -> String {
        if h == h.rounded() { return "\(Int(h)) h" }
        return "\(Formato.esDecimal(h)) h"
    }

    fileprivate static func moodLabel(_ subScore: Double?) -> String {
        guard let s = subScore else { return "Hecho" }
        if s >= 70 { return "Bien" }
        if s >= 45 { return "Normal" }
        return "Justo"
    }
}
