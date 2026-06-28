import SwiftUI

// Expert variant of the Active Workout screen — Garmin watch-face density.
// Mirrors docs/design/fahybrik-design-system/project/athlete_app/workout.jsx
// `ActiveExpert`: compact top strip (pause / segment title / index), big LAP
// timer hero, 2x3 metric grid, next-segment chip + LAP button. Tab bar hidden
// by parent (WorkoutContainer) per "lock-in mode".
struct ActiveWorkoutView: View {
    @State var session: WorkoutSession
    let onFinish: () -> Void

    @State private var showPauseConfirm: Bool = false
    @State private var pauseAutoResume: Int = 10
    @State private var showPM5Sheet: Bool = false
    @State private var showSegmentVideo: Bool = false
    // True when opening the technique video actively paused the clock, so we know
    // to resume it when the sheet is dismissed (and not resume a session the
    // athlete had already paused before opening the video).
    @State private var resumeAfterVideo: Bool = false
    @State private var pm5 = PM5ConnectionStore.shared
    // Optional, permission-guarded live sources for non-erg work: phone GPS for
    // run distance/pace and HealthKit/Apple-Watch HR. Both stay dormant until a
    // segment needs them and never block the workout.
    @State private var runGPS = RunLocationProvider()
    @State private var liveHR = LiveHeartRateProvider()

    private var isErgSegment: Bool {
        session.currentSegment?.kind == .rowOrSki
    }
    private var isRunSegment: Bool {
        session.currentSegment?.kind == .running
    }
    private var gpsActive: Bool {
        runGPS.status == .active || runGPS.status == .authorized
    }

    var body: some View {
        ZStack {
            Theme.Color.background
                .ignoresSafeArea()
                .instrumentCanvas()
            VStack(spacing: 8) {
                topStrip
                ConnectionStrip(
                    session: session,
                    pm5: pm5,
                    gpsActive: gpsActive,
                    segmentIsErg: isErgSegment,
                    segmentIsRun: isRunSegment,
                    onTapPM5: { showPM5Sheet = true }
                )
                if session.plan.segments.count > 1 {
                    BlockIntervalStrip(
                        segments: session.plan.segments,
                        currentIndex: session.currentSegmentIndex
                    )
                }
                modalityHUD
                Spacer(minLength: 0)
                if isErgSegment && !pm5.isConnected {
                    connectPM5CTA
                }
                nextSegmentChip
                lapButton
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, 10)

            if showPauseConfirm {
                pauseModal
            }
        }
        .onAppear {
            session.start()
            wireLiveSources()
            attemptPM5IfNeeded()
            updateRunGPS()
            liveHR.start(from: session.startedAt)
        }
        .onDisappear {
            session.stop()
            runGPS.stop()
            liveHR.stop()
        }
        .onChange(of: session.isFinished) { _, finished in
            if finished {
                runGPS.stop()
                liveHR.stop()
                onFinish()
            }
        }
        .onChange(of: session.currentSegmentIndex) { _, _ in
            attemptPM5IfNeeded()
            updateRunGPS()
        }
        .onChange(of: pm5.live.heartRateBpm) { _, bpm in
            // HRM strap can be paired through the PM5; route into session as a
            // fallback HR source (HealthKit/watch wins if it's already streaming).
            if let bpm { session.injectLiveHR(bpm, source: .pm5) }
        }
        .onChange(of: pm5.live.lastUpdate) { _, _ in
            // Each PM5 sample updates `lastUpdate`; feed the erg stream into the
            // session's per-segment aggregation (avg pace/power/SPM, distance,
            // calories) so the execution record is built from real samples.
            guard pm5.isConnected else { return }
            session.sampleErg(
                paceSecPer500m: pm5.live.paceSecondsPer500m,
                powerWatts: pm5.live.powerWatts,
                strokeRate: pm5.live.strokeRate,
                distanceMeters: pm5.live.distanceMeters,
                caloriesKcal: pm5.live.caloriesKcal
            )
        }
        .sheet(isPresented: $showPM5Sheet) {
            PM5LiveStreamView(store: pm5)
        }
        .sheet(isPresented: $showSegmentVideo, onDismiss: {
            // Resume only if opening the video is what paused the clock.
            if resumeAfterVideo { session.resumeFromVideo() }
            resumeAfterVideo = false
        }) {
            if let url = session.currentSegment?.videoUrl {
                YouTubeSheet(url: url, title: session.currentSegment?.title ?? "Técnica")
            }
        }
    }

    private var segmentHasVideo: Bool {
        session.currentSegment?.videoUrl != nil
            && YouTubeLinkParser.videoId(from: session.currentSegment!.videoUrl!) != nil
    }

    private func attemptPM5IfNeeded() {
        guard isErgSegment, !pm5.isConnected else { return }
        if pm5.hasRememberedDevice {
            pm5.reconnectIfPossible()
        }
    }

