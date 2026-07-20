import CoreBluetooth
import Foundation

// MARK: - Service-level state

enum PM5BluetoothState {
    case unknown
    case unauthorized
    case poweredOff
    case poweredOn
    case unsupported

    init(_ s: CBManagerState) {
        switch s {
        case .poweredOn:    self = .poweredOn
        case .poweredOff:   self = .poweredOff
        case .unauthorized: self = .unauthorized
        case .unsupported:  self = .unsupported
        default:            self = .unknown
        }
    }
}

enum PM5ConnectionState: Equatable {
    case idle
    case scanning
    case connecting
    case discoveringServices
    case streaming
    case disconnecting
    case failed(String)
}

struct PM5Discovered: Identifiable, Equatable {
    let id: UUID
    let name: String
    let rssi: Int
}

/// Programming handshake state ("send the workout to the monitor") — the store
/// mirrors it for the erg HUD banner: sending → "Enviando el entreno al PM5…",
/// programmed → "Listo — rema para empezar", failed → silent (diagnostics only;
/// the athlete can always just row).
enum PM5ProgramState: Equatable {
    case idle
    case sending
    case programmed
    case failed(String)
}

// Service emits parsed samples + state changes. The store subscribes; views
// observe the store. Keeps the service free of SwiftUI imports so it can be
// unit-tested with synthetic chunks.
protocol PM5ServiceDelegate: AnyObject {
    func pm5Service(_ service: PM5Service, didChangeBluetoothState state: PM5BluetoothState)
    func pm5Service(_ service: PM5Service, didUpdateDiscovered devices: [PM5Discovered])
    func pm5Service(_ service: PM5Service, didChangeConnection state: PM5ConnectionState)
    func pm5Service(_ service: PM5Service, didConnect deviceName: String, identifier: UUID)
    func pm5Service(_ service: PM5Service, didReceiveSample sample: PM5LiveSample)
    func pm5Service(_ service: PM5Service, didUpdateSplits splits: [PM5Split])
    func pm5Service(_ service: PM5Service, didDisconnect error: Error?)
    func pm5Service(_ service: PM5Service, didChangeProgramState state: PM5ProgramState)
    func pm5Service(_ service: PM5Service, didUpdateCSAFELog lines: [String])
}

// CoreBluetooth wrapper. Single-peripheral usage — we only ever want one PM5
// at a time. Auto-reconnect on disconnect is intentionally OFF here; the
// store decides whether to call `reconnectLastPaired()` based on whether
// we're inside an active row/ski-erg segment.
final class PM5Service: NSObject {
    static let shared = PM5Service()

    weak var delegate: PM5ServiceDelegate?

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var rowingService: CBService?
    // Control-plane (CSAFE) channel for PROGRAMMING workouts on the monitor.
    // 0x0021 takes our framed writes; 0x0022 notifies the PM's response frames.
    private var csafeReceiveChar: CBCharacteristic?
    private var csafeRespondChar: CBCharacteristic?
    private var responseAssembler = PM5CSAFEResponseAssembler()
    /// The wrapped command ids the current program frame must see echoed back
    /// before the piece counts as loaded (a terminate frame's echo won't match).
    private var expectedAck: Set<UInt8> = []
    /// Frames queued for the current programming (terminate first when the PM
    /// isn't at "wait to begin", then the program frame), and the ≤20-byte write
    /// slices of the frame in flight.
    private var pendingFrames: [Data] = []
    private var pendingChunks: [Data] = []
    /// Bumped per program() so a stale ack-timeout can't fail a newer attempt.
    private var programGen: Int = 0
    private(set) var programState: PM5ProgramState = .idle
    /// Hex TX/RX ring for physical debugging at the gym (max ~20 lines).
    private(set) var csafeLog: [String] = []
    private var sample: PM5LiveSample = PM5LiveSample()
    // Splits accumulate across the current PM5 workout, keyed by interval number
    // and joined from 0x37 + 0x38. Reset on each fresh stream (see below).
    private var splitsByIndex: [Int: PM5Split] = [:]
    private var discovered: [UUID: PM5Discovered] = [:]
    /// The live CBPeripherals this scan turned up, so a tap connects THAT object.
    /// `retrievePeripherals(withIdentifiers:)` can return empty right after a scan and
    /// silently no-op the tap ("pulsé y no pasó nada") — keeping the peripheral fixes it.
    private var discoveredPeripherals: [UUID: CBPeripheral] = [:]
    private var pendingScan: Bool = false
    /// Bumped on every disconnect so a late `didDisconnectPeripheral` callback and the
    /// forced-timeout finalize can't both fire (fixes the "PM5 se queda pillado" hang).
    private var disconnectGen: Int = 0

