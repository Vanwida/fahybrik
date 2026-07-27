import SwiftUI

// #34 — the athlete's calibration battery card: "Tus tests · X / N" where N is
// what the COACH programmed (never a fixed 4), plus each test's state
// (pendiente → hazlo · resultado pendiente → nudge para añadir el número ·
// hecho ✓). It NEVER shows a broken "0/0": with nothing scheduled it renders
// the honest "Pablo prepara tu semana" state.
//
// Tests guiados: the card SUMMARIZES and NAVIGATES — one tap anywhere opens the
// Tests hub (TestsHubView), where every action lives («Probarme», «Continuar»,
// «Añadir resultado», curvas, zonas). The rows here are read-only state.

struct TestBatteryCard: View {
    let status: BatteryStatus
    /// Open the Tests hub — the single action of the whole card.
    var onOpen: () -> Void = {}

    var body: some View {
        if status.isScheduled {
            Button {
                Haptics.light()
                onOpen()
            } label: { scheduledCard }
            .buttonStyle(PressScaleStyle())
            .accessibilityHint("Abre tus tests y benchmarks")
        } else {
            preparingCard
        }
    }

    // MARK: Active battery

    private var scheduledCard: some View {
        CardSurface(padding: Theme.Spacing.l, topAccent: status.isComplete) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                HStack(alignment: .firstTextBaseline) {
                    LabelText(text: "Tus tests · Calibración", color: Theme.Color.accentText)
                    Spacer(minLength: Theme.Spacing.s)
                    HStack(alignment: .lastTextBaseline, spacing: 2) {
                        Text("\(status.completed)")
                            .font(Theme.Typography.readoutM)
                            .foregroundStyle(status.isComplete ? Theme.Color.ok : Theme.Color.foreground)
                        Text("/\(status.total)")
                            .font(.system(size: 18, weight: .bold, design: .monospaced))
                            .foregroundStyle(Theme.Color.muted)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(status.completed) de \(status.total) tests con resultado")
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.faint)
                        .padding(.leading, 6)
                }

                Text(stakeSubtitle)
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(spacing: 0) {
                    ForEach(Array(status.tests.enumerated()), id: \.element.id) { idx, test in
                        if idx > 0 { Hairline() }
                        rowContent(test)
                    }
                }
                .padding(.top, Theme.Spacing.xs)
            }
        }
    }

    private var stakeSubtitle: String {
        if status.isComplete {
            return "Batería completa. Tu plan está calibrado con tus números reales."
        }
        if status.firstPendingResult != nil {
            return "Añade el resultado que falta para calibrar tu plan."
        }
        return "Fijan tus zonas, tu 1RM y tu nivel. Hazlos frescos: marcan tus números."
    }

    private func rowContent(_ test: CalibrationTestStatus) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            stateGlyph(test.displayState)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(test.label)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                Text(substatus(test))
                    .font(Theme.Typography.caption)
                    .foregroundStyle(substatusColor(test.displayState))
            }
            Spacer(minLength: Theme.Spacing.s)
            trailing(test)
        }
        .padding(.vertical, Theme.Spacing.m)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(test.label). \(substatus(test))")
    }

    @ViewBuilder
    private func stateGlyph(_ state: CalibrationTestStatus.DisplayState) -> some View {
        switch state {
        case .pending:
            Image(systemName: "stopwatch")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
        case .resultPending:
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.Color.warning)
        case .done:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.Color.ok)
        }
    }

    private func substatus(_ test: CalibrationTestStatus) -> String {
        switch test.displayState {
        case .pending:       return dateLabel(test.scheduledFor)
        case .resultPending: return "Resultado pendiente"
        case .done:          return test.resultLabel ?? "Hecho"
        }
    }

    private func substatusColor(_ state: CalibrationTestStatus.DisplayState) -> Color {
        switch state {
        case .resultPending: return Theme.Color.warning
        case .done:          return Theme.Color.ok
        case .pending:       return Theme.Color.muted
        }
    }

    @ViewBuilder
    private func trailing(_ test: CalibrationTestStatus) -> some View {
        switch test.displayState {
        case .pending:
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
        case .resultPending:
            Text("Añadir")
                .font(.system(size: 11, weight: .bold))
                .tracking(0.4)
                .foregroundStyle(Theme.Color.accentText)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Theme.Color.accent.opacity(0.14))
                .clipShape(Capsule())
        case .done:
            EmptyView()
        }
    }

    // MARK: Not-scheduled ("preparando")

    private var preparingCard: some View {
        CardSurface(padding: Theme.Spacing.l) {
            HStack(spacing: Theme.Spacing.m) {
                Image(systemName: "stopwatch")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(width: 44, height: 44)
                    .background(Theme.Color.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    LabelText(text: "Tus tests")
                    Text("Tu coach prepara tu semana")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Tus tests de calibración aparecerán aquí cuando los programe.")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
    }

    // "10 jul" from an ISO YYYY-MM-DD; the raw string if it can't parse (never
    // fabricated). Self-contained so the card carries its own tiny formatter.
    private func dateLabel(_ iso: String) -> String {
        let parts = iso.split(separator: "-")
        guard parts.count == 3, let m = Int(parts[1]), let d = Int(parts[2]),
              (1...12).contains(m) else { return iso }
        let months = ["ene", "feb", "mar", "abr", "may", "jun",
                      "jul", "ago", "sep", "oct", "nov", "dic"]
        return "\(d) \(months[m - 1])"
    }
}

// MARK: - Self-loading Inicio section
//
// Loads the battery status for the athlete and renders the card only when a
// battery is actually scheduled (total > 0) — so Inicio never carries a
// permanent "preparando" placeholder for athletes without tests. The card is a
// SUMMARY: every action (run a test, capture a missing number, see the curves)
// lives in the Tests hub the tap opens.

struct TestBatteryInicioSection: View {
    let bearer: String?
    /// Bumped by Inicio (pull-to-refresh, a completed workout) to reload status.
    var reloadNonce: Int = 0
    /// Open the Tests hub — Inicio owns the cover.
    let onOpenHub: () -> Void

    @State private var status: BatteryStatus? = nil

    var body: some View {
        Group {
            if let status, status.isScheduled {
                TestBatteryCard(status: status, onOpen: onOpenHub)
            }
        }
        .task(id: reloadToken) { await load() }
    }

    // Reload whenever the bearer changes OR Inicio bumps the nonce.
    private var reloadToken: String { "\(bearer ?? "-")#\(reloadNonce)" }

    private func load() async {
        guard let bearer else { status = .empty; return }
        do {
            status = try await TestBatteryService.fetchStatus(bearer: bearer)
        } catch {
            // Honest: on failure keep any prior status, else treat as none (the
            // card hides) — never a broken shell.
            if status == nil { status = .empty }
        }
    }
}
