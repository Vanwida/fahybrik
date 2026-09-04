import XCTest
@testable import FAHYBRIK

// The DeviceChannel connection coordinator, driven with a fake source + an in-memory
// UserDefaults + the channel's own decision hooks — no CoreBluetooth, no real timers.
//
// THE INVARIANT THIS FILE DEFENDS: **the channel opens a link only when a finger asked
// it to, in this session, from a list of what is actually around.** Not on appear, not
// on a timer, not after a drop, not for the device used last. The fake source counts
// every `connect` it is handed, so "nothing connected" is asserted, not assumed.
final class DeviceChannelTests: XCTestCase {

    // MARK: - Fake source (records what the channel asked for)

    final class FakeConnectable: ConnectableSource {
        var onLink: ((DeviceLink) -> Void)?
        var onDiscovered: (([DeviceCandidate]) -> Void)?
        var onBluetooth: ((BluetoothAvailability) -> Void)?

        private(set) var scanStarted = 0
        private(set) var connectedID: DeviceID?
        /// EVERY connect the channel ever asked for. The count is the safety assertion:
        /// zero means the app did not touch a machine on its own.
        private(set) var connectCalls: [DeviceID] = []
        private(set) var disconnectCount = 0
        private(set) var stopCount = 0

        func startScan() { scanStarted += 1 }
        func connect(_ id: DeviceID) { connectedID = id; connectCalls.append(id) }
        func disconnect() { disconnectCount += 1 }
        func stop() { stopCount += 1 }
        func diagnosticsText() -> String? { nil }

        // Simulate the source's own callbacks:
        func discover(_ c: [DeviceCandidate]) { onDiscovered?(c) }
        func land(name: String) { onLink?(.connected(name: name)) }
        /// The peripheral vanished on its own (out of range, powered off, taken).
        func dropUnexpectedly() { onLink?(.lost) }
        /// Retrieve/connect hard-failed. Same CTA path as `.lost`.
        func fail(_ message: String = "x") { onLink?(.failed(message)) }
    }

    // MARK: - Fixtures

    private func id(_ tail: UInt8) -> DeviceID {
        UUID(uuidString: "00000000-0000-0000-0000-0000000000\(String(format: "%02X", tail))")!
    }
    private func cand(_ tail: UInt8, rssi: Int = -50) -> DeviceCandidate {
        DeviceCandidate(id: id(tail), name: "Dev \(tail)", rssi: rssi)
    }

