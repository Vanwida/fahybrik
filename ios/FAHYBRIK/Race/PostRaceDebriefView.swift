import SwiftUI

// Post-race debrief — day after the A-event, athlete records subjective
// recap + lessons. Spec sub-flow C.
//
// Sections:
//   - Time + position banner (read-only from RaceResult).
//   - Per-station planned vs actual table.
//   - Subjective: Soreness post (1-5), Energía durante (1-5), crisis y/n
//     + estación + texto.
//   - Lecciones: what worked / what to improve / pace realism / texto libre.
struct PostRaceDebriefView: View {
    let plan: RacePlan
    let result: RaceResult
    let bearer: String?
    let onSubmitted: () -> Void
    let onSkipped: () -> Void

    @State private var soreness: Int? = nil
    @State private var energy: Int? = nil
    @State private var hadCrisis: Bool = false
    @State private var crisisStation: Int? = nil
    @State private var crisisNotes: String = ""
    @State private var whatWorked: String = ""
    @State private var whatToImprove: String = ""
    @State private var paceRealism: RacePaceRealism? = nil
    @State private var lessonsText: String = ""
    @State private var submitting: Bool = false
    @FocusState private var focusedField: Field?

    enum Field { case crisis, worked, improve, lessons }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    completedHero
                    stationBreakdownCard
                    feltCard
                    crisisCard
                    lessonsCard
                    submitArea
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Hecho") { focusedField = nil }
                    .foregroundStyle(Theme.Color.accentText)
            }
        }
    }

    // MARK: Hero

    private var completedHero: some View {
        CardSurface(padding: 16, topAccent: true) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Color.ok)
                    LabelText(text: "Carrera completada", color: Theme.Color.ok)
                }
                Text("\(plan.id == result.race_plan_id ? "" : "")Tiempo")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                HStack(alignment: .lastTextBaseline, spacing: 12) {
                    Text(RaceFormat.time(result.finish_time_seconds))
                        .font(.system(size: 38, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                    if let goal = plan.time_goal_seconds {
                        let delta = result.finish_time_seconds - goal
                        MonoText(
                            text: "vs goal \(RaceFormat.time(goal)) · \(delta >= 0 ? "+" : "")\(deltaLabel(delta))",
                            size: 12,
                            color: delta <= 0 ? Theme.Color.ok : Theme.Color.warning
                        )
                    }
                }
                if let pos = result.finish_position {
                    MonoText(
                        text: "Posición \(pos)\(result.division.map { " · \($0)" } ?? "")",
                        size: 12,
                        color: Theme.Color.muted
                    )
                }
            }
        }
    }

    private func deltaLabel(_ s: Int) -> String {
        let abs = abs(s)
        let mm = abs / 60
        let ss = abs % 60
        if mm == 0 { return "\(ss)s" }
        return String(format: "%d:%02d", mm, ss)
    }

    // MARK: Station breakdown

    private var stationBreakdownCard: some View {
        CardSurface(padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Análisis por estación")
                VStack(spacing: 0) {
                    ForEach(plan.station_pacing) { row in
                        let actual = result.station_actuals.first { $0.station_index == row.station_index }
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            MonoText(
                                text: String(format: "%02d", row.station_index),
                                size: 11,
                                color: Theme.Color.muted
                            )
                            .frame(width: 24, alignment: .trailing)
                            Text(HyroxStation.labels[row.station_index] ?? row.label)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.Color.foreground)
                                .frame(width: 130, alignment: .leading)
                            MonoText(
                                text: actual.map { RaceFormat.time($0.duration_seconds) } ?? "—",
                                size: 12,
                                color: Theme.Color.foreground
                            )
                            .frame(width: 60, alignment: .leading)
                            if let n = actual?.notes {
                                Text(n)
                                    .font(.system(size: 11))
                                    .foregroundStyle(Theme.Color.warning)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 6)
                        if row.station_index < HyroxStation.count {
                            Hairline()
                        }
                    }
                }
            }
        }
    }

    // MARK: Subjective how-it-felt

    private var feltCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                LabelText(text: "¿Cómo lo sentiste?")
                VStack(alignment: .leading, spacing: 6) {
                    Text("Soreness post")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                    Scale1to5Picker(value: $soreness, leftHint: "1 ninguno", rightHint: "5 mucho")
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Energía durante")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                    Scale1to5Picker(value: $energy, leftHint: "1 vacío", rightHint: "5 a tope")
                }
            }
        }
    }

    // MARK: Crisis

    private var crisisCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    LabelText(text: "Crisis")
                    Spacer()
                    Toggle("", isOn: $hadCrisis)
                        .labelsHidden()
                        .tint(Theme.Color.accent)
                }
                if hadCrisis {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Estación (1-16)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.Color.foreground)
                        TextField("8", value: Binding<Int>(
                            get: { crisisStation ?? 0 },
                            set: { crisisStation = ($0 == 0 ? nil : min(max($0, 1), HyroxStation.count)) }
                        ), format: .number)
                            .keyboardType(.numberPad)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Theme.Color.surfaceElevated)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                            .foregroundStyle(Theme.Color.foreground)
                            .font(.system(size: 14, design: .monospaced).monospacedDigit())
                        Text("¿Qué hiciste?")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.Color.foreground)
                        notesField($crisisNotes, placeholder: "Bajé pace, respiración 4-4, recuperé en run 9")
                            .focused($focusedField, equals: .crisis)
                    }
                }
            }
        }
    }

    // MARK: Lecciones

    private var lessonsCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                LabelText(text: "Lecciones para próximo macrociclo")
                Text("Lo que funcionó")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                notesField($whatWorked, placeholder: "Pace controlado primeros 5km")
                    .focused($focusedField, equals: .worked)
                Text("Lo que mejoraría")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                notesField($whatToImprove, placeholder: "Cadencia BBJ se rompió a partir del 50%")
                    .focused($focusedField, equals: .improve)
                Text("Pace realismo")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                HStack(spacing: 8) {
                    ForEach(RacePaceRealism.allCases) { option in
                        PillChip(
                            title: option.label,
                            selected: paceRealism == option,
                            action: { paceRealism = option }
                        )
                    }
                    Spacer(minLength: 0)
                }
                Text("Notas libres")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                notesField($lessonsText, placeholder: "Cualquier otra cosa que quieras dejar.")
                    .focused($focusedField, equals: .lessons)
            }
        }
    }

    private func notesField(_ text: Binding<String>, placeholder: String) -> some View {
        ZStack(alignment: .topLeading) {
            if text.wrappedValue.isEmpty {
                Text(placeholder)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.muted.opacity(0.7))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
            }
            TextEditor(text: text)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.foreground)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .frame(minHeight: 76)
                .background(Theme.Color.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
    }

    // MARK: Submit

    private var canSubmit: Bool {
        guard let _ = soreness, let _ = energy, let _ = paceRealism else { return false }
        if hadCrisis && crisisStation == nil { return false }
        return true
    }

    private var submitArea: some View {
        VStack(spacing: 8) {
            ExpertPrimaryButton(
                title: submitting ? "GUARDANDO…" : "▶ GUARDAR DEBRIEF",
                height: 50,
                enabled: canSubmit && !submitting
            ) {
                submit()
            }
            Button(action: onSkipped) {
                Text("Ahora no")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.muted)
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 4)
    }

    private func submit() {
        guard canSubmit, let s = soreness, let e = energy, let r = paceRealism else { return }
        submitting = true
        let payload = RaceDebriefSubmit(
            race_result_id: result.id,
            soreness_post: s,
            energy_during: e,
            had_crisis: hadCrisis,
            crisis_at_station: hadCrisis ? crisisStation : nil,
            crisis_notes: hadCrisis ? trimToNil(crisisNotes) : nil,
            what_worked: trimToNil(whatWorked),
            what_to_improve: trimToNil(whatToImprove),
            pace_realism: r,
            lessons_text: trimToNil(lessonsText)
        )
        Task {
            await RaceAPI.submitDebrief(payload, bearer: bearer)
            RaceStore.markDebriefCompleted(forResultId: result.id)
            await MainActor.run {
                submitting = false
                onSubmitted()
            }
        }
    }

    private func trimToNil(_ s: String) -> String? {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}

// Preview removed with RaceDemoData (no mock). Renders from a real RacePlan +
// RaceResult once /api/athlete/race-context lands (#31).
