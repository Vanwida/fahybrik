import SwiftUI

// Subscription detail page (Profile → "Mi suscripción").
//
// COMPLIANCE (Apple Guideline 3.1.3(b) "Multiplatform Services"):
// The athlete pays on the WEB (Stripe Checkout, hosted) before installing the
// app. This screen shows no prices and starts no checkout — ever.
//
// Pausing and leaving DO live in-app, natively, against our own API (#13). That
// is not a step away from the rule, it is a step toward it: managing an existing
// subscription in-app is exactly what 3.1.3(b) contemplates, and it means the
// athlete no longer has to be sent out to Stripe's portal for the one thing they
// came here to do. The portal button stays for invoices and payment method,
// demoted to a quiet link.
//
// HARD RULE, unchanged: zero in-app purchase surface — no prices,
// no "Suscríbete", no "Comprar", no "Upgrade".
struct SubscriptionView: View {
    let bearer: String?

    @State private var info: SubscriptionInfo? = nil
    @State private var lifecycle: LifecycleState? = nil
    @State private var loading: Bool = true
    @State private var error: String? = nil
    @State private var actionInFlight: Bool = false
    @State private var safari: SafariURL? = nil
    @State private var sheet: LifecycleSheetKind? = nil

    private enum LifecycleSheetKind: String, Identifiable {
        case pause, baja
        var id: String { rawValue }
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    header
                    if loading {
                        ProgressView()
                            .tint(Theme.Color.accentText)
                            .frame(maxWidth: .infinity)
                            .padding(.top, Theme.Spacing.xl)
                    } else if let info {
                        statusCard(info)
                        if info.isActiveAccess {
                            activeBody(info)
                        } else {
                            inactiveNotice(info)
                        }
                    }
                    if let error {
                        Text(error)
                            .font(Theme.Typography.small)
                            .foregroundStyle(Theme.Color.warning)
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xl)
            }
        }
        .navigationTitle("Mi suscripción")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $safari) { item in
            SafariView(url: item.url).ignoresSafeArea()
        }
        .sheet(item: $sheet) { kind in
            lifecycleSheet(kind)
        }
        .task { await load() }
    }

    // MARK: - Header + status

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: "Plan")
            Text(info?.displayPlanLabel ?? "HYROX Athlete")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
        }
    }

    @ViewBuilder
    private func statusCard(_ info: SubscriptionInfo) -> some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    LabelText(text: "Estado")
                    Spacer()
                    statusPill(info)
                }
                Text(info.displayPlanLabel)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)

                if let lifecycle, lifecycle.isPaused {
                    row("Cobro", "Parado · no se te cobra")
                    row("Tu plaza", "Reservada")
                } else if let lifecycle, let dia = LifecycleDate.long(lifecycle.baja.scheduledFor) {
                    row("Entrenas hasta", dia)
                    row("Próximo cobro", "Ninguno")
                } else if let date = info.formattedPeriodEnd {
                    row(periodLabel(for: info), date)
                }
            }
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
            Spacer()
            Text(value)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.foreground)
        }
    }

    private func periodLabel(for info: SubscriptionInfo) -> String {
        info.cancelAtPeriodEnd ? "Acceso hasta" : "Próximo cobro"
    }

    private func statusPill(_ info: SubscriptionInfo) -> some View {
        let (text, color): (String, Color) = {
            // The LIFECYCLE wins over the raw Stripe status when they disagree: a
            // paused athlete still has an "active" subscription in Stripe (collection
            // is voided, not cancelled), and showing "Activa" there would contradict
            // the two lines right underneath it.
            if let lifecycle {
                if lifecycle.isPaused { return ("En pausa", Theme.Color.warning) }
                if lifecycle.hasScheduledBaja { return ("Baja programada", Theme.Color.neutral) }
            }
            guard let raw = info.status else {
                return ("Sin suscripción", Theme.Color.muted)
            }
            switch raw {
            case "active": return ("Activa", Theme.Color.ok)
            case "trialing": return ("Prueba", Theme.Color.ok)
            case "past_due", "unpaid", "incomplete": return ("Pago pendiente", Theme.Color.warning)
            case "canceled", "incomplete_expired": return ("Cancelada", Theme.Color.muted)
            case "paused": return ("Pausada", Theme.Color.muted)
            default: return (raw, Theme.Color.muted)
            }
        }()
        return Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
    }

    // MARK: - The three shapes an active athlete can be in

    @ViewBuilder
    private func activeBody(_ info: SubscriptionInfo) -> some View {
        if let lifecycle {
            if lifecycle.isPaused {
                pausedBody(lifecycle)
            } else if lifecycle.hasScheduledBaja {
                leavingBody(lifecycle)
            } else {
                runningBody(lifecycle)
            }
        } else {
            // Lifecycle unreadable (offline, older backend) — never hide the portal.
            manageLink
        }
    }

    /// Training normally: the budget in plain sight, and the two ways out.
    @ViewBuilder
    private func runningBody(_ lifecycle: LifecycleState) -> some View {
        budgetCard(lifecycle)

        Button("Pausar mi plan") { sheet = .pause }
            .font(Theme.Typography.bodyEmph)
            .foregroundStyle(Theme.Color.foreground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
            )

        manageLink

        Button("Darme de baja") { sheet = .baja }
            .font(Theme.Typography.small)
            .foregroundStyle(Theme.Color.danger)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
    }

    /// Paused: what is (not) happening, and the way back in one tap.
    @ViewBuilder
    private func pausedBody(_ lifecycle: LifecycleState) -> some View {
        if let vuelve = LifecycleDate.long(lifecycle.pause.returnsOn) {
            CardSurface(padding: 14) {
                Text("Vuelves solo el \(vuelve). Ese día tendrás tu semana publicada.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        budgetCard(lifecycle)
        PrimaryButton(title: "Volver ya", enabled: !actionInFlight) {
            Task { await resume() }
        }
    }

    /// Leaving, but not gone: everything still works until the day arrives.
    @ViewBuilder
    private func leavingBody(_ lifecycle: LifecycleState) -> some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                if let dia = LifecycleDate.long(lifecycle.baja.scheduledFor) {
                    Text("Hasta el \(dia) todo sigue igual: tienes plan, chat y tu entrenador.")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text("Puedes cancelar la baja cuando quieras.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.foreground)
            }
        }
        PrimaryButton(title: "Cancelar la baja, sigo", enabled: !actionInFlight) {
            Task { await undoBaja() }
        }
        manageLink
    }

    private func budgetCard(_ lifecycle: LifecycleState) -> some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 7) {
                LabelText(text: "Pausa disponible")
                Text("\(lifecycle.pause.availableDays) días de \(lifecycle.pause.budgetDays)")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text(budgetCaption(lifecycle))
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.faint)
            }
        }
    }

    private func budgetCaption(_ lifecycle: LifecycleState) -> String {
        if let renews = LifecycleDate.long(lifecycle.pause.renewsOn) {
            return "Se te renuevan el \(renews)"
        }
        return "Se renuevan cada doce meses"
    }

    // Managing an EXISTING subscription (invoices, payment method) on Stripe's own
    // UI. Demoted to a link now that pause + baja are native: this is no longer the
    // way out, it is the paperwork.
    private var manageLink: some View {
        Button("Gestionar pago · facturas") {
            Task { await openPortal() }
        }
        .font(Theme.Typography.small)
        .foregroundStyle(Theme.Color.muted)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .disabled(actionInFlight)
    }

    // Inactive / no subscription → an HONEST plain notice. AUDIT-B8c (steering 3.1.1):
    // NO external link, URL or CTA to an out-of-app purchase/management flow here. The
    // Stripe Customer Portal stays available ONLY for an ACTIVE subscription
    // (manageLink — managing an existing subscription, defensible under 3.1.3(b)).
    @ViewBuilder
    private func inactiveNotice(_ info: SubscriptionInfo) -> some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Tu suscripción no está activa")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Tu plan se gestiona desde la web de \(Marca.nombre). Cuando esté activo, aquí verás tu acceso completo.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder
    private func lifecycleSheet(_ kind: LifecycleSheetKind) -> some View {
        if let lifecycle {
            switch kind {
            case .pause:
                PauseSheet(
                    state: lifecycle,
                    bearer: bearer,
                    onDone: { sheet = nil; Task { await load() } },
                    onClose: { sheet = nil },
                    onSwitchToBaja: { sheet = .baja }
                )
            case .baja:
                BajaSheet(
                    state: lifecycle,
                    bearer: bearer,
                    onDone: { sheet = nil; Task { await load() } },
                    onClose: { sheet = nil },
                    onSwitchToPause: { sheet = .pause }
                )
            }
        }
    }

    // MARK: - Loading + actions

    @MainActor
    private func load() async {
        loading = true
        error = nil
        do {
            info = try await SubscriptionService.fetchSubscription(bearer: bearer)
        } catch {
            self.error = "No pudimos cargar la suscripción."
        }
        // The lifecycle is ADDITIVE: if it fails, the screen still renders the plan.
        lifecycle = try? await LifecycleService.fetchState(bearer: bearer)
        loading = false
    }

    @MainActor
    private func resume() async {
        guard !actionInFlight else { return }
        actionInFlight = true
        defer { actionInFlight = false }
        do {
            try await LifecycleService.resume(bearer: bearer)
            await load()
        } catch {
            self.error = "No pudimos reanudar tu plan. Reintenta en unos segundos."
        }
    }

    @MainActor
    private func undoBaja() async {
        guard !actionInFlight else { return }
        actionInFlight = true
        defer { actionInFlight = false }
        do {
            try await LifecycleService.cancelBaja(bearer: bearer)
            await load()
        } catch {
            self.error = "No pudimos cancelar tu baja. Reintenta en unos segundos."
        }
    }

    @MainActor
    private func openPortal() async {
        guard !actionInFlight else { return }
        actionInFlight = true
        defer { actionInFlight = false }
        do {
            let url = try await SubscriptionService.openManagePortal(bearer: bearer)
            safari = SafariURL(url: url)
        } catch APIError.http(404, _) {
            // No Stripe customer yet — fall back to the account web.
            safari = SafariURL(url: SubscriptionService.accountWebURL)
        } catch {
            self.error = "No pudimos abrir la gestión. Reintenta en unos segundos."
        }
    }
}
