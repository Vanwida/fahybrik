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

    // App appearance override (Auto / Claro / Oscuro). The same persisted value
    // AppRoot reads to drive `.preferredColorScheme`, so changing it here re-themes
    // the whole app instantly and survives relaunches.
    @AppStorage(ThemeMode.storageKey) private var themeMode: ThemeMode = .system
    /// "Avisos de voz" (#63) — the live running voice coach. ON by default; the same
    /// key backs the quick speaker toggle on the run HUD.
    @AppStorage(AudioCoachSettings.enabledKey) private var voiceCoachEnabled = true

    @State private var sheet: SheetKind? = nil
    @State private var showPartnerInvite: Bool = false
    @State private var cancellingInvite: Bool = false
    @State private var showUnpairConfirm: Bool = false
    @State private var unpairInProgress: Bool = false

    // ── Shared data: read live from the injected AppDataStore (cache-first/SWR) ──
    // Identity, partner, subscription and the coach name come from the store, so
    // opening Perfil renders instantly from memory — no redaction flash, no
    // re-fetch on a tab switch; the store revalidates in the background.
    @Environment(AppDataStore.self) private var store

    private var identity: AthleteIdentity? { store.identity.value }
    private var partner: PartnerInfo? { store.partner.value?.partner }
    private var athleteModality: String? { store.partner.value?.athleteModality }
    private var subscription: SubscriptionInfo? { store.subscription.value }

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
    // True once the modality-deciding slices (subscription + partner) have loaded,
    // so the modality row never flashes a placeholder. Instant when cache-hydrated.
    private var initialLoadDone: Bool {
        store.subscription.hasLoaded && store.partner.hasLoaded
    }

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
    @State private var healthConnected: Bool = HealthKitConnection.isConnected
    @State private var healthRequesting: Bool = false
    @State private var healthDenied: Bool = false
    private let healthAvailable: Bool = HKHealthStore.isHealthDataAvailable()

    // Disconnect flow: a single Apple Health toggle drives connect/disconnect.
    // Toggling OFF confirms first, then tears the sync down; because iOS never lets
    // an app revoke its own Health READ (nor re-show the permission sheet once
    // answered), we surface a one-line footnote + an "Abrir Salud" deep link — the
    // real place to review category permissions is the Salud app, not iOS Ajustes.
    @State private var showHealthDisconnectConfirm: Bool = false
    @State private var healthShowRevokeHint: Bool = false

    // Polar wearable link. `polarConnected` reflects GET /api/athlete/wearables;
    // `polarConnecting` drives the connect-url in-flight spinner; `polarSafari` opens
    // the OAuth page in an SFSafariViewController (the callback returns to a web page,
    // not the app, so we re-fetch on dismiss); `polarAlert` surfaces 503 / network.
    @State private var polarConnected: Bool = false
    @State private var polarConnecting: Bool = false
    @State private var polarSafari: SafariURL? = nil
    @State private var polarAlert: String? = nil

    private enum SheetKind: String, Identifiable {
        case methodology
        case coach
        case privacy
        case terms
        case feedback
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
                        } else if shouldShowPartnerSection, partner != nil {
                            unpairRow
                        }

                        SectionHeader(title: "Rendimiento")
                        zonesCard
                        strengthCard

                        SectionHeader(title: "Entreno")
                        audioCoachCard

                        SectionHeader(title: "Dispositivos")
                        devicesCard

                        SectionHeader(title: "Apariencia")
                        appearanceCard

                        SectionHeader(title: "Metodología")
                        methodologyCard

                        SectionHeader(title: "Ayuda")
                        feedbackCard

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
                    // Cap the ScrollView's horizontal contentSize to the viewport so
                    // no row can ever pan the Perfil page sideways. See
                    // `clampedToContainerWidth()`.
                    .clampedToContainerWidth()
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
            // Cache-first: the screen already renders from the store's slices;
            // this scopes the session and revalidates Perfil's slices in the
            // background, plus the Perfil-only races list.
            store.activate(bearer: bearer)
            await store.loadProfile()
            await loadRaces()
            await loadPolar()
        }
        .sheet(item: $sheet) { kind in
            sheetView(for: kind)
        }
        .sheet(isPresented: $showPartnerInvite) {
            PartnerInviteSheet(bearer: bearer) { _ in
                // After a successful invite, refresh the partner slice — the
                // partner only appears after they redeem, but the envelope may
                // expose a pending state in future iterations.
                Task { await store.refreshPartner(force: true) }
            }
        }
        .alert("Deshacer pareja de Dobles", isPresented: $showUnpairConfirm) {
            Button("Deshacer", role: .destructive) { Task { await performUnpair() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Dejaréis de compartir plan y analíticas. Las sesiones que ya hicisteis juntos se conservan. Podéis volver a emparejaros más adelante.")
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
                store.setIdentity(updated)
            }
        }
        // Polar OAuth in an in-app browser; the callback lands on a web page (not the
        // app), so re-fetch the wearables status when the sheet closes.
        .sheet(item: $polarSafari, onDismiss: { Task { await loadPolar() } }) { item in
            SafariView(url: item.url).ignoresSafeArea()
        }
        .alert("Polar", isPresented: polarAlertBinding, presenting: polarAlert) { _ in
            Button("Entendido", role: .cancel) {}
        } message: { message in
            Text(message)
        }
        .confirmationDialog(
            "¿Desconectar Apple Salud?",
            isPresented: $showHealthDisconnectConfirm,
            titleVisibility: .visible
        ) {
            Button("Desconectar", role: .destructive) { disconnectAppleHealth() }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Dejaremos de leer y sincronizar tus datos de salud. Podrás volver a conectarlos cuando quieras.")
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
        .accessibilityElement(children: .combine)
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

    // MARK: - Settings card (handoff's five rows)
    //
    // Modalidad · Suscripción · Objetivo · Dispositivos (→ detail below) ·
    // Idioma. Rendered as a single grouped card with hairline dividers; each
    // row is label-left (muted) / value-right, navigable where a detail exists.
    private var settingsCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                modalityRow
                    .redacted(reason: initialLoadDone ? [] : .placeholder)
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

    /// The athlete's competition MODALITY — Individual / Dobles / Pro. This is
    /// NOT the subscription tier: "HYROX Athlete" (the marketing plan label) must
    /// never appear here. "Dobles · con {nombre}" when paired; "Dobles · invita a
    /// tu compañero/a" when on Dobles but unpaired; "Pro" for the pro_elite plan;
    /// "Individual" otherwise. (Three modalities per the Documento Maestro.)
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

    /// The athlete's race objective, read from the SAME list the Carreras tab shows
    /// (`upcomingRaces`). Prefer the race the coach flagged as the 'target' (the
    /// goal the plan peaks for); otherwise the soonest upcoming race (the server
    /// sorts soonest-first). Used ONLY to derive the competition division shown in
    /// the identity subtitle — the race objective itself lives in the Carreras tab.
    private var objetivoRace: UpcomingRace? {
        upcomingRaces.first { $0.priority?.lowercased() == "target" } ?? upcomingRaces.first
    }

    /// The app renders in Spanish only (no runtime localization switch yet), so
    /// this row reflects the language the athlete actually sees — never the stored
    /// `preferred_language`. Showing "English" while the whole UI was Spanish was
    /// misleading; "Español" is the honest, real value.
    private var languageValue: String { "Español" }

    // MARK: - Races (Perfil-only; identity / partner / subscription / coach name
    //         all come from the AppDataStore now)

    /// Upcoming races — the SAME list the Carreras tab shows (GET /api/athlete/
    /// races). One source → Perfil and Carreras always agree. Used only to derive
    /// the competition division for the identity subtitle. Silent on failure.
    private func loadRaces() async {
        guard let bearer else { return }
        if let races = await CarrerasService.fetchRaces(bearer: bearer) {
            upcomingRaces = races.upcoming
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

    /// The "invita a tu compañero/a" prompt is a DOBLES-only affordance: it must
    /// appear ONLY for an athlete on the Dobles modality who hasn't paired yet —
    /// never on Individual or Pro. We gate on `isDobles` (subscription plan_type /
    /// present partner / envelope hint) and wait for `initialLoadDone` so the
    /// modality is known before deciding (no flash, no false prompt on Individual).
    /// The card itself only renders when `partner == nil`; a paired Dobles athlete
    /// sees "con {nombre}" on the Modalidad row instead.
    private var shouldShowPartnerSection: Bool {
        guard initialLoadDone else { return false }
        return isDobles
    }

    /// Un-pair affordance shown to a PAIRED Dobles athlete. Destructive-styled,
    /// low-emphasis; the confirmation explains that past joint sessions stay.
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
        .accessibilityLabel("Deshacer pareja de Dobles")
    }

    /// Calls the athlete self-unlink endpoint (dissolves the pair + clears both
    /// account axes; past executions conserved), then refreshes the partner slice.
    private func performUnpair() async {
        guard let bearer, !unpairInProgress else { return }
        unpairInProgress = true
        defer { unpairInProgress = false }
        do {
            try await PartnerService.unlink(bearer: bearer)
            Haptics.success()
            await store.refreshPartner(force: true)
        } catch {
            // Non-fatal: leave the pair visible; a transient failure can be retried.
            Haptics.error()
        }
    }

    private var sentInvitation: SentInvitation? { store.partner.value?.sentInvitation }

    /// The unpaired-inviter card. Reflects the live state of the invitation the
    /// athlete last SENT: pending (with Cancel), expired / declined (with a
    /// re-invite), or — when there is none, or the last one was cancelled — the
    /// plain invite CTA.
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
                    // A long invitee email is an unbreakable token; without this it
                    // reports its single-line intrinsic width to the ScrollView and
                    // drags the whole page horizontally. Force wrap, grow vertically.
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
                    // Headline interpolates the invitee email (unbreakable token) —
                    // wrap it instead of letting it overflow the ScrollView width.
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

    private func cancelInvite() async {
        guard let bearer, !cancellingInvite else { return }
        cancellingInvite = true
        defer { cancellingInvite = false }
        do {
            _ = try await PartnerService.cancelInvite(bearer: bearer)
            Haptics.light()
        } catch {
            // Non-fatal — the refresh below reconciles the card to server truth.
        }
        await store.refreshPartner(force: true)
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

    // MARK: - Strength ("Mi fuerza")

    /// Entry point to the athlete's strength maxes (1RM per lift). Read-only;
    /// the destination handles its own loading / empty / error states and the
    /// register-test sheet.
    private var strengthCard: some View {
        CardSurface(padding: 0) {
            NavigationLink {
                MyStrengthView(bearer: bearer)
            } label: {
                profileRowContent(
                    icon: "dumbbell",
                    title: "Mi fuerza",
                    subtitle: "Tus 1RM por levantamiento · sentadilla, peso muerto, press…"
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
                polarRow
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

    // MARK: - Polar

    /// Polar cloud sync. Not connected → a tappable "conectar" row that opens the OAuth
    /// page; connected → a static "conectada" status (unlinking lives on the web). The
    /// spinner shows while the connect-url request is in flight.
    private var polarRow: some View {
        Button {
            guard !polarConnected, !polarConnecting else { return }
            Haptics.light()
            Task { await connectPolar() }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "heart.circle")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Polar")
                        .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(polarConnected
                         ? "Sincroniza tus entrenos automáticamente"
                         : "Conecta tu cuenta para sincronizar tus entrenos")
                        .scaledFont(11, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(2)
                }
                Spacer()
                if polarConnecting {
                    ProgressView().tint(Theme.Color.accentText)
                } else {
                    Text(polarConnected ? "conectada" : "conectar")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(1.2)
                        .foregroundStyle(polarConnected ? Theme.Color.ok : Theme.Color.accentText)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background((polarConnected ? Theme.Color.ok : Theme.Color.accentText).opacity(0.15))
                        .clipShape(Capsule())
                    if !polarConnected {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Theme.Color.faint)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
        }
        .buttonStyle(.plain)
        .disabled(polarConnected || polarConnecting || bearer == nil)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Polar, \(polarConnected ? "conectada" : "conectar")")
        .accessibilityHint(polarConnected ? "" : "Toca para conectar tu cuenta Polar")
        .accessibilityAddTraits(polarConnected ? [] : .isButton)
    }

    private var polarAlertBinding: Binding<Bool> {
        Binding(get: { polarAlert != nil }, set: { if !$0 { polarAlert = nil } })
    }

    /// Reads the wearables status and reflects Polar's connected flag. Silent on
    /// failure — the row simply stays "conectar".
    private func loadPolar() async {
        guard let bearer else { return }
        guard let providers = try? await WearablesService.fetch(bearer: bearer) else { return }
        polarConnected = providers.first { $0.provider == WearablesService.polar }?.connected ?? false
    }

    /// Requests the Polar OAuth URL and opens it in-app. 503 (not configured) and
    /// network errors surface as an alert; on success the browser sheet opens and its
    /// dismiss re-fetches the status.
    private func connectPolar() async {
        guard let bearer, !polarConnecting else { return }
        polarConnecting = true
        defer { polarConnecting = false }
        do {
            polarSafari = SafariURL(url: try await WearablesService.polarConnectURL(bearer: bearer))
        } catch let APIError.http(status, _) where status == 503 {
            polarAlert = "Polar no está disponible todavía. Vuelve a intentarlo más adelante."
        } catch {
            polarAlert = "No pudimos conectar con Polar. Revisa tu conexión e inténtalo de nuevo."
        }
    }

    // MARK: - Apple Health

    /// One control, same row: a native Toggle drives connect/disconnect.
    ///   • unavailable (simulator)  → disabled toggle, "No disponible…"
    ///   • toggling ON              → request auth + start sync + backfill
    ///   • toggling OFF             → confirm, then stop sync + reset anchors
    /// After a disconnect the subtitle carries a one-line revoke footnote — no modal,
    /// no extra row.
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
                if showHealthAppLink {
                    Button {
                        Haptics.light()
                        openHealthApp()
                    } label: {
                        HStack(spacing: 3) {
                            Text("Abrir Salud")
                                .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 9, weight: .semibold))
                        }
                        .foregroundStyle(Theme.Color.accentText)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 2)
                    .accessibilityLabel("Abrir la app Salud")
                    .accessibilityHint("Revisa qué categorías tiene permitido leer FAHYBRID")
                    // iOS only surfaces per-category Health permissions inside the
                    // Salud app, with no deep link to the app's page — so spell out
                    // the taps (same guidance Whoop/Strava give in their docs).
                    Text("En Salud: tu foto → Apps → FAHYBRID → Activar todo")
                        .scaledFont(10, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                        .lineLimit(2)
                }
            }
            Spacer()
            appleHealthTrailing
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
    }

    /// Opens Apple's Salud app so the athlete can review FAHYBRID's per-category
    /// read permissions — the only place iOS surfaces them (Ajustes never does).
    private func openHealthApp() {
        guard let url = URL(string: "x-apple-health://") else { return }
        UIApplication.shared.open(url)
    }

    @ViewBuilder
    private var appleHealthTrailing: some View {
        if healthRequesting {
            ProgressView().tint(Theme.Color.accentText)
        } else {
            Toggle("", isOn: healthToggle)
                .labelsHidden()
                .tint(Theme.Color.accent)
                .disabled(!healthAvailable)
                .accessibilityLabel("Apple Health")
                .accessibilityValue(healthConnected ? "conectado" : "desconectado")
                .accessibilityHint(healthAvailable
                    ? "Conecta o desconecta la sincronización de tus datos de salud"
                    : "No disponible en este dispositivo")
        }
    }

    /// Connect/disconnect in ONE control. Toggling ON runs the connect flow;
    /// toggling OFF asks for confirmation first — the toggle stays visually ON
    /// (get still returns `healthConnected`) until the athlete confirms, so a
    /// cancel simply leaves it connected.
    private var healthToggle: Binding<Bool> {
        Binding(
            get: { healthConnected },
            set: { turnOn in
                Haptics.light()
                if turnOn {
                    Task { await connectAppleHealth() }
                } else {
                    showHealthDisconnectConfirm = true
                }
            }
        )
    }

    private var healthSubtitle: String {
        if !healthAvailable { return "No disponible en este dispositivo" }
        if healthConnected { return "Sincroniza en segundo plano" }
        if healthRequesting { return "Pidiendo permiso…" }
        if healthDenied { return "No pudimos activar Apple Salud. Inténtalo de nuevo." }
        if healthShowRevokeHint {
            return "Desconectado. Para revocar el acceso por completo, ábrelo en la app Salud."
        }
        return "Conecta para sincronizar HR, HRV, sueño y peso"
    }

    /// Whether to surface the "Abrir Salud" link under the row. Shown when connected
    /// (so an athlete who reconnected but only sees steps can enable the rest of the
    /// categories) and right after a disconnect (to fully revoke). The Salud app —
    /// not iOS Ajustes — is where Health category permissions actually live.
    private var showHealthAppLink: Bool {
        healthAvailable && (healthConnected || healthShowRevokeHint)
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
        // When the connect-time backfill finishes uploading every metric, pull
        // today's readiness fresh so "¿Cómo llegas hoy?" repopulates. Capture the
        // shared store by reference (never the SwiftUI view / its @Environment) since
        // this closure outlives the view on the sync singleton.
        let dataStore = store
        HealthKitSyncService.shared.onBackfillCompleted = {
            Task { @MainActor in await dataStore.refreshReadiness(force: true) }
        }
        // connect() (not start()) RESETS anchors and re-pulls the full recent window —
        // so an athlete who granted Health READ permission LATER than the first sync
        // (e.g. steps-only at first, everything later) recovers their sleep / HRV / RHR
        // history instead of it being skipped forever. Re-uploads de-dupe server-side.
        HealthKitSyncService.shared.connect()
        UserDefaults.standard.set(true, forKey: HealthKitConnection.connectedKey)
        healthConnected = true
        healthDenied = false
        healthShowRevokeHint = false
        showToast("Apple Health conectado")
    }

    /// Tears down the HealthKit sync and clears the connected flag, so the app stops
    /// reading. Anchors are kept, so a later reconnect re-runs start() and its
    /// anchor-delta backfill covers exactly the disconnected gap. HealthKit never
    /// lets an app revoke its own READ permission, so we surface a one-line footnote
    /// (healthShowRevokeHint) + an "Abrir Salud" link — no modal, no extra row.
    @MainActor
    private func disconnectAppleHealth() {
        HealthKitSyncService.shared.stop()
        HealthKitSyncService.shared.onBackfillCompleted = nil
        UserDefaults.standard.set(false, forKey: HealthKitConnection.connectedKey)
        healthConnected = false
        healthDenied = false
        healthShowRevokeHint = true
        showToast("Apple Health desconectado")
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
                    // Subtitle may carry an unbreakable token (a paired BLE device
                    // name, a bare URL). Wrap within the row width; never overflow.
                    .fixedSize(horizontal: false, vertical: true)
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

    // MARK: - Audio coaching (#63)

    /// "Avisos de voz" — the live running voice coach (tramos, ritmo, parciales).
    /// ON by default; the same @AppStorage key backs the run-HUD speaker button.
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

    // MARK: - Appearance

    /// Theme override control. Defaults to "Auto" (follow the system); "Claro" /
    /// "Oscuro" force the scheme. Writes the shared @AppStorage value AppRoot reads.
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

    // MARK: - Methodology

    private var methodologyCard: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                profileRow(
                    icon: "rectangle.3.group",
                    title: "Cómo se construye tu plan",
                    subtitle: "Microciclos diseñados por tu coach, semana a semana.",
                    action: { sheet = .methodology }
                )
                Hairline()
                profileRow(
                    icon: "person.crop.rectangle",
                    title: coachName.map { "Tu coach: \($0)" } ?? "Tu coach",
                    subtitle: "Diseña tu metodología y tu plan.",
                    action: { sheet = .coach }
                )
            }
        }
    }

    // MARK: - Ayuda (#59 · app feedback)

    private var feedbackCard: some View {
        CardSurface(padding: 0) {
            profileRow(
                icon: "exclamationmark.bubble",
                title: "Enviar sugerencia o error",
                subtitle: "Cuéntanos qué mejorar o reporta un fallo. Nos llega directamente al equipo, no a tu coach.",
                action: { sheet = .feedback }
            )
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
                    // Title carries the coach's name on the Metodología row ("Tu
                    // coach: {name}") — arbitrary length. Wrap, never overflow.
                    .fixedSize(horizontal: false, vertical: true)
                Text(subtitle)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                    // Subtitle may carry an unbreakable token (a paired BLE device
                    // name, a bare URL). Wrap within the row width; never overflow.
                    .fixedSize(horizontal: false, vertical: true)
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
        case .coach:       CoachSheet(coachName: coachName)
        case .privacy:     LegalSheet(title: "Política de privacidad", bodyText: LegalCopy.privacy)
        case .terms:       LegalSheet(title: "Términos de uso", bodyText: LegalCopy.terms)
        case .feedback:    AppFeedbackSheet(bearer: bearer)
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

// MARK: - Theme mode segmented control
//
// On-brand segmented control for the appearance override — a recessed track with
// the active segment lifted on the Fabrik-orange pill (accentOn text = the valid
// 4.57:1 brown-on-orange pairing), inactive segments muted. Mirrors the AppTabBar's
// active-pill language rather than the washed-out native `.segmented` Picker.
private struct ThemeModePicker: View {
    @Binding var selection: ThemeMode

    var body: some View {
        HStack(spacing: 4) {
            ForEach(ThemeMode.allCases) { mode in
                segment(mode)
            }
        }
        .padding(4)
        .background(Theme.Color.surfaceSunken)
        .clipShape(Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Apariencia")
    }

    private func segment(_ mode: ThemeMode) -> some View {
        let active = selection == mode
        return Button {
            guard !active else { return }
            Haptics.light()
            withAnimation(.easeInOut(duration: 0.18)) { selection = mode }
        } label: {
            Text(mode.label)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(active ? Theme.Color.accentOn : Theme.Color.muted)
                .frame(maxWidth: .infinity)
                .frame(height: 34)
                .background {
                    if active {
                        Capsule().fill(Theme.Color.accent)
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(mode.label)
        .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - Sheet content

private struct MethodologySheet: View {
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Cómo se construye tu plan")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Tu coach diseña tu entrenamiento en microciclos: bloques de varias semanas, cada uno con un objetivo. El nombre y el foco de cada microciclo los decide tu coach según tu nivel y tu carrera.")
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                    principleCard(
                        title: "Microciclos",
                        text: "Bloques de varias semanas con un foco concreto. Avanzas de uno al siguiente conforme te acercas a tu carrera."
                    )
                    principleCard(
                        title: "Semana a semana",
                        text: "Cada semana se publica cuando le toca. Te centras en lo que tienes delante, no en el plan entero de golpe."
                    )
                    principleCard(
                        title: "Se adapta a ti",
                        text: "Tu coach revisa cómo respondes —carga, recuperación, resultados— y ajusta lo que viene."
                    )
                    Text("El nombre de tu microciclo actual y la semana en la que estás los fija tu coach, y los ves en la pestaña Plan.")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                }
                .padding(20)
                // Same clamp as the Perfil tab: no descendant can pan the sheet.
                .clampedToContainerWidth()
            }
        }
        .dismissableSheet()
    }

    private func principleCard(title: String, text: String) -> some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .scaledFont(14, weight: .heavy, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.accentText)
                Text(text)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }
}

private struct CoachSheet: View {
    /// Agnostic coach name from the athlete week API (nil until loaded / if unset).
    let coachName: String?

    /// Display name with a neutral, non-fabricated fallback.
    private var displayName: String { coachName ?? "Tu coach" }

    /// Single uppercased initial for the avatar; person glyph when unavailable.
    private var initial: String? {
        guard let first = coachName?.first else { return nil }
        return String(first).uppercased()
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle().fill(Theme.Color.surface).frame(width: 64, height: 64)
                            if let initial {
                                Text(initial)
                                    .font(.system(size: 20, weight: .heavy, design: .default).italic())
                                    .foregroundStyle(Theme.Color.foreground)
                            } else {
                                Image(systemName: "person.fill")
                                    .font(.system(size: 22, weight: .semibold))
                                    .foregroundStyle(Theme.Color.muted)
                            }
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(displayName)
                                .font(Theme.Typography.headlineS)
                                .foregroundStyle(Theme.Color.foreground)
                                // Coach name is arbitrary length; this HStack has no
                                // trailing Spacer, so wrap instead of forcing width.
                                .fixedSize(horizontal: false, vertical: true)
                            Text("Coach")
                                .scaledFont(12, relativeTo: .caption)
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                    Text("\(displayName) escribe la metodología detrás de tu plan. Cada workout que ves se basa en una plantilla validada por tu coach, ajustada a tu CTL/ATL/TSB y a tus weaknesses por estación.")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.foreground)
                }
                .padding(20)
                // Same clamp as the Perfil tab: no descendant can pan the sheet.
                .clampedToContainerWidth()
            }
        }
        .dismissableSheet()
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
                // Same clamp as the Perfil tab: no descendant can pan the sheet.
                .clampedToContainerWidth()
            }
        }
        .dismissableSheet()
    }
}

