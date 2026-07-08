import SwiftUI

// #34 — the capture step shown when the athlete FINISHES a calibration test (or
// taps a "resultado pendiente" test from the battery card). It PRE-FILLS the
// measured number(s) from the execution — the live time for a time-trial, the
// heaviest logged set for a 1RM — so the athlete only confirms/edits, then it
// posts to the ejecución→benchmark BRIDGE (TestBatteryService.recordResults),
// which calibrates zones / 1RM and re-runs the level. The feedback is HONEST:
// it claims only what actually changed ("Zonas actualizadas", and "Nivel
// recalculado" ONLY when the bridge reports it).
//
// One test can promise several results (a 1RM battery → squat + deadlift +
// bench), so it renders one input per `StoreResultSpec`, each with the input
// shape its `measure` needs (time → mm:ss; load → kg; the rest → a number).

// MARK: - Measure → typed input

enum TestMeasure {
    case time      // seconds, entered as mm:ss
    case load      // kg
    case distance  // meters
    case reps
    case calories
    case other     // unknown future measure → plain number, no unit assumptions

    init(_ raw: String) {
        switch raw {
        case "time":     self = .time
        case "load":     self = .load
        case "distance": self = .distance
        case "reps":     self = .reps
        case "calories": self = .calories
        default:         self = .other
        }
    }

    /// Adjustment step for the ± buttons, in the measure's own unit.
    var step: Double {
        switch self {
        case .time:     return 5     // seconds
        case .load:     return 3     // kg (matches the coach 1RM cadence)
        case .distance: return 50    // meters
        case .reps:     return 1
        case .calories: return 5
        case .other:    return 1
        }
    }

    /// Short unit shown next to a numeric field (time uses mm:ss, no unit chip).
    var unitLabel: String {
        switch self {
        case .load:     return "kg"
        case .distance: return "m"
        case .reps:     return "reps"
        case .calories: return "cal"
        case .time, .other: return ""
        }
    }

    var usesDecimals: Bool { self == .load }
}

// MARK: - Pre-fill from the live execution

/// Maps a finished session's measured work onto the test's result slugs, so the
/// capture sheet opens with the real number already in place. Reads only the
/// session's public accessors — never fabricates: a measure with no captured
/// value simply starts empty (the athlete enters it).
enum TestBatteryPrefill {
    static func map(session: WorkoutSession, specs: [StoreResultSpec]) -> [String: Double] {
        var out: [String: Double] = [:]
        for spec in specs {
            if let v = value(session: session, measure: TestMeasure(spec.measure)) {
                out[spec.slug] = v
            }
        }
        return out
    }

    private static func value(session: WorkoutSession, measure: TestMeasure) -> Double? {
        switch measure {
        case .time:
            // The conditioning engine's captured headline time (For Time / HYROX
            // sim), else the total elapsed clock.
            if let t = session.capturedScoreTimeSeconds, t > 0 { return Double(t) }
            let e = Int(session.elapsedSeconds.rounded())
            return e > 0 ? Double(e) : nil
        case .load:
            // Heaviest load actually logged (the 1RM proxy): the max across every
            // segment's recorded weight.
            return session.laps.compactMap { $0.weightUsedKg }.max()
        case .distance:
            let d = session.laps.compactMap { $0.distanceCoveredMeters }.reduce(0, +)
            return d > 0 ? d : nil
        case .reps:
            let r = session.laps.compactMap { $0.repsCompleted }.reduce(0, +)
            return r > 0 ? Double(r) : nil
        case .calories:
            let c = session.laps.compactMap { $0.calories }.reduce(0, +)
            return c > 0 ? c : nil
        case .other:
            return nil
        }
    }
}

// MARK: - Sheet

struct TestResultCaptureSheet: View {
    let assignmentId: String
    let specs: [StoreResultSpec]
    /// slug → measured value from the live execution (empty for a standalone
    /// "resultado pendiente" nudge opened from the card).
    var prefill: [String: Double] = [:]
    let bearer: String?
    /// Fired when the athlete is done with this step — after a successful save OR
    /// a skip. The caller closes the flow / refreshes the battery.
    let onDone: () -> Void

    private enum Stage: Equatable { case editing, submitting, done }

    @State private var rows: [Row] = []
    @State private var stage: Stage = .editing
    @State private var result: RecordBatteryResult? = nil
    @State private var errorText: String? = nil
    @Environment(\.colorScheme) private var scheme

