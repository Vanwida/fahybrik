import Foundation
import WatchConnectivity

// LA COLA DE SALIDA DE LA TRAZA DE LA MUÑECA — la mitad que habla con el cable.
//
// El buzón en disco (la garantía: el fichero aguanta hasta que el teléfono lo tenga)
// vive en `WatchTraceSpool`, compartido con el teléfono para poder probarlo. Aquí
// sólo queda el trato con WatchConnectivity: cuándo se ofrece el fichero, qué se
// considera entregado y cuándo se reintenta.
//
// Se reintenta en los DOS momentos en que el teléfono puede haber vuelto a estar a
// tiro: al activarse la sesión y al terminar una transferencia con éxito.

final class WatchTraceOutbox {
    static let shared = WatchTraceOutbox()

    private let spool: WatchTraceSpool
    /// Serializa los toques al buzón: `stage` corre en la tarea de `finalize` y el
    /// drenado llega desde el hilo del delegado de WatchConnectivity.
    private let queue = DispatchQueue(label: "com.fahybrid.watch.trace-outbox")

    init(spool: WatchTraceSpool = WatchTraceSpool()) {
        self.spool = spool
    }

    /// Guarda la traza y devuelve su cupón. Todavía no se manda nada.
    @discardableResult
    func stage(traces: [WorkoutTraceDTO], localId: String = UUID().uuidString) -> String? {
        queue.sync { spool.stage(traces: traces, localId: localId) }
    }

    /// Ofrece una traza ya guardada. Si la sesión aún no está activada no se pierde
    /// nada: el fichero sigue en disco y `drain()` lo recoge al activarse.
    func transfer(localId: String) {
        guard queue.sync(execute: { spool.exists(localId) }) else { return }
        send(localId)
    }

    /// Reintenta todo lo que quedó a deber, saltándose lo que ya va en vuelo.
    func drain() {
        let pending = queue.sync { spool.pendingLocalIds() }
        guard !pending.isEmpty else { return }
        let inFlight = Set(
            WCSession.default.outstandingFileTransfers.compactMap {
                $0.file.metadata?[WatchWireKeys.traceLocalId] as? String
            }
        )
        for localId in pending where !inFlight.contains(localId) {
            send(localId)
        }
    }

    /// El teléfono lo tiene: el fichero ya no hace falta aquí. Un fallo NO borra — se
    /// queda y lo reintenta el siguiente drenado.
    func didFinish(_ transfer: WCSessionFileTransfer, error: Error?) {
        guard error == nil,
              let localId = transfer.file.metadata?[WatchWireKeys.traceLocalId] as? String
        else { return }
        queue.sync { spool.remove(localId) }
    }

    private func send(_ localId: String) {
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        let url = queue.sync { spool.url(for: localId) }
        session.transferFile(url, metadata: [WatchWireKeys.traceLocalId: localId])
    }
}