    private(set) var bluetoothState: PM5BluetoothState = .unknown
    private(set) var connectionState: PM5ConnectionState = .idle

    override init() {
        super.init()
        // queue: nil → main, fine for our 1Hz parsing rate.
        self.central = CBCentralManager(delegate: self, queue: nil, options: [
            CBCentralManagerOptionShowPowerAlertKey: true,
        ])
    }

    // MARK: - public API

    func startScan() {
        guard bluetoothState == .poweredOn else {
            pendingScan = true
            return
        }
        discovered.removeAll()
        discoveredPeripherals.removeAll()
        delegate?.pm5Service(self, didUpdateDiscovered: [])
        // Scanning COEXISTS with a live or in-flight link ("Cambiar de erg": the
        // remembered rower must never hide the SKI next to it). Only take the
        // .scanning state from a settled/failed one — flipping .streaming here
        // would read as a disconnect in the UI while the erg is still linked.
        switch connectionState {
        case .idle, .scanning, .failed:
            update(connection: .scanning)
        case .connecting, .discoveringServices, .streaming, .disconnecting:
            break
        }
        central.scanForPeripherals(
            withServices: [PM5GATT.infoService],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
    }

    func stopScan() {
        if central.isScanning { central.stopScan() }
        if case .scanning = connectionState { update(connection: .idle) }
    }

    func connect(_ id: UUID) {
        stopScan()
        // Prefer the peripheral we actually discovered this scan; only fall back to
        // retrievePeripherals (which can be empty just after a scan). If neither
        // resolves, say so instead of a silent no-op.
        if let known = discoveredPeripherals[id]
            ?? central.retrievePeripherals(withIdentifiers: [id]).first {
            connect(peripheral: known)
        } else {
            update(connection: .failed("No encuentro ese PM5. Enciéndelo, ponlo en la pantalla principal y acércate."))
        }
    }

    func disconnect() {
        // If the store thinks it's connected but we hold no peripheral, don't get
        // stuck in `.disconnecting` forever — settle to idle immediately.
        guard let peripheral else { finalizeDisconnect(); return }
        update(connection: .disconnecting)
        central.cancelPeripheralConnection(peripheral)
        disconnectGen += 1
        let gen = disconnectGen
        // Deterministic: CoreBluetooth's didDisconnect can be delayed or never arrive
        // when the erg is off / out of range. Force the disconnected state on timeout
        // so the chip returns to "conectar" instead of hanging on "desconectando".
        DispatchQueue.main.asyncAfter(deadline: .now() + DeviceConnectionTiming.disconnectTimeoutSeconds) { [weak self] in
            guard let self, self.disconnectGen == gen, self.connectionState == .disconnecting else { return }
            self.finalizeDisconnect()
        }
    }

    /// Land in the disconnected state and clean up, exactly once — shared by the
    /// normal callback path and the timeout fallback.
    private func finalizeDisconnect() {
        disconnectGen += 1
        peripheral = nil
        rowingService = nil
        resetControlPlane()
        update(connection: .idle)
        delegate?.pm5Service(self, didDisconnect: nil)
    }

    func forgetPaired() {
        UserDefaults.standard.removeObject(forKey: PM5Defaults.lastPairedIdentifier)
        UserDefaults.standard.removeObject(forKey: PM5Defaults.lastPairedName)
        disconnect()
    }

    func reconnectLastPaired() {
        guard bluetoothState == .poweredOn else {
            pendingScan = true
            return
        }
        guard let raw = UserDefaults.standard.string(forKey: PM5Defaults.lastPairedIdentifier),
              let id = UUID(uuidString: raw),
              let known = central.retrievePeripherals(withIdentifiers: [id]).first else {
            startScan()
            return
        }
        connect(peripheral: known)
    }

    /// "Cambiar de erg": drop the current link (if any) and connect the tapped one.
    /// The old peripheral is cancelled FIRST and replaced synchronously, so its late
    /// didDisconnect callback (guarded below) can't clobber the new connection.
    func switchToDevice(_ id: UUID) {
        if let current = peripheral, current.identifier != id {
            disconnectGen += 1          // cancel any pending disconnect-timeout
            peripheral = nil
            rowingService = nil
            resetControlPlane()
            central.cancelPeripheralConnection(current)
        }
        connect(id)
    }

    // MARK: - workout programming (CSAFE control plane)

    /// Load `spec` onto the monitor — exactly what ErgData does: the PM5 shows the
    /// piece and "row to begin"; the athlete touches nothing on the erg. If the PM
    /// is mid-workout (not at "wait to begin"), a terminate frame goes first so
    /// re-programming a new piece always lands on a clean monitor.
    func program(_ spec: PM5WorkoutSpec) {
        guard case .streaming = connectionState, peripheral != nil, let rx = csafeReceiveChar else {
            // No control channel (old firmware / not discovered) — fail quietly;
            // the athlete just rows and the data stream keeps working.
            logCSAFE("ERR sin canal de control CSAFE")
            setProgram(state: .failed(PM5ProgramFailure.disconnected.diagnosticLine))
            return
        }
        programGen += 1
        let gen = programGen
        expectedAck = PM5WorkoutCodec.expectedAck(for: spec)
        responseAssembler.reset()
        pendingFrames = []
        pendingChunks = []
        if let ws = sample.workoutState, ws != .waitingToBegin {
            pendingFrames.append(PM5WorkoutCodec.terminateFrame())
        }
        pendingFrames.append(PM5WorkoutCodec.programFrame(for: spec))
        setProgram(state: .sending)
        writeNextFrame(rx: rx)
        // Deterministic close: no ack within the window → failed (never hangs the
        // banner on "enviando"). A newer program() bumps the generation.
        DispatchQueue.main.asyncAfter(deadline: .now() + PM5ProgramTiming.ackTimeoutSeconds) { [weak self] in
            guard let self, self.programGen == gen, self.programState == .sending else { return }
            self.logCSAFE("ERR \(PM5ProgramFailure.timeout.diagnosticLine)")
            self.setProgram(state: .failed(PM5ProgramFailure.timeout.diagnosticLine))
        }
    }

    private func writeNextFrame(rx: CBCharacteristic) {
        guard !pendingFrames.isEmpty else { return }
        let frame = pendingFrames.removeFirst()
        pendingChunks = PM5WorkoutCodec.chunks(frame)
        writeNextChunk(rx: rx)
    }

    private func writeNextChunk(rx: CBCharacteristic) {
        guard let peripheral, !pendingChunks.isEmpty else { return }
        let chunk = pendingChunks.removeFirst()
        logCSAFE("TX " + hexString(chunk))
        // Spec: the receive characteristic is a WRITE (with response) — the ack
        // callback sequences the next chunk so slices never reorder.
        let type: CBCharacteristicWriteType = rx.properties.contains(.write) ? .withResponse : .withoutResponse
        peripheral.writeValue(chunk, for: rx, type: type)
        if type == .withoutResponse {
            // No didWrite callback for command writes — pace the next slice on the
            // inter-frame gap instead.
            DispatchQueue.main.asyncAfter(deadline: .now() + PM5ProgramTiming.interFrameGapSeconds) { [weak self] in
                guard let self, self.programState == .sending, let rx = self.csafeReceiveChar else { return }
                self.advanceWriteQueue(rx: rx)
            }
        }
    }

    /// Next slice of the in-flight frame, else the next queued frame after the
    /// spec-mandated inter-frame gap (≥50 ms).
    private func advanceWriteQueue(rx: CBCharacteristic) {
        if !pendingChunks.isEmpty {
            writeNextChunk(rx: rx)
        } else if !pendingFrames.isEmpty {
            DispatchQueue.main.asyncAfter(deadline: .now() + PM5ProgramTiming.interFrameGapSeconds) { [weak self] in
                guard let self, self.programState == .sending else { return }
                self.writeNextFrame(rx: rx)
            }
        }
    }

    private func setProgram(state: PM5ProgramState) {
        programState = state
        delegate?.pm5Service(self, didChangeProgramState: state)
    }

    private func logCSAFE(_ line: String) {
        csafeLog.append(line)
        if csafeLog.count > PM5ProgramTiming.diagnosticsMaxLines {
            csafeLog.removeFirst(csafeLog.count - PM5ProgramTiming.diagnosticsMaxLines)
        }
        delegate?.pm5Service(self, didUpdateCSAFELog: csafeLog)
    }

    private func hexString(_ data: Data) -> String {
        data.map { String(format: "%02X", $0) }.joined(separator: " ")
    }

    /// Drop the control channel with the link. A programming still in flight
    /// fails honestly (diagnostics only — the UI never blocks on it).
    private func resetControlPlane() {
        csafeReceiveChar = nil
        csafeRespondChar = nil
        pendingFrames = []
        pendingChunks = []
        responseAssembler.reset()
        if programState == .sending {
            logCSAFE("ERR \(PM5ProgramFailure.disconnected.diagnosticLine)")
            setProgram(state: .failed(PM5ProgramFailure.disconnected.diagnosticLine))
        }
    }

    // MARK: - internal

    private func connect(peripheral: CBPeripheral) {
        self.peripheral = peripheral
        peripheral.delegate = self
        update(connection: .connecting)
        central.connect(peripheral, options: nil)
    }

    private func update(connection state: PM5ConnectionState) {
        connectionState = state
        delegate?.pm5Service(self, didChangeConnection: state)
    }
}

// MARK: - CBCentralManagerDelegate

extension PM5Service: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        bluetoothState = PM5BluetoothState(central.state)
        delegate?.pm5Service(self, didChangeBluetoothState: bluetoothState)
        if bluetoothState == .poweredOn, pendingScan {
            pendingScan = false
            startScan()
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? "PM5"
        let entry = PM5Discovered(id: peripheral.identifier, name: name, rssi: RSSI.intValue)
        discovered[peripheral.identifier] = entry
        discoveredPeripherals[peripheral.identifier] = peripheral   // keep the live object for connect
        let sorted = discovered.values.sorted { $0.rssi > $1.rssi }
        delegate?.pm5Service(self, didUpdateDiscovered: sorted)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        update(connection: .discoveringServices)
        peripheral.discoverServices([PM5GATT.infoService, PM5GATT.rowingService, PM5GATT.controlService])
    }

