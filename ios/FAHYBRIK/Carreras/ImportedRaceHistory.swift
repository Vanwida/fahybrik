import SwiftUI

// Rich race history for the Carreras hub — the doubles-aware history list that
// replaces the leaner race-context list whenever the athlete has imported their
// full hyresult history. Renders ALL races (singles + doubles/relay), most
// recent first.
//
// Singles render plain (event · date · division → total time), exactly like the
// legacy list. Doubles/relay add a "Dobles"/"Relay" tag + the partner line ("con
// Eric Vaqué"), and when expanded their splits are explicitly framed as
// TEAM-level (is_team_result) so a shared station time is never read as the
// athlete's own. Composes Theme tokens + Atoms; brand accent is orange-as-text.

struct ImportedRaceHistorySection: View {
    let races: [ImportedRace]

    /// Most recent first; a null/unparseable date sinks to the bottom.
    private var ordered: [ImportedRace] {
        races.sorted { $0.sortDate > $1.sortDate }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "HISTORIAL · TODAS TUS CARRERAS")
            VStack(spacing: 8) {
                ForEach(ordered) { race in
                    ImportedRaceCard(race: race)
                }
            }
        }
    }
}

// MARK: - One race card (expandable)

private struct ImportedRaceCard: View {
    let race: ImportedRace
    @State private var expanded = false

    /// Only races that actually carry split data are expandable.
    private var hasSplits: Bool {
        race.run_splits.contains(where: { $0 > 0 })
            || race.station_splits.contains(where: { ($0.seconds ?? 0) > 0 })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            if expanded && hasSplits {
                Hairline().padding(.vertical, 12)
                splits
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Theme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    // MARK: Header (tap-to-expand when there are splits)

    private var header: some View {
        Button {
            guard hasSplits else { return }
            Haptics.light()
            withAnimation(.easeInOut(duration: 0.2)) { expanded.toggle() }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(race.name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    tagRow
                    if let partners = race.partnersLabel {
                        Text(partners)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Theme.Color.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 4) {
                    MonoText(text: race.totalTimeText, size: 13, weight: .bold)
                    if hasSplits {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Theme.Color.faint)
                            .rotationEffect(.degrees(expanded ? 180 : 0))
                            .accessibilityHidden(true)
                    }
                }
            }
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!hasSplits)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint(hasSplits ? "Toca para ver los splits" : "")
    }

    // Date · division + format/event chips on one wrapping-ish row.
    private var tagRow: some View {
        HStack(spacing: 6) {
            Text("\(race.dateText) · \(race.divisionLabel)")
                .font(.system(size: 11))
                .foregroundStyle(Theme.Color.faint)
            if let tag = race.formatTag {
                TagChip(text: tag, tint: .accent)
            }
            if let event = race.eventTypeTag {
                TagChip(text: event, tint: .neutral)
            }
        }
    }

    private var accessibilityLabel: String {
        var parts: [String] = [race.name, race.dateText, race.divisionLabel]
        if let tag = race.formatTag { parts.append(tag) }
        if let partners = race.partnersLabel { parts.append(partners) }
        parts.append(race.totalTimeText)
        return parts.joined(separator: ", ")
    }

    // MARK: Expanded splits

    private var splits: some View {
        VStack(alignment: .leading, spacing: 12) {
            if race.is_team_result {
                teamDisclosure
            }
            if race.run_splits.contains(where: { $0 > 0 }) {
                runSplits
            }
            if !workStations.isEmpty {
                stationSplits
            }
            footerTimes
        }
    }

    // Honest banner: for doubles/relay the splits are the TEAM's, not the
    // athlete's individual performance.
    private var teamDisclosure: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "person.2.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Color.info)
            Text("Splits del equipo — tiempos compartidos, no individuales.")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.infoTint)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.info.opacity(0.30), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var runSplits: some View {
        VStack(alignment: .leading, spacing: 7) {
            LabelText(text: race.is_team_result ? "Carrera · equipo" : "Carrera · por km", size: 10)
            // Wrap the run laps into rows of four so eight laps read cleanly at
            // 390pt without a horizontal scroll.
            let laps = Array(race.run_splits.enumerated())
            let rows = stride(from: 0, to: laps.count, by: 4).map {
                Array(laps[$0..<min($0 + 4, laps.count)])
            }
            VStack(spacing: 6) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    HStack(spacing: 6) {
                        ForEach(row, id: \.offset) { idx, secs in
                            splitCell(label: "k\(idx + 1)", value: ImportedRace.splitText(secs))
                        }
                        if row.count < 4 {
                            ForEach(0..<(4 - row.count), id: \.self) { _ in
                                Spacer(minLength: 0)
                            }
                        }
                    }
                }
            }
        }
    }

    private var stationSplits: some View {
        VStack(alignment: .leading, spacing: 7) {
            LabelText(text: race.is_team_result ? "Estaciones · equipo" : "Estaciones", size: 10)
            VStack(spacing: 6) {
                ForEach(workStations) { split in
                    HStack(spacing: 8) {
                        Text(HyroxStation.labels[split.index] ?? "Estación \(split.index)")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.muted)
                        Spacer(minLength: 8)
                        MonoText(text: ImportedRace.splitText(split.seconds), size: 11, weight: .medium)
                    }
                }
            }
        }
    }

    // Run total + RoxZone summary, when present.
    private var footerTimes: some View {
        HStack(spacing: Theme.Spacing.l) {
            if let run = race.runTotalText {
                summaryTime(label: "Carrera", value: run)
            }
            if let rox = race.roxzoneText {
                summaryTime(label: "RoxZone", value: rox, accent: true)
            }
        }
    }

    // MARK: Pieces

    /// Station splits limited to the eight WORK stations (skip the run indices,
    /// already shown as km laps) and to those with a real time.
    private var workStations: [ImportedStationSplit] {
        race.station_splits
            .filter { !HyroxStation.runIndices.contains($0.index) }
            .filter { ($0.seconds ?? 0) > 0 }
            .sorted { $0.index < $1.index }
    }

    private func splitCell(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            LabelText(text: label, color: Theme.Color.faint, size: 9)
            MonoText(text: value, size: 12, weight: .medium)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(Theme.Color.surfaceSunken)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(value)")
    }

    private func summaryTime(label: String, value: String, accent: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            LabelText(text: label, size: 10)
            MonoText(
                text: value,
                size: 13,
                weight: .bold,
                color: accent ? Theme.Color.warning : Theme.Color.foreground
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(value)")
    }
}

// MARK: - Tag chip
//
// Small tinted pill for format/event tags. `accent` reads as the brand orange
// (orange-as-text on light), `neutral` as the grey "no signal" hue.

private struct TagChip: View {
    enum Tint { case accent, neutral }
    let text: String
    var tint: Tint = .accent

    private var fg: Color {
        switch tint {
        case .accent:  return Theme.Color.accentText
        case .neutral: return Theme.Color.neutral
        }
    }

    private var bg: Color {
        switch tint {
        case .accent:  return Theme.Color.accent.opacity(0.10)
        case .neutral: return Theme.Color.neutralTint
        }
    }

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .tracking(0.4)
            .textCase(.uppercase)
            .foregroundStyle(fg)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(bg)
            .clipShape(Capsule())
    }
}
