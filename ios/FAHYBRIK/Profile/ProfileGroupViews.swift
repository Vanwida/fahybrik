import SwiftUI

// MARK: - Entreno

struct ProfileEntrenoView: View {
    let bearer: String?
    var hasCoach: Bool = true
    let coachName: String?

    @AppStorage(AudioCoachSettings.enabledKey) private var voiceCoachEnabled = true
    @State private var contarRepesEnabled = SensorRepCounting.isEnabled

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                trainingDaysCard
                injuriesCard
                audioCoachCard
                contarRepesCard
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.l)
            .padding(.bottom, Theme.Spacing.xxl)
            .clampedToContainerWidth()
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .navigationTitle("Entreno")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var trainingDaysCard: some View {
        CardSurface(padding: 0) {
            NavigationLink {
                TrainingDaysView(bearer: bearer)
            } label: {
                ProfileNavRow(
                    icon: "calendar",
                    title: "Mis días de entreno",
                    subtitle: "Elige qué días entrenas y cómo se reparte tu semana"
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var injuriesCard: some View {
        CardSurface(padding: 0) {
            NavigationLink {
                InjuriesView(bearer: bearer, coachName: coachName, hasCoach: hasCoach)
            } label: {
                ProfileNavRow(
                    icon: "bandage.fill",
                    title: "Molestias y lesiones",
                    subtitle: hasCoach
                        ? "Reporta una molestia y sigue su evolución con tu coach"
                        : "Registra una molestia y sigue cómo evoluciona"
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var audioCoachCard: some View {
        CardSurface(padding: 0) {
            HStack(spacing: 12) {
                Image(systemName: "speaker.wave.2.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Avisos de voz")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("En carrera: cambios de tramo, ritmo y parciales por kilómetro.")
                        .scaledFont(11, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(2)
                }
                Spacer()
                Toggle("", isOn: $voiceCoachEnabled)
                    .labelsHidden()
                    .tint(Theme.Color.accent)
                    .accessibilityLabel("Avisos de voz")
                    .accessibilityValue(voiceCoachEnabled ? "activados" : "desactivados")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
        }
    }

    private var contarRepesCard: some View {
        CardSurface(padding: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack(spacing: 12) {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                        .frame(width: 26)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text("Contar repeticiones")
                                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                                .foregroundStyle(Theme.Color.foreground)
                            Text("ALPHA")
                                .scaledFont(9, weight: .heavy, relativeTo: .caption2)
                                .foregroundStyle(Theme.Color.accentText)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Theme.Color.accent.opacity(0.16), in: Capsule())
                        }
                        Text(contarRepesEnabled
                             ? "El reloj precarga las repeticiones y la velocidad. Puede equivocarse: corrige el número siempre que no cuadre."
                             : "Apagado. Las repeticiones las pones tú.")
                            .scaledFont(11, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.muted)
                            .lineLimit(4)
                    }
                    Spacer()
                    Toggle("", isOn: contarRepesToggle)
                        .labelsHidden()
                        .tint(Theme.Color.accent)
                        .accessibilityLabel("Contar repeticiones con el reloj, en pruebas")
                        .accessibilityValue(contarRepesEnabled ? "activado" : "desactivado")
                }
                Text("En pruebas: se está calibrando con movimientos reales. Necesita el Apple Watch puesto durante el entreno.")
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    private var contarRepesToggle: Binding<Bool> {
        Binding(
            get: { contarRepesEnabled },
            set: { on in
                Haptics.light()
                SensorRepCounting.set(on)
                contarRepesEnabled = on
            }
        )
    }
}

// MARK: - Cuenta

struct ProfileCuentaView: View {
    let bearer: String?
    var hasCoach: Bool = true
    let coachName: String?
    let partnerName: String?
    let onSignOut: () -> Void

    @AppStorage(ThemeMode.storageKey) private var themeMode: ThemeMode = .system

    @State private var sheet: CuentaSheetKind? = nil
    @State private var exporting: Bool = false
    @State private var exportShareItem: ExportShareItem? = nil
    @State private var exportError: String? = nil
    @State private var showDeleteAccount: Bool = false
    @State private var exportToast: String? = nil

    private enum CuentaSheetKind: String, Identifiable {
        case methodology
        case coach
        var id: String { rawValue }
    }

    var body: some View {
        ZStack(alignment: .top) {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    appearanceCard
                    if hasCoach {
                        methodologyCard
                    }
                    privacyAndDataCard
                    deleteAccountRow
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
                .clampedToContainerWidth()
            }
            if let exportToast {
                ToastBanner(text: exportToast)
                    .padding(.top, Theme.Spacing.l)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .navigationTitle("Cuenta")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $sheet) { kind in
            switch kind {
            case .methodology: MethodologySheet()
            case .coach:       CoachSheet(coachName: coachName)
            }
        }
        .sheet(isPresented: $showDeleteAccount) {
            if let bearer {
                DeleteAccountConfirmView(
                    bearer: bearer,
                    partnerName: partnerName,
                    onCompleted: { onSignOut() }
                )
            }
        }
        .sheet(item: $exportShareItem) { item in
            ShareSheet(items: [item.fileURL])
        }
    }

    private var appearanceCard: some View {
        CardSurface(padding: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                ThemeModePicker(selection: $themeMode)
                Text("«Auto» sigue la apariencia de tu iPhone.")
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    private var methodologyCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                profileActionRow(
                    icon: "rectangle.3.group",
                    title: "Cómo se construye tu plan",
                    subtitle: "Microciclos diseñados por tu coach, semana a semana.",
                    action: { sheet = .methodology }
                )
                Hairline()
                profileActionRow(
                    icon: "person.crop.rectangle",
                    title: coachName.map { "Tu coach: \($0)" } ?? "Tu coach",
                    subtitle: "Diseña tu metodología y tu plan.",
                    action: { sheet = .coach }
                )
            }
        }
    }

    private var privacyAndDataCard: some View {
        CardSurface(padding: 0) {
            Button {
                Haptics.light()
                Task { await exportData() }
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "square.and.arrow.up.on.square")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                        .frame(width: 26)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Exportar mis datos")
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.foreground)
                        Text(exportError ?? "Descarga un JSON con todo lo que guardamos sobre ti")
                            .scaledFont(11, relativeTo: .caption2)
                            .foregroundStyle(exportError == nil ? Theme.Color.muted : Theme.Color.danger)
                            .lineLimit(2)
                    }
                    Spacer()
                    if exporting {
                        ProgressView().tint(Theme.Color.accentText)
                    } else {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.Color.faint)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 14)
            }
            .buttonStyle(.plain)
            .disabled(exporting || bearer == nil)
        }
    }

    private var deleteAccountRow: some View {
        Button {
            Haptics.medium()
            showDeleteAccount = true
        } label: {
            Text("Eliminar mi cuenta")
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Theme.Spacing.s)
        }
        .buttonStyle(.plain)
        .disabled(bearer == nil)
    }

    private func profileActionRow(icon: String, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: { Haptics.light(); action() }) {
            ProfileNavRow(icon: icon, title: title, subtitle: subtitle)
        }
        .buttonStyle(.plain)
    }

    private func exportData() async {
        guard let bearer, !exporting else { return }
        exporting = true
        exportError = nil
        defer { exporting = false }
        do {
            let (data, filename) = try await AccountService.exportData(bearer: bearer)
            let safeName = filename.isEmpty ? "fahybrid-export.json" : filename
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
            try? FileManager.default.removeItem(at: url)
            try data.write(to: url, options: [.atomic])
            await MainActor.run {
                exportShareItem = ExportShareItem(fileURL: url)
                showToast("Datos exportados")
            }
        } catch let APIError.http(status, _) {
            await MainActor.run {
                exportError = status == 401
                    ? "Sesión caducada. Vuelve a iniciar sesión."
                    : "No pudimos exportar tus datos (HTTP \(status))."
            }
        } catch {
            await MainActor.run {
                exportError = "No pudimos exportar tus datos. Revisa tu conexión."
            }
        }
    }

    private func showToast(_ text: String) {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            exportToast = text
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.4) {
            withAnimation(.easeOut(duration: 0.25)) {
                exportToast = nil
            }
        }
    }
}

