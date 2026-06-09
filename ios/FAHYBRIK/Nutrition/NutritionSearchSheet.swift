import SwiftUI

// Food search by name (Open Food Facts via the backend proxy). The athlete
// types → debounced GET …/nutrition/search?q= → per-100g results. Tapping a
// result opens the editable confirmation form (FoodSearchView, source=.manual)
// seeded with that product's per-100g macros for a default 100g serving.
//
// Below the search field there's always an "Añadir manualmente" escape hatch
// (opens the same form, empty) for foods OFF doesn't have.
//
// Honest states: loading spinner while searching, "Sin resultados…" empty
// state, inline error on failure — never fabricated foods.
struct NutritionSearchSheet: View {
    @Environment(\.dismiss) private var dismiss

    /// Called once a food has been successfully logged (form confirmed) so the
    /// parent can dismiss + reload the day.
    let onAdded: () -> Void

    @State private var query: String = ""
    @State private var results: [FoodSearchResult] = []
    @State private var isSearching = false
    @State private var didSearch = false
    @State private var errorText: String? = nil
    @State private var searchTask: Task<Void, Never>? = nil

    /// Drives the confirmation form via `.sheet(item:)`. Set when a result is
    /// tapped, or when "Añadir manualmente" is chosen (empty prefill).
    @State private var formPrefill: FoodSearchView.Prefill? = nil

    @FocusState private var searchFocused: Bool

    // Debounce so we don't hammer OFF on every keystroke.
    private let debounce: Duration = .milliseconds(400)
    private let minChars = 2

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                VStack(spacing: 0) {
                    searchField
                    manualButton
                    Divider().background(Theme.Color.hairline)
                    resultsArea
                }
            }
            .navigationTitle("Buscar alimento")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .tint(Theme.Color.accent)
                }
            }
        }
        .onAppear { searchFocused = true }
        .onChange(of: query) { _, newValue in scheduleSearch(newValue) }
        .sheet(item: $formPrefill) { prefill in
            FoodSearchView(source: .manual, prefill: prefill) {
                formPrefill = nil
                onAdded()
            }
        }
    }

    // MARK: - Search field

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
            TextField("Pollo, yogur griego, avena…", text: $query)
                .focused($searchFocused)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.foreground)
            if isSearching {
                ProgressView().tint(Theme.Color.accent)
            } else if !query.isEmpty {
                Button {
                    query = ""
                    results = []
                    didSearch = false
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.Color.muted)
                }
                .accessibilityLabel("Borrar búsqueda")
            }
        }
        .padding(14)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.m)
    }

    private var manualButton: some View {
        Button {
            Haptics.light()
            formPrefill = FoodSearchView.Prefill()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 13, weight: .semibold))
                Text("Añadir manualmente")
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(Theme.Color.accent)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
        }
        .accessibilityHint("Crea una entrada sin búsqueda")
    }

    // MARK: - Results

    @ViewBuilder
    private var resultsArea: some View {
        if let errorText {
            centeredMessage(icon: "exclamationmark.triangle", title: errorText, accent: true)
        } else if !results.isEmpty {
            resultsList
        } else if didSearch && !isSearching && query.count >= minChars {
            centeredMessage(
                icon: "magnifyingglass",
                title: "Sin resultados",
                subtitle: "Añádelo manualmente con el botón de arriba."
            )
        } else {
            centeredMessage(
                icon: "fork.knife",
                title: "Busca un alimento",
                subtitle: "Escribe un nombre para ver opciones con sus macros por 100 g."
            )
        }
    }

    private var resultsList: some View {
        List {
            ForEach(results) { result in
                Button {
                    Haptics.light()
                    formPrefill = prefill(for: result)
                } label: {
                    resultRow(result)
                }
                .listRowBackground(Theme.Color.surface)
                .listRowSeparatorTint(Theme.Color.hairline)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.immediately)
    }

    private func resultRow(_ r: FoodSearchResult) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(r.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let brand = r.brand, !brand.isEmpty {
                        Text(brand)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.muted)
                            .lineLimit(1)
                    }
                    MonoText(
                        text: "P\(Int(r.proteinG.rounded())) C\(Int(r.carbsG.rounded())) G\(Int(r.fatG.rounded())) /100g",
                        size: 10,
                        color: Theme.Color.muted
                    )
                }
            }
            Spacer()
            Text("\(Int(r.kcal.rounded()))")
                .font(.system(size: 15, weight: .heavy, design: .default).italic().monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
            Text("kcal")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(r.name), \(Int(r.kcal.rounded())) kilocalorías por 100 gramos")
    }

    private func centeredMessage(
        icon: String,
        title: String,
        subtitle: String? = nil,
        accent: Bool = false
    ) -> some View {
        VStack(spacing: Theme.Spacing.m) {
            Spacer()
            Image(systemName: icon)
                .font(.system(size: 34))
                .foregroundStyle(accent ? Theme.Color.accent : Theme.Color.muted)
            Text(title)
                .scaledFont(15, weight: .bold, relativeTo: .headline, italic: true)
                .foregroundStyle(accent ? Theme.Color.accent : Theme.Color.foreground)
                .multilineTextAlignment(.center)
            if let subtitle {
                Text(subtitle)
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
            }
            Spacer()
            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.xxl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Search driving

    /// Seeds the confirmation form from a per-100g result, defaulting to a 100g
    /// serving so the displayed macros == the result's per-100g values. The
    /// athlete edits quantity/macros before confirming. No fabricated values.
    private func prefill(for r: FoodSearchResult) -> FoodSearchView.Prefill {
        FoodSearchView.Prefill(
            name: r.name,
            kcal: r.kcal,
            protein_g: r.proteinG,
            carbs_g: r.carbsG,
            fat_g: r.fatG,
            quantity: 100,
            unit: "g",
            barcode: r.barcode
        )
    }

    private func scheduleSearch(_ text: String) {
        searchTask?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= minChars else {
            results = []
            didSearch = false
            errorText = nil
            isSearching = false
            return
        }
        searchTask = Task { @MainActor in
            try? await Task.sleep(for: debounce)
            if Task.isCancelled { return }
            await runSearch(trimmed)
        }
    }

    @MainActor
    private func runSearch(_ trimmed: String) async {
        isSearching = true
        errorText = nil
        defer { isSearching = false }
        do {
            let found = try await NutritionService.shared.searchFoods(query: trimmed)
            if Task.isCancelled { return }
            results = found
            didSearch = true
        } catch {
            if Task.isCancelled { return }
            results = []
            didSearch = true
            errorText = "No se pudo buscar. Inténtalo de nuevo."
        }
    }
}
