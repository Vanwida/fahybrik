import Foundation
import Observation

// UN TEST DEL COACH HECHO EN EL RELOJ TAMBIÉN PIDE SU RESULTADO (28-sep).
//
// La captura del número (1RM, tiempo del 5K…) solo se abría tras GUARDAR en el móvil
// (`WorkoutContainer` → `.testResult`). Un test hecho con la muñeca sola llegaba al
// móvil por `WatchConnectivityiOSService`, se guardaba la ejecución… y el número no
// se pedía nunca: la batería quedaba en «resultado pendiente» y el valor medido por
// el reloj se perdía.
//
// Ahora, al guardar (o encolar) una ejecución del reloj cuya sesión promete
// resultados, el móvil abre la MISMA hoja (`TestResultCaptureSheet`), precargada con
// lo que midió la muñeca. Se guarda en disco: si el aviso llega con la app en segundo
// plano y iOS la cierra, la hoja sale al volver a abrirla. Una vez por sesión.
@Observable
@MainActor
final class WatchTestResultPrompt {
    static let shared = WatchTestResultPrompt()

    struct Pending: Codable, Equatable, Identifiable {
        let assignmentId: String
        let specs: [StoreResultSpec]
        let prefill: [String: Double]
        var id: String { assignmentId }
    }

    /// La captura que espera a que el atleta abra la app. Nil = nada que pedir.
    private(set) var pending: Pending?

    private let pendingKey = "fahybrik.watchTestResult.pending.v1"
    private let offeredKey = "fahybrik.watchTestResult.offered.v1"
    /// Cuántas sesiones ya ofrecidas se recuerdan (un reenvío del mismo sobre no
    /// vuelve a abrir la hoja). Mecanismo, no método: solo acota el registro.
    private static let offeredMemory = 50

    private init() {
        if let raw = UserDefaults.standard.data(forKey: pendingKey) {
            pending = try? JSONDecoder().decode(Pending.self, from: raw)
        }
    }

    /// Los resultados que pide esta sesión, si es un test que se captura con la hoja.
    /// Un test de salto no: su número sale del vídeo, no de un campo.
    nonisolated static func specsToCapture(detail: AssignmentDetail?) -> [StoreResultSpec] {
        guard let detail, !detail.isJumpVideo else { return [] }
        return detail.storeResults
    }

    /// Una ejecución del reloj quedó guardada o en la cola: si su sesión es un test,
    /// se pide el número. Una sola vez por sesión.
    func offer(assignmentId: String, specs: [StoreResultSpec], prefill: [String: Double]) {
        guard !specs.isEmpty else { return }
        var offered = UserDefaults.standard.stringArray(forKey: offeredKey) ?? []
        guard !offered.contains(assignmentId) else { return }
        offered.append(assignmentId)
        UserDefaults.standard.set(Array(offered.suffix(Self.offeredMemory)), forKey: offeredKey)
        let next = Pending(assignmentId: assignmentId, specs: specs, prefill: prefill)
        pending = next
        if let raw = try? JSONEncoder().encode(next) {
            UserDefaults.standard.set(raw, forKey: pendingKey)
        }
    }

    /// Guardado u omitido: la hoja no vuelve. Si se omite, la batería lo sigue
    /// ofreciendo como «resultado pendiente».
    func done() {
        pending = nil
        UserDefaults.standard.removeObject(forKey: pendingKey)
    }
}