// MARK: - Ayuda y legal

struct ProfileAyudaLegalView: View {
    let bearer: String?
    var hasCoach: Bool = true

    @State private var sheet: AyudaSheetKind? = nil

    private enum AyudaSheetKind: String, Identifiable {
        case privacy
        case terms
        case feedback
        var id: String { rawValue }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                feedbackCard
                legalCard
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.l)
            .padding(.bottom, Theme.Spacing.xxl)
            .clampedToContainerWidth()
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .navigationTitle("Ayuda y legal")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $sheet) { kind in
            switch kind {
            case .privacy:  LegalSheet(title: "Política de privacidad", bodyText: LegalCopy.privacy)
            case .terms:    LegalSheet(title: "Términos de uso", bodyText: LegalCopy.terms(hasCoach: hasCoach))
            case .feedback: AppFeedbackSheet(bearer: bearer)
            }
        }
    }

    private var feedbackCard: some View {
        CardSurface(padding: 0) {
            Button(action: { Haptics.light(); sheet = .feedback }) {
                ProfileNavRow(
                    icon: "exclamationmark.bubble",
                    title: "Enviar sugerencia o error",
                    subtitle: hasCoach
                        ? "Cuéntanos qué mejorar o reporta un fallo. Nos llega directamente al equipo, no a tu coach."
                        : "Cuéntanos qué mejorar o reporta un fallo. Nos llega directamente al equipo."
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var legalCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                Button(action: { Haptics.light(); sheet = .privacy }) {
                    ProfileNavRow(icon: "lock.shield", title: "Privacidad", subtitle: Marca.privacidadTexto)
                }
                .buttonStyle(.plain)
                Hairline()
                Button(action: { Haptics.light(); sheet = .terms }) {
                    ProfileNavRow(icon: "doc.text", title: "Términos", subtitle: Marca.terminosTexto)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Identidad

struct ProfileIdentidadView: View {
    let bearer: String?
    var hasCoach: Bool = true

    @Environment(AppDataStore.self) private var store

    @State private var showPartnerInvite: Bool = false
    @State private var cancellingInvite: Bool = false
    @State private var showUnpairConfirm: Bool = false
    @State private var unpairInProgress: Bool = false

    private var identity: AthleteIdentity? { store.identity.value }
    private var partner: PartnerInfo? { store.partner.value?.partner }
    private var athleteModality: String? { store.partner.value?.athleteModality }
    private var subscription: SubscriptionInfo? { store.subscription.value }

    private var initialLoadDone: Bool {
        store.subscription.hasLoaded && store.partner.hasLoaded
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                settingsCard
                if shouldShowPartnerSection, partner == nil {
                    partnerInviteCard
                } else if shouldShowPartnerSection, partner != nil {
                    unpairRow
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.l)
            .padding(.bottom, Theme.Spacing.xxl)
            .clampedToContainerWidth()
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .navigationTitle("Identidad")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showPartnerInvite) {
            PartnerInviteSheet(bearer: bearer) { _ in
                Task { await store.refreshPartner(force: true) }
            }
        }
        .alert("Deshacer pareja de Dobles", isPresented: $showUnpairConfirm) {
            Button("Deshacer", role: .destructive) { Task { await performUnpair() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Dejaréis de compartir plan y analíticas. Las sesiones que ya hicisteis juntos se conservan. Podéis volver a emparejaros más adelante.")
        }
    }

    private var settingsCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                modalityRow
                    .redacted(reason: initialLoadDone ? [] : .placeholder)
                Hairline()
                if hasCoach {
                    NavigationLink {
                        SubscriptionView(bearer: bearer)
                    } label: {
                        SettingValueRow(
                            label: "Suscripción",
                            value: subscriptionValue,
                            valueColor: subscriptionValueColor,
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)
                    Hairline()
                }
                SettingValueRow(
                    label: "Objetivo",
                    value: ProfileIdentidadView.goalLabel(identity?.goalType),
                    valueColor: identity?.goalType == nil ? Theme.Color.muted : Theme.Color.foreground,
                    showsChevron: false
                )
                Hairline()
                SettingValueRow(
                    label: "Idioma",
                    value: "Español",
                    valueColor: Theme.Color.foreground,
                    showsChevron: false
                )
            }
        }
    }

    @ViewBuilder
    private var modalityRow: some View {
        if isDobles {
            NavigationLink {
                DoblesPlanView(bearer: bearer)
            } label: {
                SettingValueRow(
                    label: "Modalidad",
                    value: modalityValue,
                    valueColor: partner == nil ? Theme.Color.foreground : Theme.Color.accentText,
                    showsChevron: true
                )
            }
            .buttonStyle(.plain)
        } else {
            SettingValueRow(
                label: "Modalidad",
                value: modalityValue,
                valueColor: Theme.Color.foreground,
                showsChevron: false
            )
        }
    }

    private var isDobles: Bool {
        if partner != nil { return true }
        if subscription?.planType == "dobles" { return true }
        if (athleteModality ?? "").lowercased() == "dobles" { return true }
        return false
    }

    private var modalityValue: String {
        if let partner {
            return "Dobles · con \(partner.firstName)"
        }
        if isDobles {
            return "Dobles · invita a tu compañero/a"
        }
        switch subscription?.planType {
        case "pro_elite": return "Pro"
        default:          return "Individual"
        }
    }

    private var subscriptionValue: String {
        guard let sub = subscription else { return "Gestionar" }
        switch sub.status {
        case "active":
            if let date = sub.formattedPeriodEnd {
                return sub.cancelAtPeriodEnd ? "Termina el \(date)" : "Activa · renueva \(date)"
            }
            return "Activa"
        case "trialing":
            return "Prueba" + (sub.formattedPeriodEnd.map { " · hasta \($0)" } ?? "")
        case "past_due", "unpaid", "incomplete":
            return "Pago pendiente"
        case "canceled", "incomplete_expired":
            return "Cancelada"
        case "paused":
            return "Pausada"
        default:
            return "Gestionar"
        }
    }

    private var subscriptionValueColor: Color {
        switch subscription?.status {
        case "active", "trialing": return Theme.Color.ok
        case "past_due", "unpaid", "incomplete", "canceled", "incomplete_expired":
            return Theme.Color.danger
        default: return Theme.Color.muted
        }
    }

    private var shouldShowPartnerSection: Bool {
        guard initialLoadDone else { return false }
        return isDobles
    }

    private var sentInvitation: SentInvitation? { store.partner.value?.sentInvitation }

    @ViewBuilder
    private var partnerInviteCard: some View {
        if let inv = sentInvitation, inv.state == .pending {
            pendingInvitationCard(inv)
        } else if let inv = sentInvitation, inv.state == .expired {
            terminalInvitationCard(
                headline: "La invitación a \(inv.inviteeEmail) caducó",
                detail: "Puedes volver a invitarle. Tendrá otros 14 días para aceptar.",
                cta: "Volver a invitar"
            )
        } else if let inv = sentInvitation, inv.state == .declined {
            terminalInvitationCard(
                headline: "\(inv.inviteeEmail) rechazó la invitación",
                detail: "Puedes invitar a otra persona a entrenar contigo en Dobles.",
                cta: "Invitar a otra persona"
            )
        } else {
            inviteCtaCard
        }
    }

    private var unpairRow: some View {
        Button {
            Haptics.light()
            showUnpairConfirm = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "person.2.slash")
                    .font(.system(size: 13, weight: .semibold))
                Text(unpairInProgress ? "Deshaciendo…" : "Deshacer pareja de Dobles")
                    .scaledFont(13, weight: .semibold, relativeTo: .subheadline)
                Spacer()
            }
            .foregroundStyle(Theme.Color.danger)
            .padding(.vertical, 4)
        }
        .disabled(unpairInProgress)
    }

    private var inviteCtaCard: some View {
        CardSurface(padding: 14, leftAccent: true) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Aún no has añadido a tu compañero/a")
                    .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Invítale por email para entrenar juntos en Dobles. Tendrá 14 días para aceptar.")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                invitePrimaryButton("Invitar a tu compañero/a")
                    .padding(.top, 2)
            }
        }
    }

    private func pendingInvitationCard(_ inv: SentInvitation) -> some View {
        CardSurface(padding: 14, leftAccent: true) {
            VStack(alignment: .leading, spacing: 10) {
                LabelText(text: "INVITACIÓN PENDIENTE", color: Theme.Color.accentText)
                Text("Enviada a \(inv.inviteeEmail)")
                    .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(inv.expiryText.map { "Esperando a que acepte · \($0)." }
                        ?? "Esperando a que acepte desde su email.")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                Button {
                    Haptics.light()
                    Task { await cancelInvite() }
                } label: {
                    Text(cancellingInvite ? "Cancelando…" : "Cancelar invitación")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.danger)
                }
                .buttonStyle(.plain)
                .disabled(cancellingInvite)
                .padding(.top, 2)
            }
        }
    }

    private func terminalInvitationCard(headline: String, detail: String, cta: String) -> some View {
        CardSurface(padding: 14, leftAccent: true) {
            VStack(alignment: .leading, spacing: 10) {
                Text(headline)
                    .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(detail)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                invitePrimaryButton(cta)
                    .padding(.top, 2)
            }
        }
    }

    private func invitePrimaryButton(_ title: String) -> some View {
        Button {
            Haptics.light()
            showPartnerInvite = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.system(size: 13, weight: .semibold))
                Text(title)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
            }
            .foregroundStyle(Theme.Color.accentOn)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Theme.Color.accent)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func performUnpair() async {
        guard let bearer, !unpairInProgress else { return }
        unpairInProgress = true
        defer { unpairInProgress = false }
        do {
            try await PartnerService.unlink(bearer: bearer)
            Haptics.success()
            await store.refreshPartner(force: true)
        } catch {
            Haptics.error()
        }
    }

    private func cancelInvite() async {
        guard let bearer, !cancellingInvite else { return }
        cancellingInvite = true
        defer { cancellingInvite = false }
        do {
            _ = try await PartnerService.cancelInvite(bearer: bearer)
            Haptics.light()
        } catch {}
        await store.refreshPartner(force: true)
    }

    static func goalLabel(_ type: String?) -> String {
        guard let type else { return "Sin definir" }
        return GoalTypeOption(rawValue: type)?.label ?? "Sin definir"
    }
}
