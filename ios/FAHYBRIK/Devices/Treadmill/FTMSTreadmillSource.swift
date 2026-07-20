import CoreBluetooth
import Foundation

// Real FTMS treadmill over CoreBluetooth. Mirrors the PM5Service pattern:
// NSObject + CBCentralManager on the main queue, a pure parser does the byte work,
// state is pushed out through callbacks.
//
// CONNECTION MODEL: scanning ACCUMULATES every Fitness Machine it finds into a
// candidate list (name + signal) and reports it. It NEVER connects — not to the first
// one found, not to the one used last, and not back to a machine that just dropped.
// The DeviceChannel hands the athlete the list; he taps his belt and confirms it is
// his; only then does `connect(_:)` open a link. An unexpected drop reports `.lost`
// and stops there, and a failed attempt reports `.failed` with no retry loop.
//
// WHY SO STRICT: this class can DRIVE the machine (speed, incline, start, stop) via
// the Control Point. Reconnecting on our own once re-grabbed a belt in a shared gym —
// equipment rotates, so the machine we'd be reaching for may have somebody else on it.
// Disconnects stay deterministic (with a timeout) when the athlete asks.
//
// NOTE: CoreBluetooth is unavailable in the iOS simulator; the HUD uses
// MockTreadmillSource there. This class only runs on device.
final class FTMSTreadmillSource: NSObject, TreadmillDataSource, TreadmillControllable {
    var onSample: ((TreadmillSample) -> Void)?
    var onLink: ((DeviceLink) -> Void)?
    var onDiscovered: (([DeviceCandidate]) -> Void)?
    var onBluetooth: ((BluetoothAvailability) -> Void)?