    func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        update(connection: .failed(error?.localizedDescription ?? "Connection failed"))
        self.peripheral = nil
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        // Only react to the CURRENT peripheral going down. A late callback for an
        // erg we already replaced (switchToDevice) or finalized must not reset the
        // new link's state to idle.
        guard peripheral.identifier == self.peripheral?.identifier else { return }
        disconnectGen += 1                 // cancel any pending disconnect-timeout
        self.peripheral = nil
        self.rowingService = nil
        resetControlPlane()
        update(connection: .idle)
        delegate?.pm5Service(self, didDisconnect: error)
    }
}

// MARK: - CBPeripheralDelegate

extension PM5Service: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let services = peripheral.services else {
            update(connection: .failed(error?.localizedDescription ?? "Service discovery failed"))
            return
        }
        for s in services {
            if s.uuid == PM5GATT.rowingService { rowingService = s }
            peripheral.discoverCharacteristics(nil, for: s)
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        guard error == nil, let chars = service.characteristics else { return }
        if service.uuid == PM5GATT.controlService {
            // CSAFE programming channel: hold the write char, subscribe to the
            // response char. Fully additive — a monitor without it still streams.
            for ch in chars {
                if ch.uuid == PM5GATT.charCSAFEReceive { csafeReceiveChar = ch }
                if ch.uuid == PM5GATT.charCSAFERespond {
                    csafeRespondChar = ch
                    if ch.properties.contains(.notify) || ch.properties.contains(.indicate) {
                        peripheral.setNotifyValue(true, for: ch)
                    }
                }
            }
            setProgram(state: .idle)   // fresh link → clean programming state
        }
        if service.uuid == PM5GATT.rowingService {
            for ch in chars where PM5GATT.allNotifyChars.contains(ch.uuid) {
                if ch.properties.contains(.notify) {
                    peripheral.setNotifyValue(true, for: ch)
                }
            }
            update(connection: .streaming)
            UserDefaults.standard.set(peripheral.identifier.uuidString, forKey: PM5Defaults.lastPairedIdentifier)
            UserDefaults.standard.set(peripheral.name ?? "PM5", forKey: PM5Defaults.lastPairedName)
            sample = PM5LiveSample()
            splitsByIndex.removeAll()
            delegate?.pm5Service(
                self,
                didConnect: peripheral.name ?? "PM5",
                identifier: peripheral.identifier
            )
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateNotificationStateFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        // A subscription that the monitor REJECTS would otherwise leave the app showing
        // "conectado" while no data ever arrives. Surface it instead of hanging silent.
        // Scoped to the ROWING stream: a refused CSAFE-respond subscription only costs
        // workout programming (logged), never the live data link.
        if let error {
            if characteristic.uuid == PM5GATT.charCSAFERespond {
                csafeRespondChar = nil
                logCSAFE("ERR sin notificaciones CSAFE: \(error.localizedDescription)")
            } else {
                update(connection: .failed("El PM5 no aceptó la suscripción de datos: \(error.localizedDescription)"))
            }
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didWriteValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        // Sequencer for the CSAFE write slices (write-with-response acks each one).
        guard characteristic.uuid == PM5GATT.charCSAFEReceive else { return }
        if let error {
            logCSAFE("ERR \(PM5ProgramFailure.writeFailed(error.localizedDescription).diagnosticLine)")
            if programState == .sending {
                setProgram(state: .failed(PM5ProgramFailure.writeFailed(error.localizedDescription).diagnosticLine))
            }
            pendingFrames = []
            pendingChunks = []
            return
        }
        guard programState == .sending, let rx = csafeReceiveChar else { return }
        advanceWriteQueue(rx: rx)
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard error == nil, let data = characteristic.value else { return }
        // CSAFE response frames (0x0022) belong to the programming handshake —
        // never to the rowing parser. Assemble across 20-byte slices, then judge
        // the in-flight program by its echoed command ids.
        if characteristic.uuid == PM5GATT.charCSAFERespond {
            logCSAFE("RX " + hexString(data))
            let responses = responseAssembler.feed(data)
            guard programState == .sending else { return }
            for response in responses {
                guard let verdict = PM5WorkoutCodec.programVerdict(of: response, expecting: expectedAck) else { continue }
                switch verdict {
                case .success:
                    logCSAFE("OK entreno cargado en el PM5")
                    setProgram(state: .programmed)
                case .failure(let failure):
                    logCSAFE("ERR \(failure.diagnosticLine)")
                    setProgram(state: .failed(failure.diagnosticLine))
                }
            }
            return
        }
        let uuid = characteristic.uuid.uuidString
        // Split chunks (0x37/0x38) are event-driven interval reports — route them
        // to the interval-keyed store, not the rolling live sample.
        if PM5DataParser.applySplitChunk(uuid: uuid, data: data, into: &splitsByIndex) {
            delegate?.pm5Service(self, didUpdateSplits: splitsByIndex.values.sorted { $0.index < $1.index })
            return
        }
        PM5DataParser.applyChunk(uuid: uuid, data: data, into: &sample)
        delegate?.pm5Service(self, didReceiveSample: sample)
    }
}
