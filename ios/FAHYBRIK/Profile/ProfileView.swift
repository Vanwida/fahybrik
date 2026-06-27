import SwiftUI
import HealthKit

// Profile tab — élite athlete identity card + a clean, grouped settings list in
// the handoff `perfil` aesthetic (label-left muted / value-right). Every actionable
// row opens a NavigationLink to the existing detail (Suscripción → SubscriptionView,
// PM5 → PM5SettingsView, Modalidad → DoblesPlanView when in Dobles) or a sheet
// (Metodología, Legal). Read-only rows (Objetivo, Idioma) state status honestly.
// Sign out wires through the onSignOut closure provided by AppRoot/TodayView.
struct ProfileView: View {
    let bearer: String?
    let onSignOut: () -> Void

    @State private var sheet: SheetKind? = nil
    @State private var partner: PartnerInfo? = nil
    @State private var athleteModality: String? = nil
    @State private var partnerLoading: Bool = true
    @State private var showPartnerInvite: Bool = false
    @State private var subscription: SubscriptionInfo? = nil
    @State private var identity: AthleteIdentity? = nil
    @State private var aEventDays: Int? = nil
    @State private var blockLabel: String? = nil
    @State private var targetRace: AthleteNextRace? = nil

    @State private var showEditProfile: Bool = false

    // RGPD state.
    @State private var exporting: Bool = false
    @State private var exportShareItem: ExportShareItem? = nil
    @State private var exportError: String? = nil
    @State private var showDeleteAccount: Bool = false
    @State private var exportToast: String? = nil

    // Apple Health connection. `healthAvailable` is fixed for the device
    // (false on simulator — expected). `healthConnected` is a persisted flag
    // we set after a granted request(), because HealthKit does NOT expose
    // read-authorization status reliably (authorizationStatus only reports
    // share/write). `healthRequesting` drives the in-flight spinner.
    @State private var healthConnected: Bool = ProfileView.isHealthConnected()
    @State private var healthRequesting: Bool = false
    @State private var healthDenied: Bool = false
    private let healthAvailable: Bool = HKHealthStore.isHealthDataAvailable()

    private static let healthConnectedKey = "healthkit_connected"
    private static func isHealthConnected() -> Bool {
        UserDefaults.standard.bool(forKey: healthConnectedKey)
    }

    private enum SheetKind: String, Identifiable {
        case methodology
        case coach
        case privacy
        case terms
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                Theme.Color.background.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                        identityCard

                        // Primary settings — the handoff's five at-a-glance rows,
                        // restyled label-left / value-right. Each opens its detail.
                        settingsCard

                        if shouldShowPartnerSection, partner == nil {
                            partnerInviteCard
                        }

                        if let days = aEventDays {
                            aEventCard(days: days)
                        }

                        SectionHeader(title: "Rendimiento")
                        zonesCard

                        SectionHeader(title: "Dispositivos")
                        devicesCard

                        SectionHeader(title: "Metodología")
                        methodologyCard

                        SectionHeader(title: "Legal")
                        legalCard

                        SectionHeader(title: "Privacidad y datos")
                        privacyAndDataCard

