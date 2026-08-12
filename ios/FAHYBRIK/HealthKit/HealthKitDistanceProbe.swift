import Foundation
import HealthKit

// LA SEGUNDA OPINIÓN SOBRE LOS METROS.
//
// POR QUÉ EXISTE. El fallo de la puerta de distancia —tirar tramos reales por medir
// más de 60 metros— vivió escondido hasta que Alex lo notó CORRIENDO. No lo cazó
// ningún test ni ninguna pantalla, porque no había nada con qué comparar: la app era
// la única fuente de su propia distancia, así que no tenía forma de saber que estaba
// mintiendo. Un archivo que no sabe cuándo miente no es un archivo.
//
// QUÉ HACE. Al terminar, pregunta a Apple Salud cuánta distancia registró ELLA en la
// misma ventana de tiempo, y esa serie se guarda junto a la nuestra como una traza
// más — misma señal, otra fuente. La tabla ya tiene la clave (ejecución, señal,
// fuente) preparada para justo esto, así que no hace falta ni una columna nueva: las
// dos cifras conviven, ninguna pisa a la otra, y cualquier divergencia queda a la
// vista para siempre en el propio archivo.
//
// POR QUÉ ES UNA MEDIDA INDEPENDIENTE DE VERDAD. `distanceWalkingRunning` no sale de
// nuestro filtro: la fusiona el sistema con el podómetro, el GPS y —si el atleta lleva
// reloj— el del reloj. No es «mejor» que la nuestra ni la sustituye; es otra manera de
// medir lo mismo, y para detectar que una de las dos se ha roto eso es exactamente lo
// que hace falta.
//
// LO QUE NO HACE: corregir. Jamás se sobrescribe lo medido con esto. Se guardan las
// dos y quien lee decide — la misma doctrina que el resto del archivo.

enum HealthKitDistanceProbe {

    /// Cuánto se espera como mucho por esta consulta. Corre en el guardado del
    /// entreno, así que no puede quedarse colgada: sin respuesta a tiempo, esa sesión
    /// se queda sin segunda opinión y ya está — es un contraste, no un requisito.
    static let timeout: TimeInterval = 4

    /// La distancia acumulada según Apple Salud sobre el eje de segundos de la sesión.
    ///
    /// Vacío cuando no hay HealthKit, no hay permiso, o no registró nada: sin dato no
    /// se inventa una serie plana de ceros, que sería exactamente el tipo de mentira
    /// que esto viene a cazar.
    static func cumulativeSeries(
        startedAt: Date,
        endedAt: Date,
        store: HKHealthStore = HKHealthStore()
    ) async -> [WorkoutTraceRecorder.Point] {
        guard HKHealthStore.isHealthDataAvailable(), endedAt > startedAt,
              let type = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)
        else { return [] }

        let samples = await withTimeout(seconds: timeout) {
            await query(store: store, type: type, from: startedAt, to: endedAt)
        }
        return series(from: samples ?? [], startedAt: startedAt)
    }

    /// Convierte las muestras en una serie acumulada sobre el eje de la sesión.
    ///
    /// Cada muestra se apunta en el segundo en que TERMINA: una muestra cubre un
    /// intervalo, y sus metros no están todos disponibles hasta su final. Repartirlos
    /// por dentro sería interpolar, o sea inventar.
    static func series(
        from samples: [(meters: Double, endedAt: Date)],
        startedAt: Date
    ) -> [WorkoutTraceRecorder.Point] {
        let recorder = WorkoutTraceRecorder()
        for sample in samples.sorted(by: { $0.endedAt < $1.endedAt }) {
            let second = Int(sample.endedAt.timeIntervalSince(startedAt).rounded())
            guard second >= 0 else { continue }
            recorder.accumulate(.distance, source: .healthkit, delta: sample.meters, atSecond: second)
        }
        return recorder.points(of: .distance, source: .healthkit)
    }

    // MARK: - Interno

    private static func query(
        store: HKHealthStore,
        type: HKQuantityType,
        from: Date,
        to: Date
    ) async -> [(meters: Double, endedAt: Date)] {
        await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [.strictStartDate])
            let query = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: true)]
            ) { _, samples, _ in
                let rows = (samples as? [HKQuantitySample] ?? []).map {
                    (meters: $0.quantity.doubleValue(for: .meter()), endedAt: $0.endDate)
                }
                continuation.resume(returning: rows)
            }
            store.execute(query)
        }
    }

    /// Devuelve nil si `work` no termina a tiempo. HealthKit puede tardar con un
    /// historial grande y el guardado del entreno no puede esperarla.
    private static func withTimeout<T: Sendable>(
        seconds: TimeInterval,
        _ work: @escaping @Sendable () async -> T
    ) async -> T? {
        await withTaskGroup(of: T?.self) { group in
            group.addTask { await work() }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }
}
