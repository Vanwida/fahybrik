import SwiftUI

// The monitor's live numbers as a STRIP, for the formats where the erg is real but
// the app cannot honestly say the athlete is on it right now.
//
// In an AMRAP or a For Time the athlete moves between movements in their own order:
// nothing in the model knows whether this second is the row or the burpees, so
// taking the screen over with the erg surface would be a lie about the subject —
// the subject there really is the format clock and the rounds. But throwing the
// monitor's data away was the other error ("no mostramos lo que tenemos de pm5"),
// so it lives here: one row, under the format, showing what the machine is actually
// reporting. Rotating and per-round formats never use this — there the tramo knows
// exactly what is being done and the full erg surface takes over.
struct ErgLiveStrip: View {
    let pm5: PM5ConnectionStore

    private var live: PM5LiveSample { pm5.live }

    var body: some View {
        HStack(spacing: 6) {
            cell(value: splitString, label: "split /500m")
            cell(value: live.powerWatts.map { "\($0)" } ?? "—", label: "vatios",
                 color: Theme.Color.accentText)
            cell(value: live.strokeRate.map { "\($0)" } ?? "—", label: "s/min")
            cell(value: live.distanceMeters.map { "\(Int($0))" } ?? "—", label: "metros")
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Datos del monitor")
    }

    private var splitString: String {
        guard let p = live.paceSecondsPer500m, p > 0 else { return "—:—" }
        let s = Int(p.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    private func cell(value: String, label: String,
                      color: Color = Theme.Color.foreground) -> some View {
        VStack(spacing: 1) {
            Text(value)
                .font(.system(size: 22, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(color)
                .lineLimit(1).minimumScaleFactor(0.5)
            Text(label.uppercased())
                .font(.system(size: 8, weight: .heavy)).tracking(0.6)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(value)")
    }
}
