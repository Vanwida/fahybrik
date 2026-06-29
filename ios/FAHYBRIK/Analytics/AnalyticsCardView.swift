import SwiftUI

// One generic, data-driven card renderer for ALL five analytics sections. The
// backend emits a uniform AnalyticsCard (primary / rows / series / zones /
// meaning / drill + an honesty tag); this view renders whichever pieces are
// present, so the sections never need bespoke layout and can't drift from the
// contract. Two cross-cutting patterns are wired here: the availability TAG on
// every card, and the tappable PROVENANCE chip + tappable rows/zones that open
// the drill-down ("ningún número sin su lista").

struct AnalyticsCardView: View {
    let card: AnalyticsCard
    /// Open the source-session list for a tapped aggregate.
    let onDrill: (DrillRef) -> Void

    private var hasContent: Bool {
        card.primary != nil || !card.rows.isEmpty || !card.series.isEmpty || !card.zones.isEmpty
    }

    var body: some View {
        if !hasContent && card.availability == .gate {
            gateCard
        } else if !hasContent {
            emptyNoteCard
        } else {
            fullCard
        }
    }

    // MARK: - Full card

    private var fullCard: some View {
        CardSurface(padding: 15) {
            VStack(alignment: .leading, spacing: 12) {
                cardLabel
                if let primary = card.primary { PrimaryBlock(primary: primary) }
                if !card.series.isEmpty { SeriesBars(points: card.series) }
                if !card.rows.isEmpty { rowsBlock }
                if !card.zones.isEmpty { zonesBlock }
                if let meaning = card.meaning_es, !meaning.isEmpty { MeaningNote(text: meaning) }
                if let note = card.availability_note, !note.isEmpty, card.meaning_es == nil {
                    Text(note)
                        .scaledFont(10.5, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let drill = card.drill { ProvenanceChip(drill: drill) { onDrill(drill) } }
            }
        }
    }

    // MARK: - Card label row (title + availability tag)

    private var cardLabel: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            LabelText(text: card.title_es, size: 10)
            Spacer(minLength: 8)
            AvailabilityTag(availability: card.availability)
        }
    }

    // MARK: - Rows

    private var rowsBlock: some View {
        VStack(spacing: 0) {
            ForEach(Array(card.rows.enumerated()), id: \.element.id) { idx, row in
                if idx > 0 { Hairline() }
                MetricRow(row: row, onDrill: onDrill)
            }
        }
    }

    // MARK: - Zones (bands list, or distribution when any row carries a pct)

