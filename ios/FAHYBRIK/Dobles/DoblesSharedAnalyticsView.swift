import SwiftUI

// Dobles · analíticas compartidas (screen 2). Individual head-to-head bests +
// the joint Doubles mark, "who contributes what" split bars, and a friendly
// weekly comparison ("pique sano").
//
// Faithful to design_handoff_fhp/App Atleta - Dobles.dc.html screen 2, mapped to
// our system: SELF = brand orange (Theme.Color.accent), PARTNER = blue
// (Theme.Color.partner). The joint Doubles mark — a shared achievement, not an
// athlete — reads in semantic success green. Never red-as-brand.
//
// Composes the shared Dobles atoms defined in DoblesPlanView.swift
// (DoblesAthleteAvatar, DoblesSplitBar).
//
// BACKEND GAP: DoblesService.fetchSharedAnalytics returns nil (no endpoint).
// With no data we show an honest empty state — we NEVER fabricate either
// athlete's marks. The comparison renders only once both athletes' results land.
struct DoblesSharedAnalyticsView: View {
    var bearer: String? = nil

    @State private var analytics: DoblesSharedAnalytics? = nil
    @State private var partner: PartnerInfo? = nil
    @State private var loading = true
    @State private var appear = false

    private var effectiveBearer: String? {
        bearer
    }

