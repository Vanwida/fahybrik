import SwiftUI

// Dobles · plan conectado (the HUB). The self athlete's week + a read-only
// toggle to the partner's week, marking optional-together vs the joint-mandatory
// simulation, plus links to the other three Dobles screens.
//
// Faithful to design_handoff_fhp/App Atleta - Dobles.dc.html screen 1, mapped to
// our system: the handoff colors Ana (self) RED and Marcos (partner) BLUE — we
// keep SELF = brand orange (Theme.Color.accent) and PARTNER = blue
// (Theme.Color.partner). Never red-as-brand.
//
// Presentation: opened as a `.fullScreenCover` from PlanView (no enclosing
// NavigationStack), so this screen owns its OWN NavigationStack — it provides a
// close affordance and pushes the other three screens via NavigationLink.
//
// BACKEND GAP: DoblesService.fetchConnectedPlan returns nil (no endpoint). With
// no data we show an honest empty state; the partner identity comes from the
// already-shipped PartnerService. The rich week renders only once the backend
// ships the connected-plan payload — we NEVER fabricate the partner's sessions.
struct DoblesPlanView: View {
    var bearer: String? = nil

    @Environment(\.dismiss) private var dismiss

    @State private var plan: DoblesConnectedPlan? = nil
    @State private var partner: PartnerInfo? = nil
    @State private var loading = true
    /// Which week the toggle shows: self vs partner (read-only).
    @State private var showingPartner = false
    @State private var appear = false
    // #56 — the partner's live presence (one fetch on appear) → the "únete en vivo"
    // banner. Informational here (this read-only plan has no start-session flow).
    @State private var partnerLive: PartnerLiveStatus? = nil

    private var effectiveBearer: String? {
        bearer
    }

    /// Partner first name, from the connected-plan payload or the partner link.
    private var partnerFirstName: String {
        plan?.partnerName ?? partner?.firstName ?? "tu compañero"
    }

    /// Whether we have enough to render the connected week. The partner LINK is
    /// not enough — the connected-plan PAYLOAD (the days) must be present, else
    /// we'd be inventing the partner's sessions.
    private var hasPlan: Bool { plan != nil }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    header
                        .staggerReveal(appear, index: 0)

                    // #56 — the partner training right now. Informational here (no CTA):
                    // the athlete starts their session from Inicio / Plan, not this view.
                    DoblesLiveBanner(
                        state: DoblesLiveBannerState.from(partnerLive, hasOwnSessionToday: false)
                    )
                    .staggerReveal(appear, index: 1)

                    if loading {
                        ProgressView()
                            .tint(Theme.Color.accent)
                            .frame(maxWidth: .infinity)
                            .padding(.top, Theme.Spacing.xxl)
                    } else if let plan {
                        content(plan)
                    } else {
                        RedesignEmptyState(
                            symbol: "person.2",
                            title: "Sin compañero de Dobles",
                            message: "Cuando conectes con tu compañero veréis cada uno vuestro plan, lo que es opcional juntos y la simulación conjunta del sábado."
                        )
                        .padding(.top, Theme.Spacing.xl)
                        .staggerReveal(appear, index: 1)
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.top, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .background(Theme.Color.background.ignoresSafeArea())
            .instrumentCanvas()
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        Haptics.light()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    .accessibilityLabel("Cerrar")
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
        .task(id: effectiveBearer) {
            loading = true
            // Partner identity (already shipped) + connected-plan payload (gap).
            if let bearer = effectiveBearer {
                partner = try? await PartnerService.fetchPartner(bearer: bearer)
            }
            plan = await DoblesService.fetchConnectedPlan(bearer: effectiveBearer)
            loading = false
            withAnimation { appear = true }
            // #56 — the partner's live presence (only when a partner link exists).
            if partner != nil, case .ok(let p) = await DoblesLiveClient.fetch(bearer: effectiveBearer) {
                partnerLive = p
            }
        }
    }

