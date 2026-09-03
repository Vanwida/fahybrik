import CoreBluetooth
import Foundation

// THE one `CBCentralManager` for this iOS process. Apple owns the object;
// this type is the owner, not a session / HUD / week engine.
//
// Watch is not the BLE owner. Lives in FAHYBRIK/Devices — never Core.
// Restore UID = THIS live (plan.id + startedAt). Not a forever app id.
// Next workout is another manager to Apple.

enum BLEStation: String, Codable, Hashable, CaseIterable {
    case treadmill
    case heartRate
    case pm5Any
    case pm5Row
    case pm5Ski
    case pm5Bike

    init(_ role: ErgMachineRole) {
        switch role {
        case .row: self = .pm5Row
        case .ski: self = .pm5Ski
        case .bike: self = .pm5Bike
        }
    }
}

protocol DeviceCentralClient: AnyObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    var bleStation: BLEStation { get }
}

final class DeviceCentral: NSObject, CBCentralManagerDelegate {
    static let shared = DeviceCentral()

    private var manager: CBCentralManager?
    private var restoreUID: String?
    private var didRestore = false
    private var clientBoxes: [BLEStation: WeakClient] = [:]
    private var scanServices: [BLEStation: [CBUUID]] = [:]
    private var bound: [BLEStation: CBPeripheral] = [:]
    private var stationByID: [UUID: BLEStation] = [:]
    private var chosen: [BLEStation: UUID] = [:]

    private override init() {
        super.init()
    }

    // MARK: - Launch / live identity

    /// `PushAppDelegate.didFinishLaunching`: instantiate THIS live's central
    /// before Apple delivers `willRestoreState`. No snapshot → no recover of brief.
    func instantiateIfLiveUIDExists() {
        guard manager == nil else { return }
        guard let snap = WorkoutStateStore.peekLiveSnapshot(),
              WorkoutRecoveryGate.isFresh(snap) else { return }
        restoreUID = Self.restoreUID(from: snap)
        loadChosen(matching: restoreUID)
        createManager(restoreUID: restoreUID)
        if !didRestore, !chosen.isEmpty {
            markChosenStationsLost()
        }
    }

    /// Live start: same UID formula as the snapshot. Does not invent an id.
    /// If the radio already exists (brief), do not create a second central.
    func attachLiveIdentity(planId: UUID, startedAt: Date) {
        if restoreUID == nil {
            restoreUID = Self.restoreUID(planId: planId, startedAt: startedAt)
        }
        if manager == nil {
            createManager(restoreUID: restoreUID)
        }
        persistChosen()
    }

    /// `stopAll` / flow close: cancel every link, drop the UID, release the manager.
    func endLive() {
        if let manager {
            for peripheral in bound.values {
                manager.cancelPeripheralConnection(peripheral)
            }
            if manager.isScanning { manager.stopScan() }
            manager.delegate = nil
        }
        bound.removeAll()
        stationByID.removeAll()
        scanServices.removeAll()
        chosen.removeAll()
        restoreUID = nil
        didRestore = false
        deleteChosenFile()
        manager = nil
    }

    // MARK: - Clients

    func register(_ client: DeviceCentralClient) {
        clientBoxes[client.bleStation] = WeakClient(client)
    }

    func remember(_ id: UUID, station: BLEStation) {
        chosen[station] = id
        persistChosen()
    }

    func forget(station: BLEStation) {
        if let id = chosen[station], stationByID[id] == station {
            stationByID.removeValue(forKey: id)
        }
        chosen.removeValue(forKey: station)
        bound.removeValue(forKey: station)
        persistChosen()
    }

    func chosenIdentifier(for station: BLEStation) -> UUID? { chosen[station] }

    var state: CBManagerState { manager?.state ?? .unknown }

    func isScanning(_ station: BLEStation) -> Bool {
        scanServices[station] != nil && manager?.isScanning == true
    }

    func scan(services: [CBUUID], station: BLEStation) {
        ensureManager()
        scanServices[station] = services
        refreshScan()
    }

    func stopScan(station: BLEStation) {
        scanServices.removeValue(forKey: station)
        refreshScan()
    }

