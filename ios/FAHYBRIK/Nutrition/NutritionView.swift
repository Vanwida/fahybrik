import SwiftUI

// PARKED — intentionally NOT reachable from the UI. Nutrition is a post-launch
// idea on hold: this screen is deliberately not wired into AppShell's tab bar or
// any navigation, so the athlete cannot reach it. The code is kept intact and
// compilable for when it returns — do not delete. To re-enable, add a `nutricion`
// case to AppTab + AppShell's switch (and a tab-bar entry).
//
// Athlete-facing food register, wired to the real backend (GET/POST/DELETE
// /api/athlete/nutrition). Shows the selected day's totals (kcal + macros) up
// top, the list of logged entries below (swipe to delete), and a "+" to add via
// manual entry, barcode scan, or photo-IA.
//
// Honest states only: empty days show "Aún no has registrado comidas",
// failures show an inline message — never fabricated meals or targets.
struct NutritionView: View {
    var bearer: String? = nil

    @StateObject private var service = NutritionService.shared
    @State private var showManual = false
    @State private var showBarcode = false
    @State private var showPhoto = false
    @State private var showAddMenu = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                content
            }
            .navigationTitle("Nutrición")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Haptics.light()
                        showAddMenu = true
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 16, weight: .bold))
                    }
                    .tint(Theme.Color.accentText)
                    .accessibilityLabel("Añadir comida")
                }
            }
        }
        .task { await service.loadDay() }
        .confirmationDialog("Añadir comida", isPresented: $showAddMenu, titleVisibility: .visible) {
            Button("Buscar / manual") { showManual = true }
            Button("Código de barras") { showBarcode = true }
            Button("Foto-IA") { showPhoto = true }
            Button("Cancelar", role: .cancel) {}
        }
        .sheet(isPresented: $showManual) {
            NutritionSearchSheet { showManual = false }
        }
        .fullScreenCover(isPresented: $showBarcode) {
            BarcodeScannerView()
        }
        .fullScreenCover(isPresented: $showPhoto) {
            FoodScannerView()
        }
        // Reload whenever an add sheet closes (entries land server-side).
        .onChange(of: showManual) { _, isShown in if !isShown { Task { await service.loadDay() } } }
        .onChange(of: showBarcode) { _, isShown in if !isShown { Task { await service.loadDay() } } }
        .onChange(of: showPhoto) { _, isShown in if !isShown { Task { await service.loadDay() } } }
    }

    @ViewBuilder
    private var content: some View {
        VStack(spacing: 0) {
            dayHeader
            totalsCard
            Divider().background(Theme.Color.hairline)
            if service.isLoading && service.entries.isEmpty {
                Spacer()
                ProgressView().tint(Theme.Color.accentText)
                Spacer()
            } else if service.entries.isEmpty {
                emptyState
            } else {
                entriesList
            }
        }
    }

    // MARK: - Day navigation

    private var dayHeader: some View {
        HStack {
            Button {
                Haptics.light()
                Task { await service.goToPreviousDay() }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Día anterior")
            Spacer()
            Text(dayLabel)
                .scaledFont(15, weight: .bold, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Spacer()
            Button {
                Haptics.light()
                Task { await service.goToNextDay() }
            } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(service.isToday ? Theme.Color.muted : Theme.Color.foreground)
                    .frame(width: 44, height: 44)
            }
            .disabled(service.isToday)
            .accessibilityLabel("Día siguiente")
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.top, Theme.Spacing.s)
    }

    private var dayLabel: String {
        if service.isToday { return "Hoy" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "EEEE d MMM"
        return f.string(from: service.selectedDate).capitalized
    }

    // MARK: - Totals

    private var totalsCard: some View {
        CardSurface(padding: Theme.Spacing.l) {
            HStack(spacing: Theme.Spacing.m) {
                totalCell(value: "\(Int(service.totals.kcal.rounded()))", label: "kcal", emphasis: true)
                Rectangle().fill(Theme.Color.hairline).frame(width: 1, height: 36)
                totalCell(value: "\(Int(service.totals.proteinG.rounded()))g", label: "Proteína")
                totalCell(value: "\(Int(service.totals.carbsG.rounded()))g", label: "Carbos")
                totalCell(value: "\(Int(service.totals.fatG.rounded()))g", label: "Grasa")
            }
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, Theme.Spacing.s)
    }

    private func totalCell(value: String, label: String, emphasis: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(size: emphasis ? 22 : 18, weight: .heavy, design: .default).italic().monospacedDigit())
                .foregroundStyle(emphasis ? Theme.Color.accent : Theme.Color.foreground)
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .tracking(1.0)
                .textCase(.uppercase)
                .foregroundStyle(Theme.Color.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }

    // MARK: - Entries

    private var entriesList: some View {
        List {
            ForEach(service.entries) { entry in
                entryRow(entry)
                    .listRowBackground(Theme.Color.surface)
                    .listRowSeparatorTint(Theme.Color.hairline)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            Haptics.medium()
                            Task { await service.deleteEntry(entry.id) }
                        } label: {
                            Label("Borrar", systemImage: "trash")
                        }
                    }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .refreshable { await service.loadDay() }
    }

    private func entryRow(_ entry: NutritionEntry) -> some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Theme.Color.surfaceElevated)
                Image(systemName: sourceIcon(entry.source))
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.Color.muted)
            }
            .frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let q = entry.quantity {
                        Text("\(Int(q.rounded()))\(entry.unit ?? "g")")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.muted)
                    }
                    MonoText(
                        text: "P\(Int(entry.proteinG.rounded())) C\(Int(entry.carbsG.rounded())) G\(Int(entry.fatG.rounded()))",
                        size: 10,
                        color: Theme.Color.muted
                    )
                }
            }
            Spacer()
            Text("\(Int(entry.kcal.rounded()))")
                .font(.system(size: 15, weight: .heavy, design: .default).italic().monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
            Text("kcal")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.vertical, 4)
    }

    private func sourceIcon(_ source: FoodSource) -> String {
        switch source {
        case .manual:  return "square.and.pencil"
        case .barcode: return "barcode"
        case .photo:   return "camera"
        case .unknown: return "circle"   // AUDIT-B2 — a future source still renders a row
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: Theme.Spacing.m) {
            Spacer()
            Image(systemName: "fork.knife")
                .font(.system(size: 38))
                .foregroundStyle(Theme.Color.muted)
            Text(service.isToday ? "Aún no has registrado comidas hoy" : "Sin comidas este día")
                .scaledFont(16, weight: .bold, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text("Añade con el botón + : búsqueda manual, código de barras o foto.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            if let err = service.lastError {
                Text(err)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.accentText)
                    .multilineTextAlignment(.center)
            }
            Spacer()
            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.xxl)
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    NutritionView()
}
