import Foundation
import WatchConnectivity

// RELOJ → MÓVIL: el registro técnico de la muñeca viaja por `transferUserInfo`, la
// vía que el sistema encola y entrega en orden aunque ninguna de las dos apps esté
// abierta (a diferencia de `sendMessage`, que exige alcance en ese instante). El
// móvil lo guarda con lo suyo y lo sube (`DiagnosticsUploader`).
//
// Entregado aquí = puesto en la cola del sistema. Si el sistema avisa de que no
// pudo (`didFinish userInfoTransfer` con error), vuelve a quedar pendiente.
//
// Cuándo: al activarse WCSession, al empezar y al terminar una grabación y al pasar
// a segundo plano. Sin temporizadores.

enum DiagnosticsForwarder {
    /// Por transferencia: ~100 eventos son unos 35 KB, lejos de cualquier techo.
    static let perTransfer = 100
    static let maxTransfers = 10

    static func forwardPending() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isCompanionAppInstalled else { return }
        let log = DiagnosticsLog.shared
        for _ in 0..<maxTransfers {
            let batch = log.pending(limit: perTransfer)
            guard !batch.isEmpty, let data = try? JSONEncoder().encode(batch) else { return }
            session.transferUserInfo([WatchWireKeys.diagnostics: data])
            log.markDelivered(batch)
        }
    }

    /// Una transferencia del registro que el sistema no pudo entregar.
    static func transferFailed(_ userInfo: [String: Any]) {
        guard let data = userInfo[WatchWireKeys.diagnostics] as? Data,
              let batch = try? JSONDecoder().decode([DiagEvent].self, from: data) else { return }
        DiagnosticsLog.shared.markUndelivered(batch)
    }
}
