import SwiftUI

// #56 — el aviso «ÚNETE EN VIVO» (el empujón de Peloton): la pareja está entrenando ahora, en Inicio y en la
// semana conectada. Lleva el tinte del acento del club (es una invitación a actuar; la tira azul es «cómo va
// tu pareja») y el avatar de la pareja en SU azul. Solo presenta `DoblesLiveBannerState`; quien la pone lee la
// presencia una vez al aparecer y es dueño de `onJoin`. El botón solo sale cuando el atleta tiene sesión que
// empezar hoy Y quien la pone da una acción: si no, es informativo.
struct DoblesLiveBanner: View {
    let state: DoblesLiveBannerState
    /// La acción «empezar mi sesión» de quien la pone. Nil (la semana conectada, de solo lectura) → sin botón
    /// aunque el atleta pudiera unirse.
    var onJoin: (() -> Void)? = nil

    var body: some View {
        switch state {
        case .hidden:
            EmptyView()
        case let .visible(name, subtitle, canJoin):
            tarjeta(name: name, subtitle: subtitle, conBoton: canJoin && onJoin != nil)
        }
    }

    private func tarjeta(name: String, subtitle: String, conBoton: Bool) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            HStack(alignment: .center, spacing: Theme.Spacing.m) {
                DoblesAthleteAvatar(initials: initials(name), color: Theme.Color.partner, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(name) está entrenando ahora")
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(subtitle)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityElement(children: .combine)
            enVivo
            if conBoton {
                AccionDobles(titulo: "Únete en vivo") { onJoin?() }
                    .accessibilityLabel("Únete en vivo con \(name)")
            }
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .caraDobles(.acento)
        .accessibilityElement(children: .contain)
    }

    /// La marca «en vivo»: el relleno del acento con su tinta y el punto que late.
    private var enVivo: some View {
        HStack(spacing: Theme.Spacing.xs + 2) {
            LivePulseDot(color: Theme.Color.accentOn, size: 8)
            Text("En vivo")
                .papel(.kicker)
                .foregroundStyle(Theme.Color.accentOn)
        }
        .padding(.horizontal, Theme.Spacing.m)
        .frame(minHeight: 32)
        .background(Theme.Color.accent, in: Capsule())
        .accessibilityHidden(true)
    }

    private func initials(_ name: String) -> String {
        let t = name.trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? "·" : String(t.prefix(1)).uppercased()
    }
}
