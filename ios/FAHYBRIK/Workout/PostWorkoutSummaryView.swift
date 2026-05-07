import SwiftUI

struct PostWorkoutSummaryView: View {
    let session: WorkoutSession
    let onSave: () -> Void

    @State private var rpe: Int = 7
    @State private var notes: String = ""

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                    headline
                    zonesSection
                    hrSection
                    segmentSection
                    rpeSection
                    notesField
                    PrimaryButton(title: "Guardar", action: onSave)
                        .padding(.top, Theme.Spacing.l)
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.vertical, Theme.Spacing.l)
            }
        }
    }

    private var headline: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("✓").foregroundStyle(Theme.Color.ok)
                    .font(Theme.Typography.headlineL)
                Text("Hecho · \(WorkoutSession.formatElapsed(session.elapsedSeconds))")
                    .font(Theme.Typography.headlineL)
                    .foregroundStyle(Theme.Color.foreground)
            }
            Text(session.plan.name)
                .font(Theme.Typography.body)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    // MARK: - Zone distribution

    private var totalZoneSeconds: Double {
        session.laps.reduce(into: 0) { acc, lap in
            acc += lap.zoneSecondsByZone.values.reduce(0, +)
        }
    }

    private var zonesSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            section("Zonas")
            VStack(spacing: 4) {
                ForEach(HRZone.allCases, id: \.self) { zone in
                    zoneRow(zone)
                }
            }
        }
    }

    private func zoneRow(_ zone: HRZone) -> some View {
        let secs = session.laps.reduce(into: 0.0) { $0 += $1.zoneSecondsByZone[zone.rawValue] ?? 0 }
        let pct = totalZoneSeconds > 0 ? secs / totalZoneSeconds : 0
        return HStack(spacing: Theme.Spacing.m) {
            Text(zone.label)
                .font(Theme.Typography.dataLabel)
                .foregroundStyle(zone.color)
                .frame(width: 28, alignment: .leading)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.Color.surface)
                    Capsule().fill(zone.color.opacity(0.7))
                        .frame(width: max(2, geo.size.width * CGFloat(pct)))
                }
            }
            .frame(height: 8)

            Text(String(format: "%02d%%", Int((pct * 100).rounded())))
                .font(Theme.Typography.dataLabel.monospacedDigit())
                .foregroundStyle(Theme.Color.muted)
                .frame(width: 40, alignment: .trailing)
            Text(WorkoutSession.formatElapsed(secs))
                .font(Theme.Typography.dataLabel.monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: 60, alignment: .trailing)
        }
    }

    private var hrSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            section("HR")
            let avg = session.laps.compactMap { $0.avgHRBpm }
            let max = session.laps.compactMap { $0.maxHRBpm }.max()
            let avgVal = avg.isEmpty ? nil : avg.reduce(0, +) / avg.count
            HStack(spacing: Theme.Spacing.l) {
                kv("Avg", avgVal.map { "\($0)" } ?? "—")
                kv("Max", max.map { "\($0)" } ?? "—")
                kv("Decoupling", "—")
                kv("Recovery 60s", "—")
            }
        }
    }

    private var segmentSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            section("Por segmento")
            VStack(spacing: 1) {
                ForEach(session.laps) { lap in
                    if let seg = session.plan.segments.first(where: { $0.id == lap.segmentId }) {
                        HStack {
                            Text(seg.title)
                                .font(Theme.Typography.body)
                                .foregroundStyle(Theme.Color.foreground)
                            Spacer()
                            Text(WorkoutSession.formatElapsed(lap.durationSeconds))
                                .font(Theme.Typography.dataLabel.monospacedDigit())
                                .foregroundStyle(Theme.Color.muted)
                        }
                        .padding(Theme.Spacing.m)
                        .background(Theme.Color.surface)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
    }

    private var rpeSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            section("¿Cómo lo sentiste?")
            HStack(spacing: 6) {
                ForEach(1...10, id: \.self) { i in
                    Button(action: { rpe = i; Haptics.light() }) {
                        Text("\(i)")
                            .font(Theme.Typography.bodyEmph.monospacedDigit())
                            .foregroundStyle(rpe == i ? Color.white : Theme.Color.foreground)
                            .frame(width: 30, height: 36)
                            .background(rpe == i ? Theme.Color.accent : Theme.Color.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var notesField: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            section("Notas (opcional)")
            TextField("Notas", text: $notes, axis: .vertical)
                .lineLimit(2...5)
                .padding(Theme.Spacing.m)
                .background(Theme.Color.surface)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                .foregroundStyle(Theme.Color.foreground)
        }
    }

    // MARK: helpers

    private func section(_ s: String) -> some View {
        Text(s)
            .font(Theme.Typography.dataLabel)
            .uppercaseTracked()
            .foregroundStyle(Theme.Color.muted)
    }

    private func kv(_ k: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(k)
                .font(Theme.Typography.dataLabel)
                .uppercaseTracked()
                .foregroundStyle(Theme.Color.muted)
            Text(v)
                .font(Theme.Typography.bodyEmph)
                .foregroundStyle(Theme.Color.foreground)
        }
    }
}
