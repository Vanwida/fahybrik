import SwiftUI

struct HyroxStationsStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 14,
            title: "Estaciones",
            subtitle: "Bests por estación HYROX",
            hint: "Marca \"sin testear\" lo que no tengas. Lo programamos en el bloque de \(atrPhaseLabel("ACC")).",
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(spacing: 0) {
                IntRow(label: "Wall ball 9kg / 4 min", unit: "reps", value: $state.stationWallBallReps)
                TimeMinSecRow(label: "Sled push 50kg 100m", seconds: $state.stationSledPushSeconds)
                TimeMinSecRow(label: "BBJ 80m", seconds: $state.stationBbjSeconds)
                NumberRow(label: "Farmer carry max", unit: "kg", value: $state.stationFarmerCarryKg)
                TimeMinSecRow(label: "Sandbag lunges 200m", seconds: $state.stationSandbagLungesSeconds)
            }
            .brandSurface()
        }
    }
}
