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
    var onLeaveAndResume: (() -> Void)? = nil
    /// #23 — partner first name for the dobles RELAY screen ("{name} hace SkiErg").
    /// Nil falls back to "Tu compañero". Passed by WorkoutContainer, which holds
    /// the partner identity.
    var partnerFirstName: String? = nil
    /// The athlete's server-resolved HR bands — the SINGLE input for the zone in
    /// the treadmill / outdoor HUDs. Nil → the HUD shows the pulse without a zone
    /// rather than inventing one.
    var hrZones: HRZoneProfile? = nil
    /// #56 — athlete bearer, used to poll the training partner's live presence for the
    /// dobles strip. Nil (ad-hoc / no auth) → the strip never shows.
    var bearer: String? = nil
    /// #Marcas — this session IS a benchmark attempt: the pre-block erg gate loses
    /// its manual escape (a mark the monitor didn't measure doesn't exist).
    var isBenchmark: Bool = false

    // #56 — the training partner's live presence (polled ~every 5 s while visible) and
    // the strip's collapse state (remembered for the session).
    @State private var partnerLive: PartnerLiveStatus? = nil
    @State private var partnerStripCollapsed: Bool = false

    @State private var showTreadmill: Bool = false
    @State private var treadmillEmpiezaSinCinta: Bool = false
    @State private var showOutdoor: Bool = false
    // #8 — the last segment index whose run HUD we auto-opened. Guards the auto-open
    // to ONCE per segment, so a manual close is respected until the next run segment.
    @State private var autoOpenedRunSegment: Int? = nil
    @State private var showPauseConfirm: Bool = false
    @State private var pauseAutoResume: Int = 10
    // AUDIT-4 — generation token for the pause auto-resume chain: each time the pause
    // modal appears it bumps this, so a stale chain (pause→resume→pause within a
    // second) sees a mismatch and stops. Without it two asyncAfter chains overlapped
    // and double-fired togglePause → the session silently stuck paused.
    @State private var autoResumeGeneration: Int = 0
    @State private var showPM5Sheet: Bool = false
    // Pre-block START gates — enforced HERE, the one choke point every launch path
    // crosses (plan, libre, test, benchmark). Gating only the pre-workout brief was
    // the bug Alex hit on the rower: the free/benchmark paths SKIP the brief
    // (WorkoutContainer.loadPlan goes straight to .active), so his 500 m benchmark
    // started with the PM5 never connected. A run block with no calle/cinta answer
    // asks first; an erg block with no live monitor connects first.
    @State private var showRunGate: Bool = false
    @State private var showErgGate: Bool = false
    // The follow-up to run AFTER a gate cover finishes dismissing — presenting a
    // new cover (or starting the count-in) while the old one is mid-dismissal is
    // the modal-fighting-modal UIKit trap; onDismiss is the safe handoff point.
    @State private var gateContinuation: GateContinuation? = nil
    private enum GateContinuation { case checkErg, begin }
    @State private var showSegmentVideo: Bool = false
    // True when opening the technique video actively paused the clock, so we know
    // to resume it when the sheet is dismissed (and not resume a session the
    // athlete had already paused before opening the video).
    @State private var resumeAfterVideo: Bool = false
    @State private var pool = PM5Pool.shared
    @State private var hub = DeviceHub.shared
    /// Belt telemetry → session for the WHOLE workout, not only while the HUD
    /// cover is open. Twin of the PM5 store feed.
    @State private var treadmillFeeder: TreadmillSessionFeeder?
    /// Roles the athlete already chose «sin monitor» for this Empezar attempt.
    @State private var skippedErgRoles: Set<ErgMachineRole> = []
    @State private var skippedUnscopedErg: Bool = false
    /// Role the current erg gate is asking (nil = unscoped `any` / mono).
    @State private var gatingErgRole: ErgMachineRole? = nil
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
    /// Is an erg measuring what the athlete is doing RIGHT NOW? Pairing every named
    /// role happens at Empezar (sequential gates), not via a leftover shared chip.
    private var isErgSegment: Bool { session.tramoIsErg }

    /// Store whose numbers own the current tramo. Nil on Run / rest — never the
    /// other role's monitor (that is the «2 PM5 as 1» bug).
    private var livePM5: PM5ConnectionStore? {
        pool.activeStore(for: session.currentTramo)
    }

    /// Picker for the current tramo's role — opens that slot even if empty so
    /// live and station transition can change ID.
    private var pickerPM5: PM5ConnectionStore {
        if session.tramoIsErg, let role = ErgMachineRole(modality: session.currentTramo.modality) {
            return pool.store(for: role)
        }
        return pool.any
    }

    private var liveErgRole: ErgMachineRole? {
        guard session.tramoIsErg else { return nil }
        return ErgMachineRole(modality: session.currentTramo.modality)
    }

    private var gatingStore: PM5ConnectionStore {
        if let role = gatingErgRole { return pool.store(for: role) }
        return pool.any
    }
    private var isRunSegment: Bool {
        session.currentSegment?.kind == .running
    }
    // #60 — a RUN interval series (folded `.intervals` segment). The plain-run
    // treadmill entry lives inside RunLiveHUD, but a series routes to
    // IntervalsLiveHUD, so it needs its own "Correr en cinta" CTA here.
    // The belt follows the same rule as the monitor: a run round inside ANY format
    // (an EMOM alternating cinta / burpees) has to be able to reach the belt too.
    private var isRunSeriesSegment: Bool {
        guard let s = session.currentSegment else { return false }
        // A structured run (#61) is a leg sequence on the belt too — offer the CTA.
        return TreadmillLegResolver.isRunSeries(s) || s.hasRunStructure
            || (session.tramoIsRun && s.kind != .running)
    }
    /// Cinta is used on a run tramo AND when returning to it (cover may be closed).
    private var wantsCinta: Bool {
        session.tramoIsRun || isRunSegment || isRunSeriesSegment
            || session.runEnvironment == .treadmill
    }
    /// Chips/CTAs the host must keep mounted after a BLE drop. Pool-by-role for PM5.
    /// Cinta HUD is the in-place live — host pickers must not fight it.
    private var cintaHudMontado: Bool {
        if case .treadmill = RunLiveChrome.de(session) { return !session.isAwaitingBlockStart }
        return showTreadmill
    }
    /// Calle HUD is the in-place live — host GPS must yield.
    private var calleHudMontado: Bool {
        RunLiveChrome.de(session) == .outdoor && !session.isAwaitingBlockStart
    }

    private var liveScanPath: LiveDeviceScanPath {
        let store = pickerPM5
        return LiveDeviceScanPath.offer(
            wantsCinta: wantsCinta,
            wantsPM5: isErgSegment,
            treadmillCoverOpen: cintaHudMontado,
            treadmillLink: hub.treadmill.link,
            pm5State: store.connectionState,
            pm5ConnectionLost: store.connectionLost,
            hrLink: hub.heartRate.link,
            hrSource: session.hrSource
        )
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
    // #56 — the current station's dobles turn (mine / partner / split), or nil for
    // individual work. Drives the turn hero; `nextDoblesTurn` the "Después:" preview.
    private var currentDoblesTurn: DoblesTurn? { session.currentSegment?.doblesTurn }
    private var nextDoblesTurn: DoblesTurn? {
        session.plan.segments.nextDoblesTurn(after: session.currentSegmentIndex)
    }

    // #56 — poll the partner's live presence every ~5 s WHILE THIS VIEW IS VISIBLE (the
    // .task cancels on disappear). Stops permanently on `noPair` (a solo athlete makes
    // one request, then silence); a transient failure keeps the last snapshot.
    private func pollPartnerLive() async {
        guard bearer != nil else { return }
        var hasPair = true
        while !Task.isCancelled && hasPair {
            switch await DoblesLiveClient.fetch(bearer: bearer) {
            case .ok(let p): partnerLive = p
            case .noPair:    hasPair = false; partnerLive = nil
            case .failed:    break
            }
            if hasPair {
                try? await Task.sleep(for: .seconds(DoblesLive.heartbeatIntervalS))
            }
        }
    }

    var body: some View {
        ZStack {
            let _ = pool.epoch
            let _ = hub.treadmill.link
            let _ = hub.heartRate.link
            Theme.Color.background
                .ignoresSafeArea()
                .instrumentCanvas()
            // ROTATING work/rest full-bleed colour flip — a subtle wash so the
            // phase reads from across the box even when the phone is on the floor.
            if let flip = rotatingFlipColor {
                flip.opacity(rotatingFlipOpacity)
                    .ignoresSafeArea()
                    .animation(.easeInOut(duration: 0.3), value: session.isTramoResting)
            }
            Ambiente(zona: session.liveZone)
            superficieMontada

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
            finishDecisionOverlay
        }
        .animation(.easeInOut(duration: 0.2), value: session.isAwaitingBlockStart)
        .animation(.easeInOut(duration: 0.2), value: exitStep)
        .animation(.easeInOut(duration: 0.2), value: session.isAwaitingFinishDecision)
        // The whole workout screen ROTATES (mandate: "se voltea la UI y punto") —
        // same opt-in as the treadmill/erg HUD covers; portrait restores on exit.
        .allowsLandscape()
        .onAppear {
            session.start()
            wireLiveSources()
            // Seed the monitor flag: the athlete may have paired in the pre-start
            // gate, before this view existed, and `onChange` only fires on CHANGES.
            session.ergConnected = livePM5?.isConnected == true
            session.beltConnected = hub.treadmillConnected
            attemptProgramPM5()
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
            // Backstop for every exit that is NOT a finish (abandon, brief-back):
            // `releaseDevicesOnFinish` already ran on the finish path, and both are
            // idempotent.
            releaseDevicesOnFinish()
            UIApplication.shared.isIdleTimerDisabled = false
        }
        .task { await pollPartnerLive() }
        .onChange(of: session.isFinished) { _, finished in
            if finished {
                runGPS.stop()
                releaseDevicesOnFinish()
                onFinish()
            }
        }
        .onChange(of: session.currentSegmentIndex) { _, _ in
            updateRunGPS()
            maybeAutoOpenRunCover()
        }
        .onChange(of: session.isAwaitingBlockStart) { _, awaiting in
            // The athlete tapped "Empezar" on a block whose first segment is a run —
            // land them straight in the HUD they chose, not the generic screen.
            updateRunGPS()
            if !awaiting { maybeAutoOpenRunCover() }
        }
        .onChange(of: session.runEnvironment) { _, _ in
            updateRunGPS()
            session.ensurePhoneWorkoutRun()
        }
        .onChange(of: showOutdoor) { _, presenting in
            // Hand the GPS to the outdoor HUD when it opens; take it back on close.
            if presenting { runGPS.stop() } else { updateRunGPS() }
        }
        .onChange(of: PhoneMirrorService.shared.wristJoined) { _, joined in
            // Hand HR off to the wrist when it joins mid-run; take it back if it drops
            // so the phone keeps recording HR alone.
            if joined { liveHR.stop() } else { liveHR.start(from: session.startedAt) }
        }
        .onChange(of: pool.epoch) { _, _ in
            // Role stores are not the `@State` this view holds — `epoch` is the
            // fan-out so samples / HR / splits follow the tramo's pool slot, not
            // `.shared`.
            syncErgFromActiveStore()
            attemptProgramPM5()
        }
        .onChange(of: hub.treadmill.link) { _, _ in
            session.beltConnected = hub.treadmillConnected
        }
        .onChange(of: session.currentSegmentIndex) { _, _ in
            // A new erg piece starts with a clean interval table — the PM5's split
            // numbers can otherwise carry over between pieces in one session.
            if session.tramoIsErg { livePM5?.resetSplits() }
            // …and gets programmed onto the monitor. Non-erg segments never touch it.
            attemptProgramPM5()
        }
        .onChange(of: session.tramoKey) { _, _ in
            // A NEW WORK WINDOW inside the same segment — round 3 of a ski EMOM,
            // bout 2 of a 5×500. When the app clocks the series, the piece is sent
            // again here so the monitor's counter is back at zero for it (Alex:
            // "cada ronda la app debe mandar el reinicio del pm5").
            attemptProgramPM5()
        }
        .sheet(isPresented: $showPM5Sheet, onDismiss: { maybeAutoOpenRunCover() }) {
            PM5LiveStreamView(store: pickerPM5, roleTitle: liveErgRole?.titleES)
        }
        // Live scan path (FH-59): same pickers as the brief / HUD, presented from
        // the host so a drop can be recovered without the cover and without
        // beginBlock. Disabled while the treadmill HUD is up — it presents the
        // same channels, and two presenters fight.
        .sheet(isPresented: livePickerBinding(hub.treadmill, enabled: !cintaHudMontado)) {
            DevicePickerSheet(channel: hub.treadmill)
        }
        .sheet(isPresented: livePickerBinding(hub.heartRate, enabled: !cintaHudMontado)) {
            DevicePickerSheet(channel: hub.heartRate,
                              batteryPercent: hub.hrBatteryPercent)
        }
        .fullScreenCover(isPresented: $showTreadmill) {
            TreadmillHUDView(session: session, hrZones: hrZones,
                             empiezaSinCinta: treadmillEmpiezaSinCinta,
                             alSalir: { showTreadmill = false })
        }
        .fullScreenCover(isPresented: $showOutdoor) {
            OutdoorRunHUDView(session: session, hrZones: hrZones,
                              alSalir: { showOutdoor = false })
        }
        // Pre-block gates (see `requestBlockStart`). Continuations run in onDismiss
        // so the next cover / the count-in never fights the dismissing one.
        .fullScreenCover(isPresented: $showRunGate, onDismiss: { continueAfterRunGate() }) {
            RunPreStartFlow(
                sessionTitle: session.plan.name,
                onStart: { env in
                    session.runEnvironment = env
                    session.ensurePhoneWorkoutRun()
                    gateContinuation = .checkErg
                    showRunGate = false
                },
                onCancel: { showRunGate = false }
            )
        }
        .fullScreenCover(isPresented: $showErgGate, onDismiss: { continueAfterErgGate() }) {
            ErgPreStartFlow(
                sessionTitle: session.plan.name,
                machineWord: ergMachineWord,
                isBenchmark: isBenchmark,
                store: gatingStore,
                roleTitle: gatingErgRole?.titleES,
                onStart: {
                    gateContinuation = .begin
                    showErgGate = false
                },
                onCancel: { showErgGate = false }
            )
        }
        .sheet(isPresented: $showSegmentVideo, onDismiss: {
            // Resume only if opening the video is what paused the clock.
            if resumeAfterVideo { session.resumeFromVideo() }
            resumeAfterVideo = false
            maybeAutoOpenRunCover()     // the screen is free again — see the guard
        }) {
            if let url = session.currentSegment?.videoUrl {
                VideoDeTecnicaSheet(url: url, title: session.currentSegment?.title ?? "Técnica")
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
                onEmpezar: { requestBlockStart() },
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
            let cycle = "cada \(Formato.clock(emom.intervalSeconds, subMinuto: .segundos))"
            // An INTERVAL EMOM leads with its split — "45/15" is what the athlete
            // is about to pace against, the cycle is the consequence.
            let shape = emom.hasTransition
                ? "\(emom.workSeconds)/\(emom.restSeconds) · \(cycle)"
                : cycle
            return "EMOM · \(emom.intervalCount) rondas · \(shape)"
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
            if let t = seg.formatTotalSeconds { parts.append(Formato.clock(t, subMinuto: .segundos)) }
        case .tabata:
            if let w = seg.formatWorkSeconds, let r = seg.formatRestSeconds { parts.append("\(w)/\(r)s") }
            if let n = seg.formatRounds { parts.append("×\(n)") }
        case .intervals:
            if let n = seg.formatRounds { parts.append("\(n) series") }
        case .deathBy:
            parts.append("+\(seg.deathByIncrement)/min")
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            if let n = seg.formatRounds, n > 1 { parts.append("\(n) rondas") }
            if let cap = seg.formatTotalSeconds { parts.append("cap \(Formato.clock(cap, subMinuto: .segundos))") }
        default:
            break
        }
        return parts.joined(separator: " · ")
    }

    private var segmentHasVideo: Bool {
        VideoDeTecnica.hay(en: session.currentSegment?.videoUrl)
    }

    // `attemptPM5IfNeeded()` USED TO LIVE HERE, called on appear and on EVERY segment
    // change: reaching an erg segment silently reopened the last paired PM5. Deleted.
    // Arriving at a piece of work is not consent to grab a machine — the athlete opens
    // the erg sheet and taps the erg he is on. If nothing is connected he simply rows
    // and the app records what it can, exactly as it does for an unrecognised belt.

    /// Program the CURRENT erg piece on the connected PM5 (ErgData behavior: the
    /// monitor loads the workout and shows "row to begin"; the athlete touches
    /// nothing).
    ///
    /// The window key is what decides when the piece is (re)sent, and therefore when
    /// the monitor's counter goes back to zero. When the APP clocks the series — an
    /// EMOM on the ski, a Tabata on the bike — every round is its own window, so
    /// each round starts the monitor from zero, which is exactly what the athlete
    /// asked for and what the old once-per-segment guard never did. When the MONITOR
    /// clocks the series (native intervals), the segment stays the window: re-sending
    /// would restart the whole piece under him.
    private func attemptProgramPM5() {
        // Key off the current tramo, not `seg.involvesErg` — that kept programming
        // shared during a Run station of a folded chipper.
        guard session.tramoIsErg, let store = livePM5, let seg = session.currentSegment else { return }
        let key = PM5WorkoutProgrammer.monitorRunsTheSeries(seg)
            ? "seg-\(seg.id.uuidString)"
            : session.currentTramo.key
        store.programIfNeeded(for: seg, windowKey: key)
    }

    /// Feed the session from the tramo's pool slot. No-op on Run so a connected
    /// Remo cannot write metres into a run window.
    private func syncErgFromActiveStore() {
        let store = livePM5
        session.ergConnected = store?.isConnected == true
        guard let store, store.isConnected else { return }
        if let bpm = store.live.heartRateBpm { session.injectLiveHR(bpm, source: .pm5) }
        session.sampleErg(
            paceSecPer500m: store.live.paceSecondsPer500m,
            powerWatts: store.live.powerWatts,
            strokeRate: store.live.strokeRate,
            distanceMeters: store.live.distanceMeters,
            caloriesKcal: store.live.caloriesKcal,
            dragFactor: store.live.dragFactor,
            caloriesPerHour: store.live.caloriesPerHour,
            monitorAvgPaceSecPer500m: store.live.avgPaceSecondsPer500m,
            peakDriveForceLbs: store.live.peakDriveForceLbs,
            avgDriveForceLbs: store.live.avgDriveForceLbs
        )
        session.captureErgSplits(store.splits)
    }

    private func openPM5Picker() {
        let store = pickerPM5
        store.excludePeripheralIds = pool.occupiedPeripheralIds
            .subtracting([store.connectedIdentifier].compactMap { $0 })
        showPM5Sheet = true
    }

    private func openCintaPicker() {
        hub.treadmill.openPicker()
    }

    private func openHRPicker() {
        hub.heartRate.openPicker()
    }

    /// Same latch as DeviceConnectCard: a presenter that isn't on screen cannot
    /// raise its sheet (cover vs host fight).
    private func livePickerBinding(_ channel: DeviceChannel, enabled: Bool) -> Binding<Bool> {
        Binding(get: { enabled && channel.isPresentingPicker },
                set: { if enabled { channel.isPresentingPicker = $0 } })
    }

    /// Let go of every machine the moment the work ends — before the summary, not
    /// after it. 28-jul: "al terminar no se desconecta el ergo, hay que soltarlo
    /// antes de terminar/guardar". The erg was released only when this view left the
    /// hierarchy, and the treadmill / HR strap not until the whole workout flow
    /// unwound, so the next athlete at that machine found it still paired.
    ///
    /// The ONE exception is a guided test's HR-recovery window: that measurement
    /// happens AFTER the finish, so the strap has to keep streaming until it closes.
    /// Everything else goes now.
    private func releaseDevicesOnFinish() {
        pool.disconnectAll()
        DeviceHub.shared.stopTreadmill()
        guard session.hrRecovery == nil else { return }
        liveHR.stop()
        DeviceHub.shared.stopHeartRate()
    }

    // Hook the optional providers' callbacks into the session. Done once on
    // appear; the closures capture `session`, which is stable for the screen.
    private func wireLiveSources() {
        // Distancia de carrera: la cuenta Apple (`RunPedometer`) en la vista
        // activa / HUD outdoor. RunLocationProvider ya no emite onDistanceDelta.
        liveHR.onSample = { bpm in
            session.injectLiveHR(bpm, source: .healthkit)
        }
        // A BLE chest/arm strap connected in the pre-workout brief now records into
        // the ENGINE (zones + hr_avg), not just the treadmill HUD's display — so it
        // counts on any workout, with or without a treadmill cover open. Highest HR
        // priority (a dedicated strap beats the watch). Torn down with the shared
        // device layer in DeviceHub.stopAll() (WorkoutContainer teardown).
        DeviceHub.shared.onBpm = { bpm in
            session.injectLiveHR(bpm, source: .strap)
        }
        feedTreadmill()
    }

    /// THE recording's belt feed for the whole workout. `DeviceHub.onRecordSample`
    /// runs before the HUD's `onSample`, so metres that close a leg land in THIS
    /// lap. Also keeps `beltConnected` in lock-step with the hub — twin of
    /// `syncErgFromActiveStore` / `ergConnected`.
    private func feedTreadmill() {
        let feeder = treadmillFeeder ?? TreadmillSessionFeeder(session: session)
        treadmillFeeder = feeder
        hub.onRecordSample = { sample in
            feeder.ingest(sample)
        }
        session.beltConnected = hub.treadmillConnected
    }

    private func openTreadmillCover() {
        treadmillEmpiezaSinCinta = session.runEnvironment == .indoor
        showTreadmill = true
    }

    // A run / runStructure / warmup-of-the-run already IS Outdoor/Treadmill
    // via `RunLiveChrome`. Opening a cover on top of HostVivo was the stack
    // (FH-55 leftover on 49). Folded-format run stations still use a cover.
    private func maybeAutoOpenRunCover() {
        if SuperficieViva.de(session).esCarrera { return }
        if session.calentamientoEnLaCarrera { return }
        if RunLiveChrome.de(session) != .host { return }
        guard let env = session.runEnvironment,
              isRunSegment,
              !session.isAwaitingBlockStart,
              autoOpenedRunSegment != session.currentSegmentIndex,
              !showTreadmill, !showOutdoor,
              // NEVER push a cover over an open sheet. This fires off SESSION state
              // (the engine advancing a segment), so it can land while the athlete has
              // the erg sheet or a technique video open — and UIKit answers a modal
              // fighting a modal with "only presenting a single sheet is supported",
              // eating his taps. `autoOpenedRunSegment` is deliberately NOT stamped on
              // this path, and both sheets re-run this check on dismiss, so he still
              // lands in his HUD the moment the screen is free.
              !showPM5Sheet, !showSegmentVideo else { return }
        autoOpenedRunSegment = session.currentSegmentIndex
        switch RunCoverAutoOpen.decide(environment: env) {
        case .treadmill(let sinCinta):
            treadmillEmpiezaSinCinta = sinCinta
            showTreadmill = true
        case .outdoor:
            showOutdoor = true
        }
    }

    // MARK: - Pre-block start gates (run env → erg connect → count-in)

    /// Every EMPEZAR on the block gate lands here — the ONE enforcement point.
    /// Order: a run block missing the calle/cinta answer asks it first (the answer
    /// decides which HUD auto-opens); then an erg block with no live monitor runs
    /// the connect sequence; only then the block's clock starts. Already answered /
    /// already connected → straight through, no extra screens.
    private func requestBlockStart() {
        skippedErgRoles = []
        skippedUnscopedErg = false
        let segs = upcomingBlockSegments
        if session.runEnvironment == nil,
           segs.contains(where: { $0.kind == .running }) || session.calentamientoEnLaCarrera {
            showRunGate = true
        } else if presentErgGateIfNeeded() {
            return
        } else {
            session.beginBlock()
        }
    }

    private var upcomingBlockSegments: [WorkoutSegment] {
        guard let region = session.currentBlockRegion else { return [] }
        return session.plan.segments(in: region)
    }

    private func connectedNamedRoles(in segs: [WorkoutSegment]) -> Set<ErgMachineRole> {
        Set(PreWorkoutDeviceEligibility.namedErgRoles(in: segs).filter { pool.isRoleConnected($0) })
    }

    /// Present the next missing role's connect screen. Returns true if a cover
    /// is up. «sin monitor» is recorded per role so the chain can continue.
    @discardableResult
    private func presentErgGateIfNeeded() -> Bool {
        let segs = upcomingBlockSegments
        if let role = PreWorkoutDeviceEligibility.missingErgRoles(
            in: segs,
            roleConnected: connectedNamedRoles(in: segs),
            anyConnected: pool.any.isConnected,
            skipped: skippedErgRoles
        ).first {
            gatingErgRole = role
            let store = pool.store(for: role)
            store.excludePeripheralIds = pool.occupiedPeripheralIds
                .subtracting([store.connectedIdentifier].compactMap { $0 })
            showErgGate = true
            return true
        }
        if PreWorkoutDeviceEligibility.needsUnscopedErgConnect(
            in: segs,
            anyConnected: pool.any.isConnected,
            skipped: skippedUnscopedErg
        ) {
            gatingErgRole = nil
            showErgGate = true
            return true
        }
        return false
    }

    /// "el remo" / "el SkiErg" / "la bici" for the connect header — the ROLE
    /// being asked, never the first `kind.isErg` title (a folded chipper is `.reps`).
    private var ergMachineWord: String {
        gatingErgRole?.machineWord ?? "el remo"
    }

    /// Run gate answered → the same block may still need the erg (a HYROX sim has
    /// run + row): chain the connect gate, else start. A cancel leaves the athlete
    /// on the block preview, nothing begun.
    private func continueAfterRunGate() {
        guard gateContinuation == .checkErg else { return }
        gateContinuation = nil
        if presentErgGateIfNeeded() { return }
        session.beginBlock()
    }

    private func continueAfterErgGate() {
        guard gateContinuation == .begin else { return }
        gateContinuation = nil
        if let role = gatingErgRole {
            if !pool.store(for: role).isConnected { skippedErgRoles.insert(role) }
        } else if !pool.any.isConnected {
            skippedUnscopedErg = true
        }
        if presentErgGateIfNeeded() { return }
        session.beginBlock()
    }

    // Start phone GPS only on run segments (and only if not denied); stop it
    // otherwise so we don't hold the location indicator during erg/strength work.
    private func updateRunGPS() {
        // Indoor / cinta: GPS off. Calle: GPS only when the street screen is not
        // already owning the stream. Wrist recording does not change ownGPS here —
        // `RunPhoneSensorPlan` already encodes that split.
        let plan = RunPhoneSensorPlan.decide(
            isRunSegment: isRunSegment,
            environment: session.runEnvironment,
            streetScreenOwnsSurface: calleHudMontado || showOutdoor,
            wristIsRecording: PhoneMirrorService.shared.wristJoined
        )
        if plan.ownGPS {
            runGPS.start()
        } else {
            runGPS.stop()
        }
    }

    private var connectPM5CTA: some View {
        Button(action: { openPM5Picker() }) {
            HStack(spacing: Theme.Spacing.s) {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(.system(size: 12, weight: .semibold))
                Text(liveErgRole.map { "CONECTAR \($0.titleES.uppercased())" } ?? "CONECTAR PM5")
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
                // Sin tramo abierto (el entreno acaba de cerrarse) no hay título que
                // dar: la línea desaparece, igual que la fase de arriba (§7).
                if let titulo = session.currentSegment?.title {
                    MonoText(text: titulo.uppercased(), size: 11, color: Theme.Color.muted)
                        .lineLimit(1)
                }
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

    // #23 · #56 — HYROX dobles RELAY surface: the partner works this station while the
    // athlete recovers. The turn HERO names the partner (blue), the station and the reps
    // they carry, plus the "Después: tú" preview; below it the recovery clock + live HR.
    // "Relevo ▸" advances to the athlete's own next station. Nothing is logged here.
    @ViewBuilder
    private var relaySurface: some View {
        VStack(spacing: 16) {
            if let turn = currentDoblesTurn {
                DoblesTurnHero(turn: turn, next: nextDoblesTurn,
                               compact: false, partnerFallback: partnerFirstName)
            }
            Text("Recupera")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.muted)
                .padding(.top, 2)
            Text(Formato.clock(session.lapElapsedSeconds, anchoFijo: true))
                .font(.system(size: 52, weight: .heavy, design: .monospaced))
                .foregroundStyle(Theme.Color.foreground)
            if let bpm = session.liveHRBpm {
                HStack(spacing: 6) {
                    Image(systemName: "heart.fill").foregroundStyle(Theme.Color.danger)
                    Text("\(bpm) ppm")
                        .font(.system(size: 16, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.m)
    }

    // UN MARCO. El tramo decide la LECTURA; el cromo y la acción son siempre
    // `MarcoVivo` + `BotonVivo`. El árbol que devolvía nil (y pintaba phaseRail
    // PRINCIPAL naranja + ExpertActionButton 40 pt) ya no existe.
    @ViewBuilder
    private var superficieMontada: some View {
        switch SuperficieViva.de(session) {
        case .emom:
            EmomVivoView(session: session,
                         accionTitulo: primaryTitle,
                         alTocarAccion: { primaryAction() }) { topStrip }
        case .fuerza:
            FuerzaVivoView(session: session,
                           accionTitulo: primaryTitle,
                           alTocarAccion: { primaryAction() }) { topStrip }
        case .relay:
            HostVivo(session: session, accion: accionDelHost) {
                topStrip
            } sujeto: {
                relaySurface
            } apoyos: {
                EmptyView()
            }
        case .structural:
            HostVivo(session: session, accion: accionDelHost) {
                topStrip
            } sujeto: {
                structuralWorkSurface
            } apoyos: {
                EmptyView()
            }
        case .rest:
            HostVivo(session: session, accion: accionDelHost) {
                topStrip
            } sujeto: {
                RestSurface(session: session)
            } apoyos: {
                apoyosDelHost
            }
        case .ergo:
            HostVivo(session: session, accion: accionDelHost) {
                topStrip
            } sujeto: {
                ErgHUDContent(session: session, pm5: livePM5 ?? pool.any)
            } apoyos: {
                apoyosDelHost
            }
        case .runStructure:
            cromoDeCarrera
        case .conditioning:
            HostVivo(session: session, accion: accionDelHost) {
                topStrip
            } sujeto: {
                sujetoDeConditioning
            } apoyos: {
                apoyosDelHost
            }
        case .run:
            cromoDeCarrera
        }
    }

    /// One live for correr. Outdoor / cinta mount in place once calle/cinta
    /// is known — including the warmup block that opens that run. HostVivo
    /// only while the gate still holds. Never a second cover on top (FH-55).
    @ViewBuilder
    private var cromoDeCarrera: some View {
        switch RunLiveChrome.de(session) {
        case .outdoor:
            OutdoorRunHUDView(session: session, hrZones: hrZones,
                              alSalir: { requestExit() })
        case .treadmill(let sinCinta):
            TreadmillHUDView(session: session, hrZones: hrZones,
                             empiezaSinCinta: sinCinta,
                             alSalir: { requestExit() })
        case .host:
            HostVivo(session: session, accion: accionDelHost) {
                topStrip
            } sujeto: {
                RunLiveHUD(session: session, gpsActive: gpsActive,
                           onTapTreadmill: { openTreadmillCover() },
                           onTapOutdoor: { showOutdoor = true })
            } apoyos: {
                apoyosDelHost
            }
        }
    }

    private var accionDelHost: AccionDelHost {
        if session.currentSegmentIsPartnerRelay {
            return .una(titulo: "Relevo ▸", unicaSalida: true, nota: nil, act: { session.advanceRelay() })
        }
        if session.currentSegment?.formatScheme == .deathBy && session.condCountInRemaining <= 0 {
            return .deathBy(falle: { session.deathByFail() }, logre: { session.deathByLogged() })
        }
        return .una(titulo: primaryTitle,
                    unicaSalida: session.currentBlockIsStructural,
                    nota: nil,
                    act: { primaryAction() })
    }

    @ViewBuilder
    private var sujetoDeConditioning: some View {
        VStack(spacing: Theme.Spacing.s) {
            conditioningHUD
            if let store = livePM5, store.isConnected, !session.isStationTramo {
                ErgLiveStrip(session: session, pm5: store)
            }
        }
    }

    @ViewBuilder
    private var apoyosDelHost: some View {
        VStack(spacing: Theme.Spacing.s) {
            DoblesLiveStrip(state: DoblesLiveStripState.from(partnerLive),
                            collapsed: $partnerStripCollapsed)
            ConnectionStrip(
                session: session,
                pm5: livePM5 ?? pickerPM5,
                gpsActive: gpsActive,
                segmentIsErg: isErgSegment,
                segmentIsRun: isRunSegment || session.tramoIsRun,
                onTapPM5: { openPM5Picker() },
                roleTitle: liveErgRole?.titleES,
                path: liveScanPath,
                treadmillLink: hub.treadmill.link,
                hrLink: hub.heartRate.link,
                onTapCinta: { openCintaPicker() },
                onTapHR: { openHRPicker() }
            )
            if session.plan.segments.count > 1, session.tramoRoundTotal <= 1 {
                BlockIntervalStrip(
                    segments: session.plan.segments,
                    currentIndex: session.currentSegmentIndex,
                    onTap: { requestJump(to: $0) }
                )
            }
            if let turn = currentDoblesTurn, !session.currentSegmentIsPartnerRelay {
                DoblesTurnHero(turn: turn, next: nextDoblesTurn,
                               compact: true, partnerFallback: partnerFirstName)
            }
            if session.currentSegmentIsMetcon {
                RxScaledToggle(session: session)
            }
            if liveScanPath.showPM5Chip && livePM5?.isConnected != true {
                connectPM5CTA
            }
            if liveScanPath.showTreadmillEntry {
                TreadmillEntryButton(action: { openTreadmillCover() })
            }
            if isRunSeriesSegment, SuperficieViva.de(session) != .run {
                OutdoorEntryButton(action: { showOutdoor = true })
            }
            Spacer(minLength: 0)
            if !session.isTramoResting, !isErgSegment {
                SiguienteTramoChip(siguiente: session.nextSegment)
                    .padding(.bottom, 6)
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }

    @ViewBuilder
    private var conditioningHUD: some View {
        switch session.currentSegment?.formatScheme {
        case .amrap:     AmrapLiveHUD(session: session)
        // Tabata / intervals / deathBy / steady HUDs were removed 5-ago
        // (WorkoutFormatHUDs). Same remaining face as For Time / rounds.
        case .tabata, .intervals, .deathBy, .steady:
            ForTimeLiveHUD(session: session)
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            ForTimeLiveHUD(session: session)
        case .emom, .sets, .warmup, .cooldown, .superset, .none:
            // Inalcanzable por construcción: `isConditioningTimer` ya excluye estos
            // cuatro esquemas y el nil. Se escriben en vez de un `default` para que
            // un esquema NUEVO no caiga aquí en silencio — que el compilador avise.
            EmptyView()
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
            return session.tituloHechoEstructural
        }
        // #61 structured run: skip the count-in, then advance the leg cursor. A WORK
        // leg is closed by "TRAMO HECHO" (the honest manual/belt affordance — a
        // distance leg without a belt has no live GPS yet), a recovery by skipping it.
        if session.isRunStructureActive {
            if session.isRunCountIn { return "SALTAR" }
            if session.isLastSegment && session.runLegNumber >= session.runLegTotal { return "TERMINAR" }
            return session.isRunLegWork ? "TRAMO HECHO" : "SALTAR DESCANSO"
        }
        if session.currentSegment?.isEMOM == true {
            // During the post-Empezar 3-2-1, the button SKIPS the count-in.
            if session.emomCountInRemaining > 0 { return "SALTAR" }
            // Interval EMOM: finishing the work early opens the change window, so
            // say so — "SIGUIENTE" would promise the next round and deliver a change.
            if session.currentSegment?.emomPlan?.hasTransition == true,
               session.emomIntervalsRemaining > 0 {
                return session.emomPhase == .work ? "HE ACABADO" : "EMPEZAR RONDA"
            }
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
    // uses dual BotonVivo (FALLÉ / LO LOGRÉ) — this label is for accessibility.
    private var conditioningPrimaryTitle: String {
        if session.condCountInRemaining > 0 { return "SALTAR" }
        switch session.currentSegment?.formatScheme {
        case .amrap:     return "+ RONDA"
        case .tabata:    return "+ REPS"
        case .intervals: return session.rotPhase == .work ? "SERIE HECHA" : "SALTAR DESCANSO"
        case .deathBy:   return "LO LOGRÉ"
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim, .steady:
            // On a ROUTE the button closes the STATION, so it has to say so — and it
            // stays available even when the machine is about to close it by itself:
            // the automatic exit removes a tap, never the athlete's freedom to cut a
            // piece short, take a broken monitor out of the loop, or move on.
            if session.currentSegment?.fixedListIsStations == true {
                let last = session.fixedRoundsDone >= session.fixedListTotal - 1
                if last { return session.isLastSegment ? "TERMINAR" : "ÚLTIMA HECHA" }
                return "ESTACIÓN HECHA"
            }
            return session.isLastSegment ? "TERMINAR" : "HECHO"
        default:         return "SIGUIENTE"
        }
    }

    // The full-bleed work/rest wash. Blue means "you are not working right now" and
    // it applies to EVERY engine that rests — an EMOM change window used to get no
    // wash at all, so the one phase the athlete most needs to recognise from across
    // the box looked exactly like the work.
    private var rotatingFlipColor: Color? {
        // #61 structured run: the wash flips with the LEG kind, off the leg cursor.
        if session.isRunStructureActive {
            guard !session.isRunCountIn else { return nil }
            return session.isRunLegWork ? Theme.Color.accent : Theme.Color.info
        }
        guard !session.isTramoCountIn else { return nil }
        if session.isTramoResting { return Theme.Color.info }
        switch session.currentSegment?.formatScheme {
        case .tabata, .intervals:
            return Theme.Color.accent
        default:
            return nil
        }
    }

    /// How hard the wash reads. Work is a hint (the numbers are the message); REST
    /// is an identity — the athlete has to know he is resting at a glance, from the
    /// floor, without reading anything. 28-jul: "el azul del descanso, más visible".
    private var rotatingFlipOpacity: Double {
        session.isTramoResting ? 0.24 : 0.10
    }

    // MARK: - Navigation requests (confirm where the move is destructive)

    // BlockIntervalStrip / segment stepper. A forward jump that OMITS intermediate work
    // confirms; an adjacent forward step is the normal advance. A backward jump
    // reopens; it confirms only if the current segment has unsaved live progress.
    private func requestJump(to index: Int) {
        let current = session.currentSegmentIndex
        guard index != current else { return }
        if index > current {
            let omitted = index - current - 1
            if omitted > 0 {
                pendingNav = PendingNav(
                    title: jumpTargetTitle(index).map { "Saltar a \($0)" } ?? "Saltar hacia delante",
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
                title: jumpTargetTitle(index).map { "Volver a \($0)" } ?? "Volver atrás",
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

    // El nombre del tramo al que vas, o nil si el índice no cae en el plan. Quien
    // compone el título decide: «Saltar a —» no es una pregunta que nadie pueda
    // contestar.
    private func jumpTargetTitle(_ index: Int) -> String? {
        guard index >= 0, index < session.plan.segments.count else { return nil }
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

    // The PRESCRIPTION IS DONE overlay. Reaching the end of the plan is a moment,
    // not a trapdoor: it used to drop the athlete straight into the summary, so a
    // session he wanted to extend was over before he could say so. The work is
    // still on the phone — POST / GUARDAR is what persists it (not this overlay).
    // Terminar is the accent default (it IS the expected answer), Seguir is right
    // beside it, and the scrim does nothing — this is a real choice, not a dialog
    // to dismiss by accident.
    @ViewBuilder
    private var finishDecisionOverlay: some View {
        if session.isAwaitingFinishDecision {
            ZStack {
                Theme.Color.scrim.ignoresSafeArea()
                CardSurface(padding: Theme.Spacing.l, radius: Theme.Radius.xl) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        Text("Has acabado el entreno")
                            .font(Theme.Typography.headlineM)
                            .foregroundStyle(Theme.Color.foreground)
                        Text("Aún no está guardado. Si te apetece seguir, sigue: lo que añadas se suma.")
                            .font(Theme.Typography.small)
                            .foregroundStyle(Theme.Color.muted)
                        ExpertPrimaryButton(title: "Terminar y guardar") { session.finish() }
                        Button { session.continueAfterPrescribedWork() } label: {
                            Text("Seguir entrenando")
                                .font(.system(size: 15, weight: .heavy, design: .default).italic())
                                .foregroundStyle(Theme.Color.foreground)
                                .frame(maxWidth: .infinity)
                                .frame(height: 48)
                                .background(Theme.Color.surfaceElevated)
                                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1))
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                        }
                        .buttonStyle(PressScaleStyle())
                    }
                }
                .padding(.horizontal, Theme.Spacing.m)
            }
            .transition(.opacity)
        }
    }

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
            // AUDIT-4 — a fresh chain; any previous one is invalidated by the bump.
            autoResumeGeneration += 1
            countdownAutoResume(generation: autoResumeGeneration)
        }
    }

    private func countdownAutoResume(generation: Int) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            // Stop if the modal closed OR a newer chain superseded this one.
            guard showPauseConfirm, generation == autoResumeGeneration else { return }
            if pauseAutoResume <= 1 {
                session.togglePause()
                showPauseConfirm = false
            } else {
                pauseAutoResume -= 1
                countdownAutoResume(generation: generation)
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
