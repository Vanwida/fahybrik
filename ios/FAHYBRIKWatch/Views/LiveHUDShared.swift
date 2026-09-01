import SwiftUI

// Shared display atoms for the live workout HUDs — the giant numeral, the tracked
// label, the status header, the big-tap primary button, the HR pill, the small
// metric tile, and the full-bleed transition interstitial. Every live screen is
// composed from these so hierarchy, sizing and color stay identical across the 5
// format families (design: CLARO · GRANDE · ≤4 métricas · pantalla = botón).

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

// MARK: - Metric tile

/// One small secondary metric (DIST / FC / KCAL / CARGA …). Up to three sit in a
/// row under the hero; the hero always dominates.
///
/// `ausente` es el §7 hecho pieza, igual que `ApoyoVivo` y `ExpertCell` en el
/// teléfono: sin medida no se pinta el hueco, se pinta la RAZÓN. La celda nació sin
/// estado ausente y por eso cada llamante se inventaba su propio `?? "—"`.
struct MetricTile: View {
    let label: String
    /// Nil = no hay medida. No se pinta el hueco: se pinta el porqué.
    let value: String?
    var unit: String? = nil
    /// Lo que se dice cuando el valor no existe («buscando pulso»).
    var ausente: String? = nil

    var body: some View {
        VStack(spacing: 1) {
            WatchLabel(text: label)
                .font(.system(size: 8.5, weight: .heavy))
            if let value {
                HStack(alignment: .lastTextBaseline, spacing: 1) {
                    Text(value)
                        .font(.system(size: 16, weight: .heavy).monospacedDigit())
                        .foregroundStyle(WatchTheme.ink)
                    if let unit {
                        Text(unit)
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(WatchTheme.dim)
                    }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            } else {
                Text(ausente ?? "sin medir")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(WatchTheme.dim)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(WatchTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        // VoiceOver leyendo «raya» es la misma mentira que pintarla.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(textoAccesible)
    }

    private var textoAccesible: String {
        guard let value else { return "\(label), \(ausente ?? "sin medir")" }
        guard let unit else { return "\(label), \(value)" }
        return "\(label), \(value) \(unit)"
    }
}

// MARK: - Set progress dots

/// The 5×5 set-progress row: done (green) · current (orange) · pending (gray).
struct SetDots: View {
    let total: Int
    let currentIndex: Int
    /// Set indices already confirmed as done.
    let doneIndices: Set<Int>

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<max(0, total), id: \.self) { i in
                Circle()
                    .fill(color(for: i))
                    .frame(width: 9, height: 9)
            }
        }
    }

    private func color(for i: Int) -> Color {
        if doneIndices.contains(i) { return WatchTheme.zoneGreen }
        if i == currentIndex { return WatchTheme.orange }
        return WatchTheme.surfaceRaised
    }
}

// MARK: - Transition interstitial

/// The full-bleed dark-orange transition screen shown between blocks / phases and
/// on a HYROX run↔station hand-off ("Entras a — SKIERG / 1000 m"). Big italic
/// name, small subline, optional footer. Tap anywhere to skip its dwell.
struct TransitionScreen: View {
    let eyebrow: String
    let title: String
    var subtitle: String? = nil
    var footer: String? = nil
    var onTap: (() -> Void)? = nil

    var body: some View {
        ZStack {
            WatchTheme.transitionBg.ignoresSafeArea()
            VStack(spacing: 4) {
                Spacer()
                WatchLabel(text: eyebrow, accent: true)
                Text(title)
                    .font(.system(size: 30, weight: .heavy, design: .default).italic())
                    .foregroundStyle(WatchTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(WatchTheme.dim)
                        .lineLimit(1)
                }
                Spacer()
                if let footer {
                    WatchLabel(text: footer)
                        .padding(.bottom, 6)
                }
            }
            .padding(.horizontal, 12)
        }
        .contentShape(Rectangle())
        .onTapGesture { onTap?() }
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