    private func makeChannel(remembered: DeviceID? = nil, name: String = "Belt",
                             requiresConfirmation: Bool = false)
        -> (channel: DeviceChannel, source: FakeConnectable, store: RememberedDeviceStore) {
        let suite = "test.device.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let store = RememberedDeviceStore(idKey: "id", nameKey: "name", defaults: defaults)
        if let r = remembered { store.remember(r, name: name) }
        let fake = FakeConnectable()
        let channel = DeviceChannel(title: "Cinta", icon: "figure.run",
                                    requiresConfirmation: requiresConfirmation,
                                    remembered: store, makeSource: { fake })
        channel.prewireInjectedSource()   // so "zero connects" is observable from the start
        return (channel, fake, store)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MARK: - NOTHING CONNECTS BY ITSELF (the safety contract)
    // ══════════════════════════════════════════════════════════════════════════

    /// THE test. A remembered belt, alone in the room, discovered by a live scan — the
    /// exact situation the old channel treated as "obviously yours, go straight in".
    /// It must sit in the list and wait for a tap. If this fails, the app can start a
    /// treadmill that somebody else is running on.
    func testNeverAutoConnectsEvenToTheRememberedDevice() {
        let mine = cand(1)
        let (ch, src, _) = makeChannel(remembered: mine.id)

        ch.openPicker()                 // he asked to look — that is not asking to connect
        src.discover([mine])            // and there it is, alone
        ch.settleWindowElapsed()

        XCTAssertEqual(src.connectCalls, [], "the remembered device was connected without a tap")
        XCTAssertEqual(ch.candidates.map(\.id), [mine.id], "it belongs in the list, badged")
        XCTAssertFalse(ch.isConnected)
    }

    /// `prepare()` is what every screen calls on appear. It must be inert in EVERY
    /// state — this is the hook that used to reach for the remembered device and is how
    /// the app grabbed a belt in the gym by itself.
    func testPrepareNeverConnectsInAnyState() {
        let mine = cand(1)

        // Nothing remembered.
        let (fresh, freshSrc, _) = makeChannel(remembered: nil)
        fresh.prepare()
        XCTAssertEqual(freshSrc.connectCalls, [])
        XCTAssertEqual(freshSrc.scanStarted, 0, "appearing on screen must not even scan")

        // A remembered device — the tempting case.
        let (remembered, rememberedSrc, _) = makeChannel(remembered: mine.id)
        remembered.prepare()
        XCTAssertEqual(rememberedSrc.connectCalls, [], "prepare() reached for the remembered belt")
        XCTAssertEqual(rememberedSrc.scanStarted, 0)
        XCTAssertEqual(remembered.link, .idle)

        // Re-entering repeatedly (re-render, tab switch, foreground) stays inert.
        for _ in 0..<5 { remembered.prepare() }
        XCTAssertEqual(rememberedSrc.connectCalls, [])

        // After a drop.
        let (dropped, droppedSrc, _) = makeChannel(remembered: mine.id)
        droppedSrc.dropUnexpectedly()
        dropped.prepare()
        XCTAssertEqual(droppedSrc.connectCalls, [], "prepare() re-grabbed a machine after a drop")
        XCTAssertEqual(dropped.link, .lost, "the athlete must still be told it dropped")

        // While a link the athlete made is live: left completely alone.
        let (live, liveSrc, _) = makeChannel(remembered: mine.id)
        live.connect(mine.id)
        liveSrc.land(name: "Titanium T1")
        live.prepare()
        XCTAssertTrue(live.isConnected, "prepare() must not disturb a link he made")
        XCTAssertEqual(liveSrc.connectCalls.count, 1, "and must not re-issue a connect")
    }

    /// An unexpected drop produces NO reconnect — from the channel, and (by the source
    /// contract asserted here) from nothing else either. Equipment rotates: the machine
    /// that just dropped may already be under somebody else.
    func testUnexpectedDisconnectNeverReconnects() {
        let mine = cand(1)
        let (ch, src, store) = makeChannel(remembered: mine.id)

        ch.connect(mine.id)                     // athlete tapped it
        src.land(name: "Titanium T1")
        XCTAssertTrue(ch.isConnected)
        let connectsWhileLive = src.connectCalls.count

        src.dropUnexpectedly()                  // the belt vanishes mid-run

        XCTAssertEqual(src.connectCalls.count, connectsWhileLive, "the channel went back for it")
        XCTAssertEqual(ch.link, .lost, "the athlete must be told, honestly")
        XCTAssertFalse(ch.isConnected)
        XCTAssertTrue(store.has, "the device stays REMEMBERED — as a label for the next list")

        // …and nothing later brings it back on its own.
        ch.onCandidatesChanged()
        ch.settleWindowElapsed()
        ch.prepare()
        XCTAssertEqual(src.connectCalls.count, connectsWhileLive, "something reconnected after the drop")
    }

    /// The only route to a live link, end to end: look → list → tap. Every connect the
    /// source ever sees traces back to that tap.
    func testOnlyAnExplicitTapEverProducesAConnect() {
        let mine = cand(1), stranger = cand(9)
        let (ch, src, _) = makeChannel(remembered: mine.id)

        ch.openPicker()
        src.discover([mine, stranger])
        ch.settleWindowElapsed()
        XCTAssertEqual(src.connectCalls, [], "browsing a list is not connecting")

        ch.requestConnect(stranger)             // he taps a row — a strap-style channel
        XCTAssertEqual(src.connectCalls, [stranger.id], "the tapped device, and only it")
    }

    /// Belts are gated behind a confirmation, because we can DRIVE them. The tap alone
    /// must not open the link.
    func testTreadmillRowRequiresConfirmationBeforeConnecting() {
        let belt = cand(1)
        let (ch, src, _) = makeChannel(remembered: nil, requiresConfirmation: true)

        ch.openPicker()
        src.discover([belt])
        ch.settleWindowElapsed()

        ch.requestConnect(belt)                 // tap
        XCTAssertEqual(src.connectCalls, [], "a belt connected before he confirmed it was his")
        XCTAssertEqual(ch.pendingConfirmation?.id, belt.id, "the dialog must be up")

        ch.confirmPendingConnect()              // "Conectar"
        XCTAssertEqual(src.connectCalls, [belt.id])
        XCTAssertNil(ch.pendingConfirmation)
    }

    func testCancellingTheConfirmationTouchesNothing() {
        let belt = cand(1)
        let (ch, src, _) = makeChannel(remembered: nil, requiresConfirmation: true)
        ch.openPicker()
        src.discover([belt])
        ch.requestConnect(belt)
        ch.cancelPendingConnect()               // "Cancelar" — wrong machine
        XCTAssertEqual(src.connectCalls, [], "cancelling still connected")
        XCTAssertNil(ch.pendingConfirmation)
        XCTAssertFalse(ch.isConnected)
    }

    /// A pending confirmation can never survive a teardown and fire later against a
    /// machine the athlete has since walked away from.
    func testPendingConfirmationIsClearedByEveryTeardown() {
        let belt = cand(1)
        for teardown in ["disconnect", "stop", "cancelConnect", "prepare"] {
            let (ch, src, _) = makeChannel(remembered: nil, requiresConfirmation: true)
            ch.openPicker()
            src.discover([belt])
            ch.requestConnect(belt)
            XCTAssertNotNil(ch.pendingConfirmation, "precondition for \(teardown)")

            switch teardown {
            case "disconnect":    ch.disconnect()
            case "stop":          ch.stop()
            case "cancelConnect": ch.cancelConnect()
            default:              ch.prepare()
            }

            XCTAssertNil(ch.pendingConfirmation, "\(teardown) stranded a pending confirmation")
            ch.confirmPendingConnect()          // a late "Conectar" must do nothing
            XCTAssertEqual(src.connectCalls, [], "\(teardown) let a stale confirmation connect")
        }
    }

    /// A read-only device (HR strap) connects on the tap itself — no dialog. It can't
    /// hurt anybody, and a pointless prompt teaches athletes to dismiss prompts.
    func testHeartRateStrapConnectsStraightFromTheTap() {
        let strap = cand(3)
        let (ch, src, _) = makeChannel(remembered: nil, requiresConfirmation: false)
        ch.openPicker()
        src.discover([strap])
        ch.requestConnect(strap)
        XCTAssertNil(ch.pendingConfirmation, "no dialog for a device we only read")
        XCTAssertEqual(src.connectCalls, [strap.id])
    }

    /// Scanning is not connecting — no matter how long it runs or what turns up.
    func testAFullScanLifecycleIssuesZeroConnects() {
        let mine = cand(1), other = cand(2)
        let (ch, src, _) = makeChannel(remembered: mine.id)

        ch.openPicker()
        src.discover([])
        ch.onCandidatesChanged()
        src.discover([mine])                    // the remembered one appears, alone
        ch.onCandidatesChanged()
        src.discover([mine, other])             // then a second machine
        ch.settleWindowElapsed()
        ch.onCandidatesChanged()
        ch.cancelConnect()                      // he closes it without choosing

        XCTAssertEqual(src.connectCalls, [], "a scan connected something")
    }

    // MARK: - Remembered = a label: sorted first, badged, never an action

    func testRememberedDeviceLeadsTheListButIsStillJustARow() {
        let mine = cand(1, rssi: -85)           // weak signal…
        let loudStranger = cand(9, rssi: -35)   // …next to a very loud stranger
        let (ch, src, _) = makeChannel(remembered: mine.id)

        ch.openPicker()
        src.discover([loudStranger, mine])
        ch.settleWindowElapsed()

        XCTAssertEqual(ch.candidates.map(\.id), [mine.id, loudStranger.id], "remembered first")
        XCTAssertEqual(ch.rememberedID, mine.id, "…and flagged so the row can badge it")
        XCTAssertEqual(src.connectCalls, [], "leading the list is not being chosen")
    }

    // ══════════════════════════════════════════════════════════════════════════
    // MARK: - THE PRESENTATION CONTRACT (a separate field bug, still guarded)
    // ══════════════════════════════════════════════════════════════════════════
    //
    // `isPresentingPicker` drives `.sheet(isPresented:)` in `DeviceConnectCard` and
    // `TreadmillHUDView`. The channel must never raise it by itself: off a timer, with
    // no idea what is on screen, it once asked UIKit to present a sheet from a screen
    // buried under the run pre-start `.fullScreenCover` — UIKit refused ("only
    // presenting a single sheet is supported") and the fight swallowed the athlete's
    // taps, so the belt list vanished under him. TWICE, in the field.

    func testSettledScanNeverRaisesThePickerFlagOnItsOwn() {
        let a = cand(1), b = cand(2)
        let (ch, src, _) = makeChannel(remembered: nil)
        ch.beginInlineSelection()                          // a list is on screen, but INLINE
        src.discover([a, b])
        ch.settleWindowElapsed()                           // the timer fires
        XCTAssertFalse(ch.isPresentingPicker)              // …and NO modal is raised
        XCTAssertEqual(ch.candidates.count, 2)             // it only published the candidates
        XCTAssertEqual(src.stopCount, 0)                   // …with the scan still alive
        XCTAssertEqual(src.connectCalls, [])
    }

    func testInlineSelectionNeverTouchesThePickerFlag() {
        let (ch, src, _) = makeChannel(remembered: nil)
        ch.beginInlineSelection()
        XCTAssertFalse(ch.isPresentingPicker)              // no sheet for an inline list
        XCTAssertEqual(src.scanStarted, 1)                 // …but the scan really did start
    }

    /// The latch: while the inline list owns the screen, even a stray `openPicker()`
    /// cannot raise a sheet over the fullScreenCover. Structural, not "we audited it".
    func testOpenPickerCannotRaiseASheetWhileInlineSelectionIsActive() {
        let (ch, src, _) = makeChannel(remembered: nil)
        ch.beginInlineSelection()
        ch.openPicker()                                    // a stray raise from anywhere
        XCTAssertFalse(ch.isPresentingPicker)              // suppressed
        XCTAssertEqual(src.stopCount, 0)                   // and it did not disturb the scan
    }

    /// …and the latch is always released when the list leaves, so the chip pickers keep
    /// working for the rest of the session.
    func testEndInlineSelectionReleasesTheLatch() {
        let (ch, _, _) = makeChannel(remembered: nil)
        ch.beginInlineSelection()
        ch.endInlineSelection()                            // back arrow out of paso 3
        ch.openPicker()                                    // a later chip tap
        XCTAssertTrue(ch.isPresentingPicker)               // works again
    }

    /// A landed connection also releases it (the flow leaves paso 3 by connecting).
    func testConnectingReleasesTheLatch() {
        let other = cand(2)
        let (ch, src, _) = makeChannel(remembered: nil)
        ch.beginInlineSelection()
        src.discover([other])
        ch.settleWindowElapsed()
        ch.requestConnect(other)
        src.land(name: "Titanium T1")
        XCTAssertTrue(ch.isConnected)
        ch.openPicker()                                    // chip tap afterwards
        XCTAssertTrue(ch.isPresentingPicker)               // not stranded
    }

    /// The chip tap raises the sheet immediately — the tap IS the intent, so he watches
    /// the scan fill in rather than staring at a chip until a timer pops something.
    func testChipTapOpensTheSheetImmediately() {
        let mine = cand(1)
        let (ch, src, _) = makeChannel(remembered: mine.id)
        ch.openPicker()
        XCTAssertTrue(ch.isPresentingPicker)               // open NOW, not on a timer
        XCTAssertEqual(src.scanStarted, 1)
        XCTAssertEqual(src.connectCalls, [])               // opening a sheet connects nothing
    }

    /// A scan already running is left alone: restarting it would clear the candidates
    /// found so far and make the list flicker under the athlete's finger.
    func testASecondListIntentDoesNotRestartTheScan() {
        let (ch, src, _) = makeChannel(remembered: nil)
        ch.openPicker()
        let scans = src.scanStarted
        ch.openPicker()
        ch.beginInlineSelection()
        XCTAssertEqual(src.scanStarted, scans, "the scan was restarted under the list")
    }

    // MARK: - Picking + remembering

    func testPickingConnectsAndRemembers() {
        let other = cand(2)
        let (ch, src, store) = makeChannel(remembered: nil)
        ch.openPicker()
        src.discover([other])
        ch.settleWindowElapsed()
        XCTAssertTrue(ch.isPresentingPicker)

        ch.requestConnect(other)                           // athlete taps the row
        XCTAssertEqual(src.connectedID, other.id)
        XCTAssertFalse(ch.isPresentingPicker)              // sheet dismisses on pick

        src.land(name: "Titanium T1")                      // the source reports streaming
        XCTAssertTrue(ch.isConnected)
        XCTAssertEqual(ch.connectedName, "Titanium T1")
        XCTAssertEqual(store.id, other.id)                 // remembered by identifier
        XCTAssertEqual(store.name, "Titanium T1")          // ...and by real name
    }

    // MARK: - Disconnect

    func testDisconnectCutsAndKeepsRemembered() {
        let mine = cand(1)
        let (ch, src, store) = makeChannel(remembered: mine.id)
        ch.openPicker()
        src.discover([mine])
        ch.requestConnect(mine)
        src.land(name: "Belt")
        XCTAssertTrue(ch.isConnected)

        ch.disconnect()
        XCTAssertEqual(src.disconnectCount, 1)
        XCTAssertFalse(ch.isPresentingPicker)
        XCTAssertTrue(store.has)                            // kept — as a label, not a trigger
    }

    func testForgetClearsMemory() {
        let mine = cand(1)
        let (ch, src, store) = makeChannel(remembered: mine.id)
        ch.openPicker()
        src.discover([mine])
        ch.requestConnect(mine)
        src.land(name: "Belt")
        ch.forget()
        XCTAssertFalse(store.has)                           // forget wipes it
        XCTAssertEqual(src.disconnectCount, 1)              // and disconnects
    }

    // MARK: - Sheet dismiss must not abort an in-flight pick

    func testDismissRightAfterPickDoesNotAbortConnection() {
        let other = cand(2)
        let (ch, src, _) = makeChannel(remembered: nil)
        ch.openPicker()
        src.discover([other])
        ch.settleWindowElapsed()
        ch.requestConnect(other)                 // athlete taps a row
        XCTAssertEqual(src.connectedID, other.id)
        ch.cancelConnect()                       // the sheet's onDisappear fires right after
        XCTAssertEqual(src.stopCount, 0)         // connection NOT torn down
        src.land(name: "Belt")
        XCTAssertTrue(ch.isConnected)
    }

    func testDismissWhileBrowsingStopsScan() {
        let a = cand(1), b = cand(2)
        let (ch, src, _) = makeChannel(remembered: nil)
        ch.openPicker()
        src.discover([a, b])
        ch.settleWindowElapsed()
        XCTAssertTrue(ch.isPresentingPicker)
        ch.cancelConnect()                       // dismissed without choosing
        XCTAssertGreaterThan(src.stopCount, 0)   // scan stopped (battery)
        XCTAssertEqual(src.connectCalls, [])
    }

    /// After a mid-session `.lost`, the scan button the law documents is
    /// `openPicker`: it raises the sheet and starts a scan. It does NOT connect.
    func testOpenPickerAfterLostStartsScanNotConnect() {
        let mine = cand(1)
        let (ch, src, _) = makeChannel(remembered: mine.id)
        ch.connect(mine.id)
        src.land(name: "Titanium T1")
        src.dropUnexpectedly()
        XCTAssertEqual(ch.link, .lost)

        let connects = src.connectCalls.count
        ch.openPicker()
        XCTAssertTrue(ch.isPresentingPicker, "the chip tap must raise the list")
        XCTAssertGreaterThan(src.scanStarted, 0, "recovery is scan, not retrieve")
        XCTAssertEqual(src.connectCalls.count, connects, "openPicker must not connect")
        XCTAssertNotEqual(ch.link, .connected(name: "Titanium T1"))
    }

    /// FH-72 CTA: after a drop, the session machine is retrieve+connect. Remembered
    /// is a badge, never the connect argument. openPicker stays the FH-59 path.
    func testLostCTAReconnectsSessionMachineNotRemembered() {
        let session = cand(1)
        let remembered = cand(2)
        let (ch, src, _) = makeChannel(remembered: remembered.id)
        ch.connect(session.id)
        src.land(name: "Titanium T1")
        src.dropUnexpectedly()
        XCTAssertEqual(ch.link, .lost)
        XCTAssertEqual(ch.sessionIdentifier, session.id)

        ch.reconnectSessionMachineOrOpenPicker()
        XCTAssertEqual(src.connectCalls.last, session.id)
        XCTAssertNotEqual(src.connectCalls.last, remembered.id)
        XCTAssertFalse(ch.isPresentingPicker)
    }

    func testLostWithoutSessionMachineOpensPicker() {
        let remembered = cand(2)
        let (ch, src, _) = makeChannel(remembered: remembered.id)
        XCTAssertNil(ch.sessionIdentifier)
        ch.reconnectSessionMachineOrOpenPicker()
        XCTAssertTrue(ch.isPresentingPicker)
        XCTAssertTrue(src.connectCalls.isEmpty)
    }

    /// Retrieve miss emits `.failed(String)`. Same CTA as `.lost` — session
    /// machine, never remembered. `== .failed` does not compile (payload).
    func testFailedCTAReconnectsSessionMachineNotRemembered() {
        let session = cand(1)
        let remembered = cand(2)
        let (ch, src, _) = makeChannel(remembered: remembered.id)
        ch.connect(session.id)
        src.fail("No encuentro esa cinta.")
        XCTAssertTrue(ch.link.allowsSessionRetrieve)
        XCTAssertEqual(ch.sessionIdentifier, session.id)

        ch.reconnectSessionMachineOrOpenPicker()
        XCTAssertEqual(src.connectCalls.last, session.id)
        XCTAssertNotEqual(src.connectCalls.last, remembered.id)
        XCTAssertFalse(ch.isPresentingPicker)
    }

    func testDeviceLinkAllowsSessionRetrieveOnlyWhenDown() {
        XCTAssertTrue(DeviceLink.lost.allowsSessionRetrieve)
        XCTAssertTrue(DeviceLink.failed("x").allowsSessionRetrieve)
        XCTAssertFalse(DeviceLink.idle.allowsSessionRetrieve)
        XCTAssertFalse(DeviceLink.scanning.allowsSessionRetrieve)
        XCTAssertFalse(DeviceLink.connecting.allowsSessionRetrieve)
        XCTAssertFalse(DeviceLink.unavailable.allowsSessionRetrieve)
        XCTAssertFalse(DeviceLink.connected(name: "T1").allowsSessionRetrieve)
    }
}

// MARK: - Live host chips after a drop (FH-59)

/// The live host must keep a scan path mounted when cinta goes `.lost`, PM5
/// goes `.idle` (connectionLost is a flag — PM5 has no `.lost` DeviceLink),
/// and HR source becomes nil. Recovery is openPicker / PM5 sheet: not
/// beginBlock, not finish, not onAppear connect.
final class LiveDeviceScanPathTests: XCTestCase {