                        signOutButton
                        deleteAccountRow
                    }
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
                if let exportToast {
                    ToastBanner(text: exportToast)
                        .padding(.top, Theme.Spacing.l)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .navigationBarHidden(true)
        }
        .task {
            await loadIdentity()
            await loadPartner()
            await loadSubscription()
        }
        .sheet(item: $sheet) { kind in
            sheetView(for: kind)
        }
        .sheet(isPresented: $showPartnerInvite) {
            PartnerInviteSheet(bearer: bearer) { _ in
                // After a successful invite, optimistically refetch — the
                // partner only appears after they redeem, but envelope may
                // expose a pending state in future iterations.
                Task { await loadPartner() }
            }
        }
        .sheet(isPresented: $showDeleteAccount) {
            if let bearer {
                DeleteAccountConfirmView(
                    bearer: bearer,
                    partnerName: partner?.firstName,
                    onCompleted: { onSignOut() }
                )
            }
        }
        .sheet(item: $exportShareItem) { item in
            ShareSheet(items: [item.fileURL])
        }
        .sheet(isPresented: $showEditProfile) {
            EditProfileView(bearer: bearer, identity: identity) { updated in
                self.identity = updated
            }
        }
    }

    // MARK: - Identity

    private var identityCard: some View {
        let name = identity?.fullName ?? "Tu perfil"
        let initials = identity?.initials ?? "—"
        return HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(Theme.Color.accent)
                    .frame(width: 60, height: 60)
                Text(initials)
                    .font(.system(size: 22, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.accentOn)
            }
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
        .accessibilityElement(children: .combine)
    }

    /// Builds the identity subtitle from ONLY the fields the backend returns.
    /// Division comes from the target race (real); there is NO athlete "nivel"
    /// field, so we never render the handoff's "Nivel avanzado" — see BACKEND
    /// GAP. Body metrics + experience fill the rest.
    private var identitySubtitle: String? {
        guard let id = identity else { return nil }
        var parts: [String] = []
        if let division = AthleteNextRace.divisionLabel(targetRace?.division) {
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

    // MARK: - Settings card (handoff's five rows)
    //
    // Modalidad · Suscripción · Objetivo · Dispositivos (→ detail below) ·
    // Idioma. Rendered as a single grouped card with hairline dividers; each
    // row is label-left (muted) / value-right, navigable where a detail exists.
    private var settingsCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                modalityRow
                Hairline()
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
                SettingValueRow(
                    label: "Objetivo",
                    value: goalTypeLabel(identity?.goalType),
                    valueColor: identity?.goalType == nil ? Theme.Color.muted : Theme.Color.foreground,
                    showsChevron: false
                )
                Hairline()
                SettingValueRow(
                    label: "Carrera objetivo",
                    value: goalValue,
                    valueColor: targetRace == nil ? Theme.Color.muted : Theme.Color.foreground,
                    showsChevron: false
                )
                Hairline()
                SettingValueRow(
                    label: "Idioma",
                    value: languageValue,
                    valueColor: Theme.Color.foreground,
                    showsChevron: false
                )
            }
        }
    }

    /// Modalidad row. In Dobles it links to the connected-plan screen
    /// (DoblesPlanView). Otherwise it is read-only (Individual / Elite).
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

    /// True when the athlete is on the Dobles modality — via subscription
    /// plan_type OR a present partner OR the envelope modality hint.
    private var isDobles: Bool {
        if partner != nil { return true }
        if subscription?.planType == "dobles" { return true }
        if (athleteModality ?? "").lowercased() == "dobles" { return true }
        return false
    }

    /// "Dobles · con {nombre}" when paired; "Dobles · invita a tu compañero/a"
    /// when on Dobles but unpaired; otherwise the plan name (Individual / Elite).
    private var modalityValue: String {
        if let partner {
            return "Dobles · con \(partner.firstName)"
        }
        if isDobles {
            return "Dobles · invita a tu compañero/a"
        }
        return subscription?.displayPlanLabel ?? "Individual"
    }

    /// Goal time + target race, both real (from targetRace). Honest empty when
    /// no target race is scheduled — never fabricated.
    private var goalValue: String {
        guard let race = targetRace else { return "Sin carrera objetivo" }
        if let goal = race.goalTimeFormatted {
            return "\(goal) · \(race.name)"
        }
        return race.name
    }

    /// Preferred language from profile, falling back to the device locale.
    private var languageValue: String {
        if let code = identity?.preferredLanguage, let label = languageLabel(code) {
            return label
        }
        let code = Locale.current.language.languageCode?.identifier ?? "es"
        return Locale.current.localizedString(forLanguageCode: code)?.capitalized
            ?? (code == "es" ? "Español" : code.uppercased())
    }

    // MARK: - Subscription

    /// Loads the read-only subscription snapshot so the "Suscripción" row shows
    /// live status (no price — Apple compliance). Silent on failure; the row
    /// falls back to a neutral subtitle and the detail screen retries.
    private func loadSubscription() async {
        guard let bearer else { return }
        subscription = try? await SubscriptionService.fetchSubscription(bearer: bearer)
    }

    /// Real athlete identity (name, body metrics, training context) from
    /// /api/auth/me, plus A-event days + block label + the target race from the
    /// plan week. Silent on failure — the identity card falls back to neutral
    /// copy and the dependent rows/cards hide or show honest empties.
    private func loadIdentity() async {
        guard let bearer else { return }
        identity = try? await MeService.fetch(bearer: bearer)
        if let resp = try? await PlanService.fetchWeek(bearer: bearer) {
            aEventDays = resp.macroSummary.aEventDays
            targetRace = resp.targetRace
            if let label = resp.macroSummary.weekLabel, !label.isEmpty {
                blockLabel = label
            } else if let block = resp.macroSummary.block, !block.isEmpty {
                blockLabel = atrPhaseLabel(block)
            }
        }
    }

    /// Status-driven value for the subscription row. NEVER includes a price.
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

    /// Green when access is active/trialing, danger when payment failed/cancelled,
    /// muted otherwise — color + label, never color alone.
    private var subscriptionValueColor: Color {
        switch subscription?.status {
        case "active", "trialing": return Theme.Color.ok
        case "past_due", "unpaid", "incomplete", "canceled", "incomplete_expired":
            return Theme.Color.danger
        default: return Theme.Color.muted
        }
    }

    // MARK: - Partner

    /// While loading we keep the invite card hidden — flash-of-empty-state is
    /// worse than a brief gap until the request resolves. (When a partner IS
    /// present, the Modalidad row already surfaces "con {nombre}", so we only
    /// need the standalone invite prompt for the unpaired case.)
    private var shouldShowPartnerSection: Bool {
        if partnerLoading { return false }
        return true
    }

    private var partnerInviteCard: some View {
        CardSurface(padding: 14, leftAccent: true) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Aún no has añadido a tu compañero/a")
                    .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Invítale por email para entrenar juntos en Dobles. Tendrá 14 días para aceptar.")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                Button {
                    Haptics.light()
                    showPartnerInvite = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "person.crop.circle.badge.plus")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Invitar a tu compañero/a")
                            .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    }
                    .foregroundStyle(Theme.Color.accentOn)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Theme.Color.accent)
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
        }
    }

    private func loadPartner() async {
        defer { partnerLoading = false }
        guard let bearer else { return }
        do {
            let envelope = try await PartnerService.fetchEnvelope(bearer: bearer)
            partner = envelope.partner
            athleteModality = envelope.athleteModality
        } catch {
            // Silent fail: the section just won't render. We don't want a
            // partial network error to block the rest of Profile.
            partner = nil
        }
    }

    // A-event: only days-to-event + block label are available from the macro
    // summary (no event name / date / venue / bib endpoint yet). Card hidden
    // entirely when there is no A-event days value.
    private func aEventCard(days: Int) -> some View {
        CardSurface(padding: 14, topAccent: true) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "A-Event", color: Theme.Color.accentText, size: 9)
                HStack(alignment: .lastTextBaseline, spacing: 12) {
                    Text("Próximo A-event")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer()
                    Text("\(days) días")
                        .font(.system(size: 22, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.accentText)
                }
                if let blockLabel {
                    Hairline()
                    MonoText(text: blockLabel.uppercased(), size: 10, color: Theme.Color.muted)
                }
            }
        }
    }

    // MARK: - Zones ("Mis zonas")

    /// Entry point to the athlete's resolved pace bands per modality. Read-only;
    /// the destination handles its own loading / empty / error states.
    private var zonesCard: some View {
        CardSurface(padding: 0) {
            NavigationLink {
                MyZonesView(bearer: bearer)
            } label: {
                profileRowContent(
                    icon: "speedometer",
                    title: "Mis zonas de ritmo",
                    subtitle: "Tus bandas por modalidad · carrera /km, remo y ski /500m"
                )
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Devices

    private var devicesCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                // Non-interactive placeholder: Garmin sync is not shipped yet,
                // so the row is informational only (no tap target → it must not
                // open the unfinished "edit profile" sheet).
                deviceRowContent(
                    icon: "watch.analog",
                    title: "Garmin",
                    subtitle: "Sincronización próximamente",
                    statusText: "no conectado",
                    statusColor: Theme.Color.muted
                )
                Hairline()
                appleHealthRow
                Hairline()
                NavigationLink {
                    PM5SettingsView(store: PM5ConnectionStore.shared)
                } label: {
                    deviceRowContent(
                        icon: "antenna.radiowaves.left.and.right",
                        title: "Concept2 PM5",
                        subtitle: PM5ConnectionStore.shared.rememberedDeviceName ?? "Sin emparejar",
                        statusText: PM5ConnectionStore.shared.rememberedDeviceName == nil ? "—" : "pareado",
                        statusColor: PM5ConnectionStore.shared.rememberedDeviceName == nil ? Theme.Color.muted : Theme.Color.ok
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Apple Health

    /// Three-state row, mirroring the device-row layout but with a trailing
    /// "Conectar" button instead of a chevron:
    ///   • unavailable (simulator)  → disabled button, "No disponible…"
    ///   • available + not connected → "Conectar" button
    ///   • connected                → "Sincronizando tus datos" + ok badge
    private var appleHealthRow: some View {
        HStack(spacing: 12) {
            Image(systemName: "heart.text.square")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text("Apple Health")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                Text(healthSubtitle)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(healthSubtitleColor)
                    .lineLimit(2)
            }
            Spacer()
            appleHealthTrailing
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Apple Health, \(healthSubtitle)")
    }

    @ViewBuilder
    private var appleHealthTrailing: some View {
        if !healthAvailable {
            connectButton(label: "Conectar", disabled: true)
        } else if healthConnected {
            Text("conectado")
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(Theme.Color.ok)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Theme.Color.ok.opacity(0.15))
                .clipShape(Capsule())
        } else if healthRequesting {
            ProgressView().tint(Theme.Color.accentText)
        } else {
            connectButton(label: "Conectar", disabled: false)
        }
    }

    private func connectButton(label: String, disabled: Bool) -> some View {
        Button {
            Haptics.light()
            Task { await connectAppleHealth() }
        } label: {
            Text(label)
                .scaledFont(12, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(disabled ? Theme.Color.muted : Theme.Color.accentOn)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(disabled ? Theme.Color.surfaceElevated : Theme.Color.accent)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityLabel("Conectar Apple Health")
        .accessibilityHint(disabled ? "No disponible en este dispositivo" : "Pide permiso para leer tus datos de salud")
    }

    private var healthSubtitle: String {
        if !healthAvailable { return "No disponible en este dispositivo" }
        if healthConnected { return "Sincronizando tus datos" }
        if healthRequesting { return "Pidiendo permiso…" }
        if healthDenied { return "Permiso denegado · actívalo en Ajustes › Salud" }
        return "Conecta para sincronizar HR, HRV, sueño y peso"
    }

    private var healthSubtitleColor: Color {
        if healthConnected { return Theme.Color.ok }
        if healthDenied { return Theme.Color.danger }
        return Theme.Color.muted
    }

    /// Requests HealthKit authorization, then — on grant — starts the same
    /// sync pipeline AppRoot uses (configure(bearer:athleteId:) + start()) and
    /// flips the persisted connected flag. Reuses the shared service; never
    /// duplicates the request or sync logic.
    @MainActor
    private func connectAppleHealth() async {
        guard healthAvailable, !healthRequesting else { return }
        healthRequesting = true
        defer { healthRequesting = false }

        // HealthKit never reports whether READ access was granted, so a
        // successful return = the sheet was presented (or already answered).
        // We treat that as connected and start the sync. We surface an error
        // only when requestAuthorization genuinely throws (HealthKit
        // unavailable, or missing entitlement / unprovisioned App ID).
        do {
            try await HealthKitPermissions.request()
        } catch {
            healthConnected = false
            healthDenied = true
            return
        }

        HealthKitSyncService.shared.configure(
            bearer: bearer,
            athleteId: AuthState.persistedAthleteId()
        )
        HealthKitSyncService.shared.start()
        UserDefaults.standard.set(true, forKey: Self.healthConnectedKey)
        healthConnected = true
        healthDenied = false
        showToast("Apple Health conectado")
    }

    private func deviceRowContent(
        icon: String,
        title: String,
        subtitle: String,
        statusText: String,
        statusColor: Color
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                Text(subtitle)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer()
            Text(statusText)
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(statusColor)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(statusColor.opacity(0.15))
                .clipShape(Capsule())
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(subtitle), \(statusText)")
        .accessibilityAddTraits(.isButton)
    }

    // MARK: - Methodology

    private var methodologyCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                profileRow(
                    icon: "rectangle.3.group",
                    title: "ATR · bloques",
                    subtitle: "\(atrPhaseLabel("ACC")) → \(atrPhaseLabel("TRANS")) → \(atrPhaseLabel("REAL")) · cómo se construye tu plan",
                    action: { sheet = .methodology }
                )
                Hairline()
                profileRow(
                    icon: "person.crop.rectangle",
                    title: "Tu coach: Pablo",
                    subtitle: "Fabrik Studio · Barcelona",
                    action: { sheet = .coach }
                )
            }
        }
    }

    // MARK: - Legal

    private var legalCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                profileRow(
                    icon: "lock.shield",
                    title: "Privacidad",
                    subtitle: "fahybrid.com/privacy",
                    action: { sheet = .privacy }
                )
                Hairline()
                profileRow(
                    icon: "doc.text",
                    title: "Términos",
                    subtitle: "fahybrid.com/terms",
                    action: { sheet = .terms }
                )
            }
        }
    }

    private func profileRow(icon: String, title: String, subtitle: String, action: @escaping () -> Void) -> some View {
        Button(action: { Haptics.light(); action() }) {
            profileRowContent(icon: icon, title: title, subtitle: subtitle)
        }
        .buttonStyle(.plain)
    }

    private func profileRowContent(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                Text(subtitle)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(subtitle)")
        .accessibilityAddTraits(.isButton)
    }

    // MARK: - Privacy & data (RGPD)

    private var privacyAndDataCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                exportDataRow
            }
        }
    }

    private var exportDataRow: some View {
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
                    ProgressView()
                        .tint(Theme.Color.accentText)
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
        .accessibilityLabel("Exportar mis datos")
        .accessibilityHint("Descarga un JSON con todo lo que guardamos sobre ti")
    }

    // De-emphasised footer link. Behaviour (typed-confirmation guard in
    // DeleteAccountConfirmView) is unchanged — only the visual weight is
    // lowered so deletion is not a prominent main-path action.
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
        .padding(.top, Theme.Spacing.s)
        .accessibilityLabel("Eliminar mi cuenta")
        .accessibilityHint("Permanente, 30 días de gracia, cancela suscripción")
    }

    private func exportData() async {
        guard let bearer, !exporting else { return }
        exporting = true
        exportError = nil
        defer { exporting = false }
        do {
            let (data, filename) = try await AccountService.exportData(bearer: bearer)
            // Write to a temp file so the Share Sheet can offer "Save to
            // Files", AirDrop, mail, etc. with a real filename + extension.
            let safeName = filename.isEmpty ? "fahybrid-export.json" : filename
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent(safeName)
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

    // MARK: - Sheets

    @ViewBuilder
    private func sheetView(for kind: SheetKind) -> some View {
        switch kind {
        case .methodology: MethodologySheet()
        case .coach:       CoachSheet()
        case .privacy:     LegalSheet(title: "Política de privacidad", bodyText: LegalCopy.privacy)
        case .terms:       LegalSheet(title: "Términos de uso", bodyText: LegalCopy.terms)
        }
    }
}

// MARK: - Setting value row
//
// The handoff's `perfil` row: label-left (muted) / value-right, in a flat
// hairline-divided card. An optional trailing chevron marks a navigable row.
// Renders as one VoiceOver element.
private struct SettingValueRow: View {
    let label: String
    let value: String
    var valueColor: Color = Theme.Color.foreground
    var showsChevron: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            Text(label)
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
            Spacer(minLength: 12)
            Text(value)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(valueColor)
                .multilineTextAlignment(.trailing)
                .lineLimit(2)
            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(value)")
        .accessibilityAddTraits(showsChevron ? .isButton : [])
    }
}