    // MARK: - Header (avatar pair + title)

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: Theme.Spacing.s) {
                Wordmark(size: 18)
                Spacer(minLength: Theme.Spacing.s)
                DoblesAvatarPair(
                    selfInitials: "Yo",
                    partnerInitials: partner?.initials ?? "·",
                    size: 34
                )
            }
            Text("Tu semana")
                .scaledFont(26, weight: .heavy, relativeTo: .title, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.top, Theme.Spacing.l)
            if hasPlan {
                MonoText(
                    text: planSubtitle,
                    size: 12,
                    weight: .medium,
                    color: Theme.Color.faint
                )
                .padding(.top, 5)
            } else {
                Text("Plan conectado")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.Color.faint)
                    .padding(.top, 5)
            }
        }
    }

    private var planSubtitle: String {
        let week = plan?.weekLabel ?? ""
        let conn = "conectada con \(partnerFirstName)"
        return week.isEmpty ? conn : "\(week) · \(conn)"
    }

    // MARK: - Content (when the connected plan payload exists)

    @ViewBuilder
    private func content(_ plan: DoblesConnectedPlan) -> some View {
        // Mi plan / Plan de {partner} 👁 toggle.
        DoblesPlanToggle(
            showingPartner: $showingPartner,
            partnerName: partnerFirstName,
            partnerVisible: plan.partnerPlanVisible
        )
        .staggerReveal(appear, index: 1)

        let days = showingPartner ? plan.partnerDays : plan.selfDays
        if days.isEmpty {
            RedesignEmptyState(
                symbol: "calendar",
                title: showingPartner ? "Plan de \(partnerFirstName) no disponible" : "Semana sin publicar",
                message: showingPartner
                    ? "Tu compañero aún no ha compartido su semana."
                    : "Tu coach aún no ha publicado esta semana."
            )
            .padding(.top, Theme.Spacing.l)
            .staggerReveal(appear, index: 2)
        } else {
            VStack(spacing: Theme.Spacing.s) {
                ForEach(days) { day in
                    DoblesPlanDayRow(
                        day: day,
                        // The joint simulation row links to the simulation screen.
                        destination: day.togetherness == .jointMandatory
                            ? AnyView(DoblesSimulationView(bearer: effectiveBearer))
                            : nil
                    )
                }
            }
            .staggerReveal(appear, index: 2)
        }

        // Shared-analytics banner → links to screen 2.
        NavigationLink {
            DoblesSharedAnalyticsView(bearer: effectiveBearer)
        } label: {
            DoblesSharedBanner()
        }
        .buttonStyle(PressScaleStyle())
        .staggerReveal(appear, index: 3)

        // Quick links to the optional train-together and the joint simulation.
        VStack(spacing: Theme.Spacing.s) {
            NavigationLink {
                // The real optional-together assignment id from the plan payload
                // (nil only when there's no optional-together session this week).
                DoblesTrainTogetherView(
                    sessionId: plan.trainTogetherSessionId,
                    bearer: effectiveBearer
                )
            } label: {
                DoblesLinkRow(
                    symbol: "figure.strengthtraining.traditional",
                    tint: Theme.Color.foreground,
                    title: "Entrenar a la vez",
                    subtitle: "opcional · misma sesión, cada uno su carga"
                )
            }
            .buttonStyle(PressScaleStyle())

            NavigationLink {
                DoblesSimulationView(bearer: effectiveBearer)
            } label: {
                DoblesLinkRow(
                    symbol: "flag.checkered",
                    tint: Theme.Color.accentText,
                    title: "Simulación conjunta",
                    subtitle: "obligatoria juntos · reparto de estaciones"
                )
            }
            .buttonStyle(PressScaleStyle())
        }
        .staggerReveal(appear, index: 4)
    }
}

// MARK: - Mi plan / Plan de {partner} toggle