    private func path(
        wantsCinta: Bool = false,
        wantsPM5: Bool = false,
        coverOpen: Bool = false,
        treadmill: DeviceLink = .idle,
        pm5: PM5ConnectionState = .idle,
        pm5Lost: Bool = false,
        hr: DeviceLink = .idle,
        hrSource: WorkoutSession.HRSource? = nil
    ) -> LiveDeviceScanPath {
        LiveDeviceScanPath.offer(
            wantsCinta: wantsCinta,
            wantsPM5: wantsPM5,
            treadmillCoverOpen: coverOpen,
            treadmillLink: treadmill,
            pm5State: pm5,
            pm5ConnectionLost: pm5Lost,
            hrLink: hr,
            hrSource: hrSource
        )
    }

    func testCintaLostStillOffersChipAndPickerWithoutBeginBlock() {
        let p = path(wantsCinta: true, treadmill: .lost)
        XCTAssertTrue(p.showCintaChip, ".lost must not hide the cinta chip")
        XCTAssertTrue(p.showTreadmillEntry, "cover closed → host entry")
        XCTAssertTrue(p.cintaOpensPicker)
        XCTAssertFalse(p.requiresBeginBlock)
        XCTAssertFalse(p.showPM5Chip)
    }

    func testCintaIdleAlsoKeepsChip() {
        let p = path(wantsCinta: true, treadmill: .idle)
        XCTAssertTrue(p.showCintaChip)
        XCTAssertTrue(p.cintaOpensPicker)
        XCTAssertFalse(p.requiresBeginBlock)
    }

