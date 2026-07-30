import SwiftUI

// #28 — the pair-rhythm block at the top of the Dobles plan: two tiles (joint sessions
// this month · consecutive weeks with ≥1 joint) and the "última juntos" card. Pure
// presentation over the additive `streak` block; the caller only renders it when there
// is real history (DoblesStreakBlock.hasHistory), so a fresh pair sees nothing.
struct DoblesStreakSection: View {
    let streak: DoblesStreakBlock
    /// Partner first name (the plan view knows it via PartnerInfo) for the last-joint line.
    let partnerName: String

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            HStack(spacing: Theme.Spacing.s) {
                tile(value: "\(streak.jointThisMonth)", sub: "este mes",
                     caption: "SESIONES JUNTOS", hot: true)
                tile(value: "\(streak.weeksStreak)", sub: "seguidas",
                     caption: "SEMANAS CON ≥1 JUNTOS", hot: false)
            }
            if let last = streak.lastJoint {
                lastJointCard(last)
            }
        }
    }

    // MARK: - Tiles

    private func tile(value: String, sub: String, caption: String, hot: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(value)
                    .font(.system(size: 34, weight: .heavy, design: .default).italic().monospacedDigit())
                    .foregroundStyle(hot ? Theme.Color.accentText : Theme.Color.foreground)
                Text(sub)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
            }
            Text(caption)
                .font(.system(size: 9, weight: .heavy)).tracking(0.5).textCase(.uppercase)
                .foregroundStyle(Theme.Color.faint)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(hot ? Theme.Color.accent.opacity(0.12) : Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(hot ? Theme.Color.accent.opacity(0.35) : Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(value) \(sub), \(caption)")
    }

    // MARK: - Última juntos

    private func lastJointCard(_ last: DoblesLastJoint) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                LabelText(text: "Última juntos", color: Theme.Color.accentText, size: 10)
                Spacer()
                Text(DoblesJointFormat.isoDayMonth(last.date))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
            Text(last.title)
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
            // Cada tiempo se pinta sólo si se registró. La sesión ya pasó y no
            // hay nada que el atleta pueda hacer para recuperar un tiempo que
            // nadie tomó: se calla (§6.2 bis). Si no hay ninguno, la fila entera
            // desaparece en vez de quedarse con dos rayas.
            if last.selfTimeS != nil || last.partnerTimeS != nil {
                HStack(spacing: 10) {
                    if let selfS = last.selfTimeS {
                        timePair(name: "Tú", seconds: selfS, color: Theme.Color.accent)
                    }
                    if let partnerS = last.partnerTimeS {
                        if last.selfTimeS != nil {
                            Text("·").foregroundStyle(Theme.Color.faint)
                        }
                        timePair(name: partnerName, seconds: partnerS, color: Theme.Color.partner)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    /// Nombre + tiempo. Pide el tiempo NO opcional a propósito: quien llama ya
    /// decidió que existe, y así aquí no queda un hueco que rellenar.
    private func timePair(name: String, seconds: Int, color: Color) -> some View {
        HStack(spacing: 5) {
            Text(name)
                .font(.system(size: 11, weight: .heavy).italic())
                .foregroundStyle(color)
            Text(Formato.clock(seconds))
                .font(.system(size: 14, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
        }
    }
}
