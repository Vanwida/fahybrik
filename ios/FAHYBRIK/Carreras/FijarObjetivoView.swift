import SwiftUI

// "Fijar objetivo" — the detail step pushed from BuscarCarreraSheet when the
// athlete taps an event. Shows the event header, then the three ORTHOGONAL race
// attributes the athlete chooses (format · division · gender) plus an optional
// goal time. `division_options` from the event is shown only as an informational
// hint — it is NOT the source of the selectors.
//
// On "Fijar como mi carrera objetivo" → POST the target → on success call
// `onTargetSet` (the sheet dismisses itself and the caller reloads so the home
// countdown refreshes). Inline Spanish error on failure. Light+dark off Theme.
struct FijarObjetivoView: View {
    let event: RaceCalendarEvent
    var bearer: String?
    /// Called after a successful set — the sheet dismisses + caller reloads.
    let onTargetSet: () -> Void

    // The three orthogonal attributes (wire tokens). Defaults to the most common
    // singles/open — the athlete sees every option and changes any of them.
    @State private var format: String = "singles"
    @State private var division: String = "open"
    @State private var gender: String = "men"

    // Objetivo por rangos → goalTimeSeconds. Nothing chosen by default → nil (the
    // race can be fixed with no goal, exactly as before). A preset maps to its
    // seconds; "Acabarla bien" → nil; the exact wheels are the fallback.
    @State private var goalChoice: GoalChoice? = nil
    @State private var goalHours = 1
    @State private var goalMinutes = 0
    @State private var goalSeconds = 0

    @State private var submitting = false
    @State private var errorText: String? = nil

