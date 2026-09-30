import Foundation
import Observation

// «GPS LISTO» ANTES DE EMPEZAR (P9, P13).
//
// Hasta hoy la muñeca no buscaba GPS hasta que empezaba la sesión: la carrera arrancaba con el ritmo en «—» hasta
// que fijaba. Con el brief de una sesión de correr en la calle a la vista, se pide el GPS y se dice cómo va:
// «Buscando GPS» y, al fijar, «GPS listo» con el háptico `.success` del vocabulario. Es CoreLocation de verdad
// (`WatchRunLocationGate`): ni un temporizador ni un «listo» supuesto. Los metros siguen siendo de Apple, no de esto.
//
// Se suelta al salir del brief: al empezar, quien pide el GPS es la sesión (`WatchPrimaryOwner`).
//
// No se usa `HKWorkoutSession.prepare()`: prepara el pulso y el GPS de una sesión ya creada, y crear la sesión antes
// de «Empezar» toca el ciclo de vida de la grabación (FH-56). Por eso tampoco hay pulso fijado antes de empezar:
// nadie lo mide todavía, y no se enseña un número que no existe.

@MainActor
@Observable
final class WatchGpsPrevio {

    static let shared = WatchGpsPrevio()

    /// Cada cuánto se mira la precisión del último fijado (s).
    private static let sondeoS: Double = 1

    private(set) var estado: Vivo.EstadoGps = .noAplica

    @ObservationIgnored private let gate = WatchRunLocationGate()
    @ObservationIgnored private var sondeo: Task<Void, Never>?

    private init() {}

    /// Pide el GPS y empieza a mirar cómo va. Idempotente.
    func activar() {
        guard sondeo == nil else { return }
        estado = .buscando
        gate.apply(wantsGPS: true)
        sondeo = Task { [weak self] in
            while !Task.isCancelled {
                self?.mirar()
                try? await Task.sleep(for: .seconds(Self.sondeoS))
            }
        }
    }

    /// Deja de buscar (se sale del brief, o empieza la sesión, que pide su propio GPS).
    func soltar() {
        sondeo?.cancel()
        sondeo = nil
        gate.stop()
        estado = .noAplica
    }

    private func mirar() {
        let nuevo = Vivo.estadoGps(precisionM: gate.horizontalAccuracyM)
        if nuevo == .listo, estado != .listo { WatchHaptics.success() }
        estado = nuevo
    }
}