    // Hook the optional providers' callbacks into the session. Done once on
    // appear; the closures capture `session`, which is stable for the screen.
    private func wireLiveSources() {
        runGPS.onDistanceDelta = { meters in
            session.sampleRunGPS(deltaMeters: meters)
        }
        liveHR.onSample = { bpm in
            session.injectLiveHR(bpm, source: .healthkit)
        }
    }

    // Start phone GPS only on run segments (and only if not denied); stop it
    // otherwise so we don't hold the location indicator during erg/strength work.
    private func updateRunGPS() {
        if isRunSegment {
            runGPS.start()
        } else {
            runGPS.stop()
        }
    }

    private var connectPM5CTA: some View {
        Button(action: { showPM5Sheet = true }) {
            HStack(spacing: Theme.Spacing.s) {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(.system(size: 12, weight: .semibold))
                Text("CONECTAR PM5")
                    .scaledFont(11, weight: .heavy, relativeTo: .caption2, italic: true)
                    .tracking(1.2)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.vertical, 10)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.accentText.opacity(0.6), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .foregroundStyle(Theme.Color.accentText)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 4)
        .padding(.bottom, 4)
    }

    private var topStrip: some View {
        HStack {
            Button(action: {
                session.togglePause()
                if session.isPaused { showPauseConfirm = true; pauseAutoResume = 10 }
            }) {
                Text("‖")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(session.isPaused ? "Reanudar entreno" : "Pausar entreno")
            Spacer()
            MonoText(
                text: (session.currentSegment?.title ?? "—").uppercased(),
                size: 11,
                color: Theme.Color.muted
            )
            .lineLimit(1)
            if segmentHasVideo {
                Button(action: {
                    Haptics.light()
                    // Pause the clock while the video is open; resume on dismiss.
                    resumeAfterVideo = session.pauseForVideo()
                    showSegmentVideo = true
                }) {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.Color.accentText)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ver vídeo de técnica, pausa el cronómetro")
            }
            MonoText(
                text: "\(session.currentSegmentIndex + 1)/\(session.plan.segments.count)",
                size: 11,
                color: Theme.Color.muted
            )
        }
        .padding(.horizontal, 4)
    }

    // Modality-aware HUD: erg → split/watts (Concept2), run → pace/km,
    // strength/reps/sled → reps + load. Single source of state (session + pm5).
    @ViewBuilder
    private var modalityHUD: some View {
        switch session.currentSegment?.kind {
        case .rowOrSki:
            ErgLiveHUD(session: session, pm5: pm5)
        case .running:
            RunLiveHUD(session: session, gpsActive: gpsActive)
        case .strength, .reps, .sled, .none:
            StrengthLiveHUD(session: session)
        }
    }

    @ViewBuilder
    private var nextSegmentChip: some View {
        if let next = session.nextSegment {
            HStack(spacing: Theme.Spacing.s) {
                LabelText(text: "NEXT", color: Theme.Color.accentText, size: 10)
                Text(next.title)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                Spacer(minLength: Theme.Spacing.s)
                if let z = next.targetZone {
                    ZBadge(zone: z)
                }
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.vertical, 9)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
            .padding(.bottom, 6)
        }
    }

    private var lapButton: some View {
        ExpertLapButton(action: { session.lap() })
            .frame(height: 88)
    }

    private var pauseModal: some View {
        ZStack {
            Theme.Color.scrim.ignoresSafeArea()
            CardSurface(padding: Theme.Spacing.l, radius: Theme.Radius.xl) {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    Text("Pausa")
                        .font(Theme.Typography.headlineM)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Auto-resume en \(pauseAutoResume)s si no confirmas.")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                    ExpertPrimaryButton(title: "Reanudar") {
                        session.togglePause()
                        showPauseConfirm = false
                    }
                    SecondaryButton(title: "Abandonar") {
                        session.finish()
                        showPauseConfirm = false
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.m)
        }
        .transition(.opacity)
        .onAppear {
            countdownAutoResume()
        }
    }

    private func countdownAutoResume() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            guard showPauseConfirm else { return }
            if pauseAutoResume <= 1 {
                session.togglePause()
                showPauseConfirm = false
            } else {
                pauseAutoResume -= 1
                countdownAutoResume()
            }
        }
    }
}

// Smaller LAP button matching Expert spec (88pt, radius 14).
private struct ExpertLapButton: View {
    let action: () -> Void
    @State private var flashing: Bool = false
    @State private var lastTap: Date = .distantPast

    var body: some View {
        Button {
            let now = Date()
            guard now.timeIntervalSince(lastTap) > 0.5 else { return }
            lastTap = now
            Haptics.medium()
            withAnimation(.easeOut(duration: 0.18)) { flashing = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                withAnimation(.easeIn(duration: 0.16)) { flashing = false }
            }
            action()
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .fill(flashing ? Theme.Color.ok : Theme.Color.accent)
                Text("LAP")
                    .font(.system(size: 56, weight: .heavy, design: .default).italic())
                    .tracking(4)
                    .foregroundStyle(Theme.Color.accentOn)
            }
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Lap")
    }
}
