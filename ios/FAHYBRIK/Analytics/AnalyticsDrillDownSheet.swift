import SwiftUI

// DRILL-DOWN sheet — the other half of the design pattern: every aggregate opens
// its REAL source rows. Presented when the athlete taps a provenance chip, a
// metric row or a zone; fetches the exact sessions that produced the number
// (date / pace / distance / HR / time per row), with an honest empty state and a
// footer naming the real source table. "Ningún número sin su lista."

/// Identifiable wrapper so a DrillRef can drive `.sheet(item:)`. Carries the
/// period so the drill-down re-runs the SAME window as the card.
struct DrillTarget: Identifiable {
    let id = UUID()
    let ref: DrillRef
    let period: AnalyticsPeriod
}

struct AnalyticsDrillDownSheet: View {
    let target: DrillTarget
    let bearer: String?

    @Environment(\.dismiss) private var dismiss

    @State private var result: DrillDownResult? = nil
    @State private var isLoading = true
    @State private var failed = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                content
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                        .foregroundStyle(Theme.Color.accentText)
                }
            }
        }
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if let result {
            loaded(result)
        } else if isLoading {
            VStack(spacing: 12) {
                ProgressView().tint(Theme.Color.accent)
                Text("Cargando sesiones…")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            }
        } else {
            // No bearer / request failed / 404 → honest empty, never a fake list.
            VStack(spacing: 8) {
                Image(systemName: "tray")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
                Text("Sin sesiones para este desglose")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
            }
            .padding(.horizontal, Theme.Spacing.xl)
        }
    }

    private func loaded(_ r: DrillDownResult) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // Header
                VStack(alignment: .leading, spacing: 3) {
                    Text(r.title_es)
                        .scaledFont(20, weight: .heavy, relativeTo: .title3, italic: true)
                        .foregroundStyle(Theme.Color.foreground)
                    if let sub = r.subtitle_es, !sub.isEmpty {
                        Text(sub)
                            .scaledFont(11.5, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.muted)
                    }
                }

                // Summary tiles
                if !r.summary.isEmpty {
                    HStack(spacing: 7) {
                        ForEach(r.summary) { s in
                            VStack(spacing: 3) {
                                Text(s.value)
                                    .font(.system(size: 16, weight: .heavy).italic().monospacedDigit())
                                    .foregroundStyle(s.accent ? Theme.Color.accentText : Theme.Color.foreground)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.6)
                                Text(s.label)
                                    .font(.system(size: 8, weight: .heavy))
                                    .tracking(0.4)
                                    .textCase(.uppercase)
                                    .foregroundStyle(Theme.Color.faint)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .padding(.horizontal, 6)
                            .background(Theme.Color.surfaceElevated)
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                                    .stroke(Theme.Color.hairline, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                        }
                    }
                }

                // Sessions
                if r.sessions.isEmpty {
                    Text("Sin sesiones en este periodo.")
                        .scaledFont(12.5, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                        .padding(.top, 4)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(r.sessions.enumerated()), id: \.element.id) { idx, s in
                            if idx > 0 { Hairline() }
                            SessionRow(session: s)
                        }
                    }
                }

                // Footer — the real source table
                Text("\(r.source_table) · \(r.period.label_es)")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.Color.faint)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 6)
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.xxl)
        }
    }

    private func load() async {
        isLoading = true
        let r = await AnalyticsService.fetchDrillDown(target.ref, period: target.period, bearer: bearer)
        result = r
        failed = (r == nil)
        isLoading = false
    }
}

// MARK: - One source-session row (date · title/detail · value)

private struct SessionRow: View {
    let session: SourceSession

    var body: some View {
        HStack(alignment: .center, spacing: 11) {
            // Date stamp (day number + month).
            VStack(spacing: 1) {
                Text(dayNumber)
                    .font(.system(size: 15, weight: .heavy).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                Text(monthLabel)
                    .font(.system(size: 8, weight: .heavy))
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(Theme.Color.faint)
            }
            .frame(width: 34)

            VStack(alignment: .leading, spacing: 2) {
                Text(session.title_es)
                    .scaledFont(12.5, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                if let detail = session.detail_es, !detail.isEmpty {
                    Text(detail)
                        .scaledFont(10, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 1) {
                if let value = session.value {
                    Text(value)
                        .font(.system(size: 14, weight: .heavy).italic().monospacedDigit())
                        .foregroundStyle(Theme.Color.accentText)
                        .lineLimit(1)
                }
                if let label = session.value_label, !label.isEmpty {
                    Text(label)
                        .scaledFont(9, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                }
            }
        }
        .padding(.vertical, 11)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(axLabel)
    }

    // Date parsing → "24" + "jun". Undated import → "—".
    private var dayNumber: String {
        guard let d = session.date, d.count >= 10 else { return "—" }
        return String(Int(d.dropFirst(8).prefix(2)) ?? 0)
    }
    private var monthLabel: String {
        guard let d = session.date, d.count >= 7,
              let m = Int(d.dropFirst(5).prefix(2)), (1...12).contains(m) else { return "" }
        return Self.monthsEs[m - 1]
    }
    private static let monthsEs = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

    private var axLabel: String {
        var parts: [String] = []
        if !dayNumber.isEmpty && dayNumber != "—" { parts.append("\(dayNumber) \(monthLabel)") }
        parts.append(session.title_es)
        if let v = session.value { parts.append(v) }
        return parts.joined(separator: ", ")
    }
}
