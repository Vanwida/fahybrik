import Foundation

// EL NEGATIVO DE LA SESIÓN. Lo que se MIDIÓ, sobre un eje de tiempo, sin interpretar.
//
// El motor medía la carrera entera en vivo —pulso latido a latido, velocidad y
// distancia de cada fix— la reducía a una media por tramo y tiraba el resto. Sin la
// serie no hay curva, ni deriva, ni kilómetros, ni reparto de zonas con la buena
// evidencia. La tabla `workout_traces` y su endpoint existían desde la migración
// 0156 y nadie escribía en ellos: esto es el emisor.
//
// TRES REGLAS QUE NO SE NEGOCIAN, y por eso viven aquí y no repartidas por la app:
//
//  1. SE GUARDA LO MEDIDO, NO LO INTERPRETADO. Va la VELOCIDAD, que es lo que dan el
//     GPS y la cinta; el ritmo se deriva al leer. El ritmo que se pinta en vivo es
//     una media móvil de 10 s — guardarlo sería guardar una opinión y perder el
//     negativo. Quien lee suaviza como necesite.
//  2. EL EJE VA EXPLÍCITO, EN SEGUNDOS ENTEROS DESDE EL ARRANQUE, con cadencia
//     variable a propósito. Un hueco es un hueco y tiene que verse: el semáforo en
//     el que la sesión se pausó, el túnel sin GPS, la banda que se soltó. Rellenar
//     para tener intervalo fijo es fabricar dato indistinguible del medido.
//  3. LA FUENTE FORMA PARTE DE LA IDENTIDAD. El pulso de la banda y el del reloj son
//     dos medidas distintas del mismo fenómeno: viven en series separadas y quien
//     lee elige por fidelidad. Si la banda muere a mitad y el reloj toma el relevo,
//     esta sesión emite DOS series de pulso, cada una con su tramo. Ninguna miente.
//
// Foundation puro y sin reloj propio: quien llama traduce el instante a segundo. Así
// el diezmado, el eje y los huecos se prueban con enteros y sin esperar a nada.

/// Las señales que este cliente sabe medir hoy. Subconjunto deliberado del CHECK de
/// la 0156: `pace` no se emite nunca (se deriva de `speed`), y `cadence`/`power` no
/// se emiten en carrera porque el dispositivo no los mide — el día que haya fuente
/// se añade un caso aquí y nada más cambia.
enum TraceSignal: String, Codable, CaseIterable {
    case hr        // bpm
    case speed     // m/s
    case distance  // m acumulados
    case altitude  // m sobre el nivel del mar

    /// Qué se salva primero si una sesión llegara a superar el tope de series por
    /// petición. Nunca debería pasar (el máximo real son ocho), pero si pasa se
    /// pierde la altitud antes que el pulso, no la que caiga por orden alfabético.
    var priority: Int {
        switch self {
        case .hr:       return 0
        case .distance: return 1
        case .speed:    return 2
        case .altitude: return 3
        }
    }
}

/// Quién midió. Los valores son los del enum `biometric_source` de la base: no es un
/// vocabulario nuestro, es el que ya distingue proveedores en todo el esquema.
enum TraceSource: String, Codable, CaseIterable {
    /// Reloj o teléfono a través de Apple Salud.
    case healthkit
    /// Banda emparejada al monitor del Concept2, que nos la reenvía.
    case concept2
    /// Banda de pulso BLE emparejada al teléfono (servicio 0x180D).
    case strap
    /// GPS del teléfono.
    case gps
    /// Cinta por FTMS: la distancia y la velocidad las da la máquina.
    case treadmill
}

/// Una traza tal y como viaja: la serie entera de una señal en una fila.
///
/// Claves en snake_case EXPLÍCITO, igual que `WorkoutExecutionPayload`, para que
/// ningún `keyEncodingStrategy` pueda desincronizar los nombres — y para que el
/// cuerpo que se aparca en disco para el modo avión se codifique idéntico con un
/// `JSONEncoder()` pelado.
struct WorkoutTraceDTO: Codable, Equatable {
    let signal: String
    let source: String
    let started_at: String
    let offsets_s: [Int]
    let values: [Double]
}

/// El cuerpo de `POST /api/sync/workout-traces`.
struct WorkoutTracesPayload: Codable, Equatable {
    /// Numérico a propósito: el Zod del endpoint pide `number().int().positive()`,
    /// mientras que la respuesta de la ejecución lo devuelve como texto. La
    /// conversión se hace UNA vez, al recibirlo, y si no es un entero positivo no se
    /// sube nada — antes que subir una traza colgada de una ejecución inventada.
    let execution_id: Int
    let traces: [WorkoutTraceDTO]
}

/// Cuántos puntos caben en una señal antes de diezmar. Mismo número que el servidor
/// (`TRACE_MAX_POINTS` en `web/lib/sync/ingest-workout-traces.ts`): pasarse es un 400
/// y perder la sesión entera, así que el cliente recorta antes de que eso ocurra.
let TRACE_MAX_POINTS = 20_000
/// Cuántas series caben en una petición. Mismo número que el servidor
/// (`TRACE_MAX_PER_REQUEST`). Una sesión real emite ocho como mucho.
let TRACE_MAX_PER_REQUEST = 14

/// El buffer de la sesión. Una serie por (señal, fuente), en orden de llegada.
///
/// No es un actor ni tiene bloqueos: lo alimenta `WorkoutSession`, que vive en el
/// hilo principal, y se lee UNA vez cuando la sesión ya ha terminado.
final class WorkoutTraceRecorder {

    /// Un punto: el segundo desde el arranque y lo que valía la señal ahí.
    struct Point: Equatable {
        let second: Int
        let value: Double
    }

