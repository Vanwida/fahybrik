import Foundation
import CoreMotion

// LA ALTITUD, QUE HASTA HOY NO SE CAPTURABA EN ABSOLUTO.
//
// Sin ella no hay desnivel acumulado ni ritmo ajustado por pendiente, y un 8×200 en
// cuesta al 8% se lee con el ritmo bruto — que en pendiente no significa nada. Es la
// pieza que le faltaba a dos de las doce carreras de la prueba de esfuerzo.
//
// DOS SENSORES, PORQUE NINGUNO SIRVE SOLO:
//
//   • El BARÓMETRO (CMAltimeter) mide cambios de altura con precisión de decímetros,
//     que es justo lo que pide el desnivel: sumar cientos de subidas pequeñas. Pero
//     sólo sabe cuánto has subido DESDE QUE EMPEZÓ. No sabe desde dónde.
//   • El GPS sí da la altura absoluta, pero la suya es su peor medida: decenas de
//     metros de error y saltos entre fixes. Sumar sus diferencias da un desnivel de
//     fantasía.
//
// Así que el barómetro pone la FORMA de la curva y el GPS le pone el CERO.
//
// El reparto de este fichero es el mismo que el de `RunPaceSmoother` /
// `RunAutoPause` / `HeartRateParser`: el ALGORITMO va en un tipo puro que se prueba
// con números, y la carcasa sólo habla con CoreMotion.

/// El cero de la serie de altitud: qué hay que sumarle a lo que dice el barómetro.
///
/// El ancla se calcula como la MEDIANA de las primeras parejas (altura del GPS −
/// altura relativa en ese instante) y se congela. Mediana y no media porque un solo
/// fix disparatado se lleva la media por delante; congelada porque recalcularla a
/// mitad de carrera desplazaría la parte ya emitida y la curva daría un escalón que
/// nadie subió.
///
/// Y SI NO HAY ANCLA, NO SALE NADA. Un gimnasio, un permiso denegado, un teléfono sin
/// barómetro: la señal no existe, en vez de existir mintiendo. Las lecturas anteriores
/// al ancla no se tiran: se guardan y salen todas en cuanto se conoce el cero — son
/// medidas reales, sólo que aún no sabíamos su origen.
struct RunAltitudeAnchor {

    /// Una altitud absoluta lista para archivar, con el instante en que se midió.
    struct Reading: Equatable {
        let metersAboveSeaLevel: Double
        let at: Date
    }

    /// Cuántas parejas GPS↔barómetro se juntan antes de congelar el ancla. Con cinco
    /// la mediana ya descarta un fix disparatado, y a 1 Hz llegan en los primeros
    /// segundos de carrera.
    static let anchorSamples = 5
    /// Precisión vertical máxima aceptable de un fix (m). La vertical del GPS es
    /// bastante peor que la horizontal (que se filtra a 25 m), así que el listón va
    /// más bajo: por encima de esto el fix no ayuda ni a poner un cero.
    static let verticalAccuracyGateMeters = 30.0
    /// Tope de lecturas guardadas esperando ancla (~2 min a 1 Hz). Si en dos minutos
    /// no ha llegado un fix con altura decente, esa carrera no va a tener altitud y
    /// no vamos a llenar la memoria esperándola.
    static let maxPendingReadings = 120

    private(set) var anchor: Double?
    private var latestRelative: Double?
    private var pending: [Reading] = []
    private var offsets: [Double] = []

    var isAnchored: Bool { anchor != nil }

    /// Una lectura del barómetro. Devuelve lo que hay que archivar: la propia lectura
    /// si ya hay cero, o nada mientras no lo haya.
    mutating func barometric(relativeMeters: Double, at instant: Date) -> [Reading] {
        guard relativeMeters.isFinite else { return [] }
        latestRelative = relativeMeters
        guard let anchor else {
            pending.append(Reading(metersAboveSeaLevel: relativeMeters, at: instant))
            if pending.count > Self.maxPendingReadings { pending.removeFirst() }
            return []
        }
        return [Reading(metersAboveSeaLevel: anchor + relativeMeters, at: instant)]
    }

    /// La altura absoluta de un fix del GPS. Devuelve todo lo que estaba esperando en
    /// cuanto esta pareja completa el ancla; nada el resto de las veces.
    mutating func gps(meters: Double, verticalAccuracy: Double) -> [Reading] {
        guard anchor == nil, meters.isFinite else { return [] }
        guard verticalAccuracy > 0, verticalAccuracy <= Self.verticalAccuracyGateMeters else { return [] }
        guard let relative = latestRelative else { return [] }
        offsets.append(meters - relative)
        guard offsets.count >= Self.anchorSamples else { return [] }
        let zero = Self.median(offsets)
        anchor = zero
        let waiting = pending
        pending = []
        return waiting.map { Reading(metersAboveSeaLevel: zero + $0.metersAboveSeaLevel, at: $0.at) }
    }

    static func median(_ values: [Double]) -> Double {
        guard !values.isEmpty else { return 0 }
        let sorted = values.sorted()
        let mid = sorted.count / 2
        if sorted.count.isMultiple(of: 2) {
            return (sorted[mid - 1] + sorted[mid]) / 2
        }
        return sorted[mid]
    }
}

/// Altitud sobre el nivel del mar durante una carrera al aire libre.
///
/// Compartido (como `DeviceHub`) porque tiene DOS alimentadores de GPS: la pantalla
/// de calle tiene su proveedor y la vista activa el suyo, y sólo uno está vivo cada
/// vez. Un altímetro por pantalla partiría la serie en dos con anclas distintas.
final class RunAltimeter {
    static let shared = RunAltimeter()

    /// La altitud absoluta y el instante en que se midió. El instante viaja porque
    /// las lecturas previas al ancla salen a posteriori y tienen que caer en SU
    /// segundo del eje, no en el de ahora.
    var onAltitude: ((_ metersAboveSeaLevel: Double, _ at: Date) -> Void)?

    private let altimeter = CMAltimeter()
    private var isRunning = false
    private var anchor = RunAltitudeAnchor()

    /// Arranca el barómetro. Idempotente. No hace nada donde no hay sensor (el
    /// simulador, un iPhone antiguo): la señal simplemente no existirá.
    func start() {
        guard !isRunning, CMAltimeter.isRelativeAltitudeAvailable() else { return }
        isRunning = true
        anchor = RunAltitudeAnchor()
        altimeter.startRelativeAltitudeUpdates(to: .main) { [weak self] data, error in
            guard let self, let data, error == nil else { return }
            self.emit(self.anchor.barometric(relativeMeters: data.relativeAltitude.doubleValue, at: Date()))
        }
    }

    func stop() {
        guard isRunning else { return }
        isRunning = false
        altimeter.stopRelativeAltitudeUpdates()
        anchor = RunAltitudeAnchor()
    }

    /// La altura absoluta de un fix del GPS: es lo único que sabe dónde está el cero.
    func noteGPSAltitude(_ meters: Double, verticalAccuracy: Double) {
        guard isRunning else { return }
        emit(anchor.gps(meters: meters, verticalAccuracy: verticalAccuracy))
    }

    private func emit(_ readings: [RunAltitudeAnchor.Reading]) {
        for reading in readings {
            onAltitude?(reading.metersAboveSeaLevel, reading.at)
        }
    }
}
