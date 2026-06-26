import SwiftUI

// Secondary import path — paste a single results.hyrox.com link.
//
// The PRIMARY flow is name search (ImportRaceSheet → import-all). This is the
// one-off fallback: the athlete pastes an official athlete-page link and we POST
// it to /race-results/import (single race, the legacy endpoint + client
// pre-flight in CarrerasService). Pushed from ImportRaceSheet's "¿Prefieres
// pegar el enlace?" affordance; on success it calls `onImported()` (the parent
// re-fetches the race-context overview — no rich history is returned here).
struct LinkImportView: View {
    @Environment(\.dismiss) private var dismiss

    var bearer: String?
    let onImported: () -> Void

    @State private var urlText = ""
    @State private var submitting = false
    @State private var errorText: String? = nil
    @FocusState private var fieldFocused: Bool

    private var looksValid: Bool { HyroxImport.looksLikeResultURL(urlText) }
    private var canSubmit: Bool { looksValid && !submitting }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Pega el enlace de tu resultado")
                            .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                            .foregroundStyle(Theme.Color.foreground)
                        Text("Copia el enlace de tu página de atleta en \(HyroxImport.resultsHost) e importamos esa carrera.")
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        LabelText(text: "ENLACE HYROX")
                        HStack(spacing: 8) {
                            Image(systemName: "link")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Theme.Color.faint)
                            TextField("https://results.hyrox.com/…", text: $urlText)
                                .font(.system(size: 14, design: .monospaced))
                                .foregroundStyle(Theme.Color.foreground)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled(true)
                                .keyboardType(.URL)
                                .submitLabel(.go)
                                .focused($fieldFocused)
                                .disabled(submitting)
                                .onChange(of: urlText) { _, _ in if errorText != nil { errorText = nil } }
                                .onSubmit { if canSubmit { submit() } }
                        }
                        .padding(.horizontal, 13)
                        .padding(.vertical, 12)
                        .background(Theme.Color.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                                .stroke(fieldStroke, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                        if !urlText.isEmpty && !looksValid {
                            Text("El enlace debe empezar por https:// y ser de \(HyroxImport.resultsHost).")
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }

                    if let errorText {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Theme.Color.danger)
                            Text(errorText)
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
                    }

                    Spacer(minLength: Theme.Spacing.l)

                    if submitting {
                        HStack(spacing: 10) {
                            ProgressView().tint(Theme.Color.accentOn)
                            Text("Importando…")
                                .font(.system(size: 16, weight: .heavy, design: .default).italic())
                                .tracking(1)
                                .foregroundStyle(Theme.Color.accentOn)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(Theme.Color.accent.opacity(0.7))
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                    } else {
                        ExpertPrimaryButton(title: "IMPORTAR", enabled: canSubmit) { submit() }
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
            }
        }
        .navigationTitle("Pegar enlace")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { fieldFocused = true }
    }

    private var fieldStroke: Color {
        if !urlText.isEmpty && !looksValid { return Theme.Color.warning.opacity(0.55) }
        return Theme.Color.hairlineStrong
    }

    private func submit() {
        guard canSubmit else { return }
        fieldFocused = false
        errorText = nil
        submitting = true
        let url = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        Task { @MainActor in
            do {
                try await CarrerasService.importRace(resultURL: url, bearer: bearer)
                submitting = false
                Haptics.success()
                onImported()
            } catch let err as CarrerasImportError {
                submitting = false
                Haptics.error()
                errorText = err.message
            } catch {
                submitting = false
                Haptics.error()
                errorText = CarrerasImportError.generic.message
            }
        }
    }
}
