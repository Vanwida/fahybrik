import Foundation
import os

// MÓVIL → SERVIDOR: el registro técnico (lo del móvil y lo que el reloj le pasó)
// sube a `/api/devices/events` (web/lib/devices/device-events.ts, DECISIONS
// 2026-09-24). Lo pendiente solo se da por entregado con un 2xx: el servidor guarda
// el lote entero (lo nuevo y lo repetido) o nada.
//
// Cuándo: al arrancar y al volver a primer plano (junto a la cola offline), cuando
// el reloj entrega un lote y cuando MetricKit trae un cierre o un bloqueo. Sin
// temporizadores: si no hay red, espera a la siguiente ocasión.

actor DiagnosticsUploader {
    static let shared = DiagnosticsUploader()

    /// El techo del servidor (DEVICE_EVENTS_MAX_BATCH).
    static let batchSize = 500
    /// Lotes por pasada: una cola atrasada se vacía en varias vueltas, no de golpe.
    static let maxBatchesPerFlush = 10

    struct Batch: Encodable, Sendable { let events: [DiagEvent] }
    struct Stored: Decodable, Sendable { let stored: Int; let duplicates: Int }

    typealias Transport = @Sendable (_ batch: Batch, _ bearer: String) async throws -> Void
    static let liveTransport: Transport = { batch, bearer in
        let _: Stored = try await APIClient.shared.post(path: "/api/devices/events", body: batch, bearer: bearer)
    }

    private let log: DiagnosticsLog
    private let transport: Transport
    private var running = false
    private(set) var lastResult: String?
    private static let logger = Logger(subsystem: Marca.subsistemaLog("diag"), category: "upload")

    init(log: DiagnosticsLog = .shared, transport: @escaping Transport = DiagnosticsUploader.liveTransport) {
        self.log = log
        self.transport = transport
    }

    /// Sube lo pendiente. Sin sesión no hay a quién atribuirlo: espera.
    func flush(bearer: String?) async {
        guard let bearer, !running else { return }
        running = true
        defer { running = false }
        for _ in 0..<Self.maxBatchesPerFlush {
            let batch = log.pending(limit: Self.batchSize)
            guard !batch.isEmpty else { return }
            do {
                try await transport(Batch(events: batch), bearer)
                log.markDelivered(batch)
                lastResult = "ok \(batch.count)"
            } catch APIError.http(let status, _) where status == 400 || status == 413 {
                // El servidor no puede leer este lote: reintentarlo tal cual es un bucle.
                // Se suelta (sigue en el aparato, en la pantalla de diagnóstico).
                log.markDelivered(batch)
                lastResult = "rechazado \(status)"
                Self.logger.error("lote rechazado status=\(status, privacy: .public) n=\(batch.count, privacy: .public)")
            } catch {
                lastResult = "sin enviar: \((error as NSError).domain) \((error as NSError).code)"
                return
            }
        }
    }

    /// Para los sitios que no tienen el token a mano (delegados de WatchConnectivity,
    /// MetricKit): el mismo que usa la cola offline.
    static func flushSoon() {
        Task { await DiagnosticsUploader.shared.flush(bearer: KeychainTokenStore.shared.read()) }
    }
}
