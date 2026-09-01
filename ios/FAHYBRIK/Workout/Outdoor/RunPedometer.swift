import Foundation
import CoreMotion

// LA DISTANCIA LA CUENTA APPLE, NO NOSOTROS.
//
// POR QUÉ EXISTE ESTE FICHERO, y por qué desapareció el que había antes. Nos habíamos
// escrito un contador de metros sobre CoreLocation: acumular el salto entre fixes y
// filtrarlo con tres puertas (mínimo 2 m, máximo 60 m, precisión 25 m). Ahí vivía el
// bug que Alex cazó CORRIENDO — el tope de 60 m tiraba cualquier hueco de señal de más
// de quince segundos, y cuanto más rápido ibas antes lo cruzabas. La muñeca no lo tenía
// porque la muñeca nunca contó por su cuenta: usa la de Apple.
//
// `CMPedometer` ES la de Apple. Es el mismo motor que alimenta `distanceWalkingRunning`
// en Salud: funde el podómetro con el GPS, así que en un túnel sigue contando por
// zancada — exactamente el caso que nuestro filtro tiraba entero. Está desde iOS 8, ya
// tenemos CoreMotion enlazado y el permiso de movimiento pedido (el barómetro), así que
// no cuesta ni un permiso nuevo al atleta.
//
// (Y no, no se usa `HKLiveWorkoutBuilder`, que sería lo natural: es **iOS 26**, y el
// objetivo de despliegue es iOS 18. Verificado en las cabeceras del SDK, no de memoria.
// `HKWorkoutSession` sí está desde iOS 17, pero sin el recolector en vivo no recoge
// nada — habría que volver a ponerle las muestras nosotros, que es justo lo que se
// quita aquí.)
//
// DOS MODOS, Y EL SEGUNDO ES EL QUE MANDA:
//
//  · EN VIVO, para que el atleta vea los metros subir mientras corre.
//  · **AL CERRAR, se le PREGUNTA por la ventana entera** (`queryPedometerData`). Ese es
//    el número bueno, y es mejor que cualquier acumulado nuestro: lo contesta el
//    sistema hayamos estado en segundo plano, suspendidos o muertos. No depende de que
//    mantengamos vivo un stream ni de que nadie nos conceda ejecución de fondo.

/// El contador de distancia del teléfono. Sin filtros propios: los metros son los que
/// diga el sistema.
final class RunPedometer {

    /// Metros nuevos desde la última vez. La sesión los acumula como siempre.
    var onDistanceDelta: ((Double) -> Void)?

    /// **OPCIONAL, y sólo se construye si el aparato SABE contar.** Un simulador —o un
    /// iPhone viejo sin podómetro— es el caso fácil del mismo problema: si el sensor no
    /// existe, aquí no se toca CoreMotion ni para instanciarlo. Degradar en silencio es
    /// lo que tiene que hacer de todos modos, así que esto no es una concesión a los
    /// tests: es el comportamiento correcto en un aparato sin sensor.
    private let pedometer: CMPedometer? = CMPedometer.isDistanceAvailable() ? CMPedometer() : nil
    private var isRunning = false
    private var startedAt: Date?
    /// Lo último que se reportó, para emitir sólo el incremento.
    private var reportedMeters: Double = 0

    /// ¿Sabe este teléfono contar distancia? En un simulador y en algún modelo viejo,
    /// no — y entonces la carrera se queda sin metros en vez de con metros inventados.
    static var isAvailable: Bool { CMPedometer.isDistanceAvailable() }

    func start(from instant: Date = Date()) {
        guard !isRunning, let pedometer else { return }
        isRunning = true
        startedAt = instant
        reportedMeters = 0
        pedometer.startUpdates(from: instant) { [weak self] data, error in
            guard let self, let data, error == nil,
                  let total = data.distance?.doubleValue, total.isFinite else { return }
            // El sistema da el ACUMULADO desde el arranque; nosotros emitimos el salto.
            // Nunca negativo: si el sistema recalibra hacia abajo, se queda quieto en
            // vez de restarle metros a la carrera.
            let nuevos = total - self.reportedMeters
            guard nuevos > 0 else { return }
            self.reportedMeters = total
            DispatchQueue.main.async { self.onDistanceDelta?(nuevos) }
        }
    }

    func stop() {
        guard isRunning, let pedometer else { return }
        isRunning = false
        pedometer.stopUpdates()
    }

    /// EL NÚMERO BUENO: cuántos metros dice el sistema que se recorrieron entre esos
    /// dos instantes. Se pregunta al terminar, y contesta aunque la app haya pasado la
    /// carrera entera en el bolsillo con la pantalla bloqueada.
    ///
    /// Nil = no lo sabe (sin permiso, sin sensor, o una ventana que no cubre). Nil no
    /// es cero: sin respuesta se conserva lo que se fue viendo en vivo.
    func total(from: Date, to: Date) async -> Double? {
        guard let pedometer, to > from else { return nil }
        return await withCheckedContinuation { continuation in
            pedometer.queryPedometerData(from: from, to: to) { data, error in
                guard let data, error == nil, let metros = data.distance?.doubleValue,
                      metros.isFinite, metros >= 0
                else { return continuation.resume(returning: nil) }
                continuation.resume(returning: metros)
            }
        }
    }
}
