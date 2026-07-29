import SwiftUI

// Step 7 — los umbrales que el atleta YA conoce. Optional, but they are the TOP
// rung of every zone ladder: a declared threshold beats anything the server can
// infer, and only a guided test beats it. Until 29-jul-2026 the five numbers on
// this screen were sent and dropped by the API, so the athlete typed his best
// evidence into a void and was then shown bands derived from his birthday.
//
// Copy follows docs/CONTRATO-UI.md §3: pulse is "pulso"/"FC" in **ppm**, never
// "HR" and never "bpm", and nothing athlete-facing is an English acronym.
struct ThresholdStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 13,
            title: "Tus umbrales",
            subtitle: "Si ya te has medido, dínoslo. Si no, lo medimos con los tests.",
            hint: "Con cualquiera de estos ya calculamos tus zonas. Si luego haces el test, mandará el test.",
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Umbral")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
                VStack(spacing: 0) {
                    IntRow(label: "Pulso de umbral", unit: Vocab.ppm, value: $state.lthrBpm)
                    TimeMinSecRow(label: "Ritmo umbral (/km)", seconds: $state.thresholdPaceSecondsPerKm)
                    IntRow(label: "Potencia de umbral", unit: "W", value: $state.ftpWatts)
                }
                .brandSurface()
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text("Tests")
                    .font(Theme.Typography.dataLabel)
                    .uppercaseTracked()
                    .foregroundStyle(Theme.Color.muted)
                VStack(spacing: 0) {
                    TimeMinSecRow(label: "1 milla a tope", seconds: $state.time1MileSeconds)
                    IntRow(label: Vocab.fcMax, unit: Vocab.ppm, value: $state.maxHrBpm)
                }
                .brandSurface()
            }
            .padding(.top, Theme.Spacing.l)
        }
    }
}