    func testPM5IdleAfterDropStillOffersChipAndSheet() {
        // PM5 didDisconnect leaves connectionState `.idle`; connectionLost is
        // a side flag. Tests must cover `.idle`, not only `.lost`.
        let p = path(wantsPM5: true, pm5: .idle, pm5Lost: true)
        XCTAssertTrue(p.showPM5Chip, ".idle after a drop must not hide the PM5 chip")
        XCTAssertTrue(p.pm5OpensSheet)
        XCTAssertFalse(p.requiresBeginBlock)
        XCTAssertFalse(p.showCintaChip)
    }

    func testHRNoneStillShowsChip() {
        let p = path(hr: .lost, hrSource: nil)
        XCTAssertTrue(p.showHRChip, "hrSource == nil must not hide the HR chip")
        XCTAssertTrue(p.hrOpensPicker)
        XCTAssertFalse(p.requiresBeginBlock)
    }

    func testReturnToRunCoverClosedStillOffersChip() {
        // SuperficieViva.de == .run, cover closed (maybeAutoOpenRunCover already
        // stamped, or chipper fold `.reps` never auto-opened).
        let p = path(wantsCinta: true, coverOpen: false, treadmill: .lost)
        XCTAssertTrue(p.showCintaChip)
        XCTAssertTrue(p.showTreadmillEntry)
        XCTAssertTrue(p.cintaOpensPicker)
        XCTAssertFalse(p.requiresBeginBlock)
    }

