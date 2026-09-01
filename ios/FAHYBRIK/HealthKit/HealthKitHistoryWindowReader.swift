import Foundation
import HealthKit

// LEE UNA VENTANA DE FECHA DE APPLE SALUD Y LA SUBE.
//
// Es la otra mitad del histórico: `HealthKitHistoryImporter` decide QUÉ ventana toca
// y se acuerda de por dónde iba; esto la lee y la sube.
//
// POR QUÉ NO SIRVE EL CAMINO DE SIEMPRE. El ancla de HealthKit es un marcador de
// INSERCIÓN en el almacén, no una fecha. Lo que ya estaba dentro cuando nació el
// ancla no vuelve NUNCA por una consulta anclada — por eso reconectar no rellenaba el
// pasado. Aquí manda el PREDICADO DE FECHA; el ancla nace nula en cada ventana y sólo
// sirve para paginar dentro de ella, y no se persiste: los anclas del sync vivo no se
// tocan, así que el barrido del pasado y el goteo del presente nunca se pisan.
//
// `.strictStartDate` reparte las muestras entre ventanas SIN SOLAPE: cada una cae en
// la ventana donde EMPIEZA, y ninguna se sube dos veces por vivir a caballo del corte.
//
// SUBE POR LA MISMA TUBERÍA (`HealthKitSyncService.upload`), así que comparte bearer,
// endpoint, cola de reintentos y manejo del 401 con la sincronización viva.
final class HealthKitHistoryWindowReader: HealthHistoryWindowImporting {
    static let shared = HealthKitHistoryWindowReader()

    /// Muestras por lote. Igual que el sync vivo: acota el payload de cada POST y
    /// mantiene la memoria plana aunque la ventana traiga decenas de miles de pulsos.
    private static let pageLimit = 500

    private let store = HKHealthStore()
    private let send: ([HKWorkoutDTO], [HKBiometricSampleDTO]) async -> HealthKitSyncService.SendOutcome

    init(
        send: @escaping ([HKWorkoutDTO], [HKBiometricSampleDTO]) async -> HealthKitSyncService.SendOutcome
            = { await HealthKitSyncService.shared.upload(workouts: $0, samples: $1) }
    ) {
        self.send = send
    }

    /// Sube TODO lo que HealthKit guarde en `[from, to)`: entrenos, las mismas
    /// métricas que observa el sync vivo, y el sueño. Lanza en cuanto algo impide
    /// seguir, para que el importador deje el cursor donde estaba y pueda reanudar.
    func importHistoryWindow(from: Date, to: Date) async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthHistoryImportError.unavailable
        }
        let window = HKQuery.predicateForSamples(withStart: from, end: to, options: [.strictStartDate])

        try await importWorkouts(window)
        for m in HealthKitSyncService.quantityMetrics {
            guard let type = HKQuantityType.quantityType(forIdentifier: m.id) else { continue }
            try await importQuantity(type: type, metric: m.metric, unit: m.unit, window: window)
        }
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            try await importSleep(type: sleepType, window: window)
        }
    }

    // MARK: - Por tipo

    private func importWorkouts(_ window: NSPredicate) async throws {
        var anchor: HKQueryAnchor? = nil
        while true {
            let descriptor = HKAnchoredObjectQueryDescriptor(
                predicates: [.workout(window)],
                anchor: anchor,
                limit: Self.pageLimit
            )
            let result = try await descriptor.result(for: store)
            let dtos = result.addedSamples.map { HealthKitSampleMapper.workout($0) }
            if !dtos.isEmpty { try await push(workouts: dtos, samples: []) }
            anchor = result.newAnchor
            if result.addedSamples.count < Self.pageLimit { return }
        }
    }

    private func importQuantity(
        type: HKQuantityType,
        metric: String,
        unit: HKUnit,
        window: NSPredicate
    ) async throws {
        var anchor: HKQueryAnchor? = nil
        while true {
            let descriptor = HKAnchoredObjectQueryDescriptor(
                predicates: [.quantitySample(type: type, predicate: window)],
                anchor: anchor,
                limit: Self.pageLimit
            )
            let result = try await descriptor.result(for: store)
            let dtos = HealthKitSampleMapper.quantitySamples(
                HealthKitSampleMapper.measuredOnly(result.addedSamples),
                metric: metric,
                unit: unit
            )
            if !dtos.isEmpty { try await push(workouts: [], samples: dtos) }
            anchor = result.newAnchor
            if result.addedSamples.count < Self.pageLimit { return }
        }
    }

    /// El sueño va sin paginar: una ventana de noventa días son noventa noches, no
    /// noventa mil muestras. Y los cortes de ventana caen a mediodía justamente para
    /// que ninguna noche se parta en dos mitades que subirían como dos noches.
    private func importSleep(type: HKCategoryType, window: NSPredicate) async throws {
        let descriptor = HKAnchoredObjectQueryDescriptor(
            predicates: [.categorySample(type: type, predicate: window)],
            anchor: nil,
            limit: HKObjectQueryNoLimit
        )
        let result = try await descriptor.result(for: store)
        let dtos = HealthKitSampleMapper.sleepNights(from: result.addedSamples)
        if !dtos.isEmpty { try await push(workouts: [], samples: dtos) }
    }

    // MARK: - Subida

    /// Un lote de histórico NO se conforma con «lo encolé». Si no llegó a salir, el
    /// barrido para aquí: seguir sería meter meses de lotes en la cola de reintentos
    /// mientras no hay red, y esa cola caduca a las 72 horas.
    private func push(workouts: [HKWorkoutDTO], samples: [HKBiometricSampleDTO]) async throws {
        switch await send(workouts, samples) {
        case .sent: return
        case .queued: throw HealthHistoryImportError.offline
        case .unauthorized: throw HealthHistoryImportError.unauthorized
        case .rejected: throw HealthHistoryImportError.rejected
        }
    }
}
