import CoreBluetooth
import Foundation

// Captures what a BLE device advertised and exposed during the first connection,
// composed into a plain-text dump the athlete can share. This is the tool for
// identifying a treadmill that ISN'T standard FTMS (e.g. a specific Titanium
// model): the visible copy stays sober, all the technical detail lives in the
// shared text. Mutated from CoreBluetooth callbacks on the main queue.
struct DeviceDiagnostics {
    let role: String
    private var name: String?
    private var identifier: String?
    private var advertised: [CBUUID] = []
    private var services: [CBUUID] = []
    private var characteristics: [(service: CBUUID, char: CBUUID, props: String)] = []

    init(role: String) { self.role = role }

    mutating func reset() {
        name = nil; identifier = nil
        advertised = []; services = []; characteristics = []
    }

    mutating func note(peripheral: CBPeripheral, advertised: [CBUUID]) {
        name = peripheral.name
        identifier = peripheral.identifier.uuidString
        self.advertised = advertised
    }

    mutating func note(service: CBUUID) {
        if !services.contains(service) { services.append(service) }
    }

    mutating func note(characteristic: CBUUID, of service: CBUUID, properties: CBCharacteristicProperties) {
        characteristics.append((service: service, char: characteristic, props: Self.describe(properties)))
    }

    /// nil until we've actually connected to something to describe.
    func text() -> String? {
        guard name != nil || !services.isEmpty else { return nil }
        var lines: [String] = []
        lines.append("FAHYBRID · diagnóstico de conexión (\(role))")
        lines.append("Dispositivo: \(name ?? "sin nombre")")
        if let identifier { lines.append("ID: \(identifier)") }
        if !advertised.isEmpty {
            lines.append("Servicios anunciados: \(advertised.map(\.uuidString).joined(separator: ", "))")
        }
        if !services.isEmpty {
            lines.append("Servicios descubiertos: \(services.map(\.uuidString).joined(separator: ", "))")
        }
        if !characteristics.isEmpty {
            lines.append("Características:")
            for c in characteristics {
                lines.append("  · \(c.service.uuidString)/\(c.char.uuidString) [\(c.props)]")
            }
        }
        return lines.joined(separator: "\n")
    }

    private static func describe(_ p: CBCharacteristicProperties) -> String {
        var flags: [String] = []
        if p.contains(.read) { flags.append("read") }
        if p.contains(.write) { flags.append("write") }
        if p.contains(.writeWithoutResponse) { flags.append("writeNR") }
        if p.contains(.notify) { flags.append("notify") }
        if p.contains(.indicate) { flags.append("indicate") }
        return flags.isEmpty ? "—" : flags.joined(separator: "/")
    }
}
