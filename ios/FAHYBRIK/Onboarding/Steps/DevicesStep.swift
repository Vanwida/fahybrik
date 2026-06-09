import SwiftUI

// Step 9 — Dispositivos. The wearable + HR source the athlete owns. Drives
// which biometrics (HR, HRV, sleep) the plan can rely on vs. infer.
struct DevicesStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 8,
            title: "Tus dispositivos",
            subtitle: "Qué reloj y sensores usas",
            hint: nil,
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SectionLabel("Reloj / pulsera")
                ChoiceGrid(
                    options: WatchBrand.allCases,
                    label: watchLabel,
                    isSelected: { state.watchBrand == $0 },
                    onTap: { state.watchBrand = (state.watchBrand == $0) ? nil : $0 }
                )
            }

            if state.watchBrand != nil {
                VStack(spacing: 0) {
                    TextRow(
                        label: "Modelo",
                        placeholder: "p.ej. Forerunner 965",
                        value: $state.watchModel
                    )
                }
                .brandSurface()
                .padding(.top, Theme.Spacing.l)
            }

            VStack(spacing: 0) {
                ToggleRow(title: "Banda de frecuencia cardíaca", isOn: $state.hasHrBelt)
            }
            .brandSurface()
            .padding(.top, Theme.Spacing.l)
        }
    }

    private func watchLabel(_ w: WatchBrand) -> String {
        switch w {
        case .appleWatch: return "Apple Watch"
        case .garmin: return "Garmin"
        case .polar: return "Polar"
        case .coros: return "Coros"
        case .suunto: return "Suunto"
        case .whoop: return "Whoop"
        case .oura: return "Oura"
        case .other: return "Otro"
        }
    }
}
