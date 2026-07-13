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
final class FTMSTreadmillSource: NSObject, TreadmillDataSource {
    var onSample: ((TreadmillSample) -> Void)?
    var onLink: ((DeviceLink) -> Void)?
    var onDiscovered: (([DeviceCandidate]) -> Void)?
    var onBluetooth: ((BluetoothAvailability) -> Void)?

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var dataChar: CBCharacteristic?
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

    // MARK: - Private

    private func finalizeDisconnect() {
        disconnectGen += 1
        peripheral = nil
        dataChar = nil
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
        diag.note(peripheral: p, advertised: advertised)
        onLink?(.connecting)
        central.connect(p, options: nil)
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