    private var goalTotalSeconds: Int? {
        switch goalChoice {
        case .preset(let preset):
            return preset.seconds
        case .exact:
            let total = goalHours * 3600 + goalMinutes * 60 + goalSeconds
            return total > 0 ? total : nil
        case .finish, .none:
            return nil
        }
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    eventHeader
                    picker(
                        label: "FORMATO",
                        options: [("singles", "Individual"), ("doubles", "Dobles"), ("relay", "Relevos")],
                        selection: $format
                    )
                    picker(
                        label: "DIVISIÓN",
                        options: [("open", "Open"), ("pro", "Pro"), ("elite", "Elite")],
                        selection: $division
                    )
                    picker(
                        label: "CATEGORÍA",
                        options: [("men", "Hombres"), ("women", "Mujeres"), ("mixed", "Mixto")],
                        selection: $gender
                    )
                    goalTimeSection

                    if let errorText {
                        errorBanner(errorText)
                    }

                    Spacer(minLength: Theme.Spacing.l)

                    submitButton
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
        .navigationTitle("Fijar objetivo")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Event header

    private var eventHeader: some View {
        CardSurface(padding: 18, topAccent: true, elevated: true) {
            VStack(alignment: .leading, spacing: 10) {
                if let series = event.seriesLabel {
                    LabelText(text: series, color: Theme.Color.accentText)
                }
                Text(event.name)
                    .scaledFont(22, weight: .heavy, relativeTo: .title3, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(event.cityDateLine)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.Color.muted)
                if let offers = event.divisionOptionsLine {
                    HStack(alignment: .top, spacing: 6) {
                        Image(systemName: "info.circle")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.Color.faint)
                        Text("Este evento ofrece: \(offers)")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.faint)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.top, 2)
                }
            }
        }
    }

    // MARK: - Attribute picker

    private func picker(
        label: String,
        options: [(value: String, label: String)],
        selection: Binding<String>
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: label)
            SegmentedChoice(options: options, selection: selection)
        }
    }

    // MARK: - Objetivo por rangos (Pantalla A)
    //
    // How athletes actually talk (sub-60/70/80/90 or "acabarla bien"), with the
    // exact h:mm:ss wheels demoted to a secondary "tiempo exacto" fallback. Every
    // choice resolves to the SAME goalTimeSeconds field — zero server change.

    private var goalTimeSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 3) {
                Text("¿A qué vas?")
                    .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Tu plan y tu analítica se enfocan en esto.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.muted)
            }

            GoalPresetGrid(choice: $goalChoice)

            GoalPresetChip(
                title: "Acabarla bien",
                descriptor: "primera carrera · sin reloj",
                selected: goalChoice == .finish
            ) {
                goalChoice = .finish
            }

            if case .exact = goalChoice {
                exactWheels
            } else {
                GoalExactLink {
                    withAnimation(.easeInOut(duration: 0.18)) { goalChoice = .exact }
                }
            }

            Text("El objetivo se traduce en tiempos por estación según cómo reparten la carrera los atletas reales de tu división — no un promedio inventado.")
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// The exact h:mm:ss wheels — the fallback revealed by "Prefiero un tiempo
    /// exacto…". Preserved from the original goal input, now demoted below the
    /// range presets.
    private var exactWheels: some View {
        HStack(spacing: 8) {
            wheel(value: $goalHours, range: 0...5, unit: "h")
            wheel(value: $goalMinutes, range: 0...59, unit: "min")
            wheel(value: $goalSeconds, range: 0...59, unit: "s")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    private func wheel(value: Binding<Int>, range: ClosedRange<Int>, unit: String) -> some View {
        VStack(spacing: 2) {
            Picker("", selection: value) {
                ForEach(Array(range), id: \.self) { n in
                    Text(String(format: "%02d", n))
                        .font(.system(size: 18, weight: .semibold, design: .monospaced))
                        .tag(n)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 96)
            .clipped()
            LabelText(text: unit, color: Theme.Color.faint, size: 10)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(value.wrappedValue) \(unit)")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: if value.wrappedValue < range.upperBound { value.wrappedValue += 1 }
            case .decrement: if value.wrappedValue > range.lowerBound { value.wrappedValue -= 1 }
            default: break
            }
        }
    }

    // MARK: - Submit

    @ViewBuilder
    private var submitButton: some View {
        if submitting {
            HStack(spacing: 10) {
                ProgressView().tint(Theme.Color.accentOn)
                Text("Guardando…")
                    .font(.system(size: 16, weight: .heavy, design: .default).italic())
                    .tracking(1)
                    .foregroundStyle(Theme.Color.accentOn)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(Theme.Color.accent.opacity(0.7))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            .accessibilityLabel("Guardando carrera objetivo")
        } else {
            ExpertPrimaryButton(title: "FIJAR COMO MI CARRERA OBJETIVO") {
                submit()
            }
        }
    }

    private func errorBanner(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.danger)
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.dangerTint)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.danger.opacity(0.30), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func submit() {
        guard !submitting else { return }
        guard let eventIdInt = Int(event.eventId) else {
            errorText = "No pudimos identificar este evento. Prueba con otra carrera."
            return
        }
        submitting = true
        errorText = nil
        let body = SetTargetRaceBody(
            eventId: eventIdInt,
            format: format,
            division: division,
            genderCategory: gender,
            goalTimeSeconds: goalTotalSeconds
        )
        Task { @MainActor in
            do {
                _ = try await RaceCalendarService.setTarget(bearer: bearer, body: body)
                submitting = false
                Haptics.success()
                onTargetSet()
            } catch let err as RaceTargetError {
                submitting = false
                Haptics.error()
                errorText = err.message
            } catch {
                submitting = false
                Haptics.error()
                errorText = RaceTargetError.generic.message
            }
        }
    }
}

// MARK: - Segmented choice

/// Equal-width segmented selector over string-token options. The selected
/// segment fills brand orange with `accentOn` text; the rest read as elevated
/// surface chips. Mirrors the RPESelector / PillChip visual language.
private struct SegmentedChoice: View {
    let options: [(value: String, label: String)]
    @Binding var selection: String

    var body: some View {
        HStack(spacing: 8) {
            ForEach(options, id: \.value) { option in
                let selected = option.value == selection
                Button {
                    guard !selected else { return }
                    Haptics.light()
                    withAnimation(.easeInOut(duration: 0.16)) { selection = option.value }
                } label: {
                    Text(option.label)
                        .font(.system(size: 14, weight: selected ? .heavy : .semibold))
                        .foregroundStyle(selected ? Theme.Color.accentOn : Theme.Color.foreground)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                        .background(selected ? Theme.Color.accent : Theme.Color.surfaceElevated)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                                .stroke(selected ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel(option.label)
                .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
            }
        }
    }
}
