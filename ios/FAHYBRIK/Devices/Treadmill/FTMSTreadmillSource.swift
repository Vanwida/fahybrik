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
    /// Rate-limit stamp for the raw 0x2ACD `[CINTA]` echo (see `logTreadmillData`).
    private var lastTreadmillDataLogAt: Date?

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
        sequencer.onStrategyChange = { [weak self] strategy in
            guard let self else { return }
            // The rung is a property of the MACHINE, not of the link — carrying it across
            // a reconnect spares the athlete a second dead tap.
            self.learnedStrategy = strategy
            self.capability.strategy = strategy
            self.noteControlFacts()
            self.publishCapability()
        }
        sequencer.onInclineDialectChange = { [weak self] dialect in
            guard let self else { return }
            self.learnedInclineDialect = dialect
            self.capability.inclineDialect = dialect
            self.applyInclineDialectToRange()
            self.noteControlFacts()
            self.publishCapability()
        }
        sequencer.onSpeedControlUnsupported = { [weak self] in
            guard let self else { return }
            // The belt cannot be told a speed (proven, not guessed): speed is now the
            // athlete's on the console. A property of the MACHINE — remember it so a
            // reconnect doesn't re-spam 0x02. Incline / read-back stay fully controllable.
            self.learnedSpeedUnsupported = true
            self.capability.canControlSpeed = false
            self.noteControlFacts()
            self.publishCapability()
        }
    }

    /// Keep the shareable dump's header in step with what the control plane is doing —
    /// so "Compartir diagnóstico" always opens with the CURRENT mode, not the initial one.
    private func noteControlFacts() {
        diag.note(fact: "Familia", capability.profile.label)
        diag.note(fact: "Velocidad por Bluetooth", offerSummary(capability.offersSpeedControl,
                                                               declared: capability.declaresSpeedTarget,
                                                               refused: !capability.canControlSpeed))
        diag.note(fact: "Inclinación por Bluetooth", offerSummary(capability.offersInclineControl,
                                                                 declared: capability.declaresInclineTarget,
                                                                 refused: !capability.canControlIncline))
        diag.note(fact: "Modo de control", "\(capability.strategy.rung) — \(capability.strategy.label)")
        diag.note(fact: "Bytes que enviaría a 6 km/h",
                  capability.strategy.wireHint.replacingOccurrences(of: "02 F4 01", with: "02 58 02"))
        diag.note(fact: "Inclinación codificada como", capability.inclineDialect.label)
    }

    /// Why an axis is (not) offered to the athlete, in the order the reasons apply — so the
    /// shared dump answers "¿por qué no me salen los botones?" without reading the code.
    private func offerSummary(_ offered: Bool, declared: Bool, refused: Bool) -> String {
        if offered { return "se ofrece el control en la app" }
        if !TreadmillControlPolicy.appDrivesMachines {
            return "la app no maneja máquinas de momento — solo lee"
        }
        if !capability.hasControlPoint { return "la cinta no tiene dónde escribir" }
        if !declared { return "la cinta declara que NO la acepta" }
        if refused { return "la cinta rechazó el comando — manual en la consola" }
        return "no disponible"
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
    /// one-op-at-a-time serialization and the transport gate. No-op on a read-only belt.
    func send(_ command: TreadmillControlCommand) {
        guard controlPointChar != nil, peripheral != nil else { return }
        sequencer.send(command)
    }

    /// Program the machine's own display (targeted distance / time). Never errors out.
    func sendBestEffort(_ command: TreadmillControlCommand) {
        guard controlPointChar != nil, peripheral != nil else { return }
        sequencer.sendBestEffort(command)
    }

    /// FIELD DIAGNOSIS: pin / release the prelude rung by hand.
    func forceStrategy(_ strategy: FTMSControlStrategy?) { sequencer.forceStrategy(strategy) }
    /// FIELD DIAGNOSIS: pin / release the incline interpretation by hand.
    func forceInclineDialect(_ dialect: FTMSInclineDialect?) { sequencer.forceInclineDialect(dialect) }

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
            learnedStrategy = nil
            learnedInclineDialect = nil
            learnedSpeedUnsupported = false
            learnedProfileFor = p.identifier
        }
        // Fresh machine → forget any prior machine's control state/capability. Control
        // permission NEVER survives a reconnect, so this also re-arms Request-Control.
        resetControlState()
        diag.note(peripheral: p, advertised: advertised)
        // The name the machine ADVERTISED (which is what identifies the family, and what
        // he'll see in nRF Connect) is not always the same as `peripheral.name`.
        diag.note(fact: "Nombre anunciado",
                  found[p.identifier]?.candidate.name ?? p.name ?? "sin nombre")
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
        learnedProfile = detected
        sequencer.adoptProfile(detected)
        capability.profile = sequencer.profile
        capability.strategy = sequencer.strategy
        capability.inclineDialect = sequencer.inclineDialect
        noteControlFacts()
    }

    private func resetControlState() {
        controlPointChar = nil
        capability = .none
        rawInclineRange = nil
        cccdGeneration += 1
        // Control permission and the transport gate are re-earned on every link, but what
        // we LEARNED about this machine (the rung that worked, the incline units that
        // matched) is a property of the machine — carrying it over spares the athlete a
        // second dead tap.
        sequencer.reset(profile: learnedProfile,
                        strategy: learnedStrategy,
                        inclineDialect: learnedInclineDialect,
                        speedUnsupported: learnedSpeedUnsupported)
        capability.profile = sequencer.profile
        capability.strategy = sequencer.strategy
        capability.inclineDialect = sequencer.inclineDialect
    }

    /// What we learned about the machine currently selected — the family from its name,
    /// the prelude rung that actually moved it, and the incline units it answered to.
    /// Cleared only when the athlete picks a DIFFERENT machine.
    private var learnedProfile: FTMSControlProfile = .standard
    private var learnedStrategy: FTMSControlStrategy?
    private var learnedInclineDialect: FTMSInclineDialect?
    /// The belt's firmware proved it cannot set a speed target — carried across reconnects to
    /// the SAME machine so the honest manual state is instant, with no repeat 0x02 spam.
    private var learnedSpeedUnsupported = false
    private var learnedProfileFor: DeviceID?
    /// Guards the Control Point CCCD grace timer against a stale fire after a reconnect.
    private var cccdGeneration = 0

    /// The Supported Inclination Range as the machine reported it, in 0.1 % units — kept
    /// raw so the level translation can be (re)applied if the profile changes later.
    private var rawInclineRange: FTMSControl.Range?

    /// Under the LEVEL interpretation the Supported Inclination Range is in the same
    /// internal units as the Inclination field, so it must be translated to console levels
    /// before the UI clamps a stepper with it — otherwise "max 100" reads as 100 levels.
    /// Re-applied whenever the dialect flips, so the stepper's bounds follow the units.
    private func applyInclineDialectToRange() {
        guard let raw = rawInclineRange else { return }
        guard capability.inclineDialect == .level else { capability.incline = raw; return }
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
                // Somewhere to write — necessary, never sufficient. These two say only that
                // the machine has not REFUSED the op on the wire (speed carries over a
                // refusal it already proved, so a reconnect doesn't re-spam 0x02). What the
                // athlete is actually offered also needs the machine's own declaration, read
                // from 0x2ACC below — see `TreadmillControlCapability.offersSpeedControl`.
                capability.canControlSpeed = !learnedSpeedUnsupported
                capability.canControlIncline = true
                // ORDER MATTERS: the Control Point's CCCD must be configured BEFORE the
                // first write, or the machine answers ATT "CCC Improperly Configured".
                if ch.properties.contains(.indicate) || ch.properties.contains(.notify) {
                    peripheral.setNotifyValue(true, for: ch)
                    armCCCDGrace()
                } else {
                    // Nothing to subscribe to → nothing to wait for, and nothing will ever
                    // ack, so ops must not sit out a timeout each.
                    diag.log("El punto de control no indica ni notifica — sin acks que esperar")
                    sequencer.transportReady(indications: false)
                }
            case TreadmillGATT.machineStatus where ch.properties.contains(.notify):
                peripheral.setNotifyValue(true, for: ch)   // console / safety-key sync
            case TreadmillGATT.fitnessMachineFeature where ch.properties.contains(.read):
                peripheral.readValue(for: ch)
            case TreadmillGATT.supportedSpeedRange where ch.properties.contains(.read):
                peripheral.readValue(for: ch)
            case TreadmillGATT.supportedInclineRange where ch.properties.contains(.read):
                peripheral.readValue(for: ch)
            default:
                break
            }
        }
        // Publish what we know the moment the machine is enumerated — the Control Point is
        // half the answer. The other half (which targets the machine DECLARES it takes)
        // lands with the 0x2ACC read below and publishes again; until then the capability
        // declares nothing, which is exactly what "no controls" is built on.
        if service.uuid == TreadmillGATT.fitnessMachineService {
            diag.note(fact: "Punto de control 0x2AD9",
                      capability.hasControlPoint ? "presente y escribible → hay dónde escribir"
                                                 : "ausente / no escribible → solo lectura")
            noteControlFacts()
            publishCapability()
        }
    }

    /// Some firmwares never confirm the Control Point's descriptor write — no callback, or
    /// a callback with `isNotifying == false` and no error. Blocking on that forever means
    /// every button in the HUD is dead for the whole session. After a short grace we write
    /// anyway and say so: a command that MIGHT be rejected beats a machine we never asked.
    private func armCCCDGrace() {
        cccdGeneration += 1
        let gen = cccdGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + DeviceConnectionTiming.controlPointCCCDGraceSeconds) {
            [weak self] in
            guard let self, self.cccdGeneration == gen, !self.sequencer.isTransportReady else { return }
            self.diag.log("La cinta no confirmó las indicaciones del punto de control en "
                          + "\(DeviceConnectionTiming.controlPointCCCDGraceSeconds) s — escribo igualmente")
            self.sequencer.transportReady(indications: true)
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
            sequencer.transportReady(indications: false)
            return
        }
        if characteristic.isNotifying {
            diag.note(fact: "Indicaciones 0x2AD9", "activas")
            sequencer.transportReady(indications: true)
        } else {
            // Answered, but refused to subscribe. Don't wait out the grace for nothing.
            diag.log("La cinta respondió al CCCD pero NO quedó notificando — escribo sin esperar acks")
            diag.note(fact: "Indicaciones 0x2AD9", "la cinta no las activó")
            sequencer.transportReady(indications: false)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value else { return }
        switch characteristic.uuid {
        case TreadmillGATT.treadmillData:
            if let sample = FTMSTreadmillParser.parse(data) {
                logTreadmillData(raw: data, sample: sample)
                onSample?(adaptToProfile(sample))
            }
        case TreadmillGATT.controlPoint:
            sequencer.handleIndication(data)
        case TreadmillGATT.machineStatus:
            if let event = FTMSControl.decodeMachineEvent(data) {
                let adapted = adaptToProfile(event)
                sequencer.handleMachineEvent(adapted)
                onMachineEvent?(adapted)
            }
        case TreadmillGATT.fitnessMachineFeature:
            // THE MACHINE'S OWN DECLARATION of which targets it takes. It is the gate on
            // what the athlete is offered: we paint a control only for a target the machine
            // says it accepts. An unreadable word declares nothing, so it offers nothing.
            diag.note(fact: "0x2ACC (Fitness Machine Feature)", Self.hex(data))
            guard let f = FTMSControl.decodeTargetFeatures(data) else {
                diag.log("0x2ACC llegó con \(data.count) bytes (<8) — ilegible. La cinta no "
                         + "declara nada, así que no se ofrece ningún control; los datos se "
                         + "siguen leyendo igual.")
                return
            }
            capability.targetFeatureBits = f.raw
            capability.declaresSpeedTarget = f.speed
            capability.declaresInclineTarget = f.incline
            capability.canSetTargetDistance = f.targetedDistance
            capability.canSetTargetTime = f.targetedTrainingTime
            diag.note(fact: "Target Setting Features",
                      String(format: "0x%08X — velocidad %@ · inclinación %@ · distancia %@ · tiempo %@",
                             f.raw, f.speed ? "sí" : "NO", f.incline ? "sí" : "NO",
                             f.targetedDistance ? "sí" : "NO", f.targetedTrainingTime ? "sí" : "NO"))
            if !f.speed || !f.incline {
                diag.log("La cinta dice NO poder fijar "
                         + [f.speed ? nil : "velocidad", f.incline ? nil : "inclinación"]
                            .compactMap { $0 }.joined(separator: " ni ")
                         + ". Le tomo la palabra: ese control no se pinta. Si en el gimnasio "
                         + "resulta que sí obedece, «Modo de control» manda el comando a mano.")
            }
            publishCapability()
        case TreadmillGATT.supportedSpeedRange:
            diag.note(fact: "0x2AD4 (rango de velocidad)", Self.hex(data))
            capability.speed = FTMSControl.decodeSpeedRange(data)
            if let r = capability.speed {
                diag.note(fact: "Velocidad admitida",
                          String(format: "%.2f – %.2f km/h, paso %.2f", r.min, r.max, r.step))
            }
            publishCapability()
        case TreadmillGATT.supportedInclineRange:
            diag.note(fact: "0x2AD5 (rango de inclinación)", Self.hex(data))
            rawInclineRange = FTMSControl.decodeInclineRange(data)
            if let r = rawInclineRange {
                diag.note(fact: "Inclinación admitida (cruda)",
                          String(format: "%.0f – %.0f, paso %.0f  (como %% → %.1f – %.1f)",
                                 r.min * 10, r.max * 10, r.step * 10, r.min, r.max))
            }
            applyInclineDialectToRange()
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

    /// Re-express a telemetry sample in the units THIS machine actually speaks. Under the
    /// LEVEL interpretation the Inclination field is internal units, so the grade we'd
    /// otherwise publish (raw ÷ 10) is fiction — we publish a console level instead and
    /// leave `inclinePct` empty rather than show a number that isn't a percentage.
    private func adaptToProfile(_ sample: TreadmillSample) -> TreadmillSample {
        if let speed = sample.speedKmh { sequencer.noteBeltSpeed(kmh: speed) }
        guard let pct = sample.inclinePct else { return sample }
        // The raw field feeds the units ladder: it is how we find out which reading is real.
        sequencer.noteInclineRaw(pct * 10)
        guard capability.inclineDialect == .level else { return sample }
        var adapted = sample
        adapted.inclineLevel = FTMSInclineLevels.level(forRaw: pct * 10)
        adapted.inclinePct = nil
        return adapted
    }

    /// Same translation for the machine's own "target inclination changed" report.
    private func adaptToProfile(_ event: TreadmillMachineEvent) -> TreadmillMachineEvent {
        guard capability.inclineDialect == .level,
              case .targetInclineChangedPct(let pct) = event else { return event }
        return .targetInclineChangedLevel(FTMSInclineLevels.level(forRaw: pct * 10))
    }

    /// Space-separated hex, byte for byte identical to what nRF Connect shows — so a
    /// manual write there and our trace can be compared without translating anything.
    private static func hex(_ data: Data) -> String {
        data.map { String(format: "%02X", $0) }.joined(separator: " ")
    }

    /// Echo the raw 0x2ACD packet + what we PARSED from it to the `[CINTA]` console, rate
    /// limited. This is how the founder sees the "0.0 km/h while distance climbs" bug in his
    /// Xcode log: the flags, the instantaneous-speed field, the average, and the odometer,
    /// side by side, straight off the wire.
    private func logTreadmillData(raw: Data, sample: TreadmillSample) {
        let now = Date()
        if let last = lastTreadmillDataLogAt,
           now.timeIntervalSince(last) < TreadmillConstants.rawDataLogIntervalSeconds { return }
        lastTreadmillDataLogAt = now
        let inst = sample.speedKmh.map { String(format: "%.2f", $0) } ?? "—"
        let avg = sample.avgSpeedKmh.map { String(format: "%.2f", $0) } ?? "—"
        let odo = sample.totalDistanceM.map { String(format: "%.0f m", $0) } ?? "—"
        diag.log("0x2ACD [\(Self.hex(raw))] → vel inst \(inst) km/h · media \(avg) km/h · odómetro \(odo)")
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
