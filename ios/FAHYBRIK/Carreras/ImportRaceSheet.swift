import SwiftUI

// Import an athlete's HYROX history into the Carreras hub.
//
// PRIMARY flow (name search): the athlete searches their NAME → picks their
// profile from candidates (nation + race count + PRO/ELITE chip disambiguate
// namesakes) → confirms ("¿Eres tú?") → we import their ENTIRE history
// (individual AND doubles/relay) via POST /race-results/import-all. The confirm
// step is the guard that stops importing a stranger's history.
//
// SECONDARY flow (paste a link): kept for the one-off case — paste an official
// results.hyrox.com athlete link → POST /race-results/import (single race). The
// old endpoint + client pre-flight live unchanged in CarrerasService.
//
// States: idle → debounced search (spinner) → candidate list | empty (check
// spelling) | error (readable Spanish). Confirm → importing (spinner) → success
// (haptic + dismiss + onImported(result) so the parent seeds the rich history).
//
// Light+dark adaptive off Theme tokens; brand accent is orange-as-text.
struct ImportRaceSheet: View {
    @Environment(\.dismiss) private var dismiss

    var bearer: String?
    /// Called after a successful import so the parent can refresh the hub. The
    /// full-history import passes its result (the rich, doubles-aware races) so
    /// the hub can render them immediately; the legacy single-link path passes
    /// nil (the hub just re-fetches the race-context overview).
    let onImported: (HyresultImportAllResult?) -> Void

    // Search state.
    @State private var query: String = ""
    @State private var candidates: [HyresultCandidate] = []
    @State private var searching = false
    @State private var searched = false
    @State private var searchError: String? = nil
    @State private var searchTask: Task<Void, Never>? = nil
    @State private var selected: HyresultCandidate? = nil

    @FocusState private var fieldFocused: Bool

    /// Debounce window before a keystroke fires a search.
    private let debounceNanos: UInt64 = 350_000_000
    private let minQueryLength = 2

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                        intro
                        searchField
                        results
                        if candidates.isEmpty && searchError == nil && !searching {
                            howTo
                            linkFallbackLink
                        }
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
                }
            }
            .navigationDestination(item: $selected) { candidate in
                ConfirmImportView(candidate: candidate, bearer: bearer) { result in
                    onImported(result)
                    dismiss()
                }
            }
            .navigationDestination(isPresented: $showLinkEntry) {
                LinkImportView(bearer: bearer) {
                    onImported(nil)
                    dismiss()
                }
            }
        }
        .onAppear { fieldFocused = true }
        .onDisappear { searchTask?.cancel() }
    }

    // MARK: - Sections

    private var intro: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Busca tu nombre")
                .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Text("Importaremos todo tu historial de HYROX —individuales y dobles— desde tus resultados oficiales. Elige tu perfil de la lista.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var searchField: some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: "TU NOMBRE")
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
                TextField("Nombre y apellidos", text: $query)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.Color.foreground)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled(true)
                    .submitLabel(.search)
                    .focused($fieldFocused)
                    .onChange(of: query) { _, _ in scheduleSearch() }
                    .onSubmit { runSearchNow() }
                if searching {
                    ProgressView()
                        .controlSize(.small)
                        .tint(Theme.Color.accentText)
                } else if !query.isEmpty {
                    Button {
                        clearSearch()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.Color.faint)
                    }
                    .accessibilityLabel("Borrar búsqueda")
                }
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 12)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
    }

    @ViewBuilder
    private var results: some View {
        if let searchError {
            errorBanner(searchError)
        } else if !candidates.isEmpty {
            candidateList
        } else if searched && !searching && trimmedQuery.count >= minQueryLength {
            RedesignEmptyState(
                symbol: "person.crop.circle.badge.questionmark",
                title: "Sin resultados",
                message: "No encontramos ese nombre. Revisa que esté bien escrito y prueba con tu nombre completo, tal y como aparece en tus resultados de HYROX.",
                // The other way in: paste the link of one official result page.
                exit: .action(title: "Pegar el enlace de una carrera") {
                    fieldFocused = false
                    showLinkEntry = true
                }
            )
            .padding(.top, Theme.Spacing.s)
        }
    }

    private var candidateList: some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: "¿CUÁL ERES TÚ?")
            VStack(spacing: 8) {
                ForEach(candidates) { candidate in
                    Button {
                        Haptics.light()
                        fieldFocused = false
                        selected = candidate
                    } label: {
                        CandidateRow(candidate: candidate)
                    }
                    .buttonStyle(PressScaleStyle())
                }
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

    private var howTo: some View {
        VStack(alignment: .leading, spacing: 9) {
            LabelText(text: "CÓMO FUNCIONA")
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
        "Escribe tu nombre completo tal y como compites.",
        "Elige tu perfil de la lista (te ayudamos con tu país y número de carreras).",
        "Confirma e importamos todo tu historial: individuales y dobles.",
    ]

    // Secondary path entry — paste a single official results.hyrox.com link.
    private var linkFallbackLink: some View {
        Button {
            Haptics.light()
            showLinkEntry = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "link")
                    .font(.system(size: 12, weight: .semibold))
                Text("¿Prefieres pegar el enlace de una carrera?")
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(Theme.Color.accentText)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .buttonStyle(PressScaleStyle())
        .padding(.top, Theme.Spacing.xs)
    }

    @State private var showLinkEntry = false

    // MARK: - Search driving

    /// Debounced search: cancel the in-flight task and start a fresh one that
    /// waits `debounceNanos` before hitting the network, so typing doesn't fire a
    /// request per keystroke. A query under the min length clears the list.
    private func scheduleSearch() {
        searchTask?.cancel()
        searchError = nil
        let q = trimmedQuery
        guard q.count >= minQueryLength else {
            candidates = []
            searched = false
            searching = false
            return
        }
        searchTask = Task { @MainActor in
            searching = true
            try? await Task.sleep(nanoseconds: debounceNanos)
            if Task.isCancelled { return }
            await performSearch(q)
        }
    }

    /// Fire immediately on submit (skip the debounce).
    private func runSearchNow() {
        searchTask?.cancel()
        let q = trimmedQuery
        guard q.count >= minQueryLength else { return }
        searchTask = Task { @MainActor in
            searching = true
            await performSearch(q)
        }
    }

    @MainActor
    private func performSearch(_ q: String) async {
        do {
            let hits = try await CarrerasService.searchAthletes(query: q, bearer: bearer)
            if Task.isCancelled { return }
            candidates = hits
            searchError = nil
        } catch is CancellationError {
            return
        } catch let err as HyresultSearchError {
            candidates = []
            searchError = err.message
        } catch {
            candidates = []
            searchError = HyresultSearchError.generic.message
        }
        searched = true
        searching = false
    }

    private func clearSearch() {
        searchTask?.cancel()
        query = ""
        candidates = []
        searched = false
        searchError = nil
        searching = false
        fieldFocused = true
    }
}

// MARK: - Candidate row

private struct CandidateRow: View {
    let candidate: HyresultCandidate

    private var meta: String {
        var parts: [String] = []
        if let nation = candidate.nation, !nation.isEmpty { parts.append(nation.uppercased()) }
        parts.append(candidate.races_count == 1 ? "1 carrera" : "\(candidate.races_count) carreras")
        return parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 7) {
                    Text(candidate.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                    if let level = candidate.level, !level.isEmpty {
                        LevelChip(text: level)
                    }
                }
                Text(meta)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.faint)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(candidate.name), \(meta)\(candidate.level.map { ", \($0)" } ?? "")")
        .accessibilityAddTraits(.isButton)
    }
}