// MARK: - Section header

private struct SectionHeader: View {
    let title: String
    var body: some View {
        Text(title.uppercased())
            .scaledFont(10, weight: .semibold, relativeTo: .caption2)
            .tracking(1.6)
            .foregroundStyle(Theme.Color.muted)
            .padding(.horizontal, 4)
            .padding(.top, 4)
    }
}

// MARK: - Sheet content

private struct MethodologySheet: View {
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("ATR · cómo se construye tu plan")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Tu macrociclo avanza en tres bloques: \(atrPhaseLabel("ACC")) (volumen y capacidad general), \(atrPhaseLabel("TRANS")) (trabajo específico de carrera) y \(atrPhaseLabel("REAL")) (afinado y pico el día A-event).")
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                    blockCard(
                        code: "ACC",
                        weeks: "4-6 semanas",
                        focus: "Aerobic capacity · Z2 mileage · fuerza máxima general · técnica HYROX baja intensidad."
                    )
                    blockCard(
                        code: "TRANS",
                        weeks: "2-3 semanas",
                        focus: "Threshold · Z3-Z4 polarizado · trabajo específico estaciones · introducción potencia."
                    )
                    blockCard(
                        code: "REAL",
                        weeks: "3-4 semanas",
                        focus: "VO2 + race pace · simulacros · taper · consolidación de PRs · pico el día A-event."
                    )
                    Text("Cada bloque tiene microciclos de 7 días con día clave, complementarios y descarga. Tu posición dentro del macrociclo la fija tu coach y la ves en la pestaña Plan.")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                }
                .padding(20)
            }
        }
    }

    private func blockCard(code: String, weeks: String, focus: String) -> some View {
        CardSurface(padding: 14, topAccent: code == "REAL") {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(atrPhaseLabel(code))
                        .scaledFont(14, weight: .heavy, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.accentText)
                    Spacer()
                    Text(weeks)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                }
                Text(focus)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }
}

