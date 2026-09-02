import SwiftUI

// Mono-erg brief / free-builder card. Reads `PM5Pool.shared.any` (the unscoped
// store, same object as the legacy `.shared` singleton). Multi-machine sessions
// use `DeviceConnectCard` chips bound to `PM5Pool.store(for:)` — this card is
// NOT that path and must not open a second CBCentralManager beside the pool.
// Connecting IS the first step of a mono-erg session, so the card is big and
// unmissable. The athlete picks from a list; nothing reconnects itself.
struct ErgConnectCard: View {
    @State private var pm5 = PM5Pool.shared.any
    @State private var showSheet = false

    var body: some View {
        Button(action: tap) {
            HStack(spacing: Theme.Spacing.m) {
                Image(systemName: "figure.rower")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(connected ? Theme.Color.ok : Theme.Color.accentText)
                    .frame(width: 44, height: 44)
                    .background(Theme.Color.surfaceSunken)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        if connected {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.Color.ok)
                        }
                        Text(title)
                            .font(.system(size: 16, weight: .heavy, design: .default).italic())
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    Text(subtitle)
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 8)
                if busy {
                    ProgressView().tint(Theme.Color.accent)
                } else if connected {
                    Text("cambiar")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                }
            }
            .padding(Theme.Spacing.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(connected ? Theme.Color.surface : Theme.Color.accent.opacity(0.08))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(connected ? Theme.Color.hairlineStrong : Theme.Color.accent,
                        lineWidth: connected ? 1 : 1.5))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .sheet(isPresented: $showSheet) {
            PM5LiveStreamView(store: pm5)
        }
        .accessibilityLabel(connected
            ? "Erg conectado: \(title). Toca para cambiar de erg."
            : "Conecta tu erg. Toca para buscar tu PM5.")
    }

    // MARK: - Derived state

    private var connected: Bool { pm5.isConnected }
    private var busy: Bool {
        switch pm5.connectionState {
        case .scanning, .connecting, .discoveringServices: return true
        default: return false
        }
    }
    private var title: String {
        if connected { return connectedTitle }
        if busy { return "Buscando…" }
        return "Conecta tu erg"
    }
    /// "Remo · ID <serial>" — the ID on the PM5's own screen is how the athlete
    /// tells ergs apart; falls back to the raw advertised name.
    private var connectedTitle: String {
        let name = pm5.connectedDeviceName ?? "PM5"
        if let serial = PM5LiveStreamView.pm5Serial(name) { return "Remo · ID \(serial)" }
        return "Remo · \(name)"
    }
    private var subtitle: String {
        if connected { return "Datos en vivo al empezar" }
        if busy { return "Acércate al erg y pulsa «Connect» en el monitor" }
        // After a drop, say so here — this card is often the only erg surface on screen.
        if pm5.connectionLost { return "Se perdió la conexión — toca para elegirlo otra vez" }
        return "Toca para buscar tu PM5"
    }

    private func tap() {
        Haptics.light()
        // OPENS THE SHEET. It does not connect. A remembered erg used to be reconnected
        // right here, on this tap, before the athlete had seen a single machine name —
        // so "conectar" silently meant "grab whatever answers to that identifier". Now
        // the sheet scans, the erg used last sits on top of the list badged, and he
        // taps the one he is actually sitting on.
        showSheet = true
    }
}
