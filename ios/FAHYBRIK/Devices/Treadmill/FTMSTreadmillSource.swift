import CoreBluetooth
import Foundation

// Real FTMS treadmill over CoreBluetooth. Mirrors the PM5Service pattern:
// NSObject + CBCentralManager on the main queue, a pure parser does the byte work,
// state is pushed out through callbacks.
//
// CONNECTION MODEL (the gym fix): scanning ACCUMULATES every Fitness Machine it
// finds into a candidate list (name + signal) and reports it — it never
// auto-connects to "the first one found", which in a shared gym is a stranger's
// treadmill. The DeviceChannel decides whether to auto-connect (only the single
// remembered machine) or hand the athlete the list to pick from. Once a specific
// peripheral is chosen it auto-reconnects to THAT machine on an unexpected drop, and
// disconnects deterministically (with a timeout) when the athlete asks.
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
    /// Whether the machine has GRANTED control (ack of Request-Control). Set false on a
    /// permission-lost status so the next command re-requests.
    private var hasControl = false
    /// Commands queued while we wait for the Request-Control grant, flushed on success.
    private var pendingCommands: [TreadmillControlCommand] = []
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

    func connectRemembered(_ id: DeviceID) {
        intentionalStop = false
        guard central.state == .poweredOn,
              let p = central.retrievePeripherals(withIdentifiers: [id]).first else {
            return   // the channel's scan + fallback timer take over
        }
        connect(p, advertised: [])
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

    /// Drive the belt. The caller just states intent; we own the Request-Control
    /// handshake: a set/start/stop issued before control is granted queues behind an
    /// automatic Request-Control and flushes on the grant. No-op on a read-only belt.
    func send(_ command: TreadmillControlCommand) {
        guard let cp = controlPointChar, let p = peripheral else { return }
        if command != .requestControl, !hasControl {
            if !pendingCommands.contains(command) { pendingCommands.append(command) }
            write(.requestControl, to: cp, on: p)
            return
        }
        write(command, to: cp, on: p)
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
        // Fresh machine → forget any prior machine's control state/capability.
        resetControlState()
        diag.note(peripheral: p, advertised: advertised)
        onLink?(.connecting)
        central.connect(p, options: nil)
    }

    private func resetControlState() {
        controlPointChar = nil
        capability = .none
        featureCharPresent = false
        hasControl = false
        pendingCommands.removeAll()
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
        peripheral.discoverServices([TreadmillGATT.fitnessMachineService,
                                     TreadmillGATT.heartRateService])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        guard !intentionalStop else { return }
        onLink?(.reconnecting)
        central.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        dataChar = nil
        if intentionalStop {
            finalizeDisconnect()      // athlete-initiated: settle to idle now
            return
        }
        // Unexpected drop of the CHOSEN machine → reconnect to that same peripheral
        // (connect() with no timeout resolves when it's back in range).
        onLink?(.reconnecting)
        central.connect(peripheral, options: nil)
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
                // Subscribe to command acks (Control Point is indicate/notify).
                if ch.properties.contains(.indicate) || ch.properties.contains(.notify) {
                    peripheral.setNotifyValue(true, for: ch)
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

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value else { return }
        switch characteristic.uuid {
        case TreadmillGATT.treadmillData:
            if let sample = FTMSTreadmillParser.parse(data) { onSample?(sample) }
        case TreadmillGATT.controlPoint:
            handleControlResponse(data)
        case TreadmillGATT.machineStatus:
            if let event = FTMSControl.decodeMachineEvent(data) {
                if event == .controlPermissionLost { hasControl = false }
                onMachineEvent?(event)
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
            capability.incline = FTMSControl.decodeInclineRange(data)
            publishCapability()
        default:
            break
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        // Transport-level ack only; the command's REAL result arrives as a Control Point
        // INDICATION → handleControlResponse. A transport error surfaces as a failed
        // command so the UI never hangs waiting on a write that never left.
        if error != nil, characteristic.uuid == TreadmillGATT.controlPoint {
            onControlResult?(.operationFailed)
        }
    }

    // MARK: - Control

    private func handleControlResponse(_ data: Data) {
        guard let resp = FTMSControl.decodeResponse(data) else { return }
        if resp.request == FTMSControl.requestOpCode(for: .requestControl) {
            if resp.result == .success {
                hasControl = true
                flushPending()
            }
        }
        if resp.result == .controlNotPermitted { hasControl = false }
        onControlResult?(resp.result)
    }

    private func publishCapability() {
        onControlCapability?(capability)
    }

    private func flushPending() {
        guard let cp = controlPointChar, let p = peripheral else { pendingCommands.removeAll(); return }
        let queued = pendingCommands
        pendingCommands.removeAll()
        for command in queued { write(command, to: cp, on: p) }
    }

    private func write(_ command: TreadmillControlCommand, to cp: CBCharacteristic, on p: CBPeripheral) {
        let type: CBCharacteristicWriteType = cp.properties.contains(.write) ? .withResponse : .withoutResponse
        p.writeValue(FTMSControl.encode(command), for: cp, type: type)
    }
}
