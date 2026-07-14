import CoreBluetooth
import Foundation

// Real heart rate over standard BLE (Heart Rate Service 0x180D). Works with any
// SIG-compliant broadcaster: chest straps, and Garmin/Polar/Apple watches or bands
// that relay HR.
//
// CONNECTION MODEL (the gym fix): identical to the treadmill — scanning ACCUMULATES
// every strap it finds into a named candidate list and never auto-connects to the
// first one (which latched onto a stranger's Polar while the athlete wore an Apple
// Watch). The DeviceChannel picks the single remembered strap automatically or hands
// the athlete the list. Once a strap is chosen it auto-reconnects to THAT device on
// a drop and disconnects deterministically on request.
//
// Unavailable in the simulator; the HUD uses MockHeartRateSource there.
final class BLEHeartRateSource: NSObject, HeartRateSource {
    var onBpm: ((Int) -> Void)?
    var onBattery: ((Int) -> Void)?
    var onLink: ((DeviceLink) -> Void)?
    var onDiscovered: (([DeviceCandidate]) -> Void)?
    var onBluetooth: ((BluetoothAvailability) -> Void)?

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var found: [DeviceID: (peripheral: CBPeripheral, candidate: DeviceCandidate)] = [:]
    private var pendingScan = false
    private var intentionalStop = false
    private var disconnectGen = 0
    private var diag = DeviceDiagnostics(role: "Pulso")

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil,
                                   options: [CBCentralManagerOptionShowPowerAlertKey: false])
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
            connect(peripheral: p, advertised: [])
        } else if let p = central.retrievePeripherals(withIdentifiers: [id]).first {
            connect(peripheral: p, advertised: [])
        }
    }

    func connectRemembered(_ id: DeviceID) {
        intentionalStop = false
        guard central.state == .poweredOn,
              let p = central.retrievePeripherals(withIdentifiers: [id]).first else {
            return
        }
        connect(peripheral: p, advertised: [])
    }

    func disconnect() {
        intentionalStop = true
        pendingScan = false
        if central.isScanning { central.stopScan() }
        guard let p = peripheral else { onLink?(.idle); return }
        disconnectGen += 1
        let gen = disconnectGen
        central.cancelPeripheralConnection(p)
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

    // MARK: - Private

    private func finalizeDisconnect() {
        disconnectGen += 1
        peripheral = nil
        onLink?(.idle)
    }

    private func beginScan() {
        diag.reset()
        onLink?(.scanning)
        central.scanForPeripherals(withServices: [TreadmillGATT.heartRateService],
                                   options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }

    private func connect(peripheral p: CBPeripheral, advertised: [CBUUID]) {
        if central.isScanning { central.stopScan() }
        peripheral = p
        p.delegate = self
        diag.note(peripheral: p, advertised: advertised)
        onLink?(.connecting)
        central.connect(p, options: nil)
    }
}

extension BLEHeartRateSource: CBCentralManagerDelegate {
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
        let id = peripheral.identifier
        let name = peripheral.name
            ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
            ?? "Banda \(id.uuidString.prefix(4))"
        found[id] = (peripheral, DeviceCandidate(id: id, name: name, rssi: RSSI.intValue))
        onDiscovered?(found.values.map(\.candidate).sorted { $0.rssi > $1.rssi })
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([TreadmillGATT.heartRateService,
                                     TreadmillGATT.batteryService])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        guard !intentionalStop else { return }
        onLink?(.reconnecting)
        central.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if intentionalStop {
            finalizeDisconnect()
            return
        }
        onLink?(.reconnecting)
        central.connect(peripheral, options: nil)
    }
}

extension BLEHeartRateSource: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        for service in peripheral.services ?? [] {
            switch service.uuid {
            case TreadmillGATT.heartRateService:
                diag.note(service: service.uuid)
                peripheral.discoverCharacteristics([TreadmillGATT.heartRateMeasurement], for: service)
            case TreadmillGATT.batteryService:
                diag.note(service: service.uuid)
                peripheral.discoverCharacteristics([TreadmillGATT.batteryLevel], for: service)
            default:
                break
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        for ch in service.characteristics ?? [] {
            diag.note(characteristic: ch.uuid, of: service.uuid, properties: ch.properties)
            if ch.uuid == TreadmillGATT.heartRateMeasurement, ch.properties.contains(.notify) {
                peripheral.setNotifyValue(true, for: ch)
                onLink?(.connected(name: peripheral.name ?? "Pulso"))
            }
            // Battery Level: read once now, and subscribe when the strap supports
            // notify so the percentage stays current as it drains during a session.
            if ch.uuid == TreadmillGATT.batteryLevel {
                if ch.properties.contains(.read) { peripheral.readValue(for: ch) }
                if ch.properties.contains(.notify) { peripheral.setNotifyValue(true, for: ch) }
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        switch characteristic.uuid {
        case TreadmillGATT.heartRateMeasurement:
            guard let data = characteristic.value, let bpm = HeartRateParser.parse(data) else { return }
            onBpm?(bpm)
        case TreadmillGATT.batteryLevel:
            // Battery Level (0x2A19) is a single uint8 percentage (0–100).
            guard let pct = characteristic.value?.first else { return }
            onBattery?(Int(pct))
        default:
            break
        }
    }
}
