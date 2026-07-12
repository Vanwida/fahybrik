import SwiftUI

// #56 — the "ÚNETE EN VIVO" banner (Peloton nudge): the partner is training right now,
// shown on Inicio and the Dobles plan. Orange (the brand accent — a call to action, vs
// the strip's blue "how the partner is going"). Pure presentation over
// `DoblesLiveBannerState`; the host fetches once on appear and owns `onJoin`. The CTA
// shows only when the athlete has a startable session today AND the host provides an
// action — otherwise the banner is informational.
struct DoblesLiveBanner: View {
    let state: DoblesLiveBannerState
    /// The host's "start my session" action. Nil (e.g. the read-only Dobles plan) →
    /// no CTA even when the athlete could join.
    var onJoin: (() -> Void)? = nil

    var body: some View {
        switch state {
        case .hidden:
            EmptyView()
        case let .visible(name, subtitle, canJoin):
            card(name: name, subtitle: subtitle, showCTA: canJoin && onJoin != nil)
        }
    }

    private func card(name: String, subtitle: String, showCTA: Bool) -> some View {
        VStack(alignment: .leading, spacing: showCTA ? 12 : 0) {
            HStack(spacing: 10) {
                DoblesAthleteAvatar(initials: initials(name), color: Theme.Color.accent, size: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(name) está entrenando ahora")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text(subtitle)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                Spacer(minLength: 6)
                liveChip
            }
            if showCTA {
                Button {
                    Haptics.medium()
                    onJoin?()
                } label: {
                    Text("Únete en vivo")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(Theme.Color.accentOn)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(Theme.Color.accent)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Únete en vivo con \(name)")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.accent.opacity(0.10))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.accent.opacity(0.35), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name) está entrenando ahora. \(subtitle)")
    }

    private var liveChip: some View {
        HStack(spacing: 5) {
            LivePulseDot(color: Theme.Color.accent, size: 6)
            Text("EN VIVO")
                .font(.system(size: 10, weight: .heavy).italic())
                .tracking(0.8)
                .foregroundStyle(Theme.Color.accentText)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Theme.Color.accent.opacity(0.14))
        .clipShape(Capsule())
    }

    private func initials(_ name: String) -> String {
        let t = name.trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? "·" : String(t.prefix(1)).uppercased()
    }
}
