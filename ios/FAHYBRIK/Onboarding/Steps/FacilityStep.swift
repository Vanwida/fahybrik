import SwiftUI

// Step 8 — Instalación. Where + with what the athlete trains. Gates which
// movements/stations the IA can prescribe without substitution.
struct FacilityStep: View {
    @Bindable var state: OnboardingState
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        StepShell(
            stepIndex: 7,
            title: "Dónde entrenas",
            subtitle: "Instalación y material disponible",
            hint: nil,
            primaryEnabled: true,
            skipTitle: "Saltar",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SectionLabel("Tipo de instalación")
                VStack(spacing: 0) {
                    ForEach(FacilityType.allCases, id: \.self) { f in
                        RadioRow(title: facilityLabel(f), selected: state.facilityType == f) {
                            state.facilityType = (state.facilityType == f) ? nil : f
                        }
                    }
                    if state.facilityType == .other {
                        TextRow(
                            label: "Especifica",
                            placeholder: "tu instalación",
                            value: $state.facilityOtherText
                        )
                    }
                }
                .brandSurface()
            }

            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                SectionLabel("Material")
                ChipFlow(
                    options: EquipmentItem.allCases,
                    label: equipmentLabel,
                    selection: $state.equipment
                )
            }
            .padding(.top, Theme.Spacing.l)

            VStack(spacing: 0) {
                ToggleRow(title: "Acceso a pista de atletismo", isOn: $state.hasTrack)
                ToggleRow(title: "Acceso a tramo llano para correr", isOn: $state.hasFlatRun)
            }
            .brandSurface()
            .padding(.top, Theme.Spacing.l)
        }
    }

    private func facilityLabel(_ f: FacilityType) -> String {
        switch f {
        case .commercialGym: return "Gimnasio comercial"
        case .crossfitBox: return "Box de CrossFit"
        case .multiple: return "Varias instalaciones"
        case .other: return "Otra"
        }
    }

    private func equipmentLabel(_ e: EquipmentItem) -> String {
        switch e {
        case .barbellsPlates: return "Barras y discos"
        case .dumbbells: return "Mancuernas"
        case .sleds: return "Trineos"
        case .bagsKb: return "Sacos / kettlebells"
        case .openSpace: return "Espacio abierto"
        case .pulleys: return "Poleas"
        case .treadmill: return "Cinta"
        case .stationaryBike: return "Bici estática"
        case .rower: return "Rower"
        case .skierg: return "Ski erg"
        case .other: return "Otro"
        }
    }
}

// ChipFlow requires Identifiable; EquipmentItem is an enum, so give it a stable
// id without touching the shared type's declaration in OnboardingState.
extension EquipmentItem: Identifiable {
    public var id: String { rawValue }
}