    func testCoverOpenDoesNotNeedHostEntry() {
        let p = path(wantsCinta: true, coverOpen: true, treadmill: .lost)
        XCTAssertTrue(p.showCintaChip)
        XCTAssertFalse(p.showTreadmillEntry, "HUD already has the picker")
    }

    func testDropDoesNotFinishTheWorkout() {
        let s = WorkoutSession(plan: .minimal(title: "FH-59"))
        s.start(); s.beginBlock(); s.stop()
        XCTAssertFalse(s.isFinished)
        let p = path(wantsCinta: true, treadmill: .lost)
        XCTAssertFalse(s.isFinished, "a BLE drop must not finish the session")
        XCTAssertFalse(p.requiresBeginBlock)
        // Recovery is the picker, not a second beginBlock.
        XCTAssertTrue(p.cintaOpensPicker)
    }

    func testPrepareOnAppearDoesNotConnectAfterIdle() {
        // Control: appearing on a station must not reach for a machine.
        // DeviceChannel.prepare() is the onAppear hook; already proven inert
        // in DeviceChannelTests. Here the live path must not invent a connect.
        let p = path(wantsCinta: true, wantsPM5: true, treadmill: .idle, pm5: .idle)
        XCTAssertTrue(p.cintaOpensPicker)
        XCTAssertTrue(p.pm5OpensSheet)
        XCTAssertFalse(p.requiresBeginBlock)
    }
}
