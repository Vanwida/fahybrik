import SwiftUI

// MARK: - Edit Profile sheet
//
// Full-screen edit form for the athlete's writable profile fields.
// Presented as a sheet from ProfileView's identity card pencil button.
// On successful save the onSaved closure updates the parent's @State identity
// so the card and settings rows reflect changes without a full reload.
struct EditProfileView: View {
    let bearer: String?
    let identity: AthleteIdentity?
    let onSaved: (AthleteIdentity) -> Void

    @Environment(\.dismiss) private var dismiss

    // IDENTIDAD
    @State private var fullName: String
    @State private var dobDate: Date
    @State private var hasDob: Bool
    @State private var sex: String?

    // CUERPO
    @State private var heightCmText: String
    @State private var weightKgText: String
    @State private var experienceText: String
    @State private var maxHrText: String

    // OBJETIVO
    @State private var goalType: String?
    @State private var goalOtherText: String

    // IDIOMA
    @State private var preferredLanguage: String?

    // Async save state
    @State private var saving: Bool = false
    @State private var saveError: String? = nil

    private static let dobFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    init(bearer: String?, identity: AthleteIdentity?, onSaved: @escaping (AthleteIdentity) -> Void) {
        self.bearer = bearer
        self.identity = identity
        self.onSaved = onSaved

        _fullName = State(initialValue: identity?.fullName ?? "")

        if let dobStr = identity?.dob, let date = Self.dobFormatter.date(from: dobStr) {
            _dobDate = State(initialValue: date)
            _hasDob = State(initialValue: true)
        } else {
            // Default picker position: 25 years ago
            let fallback = Calendar.current.date(byAdding: .year, value: -25, to: Date()) ?? Date()
            _dobDate = State(initialValue: fallback)
            _hasDob = State(initialValue: false)
        }

        _sex = State(initialValue: identity?.sex)

        _heightCmText = State(initialValue: identity?.heightCm.map { v in
            v.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(v)) : String(v)
        } ?? "")
        _weightKgText = State(initialValue: identity?.weightKg.map { v in
            v.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(v)) : String(v)
        } ?? "")
        _experienceText = State(initialValue: identity?.trainingExperienceYears.map { v in
            v.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(v)) : String(v)
        } ?? "")
        // Seeded from the athlete's saved max HR — this editor is the ONLY entry
        // point (starts empty for everyone until set here). It is an INPUT the
        // server may use to derive a threshold when there is no measured one; it
        // is not itself a zone anchor. Empty and no date of birth → no zones.
        _maxHrText = State(initialValue: identity?.maxHrBpm.map(String.init) ?? "")

        _goalType = State(initialValue: identity?.goalType)
        _goalOtherText = State(initialValue: identity?.goalOtherText ?? "")
        _preferredLanguage = State(initialValue: identity?.preferredLanguage)
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    editProfileForm
                }
            }
            .navigationTitle("Editar perfil")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { editProfileToolbar }
        }
    }

    private var editProfileForm: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            editIdentidadSection
            editCuerpoSection
            editObjetivoSection
            editIdiomaSection
            editSaveErrorSection
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.xxl)
        .clampedToContainerWidth()
    }

    private var editIdentidadSection: some View {
        Group {
            editSectionHeader("IDENTIDAD")
            CardSurface(padding: 0) {
                VStack(spacing: 0) {
                    editTextRow(label: "Nombre", placeholder: "Tu nombre completo", text: $fullName)
                        .accessibilityLabel("Nombre")
                    Hairline()
                    dobRow
                    Hairline()
                    sexRow
                }
            }
        }
    }

    private var editCuerpoSection: some View {
        Group {
            editSectionHeader("CUERPO")
            CardSurface(padding: 0) {
                VStack(spacing: 0) {
                    editDecimalRow(label: "Altura (cm)", placeholder: "80–260", text: $heightCmText)
                        .accessibilityLabel("Altura en centímetros")
                    Hairline()
                    editDecimalRow(label: "Peso (kg)", placeholder: "25–250", text: $weightKgText)
                        .accessibilityLabel("Peso en kilogramos")
                    Hairline()
                    editDecimalRow(label: "Años entrenando", placeholder: "0–80", text: $experienceText)
                        .accessibilityLabel("Años de experiencia entrenando")
                    Hairline()
                    editDecimalRow(label: "FC máx (ppm)", placeholder: "100–230", text: $maxHrText)
                        .accessibilityLabel("Frecuencia cardiaca máxima en pulsaciones por minuto")
                }
            }
            Text("Tus zonas de pulso salen de tu umbral. Si nos das tu FC máxima lo estimamos desde ahí; si no, desde tu fecha de nacimiento. Sin ninguna de las dos no hay zonas, y el test de umbral es lo único que las fija de verdad.")
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
                .padding(.horizontal, 4)
            if hasBodyRangeWarning {
                bodyRangeHint
            }
        }
    }

    private var editObjetivoSection: some View {
        Group {
            editSectionHeader("OBJETIVO")
            CardSurface(padding: 0) {
                VStack(spacing: 0) {
                    goalTypeRow
                    if goalType == "other" {
                        Hairline()
                        editTextRow(
                            label: "Descripción",
                            placeholder: "Máx. 500 caracteres",
                            text: $goalOtherText
                        )
                        .accessibilityLabel("Descripción del objetivo")
                    }
                }
            }
        }
    }

    private var editIdiomaSection: some View {
        Group {
            editSectionHeader("IDIOMA")
            CardSurface(padding: 0) {
                languageRow
            }
            Text("La app se está traduciendo; algunos textos seguirán en español por ahora. Se aplicará al reiniciar.")
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
                .padding(.horizontal, 4)
        }
    }

    @ViewBuilder
    private var editSaveErrorSection: some View {
        if let err = saveError {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.danger)
                Text(err)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.danger)
            }
            .padding(.horizontal, 4)
        }
    }

    @ToolbarContentBuilder
    private var editProfileToolbar: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Cancelar") { dismiss() }
                .foregroundStyle(Theme.Color.muted)
        }
        ToolbarItem(placement: .confirmationAction) {
            Group {
                if saving {
                    ProgressView().tint(Theme.Color.accentText)
                } else {
                    Button("Guardar") {
                        Haptics.light()
                        Task { await save() }
                    }
                    .foregroundStyle(Theme.Color.accentText)
                    .fontWeight(.semibold)
                    .disabled(fullName.trimmingCharacters(in: .whitespaces).isEmpty || bearer == nil)
                }
            }
        }
    }

    // MARK: - Section header (local style)

    private func editSectionHeader(_ title: String) -> some View {
        Text(title)
            .scaledFont(10, weight: .semibold, relativeTo: .caption2)
            .tracking(1.6)
            .foregroundStyle(Theme.Color.muted)
            .padding(.horizontal, 4)
            .padding(.top, 4)
    }

    // MARK: - Generic row helpers

    private func editTextRow(label: String, placeholder: String, text: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .frame(minWidth: 110, alignment: .leading)
            TextField(placeholder, text: text)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
    }

    private func editDecimalRow(label: String, placeholder: String, text: Binding<String>) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .frame(minWidth: 110, alignment: .leading)
            TextField(placeholder, text: text)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.trailing)
                .keyboardType(.decimalPad)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
    }

    // MARK: - DOB row

    private var dobRow: some View {
        HStack(spacing: 12) {
            Text("Nacimiento")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .frame(minWidth: 110, alignment: .leading)
            Spacer()
            if hasDob {
                DatePicker(
                    "",
                    selection: $dobDate,
                    in: minDob...maxDob,
                    displayedComponents: .date
                )
                .labelsHidden()
                .datePickerStyle(.compact)
                .tint(Theme.Color.accentText)
                .accessibilityLabel("Fecha de nacimiento")
                Button {
                    hasDob = false
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.Color.muted)
                }
                .buttonStyle(.plain)
                .padding(.leading, 6)
                .accessibilityLabel("Quitar fecha de nacimiento")
            } else {
                Button {
                    hasDob = true
                } label: {
                    Text("Añadir")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.accentText)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Añadir fecha de nacimiento")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
    }

    private var minDob: Date {
        Calendar.current.date(byAdding: .year, value: -80, to: Date()) ?? Date()
    }
    private var maxDob: Date {
        Calendar.current.date(byAdding: .year, value: -10, to: Date()) ?? Date()
    }

    // MARK: - Sex row

    private var sexRow: some View {
        HStack(spacing: 12) {
            Text("Sexo")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .frame(minWidth: 110, alignment: .leading)
            Spacer()
            Menu {
                Button("Sin especificar") { sex = nil }
                Button("Hombre")          { sex = "male" }
                Button("Mujer")           { sex = "female" }
                Button("Otro")            { sex = "other" }
            } label: {
                editMenuLabel(sexLabel)
            }
            .accessibilityLabel("Sexo: \(sexLabel)")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
    }

    private var sexLabel: String {
        switch sex {
        case "male":   return "Hombre"
        case "female": return "Mujer"
        case "other":  return "Otro"
        default:       return "Sin especificar"
        }
    }

    // MARK: - Body range hint

    /// The entered FCmáx as a sane Int (100–230), else nil. Out-of-range or blank →
    /// nil, so a typo never persists an absurd max (it also trips the range hint).
    private var parsedMaxHr: Int? {
        guard let d = parseDecimal(maxHrText) else { return nil }
        let i = Int(d.rounded())
        return (i >= AthleteMaxHR.minBpm && i <= AthleteMaxHR.maxBpm) ? i : nil
    }

    private var hasBodyRangeWarning: Bool {
        let h = parseDecimal(heightCmText)
        let w = parseDecimal(weightKgText)
        let e = parseDecimal(experienceText)
        let hBad = h.map { $0 < 80 || $0 > 260 } ?? false
        let wBad = w.map { $0 < 25 || $0 > 250 } ?? false
        let eBad = e.map { $0 < 0 || $0 > 80 }  ?? false
        // A non-empty FCmáx that isn't a sane integer in-range is flagged.
        let mBad = !maxHrText.trimmingCharacters(in: .whitespaces).isEmpty && parsedMaxHr == nil
        return hBad || wBad || eBad || mBad
    }

    private var bodyRangeHint: some View {
        HStack(spacing: 6) {
            Image(systemName: "info.circle")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
            Text("Comprueba los rangos: 80–260 cm · 25–250 kg · 0–80 años · FC máx 100–230 ppm")
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Goal type row

    private var goalTypeRow: some View {
        HStack(spacing: 12) {
            Text("Objetivo")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .frame(minWidth: 110, alignment: .leading)
            Spacer()
            Menu {
                Button("Sin definir") { goalType = nil }
                ForEach(GoalTypeOption.allCases, id: \.rawValue) { option in
                    Button(option.label) { goalType = option.rawValue }
                }
            } label: {
                editMenuLabel(goalTypeLabel(goalType), muted: goalType == nil)
            }
            .accessibilityLabel("Objetivo: \(goalTypeLabel(goalType))")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
    }

    // MARK: - Language row

    private var languageRow: some View {
        HStack(spacing: 12) {
            Text("Idioma")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .frame(minWidth: 110, alignment: .leading)
            Spacer()
            Menu {
                Button("Sin definir") { preferredLanguage = nil }
                Button("Español")     { preferredLanguage = "es" }
                Button("English")     { preferredLanguage = "en" }
            } label: {
                let lbl = preferredLanguage.flatMap { languageLabel($0) } ?? "Sin definir"
                editMenuLabel(lbl, muted: preferredLanguage == nil)
            }
            .accessibilityLabel("Idioma: \(preferredLanguage.flatMap { languageLabel($0) } ?? "Sin definir")")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
    }

    // MARK: - Menu label component (shared by goal/sex/language menus)

    private func editMenuLabel(_ text: String, muted: Bool = false) -> some View {
        HStack(spacing: 4) {
            Text(text)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(muted ? Theme.Color.muted : Theme.Color.foreground)
            Image(systemName: "chevron.up.chevron.down")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
        }
    }

    // MARK: - Save

    @MainActor
    private func save() async {
        guard let bearer, !saving else { return }
        let trimmedName = fullName.trimmingCharacters(in: .whitespaces)
        guard !trimmedName.isEmpty else {
            saveError = "El nombre no puede estar vacío."
            return
        }

        saving = true
        saveError = nil
        defer { saving = false }

        let h = parseDecimal(heightCmText)
        let w = parseDecimal(weightKgText)
        let e = parseDecimal(experienceText)

        let otherText: String? = goalType == "other"
            ? goalOtherText.trimmingCharacters(in: .whitespaces).nilIfEmpty
            : nil

        let body = ProfileUpdate(
            fullName: trimmedName,
            dob: hasDob ? Self.dobFormatter.string(from: dobDate) : nil,
            sex: sex,
            heightCm: h,
            weightKg: w,
            trainingExperienceYears: e,
            goalType: goalType,
            goalOtherText: otherText.map { String($0.prefix(500)) },
            preferredLanguage: preferredLanguage,
            maxHrBpm: parsedMaxHr
        )

        do {
            let updated = try await ProfileService.update(bearer: bearer, body: body)
            // Persist iOS per-app language override; takes effect on next launch.
            if let lang = preferredLanguage {
                UserDefaults.standard.set([lang], forKey: "AppleLanguages")
            }
            onSaved(updated)
            dismiss()
        } catch APIError.http(401, _) {
            saveError = "Sesión caducada. Vuelve a iniciar sesión."
        } catch APIError.http(422, _) {
            saveError = "Revisa los datos: algún valor está fuera de rango."
        } catch {
            saveError = "No pudimos guardar. Revisa tu conexión."
        }
    }

    // MARK: - Helpers

    private func parseDecimal(_ raw: String) -> Double? {
        let normalised = raw.replacingOccurrences(of: ",", with: ".")
        return normalised.isEmpty ? nil : Double(normalised)
    }
}

// Convenience on String — avoids polluting the global namespace.
private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