private struct CoachSheet: View {
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle().fill(Theme.Color.surface).frame(width: 64, height: 64)
                            Text("P")
                                .font(.system(size: 20, weight: .heavy, design: .default).italic())
                                .foregroundStyle(Theme.Color.foreground)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Pablo")
                                .font(Theme.Typography.headlineS)
                                .foregroundStyle(Theme.Color.foreground)
                            Text("Coach · Fabrik Studio Barcelona")
                                .scaledFont(12, relativeTo: .caption)
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                    Text("Pablo escribe la metodología detrás de tu plan. Cada workout que ves se basa en una plantilla validada por él, ajustada a tu CTL/ATL/TSB y a tus weaknesses por estación.")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.foreground)
                }
                .padding(20)
            }
        }
    }
}

private struct LegalSheet: View {
    let title: String
    let bodyText: String

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(title)
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(bodyText)
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(20)
            }
        }
    }
}

private enum LegalCopy {
    static let privacy = "FAHYBRIK procesa datos biométricos (HR, HRV, sueño, peso) para construir tu plan. No los compartimos con terceros sin tu consentimiento explícito.\n\nLa versión completa está disponible en fahybrid.com/privacy. Si tienes dudas, escribe a hello@fahybrid.com."
    static let terms = "El uso de FAHYBRIK implica aceptar nuestros términos de servicio: la metodología es propiedad de Pablo y Fabrik Studio. Tu suscripción se renueva mensualmente y puedes cancelarla desde la sección Suscripción.\n\nLa versión completa está disponible en fahybrid.com/terms."
}

