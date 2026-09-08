import SwiftUI
import PhotosUI
import UIKit

// Profile tab — élite athlete identity card + a clean, grouped settings list in
// the handoff `perfil` aesthetic (label-left muted / value-right). Every actionable
// row opens a NavigationLink to the existing detail (Suscripción → SubscriptionView,
// PM5 → PM5SettingsView, Modalidad → DoblesPlanView when in Dobles) or a sheet
// (Metodología, Legal). Read-only rows (Objetivo, Idioma) state status honestly.
// Sign out wires through the onSignOut closure provided by AppRoot/TodayView.
struct ProfileView: View {
    let bearer: String?
    /// FREE tier switch (athlete without coach). False hides every coach-owned
    /// surface: the Suscripción row (nothing to pay by design), the coach test
    /// battery + zones (coach-calibrated), the Metodología section and the
    /// coach sheet — and reframes injuries + legal copy to the athlete alone.
    var hasCoach: Bool = true
    let onSignOut: () -> Void

    // App appearance lives in ProfileCuentaView (@AppStorage ThemeMode).

    // ── Shared data: read live from the injected AppDataStore (cache-first/SWR) ──
    // Identity, partner, subscription and the coach name come from the store, so
    // opening Perfil renders instantly from memory — no redaction flash, no
    // re-fetch on a tab switch; the store revalidates in the background.
    @Environment(AppDataStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    private var identity: AthleteIdentity? { store.identity.value }

    /// Coach display name from the week payload (agnostic, multi-coach). Nil when
    /// unset / whitespace-only so callers fall back cleanly.
    private var coachName: String? {
        let n = store.planWeek.value?.coachName?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (n?.isEmpty == false) ? n : nil
    }

    // Upcoming races — the SAME source the Carreras tab reads
    // (GET /api/athlete/races → upcoming). Used ONLY to derive the athlete's
    // competition division for the identity subtitle (`objetivoRace`); the race
    // objective itself lives in the Carreras tab, not in Perfil. Kept as a local
    // fetch — Perfil-only, not a cross-tab slice.
    @State private var upcomingRaces: [UpcomingRace] = []

    @State private var showEditProfile: Bool = false
    /// La hoja de la foto de perfil: elegirla, verla antes de confirmarla y
    /// quitarla. Se abre tocando el avatar.
    @State private var showFotoPerfil: Bool = false

    // COROS «¿esto es el entreno?» — sigue apareciendo al abrir Perfil aunque
    // la conexión viva en Dispositivos y apps.
    @State private var corosPendingLink: WearablePendingLink? = nil
    @State private var showCorosLinkAsk: Bool = false
    @State private var corosAlert: String? = nil

    var body: some View {
        profileNavigationStack
            .task { await profileOnAppear() }
            .sheet(isPresented: $showEditProfile) {
                EditProfileView(bearer: bearer, identity: identity) { updated in
                    store.setIdentity(updated)
                }
            }
            .sheet(isPresented: $showFotoPerfil) {
                FotoPerfilSheet(
                    bearer: bearer,
                    iniciales: identity?.initials ?? "",
                    fotoActual: identity?.avatarURLResuelta
                ) { actualizada in
                    store.setIdentity(actualizada)
                }
            }
            .confirmationDialog(
                "¿Esto es el entreno?",
                isPresented: $showCorosLinkAsk,
                titleVisibility: .visible
            ) {
                Button("Sí") { Task { await answerCorosLink(yes: true) } }
                Button("No") { Task { await answerCorosLink(yes: false) } }
                Button("Ahora no", role: .cancel) {}
            } message: {
                Text("Hay un entreno previsto hoy y una actividad nueva en COROS. Si dices que no, la actividad queda en el historial y el plan no se toca.")
            }
            .alert("COROS", isPresented: corosAlertBinding, presenting: corosAlert) { _ in
                Button("Entendido", role: .cancel) {}
            } message: { message in
                Text(message)
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                Task { await refreshCorosBackground() }
            }
    }

    private var profileNavigationStack: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    profileDoorList
                }
            }
            .navigationBarHidden(true)
        }
    }

    private var profileDoorList: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            identityCard

                        profileDoorSection(
                            title: "Identidad",
                            subtitle: identidadDoorSubtitle,
                            destination: ProfileIdentidadView(bearer: bearer, hasCoach: hasCoach)
                        )

            RendimientoSection(
                bearer: bearer,
                hasCoach: hasCoach,
                fuerza: store.strengthMaxes.value,
                zonas: identity?.hrZones,
                identidadCargada: store.identity.hasLoaded,
                onSessionCompleted: { Task { await store.planMutated() } }
            )

                        profileDoorSection(
                            title: "Entreno",
                            subtitle: "Días, molestias, avisos de voz y pruebas del reloj",
                            destination: ProfileEntrenoView(
                                bearer: bearer,
                                hasCoach: hasCoach,
                                coachName: coachName
                            )
                        )

                        profileDoorSection(
                            title: "Dispositivos y apps",
                            subtitle: "Apple Health, reloj, Garmin, Polar, COROS y más",
                            destination: DeviceConnectionsView(bearer: bearer)
                        )

                        profileDoorSection(
                            title: "Cuenta",
                            subtitle: hasCoach
                                ? "Apariencia, metodología y privacidad de datos"
                                : "Apariencia y privacidad de datos",
                            destination: ProfileCuentaView(
                                bearer: bearer,
                                hasCoach: hasCoach,
                                coachName: coachName,
                                partnerName: store.partner.value?.partner?.firstName,
                                onSignOut: onSignOut
                            )
                        )

                        profileDoorSection(
                            title: "Ayuda y legal",
                            subtitle: "Sugerencias, privacidad y términos",
                            destination: ProfileAyudaLegalView(bearer: bearer, hasCoach: hasCoach)
                        )

            signOutButton
            appVersionFooter
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.xxl)
        .clampedToContainerWidth()
    }

    private func profileOnAppear() async {
        store.activate(bearer: bearer)
        HealthKitSyncService.shared.onAuthorizationDenied = {
            UserDefaults.standard.set(false, forKey: HealthKitConnection.connectedKey)
        }
        await store.loadProfile()
        await loadRaces()
        await refreshCorosBackground()
        if HealthKitConnection.isConnected {
            let importer = HealthKitHistoryImporter.shared
            importer.rebind(athleteId: AuthState.persistedAthleteId())
            importer.consentAndStart()
        }
    }

    // MARK: - Profile doors (FH-88)

    private var identidadDoorSubtitle: String {
        if let goal = identity?.goalType, let label = GoalTypeOption(rawValue: goal)?.label {
            return "Modalidad, objetivo · \(label)"
        }
        return "Modalidad, suscripción, objetivo e idioma"
    }

    @ViewBuilder
    private func profileDoorSection<Destination: View>(
        title: String,
        subtitle: String,
        destination: Destination
    ) -> some View {
        SectionHeader(title: title)
        CardSurface(padding: 0) {
            NavigationLink {
                destination
            } label: {
                ProfileDoorRow(
                    icon: profileDoorIcon(title),
                    title: title,
                    subtitle: subtitle
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func profileDoorIcon(_ title: String) -> String {
        switch title {
        case "Identidad": return "person.crop.circle"
        case "Entreno": return "figure.run"
        case "Dispositivos y apps": return "applewatch.and.arrow.forward"
        case "Cuenta": return "gearshape"
        case "Ayuda y legal": return "questionmark.circle"
        default: return "chevron.right"
        }
    }

    private func refreshCorosBackground() async {
        guard let bearer else { return }
        guard let status = try? await WearablesService.fetch(bearer: bearer) else { return }
        let connected = status.providers.first { $0.provider == WearablesService.coros }?.connected ?? false
        guard connected else {
            if let next = status.pendingLinks.first(where: { $0.provider == WearablesService.coros }) {
                corosPendingLink = next
                showCorosLinkAsk = true
            }
            return
        }
        do {
            let resp = try await WearablesService.corosSync(bearer: bearer)
            if let next = resp.pendingLinks.first(where: { $0.provider == WearablesService.coros }) {
                corosPendingLink = next
                showCorosLinkAsk = true
                return
            }
            corosPendingLink = nil
            let shouldAlert = (resp.imported ?? 0) > 0
                || resp.skipReason != nil
                || (resp.errored ?? 0) > 0
            if shouldAlert {
                corosAlert = WearablesService.corosSyncResultMessage(resp)
            }
        } catch {
            corosAlert = WearablesService.corosSyncErrorMessage(error)
        }
    }

    private var corosAlertBinding: Binding<Bool> {
        Binding(get: { corosAlert != nil }, set: { if !$0 { corosAlert = nil } })
    }

    private func answerCorosLink(yes: Bool) async {
        guard let bearer, let link = corosPendingLink else { return }
        do {
            try await WearablesService.corosConfirm(
                bearer: bearer,
                confirmationId: link.confirmationId,
                yes: yes
            )
            corosPendingLink = nil
        } catch {
            corosAlert = "No pudimos guardar tu respuesta. Inténtalo de nuevo."
        }
    }

    // MARK: - Identity

    private var identityCard: some View {
        let name = identity?.fullName ?? "Tu perfil"
        let initials = identity?.initials ?? ""
        return HStack(spacing: 14) {
            Button {
                Haptics.light()
                showFotoPerfil = true
            } label: {
                identityAvatar(initials: initials)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(identity?.avatarURLResuelta == nil
                                ? "Poner tu foto de perfil"
                                : "Cambiar tu foto de perfil")
            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.system(size: 22, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let subtitle = identitySubtitle {
                    Text(subtitle)
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        // Composed of the athlete's own metrics; can run long. Wrap
                        // within the card rather than reporting a wide single line.
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            Button {
                Haptics.light()
                showEditProfile = true
            } label: {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Editar perfil")
        }
        .padding(.vertical, Theme.Spacing.xs)
        // `.contain`, no `.combine`: la tarjeta tiene ahora DOS controles (la
        // foto y el lápiz). Fundirlo todo en un solo elemento los enterraría a
        // los dos como acciones de un blob de texto.
        .accessibilityElement(children: .contain)
    }

    /// El avatar grande de Perfil, y la puerta de entrada a la foto.
    ///
    /// Conserva el círculo naranja de la marca: sin foto se ve exactamente lo de
    /// siempre — iniciales, o la silueta cuando todavía no hay nombre (mismo
    /// glifo y misma proporción que `CoachAvatar`, 0,42 del diámetro; un avatar
    /// vacío no es un dato que falte, §7). La foto, cuando la hay, va encima.
    private func identityAvatar(initials: String) -> some View {
        ZStack {
            Circle().fill(Theme.Color.accent)
            if initials.isEmpty {
                Image(systemName: "person.fill")
                    .font(.system(size: 25, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentOn)
            } else {
                Text(initials)
                    .font(.system(size: 22, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.accentOn)
            }
        }
        .frame(width: 60, height: 60)
        .overlay(AvatarPhoto(url: identity?.avatarURLResuelta))
        // La chapita de cámara es lo que cuenta que el círculo se toca. Sin ella
        // el atleta no tiene forma de saber que ahí se pone su cara.
        .overlay(alignment: .bottomTrailing) {
            Image(systemName: "camera.fill")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 22, height: 22)
                .background(Circle().fill(Theme.Color.surfaceElevated))
                .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))
                .offset(x: 3, y: 3)
        }
        .contentShape(Circle())
    }

    /// Builds the identity subtitle from ONLY the fields the backend returns.
    /// Division comes from the target race (real); there is NO athlete "nivel"
    /// field, so we never render the handoff's "Nivel avanzado" — see BACKEND
    /// GAP. Body metrics + experience fill the rest.
    private var identitySubtitle: String? {
        guard let id = identity else { return nil }
        var parts: [String] = []
        if let division = AthleteNextRace.divisionLabel(objetivoRace?.division) {
            parts.append("división \(division)")
        }
        if let age = id.age { parts.append("\(age)") }
        if let yrs = id.trainingExperienceYears, yrs > 0 {
            parts.append("\(Int(yrs))y entrenando")
        }
        switch (id.heightCm, id.weightKg) {
        case let (h?, w?): parts.append("\(Int(h))cm / \(Int(w))kg")
        case let (h?, nil): parts.append("\(Int(h))cm")
        case let (nil, w?): parts.append("\(Int(w))kg")
        default: break
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var objetivoRace: UpcomingRace? {
        upcomingRaces.first { $0.priority?.lowercased() == "target" } ?? upcomingRaces.first
    }

    private func loadRaces() async {
        guard let bearer else { return }
        if let races = await CarrerasService.fetchRaces(bearer: bearer) {
            upcomingRaces = races.upcoming
        }
    }

    // MARK: - App version (build visible in Perfil, not iOS Settings)

    private var appVersionFooter: some View {
        Group {
            if let version = AppBundleMetadata.displayVersion {
                Text(version)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, Theme.Spacing.m)
                    .accessibilityLabel("Versión \(version)")
            }
        }
    }

    // MARK: - Sign out

    private var signOutButton: some View {
        Button(action: { Haptics.medium(); onSignOut() }) {
            Text("Cerrar sesión")
                .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(Theme.Color.danger)
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.danger.opacity(0.4), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .padding(.top, Theme.Spacing.s)
    }

}

// MARK: - Section header

// Internal (no `private`) porque `RendimientoSection` lo monta desde su propio
// fichero: una sección que se pinta a sí misma tiene que poder escribir su propio
// encabezado, y duplicarlo allí es cómo dos secciones de la misma pantalla acaban
// con dos tipografías (contrato §0).
struct SectionHeader: View {
    let title: String
    /// El estado de la sección, alineado a la derecha del título — «3 de 5 con
    /// dato». Nil cuando la sección no tiene nada que contar de sí misma.
    var accesorio: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
            Text(title.uppercased())
                .scaledFont(10, weight: .semibold, relativeTo: .caption2)
                .tracking(1.6)
                .foregroundStyle(Theme.Color.muted)
            if let accesorio {
                Spacer(minLength: Theme.Spacing.s)
                Text(accesorio)
                    .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 4)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Export Share Sheet plumbing
//
// Identifiable wrapper so `.sheet(item:)` re-creates the Share Sheet for every
// new export instead of caching the previous fileURL.
struct ExportShareItem: Identifiable {
    let id = UUID()
    let fileURL: URL
}

// UIActivityViewController bridge for SwiftUI. Used by both the data-export
// flow (Files / AirDrop / Mail) and any future RGPD attachments.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// Slim "datos exportados" toast pinned to the top of the screen. Fabrik
// accent border + elevated surface, dismisses itself after ~2.4s via the caller's
// asyncAfter (so the parent owns the timing and can cancel if needed).
struct ToastBanner: View {
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.ok)
            Text(text)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.foreground)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Theme.Color.surfaceElevated)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.accentText.opacity(0.35), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .shadow(
            color: Theme.Shadow.cardTight.color,
            radius: Theme.Shadow.cardTight.radius,
            x: Theme.Shadow.cardTight.x,
            y: Theme.Shadow.cardTight.y
        )
    }
}

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

// MARK: - Foto de perfil
//
// La cara del atleta donde hasta hoy había iniciales. Un solo sitio para las
// tres cosas que puede hacer: elegirla de la galería, hacerla con la cámara y
// quitarla — y verla antes de confirmarla, porque lo que se previsualiza es
// EXACTAMENTE la imagen ya reducida que se va a subir.
//
// El estado se cuenta entero y sin mentir. Subir los bytes y que el servidor los
// dé por buenos son dos cosas distintas, así que la pantalla las enseña por
// separado y no canta "guardada" hasta que vuelve el perfil con la foto dentro.
// Si algo falla, dice el motivo y deja reintentar sin volver a elegir la foto.
private struct FotoPerfilSheet: View {
    let bearer: String?
    let iniciales: String
    let fotoActual: String?
    let onGuardada: (AthleteIdentity) -> Void

    @Environment(\.dismiss) private var dismiss

    /// Lo que se ve confirmado antes de cerrar. Corto: el atleta ya está mirando
    /// su foto puesta, esto solo remata el gesto.
    private static let esperaAlCerrar: Duration = .seconds(0.8)

    /// Diámetro de la previsualización. Grande a propósito: es lo que le deja
    /// juzgar si esa foto le vale antes de dejarla puesta.
    private static let diametroPrevia: CGFloat = 168

    private enum Estado: Equatable {
        /// Nada en marcha: se puede elegir, hacer foto o quitar la que haya.
        case reposo
        /// Reduciendo y recomprimiendo lo que acaba de elegir.
        case preparando
        /// Foto lista y a la vista, TODAVÍA no es su foto de perfil.
        case elegida
        case subiendo(Double)
        case guardando
        case quitando
        case hecho(String)
        case error(String)
    }

    @State private var estado: Estado = .reposo
    /// La imagen ya reducida — lo que se ve y lo que se sube, la misma.
    @State private var previa: UIImage? = nil
    @State private var jpeg: Data? = nil
    @State private var seleccion: PhotosPickerItem? = nil
    /// El selector de galería lleva su propio interruptor para no confundir
    /// "hoja abierta" con "foto ya elegida".
    @State private var mostrandoGaleria: Bool = false
    @State private var mostrarCamara: Bool = false
    @State private var confirmarQuitar: Bool = false

    private var camaraDisponible: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    /// Con algo en marcha no se toca nada más: ni se elige otra, ni se quita, ni
    /// se cierra por accidente a mitad de una subida.
    private var ocupado: Bool {
        switch estado {
        case .preparando, .subiendo, .guardando, .quitando, .hecho: return true
        case .reposo, .elegida, .error: return false
        }
    }

    private var hayFoto: Bool { fotoActual != nil }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: Theme.Spacing.l) {
                        cabecera
                        previsualizacion
                        estadoActual
                        acciones
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cerrar") { dismiss() }
                        .foregroundStyle(Theme.Color.muted)
                        .disabled(ocupado)
                }
            }
        }
        .interactiveDismissDisabled(ocupado)
        .photosPicker(
            isPresented: $mostrandoGaleria,
            selection: $seleccion,
            matching: .images,
            photoLibrary: .shared()
        )
        .onChange(of: seleccion) { _, item in
            guard let item else { return }
            Task { await prepararDesdeGaleria(item) }
        }
        .fullScreenCover(isPresented: $mostrarCamara) {
            // La misma cámara que ya usa el resto de la app; devuelve la foto y
            // se cierra sola.
            CameraPicker { imagen in aceptar(imagen) }
                .ignoresSafeArea()
        }
        .confirmationDialog(
            "¿Quitar tu foto?",
            isPresented: $confirmarQuitar,
            titleVisibility: .visible
        ) {
            Button("Quitar foto", role: .destructive) { Task { await quitar() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Tu avatar volverá a mostrar tus iniciales. Puedes poner otra cuando quieras.")
        }
    }

    // MARK: - Piezas

    private var cabecera: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "TU FOTO", color: Theme.Color.accentText)
            Text("Ponle cara a tu perfil")
                .font(Theme.Typography.headlineS)
                .foregroundStyle(Theme.Color.foreground)
            Text("Se ve en tu perfil y en tu inicio. Puedes cambiarla o quitarla cuando quieras.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// El círculo grande. Debajo siempre el avatar de siempre (iniciales o
    /// silueta), y encima la foto: la recién elegida si la hay, si no la que ya
    /// tiene guardada. Así nunca se ve un hueco.
    private var previsualizacion: some View {
        ZStack {
            Circle().fill(Theme.Color.accent)
            if iniciales.isEmpty {
                Image(systemName: "person.fill")
                    .font(.system(size: Self.diametroPrevia * 0.42, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentOn)
            } else {
                Text(iniciales)
                    .font(.system(size: Self.diametroPrevia * 0.34, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.accentOn)
            }
        }
        .frame(width: Self.diametroPrevia, height: Self.diametroPrevia)
        .overlay {
            if let previa {
                Image(uiImage: previa)
                    .resizable()
                    .scaledToFill()
                    .clipShape(Circle())
            } else {
                AvatarPhoto(url: fotoActual)
            }
        }
        .overlay(Circle().stroke(Theme.Color.hairline, lineWidth: 1))
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var estadoActual: some View {
        switch estado {
        case .reposo:
            EmptyView()
        case .elegida:
            Text("Así se va a ver. Guárdala para dejarla puesta.")
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
        case .preparando:
            trabajando("Preparando la foto…")
        case .subiendo(let avance):
            VStack(spacing: 8) {
                trabajando("Subiendo tu foto… \(Int((avance * 100).rounded()))%")
                ProgressView(value: avance)
                    .tint(Theme.Color.accent)
            }
        case .guardando:
            trabajando("Guardando en tu perfil…")
        case .quitando:
            trabajando("Quitando la foto…")
        case .hecho(let texto):
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(Theme.Color.ok)
                Text(texto)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
            }
        case .error(let motivo):
            VStack(spacing: 10) {
                Text(motivo)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.danger)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                // Reintentar NO obliga a volver a elegir la foto: los bytes ya
                // preparados siguen aquí.
                if jpeg != nil {
                    Button("Reintentar") { Task { await guardar() } }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                }
            }
        }
    }

    private func trabajando(_ texto: String) -> some View {
        HStack(spacing: 10) {
            ProgressView().controlSize(.small)
            Text(texto)
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.muted)
        }
    }

    @ViewBuilder
    private var acciones: some View {
        // Ya guardada: no queda nada que ofrecer, la hoja se aparta sola.
        if case .hecho = estado {
            EmptyView()
        } else {
            VStack(spacing: 12) {
                if previa != nil {
                    ExpertPrimaryButton(title: "GUARDAR FOTO", enabled: !ocupado) {
                        Task { await guardar() }
                    }
                    Button("Elegir otra") { descartarElegida() }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                        .disabled(ocupado)
                } else {
                    ExpertPrimaryButton(title: "ELEGIR DE LA GALERÍA", enabled: !ocupado) {
                        mostrandoGaleria = true
                    }
                    if camaraDisponible {
                        Button {
                            Haptics.light()
                            mostrarCamara = true
                        } label: {
                            Text("Hacer una foto")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Theme.Color.foreground)
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .background(Theme.Color.surface)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                                        .stroke(Theme.Color.outline, lineWidth: 1)
                                )
                        }
                        .buttonStyle(PressScaleStyle())
                        .disabled(ocupado)
                    }
                    if hayFoto {
                        Button("Quitar foto") {
                            Haptics.light()
                            confirmarQuitar = true
                        }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.danger)
                        .disabled(ocupado)
                        .padding(.top, Theme.Spacing.xs)
                    }
                }
            }
        }
    }

    // MARK: - Flujo

    /// La galería entrega bytes. Decodificar una foto de 12 MP y redibujarla
    /// cuesta décimas, así que se hace FUERA del hilo principal: si no, la hoja
    /// se queda congelada justo después de elegir.
    private func prepararDesdeGaleria(_ item: PhotosPickerItem) async {
        estado = .preparando
        // Se suelta SIEMPRE al terminar, salga bien o mal: si la selección se
        // quedara puesta, volver a elegir esa misma foto no dispararía nada.
        defer { seleccion = nil }
        do {
            guard let original = try await item.loadTransferable(type: Data.self) else {
                fallar(AthletePhotoError.noSePudoPreparar)
                return
            }
            let reducida = await Task.detached(priority: .userInitiated) {
                AthletePhotoImage.jpegParaSubir(desde: original)
            }.value
            guard let reducida, let imagen = UIImage(data: reducida) else {
                fallar(AthletePhotoError.noSePudoPreparar)
                return
            }
            previa = imagen
            jpeg = reducida
            estado = .elegida
        } catch {
            estado = .error(AthletePhotoService.motivo(error))
        }
    }

    /// La cámara entrega la imagen ya decodificada y de un solo disparo: aquí
    /// reducirla es un pestañeo, no hace falta salir del hilo principal.
    private func aceptar(_ imagen: UIImage) {
        guard let reducida = AthletePhotoImage.jpegParaSubir(imagen),
              let vista = UIImage(data: reducida) else {
            fallar(AthletePhotoError.noSePudoPreparar)
            return
        }
        previa = vista
        jpeg = reducida
        estado = .elegida
    }

    private func descartarElegida() {
        Haptics.light()
        previa = nil
        jpeg = nil
        seleccion = nil
        estado = .reposo
    }

    private func guardar() async {
        guard let jpeg else { return }
        guard let bearer else { fallarSinSesion(); return }
        estado = .subiendo(0)
        do {
            let actualizada = try await AthletePhotoService.subir(bearer: bearer, jpeg: jpeg) { paso in
                switch paso {
                case .subiendo(let avance): estado = .subiendo(avance)
                case .guardando: estado = .guardando
                }
            }
            await cerrarConExito(actualizada, texto: "Foto guardada")
        } catch {
            Haptics.error()
            estado = .error(AthletePhotoService.motivo(error))
        }
    }

    private func quitar() async {
        guard let bearer else { fallarSinSesion(); return }
        estado = .quitando
        do {
            let actualizada = try await AthletePhotoService.quitar(bearer: bearer)
            await cerrarConExito(actualizada, texto: "Foto quitada")
        } catch {
            Haptics.error()
            estado = .error(AthletePhotoService.motivo(error))
        }
    }

    /// Solo aquí se da algo por hecho: con el perfil que devolvió el servidor en
    /// la mano. Se avisa al padre ANTES de la pausa para que el avatar de detrás
    /// ya esté cambiado cuando la hoja se aparta.
    private func cerrarConExito(_ identidad: AthleteIdentity, texto: String) async {
        Haptics.success()
        onGuardada(identidad)
        estado = .hecho(texto)
        try? await Task.sleep(for: Self.esperaAlCerrar)
        dismiss()
    }

    private func fallar(_ error: AthletePhotoError) {
        Haptics.error()
        estado = .error(error.mensaje)
    }

    /// Sin sesión no hay nada que guardar. No se calla ni se deja un botón que
    /// no hace nada: se dice, que es lo único honesto.
    private func fallarSinSesion() {
        Haptics.error()
        estado = .error("Tu sesión no está activa. Vuelve a entrar en la app e inténtalo otra vez.")
    }
}

