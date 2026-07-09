import SwiftUI

// #34 — the athlete's calibration battery card: "Tus tests · X / N" where N is
// what the COACH programmed (never a fixed 4), plus each test's state
// (pendiente → hazlo · resultado pendiente → nudge para añadir el número ·
// hecho ✓). It NEVER shows a broken "0/0": with nothing scheduled it renders
// the honest "Pablo prepara tu semana" state.
//
// Presentational + a self-loading Inicio wrapper that hosts the "resultado
// pendiente" capture (fetches the session's store_results contract, then the
// bridge capture sheet) and hands "pendiente" taps up to open the session.

struct TestBatteryCard: View {
    let status: BatteryStatus
    /// Open a pending test's session (the athlete runs it like any session).
    var onOpenSession: (CalibrationTestStatus) -> Void = { _ in }
    /// Add the number for a test that RAN but was never captured (the nudge).
    var onCaptureTest: (CalibrationTestStatus) -> Void = { _ in }

    var body: some View {
        if status.isScheduled {
            scheduledCard
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
                }

                Text(stakeSubtitle)
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(spacing: 0) {
                    ForEach(Array(status.tests.enumerated()), id: \.element.id) { idx, test in
                        if idx > 0 { Hairline() }
                        testRow(test)
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

    @ViewBuilder
    private func testRow(_ test: CalibrationTestStatus) -> some View {
        switch test.displayState {
        case .pending:
            Button {
                Haptics.light()
                onOpenSession(test)
            } label: { rowContent(test) }
            .buttonStyle(PressScaleStyle())
        case .resultPending:
            Button {
                Haptics.light()
                onCaptureTest(test)
            } label: { rowContent(test) }
            .buttonStyle(PressScaleStyle())
        case .done:
            rowContent(test)
        }
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
                    Text("Pablo prepara tu semana")
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
// permanent "preparando" placeholder for athletes without tests. Hosts the
// "resultado pendiente" capture (fetch the session's store_results contract →
// bridge capture sheet); "pendiente" taps are handed up to open the session.

struct TestBatteryInicioSection: View {
    let bearer: String?
    /// Bumped by Inicio (pull-to-refresh, a completed workout) to reload status.
    var reloadNonce: Int = 0
    /// Open a pending test's session — Inicio owns the WorkoutContainer cover.
    let onOpenSession: (_ assignmentId: String, _ title: String) -> Void

    @State private var status: BatteryStatus? = nil
    @State private var captureTarget: CaptureTarget? = nil

    // The assignment whose result the athlete is entering, with its resolved
    // store_results contract. Identifiable so the sheet binds to it directly.
    private struct CaptureTarget: Identifiable {
        let id: String            // assignmentId
        let specs: [StoreResultSpec]
    }

    var body: some View {
        Group {
            if let status, status.isScheduled {
                TestBatteryCard(
                    status: status,
                    onOpenSession: { onOpenSession($0.assignmentId, $0.label) },
                    onCaptureTest: { test in Task { await openCapture(test) } }
                )
            }
        }
        .task(id: reloadToken) { await load() }
        .sheet(item: $captureTarget) { target in
            TestResultCaptureSheet(
                assignmentId: target.id,
                specs: target.specs,
                bearer: bearer,
                onDone: {
                    captureTarget = nil
                    Task { await load() }
                }
            )
        }
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

    // Resolve the session's store_results contract, then open the capture sheet
    // for a manual entry (no live pre-fill — the session already ran).
    private func openCapture(_ test: CalibrationTestStatus) async {
        guard let bearer else { return }
        do {
            let detail = try await PlanService.fetchAssignmentDetail(test.assignmentId, bearer: bearer)
            let specs = detail.storeResults
            guard !specs.isEmpty else { return }
            captureTarget = CaptureTarget(id: test.assignmentId, specs: specs)
        } catch {
            // Couldn't resolve the contract — leave the nudge in place; the athlete
            // can retry. No fabricated capture.
        }
    }
}
