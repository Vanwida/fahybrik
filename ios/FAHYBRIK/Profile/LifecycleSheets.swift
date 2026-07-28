import SwiftUI

// The two ways out: pause, or leave (#13).
//
// DESIGN INTENT, so nobody "improves" this later into a retention funnel:
// there is no discount offer, no "are you sure" three times, no guilt copy. The
// only thing either sheet tells the athlete is the thing they don't already know
// — how much pause they have left, and that leaving does not forfeit what they
// already paid for. If the exit is made sticky, the athlete stops trusting the
// app with the entrance too.

// MARK: - Shared bits

/// The closed set of reasons, as chips. Same four codes everywhere (0104).
private struct ReasonPicker: View {
    let title: String
    @Binding var selection: PauseReason

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            LabelText(text: title)
            // Wraps to a second line on the narrow phones without clipping.
            FlowRow(spacing: Theme.Spacing.s) {
                ForEach(PauseReason.allCases) { reason in
                    let on = reason == selection
                    Button {
                        selection = reason
                    } label: {
                        Text(reason.label)
                            .font(Theme.Typography.small)
                            .foregroundStyle(on ? Theme.Color.accentText : Theme.Color.muted)
                            .padding(.horizontal, 13)
                            .padding(.vertical, 8)
                            .background(
                                RoundedRectangle(cornerRadius: 11, style: .continuous)
                                    .fill(on ? Theme.Color.accent.opacity(0.14) : Theme.Color.surfaceElevated)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 11, style: .continuous)
                                    .stroke(on ? Theme.Color.accent.opacity(0.4) : .clear, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? [.isSelected] : [])
                }
            }
        }
    }
}

/// A minimal wrapping HStack — chips must never clip on a 4.7" screen.
private struct FlowRow: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth == .infinity ? x : maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// How much of the pause budget is spent, and how much this choice would spend.
private struct BudgetMeter: View {
    /// Days already gone.
    let consumed: Int
    /// Days the current choice would add. 0 when just reporting.
    let pending: Int
    let total: Int

    var body: some View {
        GeometryReader { geo in
            let unit = total > 0 ? geo.size.width / CGFloat(total) : 0
            HStack(spacing: 0) {
                Rectangle()
                    .fill(Theme.Color.accent)
                    .frame(width: min(geo.size.width, unit * CGFloat(consumed)))
                Rectangle()
                    .fill(Theme.Color.accent.opacity(0.45))
                    .frame(width: min(max(0, geo.size.width - unit * CGFloat(consumed)), unit * CGFloat(pending)))
                Spacer(minLength: 0)
            }
        }
        .frame(height: 7)
        .background(Theme.Color.surfaceSunken)
        .clipShape(Capsule())
    }
}

/// The soft orange explainer block both sheets use for "what happens next".
private struct NoteBlock<Content: View>: View {
    var tone: Color = Theme.Color.accent
    @ViewBuilder let content: Content

    var body: some View {
        content
            .font(Theme.Typography.small)
            .foregroundStyle(Theme.Color.foreground)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(13)
            .background(
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .fill(tone.opacity(0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .stroke(tone.opacity(0.22), lineWidth: 1)
            )
    }
}

/// Shared shell for the lifecycle sheets (pausar, darse de baja): scrolling
/// content plus ONE anchored action. Both sheets used to hang their destructive
/// CTA off the tail of the scroll, behind a reason picker and a note.
private struct SheetChrome<Content: View, Action: View>: View {
    let title: String
    let onClose: () -> Void
    @ViewBuilder let content: Content
    @ViewBuilder let action: Action

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        content
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.l)
                }
                .anchoredAction { action }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar", action: onClose)
                        .foregroundStyle(Theme.Color.accentText)
                }
            }
        }
    }
}

// MARK: - Pause

struct PauseSheet: View {
    let state: LifecycleState
    let bearer: String?
    /// Called after a successful pause so the caller can reload.
    let onDone: () -> Void
    let onClose: () -> Void
    /// The athlete ran out of budget and chose to leave instead.
    let onSwitchToBaja: () -> Void

    @State private var reason: PauseReason = .vacaciones
    @State private var returnDate: Date = Calendar.current.date(byAdding: .day, value: 14, to: Date()) ?? Date()
    @State private var inFlight = false
    @State private var error: String?

    /// Days this pause costs: today through the day before returning, inclusive.
    private var cost: Int {
        let today = LifecycleDate.iso(Date())
        guard let gap = LifecycleDate.days(from: today, to: LifecycleDate.iso(returnDate)) else { return 0 }
        return max(0, gap)
    }

    private var exceedsBudget: Bool { cost > state.pause.availableDays }
    private var exhausted: Bool { state.pause.availableDays <= 0 }