    @ViewBuilder
    private var zonesBlock: some View {
        let isDistribution = card.zones.contains { $0.pct != nil }
        if isDistribution {
            ZoneDistribution(zones: card.zones, onDrill: onDrill)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(card.zones.enumerated()), id: \.element.id) { idx, z in
                    if idx > 0 { Hairline() }
                    ZoneBandRow(zone: z)
                }
            }
        }
    }

    // MARK: - Gate (honest dashed invitation — model doesn't exist yet)

    private var gateCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                        .fill(Theme.Color.accent.opacity(0.14))
                    Image(systemName: "lock.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                .frame(width: 24, height: 24)
                Text(card.title_es)
                    .scaledFont(13, weight: .heavy, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 0)
                AvailabilityTag(availability: card.availability)
            }
            if let note = card.availability_note, !note.isEmpty {
                Text(note)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .strokeBorder(Theme.Color.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(card.title_es). \(card.availability_note ?? "Bloqueado")")
    }

    // MARK: - Empty-note card (honest "more logging / wearable / field" gap)

    private var emptyNoteCard: some View {
        CardSurface(padding: 15) {
            VStack(alignment: .leading, spacing: 8) {
                cardLabel
                if let note = card.availability_note, !note.isEmpty {
                    Text(note)
                        .scaledFont(12.5, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text("Aún no hay datos.")
                        .scaledFont(12.5, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }
}

// MARK: - Availability tag

struct AvailabilityTag: View {
    let availability: Availability
    var body: some View {
        Text(availability.label)
            .font(.system(size: 9, weight: .heavy))
            .tracking(0.3)
            .textCase(.uppercase)
            .foregroundStyle(availability.color)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(availability.color.opacity(0.16))
            .clipShape(Capsule())
            .accessibilityLabel("Estado: \(availability.label)")
    }
}

// MARK: - Primary (hero number + unit + optional side stat)

private struct PrimaryBlock: View {
    let primary: CardPrimary
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 7) {
            if let value = primary.value {
                Text(value)
                    .font(.system(size: 38, weight: .heavy).italic().monospacedDigit())
                    .foregroundStyle(Theme.Color.accentText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            } else {
                Text("—")
                    .font(.system(size: 38, weight: .heavy).italic().monospacedDigit())
                    .foregroundStyle(Theme.Color.faint)
            }
            if let unit = primary.unit, !unit.isEmpty {
                Text(unit)
                    .scaledFont(13, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.muted)
            }
            Spacer(minLength: 8)
            if let side = primary.side {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(side.value)
                        .font(.system(size: 15, weight: .heavy).monospacedDigit())
                        .foregroundStyle(Theme.Color.foreground)
                    LabelText(text: side.label, size: 9)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(primaryAxLabel)
    }

    private var primaryAxLabel: String {
        var parts: [String] = []
        if let v = primary.value { parts.append(v) }
        if let u = primary.unit { parts.append(u) }
        if let s = primary.side { parts.append("\(s.label) \(s.value)") }
        return parts.joined(separator: " ")
    }
}

// MARK: - Series bars (taller = bigger magnitude; current accented)

private struct SeriesBars: View {
    let points: [CardSeriesPoint]
    private let maxHeight: CGFloat = 46

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .bottom, spacing: 5) {
                ForEach(points) { p in
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(p.current ? Theme.Color.accent : Theme.Color.accent.opacity(0.35))
                        .frame(height: max(3, maxHeight * CGFloat(min(1, max(0, p.height)))))
                        .frame(maxWidth: .infinity)
                        .frame(maxHeight: maxHeight, alignment: .bottom)
                }
            }
            .frame(height: maxHeight, alignment: .bottom)
            if let last = points.last, let display = last.display {
                Text(display)
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.Color.faint)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Metric row (label + sub left, value right; tappable when it drills)

private struct MetricRow: View {
    let row: CardRow
    let onDrill: (DrillRef) -> Void

    var body: some View {
        let content = HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.label)
                    .scaledFont(12.5, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                if let sub = row.sub, !sub.isEmpty {
                    Text(sub)
                        .scaledFont(10, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            if let value = row.value {
                Text(value)
                    .font(.system(size: 16, weight: .heavy).italic().monospacedDigit())
                    .foregroundStyle(row.accent ? Theme.Color.accentText : Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            } else {
                Text("—")
                    .font(.system(size: 16, weight: .heavy).italic().monospacedDigit())
                    .foregroundStyle(Theme.Color.faint)
            }
            if row.drill != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .padding(.vertical, 9)
        .contentShape(Rectangle())

        if let drill = row.drill {
            Button { Haptics.light(); onDrill(drill) } label: { content }
                .buttonStyle(PressScaleStyle())
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(axLabel)
                .accessibilityHint("Abre las sesiones")
                .accessibilityAddTraits(.isButton)
        } else {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(axLabel)
        }
    }

    private var axLabel: String {
        "\(row.label), \(row.value ?? "sin dato")"
    }
}

// MARK: - Zone band row (the athlete's pace zones)

private struct ZoneBandRow: View {
    let zone: CardZone
    var body: some View {
        HStack(spacing: 9) {
            Circle()
                .fill(AnalyticsColor.zone(zone.color, code: zone.code))
                .frame(width: 9, height: 9)
            Text(zone.code.uppercased())
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.Color.foreground)
            Text(zone.label)
                .scaledFont(10.5, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
            Spacer(minLength: 8)
            if let value = zone.value {
                Text(value)
                    .font(.system(size: 12.5, weight: .bold, design: .monospaced))
                    .foregroundStyle(Theme.Color.foreground)
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(zone.code), \(zone.label), \(zone.value ?? "")")
    }
}

// MARK: - Zone distribution (stacked share bar + per-zone km + pct rows)

private struct ZoneDistribution: View {
    let zones: [CardZone]
    let onDrill: (DrillRef) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Stacked share bar.
            GeometryReader { geo in
                HStack(spacing: 0) {
                    ForEach(zones) { z in
                        Rectangle()
                            .fill(AnalyticsColor.zone(z.color, code: z.code))
                            .frame(width: geo.size.width * CGFloat((z.pct ?? 0) / 100))
                    }
                }
            }
            .frame(height: 14)
            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
            .accessibilityHidden(true)

            VStack(spacing: 0) {
                ForEach(Array(zones.enumerated()), id: \.element.id) { idx, z in
                    if idx > 0 { Hairline() }
                    zoneRow(z)
                }
            }
        }
    }

    @ViewBuilder
    private func zoneRow(_ z: CardZone) -> some View {
        let content = HStack(spacing: 8) {
            Circle()
                .fill(AnalyticsColor.zone(z.color, code: z.code))
                .frame(width: 8, height: 8)
            Text(z.label)
                .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.foreground)
            Spacer(minLength: 8)
            if let value = z.value {
                Text(value)
                    .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.Color.faint)
            }
            if let pct = z.pct {
                Text("\(Int(pct))%")
                    .font(.system(size: 11.5, weight: .heavy, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(minWidth: 38, alignment: .trailing)
            }
            if z.drill != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .padding(.vertical, 7)
        .contentShape(Rectangle())

        if let drill = z.drill {
            Button { Haptics.light(); onDrill(drill) } label: { content }
                .buttonStyle(PressScaleStyle())
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(z.label), \(z.value ?? ""), \(z.pct.map { "\(Int($0)) por ciento" } ?? "")")
                .accessibilityAddTraits(.isButton)
        } else {
            content.accessibilityElement(children: .ignore)
                .accessibilityLabel("\(z.label), \(z.value ?? ""), \(z.pct.map { "\(Int($0)) por ciento" } ?? "")")
        }
    }
}

// MARK: - Meaning note (the "what this means" callout)

private struct MeaningNote: View {
    let text: String
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "flag.checkered")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
            Text(text)
                .scaledFont(11, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surfaceSunken)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Provenance chip (tappable — "de N carreras ›")

private struct ProvenanceChip: View {
    let drill: DrillRef
    let action: () -> Void

    var body: some View {
        Button { Haptics.light(); action() } label: {
            HStack(spacing: 6) {
                Image(systemName: "list.bullet")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.Color.accentText)
                Text(drill.label_es)
                    .scaledFont(10, weight: .semibold, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.Color.faint)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Theme.Color.surfaceSunken)
            .overlay(Capsule().stroke(Theme.Color.hairline, lineWidth: 1))
            .clipShape(Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Ver fuente: \(drill.label_es)")
        .accessibilityAddTraits(.isButton)
    }
}