    // Control seam (drive the belt + keep the app synced to the machine).
    var onControlCapability: ((TreadmillControlCapability) -> Void)?
    var onMachineEvent: ((TreadmillMachineEvent) -> Void)?
    var onControlResult: ((TreadmillControlResult) -> Void)?

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var dataChar: CBCharacteristic?
    /// The writable Control Point (0x2AD9) once discovered — nil on a read-only belt.
    private var controlPointChar: CBCharacteristic?
    /// Accumulated as feature + range reads land; published to `onControlCapability`.
    private var capability = TreadmillControlCapability.none
    private var featureCharPresent = false
    /// The op pipeline: serialization, the Request-Control lifecycle, the per-family
    /// dialect and the escalation. All the control RULES live there (pure + tested); this
    /// class only moves bytes and feeds it what CoreBluetooth reports.
    private let sequencer = FTMSControlSequencer()
    /// Everything the current scan has turned up, by identifier — we keep the live
    /// CBPeripheral so a later `connect(id)` reaches that exact machine.
    private var found: [DeviceID: (peripheral: CBPeripheral, candidate: DeviceCandidate)] = [:]
    private var pendingScan = false
    private var intentionalStop = false
    /// Bumped on disconnect so a late didDisconnect callback and the forced-timeout
    /// finalize don't both fire.
    private var disconnectGen = 0
    private var diag = DeviceDiagnostics(role: "Cinta")

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil,
                                   options: [CBCentralManagerOptionShowPowerAlertKey: true])
        wireSequencer()
    }

    private func wireSequencer() {
        sequencer.onWrite = { [weak self] data in self?.rawWrite(data) }
        sequencer.onResult = { [weak self] result in self?.onControlResult?(result) }
        sequencer.onDiagnostic = { [weak self] line in self?.diag.log(line) }
        sequencer.onProfileChange = { [weak self] profile in
            guard let self else { return }
            self.learnedProfile = profile
            self.capability.profile = profile
            self.applyProfileToInclineRange()
            self.publishCapability()
        }
    }

    func startScan() {
        intentionalStop = false
        found.removeAll()
        onDiscovered?([])
        switch central.state {
        case .poweredOn: beginScan()
        case .unknown, .resetting: pendingScan = true
        default: onLink?(.unavailable)
        }
    }

    func connect(_ id: DeviceID) {
        intentionalStop = false
        if let p = found[id]?.peripheral {
            connect(p, advertised: [])
        } else if let p = central.retrievePeripherals(withIdentifiers: [id]).first {
            connect(p, advertised: [])
        }
    }

    func disconnect() {
        intentionalStop = true
        pendingScan = false
        if central.isScanning { central.stopScan() }
        guard let p = peripheral else { onLink?(.idle); return }
        disconnectGen += 1
        let gen = disconnectGen
        central.cancelPeripheralConnection(p)
        // Deterministic: if CoreBluetooth's didDisconnect doesn't arrive (machine off
        // / out of range), force the disconnected state so the chip can't hang.
        DispatchQueue.main.asyncAfter(deadline: .now() + DeviceConnectionTiming.disconnectTimeoutSeconds) { [weak self] in
            guard let self, self.disconnectGen == gen else { return }
            self.finalizeDisconnect()
        }
    }

    func stop() {
        intentionalStop = true
        pendingScan = false
        if central.isScanning { central.stopScan() }
        if let p = peripheral { central.cancelPeripheralConnection(p) }
        finalizeDisconnect()
    }

    func diagnosticsText() -> String? { diag.text() }

    /// Drive the belt. The caller just states intent; the sequencer owns the prelude, the
    /// one-op-at-a-time serialization and the CCCD gate. No-op on a read-only belt.
    func send(_ command: TreadmillControlCommand) {
        guard controlPointChar != nil, peripheral != nil else { return }
        sequencer.send(command)
    }

    // MARK: - Private

    private func finalizeDisconnect() {
        disconnectGen += 1
        peripheral = nil
        dataChar = nil
        resetControlState()
        onControlCapability?(.none)   // the belt is gone → no control
        onLink?(.idle)
    }

    private func beginScan() {
        diag.reset()
        onLink?(.scanning)
        central.scanForPeripherals(withServices: [TreadmillGATT.fitnessMachineService],
                                   options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }

    private func connect(_ p: CBPeripheral, advertised: [CBUUID]) {
        if central.isScanning { central.stopScan() }
        peripheral = p
        p.delegate = self
        // A DIFFERENT machine → forget what we learned about the last one.
        if learnedProfileFor != p.identifier {
            learnedProfile = .standard
            learnedProfileFor = p.identifier
        }
        // Fresh machine → forget any prior machine's control state/capability. Control
        // permission NEVER survives a reconnect, so this also re-arms Request-Control.
        resetControlState()
        diag.note(peripheral: p, advertised: advertised)
        detectProfile(for: p)
        onLink?(.connecting)
        central.connect(p, options: nil)
    }

    /// Identify the machine FAMILY from its advertised name, so the right control dialect
    /// is in place before the first command. Called at connect and again on `didConnect`
    /// (a peripheral's `name` is not always populated before the link is up).
    private func detectProfile(for p: CBPeripheral) {
        let name = p.name ?? found[p.identifier]?.candidate.name
        let detected = FTMSControlProfile.detect(name: name)
        guard detected != .standard else { return }
        sequencer.adoptProfile(detected)
    }

    private func resetControlState() {
        controlPointChar = nil
        capability = .none
        featureCharPresent = false
        rawInclineRange = nil
        // Control permission and the CCCD are re-earned on every link, but the DIALECT we
        // learned about this machine (including an escalation it forced on us) is a
        // property of the machine — carrying it over spares the athlete a second dead tap.
        capability.profile = learnedProfile
        sequencer.reset(profile: learnedProfile)
    }

    /// The dialect learned for the machine currently selected — the family detected from
    /// its name, or an escalation it forced mid-session. Cleared only when the athlete
    /// picks a DIFFERENT machine.
    private var learnedProfile: FTMSControlProfile = .standard
    private var learnedProfileFor: DeviceID?

    /// The Supported Inclination Range as the machine reported it, in 0.1 % units — kept
    /// raw so the level translation can be (re)applied if the profile changes later.
    private var rawInclineRange: FTMSControl.Range?

    /// On an i.Concept machine the Supported Inclination Range is in the SAME internal
    /// units as the Inclination field, so it must be translated to console levels before
    /// the UI clamps a stepper with it — otherwise "max 100" reads as 100 levels.
    private func applyProfileToInclineRange() {
        guard let raw = rawInclineRange else { return }
        guard capability.profile.inclineIsLevel else { capability.incline = raw; return }
        capability.incline = FTMSControl.Range(
            min: FTMSInclineLevels.level(forRaw: raw.min * 10),
            max: FTMSInclineLevels.level(forRaw: raw.max * 10),
            step: FTMSInclineLevels.levelStep)
    }
}

