import SwiftUI

// MARK: - #65 · Post-workout premium: PR celebration + shareable card
//
// When the sync response reports one or more running personal records, the
// summary overlays this celebration before closing. The copy is ALWAYS
// unambiguous — it's the athlete's fastest RUN of the distance (or their first
// mark), never a test. The card is deliberately a dark, gold-accented spotlight
// regardless of the app theme (a celebration is a night-coded moment), and it can
// be shared as an image. A share affordance also lives on the summary itself.

// MARK: Share data (pure, testable)
//
// The honest snapshot the share card renders. Built from the finished session
// (plus the RPE and any records) — every field is real or omitted; nothing is
// invented. Pure value type so the render can be smoke-tested without a session.
struct WorkoutShareData: Equatable {
    struct Zone: Equatable { let label: String; let pct: Int }

    let title: String
    let timeText: String
    let paceText: String?        // "4:35 /km" · "1:52 /500m" — nil when unmeasured
    let dominantZone: Zone?      // nil when no zone data
    let rpe: Int?
    let prDistanceLabel: String? // "5 km" — the biggest record; nil when none

    var isPR: Bool { prDistanceLabel != nil }

    /// Build from a finished session. `totalSeconds` is the honest session total
    /// the summary already computed (the live clock, or the hand-entered time);
    /// pace + dominant zone are derived from the measured laps and stay nil when
    /// there is nothing real to show.
    @MainActor
    static func from(
        session: WorkoutSession,
        totalSeconds: Int?,
        rpe: Int?,
        records: [PersonalRecord]
    ) -> WorkoutShareData {
        WorkoutShareData(
            title: session.plan.name,
            timeText: Formato.clock(Double(totalSeconds ?? Int(session.elapsedSeconds.rounded()))),
            paceText: averagePace(from: session.laps),
            dominantZone: dominantZone(from: session.laps),
            rpe: rpe,
            prDistanceLabel: biggestRecord(records)?.kind.distanceLabel
        )
    }

    // Distance-weighted average pace of the dominant discipline: running first
    // (/km), else the erg (/500m). Nil when no measured distance exists.
    private static func averagePace(from laps: [LapRecord]) -> String? {
        func aggregate(_ modalities: Set<String>) -> (dist: Double, time: Double) {
            laps.filter { modalities.contains($0.modality) }
                .reduce(into: (dist: 0.0, time: 0.0)) { acc, lap in
                    if let d = lap.distanceCoveredMeters, d > 0 {
                        acc.dist += d
                        acc.time += lap.durationSeconds
                    }
                }
        }
        let run = aggregate(["run"])
        if run.dist > 0 {
            let secPerKm = run.time / (run.dist / 1000)
            return Formato.ritmo(secPerKm, .porKm)
        }
        let erg = aggregate(["row", "ski", "bike"])
        if erg.dist > 0 {
            let secPer500 = erg.time / (erg.dist / 500)
            return Formato.ritmo(secPer500, .por500m)
        }
        return nil
    }

    // The zone the athlete spent the most time in, as label + percentage of the
    // SESSION — the same reading, and the same base, as the summary's bar, so a
    // share the athlete is about to share to Instagram can't be the one number
    // that was measured against the strap's uptime instead of the workout.
    // Nil when no zone seconds were recorded.
    private static func dominantZone(from laps: [LapRecord]) -> Zone? {
        guard let coverage = ZoneCoverage.read(laps: laps) else { return nil }
        // The remainder is never the "dominant zone": it is the absence of one.
        guard let top = coverage.bands
            .filter({ $0.zone != nil })
            .max(by: { $0.seconds < $1.seconds })
        else { return nil }
        return Zone(label: top.label, pct: top.pct)
    }

    // The longest-distance record (5k > 3k > 1k) — it drives the PR badge.
    private static func biggestRecord(_ records: [PersonalRecord]) -> PersonalRecord? {
        let order: [PRKind] = [.run5k, .run3k, .run1k]
        return order.compactMap { kind in records.first { $0.kind == kind } }.first
    }

}

