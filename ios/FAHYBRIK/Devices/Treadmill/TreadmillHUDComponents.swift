import SwiftUI

// Presentational atoms for the treadmill HUD, in the app's Expert dark language
// (Theme tokens, Fabrik orange accent). No device or domain logic lives here.

// MARK: - Status → semantic treatment

extension TargetStatus {
    /// In-target = green, out (either side) = red, nothing to judge = neutral.
    var color: Color {
        switch self {
        case .inTarget:          return Theme.Color.ok
        case .tooFast, .tooSlow: return Theme.Color.danger
        case .unknown:           return Theme.Color.foreground
        }
    }
    /// A one-word coaching cue, or nil when there's nothing to judge.
    var cue: String? {
        switch self {
        case .inTarget: return "En objetivo"
        case .tooFast:  return "Afloja"
        case .tooSlow:  return "Aprieta"
        case .unknown:  return nil
        }
    }
}

// MARK: - Entry button

/// The "Correr en cinta" entry, shared by the continuous-run HUD and the interval
/// series so both read identically. Offered on any run leg; the treadmill screen
/// itself handles "no compatible treadmill found" honestly.
struct TreadmillEntryButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: { Haptics.medium(); action() }) {
            HStack(spacing: 8) {
                Image(systemName: "figure.run")
                    .font(.system(size: 13, weight: .heavy))
                Text("CORRER EN CINTA")
                    .font(.system(size: 14, weight: .heavy, design: .default).italic())
                    .tracking(0.8)
            }
            .foregroundStyle(Theme.Color.accentText)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(Theme.Color.surfaceElevated)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.accentText.opacity(0.5), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Correr en cinta con Bluetooth")
    }
}

// MARK: - Connection chip

/// A device chip with a live status dot — mirrors the existing ConnectionStrip
/// chip so the treadmill screen reads as the same instrument panel.
struct DeviceChip: View {
    let icon: String
    let text: String
    let link: DeviceLink

    private var on: Bool { link.isLive }
    private var searching: Bool {
        switch link { case .scanning, .connecting, .reconnecting: return true; default: return false }
    }

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(dotColor)
                .frame(width: 6, height: 6)
                .opacity(searching ? 0.6 : 1)
            Image(systemName: icon)
                .font(.system(size: 9, weight: .bold))
            Text(text.uppercased())
                .font(.system(size: 9, weight: .heavy, design: .default).italic())
                .tracking(0.6)
                .lineLimit(1)
        }
        .foregroundStyle(on ? Theme.Color.accentText : Theme.Color.muted)
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(on ? Theme.Color.accent.opacity(0.14) : Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                .stroke(on ? Theme.Color.accentText.opacity(0.5) : Theme.Color.outline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(text), \(accessibilityState)")
    }

    private var dotColor: Color {
        if on { return Theme.Color.ok }
        if searching { return Theme.Color.warning }
        return Theme.Color.muted
    }
    private var accessibilityState: String {
        if on { return "conectado" }
        if searching { return "buscando" }
        return "sin conexión"
    }
}

// MARK: - Zone meter (5 segments)

/// Five stacked segments Z1–Z5; the active zone is lit, the rest dimmed. The
/// "genérica" qualifier shows ONLY when the zone came from the age+sex estimate
/// (no measured max) — with the athlete's own FCmáx the zone is personal.
struct ZoneMeter: View {
    let zone: HRZone
    var isEstimated: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 3) {
                ForEach(HRZone.allCases, id: \.rawValue) { z in
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(z.color)
                        .opacity(z == zone ? 1 : 0.22)
                        .frame(height: 8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 2, style: .continuous)
                                .stroke(z == zone ? Theme.Color.foreground.opacity(0.5) : .clear, lineWidth: 1)
                        )
                }
            }
            HStack(spacing: 6) {
                Text(zone.label)
                    .font(.system(size: 15, weight: .heavy, design: .default).italic())
                    .foregroundStyle(zone.color)
                if isEstimated {
                    Text("genérica")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Zona \(zone.label)" + (isEstimated ? ", genérica" : ""))
    }
}

// MARK: - Goal progress

/// The leg's distance/time progress with a filled bar and a completion flash.
struct GoalProgress: View {
    let caption: String
    let primary: String      // covered distance / remaining time
    let secondary: String    // target
    let fraction: Double
    let complete: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .lastTextBaseline) {
                LabelText(text: caption, size: 10)
                Spacer(minLength: 8)
                if complete {
                    Text("COMPLETADO")
                        .font(.system(size: 11, weight: .heavy, design: .default).italic())
                        .tracking(0.8)
                        .foregroundStyle(Theme.Color.ok)
                }
            }
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                Text(primary)
                    .font(.system(size: 22, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(complete ? Theme.Color.ok : Theme.Color.foreground)
                Text("/ \(secondary)")
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.Color.surface)
                    Capsule()
                        .fill(complete ? Theme.Color.ok : Theme.Color.accent)
                        .frame(width: max(0, geo.size.width * fraction))
                }
            }
            .frame(height: 8)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surfaceElevated)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(complete ? Theme.Color.ok.opacity(0.6) : Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }
}