/// PRO/ELITE level chip — brand orange-as-text on a faint accent fill.
private struct LevelChip: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .bold))
            .tracking(0.4)
            .textCase(.uppercase)
            .foregroundStyle(Theme.Color.accentText)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Theme.Color.accent.opacity(0.12))
            .clipShape(Capsule())
    }
}

// MARK: - Confirm step

/// "¿Eres tú?" — the disambiguation guard before importing a full history. Shows
/// the picked candidate, imports on confirm, and on success hands the result up
/// (which dismisses the sheet + seeds the hub).
private struct ConfirmImportView: View {
    @Environment(\.dismiss) private var dismiss

    let candidate: HyresultCandidate
    var bearer: String?
    let onConfirmed: (HyresultImportAllResult) -> Void

    @State private var importing = false
    @State private var errorText: String? = nil

    private var racesText: String {
        candidate.races_count == 1 ? "tu carrera" : "tus \(candidate.races_count) carreras"
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    CardSurface(padding: 18, topAccent: true, elevated: true) {
                        VStack(alignment: .leading, spacing: 12) {
                            LabelText(text: "CONFIRMA TU PERFIL", color: Theme.Color.accentText)
                            HStack(spacing: 8) {
                                Text(candidate.name)
                                    .scaledFont(20, weight: .heavy, relativeTo: .title3, italic: true)
                                    .foregroundStyle(Theme.Color.foreground)
                                    .fixedSize(horizontal: false, vertical: true)
                                if let level = candidate.level, !level.isEmpty {
                                    LevelChip(text: level)
                                }
                            }
                            Text(profileMeta)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("¿Eres tú?")
                            .scaledFont(17, weight: .heavy, relativeTo: .headline, italic: true)
                            .foregroundStyle(Theme.Color.foreground)
                        Text("Importaremos \(racesText) —individuales y dobles— a tu historial. Si re-importas, se actualizan sin duplicarse.")
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if let errorText {
                        errorBanner(errorText)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.l)
            }
            .anchoredAction {
                VStack(spacing: Theme.Spacing.s) {
                    confirmButton
                    Button("No soy yo") { dismiss() }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                        .disabled(importing)
                }
            }
        }
        .navigationTitle("¿Eres tú?")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var profileMeta: String {
        var parts: [String] = []
        if let nation = candidate.nation, !nation.isEmpty { parts.append(nation.uppercased()) }
        parts.append(candidate.races_count == 1 ? "1 carrera" : "\(candidate.races_count) carreras")
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private var confirmButton: some View {
        if importing {
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
            .accessibilityLabel("Importando historial")
        } else {
            ExpertPrimaryButton(title: "SÍ, IMPORTAR MI HISTORIAL") {
                runImport()
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

    private func runImport() {
        guard !importing else { return }
        errorText = nil
        importing = true
        Task { @MainActor in
            do {
                let result = try await CarrerasService.importAllRaces(slug: candidate.slug, bearer: bearer)
                importing = false
                Haptics.success()
                onConfirmed(result)
            } catch let err as HyresultImportError {
                importing = false
                Haptics.error()
                errorText = err.message
            } catch {
                importing = false
                Haptics.error()
                errorText = HyresultImportError.generic.message
            }
        }
    }
}

// The secondary "paste a link" path lives in ImportRaceLinkSheet.swift
// (LinkImportView), pushed from the "¿Prefieres pegar el enlace?" affordance.
