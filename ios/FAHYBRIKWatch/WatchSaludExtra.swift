import CoreLocation
import HealthKit
import os

// LO QUE LA MUÑECA ESCRIBE EN SALUD ADEMÁS DEL ENTRENO: la ruta de una carrera en calle y el esfuerzo que el
// atleta dio al terminar.
//
// Los dos son SUYOS y nunca se inventan: la ruta solo existe si el GPS dio puntos durante la sesión (sin GPS,
// cinta o sin permiso no se guarda ninguna), y el esfuerzo solo si el atleta lo dijo. El permiso es solo de
// ESCRITURA (`escrituraExtra`): la app no lee rutas ni esfuerzos de Salud.

enum WatchSaludExtra {
    /// Los tipos que se piden además de los del entreno, solo para escribir.
    static let escrituraExtra: Set<HKSampleType> = [HKQuantityType(.workoutEffortScore), HKSeriesType.workoutRoute()]

    /// El esfuerzo de Apple va de 1 a 10: el 0 del RPE («nada») no tiene sitio en Salud.
    static let esfuerzoValido = 1...10

    /// Cuánto se espera al guardado del entreno en Salud si el atleta contesta al RPE antes de que acabe (s), y cada
    /// cuánto se mira. Pasado esto, sin entreno guardado no hay a qué ligar el esfuerzo.
    static let esperaGuardadoS: Double = 10
    static let sondeoGuardadoMs = 200

    fileprivate static let log = Logger(subsystem: Marca.subsistemaLog("primary"), category: "watch-salud")
}

// MARK: - La ruta

/// La ruta de una carrera en calle: los puntos que da el GPS mientras se graba, cerrados con el `HKWorkout`
/// guardado. Se crea al recibir el primer punto: sin GPS no hay ruta, y una ruta vacía no se guarda.
@MainActor
final class WatchRutaSalud {
    private var constructor: HKWorkoutRouteBuilder?
    private let store: HKHealthStore
    /// Apple rechazó los puntos (sin permiso de rutas): no se insiste ni se guarda nada.
    private var rechazada = false

    init(store: HKHealthStore) {
        self.store = store
    }

    /// Los puntos que dio el GPS. Los que no tienen posición válida se tiran.
    func insertar(_ locations: [CLLocation]) {
        guard !rechazada else { return }
        let validas = locations.filter { $0.horizontalAccuracy >= 0 }
        guard !validas.isEmpty else { return }
        let constructor = self.constructor ?? HKWorkoutRouteBuilder(healthStore: store, device: .local())
        self.constructor = constructor
        constructor.insertRouteData(validas) { [weak self] ok, error in
            guard !ok else { return }
            WatchSaludExtra.log.warning("insertRouteData failed: \(error?.localizedDescription ?? "sin detalle", privacy: .public)")
            Task { @MainActor in self?.rechazada = true }
        }
    }

    /// El entreno se guardó: la ruta se cierra con él. Sin puntos, o sin entreno guardado, no hay ruta que cerrar.
    func cerrar(con workout: HKWorkout?) async {
        let constructor = self.constructor
        self.constructor = nil
        let sinPermiso = rechazada
        rechazada = false
        guard let constructor else { return }
        guard let workout, !sinPermiso else {
            constructor.discard()
            return
        }
        do {
            _ = try await constructor.finishRoute(with: workout, metadata: nil)
        } catch {
            WatchSaludExtra.log.warning("finishRoute failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// El entreno se descartó o se abandonó: lo grabado no se guarda.
    func descartar() {
        constructor?.discard()
        constructor = nil
        rechazada = false
    }
}

// MARK: - El esfuerzo

extension WatchPrimaryOwner {
    /// El esfuerzo que el atleta dio al terminar, en Salud y ligado a SU entreno (`relateWorkoutEffortSample`).
    /// Sin entreno guardado en Salud (el guardado falló) no hay a qué ligarlo: no se escribe suelto.
    func registrarEsfuerzo(_ rpe: Int) async {
        guard WatchSaludExtra.esfuerzoValido.contains(rpe) else { return }
        // El guardado en Salud puede tardar más que el atleta en contestar: se espera a que acabe.
        let limite = Date().addingTimeInterval(WatchSaludExtra.esperaGuardadoS)
        while ultimoEntreno == nil, phase != .idle, Date() < limite {
            try? await Task.sleep(for: .milliseconds(WatchSaludExtra.sondeoGuardadoMs))
        }
        guard let workout = ultimoEntreno else { return }
        let muestra = HKQuantitySample(
            type: HKQuantityType(.workoutEffortScore),
            quantity: HKQuantity(unit: .appleEffortScore(), doubleValue: Double(rpe)),
            start: workout.startDate,
            end: workout.endDate
        )
        do {
            try await store.save(muestra)
            try await store.relateWorkoutEffortSample(muestra, with: workout, activity: nil)
        } catch {
            WatchSaludExtra.log.warning("effort score failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
