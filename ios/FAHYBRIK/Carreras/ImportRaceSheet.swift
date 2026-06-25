import SwiftUI

// Import an official HYROX result into the Carreras hub. The athlete pastes the
// link to THEIR athlete page on results.hyrox.com; we POST it to
// `/api/athlete/race-results/import`, which fetches + parses the official splits
// and stores them on the athlete's `races` row (idempotent per HYROX idp).
//
// Flow / states:
//   idle → (client URL check) → submitting (spinner, field locked) →
//     success  → haptic + dismiss + onImported() (parent refreshes the hub)
//     failure  → honest, athlete-readable reason inline (CarrerasImportError),
//                field stays editable so they can fix + retry.
//
// Brand accent is orange-as-text (accentText); the form is light+dark adaptive
// off Theme tokens. Client validation only catches the obvious wrong-link paste
// (https + host results.hyrox.com); the server is authoritative and any deeper
// rejection (bad season/idp/event, unreadable page) surfaces as an honest error.
struct ImportRaceSheet: View {
    @Environment(\.dismiss) private var dismiss

    var bearer: String?
    /// Called after a successful import so the parent can refresh the hub.
    let onImported: () -> Void

    @State private var urlText: String = ""
    @State private var submitting = false
    @State private var errorText: String? = nil
    @FocusState private var fieldFocused: Bool

    /// The pasted string passes the client pre-flight (https + HYROX host). Drives
    /// the CTA's enabled state so we don't fire an obviously-bad request.
    private var looksValid: Bool {
        HyroxImport.looksLikeResultURL(urlText)
    }

    private var canSubmit: Bool {
        looksValid && !submitting
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                        intro
                        field
                        if let errorText {
                            errorBanner(errorText)
                        }
                        howTo
                        Spacer(minLength: Theme.Spacing.l)
                        submitButton
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
            }
            .navigationTitle("Importar carrera")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .tint(Theme.Color.accentText)
                        .disabled(submitting)
                }
            }
        }
        .onAppear { fieldFocused = true }
    }

    // MARK: - Sections

    private var intro: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Pega el enlace de tu resultado oficial")
                .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Text("Importamos tus splits, estaciones y posición desde \(HyroxImport.resultsHost). Si ya importaste esta carrera, se actualiza.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var field: some View {
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
                    .onChange(of: urlText) { _, _ in
                        // Clear a stale error the moment they edit the link.
                        if errorText != nil { errorText = nil }
                    }
                    .onSubmit { if canSubmit { submit() } }
                if !urlText.isEmpty && !submitting {
                    Button {
                        urlText = ""
                        fieldFocused = true
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.Color.faint)
                    }
                    .accessibilityLabel("Borrar enlace")
                }
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 12)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(fieldStroke, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))

            // Inline hint only once the athlete has typed something that isn't a
            // HYROX link yet — silent while empty so it never nags.
            if !urlText.isEmpty && !looksValid {
                Text("El enlace debe empezar por https:// y ser de \(HyroxImport.resultsHost).")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    private var fieldStroke: Color {
        if !urlText.isEmpty && !looksValid { return Theme.Color.warning.opacity(0.55) }
        return Theme.Color.hairlineStrong
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

    // Where to find the link — keeps the athlete from pasting the wrong page.
    private var howTo: some View {
        VStack(alignment: .leading, spacing: 9) {
            LabelText(text: "DÓNDE ENCONTRARLO")
            ForEach(Array(steps.enumerated()), id: \.offset) { idx, step in
                HStack(alignment: .top, spacing: 9) {
                    Text("\(idx + 1)")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(Theme.Color.accentText)
                        .frame(width: 18, height: 18)
                        .background(Theme.Color.accent.opacity(0.10))
                        .clipShape(Circle())
                    Text(step)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    private let steps: [String] = [
        "Abre results.hyrox.com y busca tu nombre.",
        "Entra en tu página de atleta (la que muestra tus tiempos por estación).",
        "Copia el enlace de esa página y pégalo aquí.",
    ]

    @ViewBuilder
    private var submitButton: some View {
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
            .accessibilityLabel("Importando carrera")
        } else {
            ExpertPrimaryButton(title: "IMPORTAR", enabled: canSubmit) {
                submit()
            }
        }
    }

    // MARK: - Submit

    private func submit() {
        guard canSubmit else { return }
        fieldFocused = false
        errorText = nil
        submitting = true
        let url = urlText.trimmingCharacters(in: .whitespacesAndNewlines)

        // @MainActor so the @State mutations (submitting / errorText) and the
        // dismiss happen on the main actor — matching the codebase convention.
        Task { @MainActor in
            do {
                try await CarrerasService.importRace(resultURL: url, bearer: bearer)
                submitting = false
                Haptics.success()
                onImported()
                dismiss()
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
