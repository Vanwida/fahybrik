import SwiftUI

// MARK: - Entreno libre — exercise picker sheet
//
// Reusable movement picker for the fuerza + funcional builders. A debounced
// search field over GET /api/athlete/exercises, results grouped by ES category,
// tap-to-select. `preferredCategory` only BIASES the ordering (the section for it
// floats to the top) — never a hard filter, so an athlete logging swings as fuerza
// still finds them under Funcional. Honest loading / error / empty states, all in
// natural Spanish. No free text anywhere — the search only queries the catalog.
struct FreeExercisePickerView: View {
    let bearer: String?
    /// The builder that opened the picker ("strength" | "functional") — biases the
    /// section order, does NOT restrict the catalog.
    let preferredCategory: String
    let onPick: (FreeExercise) -> Void
    let onClose: () -> Void

    @State private var searchText: String = ""
    @State private var all: [FreeExercise] = []
    @State private var phase: LoadPhase = .loading
    @State private var searchTask: Task<Void, Never>? = nil

    /// Debounce window before a keystroke fires a fetch — long enough to coalesce a
    /// fast typist, short enough to feel live.
    private static let searchDebounceNanos: UInt64 = 300_000_000

    enum LoadPhase: Equatable {
        case loading
        case loaded
        case failed
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            searchField
            content
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .task { await load(search: nil) }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Añade un ejercicio")
                    .font(.system(size: 17, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                Text("Del catálogo — busca por nombre")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: 0)
            Button {
                Haptics.light()
                onClose()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 34, height: 34)
                    .background(Theme.Color.surface)
                    .clipShape(Circle())
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar")
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.s)
    }

    // MARK: - Search field (the ONLY text input — a catalog query, not free dosage)

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
            TextField("Buscar ejercicio", text: $searchText)
                .font(Theme.Typography.body)
                .foregroundStyle(Theme.Color.foreground)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.search)
                .accessibilityLabel("Buscar ejercicio")
            if !searchText.isEmpty {
                Button {
                    Haptics.light()
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.Color.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Borrar búsqueda")
            }
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, 11)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.s)
        .onChange(of: searchText) { _, new in scheduleSearch(new) }
    }

    // MARK: - Content states

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .loading:
            stateBox {
                ProgressView().tint(Theme.Color.accent)
                Text("Cargando ejercicios…")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
            }
        case .failed:
            stateBox {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                Text("No pudimos cargar los ejercicios")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Revisa tu conexión e inténtalo de nuevo.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
                Button {
                    Haptics.light()
                    let q = searchText
                    Task { await load(search: q) }
                } label: {
                    Text("Reintentar")
                        .font(.system(size: 14, weight: .heavy, design: .default).italic())
                        .foregroundStyle(Theme.Color.accentOn)
                        .padding(.horizontal, 20).padding(.vertical, 10)
                        .background(Theme.Color.accent)
                        .clipShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
            }
        case .loaded:
            if sections.isEmpty {
                stateBox {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                    Text(emptyMessage)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.center)
                }
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                ForEach(sections, id: \.category) { section in
                    Section {
                        ForEach(section.exercises) { ex in
                            row(ex)
                            Hairline().opacity(0.5)
                        }
                    } header: {
                        sectionHeader(section.label)
                    }
                }
            }
            .padding(.bottom, Theme.Spacing.xxl)
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        HStack {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .heavy, design: .default).italic())
                .tracking(0.6)
                .foregroundStyle(Theme.Color.accentText)
            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.m)
        .padding(.bottom, Theme.Spacing.xs)
        .background(Theme.Color.background)
    }

    private func row(_ ex: FreeExercise) -> some View {
        Button {
            Haptics.medium()
            onPick(ex)
        } label: {
            HStack(spacing: 10) {
                Text(ex.name)
                    .font(Theme.Typography.body)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(Theme.Color.accent)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Añadir \(ex.name)")
    }

    private func stateBox<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: Theme.Spacing.m) {
            Spacer(minLength: Theme.Spacing.xxl)
            content()
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.xl)
    }

    private var emptyMessage: String {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        return q.isEmpty ? "No hay ejercicios en el catálogo." : "Nada para «\(q)». Prueba con otro nombre."
    }

    // MARK: - Grouping (biased, never filtered)

    private struct PickerSection: Equatable {
        let category: String
        let label: String
        let exercises: [FreeExercise]
    }

    /// The loaded catalog grouped into ES sections. The preferred category floats to
    /// the top (bias), then the rest by weight, alphabetical within a tier — every
    /// row stays present, only the ORDER changes.
    private var sections: [PickerSection] {
        let groups = Dictionary(grouping: all, by: { $0.category })
        return groups.keys
            .sorted { a, b in
                let wa = FreeExerciseCategory.sortWeight(a, preferred: preferredCategory)
                let wb = FreeExerciseCategory.sortWeight(b, preferred: preferredCategory)
                if wa != wb { return wa < wb }
                return FreeExerciseCategory.labelES(a) < FreeExerciseCategory.labelES(b)
            }
            .map { cat in
                let rows = (groups[cat] ?? []).sorted { $0.name < $1.name }
                return PickerSection(category: cat, label: FreeExerciseCategory.labelES(cat), exercises: rows)
            }
    }

    // MARK: - Fetch + debounce

    private func scheduleSearch(_ query: String) {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: Self.searchDebounceNanos)
            guard !Task.isCancelled else { return }
            await load(search: query)
        }
    }

    private func load(search: String?) async {
        if all.isEmpty { phase = .loading }
        do {
            let rows = try await FreeExerciseCatalogAPI.fetch(search: search, bearer: bearer)
            guard !Task.isCancelled else { return }
            all = rows
            phase = .loaded
        } catch {
            guard !Task.isCancelled else { return }
            phase = .failed
        }
    }
}
