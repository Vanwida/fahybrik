import SwiftUI

// Shared display atoms for the wrist screens the new stack does not paint — the block gate, the
// warm-up checklist and the mirror's gate / list / saving overlays: the giant numeral, the tracked
// label, the status header, the big-tap primary button, the HR pill and the scaffold.

// MARK: - Giant numeral

/// The number protagonista — heavy, italic, tabular, auto-scaling to fill the
/// wrist. `unit` rides small alongside ("/km", "kg").
///
/// `text` NO es opcional a propósito: a 72 pt no cabe una frase, así que el hueco no
/// se resuelve aquí. Cuando la medida todavía no existe, **degrada el llamante** a la
/// siguiente verdad que sí conoce (el reloj del tramo) y cambia LA ETIQUETA con ella —
/// mismo criterio que `OutdoorRunHUDView.lecturaViva` en el teléfono. Dejar «Ritmo»
/// encima de un cronómetro miente igual que pintar un guion.
struct GiantNumber: View {
    let text: String
    var size: CGFloat = 72
    var color: Color = WatchTheme.ink
    var unit: String? = nil

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: 0) {
            Text(text)
                .font(.system(size: size, weight: .heavy, design: .default).italic().monospacedDigit())
                .foregroundStyle(color)
            if let unit {
                Text(unit)
                    .font(.system(size: size * 0.28, weight: .heavy, design: .default).monospacedDigit())
                    .foregroundStyle(WatchTheme.dim)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.4)
    }
}

// MARK: - Label

/// 10pt tracked-uppercase data label. `accent` tints it orange-soft.
struct WatchLabel: View {
    let text: String
    var color: Color = WatchTheme.dim
    var accent: Bool = false

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .heavy))
            .tracking(1.1)
            .foregroundStyle(accent ? WatchTheme.orangeSoft : color)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

// MARK: - Status header

/// The tiny top status strip ("EMOM · 7 / 12", "AMRAP · 20:00"). Orange-soft by
/// default (the live accent); pass a color for the rest / done variants.
struct StatusHeader: View {
    let text: String
    var color: Color = WatchTheme.orangeSoft

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .heavy))
            .tracking(0.4)
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(maxWidth: .infinity)
    }
}

// MARK: - Big-tap primary button

/// The full-width primary action — 52pt, radius 18, orange or green. The whole
/// bar is the target (design: pantalla = botón). Fires a tap haptic itself.
struct BigTapButton: View {
    enum Kind { case orange, green }

    let title: String
    var systemImage: String? = nil
    var kind: Kind = .orange
    let action: () -> Void

    var body: some View {
        Button {
            WatchHaptics.tap()
            action()
        } label: {
            HStack(spacing: 8) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title)
            }
            .font(.system(size: 15, weight: .heavy))
            .foregroundStyle(kind == .green ? WatchTheme.greenOn : .white)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(kind == .green ? WatchTheme.zoneGreen : WatchTheme.orange)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - HR pill

/// Compact heart-rate readout with a zone-colored dot.
///
/// Sin pulso NO pinta un guion. No fabricar el número estaba bien, pero el guion
/// tampoco era honesto: no dice nada y a 40 mm ocupa el sitio de lo único accionable,
/// que es POR QUÉ no hay dato (§7). Ahora pinta la razón, y el punto de zona
/// desaparece con ella — su color ES el dato, y sin pulso no hay zona que colorear.
struct HRPill: View {
    let bpm: Int?
    let zoneColor: Color
    /// Lo que se dice mientras no llega la primera pulsación.
    var ausente: String = WatchSinDato.pulso

    var body: some View {
        HStack(spacing: 5) {
            if let bpm {
                Circle().fill(zoneColor).frame(width: 8, height: 8)
                Text("\(bpm)")
                    .font(.system(size: 13, weight: .heavy).monospacedDigit())
                    .foregroundStyle(WatchTheme.ink)
            } else {
                Text(ausente)
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(WatchTheme.dim)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        // VoiceOver leyendo «raya» es la misma mentira que pintarla.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(bpm.map { "\(Vocab.fc), \($0) \(Vocab.ppm)" } ?? "\(Vocab.fc), \(ausente)")
    }
}

// MARK: - Live screen scaffold

/// Common frame for a live format screen: a black canvas, an optional top status
/// strip, the hero region (centered), and an optional pinned bottom action. Keeps
/// every family screen laid out identically (status top · hero center · button
/// bottom) without repeating the ZStack/Spacer plumbing.
struct LiveScaffold<Hero: View, Bottom: View>: View {
    var status: String? = nil
    var statusColor: Color = WatchTheme.orangeSoft
    @ViewBuilder var hero: () -> Hero
    @ViewBuilder var bottom: () -> Bottom

    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(spacing: 6) {
                if let status {
                    StatusHeader(text: status, color: statusColor)
                }
                Spacer(minLength: 0)
                hero()
                Spacer(minLength: 0)
                bottom()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
        }
    }
}

extension LiveScaffold where Bottom == EmptyView {
    init(
        status: String? = nil,
        statusColor: Color = WatchTheme.orangeSoft,
        @ViewBuilder hero: @escaping () -> Hero
    ) {
        self.init(status: status, statusColor: statusColor, hero: hero, bottom: { EmptyView() })
    }
}
