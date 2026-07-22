import CoreBluetooth
import Foundation
import os

// Captures what a BLE device advertised and exposed during the first connection,
// composed into a plain-text dump the athlete can share. This is the tool for
// identifying a treadmill that ISN'T standard FTMS (e.g. a specific Titanium
// model): the visible copy stays sober, all the technical detail lives in the
// shared text. Mutated from CoreBluetooth callbacks on the main queue.
//
// EVERY line ALSO goes to the Xcode device console, tagged "[CINTA]" (or the role),
// so the founder — who debugs at the gym with a MacBook + Xcode attached — captures the
// full control trace in a normal log capture, not only inside the app's share sheet. BLE
// bytes only, no PII, so it prints in every build. `os.Logger` with a PUBLIC interpolation
// (the default redacts) is what makes the bytes actually show up.
struct DeviceDiagnostics {
    let role: String
    /// One shared logger; the tag is per-role so a console filter of "[CINTA]" pulls the
    /// treadmill's whole trace.
    private static let logger = Logger(subsystem: "com.fahybrik.devices", category: "ble")
    private var consoleTag: String { "[\(role.uppercased())]" }
    private var name: String?
    private var identifier: String?
    private var advertised: [CBUUID] = []
    private var services: [CBUUID] = []
    private var characteristics: [(service: CBUUID, char: CBUUID, props: String)] = []
    /// Ordered key → value facts about the machine (advertised name, raw 0x2ACC bytes,
    /// the raw ranges, the control mode in force). These sit ABOVE the trace so the
    /// shared text opens with the state, not with 200 lines of protocol.
    private var facts: [(key: String, value: String)] = []
    /// Timestamped control-plane trace (every Control Point TX, every ack/status RX,
    /// every profile decision). This is what turns "la cinta no me hace caso" into a
    /// diagnosable fact — it rides along in "Compartir diagnóstico".
    private var events: [String] = []

    /// Cap on the trace so a long session can't grow the share sheet unbounded. Keeps
    /// the MOST RECENT lines — the ones around the failure the athlete just saw.
    static let maxEvents = 200

    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss.SSS"
        return f
    }()

    init(role: String) { self.role = role }

    mutating func reset() {
        name = nil; identifier = nil
        advertised = []; services = []; characteristics = []
        events = []; facts = []
    }

    /// Record (or overwrite) one named fact. Overwriting keeps the ORIGINAL position, so
    /// a live-updating value like the control mode doesn't jump around the dump.
    mutating func note(fact key: String, _ value: String) {
        if let i = facts.firstIndex(where: { $0.key == key }) {
            facts[i].value = value
        } else {
            facts.append((key: key, value: value))
        }
        // Mirror to the Xcode console so the founder captures the machine's facts (advertised
        // name, raw 0x2ACC / 0x2AD4 / 0x2AD5 bytes, control mode) without opening the app.
        let tag = consoleTag   // hoisted so the log autoclosure doesn't capture mutating self
        Self.logger.log("\(tag, privacy: .public) \(key, privacy: .public): \(value, privacy: .public)")
    }

    /// Append one trace line, stamped with the wall clock so ordering (and the gaps that
    /// reveal a timeout) survive into the shared text — AND print it to the Xcode console,
    /// tagged, so every Control-Point TX/RX and strategy decision shows up in a log capture.
    mutating func log(_ line: String) {
        events.append("[\(Self.clock.string(from: Date()))] \(line)")
        if events.count > Self.maxEvents { events.removeFirst(events.count - Self.maxEvents) }
        let tag = consoleTag   // hoisted so the log autoclosure doesn't capture mutating self
        Self.logger.log("\(tag, privacy: .public) \(line, privacy: .public)")
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
        guard name != nil || !services.isEmpty || !events.isEmpty || !facts.isEmpty else { return nil }
        var lines: [String] = []
        lines.append("FAHYBRID · diagnóstico de conexión (\(role))")
        lines.append("Dispositivo: \(name ?? "sin nombre")")
        if let identifier { lines.append("ID: \(identifier)") }
        if !facts.isEmpty {
            lines.append("")
            lines.append("Estado del control:")
            for f in facts { lines.append("  · \(f.key): \(f.value)") }
        }
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
        if !events.isEmpty {
            lines.append("")
            lines.append("Traza de control (últimas \(events.count)):")
            lines.append(contentsOf: events.map { "  \($0)" })
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