    var body: some View {
        SheetChrome(title: "Pausar mi plan", onClose: onClose) {
            if exhausted {
                exhaustedBody
            } else {
                pauseBody
            }
            if let error {
                Text(error)
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.danger)
            }
        } action: {
            if exhausted {
                Button("Darme de baja", action: onSwitchToBaja)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.danger)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            } else {
                PrimaryButton(
                    title: buttonTitle,
                    enabled: !inFlight && !exceedsBudget && cost > 0
                ) {
                    Task { await submit() }
                }
            }
        }
    }

    @ViewBuilder
    private var pauseBody: some View {
        ReasonPicker(title: "Motivo", selection: $reason)

        DatePicker(
            selection: $returnDate,
            in: (Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date())...,
            displayedComponents: .date
        ) {
            LabelText(text: "Vuelvo el")
        }
        .datePickerStyle(.compact)
        .tint(Theme.Color.accentText)
        .padding(13)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(Theme.Color.surfaceElevated))

        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Vas a usar")
                BudgetMeter(consumed: state.pause.consumedDays, pending: cost, total: state.pause.budgetDays)
                Text("\(cost) de tus \(state.pause.availableDays) días disponibles")
                    .font(Theme.Typography.small)
                    .foregroundStyle(exceedsBudget ? Theme.Color.danger : Theme.Color.muted)
            }
        }

        NoteBlock {
            if let vuelve = LifecycleDate.long(LifecycleDate.iso(returnDate)) {
                Text("No se te cobra mientras dure. Tu plaza queda reservada y el plan vuelve solo el \(vuelve).")
            } else {
                Text("No se te cobra mientras dure. Tu plaza queda reservada y el plan vuelve solo.")
            }
        }

        PrimaryButton(
            title: buttonTitle,
            enabled: !inFlight && !exceedsBudget && cost > 0
        ) {
            Task { await submit() }
        }
    }

    private var buttonTitle: String {
        guard let vuelve = LifecycleDate.long(LifecycleDate.iso(returnDate)) else { return "Pausar" }
        return exceedsBudget ? "Te pasas de tus días" : "Pausar hasta el \(vuelve)"
    }

    // Budget spent. NOT a wall — a wall makes them cancel. Two honest ways out.
    @ViewBuilder
    private var exhaustedBody: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Pausa disponible")
                BudgetMeter(consumed: state.pause.budgetDays, pending: 0, total: state.pause.budgetDays)
                Text("0 días · has usado tus \(state.pause.budgetDays)")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.foreground)
                if let renews = LifecycleDate.long(state.pause.renewsOn) {
                    Text("Se te renuevan el \(renews)")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.faint)
                }
            }
        }

        NoteBlock(tone: Theme.Color.neutral) {
            Text("Ya has pausado \(state.pause.budgetDays) días en los últimos doce meses. Puedes seguir parado, pero el cobro no se para.")
        }

        VStack(alignment: .leading, spacing: 7) {
            bullet("Habla con tu entrenador para congelar el plan y no perder la plaza")
            bullet("O date de baja y vuelve cuando quieras, si hay hueco")
        }
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Circle().fill(Theme.Color.accent).frame(width: 5, height: 5).padding(.top, 7)
            Text(text)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @MainActor
    private func submit() async {
        guard !inFlight else { return }
        inFlight = true
        defer { inFlight = false }
        error = nil
        do {
            _ = try await LifecycleService.pause(
                reason: reason,
                returnDate: LifecycleDate.iso(returnDate),
                bearer: bearer
            )
            onDone()
        } catch {
            self.error = "No pudimos pausar tu plan. Reintenta en unos segundos."
        }
    }
}

// MARK: - Baja

struct BajaSheet: View {
    let state: LifecycleState
    let bearer: String?
    let onDone: () -> Void
    let onClose: () -> Void
    /// The athlete took the "mejor pausar" way out.
    let onSwitchToPause: () -> Void

    @State private var reason: PauseReason = .paron
    @State private var inFlight = false
    @State private var error: String?

    /// The last day already paid for. Nil when there is no live period.
    private var lastPaidDay: String? { state.billing.currentPeriodEnd }

    var body: some View {
        SheetChrome(title: "Darme de baja", onClose: onClose) {
            ReasonPicker(title: "¿Por qué te vas?", selection: $reason)

            NoteBlock {
                if let dia = LifecycleDate.long(lastPaidDay) {
                    Text("Entrenas hasta el \(dia), el último día que tienes pagado. Ese día se cierra tu plaza y no se te vuelve a cobrar.")
                } else {
                    Text("Tu baja se aplica hoy. No tienes ningún periodo pagado por delante, así que no se te vuelve a cobrar.")
                }
            }

            VStack(alignment: .leading, spacing: 7) {
                if let dia = LifecycleDate.long(lastPaidDay) {
                    bullet("Puedes echarte atrás hasta el \(dia)")
                }
                bullet("Tu historial, tus marcas y tus carreras se quedan")
                bullet("Si quieres borrar tus datos, eso es aparte, en Cuenta")
            }

            if let error {
                Text(error)
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.danger)
            }
        } action: {
            VStack(spacing: 0) {
                Button {
                    Task { await submit() }
                } label: {
                    Text(confirmTitle)
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(Theme.Color.danger)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(Theme.Color.danger.opacity(0.35), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .disabled(inFlight)

                // Offered ONCE, quietly, and only when they actually have days left.
                if state.pause.availableDays >= 7 {
                    Button("Mejor pausar \(state.availableWeeks) semanas", action: onSwitchToPause)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                }
            }
        }
    }

    private var confirmTitle: String {
        guard let dia = LifecycleDate.long(lastPaidDay) else { return "Confirmar baja" }
        return "Confirmar baja el \(dia)"
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Circle().fill(Theme.Color.accent).frame(width: 5, height: 5).padding(.top, 7)
            Text(text)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @MainActor
    private func submit() async {
        guard !inFlight else { return }
        inFlight = true
        defer { inFlight = false }
        error = nil
        do {
            _ = try await LifecycleService.scheduleBaja(reason: reason, bearer: bearer)
            onDone()
        } catch {
            self.error = "No pudimos tramitar tu baja. Reintenta en unos segundos."
        }
    }
}
