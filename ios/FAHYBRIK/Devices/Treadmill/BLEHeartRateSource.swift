import CoreBluetooth
import Foundation

// Real heart rate over standard BLE (Heart Rate Service 0x180D). Works with any
// SIG-compliant broadcaster: chest straps, and Garmin/Polar/Apple watches or bands
// that relay HR.
//
// CONNECTION MODEL: identical to the treadmill — scanning ACCUMULATES every strap it
// finds into a named candidate list and never connects on its own (it once latched
// onto a stranger's Polar while the athlete wore an Apple Watch). The DeviceChannel
// hands the athlete the list and he taps his own; the strap used last is badged and
// sorted first, which is all "remembered" ever does. A drop reports `.lost` and stays
// there — no reconnect — and disconnects are deterministic on request.
//
// Unavailable in the simulator; the HUD uses MockHeartRateSource there.
final class BLEHeartRateSource: NSObject, HeartRateSource, DeviceCentralClient {
    let bleStation: BLEStation = .heartRate
    var onBpm: ((Int) -> Void)?
    var onBattery: ((Int) -> Void)?
    var onLink: ((DeviceLink) -> Void)?
    var onDiscovered: (([DeviceCandidate]) -> Void)?
    var onBluetooth: ((BluetoothAvailability) -> Void)?

    private var peripheral: CBPeripheral?
    private var found: [DeviceID: (peripheral: CBPeripheral, candidate: DeviceCandidate)] = [:]
    private var pendingScan = false
    private var intentionalStop = false
    private var disconnectGen = 0
    private var diag = DeviceDiagnostics(role: "Pulso")

    override init() {
        super.init()
        DeviceCentral.shared.register(self)
    }

    func startScan() {
        intentionalStop = false
        found.removeAll()
        onDiscovered?([])
        DeviceCentral.shared.scan(services: [TreadmillGATT.heartRateService], station: bleStation)
        switch DeviceCentral.shared.state {
        case .poweredOn: beginScan()
        case .unknown, .resetting: pendingScan = true
        default: onLink?(.unavailable)
        }
    }

    func connect(_ id: DeviceID) {
        intentionalStop = false
        if let p = found[id]?.peripheral {
            connect(peripheral: p, advertised: [])
        } else if let p = DeviceCentral.shared.retrieve(id) {
            connect(peripheral: p, advertised: [])
        } else {
            onLink?(.failed("No encuentro esa banda. Enciéndela y acércate."))
        }
    }

    func disconnect() {
        intentionalStop = true
        pendingScan = false
        DeviceCentral.shared.stopScan(station: bleStation)
        guard let p = peripheral else { onLink?(.idle); return }
        disconnectGen += 1
        let gen = disconnectGen
        DeviceCentral.shared.cancel(p)
        DispatchQueue.main.asyncAfter(deadline: .now() + DeviceConnectionTiming.disconnectTimeoutSeconds) { [weak self] in
            guard let self, self.disconnectGen == gen else { return }
            self.finalizeDisconnect()
        }
    }

    func stop() {
        intentionalStop = true
        pendingScan = false
        DeviceCentral.shared.stopScan(station: bleStation)
        if let p = peripheral { DeviceCentral.shared.cancel(p) }
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
        DeviceCentral.shared.scan(services: [TreadmillGATT.heartRateService], station: bleStation)
    }

    private func connect(peripheral p: CBPeripheral, advertised: [CBUUID]) {
        DeviceCentral.shared.stopScan(station: bleStation)
        peripheral = p
        p.delegate = self
        diag.note(peripheral: p, advertised: advertised)
        onLink?(.connecting)
        DeviceCentral.shared.connect(p, station: bleStation)
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

    /// Failed to connect → say so and stop. No retry loop (see the treadmill source).
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        guard !intentionalStop else { return }
        self.peripheral = nil
        onLink?(.failed("No pude conectar con la banda. Vuelve a intentarlo."))
    }

    /// The strap dropped. Same rule as the belt, for the same reason: nothing in this
    /// app reconnects by itself. A strap can't hurt anyone, but a silent reconnect can
    /// still latch onto a stranger's band — that already happened in the gym — and one
    /// consistent rule is what keeps the invariant auditable.
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if intentionalStop {
            finalizeDisconnect()
            return
        }
        disconnectGen += 1
        self.peripheral = nil
        onLink?(.lost)
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
