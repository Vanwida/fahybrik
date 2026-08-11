import Foundation

// EL EJE, Y LAS DOS SEÑALES QUE LA SESIÓN NO RECIBÍA.
//
// El pulso y la distancia ya entraban por `injectLiveHR` / `sampleRunGPS` /
// `sampleTreadmillDistance`, así que la traza se engancha ahí y hereda sus puertas.
// La VELOCIDAD y la ALTITUD no llegaban a la sesión en absoluto: la velocidad moría
// en el suavizador de la pantalla de calle (que es donde nace el ritmo que se pinta,
// una media móvil de 10 s) y la altitud no se capturaba en ninguna parte. Entran por
// aquí, con la misma puerta que el resto para que las cuatro señales compartan una
// sola regla y el eje cuadre.

extension WorkoutSession {

    /// El segundo de la muestra, contado desde el arranque de la sesión.
    ///
    /// RELOJ DE PARED, no tiempo en movimiento. Si el atleta se para en un semáforo y
    /// la sesión se pausa, dejamos de muestrear y en la serie aparece un HUECO — que
    /// es exactamente lo que pasó. Con el tiempo en movimiento la pausa se borraría y
    /// el eje diría que estuvo corriendo diez minutos que no corrió. Además así
    /// `started_at` + offset es el instante real de la muestra, y la traza se puede
    /// cruzar con los `started_at`/`ended_at` de cada tramo, que es como el servidor
    /// atribuye por ventana.
    func traceSecond(_ instant: Date = Date()) -> Int {
        Int(instant.timeIntervalSince(startedAt).rounded())
    }

    /// Un fix de GPS con velocidad válida.
    ///
    /// Se archiva la VELOCIDAD porque es lo que el aparato mide; el ritmo se deriva al
    /// leer. CoreLocation marca «no lo sé» con negativos (velocidad y su precisión),
    /// y un «no lo sé» no es una medida: se descarta en vez de archivarse como cero.
    /// Nada de aplicar aquí el umbral de precisión del suavizador — ese es un criterio
    /// de PANTALLA, y quien lea la traza decide el suyo.
    func sampleRunSpeed(metersPerSecond: Double, accuracyMps: Double) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, tramoIsRun else { return }
        guard metersPerSecond >= 0, accuracyMps >= 0 else { return }
        trace.record(.speed, source: .gps, value: metersPerSecond, atSecond: traceSecond())
    }

    /// La velocidad que declara la cinta (FTMS), tal cual.
    ///
    /// Si la máquina congela su velocidad instantánea mientras el cuentakilómetros
    /// sigue subiendo —pasa, y por eso existe `TreadmillSpeedResolver`— se archiva lo
    /// que dijo la máquina. La distancia va en la misma traza y sobre el mismo eje, así
    /// que quien lea puede derivar la velocidad real y comparar. Guardar aquí la
    /// versión ya arreglada sería archivar nuestra interpretación y perder el negativo.
    func sampleTreadmillSpeed(metersPerSecond: Double) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, tramoIsRun else { return }
        guard metersPerSecond >= 0 else { return }
        trace.record(.speed, source: .treadmill, value: metersPerSecond, atSecond: traceSecond())
    }

    /// Altitud sobre el nivel del mar, del barómetro anclado al GPS (ver `RunAltimeter`).
    ///
    /// Es lo que le falta al ritmo ajustado por pendiente y al desnivel acumulado: en
    /// un 8×200 en cuesta el ritmo bruto no significa nada. Se etiqueta como `gps`
    /// porque el CERO de la serie lo pone el GPS — el barómetro solo sabe cuánto has
    /// subido desde que empezó, no desde dónde.
    ///
    /// Lleva el INSTANTE porque las lecturas anteriores al ancla salen todas juntas en
    /// cuanto se conoce el cero, y cada una tiene que caer en el segundo en que se
    /// midió, no en el segundo en que se supo interpretarla.
    func sampleAltitude(metersAboveSeaLevel: Double, at instant: Date) {
        guard !isPaused, !isFinished, !isAwaitingBlockStart, tramoIsRun else { return }
        trace.record(.altitude, source: .gps, value: metersAboveSeaLevel, atSecond: traceSecond(instant))
    }
}

extension WorkoutSession.HRSource {
    /// De cómo la sesión llama a un origen de pulso a cómo lo llama la base.
    ///
    /// `pm5` es una banda emparejada al monitor del Concept2, que nos la reenvía: en
    /// el esquema eso es `concept2`. `strap` es una banda BLE emparejada al teléfono y
    /// se llama igual en los dos sitios.
    var traceSource: TraceSource {
        switch self {
        case .strap:     return .strap
        case .healthkit: return .healthkit
        case .pm5:       return .concept2
        }
    }
}
