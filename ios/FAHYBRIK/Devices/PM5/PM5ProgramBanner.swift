import SwiftUI

// One honest inline line for the erg HUD while a piece is being programmed on
// the PM5 (ErgData parity): "Enviando el entreno al PM5…" during the CSAFE
// writes, "Listo — rema para empezar" once the monitor holds the piece and waits
// for the first stroke. Failure shows NOTHING here (diagnostics carry it) — the
// athlete can always just row; the monitor is an enhancement, never a gate.
struct PM5ProgramBanner: View {
    let pm5: PM5ConnectionStore

    var body: some View {
        switch pm5.programAnnouncement {
        case .sending:
            line(text: "Enviando el entreno al PM5…", tint: Theme.Color.accentText, spinner: true)
        case .ready:
            line(text: "Listo — rema para empezar", tint: Theme.Color.ok, spinner: false)
        case nil:
            EmptyView()
        }
    }

    private func line(text: String, tint: Color, spinner: Bool) -> some View {
        HStack(spacing: 8) {
            if spinner {
                ProgressView()
                    .tint(tint)
                    .scaleEffect(0.8)
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(tint)
            }
            Text(text)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Color.foreground)
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface)
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
            .stroke(tint.opacity(0.4), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
