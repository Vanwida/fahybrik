import SwiftUI

// Subscription detail page (Profile → "Mi suscripción").
//
// COMPLIANCE (Apple Guideline 3.1.3(b) "Multiplatform Services"):
// The athlete pays on the WEB (Stripe Checkout, hosted) before installing the
// app. This screen is READ-ONLY about money: it shows the current state and a
// single "Gestionar suscripción" button that opens the Stripe Customer Portal
// in an SFSafariViewController, where cancel / change / payment-method live.
//
// HARD RULE: zero in-app purchase surface — no prices, no "Suscríbete",
// no "Comprar", no "Upgrade". When the subscription is NOT active we point the
// athlete to the web to fix it; we never start checkout in-app.
struct SubscriptionView: View {
    let bearer: String?

    @State private var info: SubscriptionInfo? = nil
    @State private var loading: Bool = true
    @State private var error: String? = nil
    @State private var actionInFlight: Bool = false
    @State private var safari: SafariURL? = nil

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    header
                    if loading {
                        ProgressView()
                            .tint(Theme.Color.accent)
                            .frame(maxWidth: .infinity)
                            .padding(.top, Theme.Spacing.xl)
                    } else if let info {
                        statusCard(info)
                        if info.isActiveAccess {
                            manageButton
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
        .task { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            LabelText(text: "Plan")
            Text(info?.modalityLabel ?? "HYROX Athlete")
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
                Text(info.modalityLabel)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                if let date = info.formattedPeriodEnd {
                    HStack {
                        Text(periodLabel(for: info))
                            .font(Theme.Typography.small)
                            .foregroundStyle(Theme.Color.muted)
                        Spacer()
                        Text(date)
                            .font(.system(size: 13, weight: .medium, design: .monospaced))
                            .foregroundStyle(Theme.Color.foreground)
                    }
                }
                if info.cancelAtPeriodEnd, let date = info.formattedPeriodEnd {
                    Text("Tu plan termina el \(date).")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.warning)
                }
            }
        }
    }

    private func periodLabel(for info: SubscriptionInfo) -> String {
        info.cancelAtPeriodEnd ? "Acceso hasta" : "Próximo cobro"
    }

    private func statusPill(_ info: SubscriptionInfo) -> some View {
        let (text, color): (String, Color) = {
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

    // Active subscription → manage in the Stripe Customer Portal (web).
    private var manageButton: some View {
        PrimaryButton(title: "Gestionar suscripción", enabled: !actionInFlight) {
            Task { await openPortal() }
        }
    }

    // Inactive / no subscription → point to the web. NO in-app checkout.
    @ViewBuilder
    private func inactiveNotice(_ info: SubscriptionInfo) -> some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Tu suscripción no está activa")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Gestiona tu plan desde \(SubscriptionService.accountWebHost) para recuperar el acceso completo.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        SecondaryButton(title: "Ir a \(SubscriptionService.accountWebHost)") {
            safari = SafariURL(url: SubscriptionService.accountWebURL)
        }
    }

    @MainActor
    private func load() async {
        loading = true
        error = nil
        do {
            info = try await SubscriptionService.fetchSubscription(bearer: bearer)
        } catch {
            self.error = "No pudimos cargar la suscripción."
        }
        loading = false
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
