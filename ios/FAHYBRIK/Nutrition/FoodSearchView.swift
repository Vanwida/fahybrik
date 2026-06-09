import SwiftUI

// Manual food entry. The nutrition contract has no food-search endpoint —
// manual logging is a name + absolute macros (kcal / P / C / F) + optional
// quantity/unit form that POSTs source="manual". Kept in this file (the old
// "search" surface) so the Nutrición tab reuses one sheet for the manual path.
//
// Also used as the editable confirmation form for barcode lookups: pass a
// `prefill` to seed the fields and the caller's `source` (.manual or .barcode).
struct FoodSearchView: View {
    @Environment(\.dismiss) private var dismiss

    /// Optional seed (barcode lookup → editable form). Macros are ABSOLUTE for
    /// the quantity the user is about to log. `Identifiable` so callers can
    /// drive a `.sheet(item:)` directly off a prefill.
    struct Prefill: Identifiable {
        let id = UUID()
        var name: String = ""
        var kcal: Double = 0
        var protein_g: Double = 0
        var carbs_g: Double = 0
        var fat_g: Double = 0
        var quantity: Double? = nil
        var unit: String? = nil
        var barcode: String? = nil
        var raw: String? = nil
    }

    let source: FoodSource
    let prefill: Prefill
    let onAdded: () -> Void

    init(source: FoodSource = .manual, prefill: Prefill = Prefill(), onAdded: @escaping () -> Void) {
        self.source = source
        self.prefill = prefill
        self.onAdded = onAdded
        _name = State(initialValue: prefill.name)
        _kcal = State(initialValue: prefill.kcal > 0 ? String(Int(prefill.kcal.rounded())) : "")
        _protein = State(initialValue: prefill.protein_g > 0 ? String(Int(prefill.protein_g.rounded())) : "")
        _carbs = State(initialValue: prefill.carbs_g > 0 ? String(Int(prefill.carbs_g.rounded())) : "")
        _fat = State(initialValue: prefill.fat_g > 0 ? String(Int(prefill.fat_g.rounded())) : "")
        _quantity = State(initialValue: prefill.quantity.map { String(Int($0.rounded())) } ?? "")
        _unit = State(initialValue: prefill.unit ?? "g")
    }

    @State private var name: String
    @State private var kcal: String
    @State private var protein: String
    @State private var carbs: String
    @State private var fat: String
    @State private var quantity: String
    @State private var unit: String
    @State private var isSaving: Bool = false
    @State private var errorText: String? = nil
    @FocusState private var focused: Field?

    private enum Field { case name, kcal, protein, carbs, fat, quantity }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
            && Double(kcal.replacingOccurrences(of: ",", with: ".")) != nil
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        nameField
                        macrosGrid
                        quantityRow
                        if let errorText {
                            Text(errorText)
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.Color.accent)
                        }
                        saveButton
                    }
                    .padding(Theme.Spacing.xl)
                }
            }
            .navigationTitle(source == .barcode ? "Confirmar producto" : "Añadir alimento")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .tint(Theme.Color.accent)
                }
            }
        }
        .onAppear { if name.isEmpty { focused = .name } }
    }

    private var nameField: some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: "Alimento")
            TextField("Pollo, plátano, avena…", text: $name)
                .focused($focused, equals: .name)
                .textInputAutocapitalization(.sentences)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.foreground)
                .padding(14)
                .background(Theme.Color.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private var macrosGrid: some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: "Macros (total para la cantidad)")
            HStack(spacing: 10) {
                macroField(label: "kcal", text: $kcal, field: .kcal)
                macroField(label: "P (g)", text: $protein, field: .protein)
                macroField(label: "C (g)", text: $carbs, field: .carbs)
                macroField(label: "G (g)", text: $fat, field: .fat)
            }
        }
    }

    private func macroField(label: String, text: Binding<String>, field: Field) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("0", text: text)
                .focused($focused, equals: field)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.center)
                .font(.system(size: 18, weight: .heavy, design: .default).italic().monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
                .background(Theme.Color.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .tracking(1.0)
                .textCase(.uppercase)
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
    }

    private var quantityRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: "Cantidad (opcional)")
            HStack(spacing: 10) {
                TextField("p. ej. 150", text: $quantity)
                    .focused($focused, equals: .quantity)
                    .keyboardType(.decimalPad)
                    .font(.system(size: 16, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(14)
                    .background(Theme.Color.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                Picker("Unidad", selection: $unit) {
                    ForEach(["g", "ml", "ud", "porción"], id: \.self) { u in
                        Text(u).tag(u)
                    }
                }
                .pickerStyle(.menu)
                .tint(Theme.Color.accent)
                .padding(.horizontal, 8)
                .background(Theme.Color.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    private var saveButton: some View {
        Button {
            Haptics.light()
            Task { await save() }
        } label: {
            HStack {
                if isSaving { ProgressView().tint(Theme.Color.accentOn) }
                Text(isSaving ? "Guardando…" : "Añadir")
                    .font(.system(size: 15, weight: .bold))
            }
            .foregroundStyle(Theme.Color.accentOn)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(canSave ? Theme.Color.accent : Theme.Color.accent.opacity(0.4))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .disabled(!canSave || isSaving)
    }

    private func num(_ s: String) -> Double {
        Double(s.replacingOccurrences(of: ",", with: ".")) ?? 0
    }

    @MainActor
    private func save() async {
        errorText = nil
        isSaving = true
        defer { isSaving = false }
        let qty = quantity.isEmpty ? nil : num(quantity)
        let ok = await NutritionService.shared.addEntry(
            name: name.trimmingCharacters(in: .whitespaces),
            kcal: num(kcal),
            protein_g: num(protein),
            carbs_g: num(carbs),
            fat_g: num(fat),
            quantity: qty,
            unit: qty == nil ? nil : unit,
            source: source,
            barcode: prefill.barcode,
            raw: prefill.raw
        )
        if ok {
            onAdded()
        } else {
            errorText = NutritionService.shared.lastError ?? "No se pudo guardar."
        }
    }
}
