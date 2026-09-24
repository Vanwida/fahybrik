import Foundation
import MetricKit

// LOS CIERRES Y BLOQUEOS DEL IPHONE, como los cuenta Apple. MetricKit entrega un
// informe por cierre inesperado, bloqueo (la app no respondió), exceso de CPU o de
// escritura a disco — normalmente al día siguiente o al volver a abrir la app. Aquí
// se resume cada uno en un evento `diagnostic` del registro técnico (tipo, señal,
// motivo, duración, versión en la que pasó) y se sube con lo demás.
//
// SOLO IPHONE: MetricKit no existe en watchOS. En el reloj, un cierre con un entreno
// en marcha lo cuenta la marca de salida no limpia (`DiagnosticsLog.markRunning`).
//
// La pila de llamadas no viaja todavía: sin los símbolos de la build no se lee, y
// guardarla es otro paso (DECISIONS 2026-09-24, registro técnico).

final class DiagnosticsMetricKit: NSObject, MXMetricManagerSubscriber {
    static let shared = DiagnosticsMetricKit()

    /// Una vez por proceso, al arrancar.
    func start() {
        MXMetricManager.shared.add(self)
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        let log = DiagnosticsLog.shared
        for payload in payloads {
            let window = "until=\(DiagnosticsLog.stamp(payload.timeStampEnd))"
            for c in payload.crashDiagnostics ?? [] {
                log.record(
                    .diagnostic, .crash, outcome: .failed,
                    code: c.exceptionCode?.intValue,
                    domain: c.exceptionType.map { "mach_exception_\($0.intValue)" },
                    detail: "signal=\(c.signal?.intValue ?? -1) reason=\(c.terminationReason ?? "-") build=\(c.metaData.applicationBuildVersion) \(window)"
                )
            }
            for h in payload.hangDiagnostics ?? [] {
                let seconds = h.hangDuration.converted(to: .seconds).value
                log.record(.diagnostic, .hang, outcome: .failed,
                           detail: "seconds=\(String(format: "%.1f", seconds)) build=\(h.metaData.applicationBuildVersion) \(window)")
            }
            for x in payload.cpuExceptionDiagnostics ?? [] {
                let cpu = x.totalCPUTime.converted(to: .seconds).value
                log.record(.diagnostic, .cpuException, outcome: .failed,
                           detail: "cpu_seconds=\(String(format: "%.0f", cpu)) build=\(x.metaData.applicationBuildVersion) \(window)")
            }
            for d in payload.diskWriteExceptionDiagnostics ?? [] {
                let mb = d.totalWritesCaused.converted(to: .megabytes).value
                log.record(.diagnostic, .diskWriteException, outcome: .failed,
                           detail: "written_mb=\(String(format: "%.0f", mb)) build=\(d.metaData.applicationBuildVersion) \(window)")
            }
        }
        DiagnosticsUploader.flushSoon()
    }
}