    func connect(_ peripheral: CBPeripheral, station: BLEStation) {
        ensureManager()
        remember(peripheral.identifier, station: station)
        scanServices.removeValue(forKey: station)
        refreshScan()
        bind(peripheral, station: station)
        manager?.connect(peripheral, options: nil)
    }

    func cancel(_ peripheral: CBPeripheral) {
        manager?.cancelPeripheralConnection(peripheral)
    }

    func retrieve(_ id: UUID) -> CBPeripheral? {
        ensureManager()
        return manager?.retrievePeripherals(withIdentifiers: [id]).first
    }

    // MARK: - CBCentralManagerDelegate

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        for station in BLEStation.allCases {
            client(for: station)?.centralManagerDidUpdateState(central)
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        willRestoreState dict: [String: Any]
    ) {
        didRestore = true
        if manager == nil { manager = central }
        // Only Apple's restored peripherals. Do not create another central.
        // Do not scan. Do not copy the sample's UserDefaults + 180D else.
        let restored = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] ?? []
        var engagedStations: Set<BLEStation> = []
        for peripheral in restored {
            guard let station = chosenStation(for: peripheral.identifier) else { continue }
            materialize(station)
            reengage(peripheral, station: station, central: central)
            engagedStations.insert(station)
        }
        for station in chosen.keys where !engagedStations.contains(station) {
            markLost(station)
        }
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let advertised = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]) ?? []
        for (station, services) in scanServices {
            if !advertised.isEmpty {
                let overlap = services.contains { advertised.contains($0) }
                if !overlap { continue }
            }
            client(for: station)?.centralManager?(
                central, didDiscover: peripheral, advertisementData: advertisementData, rssi: RSSI
            )
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        guard let station = stationByID[peripheral.identifier] else { return }
        client(for: station)?.centralManager?(central, didConnect: peripheral)
    }

    func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        guard let station = stationByID[peripheral.identifier] else { return }
        client(for: station)?.centralManager?(central, didFailToConnect: peripheral, error: error)
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        guard let station = stationByID[peripheral.identifier] else { return }
        client(for: station)?.centralManager?(
            central, didDisconnectPeripheral: peripheral, error: error
        )
    }

    // MARK: - Restore UID

    static func restoreUID(from state: PersistedWorkoutState) -> String {
        restoreUID(planId: state.plan.id, startedAt: state.startedAt)
    }

    /// THIS live, identical across kill/relaunch. `plan.id` + `startedAt` exist
    /// on the first persist. `hkSessionUUID` is Watch/HK (FH-75) and can appear
    /// after the first `CBCentralManager` — it must not change the restore key.
    static func restoreUID(planId: UUID, startedAt: Date) -> String {
        "\(planId.uuidString)|\(Int(startedAt.timeIntervalSince1970 * 1000))"
    }

    // MARK: - Private

    private func ensureManager() {
        guard manager == nil else { return }
        if let snap = WorkoutStateStore.peekLiveSnapshot(), WorkoutRecoveryGate.isFresh(snap) {
            restoreUID = Self.restoreUID(from: snap)
            loadChosen(matching: restoreUID)
            createManager(restoreUID: restoreUID)
            return
        }
        createManager(restoreUID: nil)
    }

    private func createManager(restoreUID: String?) {
        var options: [String: Any] = [
            CBCentralManagerOptionShowPowerAlertKey: true,
        ]
        if let restoreUID {
            options[CBCentralManagerOptionRestoreIdentifierKey] = restoreUID
        }
        manager = CBCentralManager(delegate: self, queue: nil, options: options)
    }

    private func refreshScan() {
        guard let manager else { return }
        let union = Array(Set(scanServices.values.flatMap { $0 }))
        if union.isEmpty {
            if manager.isScanning { manager.stopScan() }
        } else {
            manager.scanForPeripherals(
                withServices: union,
                options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
            )
        }
    }

    private func bind(_ peripheral: CBPeripheral, station: BLEStation) {
        bound[station] = peripheral
        stationByID[peripheral.identifier] = station
        if let client = client(for: station) {
            peripheral.delegate = client
        }
    }

    private func chosenStation(for id: UUID) -> BLEStation? {
        chosen.first { $0.value == id }?.key
    }

    private func reengage(
        _ peripheral: CBPeripheral,
        station: BLEStation,
        central: CBCentralManager
    ) {
        bind(peripheral, station: station)
        if peripheral.state == .connected {
            client(for: station)?.centralManager?(central, didConnect: peripheral)
        } else {
            central.connect(peripheral, options: nil)
        }
    }

    private func materialize(_ station: BLEStation) {
        switch station {
        case .treadmill: DeviceHub.shared.materializeTreadmill()
        case .heartRate: DeviceHub.shared.materializeHR()
        case .pm5Any: _ = PM5Pool.shared.any
        case .pm5Row: _ = PM5Pool.shared.store(for: .row)
        case .pm5Ski: _ = PM5Pool.shared.store(for: .ski)
        case .pm5Bike: _ = PM5Pool.shared.store(for: .bike)
        }
        if let id = chosen[station] {
            adopt(id, station: station)
        }
    }

    private func adopt(_ id: UUID, station: BLEStation) {
        switch station {
        case .treadmill: DeviceHub.shared.treadmill.adoptSessionIdentifier(id)
        case .heartRate: DeviceHub.shared.heartRate.adoptSessionIdentifier(id)
        case .pm5Any: PM5Pool.shared.any.adoptSessionIdentifier(id)
        case .pm5Row: PM5Pool.shared.store(for: .row).adoptSessionIdentifier(id)
        case .pm5Ski: PM5Pool.shared.store(for: .ski).adoptSessionIdentifier(id)
        case .pm5Bike: PM5Pool.shared.store(for: .bike).adoptSessionIdentifier(id)
        }
    }

    private func markChosenStationsLost() {
        for station in chosen.keys { markLost(station) }
    }

    private func markLost(_ station: BLEStation) {
        materialize(station)
        switch station {
        case .treadmill: DeviceHub.shared.treadmill.markSessionLost()
        case .heartRate: DeviceHub.shared.heartRate.markSessionLost()
        case .pm5Any: PM5Pool.shared.any.markSessionLost()
        case .pm5Row: PM5Pool.shared.store(for: .row).markSessionLost()
        case .pm5Ski: PM5Pool.shared.store(for: .ski).markSessionLost()
        case .pm5Bike: PM5Pool.shared.store(for: .bike).markSessionLost()
        }
    }

    private func client(for station: BLEStation) -> DeviceCentralClient? {
        clientBoxes[station]?.value
    }

    // MARK: - Chosen-file (this live only; deleted on endLive)

    private struct ChosenFile: Codable {
        var restoreUID: String
        var identifiers: [String: String]
    }

    private func persistChosen() {
        guard let restoreUID, let url = Self.chosenURL() else { return }
        let payload = ChosenFile(
            restoreUID: restoreUID,
            identifiers: Dictionary(uniqueKeysWithValues: chosen.map {
                ($0.key.rawValue, $0.value.uuidString)
            })
        )
        if let data = try? JSONEncoder().encode(payload) {
            try? data.write(to: url, options: [.atomic])
        }
    }

    private func loadChosen(matching uid: String?) {
        chosen.removeAll()
        guard let uid, let url = Self.chosenURL(),
              let data = try? Data(contentsOf: url),
              let payload = try? JSONDecoder().decode(ChosenFile.self, from: data),
              payload.restoreUID == uid
        else { return }
        for (raw, string) in payload.identifiers {
            guard let station = BLEStation(rawValue: raw),
                  let id = UUID(uuidString: string) else { continue }
            chosen[station] = id
        }
    }

    private func deleteChosenFile() {
        if let url = Self.chosenURL() {
            try? FileManager.default.removeItem(at: url)
        }
    }

    private static func chosenURL() -> URL? {
        let dir: URL
        if let support = try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) {
            dir = support
        } else {
            return nil
        }
        return dir.appendingPathComponent("live-ble-chosen.json")
    }

    private final class WeakClient {
        weak var value: DeviceCentralClient?
        init(_ value: DeviceCentralClient) { self.value = value }
    }
}

