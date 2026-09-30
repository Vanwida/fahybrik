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

    /// Se puede guardar con nombre y sesión: lo demás es opcional.
    private var puedeGuardar: Bool {
        !fullName.trimmingCharacters(in: .whitespaces).isEmpty && bearer != nil
    }

    var body: some View {
        PantallaPerfil(titulo: "Editar perfil", cierre: .cancelar, cierreActivo: !saving) {
            editIdentidadSection
            editCuerpoSection
            editObjetivoSection
            editIdiomaSection
            if let err = saveError {
                AvisoEnLineaPerfil(tono: .peligro, texto: err)
            }
        } pie: {
            AccionAncladaPerfil(titulo: "Guardar cambios", enCurso: saving, habilitada: puedeGuardar) {
                Task { await save() }
            }
        }
        .interactiveDismissDisabled(saving)
    }

    private func seccion<Contenido: View>(_ titulo: String, @ViewBuilder _ contenido: () -> Contenido) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia(titulo)
            contenido()
        }
    }

    private var editIdentidadSection: some View {
        seccion("Identidad") {
            GrupoPerfil {
                CampoTextoPerfil(
                    etiqueta: "Nombre",
                    placeholder: "Tu nombre completo",
                    texto: $fullName,
                    capitalizacion: .words
                )
                dobRow
                sexRow
            }
        }
    }

    private var editCuerpoSection: some View {
        seccion("Cuerpo") {
            GrupoPerfil {
                CampoTextoPerfil(
                    etiqueta: "Altura", placeholder: "80–260", texto: $heightCmText, teclado: .decimalPad,
                    unidad: "cm", nombreAccesible: "Altura en centímetros"
                )
                CampoTextoPerfil(
                    etiqueta: "Peso", placeholder: "25–250", texto: $weightKgText, teclado: .decimalPad,
                    unidad: "kg", nombreAccesible: "Peso en kilogramos"
                )
                CampoTextoPerfil(
                    etiqueta: "Años entrenando", placeholder: "0–80", texto: $experienceText, teclado: .decimalPad,
                    nombreAccesible: "Años de experiencia entrenando"
                )
                CampoTextoPerfil(
                    etiqueta: "FC máx", placeholder: "100–230", texto: $maxHrText, teclado: .decimalPad,
                    unidad: "ppm", nombreAccesible: "Frecuencia cardiaca máxima en pulsaciones por minuto"
                )
            }
            NotaPerfil("Tus zonas de pulso salen de tu umbral. Si nos das tu FC máxima lo estimamos desde ahí; si no, desde tu fecha de nacimiento. Sin ninguna de las dos no hay zonas, y el test de umbral es lo único que las fija de verdad.")
            if hasBodyRangeWarning {
                AvisoEnLineaPerfil(tono: .info, texto: "Comprueba los rangos: 80–260 cm · 25–250 kg · 0–80 años · FC máx 100–230 ppm")
            }
        }
    }

    private var editObjetivoSection: some View {
        seccion("Objetivo") {
            GrupoPerfil {
                goalTypeRow
                if goalType == "other" {
                    CampoTextoPerfil(
                        etiqueta: "Descripción",
                        placeholder: "Máx. 500 caracteres",
                        texto: $goalOtherText
                    )
                }
            }
        }
    }

    private var editIdiomaSection: some View {
        seccion("Idioma") {
            GrupoPerfil { languageRow }
            NotaPerfil("La app se está traduciendo; algunos textos seguirán en español por ahora. Se aplicará al reiniciar.")
        }
    }

    // MARK: - DOB row

    private var dobRow: some View {
        HStack(spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Nacimiento").papel(.rotulo).foregroundStyle(Theme.Color.muted)
                if hasDob {
                    DatePicker(
                        "Fecha de nacimiento",
                        selection: $dobDate,
                        in: minDob...maxDob,
                        displayedComponents: .date
                    )
                    .labelsHidden()
                    .datePickerStyle(.compact)
                    .tint(Theme.Color.accentText)
                    .accessibilityLabel("Fecha de nacimiento")
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    Text("Sin añadir").papel(.cuerpo).foregroundStyle(Theme.Color.muted)
                }
            }
            Spacer(minLength: Theme.Spacing.m)
            if hasDob {
                Button {
                    hasDob = false
                } label: {
                    IconoDia(.cerrar, tam: 16, peso: .bold)
                        .foregroundStyle(Theme.Color.muted)
                        .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Quitar fecha de nacimiento")
            } else {
                AccionTextoPerfil(titulo: "Añadir", alineada: .trailing) { hasDob = true }
                    .accessibilityLabel("Añadir fecha de nacimiento")
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.s)
        .frame(minHeight: Theme.Size.toque + Theme.Spacing.m)
    }

    private var minDob: Date {
        Calendar.current.date(byAdding: .year, value: -80, to: Date()) ?? Date()
    }
    private var maxDob: Date {
        Calendar.current.date(byAdding: .year, value: -10, to: Date()) ?? Date()
    }

    // MARK: - Sex row

    private var sexRow: some View {
        FilaMenuPerfil(etiqueta: "Sexo", valor: sexLabel, vacio: sex == nil) {
            Button("Sin especificar") { sex = nil }
            Button("Hombre")          { sex = "male" }
            Button("Mujer")           { sex = "female" }
            Button("Otro")            { sex = "other" }
        }
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

    // MARK: - Goal type row

    private var goalTypeRow: some View {
        FilaMenuPerfil(etiqueta: "Objetivo", valor: goalTypeLabel(goalType), vacio: goalType == nil) {
            Button("Sin definir") { goalType = nil }
            ForEach(GoalTypeOption.allCases, id: \.rawValue) { option in
                Button(option.label) { goalType = option.rawValue }
            }
        }
    }

    // MARK: - Language row

    private var languageRow: some View {
        let etiqueta = preferredLanguage.flatMap { languageLabel($0) } ?? "Sin definir"
        return FilaMenuPerfil(etiqueta: "Idioma", valor: etiqueta, vacio: preferredLanguage == nil) {
            Button("Sin definir") { preferredLanguage = nil }
            Button("Español")     { preferredLanguage = "es" }
            Button("English")     { preferredLanguage = "en" }
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
