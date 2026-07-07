import SwiftUI

// "Hoy toca" — the session at a glance and one tap to start. Title, a bloques ·
// minutos pill row, the first block's work hint, and a big orange "Empezar" that
// hands off to the coordinator (which builds the plan + starts the engine and the
// HealthKit session). Block count + hint come from the decoded detail; nothing is
// invented. Mockup 2.
struct TodayBriefView: View {
    let payload: WatchTodayPayload
    /// The runnable plan preview (nil for a rest day / bodyless assignment).
    let plan: WorkoutPlan?
    let onStart: () -> Void

    private var isRestDay: Bool { payload.dayKind == WatchDayKind.rest }

    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 8) {
                if isRestDay { restContent } else { sessionContent }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
    }

    // A rest day is honest: no session, no start button — just the recovery cue.
    @ViewBuilder
    private var restContent: some View {
        WatchLabel(text: "Hoy", accent: true)
        Text("Descanso")
            .font(.system(size: 24, weight: .heavy))
            .foregroundStyle(WatchTheme.ink)
        Text("Hoy descansas. Disfruta la recuperación.")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(WatchTheme.dim)
        Spacer(minLength: 0)
    }

    // A session day always gets the start button — even summary-only (plan == nil,
    // the detail dropped over the size cap or none cached): starting then runs the
    // minimal honest fallback the coordinator builds (duration + HR). Block count +
    // first-block hint show only when the full prescription is present.
    @ViewBuilder
    private var sessionContent: some View {
        WatchLabel(text: "Hoy toca", accent: true)
        Text(payload.title ?? "Sesión")
            .font(.system(size: 24, weight: .heavy))
            .foregroundStyle(WatchTheme.ink)
            .lineLimit(2)
            .minimumScaleFactor(0.6)
        // #23 — dobles badge: "DOBLES · con Guillem". Shown only for a shared/joint
        // dobles session (self_only individual sessions carry no partner).
        if let badge = payload.doublesBadgeText {
            DoublesBadge(text: badge)
        }
        pills
        if plan != nil, let hint = firstBlockHint {
            Text("1º · \(hint)")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(WatchTheme.dim)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        Spacer(minLength: 0)
        BigTapButton(title: "Empezar", systemImage: "play.fill") { onStart() }
    }

    private var pills: some View {
        HStack(spacing: 6) {
            if let blocks = blockCount {
                pill("\(blocks) bloques")
            }
            if let minutes = payload.estDurationMinutes, minutes > 0 {
                pill("~\(minutes) min")
            }
        }
    }

    private func pill(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .heavy))
            .foregroundStyle(WatchTheme.ink)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(WatchTheme.surfaceRaised)
            .clipShape(Capsule())
    }

    // MARK: - Derived

    private var blockCount: Int? {
        guard let plan else { return nil }
        let count = plan.blockRegions.count
        return count > 0 ? count : nil
    }

    private var firstBlockHint: String? {
        plan?.segments.first?.previewWorkLine ?? plan?.blockRegions.first?.title
    }
}

// #23 — the "DOBLES · con {nombre}" chip. One definition, read by the wrist brief
// AND the done card so a dobles session reads as such at both ends. Orange, low
// height so it sits under the title without competing with it.
struct DoublesBadge: View {
    let text: String
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "person.2.fill")
                .font(.system(size: 9, weight: .bold))
            Text(text)
                .font(.system(size: 10, weight: .heavy))
                .tracking(0.4)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .foregroundStyle(WatchTheme.orangeSoft)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(WatchTheme.orangeSoft.opacity(0.14))
        .clipShape(Capsule())
    }
}