extension FTMSTreadmillSource: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        onBluetooth?(BluetoothAvailability(central.state))
        switch central.state {
        case .poweredOn:
            if pendingScan { pendingScan = false; beginScan() }
        case .poweredOff, .unauthorized, .unsupported:
            onLink?(.unavailable)
        default:
            break
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        // Accumulate — never auto-connect. The channel decides what to do with the list.
        let id = peripheral.identifier
        let name = peripheral.name
            ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
            ?? "Cinta \(id.uuidString.prefix(4))"
        found[id] = (peripheral, DeviceCandidate(id: id, name: name, rssi: RSSI.intValue))
        onDiscovered?(found.values.map(\.candidate).sorted { $0.rssi > $1.rssi })
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        detectProfile(for: peripheral)   // `name` is reliably populated once connected
        peripheral.discoverServices([TreadmillGATT.fitnessMachineService,
                                     TreadmillGATT.heartRateService])
    }

    /// The attempt failed. We say so and STOP. There is no retry loop: a retry is a
    /// connect the athlete did not ask for, aimed at a belt that may since have been
    /// taken by somebody else.
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        guard !intentionalStop else { return }
        self.peripheral = nil
        dataChar = nil
        resetControlState()
        onControlCapability?(.none)
        onLink?(.failed("No pude conectar con la cinta. Vuelve a intentarlo."))
    }

    /// The belt dropped. WE DO NOT GO BACK FOR IT.
    ///
    /// This method used to call `central.connect(peripheral)` again, which silently
    /// re-grabbed the machine — the single most dangerous line in the device layer once
    /// the app could drive belts. Gym equipment rotates: by the time a link drops and
    /// comes back, that belt may be under another athlete, mid-run, and we would be
    /// holding its control point. The link dies here, honestly, and the athlete decides
    /// what to connect to next from a fresh list.
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        dataChar = nil
        if intentionalStop {
            finalizeDisconnect()      // athlete-initiated: settle to idle now
            return
        }
        disconnectGen += 1
        self.peripheral = nil
        resetControlState()
        onControlCapability?(.none)   // the belt is gone → no control
        onLink?(.lost)                // "se perdió la conexión" + a button back to the list
    }
}

