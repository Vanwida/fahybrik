import SwiftUI

// MARK: - "Sin compañero" — the one empty state the four Dobles screens share
//
// A Dobles athlete with no linked partner used to walk through FOUR identical
// dead ends (plan conectado, entrenar a la vez, simulación, analíticas
// compartidas) — each one telling them they had no partner, none of them letting
// them get one. And the pair race-gap told them to *ask their coach*, which was
// never true: the athlete invites their partner by email themselves
// (`PartnerService.invitePartner`, the same call ProfileView's invite card makes).
//
// So the exit lives here, once. Every Dobles screen that can find itself without
// a partner renders THIS, and gets the invite sheet with it.

/// The unpaired-Dobles empty state plus its invite sheet. Drop it in wherever a
/// Dobles surface has nothing to show *because there is no partner yet* — as
/// opposed to having a partner and no data, which is a different state with a
/// different (non-)exit.
struct DoblesNoPartnerState: View {
    /// Screen-specific promise: what the athlete unlocks once they pair up.
    let message: String
    var bearer: String?
    /// Re-fetch hook — an accepted invitation changes every Dobles surface.
    var onInvited: () -> Void = {}

    @State private var showInvite = false

    var body: some View {
        RedesignEmptyState(
            symbol: "person.2",
            title: "Aún no tienes compañero",
            message: message,
            exit: .action(title: "Invitar a mi compañero") { showInvite = true }
        )
        .sheet(isPresented: $showInvite) {
            PartnerInviteSheet(bearer: bearer) { _ in onInvited() }
        }
    }
}

// Átomos Dobles compartidos entre superficies (la simulación conjunta y el
// predicho de carrera dobles), para que no se dupliquen y no puedan divergir:
//   • DoblesShareSlider — el reparto por estación a pasos de 5% (self naranja /
//     pareja azul), extraído de DoblesSimulationView.
//   • DoblesCoachTipsCard — la card "Antes de … · De tu coach" con los consejos.

// MARK: - Share slider (reparto 0..1 a pasos de 5%)

/// Reparto de una estación entre los dos atletas: "{TÚ} 60%" — slider — "{PAREJA}
/// 40%". El slider ENGANCHA a pasos de 5% (ni el coach ni el atleta piensan más
/// fino). `selfShare` es la parte del atleta (0..1); la pareja es 1 − selfShare.
/// Self lee en naranja de marca, la pareja en azul (misma leyenda que la
/// simulación conjunta). Deshabilitado cuando no hay datos para recomputar.
struct DoblesShareSlider: View {
    let selfName: String
    let partnerName: String
    @Binding var selfShare: Double
    var enabled: Bool = true

    private var pct: Int { Int((max(0, min(1, selfShare)) * 100).rounded()) }

    var body: some View {
        HStack(spacing: 8) {
            Text("\(selfName) \(pct)%")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(minWidth: 62, alignment: .leading)
            Slider(
                value: Binding(
                    get: { selfShare },
                    // Snap to 5% steps — a coach/athlete never means finer.
                    set: { selfShare = (($0 * 20).rounded()) / 20 }
                ),
                in: 0...1
            )
            .tint(Theme.Color.accent)
            .disabled(!enabled)
            Text("\(partnerName) \(100 - pct)%")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.partner)
                .frame(minWidth: 62, alignment: .trailing)
        }
        .opacity(enabled ? 1 : 0.5)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Reparto: \(selfName) \(pct) por ciento, \(partnerName) \(100 - pct) por ciento")
    }
}

// MARK: - Live pulse dot (#56)

/// A small filled dot that gently pulses to read as "EN VIVO" on the dobles-live strip
/// and the "únete en vivo" banner. `active=false` (a paused partner) holds it steady.
struct LivePulseDot: View {
    var color: Color
    var active: Bool = true
    var size: CGFloat = 7

    @State private var pulsing = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .scaleEffect(active && pulsing ? 1.35 : 1)
            .opacity(active && pulsing ? 0.55 : 1)
            .animation(active ? .easeInOut(duration: 0.9).repeatForever(autoreverses: true) : .default,
                       value: pulsing)
            .onAppear { if active { pulsing = true } }
            .accessibilityHidden(true)
    }
}

// MARK: - Coach tips card ("Antes de … · De tu coach")

/// Los consejos del coach antes de la prueba, como card con viñetas. Título
/// "Antes de la carrera" / "Antes de la sim" + "De {coach}" (el nombre del coach
/// es AGNÓSTICO —viene del dato, no hardcode— y cae a "tu coach" si no se conoce).
/// El caller la oculta si no hay consejos; aquí también se blinda con un guard.
struct DoblesCoachTipsCard: View {
    let title: String
    /// Nombre real del coach (coaches.full_name), o nil → "tu coach".
    var coachName: String? = nil
    let tips: [String]

    var body: some View {
        if tips.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: 2) {
                    LabelText(text: title, color: Theme.Color.accentText)
                    Text("De \(coachName ?? "tu coach")")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.Color.muted)
                }
                VStack(alignment: .leading, spacing: 9) {
                    ForEach(Array(tips.enumerated()), id: \.offset) { _, tip in
                        HStack(alignment: .top, spacing: 9) {
                            Circle()
                                .fill(Theme.Color.accent)
                                .frame(width: 5, height: 5)
                                .padding(.top, 6)
                            Text(tip)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.Color.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(title). De \(coachName ?? "tu coach"). " + tips.joined(separator: ". "))
        }
    }
}