    private struct Key: Hashable {
        let signal: TraceSignal
        let source: TraceSource
    }

    private var series: [Key: [Point]] = [:]
    /// Totales por serie para las señales que se miden por incrementos (la distancia
    /// llega como «cuántos metros desde el fix anterior», no como acumulado).
    private var totals: [Key: Double] = [:]

    var isEmpty: Bool { series.values.allSatisfy(\.isEmpty) }

    /// Cuántos puntos lleva la sesión en total. Para el informe y las pruebas.
    var pointCount: Int { series.values.reduce(0) { $0 + $1.count } }

    /// Los puntos de una serie concreta, sin diezmar ni redondear. Lo usa quien
    /// construye una serie aparte y la trae ya hecha — el contraste de distancia
    /// contra Apple Salud — para no tener una segunda implementación del acumulado.
    func points(of signal: TraceSignal, source: TraceSource) -> [Point] {
        series[Key(signal: signal, source: source)] ?? []
    }

    /// Adopta una serie ya construida fuera. Se usa para injertar la segunda opinión
    /// de una señal (misma señal, otra fuente) en la traza de la sesión antes de
    /// subirla; nunca para sobrescribir lo medido aquí.
    func adopt(_ points: [Point], as signal: TraceSignal, source: TraceSource) {
        guard !points.isEmpty else { return }
        series[Key(signal: signal, source: source)] = points
    }

    // MARK: - Alimentar

    /// Anota un valor ABSOLUTO (pulso, velocidad, altitud).
    ///
    /// Dos muestras en el mismo segundo dejan la última: el eje es de segundos
    /// enteros y estrictamente creciente, que es lo que la 0156 le exige al escritor.
    /// Una muestra con un segundo ANTERIOR al último se descarta — el reloj del
    /// sistema puede saltar hacia atrás y un eje desordenado se lee mal para siempre.
    func record(_ signal: TraceSignal, source: TraceSource, value: Double, atSecond second: Int) {
        guard second >= 0, value.isFinite else { return }
        let key = Key(signal: signal, source: source)
        var points = series[key] ?? []
        if let last = points.last {
            if second < last.second { return }
            if second == last.second {
                points[points.count - 1] = Point(second: second, value: value)
                series[key] = points
                return
            }
        }
        points.append(Point(second: second, value: value))
        series[key] = points
    }

    /// Anota un INCREMENTO y guarda el acumulado (la distancia, que llega en trozos).
    ///
    /// El total se suma SIEMPRE, aunque el punto caiga en el mismo segundo que el
    /// anterior: si dos fixes entran en el mismo segundo, sus metros son los dos.
    func accumulate(_ signal: TraceSignal, source: TraceSource, delta: Double, atSecond second: Int) {
        guard second >= 0, delta.isFinite else { return }
        let key = Key(signal: signal, source: source)
        let total = (totals[key] ?? 0) + delta
        totals[key] = total
        record(signal, source: source, value: total, atSecond: second)
    }

    // MARK: - Leer

    /// Las trazas listas para subir, con el eje anclado a `startedAt`.
    ///
    /// Vacío cuando no se midió nada: una sesión sin sensores no manda una traza
    /// vacía, no manda ninguna. Degradar diciendo la verdad.
    func traces(startedAt: Date) -> [WorkoutTraceDTO] {
        let stamp = Self.timestampFormatter.string(from: startedAt)
        return series
            .filter { !$0.value.isEmpty }
            .sorted { lhs, rhs in
                if lhs.key.signal.priority != rhs.key.signal.priority {
                    return lhs.key.signal.priority < rhs.key.signal.priority
                }
                return lhs.key.source.rawValue < rhs.key.source.rawValue
            }
            .prefix(TRACE_MAX_PER_REQUEST)
            .map { key, points in
                let kept = Self.decimated(points, limit: TRACE_MAX_POINTS)
                return WorkoutTraceDTO(
                    signal: key.signal.rawValue,
                    source: key.source.rawValue,
                    started_at: stamp,
                    offsets_s: kept.map(\.second),
                    values: kept.map { Self.rounded($0.value, for: key.signal) }
                )
            }
    }

    // MARK: - Diezmado

    /// Reparte `limit` puntos UNIFORMEMENTE por toda la serie, conservando SIEMPRE el
    /// primero y el último.
    ///
    /// Recortar la cola sería más fácil y es justo el fallo que se paga caro: en una
    /// tirada larga se perderían los últimos kilómetros, que son los que cuentan.
    /// Diezmando, una sesión de doce horas pierde resolución y no pierde carrera.
    static func decimated(_ points: [Point], limit: Int = TRACE_MAX_POINTS) -> [Point] {
        guard limit >= 2, points.count > limit else { return points }
        let lastIndex = Double(points.count - 1)
        let steps = Double(limit - 1)
        var out: [Point] = []
        out.reserveCapacity(limit)
        var previous = -1
        for i in 0..<limit {
            let index = Int((Double(i) * lastIndex / steps).rounded())
            guard index != previous else { continue }
            previous = index
            out.append(points[index])
        }
        return out
    }

    // MARK: - Grafía

    /// La columna es `real[]` (siete cifras significativas), así que más precisión que
    /// esta se pierde en la base de todos modos — y un `3.4200000000000004` en el
    /// cuerpo son bytes por nada. Se redondea a lo que el sensor sabe de verdad.
    private static func rounded(_ value: Double, for signal: TraceSignal) -> Double {
        switch signal {
        case .hr:                  return value.rounded()          // bpm entero
        case .speed:               return (value * 100).rounded() / 100   // cm/s
        case .distance, .altitude: return (value * 10).rounded() / 10     // dm
        }
    }

    /// ISO 8601 con offset, que es lo que pide `isoDateTime` del esquema compartido.
    private static let timestampFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}