    private var partnerName: String {
        analytics?.partnerName ?? partner?.firstName ?? "tu compañero"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                HStack(spacing: Theme.Spacing.m) {
                    Text("Vosotros dos")
                        .scaledFont(24, weight: .heavy, relativeTo: .title2, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer()
                }
                .padding(.top, Theme.Spacing.m)
                .staggerReveal(appear, index: 0)

                if loading {
                    ProgressView()
                        .tint(Theme.Color.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.top, Theme.Spacing.xxl)
                } else if let analytics {
                    content(analytics)
                } else if partner == nil {
                    DoblesNoPartnerState(
                        message: "El cara a cara necesita a dos: con un compañero conectado veréis vuestras marcas, la conjunta y quién aporta qué.",
                        bearer: effectiveBearer,
                        onInvited: { Task { await reload() } }
                    )
                    .padding(.top, Theme.Spacing.xl)
                    .staggerReveal(appear, index: 1)
                } else {
                    RedesignEmptyState(
                        symbol: "chart.bar.xaxis",
                        title: "Sin analíticas compartidas",
                        message: "Cuando tú y tu compañero registréis marcas veréis aquí el cara a cara, vuestra marca conjunta y quién aporta qué.",
                        exit: .explained(note: "Se llena solo con lo que entrenéis los dos.")
                    )
                    .padding(.top, Theme.Spacing.xl)
                    .staggerReveal(appear, index: 1)
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .instrumentCanvas()
        .navigationTitle("Analíticas")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: effectiveBearer) { await reload() }
    }

    /// Partner link + the shared analytics. Re-run after an invitation so a
    /// freshly paired athlete stops seeing the unpaired state.
    private func reload() async {
        loading = true
        if let bearer = effectiveBearer {
            partner = try? await PartnerService.fetchPartner(bearer: bearer)
        }
        analytics = await DoblesService.fetchSharedAnalytics(bearer: effectiveBearer)
        loading = false
        withAnimation { appear = true }
    }

    // MARK: - Content

    @ViewBuilder
    private func content(_ a: DoblesSharedAnalytics) -> some View {
        // Head-to-head best marks.
        if a.bestSelf != nil || a.bestPartner != nil {
            HStack(spacing: Theme.Spacing.m) {
                bestCard(name: "Yo", value: a.bestSelf, color: Theme.Color.accent, initials: "Yo")
                bestCard(name: partnerName, value: a.bestPartner, color: Theme.Color.partner, initials: partner?.initials ?? "·")
            }
            .staggerReveal(appear, index: 1)
        }

        // Joint Doubles mark — a shared achievement, success green.
        if let mark = a.doublesMark {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                    LabelText(text: "Vuestra marca Doubles")
                    MonoText(text: mark, size: 22, weight: .bold, color: Theme.Color.ok)
                }
                Spacer()
                if let delta = a.doublesDelta {
                    HStack(spacing: 3) {
                        Image(systemName: "arrowtriangle.up.fill")
                            .font(.system(size: 9))
                        Text(delta)
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundStyle(Theme.Color.ok)
                }
            }
            .padding(Theme.Spacing.l)
            .brandSurface()
            .staggerReveal(appear, index: 2)
        }

        // Per-station head-to-head — each athlete's best race, station by station.
        // Self = orange (accent), partner = blue (partner); faster side flagged.
        if !a.headToHead.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                HStack(spacing: 6) {
                    Text("Cara a cara")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Theme.Color.foreground)
                    Text("· por estación")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Color.faint)
                }
                headToHeadTable(a.headToHead)
            }
            .staggerReveal(appear, index: 3)
        }

        // Who contributes what — split bars.
        if !a.contributions.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                Text("Quién aporta qué")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.Color.foreground)
                VStack(spacing: Theme.Spacing.s) {
                    ForEach(a.contributions) { c in
                        contributionRow(c)
                    }
                }
                if let summary = a.contributionSummary {
                    Text(summary)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .staggerReveal(appear, index: 4)
        }

        // Weekly comparison — friendly rivalry.
        if !a.weekly.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                HStack(spacing: 6) {
                    Text("Esta semana")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Theme.Color.foreground)
                    Text("· pique sano")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Color.faint)
                }
                weeklyTable(a.weekly)
            }
            .staggerReveal(appear, index: 5)
        }
    }

    // MARK: - Head-to-head per-station table

    // Parse a pre-formatted time string ("M:SS" / "H:MM:SS") into seconds, so we
    // can flag the faster side. Pure display helper — the backend stays the
    // source of truth for the value; we only compare for the chevron.
    private func seconds(from value: String?) -> Int? {
        guard let value, !value.isEmpty else { return nil }
        let parts = value.split(separator: ":").map { Int($0) }
        guard parts.allSatisfy({ $0 != nil }) else { return nil }
        let nums = parts.compactMap { $0 }
        switch nums.count {
        case 2: return nums[0] * 60 + nums[1]
        case 3: return nums[0] * 3600 + nums[1] * 60 + nums[2]
        default: return nil
        }
    }

    private func headToHeadTable(_ rows: [DoblesH2HRow]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                if idx > 0 { Hairline() }
                headToHeadRow(row)
            }
        }
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    @ViewBuilder
    private func headToHeadRow(_ row: DoblesH2HRow) -> some View {
        let selfSec = seconds(from: row.selfValue)
        let partnerSec = seconds(from: row.partnerValue)
        // Lower time = faster. Only flag when both sides have a comparable time.
        let selfFaster: Bool? = {
            guard let s = selfSec, let p = partnerSec, s != p else { return nil }
            return s < p
        }()

        HStack(spacing: Theme.Spacing.s) {
            Text(row.metric)
                .font(.system(size: 12))
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineLimit(1)

            HStack(spacing: 3) {
                MonoText(text: row.selfValue ?? "—", size: 13, weight: .bold,
                         color: row.selfValue == nil ? Theme.Color.faint : Theme.Color.accentText)
                if selfFaster == true {
                    Image(systemName: "arrowtriangle.up.fill")
                        .font(.system(size: 7))
                        .foregroundStyle(Theme.Color.accentText)
                }
            }
            .frame(width: 64, alignment: .trailing)

            Text("·")
                .foregroundStyle(Theme.Color.faint)

            HStack(spacing: 3) {
                MonoText(text: row.partnerValue ?? "—", size: 13, weight: .bold,
                         color: row.partnerValue == nil ? Theme.Color.faint : Theme.Color.partner)
                if selfFaster == false {
                    Image(systemName: "arrowtriangle.up.fill")
                        .font(.system(size: 7))
                        .foregroundStyle(Theme.Color.partner)
                }
            }
            .frame(width: 64, alignment: .leading)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(headToHeadAccessibility(row, selfFaster: selfFaster))
    }

    private func headToHeadAccessibility(_ row: DoblesH2HRow, selfFaster: Bool?) -> String {
        let base = "\(row.metric): tú \(row.selfValue ?? "sin marca"), \(partnerName) \(row.partnerValue ?? "sin marca")"
        switch selfFaster {
        case .some(true): return base + ". Más rápido tú."
        case .some(false): return base + ". Más rápido \(partnerName)."
        case .none: return base
        }
    }

    // MARK: - Best-mark card

    private func bestCard(name: String, value: String?, color: Color, initials: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 7) {
                DoblesAthleteAvatar(initials: initials, color: color, size: 24)
                Text(name)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
            }
            LabelText(text: "Mejor HYROX", size: 10)
            MonoText(text: value ?? "—", size: 19, weight: .bold,
                     color: value == nil ? Theme.Color.faint : Theme.Color.foreground)
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(color.opacity(0.30), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(name), mejor HYROX \(value ?? "sin marca")")
    }

    // MARK: - Contribution row

    private func contributionRow(_ c: DoblesContribution) -> some View {
        // Within ±8 points of 50/50 reads "parejos"; otherwise the leader's
        // name in their color.
        let selfPct = Int((max(0, min(1, c.selfShare)) * 100).rounded())
        let parity = abs(selfPct - 50) <= 8
        let leaderIsSelf = selfPct >= 50
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(c.group)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.foreground)
                Spacer()
                if parity {
                    Text("parejos")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Color.muted)
                } else {
                    HStack(spacing: 3) {
                        Text(leaderIsSelf ? "Tú" : partnerName)
                        Image(systemName: "arrowtriangle.up.fill")
                            .font(.system(size: 8))
                    }
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(leaderIsSelf ? Theme.Color.accentText : Theme.Color.partner)
                }
            }
            DoblesSplitBar(selfShare: c.selfShare)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 10)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(parity
            ? "\(c.group): parejos"
            : "\(c.group): aporta más \(leaderIsSelf ? "tú" : partnerName)")
    }

    // MARK: - Weekly comparison table

    private func weeklyTable(_ rows: [DoblesH2HRow]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                if idx > 0 { Hairline() }
                HStack(spacing: Theme.Spacing.s) {
                    Text(row.metric)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    MonoText(text: row.selfValue ?? "—", size: 13, weight: .bold, color: Theme.Color.accentText)
                        .frame(width: 54, alignment: .trailing)
                    Text("·")
                        .foregroundStyle(Theme.Color.faint)
                    MonoText(text: row.partnerValue ?? "—", size: 13, weight: .bold, color: Theme.Color.partner)
                        .frame(width: 54, alignment: .leading)
                }
                .padding(.horizontal, 13)
                .padding(.vertical, 11)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.metric): tú \(row.selfValue ?? "—"), \(partnerName) \(row.partnerValue ?? "—")")
            }
        }
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }
}
