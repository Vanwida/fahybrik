import SwiftUI
import UIKit

// Expert variant of the Active Workout screen — Garmin watch-face density.
// Mirrors docs/design/fahybrik-design-system/project/athlete_app/workout.jsx
// `ActiveExpert`: compact top strip (pause / segment title / index), big LAP
// timer hero, 2x3 metric grid, next-segment chip + LAP button. Tab bar hidden
// by parent (WorkoutContainer) per "lock-in mode".
struct ActiveWorkoutView: View {
    @State var session: WorkoutSession
    let onFinish: () -> Void
    /// Leave the workout WITHOUT recording anything (clean discard): no execution
    /// saved, the session is never marked done. Distinct from `onFinish`, which
    /// routes to the post-workout summary that LOGS the result. Exiting via this
    /// closure returns the athlete to a still-pending session.
    let onExit: () -> Void
    /// #23 — partner first name for the dobles RELAY screen ("{name} hace SkiErg").
    /// Nil falls back to "Tu compañero". Passed by WorkoutContainer, which holds
    /// the partner identity.
    var partnerFirstName: String? = nil
    /// #60 — athlete age (from the cached identity) for the ESTIMATED HR zone in
    /// the treadmill HUD (220−age). Nil when unknown → the HUD shows HR without a
    /// zone rather than inventing one. No real HR threshold exists in the product.
    var athleteAge: Int? = nil

    @State private var showTreadmill: Bool = false
    @State private var showPauseConfirm: Bool = false
    @State private var pauseAutoResume: Int = 10
    @State private var showPM5Sheet: Bool = false
    @State private var showSegmentVideo: Bool = false
    // True when opening the technique video actively paused the clock, so we know
    // to resume it when the sheet is dismissed (and not resume a session the
    // athlete had already paused before opening the video).
    @State private var resumeAfterVideo: Bool = false
    @State private var pm5 = PM5ConnectionStore.shared
    // A pending navigation awaiting confirmation (a forward skip that omits work,
    // or a back-step that would discard live-captured data). Nil = nothing to ask.
    @State private var pendingNav: PendingNav? = nil
    // The exit decision (concept §C.2/§C.3) when leaving a session that has REAL
    // recorded work: step 1 = the 3-option choose sheet (seguir / terminar y
    // guardar / descartar), step 2 = the destructive discard confirmation. Nil =
    // not exiting. A no-work exit never reaches here — it discards immediately.
    @State private var exitStep: ExitStep? = nil
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
    // Current block's phase name, shown only when the session has real block
    // context (a freeform single-segment fallback has no block, so no label).
    private var currentPhaseLabel: String? {
        guard let seg = session.currentSegment, seg.blockTitle != nil else { return nil }
        return seg.blockPhase.displayName
    }

    var body: some View {
        ZStack {
            Theme.Color.background
                .ignoresSafeArea()
                .instrumentCanvas()
            // ROTATING work/rest full-bleed colour flip — a subtle wash so the
            // phase reads from across the box even when the phone is on the floor.
            if let flip = rotatingFlipColor {
                flip.opacity(0.10)
                    .ignoresSafeArea()
                    .animation(.easeInOut(duration: 0.3), value: session.rotPhase)
            }
            VStack(spacing: 8) {
                topStrip
                phaseRail
                if session.currentSegmentIsPartnerRelay {
                    // #23 — HYROX dobles relay: the PARTNER works this station while
                    // the athlete recovers (real dobles). Nothing is logged for the
                    // athlete; "Relevo ▸" advances to their next station.
                    relaySurface
                    Spacer(minLength: 0)
                    relayButton
                } else if session.currentBlockIsStructural {
                    // Warmup / cooldown: ONE readable checklist, gated behind a
                    // single "hecho" button — never per-exercise navigation/logging.
                    structuralWorkSurface
                    Spacer(minLength: 0)
                    primaryButton
                } else {
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
                            currentIndex: session.currentSegmentIndex,
                            onTap: { requestJump(to: $0) }
                        )
                    }
                    modalityHUD
                    // #23 — SHARED-station reminder (.split): one dim line with the
                    // agreed reparto ("Tú 60 / Guillem 40 · alterna 250m"). The work
                    // is the athlete's own, so the full HUD stays; this only reminds
                    // the pact mid-station. Nil (hidden) for .mine and for the relay.
                    splitReminderLine
                    if session.currentSegmentIsMetcon {
                        RxScaledToggle(session: session)
                    }
                    Spacer(minLength: 0)
                    if isErgSegment && !pm5.isConnected {
                        connectPM5CTA
                    }
                    nextSegmentChip
                    bottomControls
                }
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, 10)