extension FTMSTreadmillSource: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        for service in peripheral.services ?? [] {
            diag.note(service: service.uuid)
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        for ch in service.characteristics ?? [] {
            diag.note(characteristic: ch.uuid, of: service.uuid, properties: ch.properties)
            switch ch.uuid {
            case TreadmillGATT.treadmillData where ch.properties.contains(.notify):
                dataChar = ch
                peripheral.setNotifyValue(true, for: ch)
                onLink?(.connected(name: peripheral.name ?? "Cinta"))
            case TreadmillGATT.controlPoint
                where ch.properties.contains(.write) || ch.properties.contains(.writeWithoutResponse):
                controlPointChar = ch
                capability.hasControlPoint = true
                // ORDER MATTERS: the Control Point's CCCD must be configured BEFORE the
                // first write, or the machine answers ATT "CCC Improperly Configured".
                // Writes stay queued until `didUpdateNotificationStateFor` confirms it.
                if ch.properties.contains(.indicate) || ch.properties.contains(.notify) {
                    peripheral.setNotifyValue(true, for: ch)
                } else {
                    // Nothing to subscribe to → nothing to wait for.
                    diag.log("El punto de control no indica ni notifica — sin acks que esperar")
                    sequencer.transportReady()
                }
            case TreadmillGATT.machineStatus where ch.properties.contains(.notify):
                peripheral.setNotifyValue(true, for: ch)   // console / safety-key sync
            case TreadmillGATT.fitnessMachineFeature where ch.properties.contains(.read):
                featureCharPresent = true
                peripheral.readValue(for: ch)
            case TreadmillGATT.supportedSpeedRange where ch.properties.contains(.read):
                peripheral.readValue(for: ch)
            case TreadmillGATT.supportedInclineRange where ch.properties.contains(.read):
                peripheral.readValue(for: ch)
            default:
                break
            }
        }
        // Once the Fitness Machine's characteristics are enumerated we know whether the
        // belt is controllable. A read-only belt publishes `.none` now (definitive); a
        // controllable belt WITHOUT a feature word can't declare its targets, so we fall
        // back to assuming speed control (a writable Control Point almost always means a
        // speed-settable belt) — otherwise we wait for the feature read to be precise.
        if service.uuid == TreadmillGATT.fitnessMachineService {
            if !capability.hasControlPoint {
                publishCapability()
            } else if !featureCharPresent {
                capability.canControlSpeed = true
                publishCapability()
            }
        }
    }

    /// The Control Point subscription is the gate on every write — flush only once the
    /// machine confirms it, and say so out loud if it refuses.
    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic,
                    error: Error?) {
        guard characteristic.uuid == TreadmillGATT.controlPoint else { return }
        if let error {
            diag.log("FALLÓ activar indicaciones del punto de control: \(error.localizedDescription)")
            // Better a write that may be rejected than a HUD whose buttons do nothing.
            sequencer.transportReady()
            return
        }
        if characteristic.isNotifying { sequencer.transportReady() }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value else { return }
        switch characteristic.uuid {
        case TreadmillGATT.treadmillData:
            if let sample = FTMSTreadmillParser.parse(data) { onSample?(adaptToProfile(sample)) }
        case TreadmillGATT.controlPoint:
            sequencer.handleIndication(data)
        case TreadmillGATT.machineStatus:
            if let event = FTMSControl.decodeMachineEvent(data) {
                let adapted = adaptToProfile(event)
                sequencer.handleMachineEvent(adapted)
                onMachineEvent?(adapted)
            }
        case TreadmillGATT.fitnessMachineFeature:
            if let f = FTMSControl.decodeTargetFeatures(data) {
                capability.canControlSpeed = f.speed
                capability.canControlIncline = f.incline
                publishCapability()
            }
        case TreadmillGATT.supportedSpeedRange:
            capability.speed = FTMSControl.decodeSpeedRange(data)
            publishCapability()
        case TreadmillGATT.supportedInclineRange:
            rawInclineRange = FTMSControl.decodeInclineRange(data)
            applyProfileToInclineRange()
            publishCapability()
        default:
            break
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        // Transport-level ack only; the command's REAL result arrives as a Control Point
        // INDICATION. The sequencer needs BOTH: it releases fire-and-forget prelude ops
        // here, and a transport error must never leave the pipeline stuck in flight.
        guard characteristic.uuid == TreadmillGATT.controlPoint else { return }
        sequencer.noteWriteCompleted(error: error)
    }

    // MARK: - Control

    private func publishCapability() {
        onControlCapability?(capability)
    }

    /// Re-express a telemetry sample in the units THIS machine actually speaks. On the
    /// i.Concept family the Inclination field is internal units, so the grade we'd
    /// otherwise publish (raw ÷ 10) is fiction — we publish a console level instead and
    /// leave `inclinePct` empty rather than show a number that isn't a percentage.
    private func adaptToProfile(_ sample: TreadmillSample) -> TreadmillSample {
        if let speed = sample.speedKmh { sequencer.noteBeltSpeed(kmh: speed) }
        guard let pct = sample.inclinePct else { return sample }
        sequencer.noteInclineRaw(pct * 10)   // field-calibration capture for the level table
        guard capability.profile.inclineIsLevel else { return sample }
        var adapted = sample
        adapted.inclineLevel = FTMSInclineLevels.level(forRaw: pct * 10)
        adapted.inclinePct = nil
        return adapted
    }

    /// Same translation for the machine's own "target inclination changed" report.
    private func adaptToProfile(_ event: TreadmillMachineEvent) -> TreadmillMachineEvent {
        guard capability.profile.inclineIsLevel,
              case .targetInclineChangedPct(let pct) = event else { return event }
        return .targetInclineChangedLevel(FTMSInclineLevels.level(forRaw: pct * 10))
    }

    private func rawWrite(_ data: Data) {
        guard let cp = controlPointChar, let p = peripheral else { return }
        let type: CBCharacteristicWriteType = cp.properties.contains(.write) ? .withResponse : .withoutResponse
        p.writeValue(data, for: cp, type: type)
        // A write WITHOUT response gets no `didWriteValueFor` callback, so nothing would
        // ever release a fire-and-forget prelude op — settle it here instead.
        if type == .withoutResponse { sequencer.noteWriteCompleted(error: nil) }
    }
}
