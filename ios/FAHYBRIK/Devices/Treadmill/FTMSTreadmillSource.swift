import CoreBluetooth
import Foundation

// Real FTMS treadmill over CoreBluetooth. Mirrors the PM5Service pattern:
// NSObject + CBCentralManager on the main queue (queue: nil), a pure parser does
// the byte work, connection state is pushed out through callbacks. Auto-connects
// to the first Fitness Machine it finds (the treadmill you're standing on is the
// strongest advertiser), auto-reconnects on an unexpected drop, and captures a
// discovery diagnostic for identifying non-standard machines.
//
// NOTE: CoreBluetooth is unavailable in the iOS simulator; the HUD uses
// MockTreadmillSource there. This class only runs on device.
final class FTMSTreadmillSource: NSObject, TreadmillDataSource {
    var onSample: ((TreadmillSample) -> Void)?
    var onLink: ((DeviceLink) -> Void)?

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var dataChar: CBCharacteristic?
    private var pendingStart = false
    private var intentionalStop = false
    private var diag = DeviceDiagnostics(role: "Cinta")

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: nil,
                                   options: [CBCentralManagerOptionShowPowerAlertKey: true])
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
        dataChar = nil
        onLink?(.idle)
    }

    func diagnosticsText() -> String? { diag.text() }

    // MARK: - Private

    private func beginScan() {
        diag.reset()
        onLink?(.scanning)
        central.scanForPeripherals(withServices: [TreadmillGATT.fitnessMachineService],
                                   options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }

    private func connect(_ p: CBPeripheral, advertised: [CBUUID]) {
        central.stopScan()
        peripheral = p
        p.delegate = self
        diag.note(peripheral: p, advertised: advertised)
        onLink?(.connecting)
        central.connect(p, options: nil)
    }
}

extension FTMSTreadmillSource: CBCentralManagerDelegate {
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
        guard self.peripheral == nil else { return } // already connecting/connected
        let advertised = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]) ?? []
        connect(peripheral, advertised: advertised)
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
        guard !intentionalStop else { return }
        // Auto-reconnect: connect() with no timeout resolves whenever the machine
        // is back in range, so the chip shows "reconnecting" and recovers silently.
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
            if ch.uuid == TreadmillGATT.treadmillData, ch.properties.contains(.notify) {
                dataChar = ch
                peripheral.setNotifyValue(true, for: ch)
                onLink?(.connected(name: peripheral.name ?? "Cinta"))
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard characteristic.uuid == TreadmillGATT.treadmillData,
              let data = characteristic.value,
              let sample = FTMSTreadmillParser.parse(data) else { return }
        onSample?(sample)
    }
}
