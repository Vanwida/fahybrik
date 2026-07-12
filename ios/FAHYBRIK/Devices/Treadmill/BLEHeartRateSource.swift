import CoreBluetooth
import Foundation

// Real heart rate over standard BLE (Heart Rate Service 0x180D). Works with any
// SIG-compliant broadcaster: chest straps, and Garmin/Polar/Apple watches or
// bands that relay HR. Same shape as FTMSTreadmillSource — auto-connect to the
// first strap found, auto-reconnect on a drop, pure parser for the bytes.
//
// Unavailable in the simulator; the HUD uses MockHeartRateSource there.
final class BLEHeartRateSource: NSObject, HeartRateSource {
    var onBpm: ((Int) -> Void)?
    var onLink: ((DeviceLink) -> Void)?

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var pendingStart = false
    private var intentionalStop = false
    private var diag = DeviceDiagnostics(role: "Pulso")

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil,
                                   options: [CBCentralManagerOptionShowPowerAlertKey: false])
    }

    func start() {
        intentionalStop = false
        switch central.state {
        case .poweredOn: beginScan()
        case .unknown, .resetting: pendingStart = true
        default: onLink?(.unavailable)
        }
    }

    func stop() {
        intentionalStop = true
        pendingStart = false
        if central.isScanning { central.stopScan() }
        if let p = peripheral { central.cancelPeripheralConnection(p) }
        peripheral = nil
        onLink?(.idle)
    }

    func diagnosticsText() -> String? { diag.text() }

    private func beginScan() {
        diag.reset()
        onLink?(.scanning)
        central.scanForPeripherals(withServices: [TreadmillGATT.heartRateService],
                                   options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }
}

extension BLEHeartRateSource: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            if pendingStart { pendingStart = false; beginScan() }
        case .poweredOff, .unauthorized, .unsupported:
            onLink?(.unavailable)
        default:
            break
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard self.peripheral == nil else { return }
        central.stopScan()
        self.peripheral = peripheral
        peripheral.delegate = self
        let advertised = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]) ?? []
        diag.note(peripheral: peripheral, advertised: advertised)
        onLink?(.connecting)
        central.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([TreadmillGATT.heartRateService])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        guard !intentionalStop else { return }
        onLink?(.reconnecting)
        central.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        guard !intentionalStop else { return }
        onLink?(.reconnecting)
        central.connect(peripheral, options: nil)
    }
}

extension BLEHeartRateSource: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        for service in peripheral.services ?? [] where service.uuid == TreadmillGATT.heartRateService {
            diag.note(service: service.uuid)
            peripheral.discoverCharacteristics([TreadmillGATT.heartRateMeasurement], for: service)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        for ch in service.characteristics ?? [] {
            diag.note(characteristic: ch.uuid, of: service.uuid, properties: ch.properties)
            if ch.uuid == TreadmillGATT.heartRateMeasurement, ch.properties.contains(.notify) {
                peripheral.setNotifyValue(true, for: ch)
                onLink?(.connected(name: peripheral.name ?? "Pulso"))
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard characteristic.uuid == TreadmillGATT.heartRateMeasurement,
              let data = characteristic.value,
              let bpm = HeartRateParser.parse(data) else { return }
        onBpm?(bpm)
    }
}
