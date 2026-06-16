import SwiftUI
import HealthKit

// Profile tab — élite athlete identity card + devices, methodology, account,
// legal, sign out. Every row is navigable: opens a NavigationLink to the
// existing detail (Suscripción → SubscriptionView, PM5 → PM5SettingsView)
// or a sheet with mocked content for the Pablo demo. Sign out wires through
// the onSignOut closure provided by AppRoot/TodayView.
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
                        if shouldShowPartnerSection {
                            SectionHeader(title: "Tu compañero/a")
                            partnerSection
                        }
                        if let days = aEventDays {
                            aEventCard(days: days)
                        }
                        SectionHeader(title: "Dispositivos")
                        devicesCard
                        SectionHeader(title: "Metodología")
                        methodologyCard
                        SectionHeader(title: "Cuenta")
                        accountCard
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
                .preferredColorScheme(.dark)
        }
        .sheet(isPresented: $showPartnerInvite) {
            PartnerInviteSheet(bearer: bearer) { _ in
                // After a successful invite, optimistically refetch — the
                // partner only appears after they redeem, but envelope may
                // expose a pending state in future iterations.
                Task { await loadPartner() }
            }
            .preferredColorScheme(.dark)
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
                .preferredColorScheme(.dark)
        }
    }

    // MARK: - Partner

    /// Decision tree (W4 spec, adapted to backend reality):
    ///   • partner != nil                 → always show (card with avatar + name)
    ///   • athleteModality == "dobles"    → show invite card (forward-compat
    ///                                      when backend ships the field)
    ///   • partner == nil & no modality   → still show invite card. Backend
    ///                                      doesn't expose self-modality on
    ///                                      `/api/athlete/partner` (W4), and
    ///                                      `POST /invite` is gated server-
    ///                                      side via `assertInviterCanInvite`
    ///                                      (returns 403 + message), so the
    ///                                      InviteSheet handles ineligibility.
    /// While loading we keep it hidden — flash-of-empty-state is worse than
    /// a brief gap until the request resolves.
    private var shouldShowPartnerSection: Bool {
        if partnerLoading { return false }
        return true
    }

    @ViewBuilder
    private var partnerSection: some View {
        if let partner {
            partnerCard(partner)
        } else {
            partnerInviteCard
        }
    }

    private func partnerCard(_ p: PartnerInfo) -> some View {
        CardSurface(padding: 14, topAccent: true) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Theme.Color.surfaceElevated)
                        .frame(width: 48, height: 48)
                    Text(p.initials)
                        .font(.system(size: 16, weight: .heavy, design: .default).italic())
                        .foregroundStyle(Theme.Color.foreground)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(p.fullName)
                        .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(partnerSubtitle(p))
                        .scaledFont(11, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                }
                Spacer()
                PartnerBadge(text: "Dobles")
            }
        }
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

    private func partnerSubtitle(_ p: PartnerInfo) -> String {
        var bits: [String] = ["Compañero/a en Dobles"]
        if let since = formatOnboardedSince(p.onboardedAt) {
            bits.append("desde \(since)")
        }
        return bits.joined(separator: " · ")
    }

    private func formatOnboardedSince(_ iso: String?) -> String? {
        guard let iso else { return nil }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let d = date else { return nil }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "es_ES")
        fmt.dateFormat = "MMM yyyy"
        return fmt.string(from: d)
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

    // MARK: - Subscription

    /// Loads the read-only subscription snapshot so the "Mi suscripción" row
    /// shows live status (no price — Apple compliance). Silent on failure; the
    /// row falls back to a neutral subtitle and the detail screen retries.
    private func loadSubscription() async {
        guard let bearer else { return }
        subscription = try? await SubscriptionService.fetchSubscription(bearer: bearer)
    }

    /// Real athlete identity (name, body metrics, training context) from
    /// /api/auth/me, plus A-event days + block label from the plan week macro
    /// summary. Silent on failure — the identity card falls back to neutral
    /// copy and the A-event card simply hides.
    private func loadIdentity() async {
        guard let bearer else { return }
        identity = try? await MeService.fetch(bearer: bearer)
        if let resp = try? await PlanService.fetchWeek(bearer: bearer) {
            aEventDays = resp.macroSummary.aEventDays
            if let label = resp.macroSummary.weekLabel, !label.isEmpty {
                blockLabel = label
            } else if let block = resp.macroSummary.block, !block.isEmpty {
                blockLabel = atrPhaseLabel(block)
            }
        }
    }

    /// Status-driven subtitle for the account row. NEVER includes a price.
    private var subscriptionRowSubtitle: String {
        guard let sub = subscription else { return "Estado y gestión del plan" }
        switch sub.status {
        case "active":
            if let date = sub.formattedPeriodEnd {
                return sub.cancelAtPeriodEnd ? "Termina el \(date)" : "Activa · próximo cobro \(date)"
            }
            return "Activa"
        case "trialing":
            return "Prueba" + (sub.formattedPeriodEnd.map { " · hasta \($0)" } ?? "")
        case "past_due", "unpaid", "incomplete":
            return "Pago pendiente · gestiónala"
        case "canceled", "incomplete_expired":
            return "Cancelada · gestiónala en \(SubscriptionService.accountWebHost)"
        case "paused":
            return "Pausada"
        default:
            return "Estado y gestión del plan"
        }
    }

    // MARK: - Identity

    private var identityCard: some View {
        let name = identity?.fullName ?? "Tu perfil"
        let initials = identity?.initials ?? "—"
        return CardSurface(padding: 14) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Theme.Color.accent)
                        .frame(width: 56, height: 56)
                    Text(initials)
                        .font(.system(size: 22, weight: .heavy, design: .default).italic())
                        .foregroundStyle(Color.white)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(name)
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    if let subtitle = identitySubtitle {
                        Text(subtitle)
                            .scaledFont(11, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.muted)
                    }
                    Text("Coach · Pablo")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(Theme.Color.muted)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.Color.surface)
                        .overlay(
                            Capsule().stroke(Theme.Color.muted.opacity(0.3), lineWidth: 1)
                        )
                        .clipShape(Capsule())
                }
                Spacer()
            }
        }
    }

    /// Builds the identity subtitle from ONLY the fields the backend returns.
    /// Missing fields are skipped — never guessed.
    private var identitySubtitle: String? {
        guard let id = identity else { return nil }
        var parts: [String] = []
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

    // A-event: only days-to-event + block label are available from the macro
    // summary (no event name / date / venue / bib endpoint yet). Card hidden
    // entirely when there is no A-event days value.
    private func aEventCard(days: Int) -> some View {
        CardSurface(padding: 14, topAccent: true) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "A-Event", color: Theme.Color.accent, size: 9)
                HStack(alignment: .lastTextBaseline, spacing: 12) {
                    Text("Próximo A-event")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer()
                    Text("\(days) días")
                        .font(.system(size: 22, weight: .heavy, design: .default).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.accent)
                }
                if let blockLabel {
                    Hairline()
                    MonoText(text: blockLabel.uppercased(), size: 10, color: Theme.Color.muted)
                }
            }
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
                .foregroundStyle(Theme.Color.accent)
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
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
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
            ProgressView().tint(Theme.Color.accent)
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
                .foregroundStyle(Theme.Color.accent)
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
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
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

    // MARK: - Account

    private var accountCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                NavigationLink {
                    SubscriptionView(bearer: bearer)
                } label: {
                    profileRowContent(
                        icon: "creditcard",
                        title: "Mi suscripción",
                        subtitle: subscriptionRowSubtitle
                    )
                }
                .buttonStyle(.plain)
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
                    subtitle: "fahybrik.com/privacy",
                    action: { sheet = .privacy }
                )
                Hairline()
                profileRow(
                    icon: "doc.text",
                    title: "Términos",
                    subtitle: "fahybrik.com/terms",
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
                .foregroundStyle(Theme.Color.accent)
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
                .foregroundStyle(Theme.Color.muted)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
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
                    .foregroundStyle(Theme.Color.accent)
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
                        .tint(Theme.Color.accent)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
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
                        .foregroundStyle(Theme.Color.accent)
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
    static let privacy = "FAHYBRIK procesa datos biométricos (HR, HRV, sueño, peso) para construir tu plan. No los compartimos con terceros sin tu consentimiento explícito.\n\nLa versión completa está disponible en fahybrik.com/privacy. Si tienes dudas, escribe a privacy@fahybrik.com."
    static let terms = "El uso de FAHYBRIK implica aceptar nuestros términos de servicio: la metodología es propiedad de Pablo y Fabrik Studio. Tu suscripción se renueva mensualmente y puedes cancelarla desde la sección Suscripción.\n\nLa versión completa está disponible en fahybrik.com/terms."
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
// accent border + dark surface, dismisses itself after ~2.4s via the caller's
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
                .stroke(Theme.Color.accent.opacity(0.35), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .shadow(color: Color.black.opacity(0.25), radius: 12, x: 0, y: 4)
    }
}
