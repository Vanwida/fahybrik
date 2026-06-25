import SwiftUI

// Dobles · simulación conjunta (screen 4). The 8-station split strategy between
// the two athletes (per-station share bars), running together, RoxZone relays,
// and the coach's tactical note.
//
// Faithful to design_handoff_fhp/App Atleta - Dobles.dc.html screen 4, mapped to
// our system: SELF = brand orange (Theme.Color.accent), PARTNER = blue
// (Theme.Color.partner). The coach note is a left-accent quote in brand orange;
// the flagged (weak-spot) station carries a danger-tinted border. Never
// red-as-brand.
//
// Composes the shared Dobles atoms from DoblesPlanView.swift (DoblesSplitBar).
//
// BACKEND GAP: DoblesService.fetchSimulation returns nil (no endpoint). With no
// data we show an honest empty state — we NEVER fabricate the station split or
// the coach's note. The strategy renders only once the backend ships it.
struct DoblesSimulationView: View {
    var bearer: String? = nil

    @State private var simulation: DoblesSimulation? = nil
    @State private var partner: PartnerInfo? = nil
    @State private var loading = true
    @State private var appear = false

    private var effectiveBearer: String? {
        bearer ?? UserDefaults.standard.string(forKey: "fahybrik.bearer")
    }

    private var selfName: String { simulation?.selfName ?? "Tú" }
    private var partnerName: String { simulation?.partnerName ?? partner?.firstName ?? "Compañero" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header
                    .staggerReveal(appear, index: 0)

                if loading {
                    ProgressView()
                        .tint(Theme.Color.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.top, Theme.Spacing.xxl)
                } else if let simulation {
                    content(simulation)
                } else {
                    RedesignEmptyState(
                        symbol: "flag.checkered",
                        title: "Sin simulación programada",
                        message: "Cuando tu coach programe una simulación conjunta verás aquí el reparto de las 8 estaciones, los relevos y la nota táctica."
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
        .navigationTitle("Simulación")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: effectiveBearer) {
            loading = true
            if let bearer = effectiveBearer {
                partner = try? await PartnerService.fetchPartner(bearer: bearer)
            }
            simulation = await DoblesService.fetchSimulation(bearer: effectiveBearer)
            loading = false
            withAnimation { appear = true }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(simulation?.title ?? "Simulación Doubles")
                .scaledFont(22, weight: .heavy, relativeTo: .title2, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            if let intro = introLine {
                Text(intro)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// "{day} · la hacéis juntos. {intro}" assembled from the payload.
    private var introLine: String? {
        guard let sim = simulation else { return nil }
        var parts: [String] = []
        if let day = sim.dayLabel, !day.isEmpty {
            parts.append("\(day) · la hacéis juntos.")
        } else {
            parts.append("La hacéis juntos.")
        }
        if let intro = sim.intro, !intro.isEmpty { parts.append(intro) }
        let joined = parts.joined(separator: " ")
        return joined.isEmpty ? nil : joined
    }

    // MARK: - Content

    @ViewBuilder
    private func content(_ sim: DoblesSimulation) -> some View {
        // Legend.
        HStack(spacing: Theme.Spacing.l) {
            // Dot = identity FILL (accent); label = AA-safe TEXT role (accentText).
            legendDot(dotColor: Theme.Color.accent, textColor: Theme.Color.accentText, label: selfName)
            legendDot(dotColor: Theme.Color.partner, textColor: Theme.Color.partner, label: partnerName)
        }
        .staggerReveal(appear, index: 1)

        // Station splits.
        if !sim.stationSplits.isEmpty {
            VStack(spacing: 7) {
                ForEach(sim.stationSplits) { split in
                    stationRow(split)
                }
            }
            .staggerReveal(appear, index: 2)
        } else {
            RedesignEmptyState(
                symbol: "square.split.2x1",
                title: "Sin reparto de estaciones",
                message: "El coach aún no ha definido el reparto de las estaciones."
            )
            .padding(.top, Theme.Spacing.l)
            .staggerReveal(appear, index: 2)
        }

        // Coach tactical note (left-accent quote).
        if let note = sim.coachNote, !note.isEmpty {
            HStack(alignment: .top, spacing: 0) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Pablo")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.Color.accentText)
                    Text(note)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 11)
            .padding(.horizontal, 13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.surface)
            .overlay(alignment: .leading) {
                Rectangle().fill(Theme.Color.accent).frame(width: 3)
            }
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Nota del coach Pablo: \(note)")
            .staggerReveal(appear, index: 3)
        }

        // Start CTA.
        ExpertPrimaryButton(title: "▶ Empezar simulación juntos", height: 52) {
            // BACKEND GAP: starting a joint simulation (live, both athletes
            // against the shared station plan) is not wired — no start endpoint.
        }
        .staggerReveal(appear, index: 4)
    }

    // MARK: - Pieces

    private func legendDot(dotColor: Color, textColor: Color, label: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(dotColor).frame(width: 8, height: 8)
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(textColor)
                .lineLimit(1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }

    private func stationRow(_ split: DoblesStationSplit) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(split.station)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.foreground)
                if let detail = split.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Theme.Color.faint)
                }
                if split.flagged {
                    Image(systemName: "flag.fill")
                        .font(.system(size: 9))
                        .foregroundStyle(Theme.Color.danger)
                        .accessibilityLabel("punto débil")
                }
                Spacer(minLength: Theme.Spacing.s)
                if let note = split.splitNote, !note.isEmpty {
                    Text(note)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(splitNoteColor(split.selfShare))
                        .lineLimit(1)
                }
            }
            DoblesSplitBar(selfShare: split.selfShare)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(split.flagged ? Theme.Color.danger.opacity(0.45) : Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(stationAccessibility(split))
    }

    /// The split note color follows who carries the larger share — orange when
    /// self-led, blue when partner-led, muted when an even alternation. Rendered
    /// as TEXT, so self uses accentText (AA-safe orange on a white canvas).
    private func splitNoteColor(_ selfShare: Double) -> Color {
        let pct = Int((max(0, min(1, selfShare)) * 100).rounded())
        if abs(pct - 50) <= 8 { return Theme.Color.muted }
        return pct > 50 ? Theme.Color.accentText : Theme.Color.partner
    }

    private func stationAccessibility(_ split: DoblesStationSplit) -> String {
        let selfPct = Int((max(0, min(1, split.selfShare)) * 100).rounded())
        var label = split.station
        if let d = split.detail, !d.isEmpty { label += " \(d)" }
        if let n = split.splitNote, !n.isEmpty {
            label += ", \(n)"
        } else {
            label += ", \(selfName) \(selfPct) por ciento, \(partnerName) \(100 - selfPct) por ciento"
        }
        if split.flagged { label += ", punto débil" }
        return label
    }
}
