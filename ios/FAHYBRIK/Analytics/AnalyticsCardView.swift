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

    /// Las filas QUE TRAEN CIFRA. Una fila sin valor no es una fila a medias: es un
    /// hueco, y un hueco no se pinta (§7). El backend las manda igualmente (la
    /// cadencia del remo cuando el monitor no la reporta, la carga aguda sin reloj),
    /// así que el filtro vive aquí y alimenta también a `hasContent`: si al quitarlas
    /// no queda nada, la tarjeta cae al estado vacío, que sí dice qué falta.
    private var filledRows: [CardRow] { card.rows.filter { $0.value != nil } }

    /// El bloque principal existe si trae número O si trae su cifra de al lado (el
    /// VDOT sigue siendo real aunque falte el umbral). Sin ninguno de los dos no hay
    /// bloque: una unidad suelta («/km · Z4») no es un dato.
    private var primary: CardPrimary? {
        guard let p = card.primary, p.value != nil || p.side != nil else { return nil }
        return p
    }

    /// La tarjeta declara un hueco cuando su número principal no existe. Entonces la
    /// nota del backend es LA frase de la tarjeta (dice qué acto lo llena), y se
    /// pinta aunque haya explicación: sin ella solo quedaría el título.
    private var declaresGap: Bool { card.primary != nil && card.primary?.value == nil }

    private var hasContent: Bool {
        primary != nil || !filledRows.isEmpty || !card.series.isEmpty || !card.zones.isEmpty
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
                if let primary = primary { PrimaryBlock(primary: primary) }
                if !card.series.isEmpty { seriesChart }
                if !filledRows.isEmpty { rowsBlock }
                if !card.zones.isEmpty { zonesBlock }
                if let meaning = card.meaning_es, !meaning.isEmpty { MeaningNote(text: meaning) }
                // LA NOTA SE PINTA SIEMPRE QUE EXISTA, y antes no.
                //
                // La condición que había —«solo si no hay significado, o si el
                // primario es nulo»— daba por hecho que significado y nota dicen lo
                // mismo, y **no lo dicen**: el significado explica QUÉ es la cifra;
                // la nota explica POR QUÉ está a medias y qué la llenaría. Con las
                // dos presentes se tiraba la segunda, así que el atleta veía guiones
                // sin motivo **teniendo el servidor el motivo escrito**.
                //
                // Pasaba en cuatro tarjetas reales: los splits de ergo con datos
                // parciales, la tendencia y la potencia de ergo con una sola sesión,
                // y la adherencia de carga sin pares. Es lo contrario de la
                // disciplina de esta app: sin cobertura se dice por qué.
                //
                // El PESO sí sigue dependiendo del papel: cuando la nota declara el
                // hueco es LA frase de la tarjeta y va en cuerpo; como pie de
                // procedencia se queda al fondo, pequeña.
                if let note = card.availability_note, !note.isEmpty {
                    // Cuando la nota explica el hueco habla con la misma voz que el
                    // estado vacío; como pie de procedencia, se queda al fondo.
                    Text(note)
                        .scaledFont(declaresGap ? 12 : 10, relativeTo: declaresGap ? .caption : .caption2)
                        .foregroundStyle(declaresGap ? Theme.Color.muted : Theme.Color.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let drill = card.drill { ProvenanceChip(drill: drill) { onDrill(drill) } }
            }
        }
    }

    // MARK: - Series chart (line for trends/progressions, bars for volume)

    @ViewBuilder
    private var seriesChart: some View {
        switch card.chartKind {
        case .line:
            LineSeriesChart(points: card.series, axis: card.series_axis, axLabel: chartAxLabel)
        case .bars:
            BarSeriesChart(points: card.series, axLabel: chartAxLabel)
        }
    }

    /// "Tendencia SkiErg, último valor 1:52 por 500 metros" — the card's own copy
    /// already spells the unit, so we surface the title + the latest point value.
    private var chartAxLabel: String {
        if let last = card.series.last?.display {
            return "\(card.title_es), último valor \(last)"
        }
        return card.title_es
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
            ForEach(Array(filledRows.enumerated()), id: \.element.id) { idx, row in
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
                        .scaledFont(12, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text("Aún no hay datos.")
                        .scaledFont(12, relativeTo: .footnote)
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
            // Sin cifra no se pinta ni la cifra ni su unidad: «/km · Z4» a solas no
            // es un dato, es el hueco disfrazado. Lo que falta lo cuenta la nota de
            // la tarjeta. La cifra de al lado sí sobrevive: es una medida real.
            if let value = primary.value {
                Text(value)
                    .font(.system(size: 38, weight: .heavy).italic().monospacedDigit())
                    .foregroundStyle(Theme.Color.accentText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if let unit = primary.unit, !unit.isEmpty {
                    Text(unit)
                        .scaledFont(13, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                }
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
        if let v = primary.value {
            parts.append(v)
            // La unidad se lee con su cifra o no se lee: sola no dice nada.
            if let u = primary.unit { parts.append(u) }
        }
        if let s = primary.side { parts.append("\(s.label) \(s.value)") }
        return parts.joined(separator: " ")
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
                    .scaledFont(12, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                if let sub = row.sub, !sub.isEmpty {
                    Text(sub)
                        .scaledFont(10, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            // Solo llegan aquí las filas con cifra: `filledRows` deja fuera los
            // huecos, así que no hay caso «sin valor» que pintar.
            if let value = row.value {
                Text(value)
                    .font(.system(size: 16, weight: .heavy).italic().monospacedDigit())
                    .foregroundStyle(row.accent ? Theme.Color.accentText : Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
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
                .scaledFont(10, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
            Spacer(minLength: 8)
            if let value = zone.value {
                Text(value)
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
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
            // Stacked share bar — 2px gaps between segments so the zones read as
            // distinct bands, not one fused block. The available width is reduced
            // by the total gap so the segments still sum to the full bar.
            GeometryReader { geo in
                let gap: CGFloat = 2
                let available = max(0, geo.size.width - gap * CGFloat(max(0, zones.count - 1)))
                HStack(spacing: gap) {
                    ForEach(zones) { z in
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(AnalyticsColor.zone(z.color, code: z.code))
                            .frame(width: available * CGFloat((z.pct ?? 0) / 100))
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
            // Label BELOW its data: the km and the share are why this row exists.
            // It used to be the other way round — the zone name at 11pt in full
            // foreground next to its own kilometres at 10pt faint.
            Text(z.label)
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
            Spacer(minLength: 8)
            if let value = z.value {
                Text(value)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
            }
            if let pct = z.pct {
                Text("\(Int(pct))%")
                    .font(.system(size: 13, weight: .heavy, design: .monospaced))
                    .foregroundStyle(Theme.Color.foreground)
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