private enum LegalCopy {
    static let privacy = "FAHYBRID procesa datos biométricos (HR, HRV, sueño, peso) para construir tu plan. No los compartimos con terceros sin tu consentimiento explícito.\n\nLa versión completa está disponible en fahybrid.com/privacy. Si tienes dudas, escribe a hello@fahybrid.com."
    static let terms = "El uso de FAHYBRID implica aceptar nuestros términos de servicio: la metodología es propiedad de tu coach. Tu suscripción se renueva mensualmente y puedes cancelarla desde la sección Suscripción.\n\nLa versión completa está disponible en fahybrid.com/terms."
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
        // point (starts empty for everyone until set here); empty → HR zones use
        // the 220−age estimate.
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
                                Hairline()
                                editDecimalRow(label: "FC máx (ppm)", placeholder: "100–230", text: $maxHrText)
                                    .accessibilityLabel("Frecuencia cardiaca máxima en pulsaciones por minuto")
                            }
                        }
                        Text("Tu FC máxima real personaliza las zonas de pulso. Si la dejas vacía, se estiman con 220 − edad (marcadas “estimada”).")
                            .scaledFont(11, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.muted)
                            .padding(.horizontal, 4)
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
                    // Same clamp as the Perfil tab: no field row can pan the sheet.
                    .clampedToContainerWidth()
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

    /// The entered FCmáx as a sane Int (100–230), else nil. Out-of-range or blank →
    /// nil, so a typo never persists an absurd max (it also trips the range hint).
    private var parsedMaxHr: Int? {
        guard let d = parseDecimal(maxHrText) else { return nil }
        let i = Int(d.rounded())
        return (i >= PersonalHRMax.minMeasuredBpm && i <= PersonalHRMax.maxMeasuredBpm) ? i : nil
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

// MARK: - Horizontal container clamp
//
// A vertical `ScrollView` measures its content's WIDTH from the widest descendant.
// If any descendant reports a minimum width past the viewport — an unbreakable
// token in a `Text` (a long email, a bare URL, a BLE device name), an `HStack`
// whose members' minimum widths sum past the screen, or a fixed-width frame — the
// ScrollView's horizontal contentSize grows past the viewport and the whole page
// pans sideways. Pinning the content to the container's exact width caps that
// horizontal contentSize, so no descendant (present or future) can ever drag the
// page again — the structural guarantee, independent of any single offender.
//
// Applied OUTSIDE the content's own `.padding(...)` so the padded content measures
// exactly the viewport width (padding included), never wider.
private extension View {
    func clampedToContainerWidth() -> some View {
        containerRelativeFrame(.horizontal)
    }
}