// MARK: - Export Share Sheet plumbing
//
// Identifiable wrapper so `.sheet(item:)` re-creates the Share Sheet for every
// new export instead of caching the previous fileURL.
struct ExportShareItem: Identifiable {
    let id = UUID()
    let fileURL: URL
}

// MARK: - Goal-type + language label helpers (file-scope, shared by ProfileView and EditProfileView)

// Single source of truth for the goal_type → Spanish label mapping.
// Used for display in SettingValueRow and as the data source for the
// picker in EditProfileView — no copy-paste between the two.
private enum GoalTypeOption: String, CaseIterable {
    case firstHyrox       = "first_hyrox"
    case improveHyroxMark = "improve_hyrox_mark"
    case improveRunning   = "improve_running"
    case completeFun      = "complete_fun"
    case other            = "other"

    var label: String {
        switch self {
        case .firstHyrox:       return "Mi primer HYROX"
        case .improveHyroxMark: return "Mejorar mi marca de HYROX"
        case .improveRunning:   return "Mejorar mi carrera"
        case .completeFun:      return "Completar y disfrutar"
        case .other:            return "Otro"
        }
    }
}

private func goalTypeLabel(_ type: String?) -> String {
    guard let type else { return "Sin definir" }
    return GoalTypeOption(rawValue: type)?.label ?? "Sin definir"
}

