import SwiftUI

// Expert variant of the Pre-Workout Brief.
// Mirrors docs/design/fahybrik-design-system/project/athlete_app/workout.jsx
// `PreBriefExpert`. Compact data grid + segments table + connection grid +
// coach quote. No emoji, no fluff — élite shorthand.
struct PreWorkoutBriefView: View {
    let plan: WorkoutPlan
    let connections: ConnectionStatus
    let onStart: () -> Void
    let onClose: () -> Void

    @State private var workoutVideoUrl: String? = nil
    @State private var segmentVideoUrl: String? = nil

    struct ConnectionStatus {
        let garmin: Bool
        let healthkit: Bool
        let pm5: Bool
        /// Real device state. PM5 reflects whether a device is remembered;
        /// Garmin/HealthKit aren't resolvable to a simple bool here so they
        /// stay false (the grid only renders tiles for connected devices).
        static var current: ConnectionStatus {
            ConnectionStatus(
                garmin: false,
                healthkit: false,
                pm5: PM5ConnectionStore.shared.rememberedDeviceName != nil
            )
        }
    }

    private var anyConnection: Bool {
        connections.garmin || connections.healthkit || connections.pm5
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    titleCard
                    if plan.demoVideoUrl != nil {
                        demoVideoCard
                    }
                    if plan.segments.count > 1 {
                        segmentsTable
                    }
                    if anyConnection {
                        connectionsGrid
                    }
                    if let note = plan.coachNote {
                        CardSurface(padding: 14, leftAccent: true) {
                            CoachQuote(text: "\u{201C}\(note)\u{201D}")
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.bottom, Theme.Spacing.xxl)
            }
            .layoutPriority(1)
            ExpertPrimaryButton(title: "▶ EMPEZAR", action: onStart)
                .padding(.horizontal, Theme.Spacing.xl)
                .padding(.bottom, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.l)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .sheet(isPresented: Binding(
            get: { workoutVideoUrl != nil },
            set: { if !$0 { workoutVideoUrl = nil } }
        )) {
            if let url = workoutVideoUrl {
                YouTubeSheet(url: url, title: plan.name)
            }
        }
        .sheet(isPresented: Binding(
            get: { segmentVideoUrl != nil },
            set: { if !$0 { segmentVideoUrl = nil } }
        )) {
            if let url = segmentVideoUrl {
                YouTubeSheet(url: url, title: "Técnica")
            }
        }
    }

    private var demoVideoCard: some View {
        Button {
            Haptics.light()
            workoutVideoUrl = plan.demoVideoUrl
        } label: {
            CardSurface(padding: 14) {
                HStack(spacing: Theme.Spacing.m) {
                    Image(systemName: "play.rectangle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(Theme.Color.accent)
                    VStack(alignment: .leading, spacing: 4) {
                        LabelText(text: "Video del entreno")
                        Text("Ver demo en la app")
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.foreground)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var topBar: some View {
        HStack {
            Button(action: { Haptics.light(); onClose() }) {
                Text("← Atrás")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
            }
            .buttonStyle(.plain)
            Spacer()
            LabelText(text: "Workout Brief")
            Spacer()
            Color.clear.frame(width: 50)
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.top, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.l)
    }

    // Only render the fields we genuinely have. The plan body (format,
    // duration, segments, equipment) isn't fetched for live execution yet, so
    // we show the session title plus whatever non-empty real fields exist.
    private var titleCard: some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "Sesión")
                Text(plan.name)
                    .scaledFont(20, weight: .heavy, relativeTo: .title3, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                if !plan.blockContext.isEmpty {
                    MonoText(text: plan.blockContext.uppercased(), size: 11, color: Theme.Color.muted)
                }
                Text("Pulsa empezar para cronometrar tu sesión. Marca vueltas con el botón de lap.")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }

    private var segmentsTable: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                HStack {
                    LabelText(text: "Segments · Targets")
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                Hairline()
                ForEach(Array(plan.segments.enumerated()), id: \.element.id) { idx, seg in
                    if idx > 0 { Hairline() }
                    HStack(alignment: .center, spacing: 8) {
                        MonoText(text: "\(idx + 1)", size: 11, color: Theme.Color.muted)
                            .frame(width: 20, alignment: .leading)
                        Text(seg.title)
                            .scaledFont(13, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.foreground)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        MonoText(text: targetString(seg), size: 11, color: Theme.Color.muted)
                            .frame(width: 60, alignment: .trailing)
                        if seg.videoUrl != nil {
                            Button {
                                Haptics.light()
                                segmentVideoUrl = seg.videoUrl
                            } label: {
                                Image(systemName: "play.circle.fill")
                                    .font(.system(size: 18))
                                    .foregroundStyle(Theme.Color.accent)
                            }
                            .buttonStyle(.plain)
                            .frame(width: 28)
                            .accessibilityLabel("Ver vídeo del ejercicio")
                        }
                        if let z = seg.targetZone {
                            ZBadge(zone: z)
                                .frame(width: 50, alignment: .trailing)
                        } else {
                            Color.clear.frame(width: 50)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                }
            }
        }
    }

    private func targetString(_ s: WorkoutSegment) -> String {
        if let p = s.targetPaceSecondsPerKm {
            return "\(TimeMinSecRow.format(p))/km"
        }
        if let w = s.targetPowerWatts { return "\(w)W" }
        if let r = s.targetReps { return "\(r)r" }
        if let d = s.targetDistanceMeters { return d >= 1000 ? String(format: "%.1fk", d/1000) : "\(Int(d))m" }
        return "—"
    }

    private var connectionsGrid: some View {
        CardSurface(padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Connections")
                let cols = [
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8),
                ]
                LazyVGrid(columns: cols, spacing: 8) {
                    connTile(label: "Garmin", connected: connections.garmin)
                    connTile(label: "HR Strap", connected: connections.healthkit)
                    connTile(label: "PM5", connected: connections.pm5)
                }
            }
        }
    }

    private func connTile(label: String, connected: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
            Text(connected ? "✓ ready" : "✗ off")
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(connected ? Theme.Color.ok : Theme.Color.danger)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Theme.Color.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
