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

    // AQUÍ VIVÍAN `showTreadmill`, `showOutdoor` y `autoOpenedRunSegment` (5-ago).
    // Las dos pantallas de correr eran `fullScreenCover` y se auto-abrían al entrar
    // al tramo, así que había SIEMPRE dos superficies vivas para el mismo trabajo:
    // el HUD de la ranura seguía montado debajo, con otras reglas de ritmo y de
    // cierre, y cerrar el cover enseñaba otra pantalla del mismo tramo. Ahora correr
    // es una superficie viva más (ver `superficieViva`): no hay cover que abrir, no
    // hay estado de apertura que guardar y no hay nada debajo.
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
    /// Multi-PM5 pool: role-bound Remo/Ski/Bike + unscoped fallback. The live
    /// store is resolved per tramo modality (`activePM5`).
    @State private var pool = PM5Pool.shared
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
    /// El contador de Apple. Sustituye al nuestro (ver `RunPedometer`).
    @State private var pedometro = RunPedometer()
    @State private var liveHR = LiveHeartRateProvider()
    /// THE owner of the belt → session recording, alive for the whole workout (see the
    /// type). Wired to the shared device layer in `wireLiveSources`, like the strap.
    @State private var beltFeeder: TreadmillSessionFeeder?
    /// Drives the erg surface's portrait↔landscape arrangement (`.compact` = landscape).
    @Environment(\.verticalSizeClass) private var vSizeClass

    /// Does a Concept2 monitor have anything to do with this segment — now, or in a
    /// later round of the format it runs? This is the CONNECT question: the athlete
    /// has to be able to pair the ski before the ski minute arrives, and a ski/bike
    /// EMOM collapses to a non-erg segment kind, which is precisely why the connect
    /// button was missing from it (28-jul: "no se puede conectar el pm5").
    private var segmentInvolvesErg: Bool {
        session.currentSegment?.involvesErg == true
    }
    /// Is an erg measuring what the athlete is doing RIGHT NOW? This is the SCREEN
    /// question — whose numbers own the surface this second.
    private var isErgSegment: Bool { session.tramoIsErg }

    /// PM5 store for the CURRENT tramo (ski minute → ski store, remo → remo).
    /// Falls back to the unscoped store when only one monitor is connected.
    private var activePM5: PM5ConnectionStore {
        pool.activeStore(for: session.currentTramo) ?? pool.any
    }

    /// Any PM5 linked this session (for "connect before start" gates and sheets).
    private var anyPM5Connected: Bool { pool.anyConnected }
    /// Landscape + a device-measured window → that surface takes the whole screen.
    /// There is no second erg view and no "ver en grande" cover: rotating the phone
    /// IS the gesture, and the SAME component re-lays itself out. It now includes
    /// erg work INSIDE a format (a ski EMOM turned sideways used to give a cropped
    /// generic timer), and the rest, which reads even better big.
    /// Excluded: the dobles relay, structural blocks (warmup/cooldown checklists)
    /// and the pre-block gate, which owns the screen.
    private var isErgLandscapeFocus: Bool {
        vSizeClass == .compact
            && (isErgSegment || (session.isTramoResting && segmentInvolvesErg))
            && !session.currentSegmentIsPartnerRelay
            && !(session.currentBlockIsStructural && !MachineTramoLaw.machineOwnsHUD(tramo: session.currentTramo))
            && !session.isAwaitingBlockStart
    }
    private var isRunSegment: Bool {
        session.currentSegment?.kind == .running
    }
    // AQUÍ VIVÍA `isRunSeriesSegment`, la condición de los botones «Correr en
    // cinta» / «Correr fuera». Era la MISMA decisión escrita en dos sitios (la otra
    // copia iba dentro de `RunLiveHUD`), y las dos abrían covers. Con los botones se
    // fue la condición; lo que queda —cuándo ofrecer CAMBIAR DE SITIO— se lee de
    // `session.tramoIsRun`, que es la pregunta de verdad: ¿la ventana activa es
    // correr?
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
            if let viva = superficieViva {
                // EL LENGUAJE DEL §10: estas superficies montan su propio marco
                // (`MarcoVivo`) porque el ancla del sujeto es una propiedad de la
                // PANTALLA, no de una vista — ver `superficieViva`. En el EMOM y el
                // hierro el cromo y la acción siguen siendo de aquí y sólo cambia
                // quién los coloca; las dos de correr traen los suyos (su cromo lleva
                // el altavoz y la pausa, y su acción cierra el tramo), y por eso se
                // les pasa a dónde va el aspa: a SALIR DEL ENTRENO, no a cerrar una
                // pantalla que ya no tiene nada detrás.
                Ambiente(zona: session.liveZone)
                switch viva {
                case .emom:
                    EmomVivoView(session: session,
                                 accionTitulo: primaryTitle,
                                 alTocarAccion: { primaryAction() }) { topStrip }
                case .fuerza:
                    FuerzaVivoView(session: session,
                                   accionTitulo: primaryTitle,
                                   alTocarAccion: { primaryAction() }) { topStrip }
                case .correrFuera:
                    OutdoorRunHUDView(session: session, hrZones: hrZones,
                                      alSalir: { requestExit() })
                case .correrCinta:
                    TreadmillHUDView(session: session, hrZones: hrZones,
                                     alSalir: { requestExit() })
                }
            } else if isErgLandscapeFocus {
                // ROTATED ON AN ERG: the athlete turned the phone precisely to get the
                // big numbers, so the device surface owns the screen. The chrome kept
                // is `topStrip` (salir / pausa / atrás) so he is never trapped. The
                // action lives at the bottom in BOTH orientations or the rule isn't a
                // rule — but it lives INSIDE the surface, not in a 132 pt column of
                // its own: that column squeezed the HUD sideways (the hero split sat
                // off-centre) while truncating its own label. Working, the manual
                // close is the emergency exit (the machine crossing the goal is the
                // normal one) and ends the rail; resting, the action is the subject
                // and goes big inside the field. Ver el doble (vivo-erg/regata.tsx).
                VStack(spacing: 6) {
                    topStrip
                    if session.isTramoResting {
                        RestSurface(session: session,
                                    accion: AnyView(landscapeRestAction))
                    } else {
                        ErgHUDContent(session: session, pm5: activePM5,
                                      salida: AnyView(landscapeSalida))
                    }
                }
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.top, 4)
                .padding(.bottom, 6)
            } else {
            VStack(spacing: 8) {
                topStrip
                phaseRail
                // #56 — the training partner's live strip (Peloton-style). Hidden when
                // there's no pair / no presence; collapsible so the athlete's own work
                // stays the focus. Above the HUD, never over the controls.
                DoblesLiveStrip(state: DoblesLiveStripState.from(partnerLive),
                                collapsed: $partnerStripCollapsed)
                // THE ACTION IS NEVER NEGOTIABLE. Turned sideways there is barely a
                // third of the height, and a HUD that does not shrink (the per-set
                // strength table, a long route) pushed the button off the bottom
                // edge — the athlete could see his work and not close it. So in
                // landscape the WORK scrolls and the action is pinned under it, in
                // every format. Portrait is untouched: the same children, in the
                // same order, with the same spacing.
                if isCompactHeight && !surfaceScrollsItself {
                    ScrollView(showsIndicators: false) {
                        VStack(spacing: 8) { liveSurface }
                    }
                    .frame(maxHeight: .infinity)
                    liveAction
                } else {
                    liveSurface
                    liveAction
                }
            }
            .padding(.horizontal, Theme.Spacing.m)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, 10)
            }

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
            // Free workouts open the mirror BEFORE this view mounts; push a frame
            // the instant the engine is live so the wrist leaves "Conectando…".
            PhoneMirrorService.shared.kickFrame()
            wireLiveSources()
            // Seed the monitor flag: the athlete may have paired in the pre-start
            // gate, before this view existed, and `onChange` only fires on CHANGES.
            session.ergConnected = activePM5.isConnected
            attemptProgramPM5()
            updateRunGPS()
            // The wrist streams fresher HR while mirroring — only run the phone's
            // own sparse HealthKit reader when no watch is recording this session.
            if !PhoneMirrorService.shared.wristJoined {
                liveHR.start(from: session.startedAt)
            }
            // La pantalla despierta (isIdleTimerDisabled) la lleva WorkoutContainer
            // por fase, no esta vista: en el relevo .active → .recovery los
            // onAppear/onDisappear de dos vistas no tienen orden garantizado y el
            // flag podía quedar apagado a mitad de la medición de recuperación.
        }
        .onDisappear {
            session.stop()
            runGPS.stop()
            pedometro.stop()
            RunAltimeter.shared.onAltitude = nil
            RunAltimeter.shared.stop()
            // Backstop for every exit that is NOT a finish (abandon, brief-back):
            // `releaseDevicesOnFinish` already ran on the finish path, and both are
            // idempotent.
            releaseDevicesOnFinish()
        }
        .task { await pollPartnerLive() }
        .onChange(of: session.isFinished) { _, finished in
            if finished {
                runGPS.stop()
                pedometro.stop()
                RunAltimeter.shared.stop()
                releaseDevicesOnFinish()
                onFinish()
            }
        }
        .onChange(of: session.currentSegmentIndex) { _, _ in
            updateRunGPS()
        }
        .onChange(of: session.isAwaitingBlockStart) { _, _ in
            // El atleta le ha dado a EMPEZAR (o ha llegado a la puerta del siguiente
            // bloque): la superficie de calle aparece o desaparece con eso, y con
            // ella cambia quién es el dueño del GPS.
            updateRunGPS()
        }
        .onChange(of: session.runEnvironment) { _, _ in
            // Acaba de contestar «¿dónde corres?»: en cinta el GPS se apaga, en la
            // calle lo toma la superficie de calle.
            updateRunGPS()
        }
        .onChange(of: PhoneMirrorService.shared.wristJoined) { _, joined in
            // Hand HR off to the wrist when it joins mid-run; take it back if it drops
            // so the phone keeps recording HR alone.
            if joined { liveHR.stop() } else { liveHR.start(from: session.startedAt) }
        }
        // Multi-PM5: any role store can tick. Resolve the active role for THIS
        // tramo and only feed that monitor's numbers into the session window.
        .onChange(of: pool.epoch) { _, _ in
            feedActivePM5()
        }
        .onChange(of: session.currentSegmentIndex) { _, _ in
            // A new erg piece starts with a clean interval table — the PM5's split
            // numbers can otherwise carry over between pieces in one session.
            if session.currentSegment?.involvesErg == true { activePM5.resetSplits() }
            // …and gets programmed onto the monitor. Non-erg segments never touch it.
            attemptProgramPM5()
            // Role may have changed with the segment — refresh the connected flag.
            session.ergConnected = activePM5.isConnected
        }
        .onChange(of: session.tramoKey) { _, _ in
            // A NEW WORK WINDOW inside the same segment — round 3 of a ski EMOM,
            // bout 2 of a 5×500. When the app clocks the series, the piece is sent
            // again here so the monitor's counter is back at zero for it (Alex:
            // "cada ronda la app debe mandar el reinicio del pm5").
            // Also re-bind which role owns the live numbers (ski → remo).
            session.ergConnected = activePM5.isConnected
            attemptProgramPM5()
        }
        .sheet(isPresented: $showPM5Sheet) {
            let store = sheetPM5
            let role = ErgMachineRole(modality: session.currentTramo.modality)
            PM5LiveStreamView(store: store, roleTitle: role?.titleES)
        }
        // AQUÍ ESTABAN LOS DOS `fullScreenCover` DE CORRER (cinta y calle). Se han
        // ido: las dos pantallas se pintan EN LÍNEA como superficie viva, así que ya
        // no pueden taparse entre ellas, ni tapar un EMOM o un For Time, ni convivir
        // con un HUD montado debajo.
        // Pre-block gates (see `requestBlockStart`). Continuations run in onDismiss
        // so the next cover / the count-in never fights the dismissing one.
        .fullScreenCover(isPresented: $showRunGate, onDismiss: { continueAfterRunGate() }) {
            RunPreStartFlow(
                sessionTitle: session.plan.name,
                onStart: { env in
                    session.runEnvironment = env
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

    // The block's format/scheme line for the preview. An EMOM reads its RESOLVED plan
    // (el único caso que sabe algo que la prescripción no dice: la rotación ya
    // expandida); todo lo demás sale del formateador compartido.
    //
    // Aquí vivía `conditioningFormatLabel`, una SEGUNDA implementación de la misma
    // cabecera —Tabata, Death By, Series, Continuo, Chipper, Ladder, Rondas, sim— que
    // esta pantalla tenía y la previa no. Por eso un circuito llegaba a la pantalla de
    // antes de empezar sin cabecera y aparecía con ella al arrancar. Ahora hay UNA
    // (§2), en `PrescriptionRenderer.wodHeader`, y las dos pantallas leen la misma.
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
        return segments.compactMap(\.prescription).compactMap(PrescriptionRenderer.wodHeader).first
    }

    private var segmentHasVideo: Bool {
        VideoDeTecnica.hay(en: session.currentSegment?.videoUrl)
    }

    // `attemptPM5IfNeeded()` USED TO LIVE HERE, called on appear and on EVERY segment
    // change: reaching an erg segment silently reopened the last paired PM5. Deleted.
    // Arriving at a piece of work is not consent to grab a machine — the athlete opens
    // the erg sheet and taps the erg he is on. If nothing is connected he simply rows
    // and the app records what it can, exactly as it does for an unrecognised belt.

    /// Program the CURRENT erg work window on the connected PM5 (ErgData behavior:
    /// the monitor loads the workout and shows "row to begin"; the athlete touches
    /// nothing). Driven by `ErgCounterPolicy`: each per-tramo series/EMOM/station
    /// re-sends so the monitor zeros; cumulative windows (AMRAP) keep one key.
    private func attemptProgramPM5() {
        guard let seg = session.currentSegment, seg.involvesErg else { return }
        let tramo = session.currentTramo
        guard tramo.isErg else { return }
        let policy = ErgCounterPolicy.resolve(
            tramo: tramo,
            segment: seg,
            isResting: session.isTramoResting,
            isCountIn: session.isTramoCountIn
        )
        // Program only the monitor bound to THIS tramo's machine (ski piece on
        // the ski PM5, remo on the remo). Never reprogram a sibling role.
        activePM5.programIfNeeded(for: seg, tramo: tramo, policy: policy)
    }

    /// Pull live numbers from the PM5 that owns the current tramo (multi-role safe).
    private func feedActivePM5() {
        let pm5 = activePM5
        session.ergConnected = session.tramoIsErg && pm5.isConnected
        guard session.tramoIsErg, pm5.isConnected else { return }
        if let bpm = pm5.live.heartRateBpm {
            session.injectLiveHR(bpm, source: .pm5)
        }
        session.sampleErg(
            paceSecPer500m: pm5.live.paceSecondsPer500m,
            powerWatts: pm5.live.powerWatts,
            strokeRate: pm5.live.strokeRate,
            distanceMeters: pm5.live.distanceMeters,
            caloriesKcal: pm5.live.caloriesKcal,
            dragFactor: pm5.live.dragFactor,
            caloriesPerHour: pm5.live.caloriesPerHour,
            monitorAvgPaceSecPer500m: pm5.live.avgPaceSecondsPer500m,
            peakDriveForceLbs: pm5.live.peakDriveForceLbs,
            avgDriveForceLbs: pm5.live.avgDriveForceLbs
        )
        if !pm5.splits.isEmpty {
            session.captureErgSplits(pm5.splits)
        }
    }

    /// Pull the belt's latest telemetry into the session. THE single owner of the
    /// belt → session feed: `TreadmillHUDModel` deliberately does not write distance or
    /// incline any more, so opening the cover mid-run can never double-count.
    ///
    /// The session's own guards decide whether the sample counts (tramo is running
    /// work, not paused) — the same shape as `feedActivePM5`.
    /// Store to open when the athlete taps "conectar PM5" mid-workout: the
    /// current tramo's role if erg, else the first named machine of the segment.
    private var sheetPM5: PM5ConnectionStore {
        if session.tramoIsErg { return activePM5 }
        if let seg = session.currentSegment {
            let roles = PreWorkoutDeviceEligibility.namedErgRoles(in: seg)
            if let first = ErgMachineRole.allCases.first(where: { roles.contains($0) }) {
                return pool.store(for: first)
            }
        }
        return pool.any
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
        // Gym rule: PM5 + FTMS leave the machine the INSTANT work ends — not when
        // the summary dismisses. Optimistic disconnect so the chip never lingers
        // as "listo" while CoreBluetooth is still winding down.
        if session.hrRecovery != nil {
            // Recovery still needs the HR strap; release ergs + belt only.
            pool.disconnectAll()
            DeviceHub.shared.stopTreadmill()
            return
        }
        DeviceHub.shared.stopAll()
        liveHR.stop()
        session.ergConnected = false
    }

    // Hook the optional providers' callbacks into the session. Done once on
    // appear; the closures capture `session`, which is stable for the screen.
    private func wireLiveSources() {
        // LA DISTANCIA LA CUENTA APPLE. El podómetro funde zancada y GPS, así que
        // sigue contando en un túnel y con el móvil en el bolsillo — y no depende de
        // que nadie nos conceda ejecución de fondo. Se sella como `healthkit` porque
        // es el mismo motor que alimenta la distancia de Salud; `gps` sería mentir,
        // que es justo lo que se quita.
        pedometro.onDistanceDelta = { meters in
            session.sampleRunDistance(deltaMeters: meters, source: .healthkit)
        }
        // La VELOCIDAD medida, para el archivo de la sesión. La pantalla de calle tiene
        // su propio proveedor y hace lo mismo; sólo uno de los dos está vivo cada vez
        // (`updateRunGPS` se aparta cuando la calle manda), así que la serie no se
        // duplica.
        runGPS.onSpeed = { speed, accuracy in
            session.sampleRunSpeed(metersPerSecond: speed, accuracyMps: accuracy)
        }
        // El cero del barómetro, por el mismo reparto.
        runGPS.onAltitude = { meters, accuracy in
            RunAltimeter.shared.noteGPSAltitude(meters, verticalAccuracy: accuracy)
        }
        // Y la altitud ya anclada entra en la sesión con SU instante: las lecturas
        // anteriores al ancla salen a posteriori y tienen que caer en su segundo.
        RunAltimeter.shared.onAltitude = { meters, at in
            session.sampleAltitude(metersAboveSeaLevel: meters, at: at)
        }
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
        // The BELT into the RECORDING, for the whole workout — the exact twin of the
        // strap wiring above, and for the same reason: a device's data belongs to the
        // session, not to whichever screen happens to be open. The treadmill HUD used to
        // be the only thing feeding this, so a run leg inside an EMOM / For Time / HYROX
        // sim (which never open that cover) recorded nothing from a connected belt.
        let feeder = TreadmillSessionFeeder(session: session)
        beltFeeder = feeder
        DeviceHub.shared.onRecordSample = { sample in feeder.ingest(sample) }
    }

    // AQUÍ VIVÍA `maybeAutoOpenRunCover()` (#8), que abría el cover de correr al
    // entrar al tramo. Con él se van sus tres parches: el guardado de «ya lo abrí
    // para este tramo», la abstención cuando había una hoja abierta (UIKit no
    // presenta un modal sobre otro) y los reintentos al cerrarla. Nada de eso hacía
    // falta: la pantalla de correr no se ABRE, se RESUELVE — `superficieViva` la
    // devuelve cuando toca y la retira cuando deja de tocar.

    // MARK: - Pre-block start gates (run env → erg connect → count-in)

    /// Every EMPEZAR on the block gate lands here — the ONE enforcement point.
    /// Order: a run block missing the calle/cinta answer asks it first (the answer
    /// decides which HUD auto-opens); then an erg block with no live monitor runs
    /// the connect sequence; only then the block's clock starts. Already answered /
    /// already connected → straight through, no extra screens.
    private func requestBlockStart() {
        let segs = upcomingBlockSegments
        if segs.contains(where: { $0.kind == .running }), session.runEnvironment == nil {
            showRunGate = true
        } else if needsErgConnect(segs) {
            showErgGate = true
        } else {
            session.beginBlock()
        }
    }

    private var upcomingBlockSegments: [WorkoutSegment] {
        guard let region = session.currentBlockRegion else { return [] }
        return session.plan.segments(in: region)
    }

    /// The block rows/skis/bikes and no monitor is live → connect BEFORE the clock.
    /// Connecting here programs the piece at once (`onChange(pm5.connectionState)`
    /// → `attemptProgramPM5`), so the app and the erg start at the same point.
    private func needsErgConnect(_ segs: [WorkoutSegment]) -> Bool {
        segs.contains(where: { $0.involvesErg }) && !anyPM5Connected
    }

    /// "el remo" / "el SkiErg" / "la bici" for the connect header. The live segment
    /// collapses row/ski/bike into one erg kind (threading the subtype through is
    /// the known follow-up), so the word reads from the piece's own title; remo —
    /// the dominant HYROX erg — is the fallback.
    private var ergMachineWord: String {
        let title = upcomingBlockSegments.first(where: { $0.kind.isErg })?.title.lowercased() ?? ""
        if title.contains("ski") { return "el SkiErg" }
        if title.contains("bici") || title.contains("bike") || title.contains("assault") || title.contains("echo") {
            return "la bici"
        }
        return "el remo"
    }

    /// Run gate answered → the same block may still need the erg (a HYROX sim has
    /// run + row): chain the connect gate, else start. A cancel leaves the athlete
    /// on the block preview, nothing begun.
    private func continueAfterRunGate() {
        guard gateContinuation == .checkErg else { return }
        gateContinuation = nil
        if needsErgConnect(upcomingBlockSegments) {
            showErgGate = true
        } else {
            session.beginBlock()
        }
    }

    private func continueAfterErgGate() {
        guard gateContinuation == .begin else { return }
        gateContinuation = nil
        session.beginBlock()
    }

    // Start phone GPS only on run segments (and only if not denied); stop it
    // otherwise so we don't hold the location indicator during erg/strength work.
    private func updateRunGPS() {
        // Mientras la superficie de CALLE (#64) es la que manda, ella OWNS the
        // location stream (su propio proveedor alimenta la sesión); correr también el
        // nuestro contaría la distancia dos veces, así que nos apartamos mientras esté
        // en pantalla. Antes la condición era `!showOutdoor` porque esa pantalla era
        // un cover; ahora la pregunta es si `superficieViva` la ha resuelto — que es
        // lo mismo, pero dicho donde de verdad se decide.
        // On a TREADMILL run the GPS stays off entirely — indoor GPS noise reads as
        // phantom pace ("números aleatorios"); the belt is the distance source.
        if isRunSegment && superficieViva != .correrFuera && session.runEnvironment != .treadmill {
            // EL PERMISO DE FONDO VA CON LA CARRERA, NO CON LA PANTALLA. Sólo lo pedía
            // la superficie de calle, así que un tramo de correr dentro de un EMOM (que
            // nunca la abre) corría sin él: al bloquear la pantalla o atender una
            // llamada, iOS dejaba de entregar fixes — sin aviso — y esos metros eran el
            // 100 % de los de esa ventana. Se activa ANTES de arrancar y se retira al
            // cerrar, que es lo que cuida la batería.
            runGPS.setBackgroundUpdates(true)
            runGPS.start()
            // En cinta NO: ahí la distancia la mide la máquina, que es medida directa.
            if session.runEnvironment != .treadmill { pedometro.start(from: session.startedAt) }
        } else {
            runGPS.stop()
            runGPS.setBackgroundUpdates(false)
            pedometro.stop()
        }
        // El barómetro va con la CARRERA, no con la pantalla: se enciende en cuanto hay
        // un tramo de correr que no sea en cinta —lo lleve esta vista o la de calle— y
        // se apaga en el resto. En cinta no se enciende nunca: no hay desnivel que
        // medir y el permiso de movimiento no se pide para nada.
        if isRunSegment && session.runEnvironment != .treadmill {
            RunAltimeter.shared.start()
        } else {
            RunAltimeter.shared.stop()
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

    private var relayButton: some View {
        ExpertPrimaryButton(title: "Relevo ▸", height: 56, enabled: true) {
            session.advanceRelay()
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .padding(.bottom, Theme.Spacing.l)
    }

    // THE ACTIVE TRAMO DECIDES. Whatever window the athlete is inside right now
    // owns the screen: if a machine measures it, the machine's surface is what they
    // see, and the format that wraps it becomes the context strip on top. That rule
    // is what was missing — an EMOM or an interval series used to route to a generic
    // timer that knows nothing about a PM5, so the same erg showed full data alone
    // and none at all the moment a format wrapped it.
    //
    // Order, and why: a structured run keeps its own leg engine (untouched); a REST
    // is its own screen whatever produced it; then the device tramo; then the
    // format; then the plain per-kind grid.
    // LAS SUPERFICIES QUE HABLAN EL §10 Y MONTAN SU PROPIO MARCO.
    //
    // Por qué no van dentro de `modalityHUD` como las demás: el ancla del sujeto
    // (§10.3) es una propiedad de la PANTALLA, no de una vista. Una vista metida en
    // la ranura de `liveSurface` no sabe a qué altura empieza —y encima esa altura
    // cambia según haya o no tira de conexiones, mapa de tramos o pareja—, así que su
    // sujeto caería a una altura distinta en cada tramo del mismo entreno. Que es
    // exactamente lo que el §10.3 viene a quitar.
    //
    // Así que a éstas se les da la pantalla entera: el marco reserva las filas
    // (`MarcoVivo`) y el ancla vale lo mismo en todas. Todo lo demás sigue por el
    // árbol de siempre.
    //
    // CORRER ENTRÓ AQUÍ EL 5-AGO, y es el cambio de fondo. Estaba excluido a
    // propósito: sus dos pantallas eran `fullScreenCover` y se abrían ENCIMA de un
    // HUD que seguía montado debajo, así que un mismo tramo de carrera lo podían
    // pintar seis vistas y dos a la vez, con reglas distintas de ritmo y de cierre.
    // Ahora hay UNA por lo que estás haciendo, y cuál de las dos lo decide la
    // respuesta que ya diste al empezar («¿dónde corres?», la puerta del bloque).
    private enum SuperficieViva { case emom, fuerza, correrFuera, correrCinta }

    /// Qué superficie del §10 posee la pantalla ahora mismo, o nil cuando manda el
    /// árbol de siempre.
    ///
    /// LA CADENA ES LA MISMA que la de `liveSurface` + `modalityHUD`, en el mismo
    /// orden y por la misma razón: el tramo activo decide. Se lee de arriba abajo
    /// como allí, y si mañana se mueve una prioridad hay que moverla en los dos
    /// sitios — de ahí que las dos citen esta nota.
    private var superficieViva: SuperficieViva? {
        // Lo que `liveSurface` resuelve ANTES de llegar al HUD de modalidad.
        if session.currentSegmentIsPartnerRelay { return nil }
        // Un calentamiento de cinta / remo NO es checklist: la máquina mide.
        if session.currentBlockIsStructural,
           !MachineTramoLaw.machineOwnsHUD(tramo: session.currentTramo) { return nil }
        if isErgLandscapeFocus { return nil }
        // CORRER: manda el TRAMO, no el kind del segmento plegado. Un EMOM de
        // cinta, un calentamiento de 6 min o una estación de HYROX son correr
        // aunque el bloque se haya plegado como reps. El cover que tapaba el
        // minuto ya no existe — TreadmillHUD ES la superficie.
        if session.tramoIsRun {
            guard !session.isAwaitingBlockStart else { return nil }
            switch session.runEnvironment {
            case .treadmill: return .correrCinta
            case .outdoor:   return .correrFuera
            case .none:      return nil
            }
        }
        if session.isTramoResting { return nil }
        if session.tramoIsErg { return nil }
        if session.currentSegment?.isEMOM == true { return .emom }
        // Los formatos de acondicionamiento conservan su cronómetro dedicado.
        if session.currentSegment?.isConditioningTimer == true { return nil }
        // Y el resto es el suelo honesto de fuerza/reps — el mismo reparto que
        // hacía el `switch` de `modalityHUD`.
        return .fuerza
    }

    // THE ACTIVE TRAMO DECIDES — ver la nota de `superficieViva`, que resuelve las
    // dos primeras ramas de formato antes de llegar aquí.
    @ViewBuilder
    private var modalityHUD: some View {
        if session.isTramoResting {
            // Work just stopped: the questions changed, so the screen changes. One
            // surface for every engine that rests (EMOM change window, Tabata /
            // interval rest) — see RestSurface.
            RestSurface(session: session)
        } else if session.tramoIsErg {
            // Erg work, alone or inside any format.
            ErgHUDContent(session: session, pm5: activePM5)
        } else if session.currentSegment?.isConditioningTimer == true {
            // Conditioning formats route by SCHEME to their dedicated timer (the
            // block-level fold means one segment = one format), regardless of kind.
            // A free-order format (AMRAP / For Time / Chipper) genuinely does not
            // know which movement the athlete is on, so the format keeps the subject
            // — but if a monitor is streaming under it, its numbers are shown rather
            // than thrown away.
            conditioningHUD
            // The monitor's live numbers ride under a free-order format because
            // nothing knows whether he is on the machine, so throwing them away
            // would lose real data. On a ROUTE the app DOES know — and he is not on
            // it, or the erg surface would have taken the screen. Leaving the rower's
            // numbers under "50 wall balls" would read as his current work.
            if segmentInvolvesErg, activePM5.isConnected, !session.isStationTramo {
                ErgLiveStrip(session: session, pm5: activePM5)
            }
        }
        // NO HAY RAMA `else`, Y ESO ES EL CAMBIO. Aquí caía `RunLiveHUD`, la pantalla
        // naranja genérica de correr — la sexta superficie capaz de pintar un tramo
        // de carrera, y la que se quedaba viva DEBAJO del cover. Correr ya no llega a
        // este árbol: se lo lleva `superficieViva`. Lo único que puede caer hasta
        // aquí es un tramo de correr cuyo «¿dónde corres?» sigue sin contestar, y ahí
        // lo honesto es no pintar ningún instrumento y dejar la pregunta a mano
        // (`CambiarDeSitioButton`, en `liveSurface`).
    }

    @ViewBuilder
    private var conditioningHUD: some View {
        switch session.currentSegment?.formatScheme {
        case .amrap:     AmrapLiveHUD(session: session)
        // LOS CUATRO ESQUEMAS QUE PERDIERON SU RELOJ DEDICADO (5-ago). Sus casos
        // REALES ya los sirve quien mide: una serie o un rodaje de correr se los
        // lleva la superficie de calle/cinta (matriz «Series · calle/cinta» y
        // «Rodaje · calle/cinta»), uno de ergo `ErgHUDContent` («Rodaje · ergo»), y
        // el descanso de cualquiera de ellos `RestSurface`. Lo que puede caer aquí es
        // el resto: un trabajo rotativo que nadie mide (una tabata de burpees). Para
        // eso NO hay pantalla diseñada, así que se usa el suelo honesto que ya
        // existe —el reloj del bloque con el movimiento y su dosis— en vez de
        // inventar una: dice menos, pero no dice nada falso.
        case .tabata, .intervals, .deathBy, .steady:
            // Los rotativos y el continuo NO van a la cara por rondas: su cursor es
            // `rotRoundIndex` (lo mueve el reloj del motor), no `fixedRoundsDone`,
            // y un contador colgado del cursor equivocado se queda congelado en
            // «Ronda 1». Conservan su suelo honesto: el reloj del bloque.
            RotatingClockHUD(session: session)
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim:
            ForTimeLiveHUD(session: session)
        case .emom, .sets, .superset, .warmup, .cooldown, .none:
            // Inalcanzable por construcción: `isConditioningTimer` ya excluye estos
            // cinco esquemas y el nil — la superserie entre ellos, porque es fuerza y
            // no arranca ningún reloj de acondicionamiento. Se escriben en vez de un
            // `default` para que un esquema NUEVO no caiga aquí en silencio.
            EmptyView()
        }
    }

    /// The manual close while WORKING sideways, ending the erg HUD's rail column.
    /// Same action and same label as portrait — one behaviour, two arrangements.
    /// Secondary while a monitor is measuring (the machine crossing the goal is
    /// the normal close; an emergency exit doesn't shout); with no monitor the
    /// tap is the ONLY close there is, so it keeps the primary voice.
    private var landscapeSalida: some View {
        ExpertActionButton(title: primaryTitle, compact: true,
                           secondary: activePM5.isConnected,
                           action: { primaryAction() })
            .frame(height: 44)
    }

    /// The action while RESTING sideways, inside the rest field's bottom row. At
    /// rest the action is the subject (skipping IS the normal path), so it keeps
    /// the primary voice at a height that matches the cards beside it.
    private var landscapeRestAction: some View {
        ExpertActionButton(title: primaryTitle, compact: true,
                           action: { primaryAction() })
            .frame(height: 56)
    }

    /// Landscape. Named for what it MEANS (there is almost no height) rather than
    /// for the orientation, because that is the constraint the layout answers.
    private var isCompactHeight: Bool { vSizeClass == .compact }

    /// The surface already owns a scroll view of its own (the warm-up / cool-down
    /// checklist, which can run to a dozen movements and has scrolled since it was
    /// built). Wrapping it in a second one would put two vertical scrollers on top
    /// of each other and neither would answer the finger reliably — and it needs no
    /// help anyway: its own scroller shrinks, so the button below it is already
    /// pinned in both orientations.
    private var surfaceScrollsItself: Bool { session.currentBlockIsStructural }

    // THE WORK, and THE ACTION — split so the action can be pinned outside whatever
    // scrolls. They are two properties instead of one because a landscape screen has
    // to be able to put a scroll view between them; portrait renders them back to
    // back inside the same VStack, which is exactly the tree it had before.

    @ViewBuilder
    private var liveSurface: some View {
        if session.currentSegmentIsPartnerRelay {
            // #23 — HYROX dobles relay: the PARTNER works this station while the
            // athlete recovers (real dobles). Nothing is logged for the athlete;
            // "Relevo ▸" advances to their next station.
            relaySurface
            Spacer(minLength: 0)
        } else if session.currentBlockIsStructural,
                  !MachineTramoLaw.machineOwnsHUD(tramo: session.currentTramo) {
            // Warmup / cooldown SIN máquina: checklist. Con máquina manda el HUD.
            structuralWorkSurface
            Spacer(minLength: 0)
        } else {
            ConnectionStrip(
                session: session,
                pm5: activePM5,
                gpsActive: gpsActive,
                segmentIsErg: segmentInvolvesErg,
                segmentIsRun: isRunSegment,
                onTapPM5: { showPM5Sheet = true }
            )
            // The whole-session segment map earns its row only when there is more
            // than one segment AND the current window isn't already counting its own
            // series — inside a 20-round EMOM it repeated context the format strip
            // already carries, on a screen that had no height to spare.
            if session.plan.segments.count > 1, session.tramoRoundTotal <= 1 {
                BlockIntervalStrip(
                    segments: session.plan.segments,
                    currentIndex: session.currentSegmentIndex,
                    onTap: { requestJump(to: $0) }
                )
            }
            // #56 — DOBLES turn hero (mine / split): whose station this is, the rep
            // reparto + bicolor bar and the "Después:" preview, above the work HUD.
            // Carries the coach's pact (replacing the old dim split line); nil
            // (hidden) for individual work and the relay.
            if let turn = currentDoblesTurn {
                DoblesTurnHero(turn: turn, next: nextDoblesTurn,
                               compact: true, partnerFallback: partnerFirstName)
            }
            modalityHUD
            if session.currentSegmentIsMetcon {
                RxScaledToggle(session: session)
            }
            // The erg surface fills its own height (see ErgHUDContent), so no spacer
            // is pushed under it — that spacer is what left the old layout with a
            // dead band in the middle and the bar squashed at the bottom. Formats
            // that don't fill still get their slack. A scroll view gives its content
            // its natural height, so the spacer has nothing to push against there
            // and would only add a gap the athlete has to scroll past.
            if !isErgSegment && !isCompactHeight {
                Spacer(minLength: 0)
            }
            // Connect is offered whenever an erg belongs to this block, not only
            // while its round is live — otherwise a ski EMOM gives the athlete no
            // way to pair before the first minute starts.
            if segmentInvolvesErg && !anyPM5Connected {
                connectPM5CTA
            }
            // NO HAY BOTONES DE ENTRADA A NINGUNA PANTALLA DE CORRER, Y NO PUEDE
            // HABERLOS. Aquí vivían «CORRER EN CINTA» / «CORRER FUERA», que abrían un
            // cover encima de esto — encima de un EMOM, de un For Time, o de otro HUD
            // de correr. A tu pantalla de correr no se ENTRA: si el tramo es correr,
            // ES la pantalla (ver `superficieViva`).
            //
            // Lo que sí queda es CAMBIAR DE SITIO, que es una pregunta, no una
            // pantalla. Se ofrece siempre que la ventana activa sea de correr y esta
            // ranura siga en pie — o sea, en los dos casos en los que la superficie de
            // correr no manda: un tramo de correr dentro de un formato (una estación
            // de la ruta, una ronda de un EMOM), y un tramo de correr cuyo «¿dónde
            // corres?» aún no está contestado, donde además es el único camino.
            if session.tramoIsRun {
                CambiarDeSitioButton(action: { showRunGate = true })
            }
            nextSegmentChip
        }
    }

    @ViewBuilder
    private var liveAction: some View {
        if session.currentSegmentIsPartnerRelay {
            relayButton
        } else if session.currentBlockIsStructural {
            primaryButton
        } else {
            bottomControls
        }
    }

    // The "NEXT" chip is silent whenever something else already answers "what
    // comes next" better: the rest screen answers it for the ROUND, and the erg
    // surface's own context line answers it mid-piece ("luego descanso 2:00"). Two
    // answers to the same question — one of them about a different scope — is
    // exactly the clutter that left no room for the numbers.
    @ViewBuilder
    private var nextSegmentChip: some View {
        if !session.isTramoResting, !isErgSegment {
            // El chip vive en `SiguienteTramoChip`: las superficies del §10 montan
            // su propio marco y necesitaban el mismo, y una segunda copia es como
            // nacieron las catorce duraciones que el `Formato` vino a arreglar.
            // Aquí se queda la CONDICIÓN (cuándo callar), que sí es de esta pantalla.
            SiguienteTramoChip(siguiente: session.nextSegment)
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
    // uses dual buttons (see `deathByControls`) — this label is for accessibility.
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
            // Una lista de RONDAS cierra ronda a ronda, igual que la ruta cierra
            // estaciones — el botón dice lo que hace y la última cierra el bloque.
            // `.steady` queda fuera aunque declare rondas: su motor cierra el bloque
            // entero (`conditioningPrimary`), y una etiqueta «RONDA HECHA» sobre un
            // botón que cierra el bloque es la mentira exacta que no se escribe.
            if session.currentSegment?.formatScheme != .steady, session.fixedListTotal > 1 {
                let last = session.fixedRoundsDone >= session.fixedListTotal - 1
                if last { return session.isLastSegment ? "TERMINAR" : "ÚLTIMA HECHA" }
                return "RONDA HECHA"
            }
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
    // already closed and safe either way; this only asks what he wants to do next.
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
                        Text("El trabajo de esta sesión ya está cerrado. Terminar abre el resumen para guardar de verdad — notas incluidas.")
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

// The big bottom primary action (88pt, radius 14). Generalised from the old
// LAP-only button: the title is contextual ("SIGUIENTE" / "HECHO" / "TERMINAR" /
// "EMPEZAR"). The session methods own the haptic; this only flashes on tap. A
// 0.5s debounce guards against a double-fire under sweaty fingers — that
// behaviour is the button, so landscape's smaller arrangements are variants of
// THIS view, not siblings: `compact` drops the display type to a label that fits
// a 128 pt rail, and `secondary` swaps the accent fill for an outline when the
// tap is the emergency exit rather than the normal path. The flash stays green
// in every variant: confirmation reads the same everywhere.
private struct ExpertActionButton: View {
    let title: String
    var compact: Bool = false
    var secondary: Bool = false
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
                    .fill(flashing ? Theme.Color.ok
                                   : secondary ? Color.clear : Theme.Color.accent)
                if secondary, !flashing {
                    RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                }
                Text(title)
                    .font(.system(size: compact ? 15 : 40, weight: .heavy, design: .default).italic())
                    .tracking(compact ? 1 : 3)
                    .foregroundStyle(secondary && !flashing ? Theme.Color.foreground
                                                            : Theme.Color.accentOn)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.horizontal, compact ? Theme.Spacing.s : Theme.Spacing.l)
            }
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(title)
    }
}