private func languageLabel(_ code: String?) -> String? {
    switch code {
    case "es": return "Español"
    case "en": return "English"
    default:   return nil
    }
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
                    VStack(alignment: .leading, spacing: Theme.Spacing.l) {

                        // ── IDENTIDAD ──────────────────────────────────────
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

                        // ── CUERPO ─────────────────────────────────────────
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
                            }
                        }
                        if hasBodyRangeWarning {
                            bodyRangeHint
                        }

                        // ── OBJETIVO ───────────────────────────────────────
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

                        // ── IDIOMA ─────────────────────────────────────────
                        editSectionHeader("IDIOMA")
                        CardSurface(padding: 0) {
                            languageRow
                        }
                        Text("La app se está traduciendo; algunos textos seguirán en español por ahora. Se aplicará al reiniciar.")
                            .scaledFont(11, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.muted)
                            .padding(.horizontal, 4)

                        // ── Error feedback ─────────────────────────────────
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
                    .padding(.horizontal, Theme.Spacing.xl)
                    .padding(.top, Theme.Spacing.l)
                    .padding(.bottom, Theme.Spacing.xxl)
                }
            }
            .navigationTitle("Editar perfil")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
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

    private var hasBodyRangeWarning: Bool {
        let h = parseDecimal(heightCmText)
        let w = parseDecimal(weightKgText)
        let e = parseDecimal(experienceText)
        let hBad = h.map { $0 < 80 || $0 > 260 } ?? false
        let wBad = w.map { $0 < 25 || $0 > 250 } ?? false
        let eBad = e.map { $0 < 0 || $0 > 80 }  ?? false
        return hBad || wBad || eBad
    }

    private var bodyRangeHint: some View {
        HStack(spacing: 6) {
            Image(systemName: "info.circle")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
            Text("Comprueba los rangos: 80–260 cm · 25–250 kg · 0–80 años")
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
            preferredLanguage: preferredLanguage
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
