import SwiftUI

// Step 16 (index 15) — "Tu historial de carreras". Real data = ground truth: the
// athlete imports their ENTIRE official HYROX history (individual + doubles) by
// name, via the SAME ImportRaceSheet the Carreras hub uses. The import persists
// SERVER-SIDE immediately (POST race-results/import-all), so the coach report +
// level estimate pick it up without any onboarding-submit dependency.
//
// Fully optional: an athlete with no history taps "No tengo historial" and moves
// on. This replaces the old self-declared count/best-time step (asking the
// athlete to re-type numbers we can import for real would be double-entry).
struct ImportHistoryStep: View {
    @Bindable var state: OnboardingState
    var bearer: String?
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    @State private var showImport = false

    var body: some View {
        StepShell(
            stepIndex: 15,
            title: "Tu historial de carreras",
            subtitle: "Importa tus carreras reales de HYROX",
            hint: state.historyImported
                ? nil
                : "¿Tienes historial de HYROX? Lo importamos de tus resultados oficiales —es opcional.",
            primaryEnabled: true,
            skipTitle: state.historyImported ? nil : "No tengo historial todavía",
            onBack: onBack,
            onPrimary: onNext,
            onSkip: onSkip
        ) {
            if state.historyImported {
                imported
            } else {
                prompt
            }
        }
        .sheet(isPresented: $showImport) {
            ImportRaceSheet(bearer: bearer) { result in
                state.historyImported = true
                state.importedRaceCount = result?.races.count
            }
        }
    }

    // MARK: - Not yet imported

    private var prompt: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            RaceActionCard(
                icon: "magnifyingglass",
                title: "Buscar mi historial",
                subtitle: "Busca tu nombre e importamos todas tus carreras —individuales y dobles— con sus parciales.",
                action: { showImport = true }
            )

            Text("Primera HYROX en el horizonte. Si aún no has competido, sáltalo —lo programamos.")
                .font(Theme.Typography.small)
                .italic()
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - After a successful import

    private var imported: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            RaceDoneCard(
                title: "Historial importado",
                subtitle: importedSubtitle
            )
            RaceInlineLink(icon: "arrow.clockwise", title: "Buscar de nuevo o corregir") {
                showImport = true
            }
        }
    }

    private var importedSubtitle: String {
        switch state.importedRaceCount {
        case .some(let n) where n == 1: return "1 carrera en tu perfil."
        case .some(let n) where n > 1:  return "\(n) carreras en tu perfil."
        default:                        return "Tus carreras ya están en tu perfil."
        }
    }
}