    // One editable result. Text-backed (not Double-backed) so numeric entry never
    // fights a formatter; the value is parsed on save.
    private struct Row: Identifiable {
        var id: String { spec.slug }
        let spec: StoreResultSpec
        var measure: TestMeasure
        var minText: String   // time
        var secText: String   // time
        var amountText: String // load/distance/reps/calories/other

        var value: Double? {
            switch measure {
            case .time:
                let m = Int(minText.trimmingCharacters(in: .whitespaces)) ?? 0
                let s = Int(secText.trimmingCharacters(in: .whitespaces)) ?? 0
                let total = m * 60 + s
                return total > 0 ? Double(total) : nil
            default:
                let cleaned = amountText.replacingOccurrences(of: ",", with: ".")
                    .trimmingCharacters(in: .whitespaces)
                guard let v = Double(cleaned), v > 0 else { return nil }
                return v
            }
        }
    }

    private var canSave: Bool {
        bearer != nil && !rows.isEmpty && rows.allSatisfy { $0.value != nil }
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                topBar
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        if stage == .done {
                            doneContent
                        } else {
                            editingContent
                        }
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
            }
        }
        .onAppear(perform: seedRows)
    }

    // MARK: Top bar

    private var topBar: some View {
        HStack {
            LabelText(text: "Test · Calibración", color: Theme.Color.accentText)
            Spacer()
            if stage != .submitting {
                Button {
                    Haptics.light()
                    onDone()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                        .frame(width: 34, height: 34)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Cerrar")
            }
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.s)
    }

    // MARK: Editing

    @ViewBuilder
    private var editingContent: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Registra tu resultado")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
            Text("Confirma tu marca real. Fija tus zonas y tu 1RM y calibra tu plan con datos, no estimaciones.")
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }

        ForEach($rows) { $row in
            resultCard($row)
        }

        if let errorText {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 13, weight: .semibold))
                Text(errorText)
                    .font(Theme.Typography.small)
            }
            .foregroundStyle(Theme.Color.danger)
        }

        VStack(spacing: Theme.Spacing.s) {
            PrimaryButton(
                title: stage == .submitting ? "Guardando…" : "Guardar resultado",
                enabled: canSave && stage != .submitting
            ) {
                Task { await save() }
            }
            SecondaryButton(title: "Ahora no") {
                Haptics.light()
                onDone()
            }
            .disabled(stage == .submitting)
        }
        .padding(.top, Theme.Spacing.s)

        if bearer == nil {
            Text("Inicia sesión para guardar tu resultado.")
                .font(Theme.Typography.caption)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    private func resultCard(_ row: Binding<Row>) -> some View {
        let measure = row.wrappedValue.measure
        return CardSurface(padding: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                LabelText(text: row.wrappedValue.spec.label)
                if measure == .time {
                    TimeEntry(minText: row.minText, secText: row.secText, step: measure.step)
                } else {
                    AmountEntry(
                        text: row.amountText,
                        unit: measure.unitLabel,
                        step: measure.step,
                        decimals: measure.usesDecimals
                    )
                }
            }
        }
    }

    // MARK: Done (honest feedback)

    @ViewBuilder
    private var doneContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(Theme.Color.ok)
                Text("Resultado guardado")
                    .font(Theme.Typography.headlineS)
                    .foregroundStyle(Theme.Color.foreground)
            }

            let effects = result?.effects ?? []
            if effects.isEmpty {
                Text("Tu marca queda registrada en tu perfil.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
            } else {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    ForEach(effects, id: \.self) { effect in
                        HStack(spacing: 9) {
                            Image(systemName: "arrow.up.right.circle.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.Color.accentText)
                            Text(effect)
                                .font(Theme.Typography.bodyEmph)
                                .foregroundStyle(Theme.Color.foreground)
                        }
                    }
                }
                .padding(Theme.Spacing.l)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Color.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.hairline, lineWidth: 1)
                )
            }

            PrimaryButton(title: "Hecho") {
                Haptics.light()
                onDone()
            }
            .padding(.top, Theme.Spacing.s)
        }
    }

    // MARK: Actions

    private func seedRows() {
        guard rows.isEmpty else { return }
        rows = specs.map { spec in
            let measure = TestMeasure(spec.measure)
            let pre = prefill[spec.slug]
            if measure == .time {
                let secs = Int((pre ?? 0).rounded())
                return Row(
                    spec: spec, measure: measure,
                    minText: secs > 0 ? String(secs / 60) : "",
                    secText: secs > 0 ? String(format: "%02d", secs % 60) : "",
                    amountText: ""
                )
            } else {
                let text: String
                if let pre {
                    text = measure.usesDecimals
                        ? trimmedDecimal(pre)
                        : String(Int(pre.rounded()))
                } else {
                    text = ""
                }
                return Row(spec: spec, measure: measure, minText: "", secText: "", amountText: text)
            }
        }
    }

    private func save() async {
        guard let bearer, canSave else { return }
        let entries: [TestResultEntry] = rows.compactMap { row in
            guard let v = row.value else { return nil }
            return TestResultEntry(slug: row.spec.slug, value: v)
        }
        guard !entries.isEmpty else { return }
        stage = .submitting
        errorText = nil
        do {
            let res = try await TestBatteryService.recordResults(
                assignmentId: assignmentId,
                entries: entries,
                bearer: bearer
            )
            result = res
            Haptics.success()
            stage = .done
        } catch {
            stage = .editing
            errorText = "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo."
        }
    }

    /// "142.5" without a trailing ".0" — kg display for the prefill seed.
    private func trimmedDecimal(_ v: Double) -> String {
        let rounded = (v * 10).rounded() / 10
        return rounded == rounded.rounded()
            ? String(Int(rounded))
            : String(format: "%.1f", rounded)
    }
}