            // Block-transition gate: the upcoming block's preview / "ready" screen.
            // Full-screen over the live HUD while the session is parked before a
            // block (`isAwaitingBlockStart`); the clock starts only on "Empezar".
            if session.isAwaitingBlockStart {
                blockPreviewOverlay
            }

            if showPauseConfirm {
                pauseModal
            }
            if let nav = pendingNav {
                confirmModal(nav)
            }
            if exitStep != nil {
                exitOverlay
            }
        }
        .animation(.easeInOut(duration: 0.2), value: session.isAwaitingBlockStart)
        .animation(.easeInOut(duration: 0.2), value: exitStep)
        .onAppear {
            session.start()
            wireLiveSources()
            attemptPM5IfNeeded()
            updateRunGPS()
            // The wrist streams fresher HR while mirroring — only run the phone's
            // own sparse HealthKit reader when no watch is recording this session.
            if !PhoneMirrorService.shared.wristJoined {
                liveHR.start(from: session.startedAt)
            }
            // Keep the screen awake during the lock-in workout (no auto-lock
            // mid-EMOM); locked-screen beeps are still covered by background audio.
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onDisappear {
            session.stop()
            runGPS.stop()
            liveHR.stop()
            UIApplication.shared.isIdleTimerDisabled = false
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
        .onChange(of: PhoneMirrorService.shared.wristJoined) { _, joined in
            // Hand HR off to the wrist when it joins mid-run; take it back if it drops
            // so the phone keeps recording HR alone.
            if joined { liveHR.stop() } else { liveHR.start(from: session.startedAt) }
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
        .fullScreenCover(isPresented: $showTreadmill) {
            TreadmillHUDView(session: session, athleteAge: athleteAge)
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

    // MARK: - Block-transition gate (preview / "ready" screen)

    @ViewBuilder
    private var blockPreviewOverlay: some View {
        if let region = session.currentBlockRegion {
            let segs = session.plan.segments(in: region)
            // A freeform / title-only session has no block context — show the
            // session name and no phase tag. When a coach block's title already IS
            // the phase name (e.g. "Calentamiento"), drop the redundant tag.
            let freeform = session.plan.phaseRegions.isEmpty
            let phaseName = region.phase.displayName
            let tag: String? = (freeform || region.title.lowercased() == phaseName.lowercased())
                ? nil : phaseName
            BlockPreviewGate(
                title: freeform ? session.plan.name : region.title,
                phaseTag: tag,
                blockNumber: session.blockNumber,
                blockCount: session.blockCount,
                formatLabel: blockFormatLabel(segs),
                segments: segs,
                canGoBack: session.canStepBack,
                onEmpezar: { session.beginBlock() },
                onBack: { requestBack() },
                onExit: { requestExit() }
            )
        }
    }

    // The block's format/scheme line for the preview. An EMOM reads its resolved
    // plan ("EMOM · 15 rondas · cada 1:00"); other conditioning schemes (AMRAP /
    // For Time) reuse the shared PrescriptionRenderer; plain strength / warmup
    // blocks have no format line (the title carries them).
    private func blockFormatLabel(_ segments: [WorkoutSegment]) -> String? {
        if let emom = segments.compactMap(\.emomPlan).first {
            return "EMOM · \(emom.intervalCount) rondas · cada \(PrescriptionRenderer.formatRest(emom.intervalSeconds))"
        }
        if let wod = segments.compactMap(\.prescription).first(where: { $0.scheme.isWOD }) {
            return PrescriptionRenderer.wodHeader(wod)
        }
        // The remaining conditioning formats (Tabata, Death By, Intervals, Steady,
        // Chipper, Ladder, Rounds, HYROX sim) build their own header line.
        if let seg = segments.first(where: { $0.isConditioningTimer }) {
            return conditioningFormatLabel(seg)
        }
        return nil
    }

    private func conditioningFormatLabel(_ seg: WorkoutSegment) -> String? {
        guard let scheme = seg.formatScheme else { return nil }
        var parts: [String] = [scheme.displayName]
        switch scheme {
        case .amrap, .steady:
            if let t = seg.formatTotalSeconds { parts.append(PrescriptionRenderer.formatClock(t)) }
        case .tabata:
            if let w = seg.formatWorkSeconds, let r = seg.formatRestSeconds { parts.append("\(w)/\(r)s") }
            if let n = seg.formatRounds { parts.append("×\(n)") }
        case .intervals:
            if let n = seg.formatRounds { parts.append("\(n) series") }
        case .deathBy:
            parts.append("+\(seg.deathByIncrement)/min")
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            if let n = seg.formatRounds, n > 1 { parts.append("\(n) rondas") }
            if let cap = seg.formatTotalSeconds { parts.append("cap \(PrescriptionRenderer.formatClock(cap))") }
        default:
            break
        }
        return parts.joined(separator: " · ")
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
            // Exit (top-left): leave the workout without recording anything. The
            // athlete is never trapped. Confirms only when there's unsaved captured
            // work (a recorded lap, confirmed reps, live progress); a just-started
            // run with nothing logged exits immediately.
            Button(action: { requestExit() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 26, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Salir del entreno")
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
            // Back: a LOW-emphasis chevron (smaller + muted, never the weight of
            // the primary button) so it can't be fat-fingered under load. Steps the
            // EMOM interval back mid-block, else reopens the previous segment.
            Button(action: { requestBack() }) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(session.canStepBack ? Theme.Color.muted : Theme.Color.muted.opacity(0.3))
                    .frame(width: 26, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!session.canStepBack)
            .accessibilityLabel("Volver atrás")
            Spacer()
            VStack(spacing: 1) {
                // Block phase (Calentamiento / Principal / Vuelta a la calma) so the
                // athlete always knows which part of the session they're in.
                if let phase = currentPhaseLabel {
                    Text(phase.uppercased())
                        .font(.system(size: 9, weight: .heavy, design: .default).italic())
                        .tracking(0.8)
                        .foregroundStyle(Theme.Color.accentText)
                        .lineLimit(1)
                }
                MonoText(
                    text: (session.currentSegment?.title ?? "—").uppercased(),
                    size: 11,
                    color: Theme.Color.muted
                )
                .lineLimit(1)
            }
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
            // Wrist chip: the Apple Watch is recording this session in step (mirror
            // mode). Shown only while joined; green so "connected" reads at a glance.
            if PhoneMirrorService.shared.wristJoined {
                Image(systemName: "applewatch")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.ok)
                    .frame(width: 20, height: 28)
                    .accessibilityLabel("Reloj conectado")
            }
            MonoText(
                text: "\(session.currentSegmentIndex + 1)/\(session.plan.segments.count)",
                size: 11,
                color: Theme.Color.muted
            )
        }
        .padding(.horizontal, 4)
    }

    // #23 — HYROX dobles RELAY surface: the partner works this station; the
    // athlete recovers (status + relay clock + live recovery HR + next-up), and
    // "Relevo ▸" advances to their own next station. Nothing is logged here.
    @ViewBuilder
    private var relaySurface: some View {
        let station = session.currentSegment?.doblesSplit?.stationLabel
            ?? session.currentSegment?.title ?? "esta estación"
        let partner = session.currentSegment?.doblesSplit?.partnerName
            ?? partnerFirstName ?? "Tu compañero"
        VStack(spacing: 14) {
            Spacer(minLength: 4)
            Text("RELEVO")
                .font(.system(size: 12, weight: .heavy)).tracking(2.5)
                .foregroundStyle(Theme.Color.partner)
            Text("\(partner) hace \(station)")
                .scaledFont(24, weight: .heavy, relativeTo: .title2, italic: true)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            Text("Recupera")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
            Text(relayTimeString(session.lapElapsedSeconds))
                .font(.system(size: 56, weight: .heavy, design: .monospaced))
                .foregroundStyle(Theme.Color.foreground)
                .padding(.top, 4)
            if let bpm = session.liveHRBpm {
                HStack(spacing: 6) {
                    Image(systemName: "heart.fill").foregroundStyle(Theme.Color.danger)
                    Text("\(bpm) ppm")
                        .font(.system(size: 16, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                }
            }
            if let next = session.nextSegment?.title {
                Text("Siguiente: tú — \(next)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.Color.faint)
                    .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.xl)
    }

    private var relayButton: some View {
        ExpertPrimaryButton(title: "Relevo ▸", height: 56, enabled: true) {
            session.advanceRelay()
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.bottom, Theme.Spacing.l)
    }

    // #23 — SHARED station (.split) reminder: one dim line with the coach's pact,
    // built once on SegmentDoblesSplit so the phone, the mirror `detailLine`, and
    // the wrist all read identically. Hidden (nil) for .mine and .partner.
    @ViewBuilder
    private var splitReminderLine: some View {
        if let line = session.currentSegment?.doblesSplit?.liveSplitLine {
            HStack(spacing: 6) {
                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.Color.partner)
                Text(line)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.horizontal, 4)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Reparto de la estación: \(line)")
        }
    }

    private func relayTimeString(_ s: Double) -> String {
        let t = max(0, Int(s))
        return String(format: "%d:%02d", t / 60, t % 60)
    }

    // Modality-aware HUD. An EMOM segment gets the dedicated interval timer
    // (count-down + auto-roll + the minute's work) REGARDLESS of its erg/strength
    // kind; everything else routes by kind exactly as before: erg → split/watts
    // (Concept2), run → pace/km, strength/reps/sled → reps + load. Single source
    // of state (session + pm5).
    @ViewBuilder
    private var modalityHUD: some View {
        if session.currentSegment?.isEMOM == true {
            EmomLiveHUD(session: session)
        } else if session.currentSegment?.isConditioningTimer == true {
            // Conditioning formats route by SCHEME to their dedicated timer (the
            // block-level fold means one segment = one format), regardless of kind.
            conditioningHUD
        } else {
            switch session.currentSegment?.kind {
            case .rowOrSki:
                ErgLiveHUD(session: session, pm5: pm5)
            case .running:
                RunLiveHUD(session: session, gpsActive: gpsActive,
                           onTapTreadmill: { showTreadmill = true })
            case .strength, .reps, .sled, .none:
                StrengthLiveHUD(session: session)
            }
        }
    }

    @ViewBuilder
    private var conditioningHUD: some View {
        switch session.currentSegment?.formatScheme {
        case .amrap:     AmrapLiveHUD(session: session)
        case .tabata:    TabataLiveHUD(session: session)
        case .intervals: IntervalsLiveHUD(session: session)
        case .deathBy:   DeathByLiveHUD(session: session)
        case .steady:    SteadyLiveHUD(session: session)
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            ForTimeLiveHUD(session: session)
        default:
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

    // MARK: - Phase rail (persistent top phases)

    private enum RailState { case done, current, upcoming }

    @ViewBuilder
    private var phaseRail: some View {
        let regions = session.plan.phaseRegions
        HStack(spacing: 6) {
            if regions.isEmpty {
                // No block context (freeform / minimal plan) → one "Entreno" chip
                // rather than a hidden, dead top area.
                phaseChip(title: "Entreno", state: .current, action: nil)
            } else {
                ForEach(regions) { region in
                    phaseChip(
                        title: region.title,
                        state: railState(region),
                        action: { requestJump(to: region.firstIndex) }
                    )
                }
            }
        }
        .padding(.horizontal, 4)
    }

    private func railState(_ r: WorkoutPhaseRegion) -> RailState {
        let i = session.currentSegmentIndex
        if i > r.lastIndex { return .done }
        if i >= r.firstIndex { return .current }
        return .upcoming
    }

    @ViewBuilder
    private func phaseChip(title: String, state: RailState, action: (() -> Void)?) -> some View {
        let label = HStack(spacing: 5) {
            if state == .done {
                Image(systemName: "checkmark").font(.system(size: 9, weight: .heavy))
            }
            Text(title.uppercased())
                .font(.system(size: 10, weight: .heavy, design: .default).italic())
                .tracking(0.6)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9)
        .foregroundStyle(railForeground(state))
        .background(railBackground(state))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous)
                .stroke(state == .current ? Theme.Color.accentText : Theme.Color.hairline,
                        lineWidth: state == .current ? 1.5 : 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
        .opacity(state == .upcoming ? 0.5 : 1)

        Group {
            if let action {
                Button(action: action) { label }.buttonStyle(PressScaleStyle())
            } else {
                label
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Fase \(title), \(railAccessibility(state))")
    }

    private func railForeground(_ state: RailState) -> Color {
        switch state {
        case .current:  return Theme.Color.accentOn
        case .done:     return Theme.Color.muted
        case .upcoming: return Theme.Color.muted
        }
    }

    private func railBackground(_ state: RailState) -> Color {
        state == .current ? Theme.Color.accent : Theme.Color.surface
    }

    private func railAccessibility(_ state: RailState) -> String {
        switch state {
        case .current:  return "actual"
        case .done:     return "completada"
        case .upcoming: return "siguiente, toca para saltar"
        }
    }

    // MARK: - Primary action

    // Warmup / cooldown checklist surface — every movement + a rounds guide,
    // scrollable for a long block. The single "hecho" button below closes it.
    @ViewBuilder
    private var structuralWorkSurface: some View {
        if let region = session.currentBlockRegion {
            ScrollView(showsIndicators: false) {
                StructuralBlockChecklist(
                    segments: session.plan.segments(in: region),
                    phaseName: region.phase.displayName
                )
                .padding(.top, 4)
            }
        }
    }

    private var primaryButton: some View {
        ExpertActionButton(title: primaryTitle, action: { primaryAction() })
            .frame(height: 88)
    }

    // A structural block closes as ONE completion; everything else advances.
    private func primaryAction() {
        if session.currentBlockIsStructural {
            session.completeStructuralBlock()
        } else {
            session.primaryAdvance()
        }
    }

    // Context-labelled, never the generic "LAP". EMOM: EMPEZAR during the count-in,
    // SIGUIENTE to skip a minute, TERMINAR on the last interval. Otherwise:
    // TERMINAR on the last segment, HECHO for a discrete strength/reps piece,
    // SIGUIENTE to move to the next leg.
    private var primaryTitle: String {
        // Warmup / cooldown: one tap closes the whole structural block.
        if session.currentBlockIsStructural {
            return session.currentBlockRegion?.phase == .cooldown
                ? "VUELTA A LA CALMA HECHA"
                : "CALENTAMIENTO HECHO"
        }
        if session.currentSegment?.isEMOM == true {
            // During the post-Empezar 3-2-1, the button SKIPS the count-in.
            if session.emomCountInRemaining > 0 { return "SALTAR" }
            if session.emomIntervalsRemaining > 0 { return "SIGUIENTE" }
            // Last interval: TERMINAR ends the session only on the FINAL block;
            // otherwise it closes the EMOM and opens the next block's preview.
            return session.isLastSegment ? "TERMINAR" : "SIGUIENTE"
        }
        if session.currentSegment?.isConditioningTimer == true {
            return conditioningPrimaryTitle
        }
        if session.isLastSegment { return "TERMINAR" }
        switch session.currentSegment?.kind {
        case .strength, .reps: return "HECHO"
        default:               return "SIGUIENTE"
        }
    }

    // The conditioning bottom button label, by scheme. During the post-Empezar
    // 3-2-1 it SKIPS the count-in. AMRAP marks a round; For Time / Chipper / Ladder
    // / Steady close (final time); Tabata logs a rep; Intervals end a bout. Death By
    // uses dual buttons (see `deathByControls`) — this label is for accessibility.
    private var conditioningPrimaryTitle: String {
        if session.condCountInRemaining > 0 { return "SALTAR" }
        switch session.currentSegment?.formatScheme {
        case .amrap:     return "+ RONDA"
        case .tabata:    return "+ REPS"
        case .intervals: return session.rotPhase == .work ? "SERIE HECHA" : "SALTAR DESCANSO"
        case .deathBy:   return "LO LOGRÉ"
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim, .steady:
            return session.isLastSegment ? "TERMINAR" : "HECHO"
        default:         return "SIGUIENTE"
        }
    }

    // The bottom action area: Death By gets a dual "Fallé / Lo logré" control (the
    // fail is what ends it); every other format uses the single contextual button.
    @ViewBuilder
    private var bottomControls: some View {
        if session.currentSegment?.formatScheme == .deathBy && session.condCountInRemaining <= 0 {
            deathByControls
        } else {
            primaryButton
        }
    }

    private var deathByControls: some View {
        HStack(spacing: 8) {
            Button(action: { session.deathByFail() }) {
                Text("FALLÉ")
                    .font(.system(size: 22, weight: .heavy, design: .default).italic())
                    .tracking(1.2)
                    .foregroundStyle(Theme.Color.danger)
                    .frame(width: 116)
                    .frame(height: 88)
                    .background(Theme.Color.surfaceElevated)
                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.danger.opacity(0.55), lineWidth: 1.5))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Fallé, termina el Death By")
            ExpertActionButton(title: "LO LOGRÉ", action: { session.deathByLogged() })
                .frame(height: 88)
        }
    }

    // The rotating work/rest wash colour, or nil for non-rotating / count-in / EMOM
    // (EMOM has its own face). Tabata + Intervals flip orange (work) ↔ blue (rest).
    private var rotatingFlipColor: Color? {
        guard session.condCountInRemaining <= 0 else { return nil }
        switch session.currentSegment?.formatScheme {
        case .tabata, .intervals:
            return session.rotPhase == .work ? Theme.Color.accent : Theme.Color.info
        default:
            return nil
        }
    }

    // MARK: - Navigation requests (confirm where the move is destructive)

    // Phase rail / segment stepper. A forward jump that OMITS intermediate work
    // confirms; an adjacent forward step is the normal advance. A backward jump
    // reopens; it confirms only if the current segment has unsaved live progress.
    private func requestJump(to index: Int) {
        let current = session.currentSegmentIndex
        guard index != current else { return }
        if index > current {
            let omitted = index - current - 1
            if omitted > 0 {
                pendingNav = PendingNav(
                    title: "Saltar a \(jumpTargetTitle(index))",
                    message: omitted == 1
                        ? "Se omite 1 tramo, sin registrarlo."
                        : "Se omiten \(omitted) tramos, sin registrarlos.",
                    confirmTitle: "Saltar",
                    action: { session.jumpTo(index) }
                )
            } else {
                session.jumpTo(index)
            }
        } else if session.currentSegmentHasLiveProgress {
            pendingNav = PendingNav(
                title: "Volver a \(jumpTargetTitle(index))",
                message: "Perderás lo que llevas en este tramo sin guardar.",
                confirmTitle: "Volver",
                action: { session.jumpTo(index) }
            )
        } else {
            session.jumpTo(index)
        }
    }

    // Back chevron. EMOM mid-block → previous interval (never loses data, no
    // confirm). Otherwise → previous segment, confirming only if it discards
    // unsaved live progress.
    private func requestBack() {
        guard session.canStepBack else { return }
        if session.isEMOMActive, session.emomCountInRemaining <= 0, session.emomIntervalIndex > 0 {
            session.stepBack()
            return
        }
        if session.currentSegmentHasLiveProgress {
            pendingNav = PendingNav(
                title: "Volver al tramo anterior",
                message: "Perderás lo que llevas en este tramo sin guardar.",
                confirmTitle: "Volver",
                action: { session.stepBack() }
            )
        } else {
            session.stepBack()
        }
    }

    private func jumpTargetTitle(_ index: Int) -> String {
        guard index >= 0, index < session.plan.segments.count else { return "—" }
        return session.plan.segments[index].title
    }

    // Exit affordance (preview gate + in-progress HUD) — the heart of "ABANDONAR ≠
    // TERMINAR". With REAL recorded work, opens the 3-option decision sheet (seguir
    // / terminar y guardar / descartar) and freezes the clock while the athlete
    // decides. With nothing recorded (just started, or warmup-only), there's
    // nothing to save → discard immediately and silently (§C.1): no execution, the
    // session stays pending, no fake "done". The clock is left frozen at a preview
    // gate (it isn't running there).
    private func requestExit() {
        guard session.hasRecordedWork else { onExit(); return }
        if !session.isAwaitingBlockStart { session.pauseForVideo() }
        exitStep = .choose
    }

    // Close the exit sheet and resume training — the safe path ("Seguir"). Resumes
    // the clock only if we actually paused it for the decision (never at a preview
    // gate, where the clock is held by the gate itself).
    private func dismissExitAndResume() {
        exitStep = nil
        if session.isPaused, !session.isAwaitingBlockStart { session.resumeFromVideo() }
    }

    private enum ExitStep { case choose, confirmDiscard }

    // The exit decision overlay (concept §C.2/§C.3). Same scrim + centred card
    // idiom as the pause / confirm modals. Scrim tap = "Seguir" (the safe default).
    @ViewBuilder
    private var exitOverlay: some View {
        if let step = exitStep {
            ZStack {
                Theme.Color.scrim.ignoresSafeArea()
                    .onTapGesture { dismissExitAndResume() }
                CardSurface(padding: Theme.Spacing.l, radius: Theme.Radius.xl) {
                    switch step {
                    case .choose:         exitChooseContent
                    case .confirmDiscard: exitDiscardContent
                    }
                }
                .padding(.horizontal, Theme.Spacing.m)
            }
            .transition(.opacity)
        }
    }

    // Step 1 — the three honest options. "Seguir entrenando" is the accent default
    // (most prominent: ending a workout should never be the easy mis-tap).
    private var exitChooseContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text("¿Salir del entreno?")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
            Text(exitChooseMessage)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
            ExpertPrimaryButton(title: "Seguir entrenando") { dismissExitAndResume() }
            terminarYGuardarButton
            descartarButton
        }
    }

    // "Terminar y guardar" — the honest partial save. finish(.partial) closes the
    // in-flight segment, sets completeness, and routes to the summary; the recorder
    // then marks the assignment 'partial' (never 'completed'). Green so it reads as
    // a positive, distinct action next to the accent default.
    private var terminarYGuardarButton: some View {
        Button {
            exitStep = nil
            session.finish(completeness: .partial)
        } label: {
            VStack(spacing: 2) {
                Text("Terminar y guardar")
                    .font(.system(size: 16, weight: .heavy, design: .default).italic())
                    .tracking(0.5)
                Text(terminarSubcaption)
                    .font(.system(size: 11, weight: .semibold))
                    .multilineTextAlignment(.center)
            }
            // `background` token = the high-contrast counterpart of `ok` in BOTH
            // light and dark (near-black on bright green / white on dark green),
            // so the label stays WCAG-AA on the green fill either way.
            .foregroundStyle(Theme.Color.background)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Theme.Color.ok)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Terminar y guardar. \(terminarSubcaption)")
    }

    // "Descartar entreno" — opens the destructive confirm (step 2). Low-emphasis
    // red text so it can't be mistaken for the save action.
    private var descartarButton: some View {
        Button { exitStep = .confirmDiscard } label: {
            Text("Descartar entreno")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.Color.danger)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel("Descartar entreno, no guarda nada")
    }

    // Step 2 — destructive, irreversible confirm (§C.3). ABANDONAR = scrap: no
    // execution is written, the session returns to pending. "Seguir" is the safe
    // way back; the red solid button is the deliberate confirm.
    private var exitDiscardContent: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            Text("¿Abandonar el entreno?")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.danger)
            Text("Se descartará lo que has registrado y el entreno volverá a quedar pendiente. Esto no se puede deshacer.")
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
            Button {
                exitStep = nil
                onExit()
            } label: {
                Text("Abandonar y descartar")
                    .font(.system(size: 16, weight: .heavy, design: .default).italic())
                    .tracking(0.5)
                    .foregroundStyle(Theme.Color.background)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Theme.Color.danger)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Abandonar y descartar el entreno, no se puede deshacer")
            SecondaryButton(title: "Seguir") { dismissExitAndResume() }
        }
    }

    // "N de M bloques" for the exit sheet — N = blocks the athlete completed
    // (the in-flight one isn't "hecho"), M = total blocks. Pluralised on M.
    private var exitBlocksDone: Int { session.completedBlockCount }
    private var exitBlocksTotal: Int { session.blockCount }
    private var exitBlockUnit: String { exitBlocksTotal == 1 ? "bloque" : "bloques" }
    private var exitChooseMessage: String {
        "Llevas \(exitBlocksDone) de \(exitBlocksTotal) \(exitBlockUnit) hechos. Puedes guardar lo que has hecho o descartarlo."
    }
    private var terminarSubcaption: String {
        "Guarda \(exitBlocksDone) de \(exitBlocksTotal) \(exitBlockUnit) · el resto queda sin completar"
    }

    // The "Terminar bloque" confirm. For an EMOM it names the honest partial
    // ("12/15 rondas hechas"); for any other format it states the block is closed
    // with whatever was done so far. Confirming records the partial and advances
    // to the next block's preview (or ends the session on the last block).
    private func endBlockPendingNav() -> PendingNav {
        if session.currentSegment?.isEMOM == true, let plan = session.currentSegment?.emomPlan {
            return PendingNav(
                title: "Terminar EMOM",
                message: "Se registrará con \(session.emomCompletedIntervals)/\(plan.intervalCount) rondas hechas; el resto queda sin completar.",
                confirmTitle: "Terminar bloque",
                action: { session.endBlockEarly() }
            )
        }
        return PendingNav(
            title: "Terminar bloque",
            message: "Se registrará lo hecho hasta ahora; el resto del bloque queda sin completar.",
            confirmTitle: "Terminar bloque",
            action: { session.endBlockEarly() }
        )
    }

    private func confirmModal(_ nav: PendingNav) -> some View {
        ZStack {
            Theme.Color.scrim.ignoresSafeArea()
                .onTapGesture { pendingNav = nil }
            CardSurface(padding: Theme.Spacing.l, radius: Theme.Radius.xl) {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    Text(nav.title)
                        .font(Theme.Typography.headlineM)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(nav.message)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                    ExpertPrimaryButton(title: nav.confirmTitle) {
                        let act = nav.action
                        pendingNav = nil
                        act()
                    }
                    SecondaryButton(title: "Cancelar") { pendingNav = nil }
                }
            }
            .padding(.horizontal, Theme.Spacing.m)
        }
        .transition(.opacity)
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
                    // Discreet, lower-hierarchy: end THIS block early (e.g. an EMOM
                    // you can't finish) — records the partial honestly and moves to
                    // the next block's preview. Confirmed before it closes.
                    if session.canEndBlockEarly {
                        Button(action: {
                            session.togglePause()       // leave the pause hold
                            showPauseConfirm = false
                            pendingNav = endBlockPendingNav()
                        }) {
                            Text("Terminar bloque")
                                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                                .foregroundStyle(Theme.Color.muted)
                                .frame(maxWidth: .infinity)
                                .frame(height: 36)
                        }
                        .buttonStyle(PressScaleStyle())
                        .accessibilityLabel("Terminar este bloque antes de tiempo")
                    }
                    // Leave the workout. Routes to the SAME honest exit decision as
                    // the top-left X — NOT a blind finish() (the old bug marked a
                    // barely-started session 'completed'). With work, the 3-option
                    // sheet (terminar y guardar / descartar) appears; with none, a
                    // clean discard. The session stays paused underneath until the
                    // athlete chooses.
                    SecondaryButton(title: "Salir del entreno") {
                        showPauseConfirm = false
                        requestExit()
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

// A pending navigation awaiting the athlete's confirmation. Holds the copy and
// the action to run on confirm (a forward skip that omits work, or a back-step
// that would discard unsaved live data).
private struct PendingNav {
    let title: String
    let message: String
    let confirmTitle: String
    let action: () -> Void
}

// The big bottom primary action (88pt, radius 14). Generalised from the old
// LAP-only button: the title is contextual ("SIGUIENTE" / "HECHO" / "TERMINAR" /
// "EMPEZAR"). The session methods own the haptic; this only flashes on tap. A
// 0.5s debounce guards against a double-fire under sweaty fingers.
private struct ExpertActionButton: View {
    let title: String
    let action: () -> Void
    @State private var flashing: Bool = false
    @State private var lastTap: Date = .distantPast

    var body: some View {
        Button {
            let now = Date()
            guard now.timeIntervalSince(lastTap) > 0.5 else { return }
            lastTap = now
            withAnimation(.easeOut(duration: 0.18)) { flashing = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                withAnimation(.easeIn(duration: 0.16)) { flashing = false }
            }
            action()
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .fill(flashing ? Theme.Color.ok : Theme.Color.accent)
                Text(title)
                    .font(.system(size: 40, weight: .heavy, design: .default).italic())
                    .tracking(3)
                    .foregroundStyle(Theme.Color.accentOn)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, Theme.Spacing.l)
            }
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(title)
    }
}