/// Two-pill segmented control: "Mi plan" (active orange) and
/// "Plan de {partner} 👁" (read-only partner view). Disabled when the partner
/// has not shared their plan.
private struct DoblesPlanToggle: View {
    @Binding var showingPartner: Bool
    let partnerName: String
    let partnerVisible: Bool

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            pill(title: "Mi plan", active: !showingPartner) {
                withAnimation(.easeInOut(duration: 0.18)) { showingPartner = false }
            }
            pill(
                title: "Plan de \(partnerName) 👁",
                active: showingPartner,
                enabled: partnerVisible
            ) {
                guard partnerVisible else { return }
                withAnimation(.easeInOut(duration: 0.18)) { showingPartner = true }
            }
        }
    }

    private func pill(
        title: String,
        active: Bool,
        enabled: Bool = true,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            Haptics.light()
            action()
        } label: {
            Text(title)
                .font(.system(size: 12, weight: active ? .bold : .medium))
                .foregroundStyle(
                    active ? Theme.Color.accentOn
                    : (enabled ? Theme.Color.muted : Theme.Color.faint)
                )
                .lineLimit(1)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(active ? Theme.Color.accent : Theme.Color.surfaceElevated)
                .overlay(
                    Capsule().stroke(active ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
                )
                .clipShape(Capsule())
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!enabled)
        .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - Plan day row

/// One day of the connected plan: mono day label, modality dot, session title +
/// detail, and a togetherness badge. The joint-mandatory simulation row reads
/// as a highlighted orange card and pushes its destination.
private struct DoblesPlanDayRow: View {
    let day: DoblesPlanDay
    /// When set (the joint simulation), the row becomes a navigation link.
    let destination: AnyView?

    private var isJoint: Bool { day.togetherness == .jointMandatory }
    private var isRest: Bool { day.togetherness == .rest }

    var body: some View {
        if let destination {
            NavigationLink { destination } label: { rowBody }
                .buttonStyle(PressScaleStyle())
        } else {
            rowBody
        }
    }

    private var rowBody: some View {
        HStack(spacing: 11) {
            Text(day.dayLabel)
                .font(.system(size: 11, weight: isJoint ? .heavy : .medium, design: .monospaced))
                .foregroundStyle(isJoint ? Theme.Color.accentText : Theme.Color.faint)
                .frame(width: 30, alignment: .leading)

            if !isRest, day.sessionTitle != nil {
                ModalityDot(modality: day.modality, size: 7)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(day.sessionTitle ?? "Descanso")
                    .font(.system(size: 14, weight: isJoint ? .bold : .regular))
                    .foregroundStyle(isRest ? Theme.Color.faint : Theme.Color.foreground)
                if let detail = day.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 11))
                        .foregroundStyle(isJoint ? Theme.Color.muted : Theme.Color.faint)
                }
            }
            Spacer(minLength: Theme.Spacing.s)

            trailing
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .background(isJoint ? Theme.Color.accent.opacity(0.10) : Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(isJoint ? Theme.Color.accentText : Theme.Color.hairline,
                        lineWidth: isJoint ? 1.5 : 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(destination != nil ? .isButton : [])
    }

    @ViewBuilder
    private var trailing: some View {
        switch day.togetherness {
        case .bothDone:
            HStack(spacing: 3) {
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .bold))
                Text("los 2")
                    .font(.system(size: 10, weight: .medium))
            }
            .foregroundStyle(Theme.Color.ok)
        case .optionalTogether:
            Text("opc. juntos")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(Theme.Color.muted)
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                        .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                )
        case .eachOwn:
            Text("cada uno")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(Theme.Color.muted)
        case .jointMandatory:
            HStack(spacing: 4) {
                Text("👥")
                    .font(.system(size: 11))
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.accentText)
            }
        case .rest:
            EmptyView()
        }
    }

    private var accessibilityLabel: String {
        var parts = [day.dayLabel, day.sessionTitle ?? "Descanso"]
        if let d = day.detail, !d.isEmpty { parts.append(d) }
        switch day.togetherness {
        case .bothDone: parts.append("completado por los dos")
        case .optionalTogether: parts.append("opcional juntos")
        case .eachOwn: parts.append("cada uno por su cuenta")
        case .jointMandatory: parts.append("simulación conjunta obligatoria")
        case .rest: break
        }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Shared-analytics banner

/// The "Compartís analíticas y resultados · Ver ›" banner (partner-blue chart
/// glyph) that links to the shared-analytics screen.
private struct DoblesSharedBanner: View {
    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.partner)
            Text("Compartís analíticas y resultados de cada sesión")
                .font(.system(size: 12))
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 2) {
                Text("Ver")
                    .font(.system(size: 12, weight: .bold))
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold))
            }
            .foregroundStyle(Theme.Color.partner)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .background(Theme.Color.partner.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.partner.opacity(0.30), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Compartís analíticas y resultados. Toca para ver.")
        .accessibilityAddTraits(.isButton)
    }
}

/// A tappable link row (icon + title + subtitle + chevron) used by the hub to
/// reach the train-together and simulation screens.
private struct DoblesLinkRow: View {
    let symbol: String
    let tint: Color
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.Color.foreground)
                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.faint)
            }
            Spacer(minLength: Theme.Spacing.s)
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.faint)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(subtitle)")
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Shared Dobles atoms (used across the four Dobles screens)

/// Overlapping avatar pair — self (orange ring) over partner (blue ring) — the
/// header marker from the handoff. SELF reads orange, PARTNER reads blue.
struct DoblesAvatarPair: View {
    let selfInitials: String
    let partnerInitials: String
    var size: CGFloat = 34

    var body: some View {
        HStack(spacing: -10) {
            DoblesAthleteAvatar(initials: selfInitials, color: Theme.Color.accent, size: size)
            DoblesAthleteAvatar(initials: partnerInitials, color: Theme.Color.partner, size: size)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Tú y tu compañero")
    }
}

/// A single athlete avatar: initials over the chip surface, ringed in the
/// athlete's identity color (orange = self, blue = partner).
struct DoblesAthleteAvatar: View {
    let initials: String
    let color: Color
    var size: CGFloat = 34

    var body: some View {
        ZStack {
            Circle().fill(Theme.Color.surfaceElevated)
            Text(initials)
                .font(.system(size: size * 0.36, weight: .heavy))
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(width: size, height: size)
        .overlay(Circle().stroke(color, lineWidth: 2))
        .accessibilityHidden(true)
    }
}

/// A two-tone share bar: the self share (orange) and the partner share (blue),
/// summing to the full width. `selfShare` 0…1; partner = 1 − selfShare.
/// Decorative — the caller labels the row.
struct DoblesSplitBar: View {
    let selfShare: Double
    var height: CGFloat = 6

    private var clamped: Double { max(0, min(1, selfShare)) }

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                Rectangle()
                    .fill(Theme.Color.accent)
                    .frame(width: geo.size.width * CGFloat(clamped))
                Rectangle()
                    .fill(Theme.Color.partner)
                    .frame(width: geo.size.width * CGFloat(1 - clamped))
            }
        }
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: height / 2, style: .continuous))
        .accessibilityHidden(true)
    }
}
