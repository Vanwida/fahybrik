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
            central.cancelPeripheralConnection(current)
        }
        connect(id)
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
        peripheral.discoverServices([PM5GATT.infoService, PM5GATT.rowingService])
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
        if let error {
            update(connection: .failed("El PM5 no aceptó la suscripción de datos: \(error.localizedDescription)"))
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard error == nil, let data = characteristic.value else { return }
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