// MARK: - Entry controls

/// A big mono numeric field with − / + fine-adjust buttons, in the instrument
/// readout voice. Backed by a String binding so typing never fights a formatter.
private struct AmountEntry: View {
    @Binding var text: String
    let unit: String
    let step: Double
    let decimals: Bool
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            stepButton("minus") { adjust(-step) }
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                TextField("0", text: $text)
                    .keyboardType(decimals ? .decimalPad : .numberPad)
                    .focused($focused)
                    .font(Theme.Typography.readoutL)
                    .foregroundStyle(Theme.Color.foreground)
                    .multilineTextAlignment(.center)
                    .fixedSize()
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 15, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(maxWidth: .infinity)
            stepButton("plus") { adjust(step) }
        }
    }

    private func adjust(_ delta: Double) {
        let current = Double(text.replacingOccurrences(of: ",", with: ".")) ?? 0
        let next = max(0, current + delta)
        text = decimals
            ? (next == next.rounded() ? String(Int(next)) : String(format: "%.1f", next))
            : String(Int(next.rounded()))
        Haptics.light()
    }

    private func stepButton(_ system: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 44, height: 44)
                .background(Theme.Color.surfaceElevated)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle())
    }
}

/// mm:ss entry — two mono fields with a colon, plus − / + on the whole time
/// (adjusts seconds, rolling into minutes). For time-trial results (5K, 2K).
private struct TimeEntry: View {
    @Binding var minText: String
    @Binding var secText: String
    let step: Double

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            stepButton("minus") { adjust(-step) }
            HStack(alignment: .center, spacing: 4) {
                field($minText, placeholder: "0")
                Text(":")
                    .font(Theme.Typography.readoutL)
                    .foregroundStyle(Theme.Color.muted)
                field($secText, placeholder: "00")
            }
            .frame(maxWidth: .infinity)
            stepButton("plus") { adjust(step) }
        }
    }

    private func field(_ binding: Binding<String>, placeholder: String) -> some View {
        TextField(placeholder, text: binding)
            .keyboardType(.numberPad)
            .font(Theme.Typography.readoutL)
            .foregroundStyle(Theme.Color.foreground)
            .multilineTextAlignment(.center)
            .frame(minWidth: 62)
            .fixedSize()
    }

    private func adjust(_ delta: Double) {
        let m = Int(minText) ?? 0
        let s = Int(secText) ?? 0
        let total = max(0, m * 60 + s + Int(delta))
        minText = String(total / 60)
        secText = String(format: "%02d", total % 60)
        Haptics.light()
    }

    private func stepButton(_ system: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 44, height: 44)
                .background(Theme.Color.surfaceElevated)
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.Color.hairlineStrong, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle())
    }
}
