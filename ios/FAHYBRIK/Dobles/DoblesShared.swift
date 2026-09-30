import SwiftUI

// MARK: - «Sin compañero» — el único estado vacío que comparten las pantallas de Dobles
//
// Un atleta de Dobles sin pareja vinculada recorría CUATRO callejones idénticos (la semana conectada, entrenar
// a la vez, la simulación, las analíticas compartidas): cada uno le decía que no tenía pareja y ninguno le
// dejaba conseguirla. Y el predicho de carrera de la pareja le decía que se lo pidiera a su coach, cosa que
// nunca fue verdad: el atleta invita a su pareja por correo él mismo (`PartnerService.invitePartner`, la
// misma llamada que hace la tarjeta de invitación de Perfil).
//
// Así que la salida vive aquí, una sola vez. Toda pantalla de Dobles que pueda encontrarse sin pareja pinta
// ESTO, y con ello la hoja de invitación.

/// El estado vacío de Dobles sin pareja, con su hoja de invitación. Ponlo donde una superficie de Dobles no
/// tenga nada que enseñar *porque todavía no hay pareja* — a diferencia de tener pareja y no tener datos, que
/// es otro estado con otra salida (o ninguna).
struct DoblesNoPartnerState: View {
    /// La promesa de cada pantalla: qué se desbloquea cuando os emparejáis.
    let message: String
    var bearer: String?
    /// Releer: una invitación aceptada cambia todas las superficies de Dobles.
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
//   • DoblesShareSlider — el reparto por estación a pasos de 5% (atleta con el
//     acento del club / pareja azul), extraído de DoblesSimulationView.
//   • DoblesCoachTipsCard — la card "Antes de … · De tu coach" con los consejos.

// MARK: - Share slider (reparto 0..1 a pasos de 5%)

/// Reparto de una estación entre los dos atletas: arriba «{TÚ} 60%» y «{PAREJA} 40%» y debajo el slider a todo
/// el ancho (a 15 pt los dos nombres y el slider ya no caben en una línea). El slider ENGANCHA a pasos de 5%
/// (ni el coach ni el atleta piensan más fino). `selfShare` es la parte del atleta (0..1); la pareja es
/// 1 − selfShare. El atleta lee en el acento del club, la pareja en azul (la misma leyenda que la simulación
/// conjunta). Deshabilitado cuando no hay datos para recomputar.
struct DoblesShareSlider: View {
    let selfName: String
    let partnerName: String
    @Binding var selfShare: Double
    var enabled: Bool = true

    private var pct: Int { Int((max(0, min(1, selfShare)) * 100).rounded()) }

    var body: some View {
        VStack(spacing: Theme.Spacing.xs) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                Text("\(selfName) \(pct)%")
                    .papel(.notaPesada)
                    .foregroundStyle(Theme.Color.accentText)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: Theme.Spacing.s)
                Text("\(partnerName) \(100 - pct)%")
                    .papel(.notaPesada)
                    .foregroundStyle(Theme.Color.partner)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
            }
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
        }
        .opacity(enabled ? 1 : 0.5)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Reparto: \(selfName) \(pct) por ciento, \(partnerName) \(100 - pct) por ciento")
    }
}

// MARK: - Live pulse dot (#56)

/// Un punto que late para leerse «EN VIVO» en la tira de dobles en vivo y en el aviso «únete en vivo».
/// `active=false` (una pareja en pausa) lo deja quieto, y con Reducir movimiento también.
struct LivePulseDot: View {
    var color: SwiftUI.Color
    var active: Bool = true
    var size: CGFloat = 7

    @State private var pulsing = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var late: Bool { active && !reduceMotion }

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .scaleEffect(late && pulsing ? 1.35 : 1)
            .opacity(late && pulsing ? 0.55 : 1)
            .animation(late ? .easeInOut(duration: 0.9).repeatForever(autoreverses: true) : .default,
                       value: pulsing)
            .onAppear { if late { pulsing = true } }
            .accessibilityHidden(true)
    }
}

// MARK: - Coach tips card ("Antes de … · De tu coach")

/// Los consejos del coach antes de la prueba, como tarjeta con viñetas. Título «Antes de la carrera» / «Antes
/// de la sim» + «De {coach}» (el nombre del coach es AGNÓSTICO —viene del dato, no hardcode— y cae a «tu coach»
/// si no se conoce). Quien la pone la oculta si no hay consejos; aquí también se blinda con un guard.
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
                    Text(title)
                        .papel(.etiqueta)
                        .foregroundStyle(Theme.Color.accentText)
                    Text("De \(coachName ?? "tu coach")")
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    ForEach(Array(tips.enumerated()), id: \.offset) { _, tip in
                        HStack(alignment: .top, spacing: Theme.Spacing.m) {
                            Circle()
                                .fill(Theme.Color.accent)
                                .frame(width: 6, height: 6)
                                // A la altura de la primera línea de 17 pt (su x-height queda ~10 pt bajo el borde).
                                .padding(.top, 10)
                                .accessibilityHidden(true)
                            Text(tip)
                                .papel(.cuerpo)
                                .foregroundStyle(Theme.Color.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
            .padding(Theme.Spacing.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .caraDobles(.neutra)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(title). De \(coachName ?? "tu coach"). " + tips.joined(separator: ". "))
        }
    }
}
