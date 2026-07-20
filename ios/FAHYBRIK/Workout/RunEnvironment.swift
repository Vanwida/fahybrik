import SwiftUI

// Where a run happens — the ONE decision the athlete makes before starting a run
// (Alex's mandate: "correr → dónde: cinta o exterior → cinta: conectar → empezar").
// Chosen in the pre-start step (prescribed brief AND free builder), carried on the
// session, and used to AUTO-OPEN the right live HUD on start — the athlete never
// lands on a generic screen with phantom GPS pace when they said "cinta".
enum RunEnvironment: String {
    case treadmill   // indoor — connect + drive the belt, GPS stays OFF
    case outdoor     // outside — GPS pace/map, no treadmill offer
}

// The picker is iPhone-only: it leans on the Theme/Haptics layer, which is not
// compiled into the watch target. The wrist only needs the enum (WorkoutSession
// carries it), so the UI is compiled out there — same pattern as ZoneColors.
#if !os(watchOS)
/// The shared "¿Dónde corres hoy?" picker — the SAME two cards in the prescribed
/// brief and the free builder, so the flow reads identically everywhere.
struct RunEnvironmentPicker: View {
    @Binding var selection: RunEnvironment?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("¿Dónde corres hoy?")
                .font(.system(size: 15, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
            HStack(spacing: 10) {
                card(title: "En cinta", subtitle: "Conéctala y contrólala",
                     icon: "figure.run", value: .treadmill)
                card(title: "En la calle", subtitle: "GPS · ritmo en vivo",
                     icon: "location.fill", value: .outdoor)
            }
        }
    }

    private func card(title: String, subtitle: String, icon: String,
                      value: RunEnvironment) -> some View {
        let selected = selection == value
        return Button(action: { Haptics.light(); selection = value }) {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
                Text(title)
                    .font(.system(size: 16, weight: .heavy, design: .default).italic())
                    .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
                Text(subtitle)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(selected ? Theme.Color.accentOn.opacity(0.85) : Theme.Color.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(selected ? Theme.Color.accent : Theme.Color.surface)
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(selected ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
#endif