// MARK: - Gold accents (celebrations only)
//
// Shared by every "record" moment — the run-PR overlay here and the test-record
// overlay (TestRecordCelebrationView) — so the celebration voice stays ONE.
enum CelebrationGold {
    static let bright = Color(red: 0.93, green: 0.79, blue: 0.42)
    static let deep = Color(red: 0.78, green: 0.60, blue: 0.24)
    static var gradient: LinearGradient {
        LinearGradient(colors: [bright, deep], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

// MARK: - Celebration overlay

struct PRCelebrationView: View {
    let records: [PersonalRecord]
    let shareData: WorkoutShareData
    let onDone: () -> Void

    @State private var shareURL: URL? = nil
    @State private var appear = false

    private var isPlural: Bool { records.count > 1 }

    var body: some View {
        ZStack {
            // Dark spotlight scrim — dismiss on tap outside the panel.
            Color.black.opacity(0.94)
                .ignoresSafeArea()
                .onTapGesture { onDone() }

            VStack(spacing: Theme.Spacing.l) {
                medal
                VStack(spacing: 4) {
                    Text(isPlural ? "¡Nuevos récords!" : "¡Nuevo récord!")
                        .font(.system(size: 26, weight: .heavy, design: .default).italic())
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Récord personal")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(Theme.Tracking.dataLabel)
                        .textCase(.uppercase)
                        .foregroundStyle(CelebrationGold.bright)
                }

                VStack(spacing: 10) {
                    ForEach(Array(records.enumerated()), id: \.offset) { _, record in
                        recordRow(record)
                    }
                }

                actions
            }
            .padding(Theme.Spacing.xl)
            .frame(maxWidth: 360)
            .background(
                RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                    .fill(Theme.Color.surface)
                    .overlay(
                        RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous)
                            .stroke(CelebrationGold.deep.opacity(0.5), lineWidth: 1)
                    )
            )
            .padding(.horizontal, Theme.Spacing.xl)
            .scaleEffect(appear ? 1 : 0.92)
            .opacity(appear ? 1 : 0)
        }
        // A celebration is a night-coded moment: force the dark palette so the gold
        // reads even when the app is in light mode.
        .environment(\.colorScheme, .dark)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { appear = true }
            Haptics.success()
        }
        .task { shareURL = WorkoutShareRenderer.pngURL(for: shareData) }
    }

    private var medal: some View {
        ZStack {
            Circle().fill(CelebrationGold.gradient)
                .frame(width: 76, height: 76)
                .shadow(color: CelebrationGold.deep.opacity(0.5), radius: 16, y: 6)
            Text("PR")
                .font(.system(size: 26, weight: .heavy, design: .default).italic())
                .foregroundStyle(Color.black.opacity(0.72))
        }
        .accessibilityHidden(true)
    }

    private func recordRow(_ record: PersonalRecord) -> some View {
        VStack(spacing: 4) {
            Text(record.headline)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            Text(record.formattedValue)
                .font(.system(size: 44, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
            if let delta = record.deltaLine {
                Text(delta)
                    .font(.system(size: 12))
                    .foregroundStyle(record.isFirstMark ? Theme.Color.muted : CelebrationGold.bright)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    private var actions: some View {
        VStack(spacing: Theme.Spacing.s) {
            if let shareURL {
                ShareLink(item: shareURL) {
                    HStack(spacing: 8) {
                        Image(systemName: "square.and.arrow.up")
                        Text("Compartir")
                    }
                    .font(.system(size: 15, weight: .heavy, design: .default).italic())
                    .tracking(0.5)
                    .foregroundStyle(Color.black.opacity(0.78))
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(CelebrationGold.gradient)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                }
                .simultaneousGesture(TapGesture().onEnded { Haptics.light() })
            }
            Button(action: { Haptics.light(); onDone() }) {
                Text("Seguir")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Shareable card

/// The dark, big-number card exported when the athlete shares a session. Honest:
/// it shows only what exists (a PR badge, pace and zone all appear only when real).
/// Fixed point size; rendered at 3× by `WorkoutShareRenderer` for a crisp export.
struct WorkoutShareCard: View {
    let data: WorkoutShareData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Wordmark(size: 20)
                Spacer()
                if let pr = data.prDistanceLabel {
                    HStack(spacing: 5) {
                        Image(systemName: "trophy.fill").font(.system(size: 11, weight: .bold))
                        Text("PR · \(pr)")
                            .font(.system(size: 12, weight: .heavy, design: .default).italic())
                    }
                    .foregroundStyle(Color.black.opacity(0.78))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(CelebrationGold.gradient)
                    .clipShape(Capsule())
                }
            }

            Spacer(minLength: 0)

            Text(data.title)
                .font(.system(size: 22, weight: .heavy, design: .default).italic())
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .padding(.bottom, 6)

            Text(data.timeText)
                .font(.system(size: 84, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.foreground)
                .minimumScaleFactor(0.5)
                .lineLimit(1)

            HStack(spacing: 20) {
                if let pace = data.paceText { shareStat("RITMO", pace) }
                if let zone = data.dominantZone { shareStat("ZONA", "\(zone.label) · \(zone.pct)%") }
                if let rpe = data.rpe { shareStat("RPE", "\(rpe)") }
            }
            .padding(.top, 12)

            Spacer(minLength: 0)

            Text("fahybrid.com")
                .font(.system(size: 12, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(Theme.Color.faint)
        }
        .padding(28)
        .frame(width: 360, height: 450, alignment: .leading)
        .background(Theme.Color.background)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.Color.accent).frame(height: 4)
        }
    }

    private func shareStat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .tracking(Theme.Tracking.dataLabel)
                .foregroundStyle(Theme.Color.muted)
            Text(value)
                .font(.system(size: 17, weight: .heavy, design: .monospaced).monospacedDigit())
                .foregroundStyle(Theme.Color.accentText)
        }
    }
}

// MARK: - Renderer

enum WorkoutShareRenderer {
    /// Render the solo session card to a temp PNG for ShareLink (forced dark, 3×).
    /// Nil if rendering fails (the caller then hides the share affordance).
    @MainActor
    static func pngURL(for data: WorkoutShareData) -> URL? {
        render(WorkoutShareCard(data: data).environment(\.colorScheme, .dark), name: "fahybrid-entreno")
    }

    /// The shared render+write core — ANY share card (solo #65, joint #28) exports
    /// through this ONE ImageRenderer path, so the export settings can't drift.
    /// Internal so the joint-card overload (DoblesJointSummaryView) reuses it.
    @MainActor
    static func render<V: View>(_ view: V, name: String) -> URL? {
        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        guard let image = renderer.uiImage, let png = image.pngData() else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(name)-\(UUID().uuidString).png")
        do {
            try png.write(to: url, options: [.atomic])
            return url
        } catch {
            return nil
        }
    }
}
