import Foundation
import WatchConnectivity

// LOS ACUSES AL RELOJ (fase 1, «nada se pierde»). La muñeca guarda cada entreno
// terminado hasta que el servidor lo confirma (`WatchSaveLedger`); este fichero es
// la otra mitad: el teléfono le cuenta qué ha sido de cada sobre.
//
//   subido (2xx)            → saved     (la muñeca lo borra)
//   en la cola sin cobertura → held      (la muñeca deja de reenviarlo)
//     …y cuando la cola lo entrega → saved; si el servidor lo rechaza → rejected
//   rechazado (4xx)          → rejected  (la muñeca lo guarda sin reenviarlo)
//
// Todo lo que se apunta aquí va a disco antes de salir: un acuse que no llegó a
// `transferUserInfo` sale en la siguiente activación, y el vínculo cola→sobre
// sobrevive a que iOS mate la app mientras la cola espera cobertura.

/// El libro de acuses: lo que falta por mandar y qué entrada de la cola es de qué
/// sobre. Valor puro para probarlo sin WatchConnectivity.
struct WatchReceiptBook: Codable, Equatable {
    /// Acuses aún no entregados a `transferUserInfo`, del más viejo al más nuevo.
    private(set) var pending: [WatchExecutionReceipt] = []
    /// id de la entrada de `RequestQueue` → `envelopeId` del sobre que la originó.
    private(set) var waiting: [String: String] = [:]

    /// Un tope contra un reloj desemparejado para siempre. Perder un acuse no pierde
    /// el entreno: sin acuse, la muñeca reenvía el sobre y el servidor lo guarda en
    /// la misma fila, que produce un acuse nuevo.
    static let maxPending = 200

    mutating func record(_ outcome: WatchExecutionReceipt.Outcome, envelopeId: String) {
        pending.append(WatchExecutionReceipt(envelopeId: envelopeId, outcome: outcome))
        if pending.count > Self.maxPending {
            pending.removeFirst(pending.count - Self.maxPending)
        }
    }

    /// El sobre quedó en la cola sin cobertura: el teléfono lo tiene (held) y hay
    /// que acordarse de qué entrada es para acusar cuando el servidor conteste.
    mutating func awaitQueue(requestId: UUID, envelopeId: String) {
        waiting[requestId.uuidString] = envelopeId
        record(.held, envelopeId: envelopeId)
    }

    /// La cola contestó por esta entrada. Devuelve si era de un sobre del reloj.
    @discardableResult
    mutating func queueSettled(requestId: UUID, outcome: WatchExecutionReceipt.Outcome) -> Bool {
        guard let envelopeId = waiting.removeValue(forKey: requestId.uuidString) else { return false }
        record(outcome, envelopeId: envelopeId)
        return true
    }

    /// Lo que sale ahora; el libro se queda sin ello.
    mutating func takePending() -> [WatchExecutionReceipt] {
        defer { pending.removeAll() }
        return pending
    }
}

@MainActor
enum WatchSaveReceipts {
    private static let key = "fahybrik.watchSaveReceipts.v1"

    private static func load() -> WatchReceiptBook {
        guard let data = UserDefaults.standard.data(forKey: key),
              let book = try? JSONDecoder().decode(WatchReceiptBook.self, from: data) else {
            return WatchReceiptBook()
        }
        return book
    }

    private static func save(_ book: WatchReceiptBook) {
        guard let data = try? JSONEncoder().encode(book) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    /// Un sobre sin nombre es de un reloj anterior, que no espera acuse.
    static func record(_ outcome: WatchExecutionReceipt.Outcome, envelopeId: String?) {
        guard let envelopeId else { return }
        var book = load()
        book.record(outcome, envelopeId: envelopeId)
        save(book)
        flush()
    }

    static func awaitQueue(requestId: UUID, envelopeId: String?) {
        guard let envelopeId else { return }
        var book = load()
        book.awaitQueue(requestId: requestId, envelopeId: envelopeId)
        save(book)
        flush()
    }

    /// Observadores de `RequestQueue` (instalados en `AppShell`): la entrada se
    /// entregó o el servidor la rechazó. Las que no son de un sobre no hacen nada.
    static func queueDelivered(requestId: UUID) {
        settle(requestId: requestId, outcome: .saved)
    }

    static func queueRejected(requestId: UUID) {
        settle(requestId: requestId, outcome: .rejected)
    }

    private static func settle(requestId: UUID, outcome: WatchExecutionReceipt.Outcome) {
        var book = load()
        guard book.queueSettled(requestId: requestId, outcome: outcome) else { return }
        save(book)
        flush()
    }

    /// Entrega los acuses pendientes a `transferUserInfo`, que los guarda y los lleva
    /// cuando el reloj esté a tiro. Sin sesión activa o sin reloj, esperan en disco
    /// a la siguiente activación (`WatchConnectivityiOSService`).
    static func flush() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled else { return }
        var book = load()
        let receipts = book.takePending()
        guard !receipts.isEmpty else { return }
        save(book)
        for receipt in receipts {
            guard let data = try? JSONEncoder().encode(receipt) else { continue }
            session.transferUserInfo([WatchWireKeys.executionReceipt: data])
            DiagnosticsLog.shared.record(
                .save, .executionReceipt,
                outcome: receipt.outcome == .rejected ? .failed : .ok,
                detail: "sent=\(receipt.outcome.rawValue)"
            )
        }
    }
}

/// Sobres que no se pudieron poner a salvo en el teléfono (no decodifican, o el
/// servidor los rechazó — auditoría B-12). Se reintentan en cada activación.
/// Sin duplicados: con los acuses, el reloj reenvía un sobre que no ha oído
/// contestar, y ese reenvío no puede aparcarlo dos veces.
enum WatchExecutionDeadLetter {
    private static let key = "fahybrik.watchExecutionDeadLetter.v1"
    /// Max parked envelopes — a hard ceiling against an unbounded decode-bug backlog.
    /// Con acuses, lo que sale por aquí sigue en la muñeca (rechazado o sin acuse).
    static let maxEntries = 20

    static func all() -> [Data] {
        (UserDefaults.standard.array(forKey: key) as? [Data]) ?? []
    }

    static func append(_ data: Data) {
        var entries = all()
        guard !entries.contains(data) else { return }
        entries.append(data)
        if entries.count > maxEntries {
            entries.removeFirst(entries.count - maxEntries)
        }
        UserDefaults.standard.set(entries, forKey: key)
    }

    static func replace(_ entries: [Data]) {
        if entries.isEmpty {
            UserDefaults.standard.removeObject(forKey: key)
        } else {
            UserDefaults.standard.set(entries, forKey: key)
        }
    }
}
