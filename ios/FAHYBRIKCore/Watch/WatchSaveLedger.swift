import Foundation

// EL BUZÓN DE LA MUÑECA — un entreno terminado se queda en el reloj hasta que el
// SERVIDOR lo confirma (fase 1, «nada se pierde»; diseño firmado del 24-09:
// «a finished session waits on the Watch until the server confirms it, with no
// expiry»).
//
// Antes el sobre se borraba en cuanto `transferUserInfo` lo entregaba al teléfono.
// Pero «llegó al teléfono» no es «está guardado»: si iOS mataba la app del teléfono
// mientras subía, o el servidor lo rechazaba, la única copia ya no existía. Ahora el
// teléfono devuelve un acuse (`WatchExecutionReceipt`) y es el acuse, no la
// entrega, lo que decide:
//
//   pendiente ──entregar──▶ entregado ──held──▶ en el teléfono (no se reenvía)
//                             │  ▲                    │
//                             │  └─ sin acuse en 1 h: se reenvía
//                             ├──saved──▶ borrado  ◀──┘ (saved)
//                             └──rejected──▶ rechazado (se guarda, no se reenvía)
//
// Reenviar es seguro: el servidor guarda una ejecución por sesión asignada (o por
// atleta + hora de inicio si va fuera de plan), así que un duplicado actualiza la
// misma fila.
//
// Un sobre SIN nombre (`envelopeId` nil) es de un reloj anterior y conserva su
// regla de siempre: se borra al llegar al teléfono.
//
// Es un valor puro a propósito: el reloj lo guarda y lo muta en su cola serie,
// y los tests del iPhone lo prueban sin WatchConnectivity.

struct WatchSaveLedger: Codable, Equatable {
    enum State: String, Codable {
        /// En el buzón, sin entregar.
        case pending
        /// Escenificado a la espera de «Listo» (dobles: el conmutador de compartir
        /// aún puede cambiarlo). Solo sale solo si la app murió antes de «Listo».
        case staged
        /// Entregado a `transferUserInfo`, sin acuse todavía.
        case handed
        /// El teléfono lo tiene en disco; espera al servidor.
        case held
        /// El servidor lo rechazó por construcción. Se guarda; no se reenvía.
        case rejected
    }

    struct Entry: Codable, Equatable {
        let envelopeId: String?
        let data: Data
        var state: State
        /// Cuándo se llamó a `transferUserInfo` por última vez.
        var handedAt: Date?
        /// Cuándo confirmó WatchConnectivity que llegó al teléfono.
        var deliveredAt: Date?
    }

    /// Cuánto se espera un acuse antes de volver a entregar. No es método de
    /// ningún coach: es el margen para que el teléfono suba el sobre (o lo meta en
    /// su cola sin cobertura) y conteste, contado desde que lo recibió.
    static let resendAfter: TimeInterval = 3600

    private(set) var entries: [Entry] = []

    init(entries: [Entry] = []) {
        self.entries = entries
    }

    /// El buzón viejo (una lista de sobres) pasa entero como pendiente: en el
    /// siguiente drenado sale todo lo que no esté ya en vuelo, como hacía antes.
    static func migrating(legacy: [Data]) -> WatchSaveLedger {
        var ledger = WatchSaveLedger()
        for data in legacy { ledger.insert(data) }
        return ledger
    }

    static func envelopeId(of data: Data) -> String? {
        (try? WatchWire.decoder.decode(WatchExecutionEnvelope.self, from: data))?.envelopeId
    }

    // MARK: - Escribir

    mutating func insert(_ data: Data, staged: Bool = false) {
        guard !entries.contains(where: { $0.data == data }) else { return }
        entries.append(Entry(envelopeId: Self.envelopeId(of: data), data: data,
                             state: staged ? .staged : .pending))
    }

    /// El conmutador de dobles cambió la decisión antes de «Listo»: el sobre
    /// escenificado se sustituye por el nuevo, que sigue escenificado.
    mutating func replace(_ previous: Data?, with data: Data) {
        if let previous, previous != data { remove(previous) }
        insert(data, staged: true)
    }

    mutating func remove(_ data: Data) {
        entries.removeAll { $0.data == data }
    }

    mutating func markHanded(_ data: Data, at now: Date) {
        guard let i = entries.firstIndex(where: { $0.data == data }) else { return }
        if entries[i].state == .pending || entries[i].state == .staged { entries[i].state = .handed }
        entries[i].handedAt = now
    }

    /// `didFinish userInfoTransfer` sin error. Un sobre sin nombre se borra (la
    /// regla de un reloj anterior); uno con nombre espera su acuse.
    mutating func deliveredToPhone(_ data: Data, at now: Date) {
        guard let i = entries.firstIndex(where: { $0.data == data }) else { return }
        if entries[i].envelopeId == nil {
            entries.remove(at: i)
        } else {
            entries[i].deliveredAt = now
        }
    }

    /// Aplica un acuse. Devuelve si nombraba un sobre de este buzón.
    @discardableResult
    mutating func apply(_ receipt: WatchExecutionReceipt) -> Bool {
        guard let i = entries.firstIndex(where: { $0.envelopeId == receipt.envelopeId }) else {
            return false
        }
        switch receipt.outcome {
        case .saved:
            entries.remove(at: i)
        case .held:
            // Un «held» tardío no deshace un rechazo: el rechazo es la última palabra
            // del servidor, el «held» solo la del teléfono.
            if entries[i].state != .rejected { entries[i].state = .held }
        case .rejected:
            entries[i].state = .rejected
        }
        return true
    }

    // MARK: - Leer

    /// Lo que hay que entregar ahora, dado lo que WatchConnectivity ya tiene en
    /// vuelo:
    /// - lo pendiente, siempre;
    /// - lo escenificado, solo al ARRANCAR (`afterLaunch`): si la app murió antes
    ///   de «Listo», sale con la decisión que tuviera; con la app viva, lo manda
    ///   «Listo» y nadie más — ni siquiera volver a tener el teléfono a tiro;
    /// - un sobre sin nombre que no esté en vuelo (la regla de siempre: la
    ///   transferencia falló o se perdió);
    /// - uno con nombre entregado hace más de `resendAfter` sin acuse — el teléfono
    ///   lo perdió antes de ponerlo a salvo.
    /// Lo que el teléfono ya tiene (`held`) o el servidor rechazó no se reenvía.
    func toHand(now: Date, inFlight: [Data], afterLaunch: Bool = false) -> [Data] {
        entries.compactMap { entry in
            guard !inFlight.contains(entry.data) else { return nil }
            switch entry.state {
            case .pending:
                return entry.data
            case .staged:
                return afterLaunch ? entry.data : nil
            case .handed:
                if entry.envelopeId == nil { return entry.data }
                let since = entry.deliveredAt ?? entry.handedAt ?? .distantPast
                return now.timeIntervalSince(since) >= Self.resendAfter ? entry.data : nil
            case .held, .rejected:
                return nil
            }
        }
    }

    func count(_ state: State) -> Int {
        entries.filter { $0.state == state }.count
    }
}
