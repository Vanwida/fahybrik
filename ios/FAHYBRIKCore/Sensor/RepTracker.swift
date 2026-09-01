import Foundation

/// Contador de repeticiones EN VIVO y velocidad por repetición (plan fases 2–3).
///
/// # El modelo
///
/// Una repetición no es «un pico periódico»: es una **excursión de ida y vuelta**.
/// La muñeca sale de un sitio, recorre un camino y vuelve. Eso lo comparten el
/// squat, el press de banca, el jalón, el curl, el swing y la wall ball — cambia
/// el sentido y la amplitud, no la forma. Por eso aquí no hay un caso por
/// ejercicio: hay dos observables de la misma excursión.
///
/// **Traslación** (metros, eje vertical del mundo) para todo lo que viaja con la
/// carga. **Orientación** (grados que gira el antebrazo) para lo que NO viaja
/// porque las manos están fijas y lo que se mueve es el cuerpo: dominadas,
/// fondos, flexiones. Las dos máquinas comparten puertas y un tiempo muerto
/// común, así que una repetición física nunca se cuenta dos veces.
///
/// # Por qué no por periodicidad
///
/// El contador anterior buscaba el periodo por autocorrelación sobre el eje de
/// más varianza. Medido el 11-ago con señal de tres ejes: andar 20 s hacia la
/// barra daba **8 repeticiones con confianza 0,90**, y un back squat real de 6 a
/// 4,5 s daba **3**. Cualquier movimiento rítmico de muñeca es periódico; lo que
/// distingue una repetición es la GEOMETRÍA (sale y vuelve, con amplitud) y el
/// CONTEXTO (hay una serie abierta). Las dos cosas están aquí, y la segunda la
/// pone el llamante abriendo la ventana de trabajo.
///
/// # Precisión
///
/// Toda amplitud se calcula integrando DOS veces, y eso deriva. La derivación se
/// mata por tramo: la velocidad se fuerza a cero en los dos extremos del tramo
/// (quitando su tendencia lineal), que es el anclaje que pide el plan — «al
/// principio y al final de cada repetición la velocidad es cero, y eso da dos
/// anclajes por repetición». Es un error de amplitud del orden del 10–20 %, muy
/// por debajo de las puertas que decidimos con ella.
///
/// # Lo que NO hace
///
/// No sabe qué ejercicio es (eso es la fase 4, y necesita corpus). No entrega
/// número cuando la excursión es horizontal, porque a esa altura un remo sentado
/// y un brazo balanceándose son la misma señal — y entregar un número con aplomo
/// ahí es el único error que el plan declara inaceptable.
struct RepTracker: Sendable {

    /// Umbrales del MECANISMO. Nacen como dato con defecto, no como `const`:
    /// `coach_movement_policy` (mig. 0177) los pisa por movimiento cuando haga falta.
    struct Tuning: Sendable, Equatable {
        /// Recorrido mínimo de una fase para que cuente como media repetición (m).
        /// Un press de banca son ~0,35 m; una wall ball ~0,60; un curl ~0,35.
        var minRomM: Double = 0.12
        /// Por encima de esto no es una repetición, es un desplazamiento. El techo
        /// lo manda el SNATCH: del suelo al bloqueo arriba la muñeca recorre ~1,9 m,
        /// así que 1,80 descartaba el levantamiento olímpico entero por «esto no es
        /// una repetición». Lo que impide que un error de integración cuele no es
        /// este tope, son la simetría de ida y vuelta y la fracción vertical.
        var maxRomM: Double = 2.40
        /// Duración de una fase (bajada o subida), en segundos.
        var minPhaseS: Double = 0.12
        var maxPhaseS: Double = 6.0
        /// Duración del ciclo completo.
        var minCycleS: Double = 0.40
        var maxCycleS: Double = 12.0
        /// Cuánto puede diferir la ida de la vuelta: una repetición vuelve a donde
        /// empezó. 0,45 = la corta es al menos el 45 % de la larga.
        var romRatioMin: Double = 0.45
        /// Fracción del recorrido que debe ser VERTICAL. Por debajo no se entrega
        /// número: es donde un remo sentado y un balanceo de brazo se confunden.
        var verticalShareMin: Double = 0.35
        /// Banda muerta de la velocidad para partir tramos (m/s).
        var velocityDeadband: Double = 0.06
        /// Constante de la media móvil que quita el sesgo del acelerómetro (s).
        /// LARGA y solo mientras la muñeca está quieta: si aprendiera rápido, en
        /// una repetición lenta el punto de giro (donde la aceleración es máxima)
        /// entraría en el sesgo y anularía el gesto — así se perdían los squats.
        var biasTauS: Double = 6.0
        /// Ventana inicial en la que el sesgo se aprende rápido, asumiendo que al
        /// abrir la serie la muñeca aún no ha empezado a moverse (s).
        var biasPrimeS: Double = 0.5
        /// Constante del filtro que le quita la CONTINUA a la velocidad integrada
        /// (s). Es lo que permite partir tramos por cruce de cero aunque el
        /// acelerómetro tenga offset: no se confía en que la integral esté centrada,
        /// se centra. La amplitud NO sale de aquí — sale de integrar cada tramo con
        /// su tendencia quitada.
        var velocityHighPassTauS: Double = 1.5
        /// Velocidad por debajo de la cual se considera que la muñeca está quieta.
        var stillVelocity: Double = 0.08
        /// Aceleración por debajo de la cual se considera que está quieta. Tiene
        /// que quedar POR DEBAJO del pico de una repetición lenta (un squat de
        /// 45 cm en 4,5 s pica a 0,44 m/s²) o el gesto se confunde con reposo.
        var stillAccel: Double = 0.30
        /// Recorrido de la última fase por debajo del cual se considera que las
        /// MANOS ESTÁN FIJAS (dominadas, flexiones) y se permite contar por
        /// orientación. Por encima manda la traslación: un curl gira 70° y también
        /// viaja 35 cm, y ahí la repetición la manda el recorrido.
        var handsFixedPathM: Double = 0.12
        /// Quietud sostenida que ancla la velocidad a cero (s).
        var stillAnchorS: Double = 0.30
        /// Tiempo muerto tras cerrar una repetición (s).
        var refractoryS: Double = 0.30
        /// Excursión angular mínima para contar por orientación (grados).
        var minAngleDeg: Double = 22
        /// Confianza mínima para entregar el nivel «contado».
        var countedConfidence: Double = 0.62

        static let `default` = Tuning()
    }

    var tuning: Tuning = .default

    // MARK: - Salida

    /// Repeticiones CERRADAS de la ventana actual, en orden. Nunca se revisan.
    private(set) var reps: [SensorRepEvent] = []

    var count: Int { reps.count }
    var last: SensorRepEvent? { reps.last }

    /// Nivel del conteo de la serie: el de la última repetición cerrada.
    var level: RepConfidenceLevel { reps.last?.level ?? .unknown }

    /// Confianza del conteo de la serie (media de las repeticiones cerradas).
    var confidence: Double {
        guard !reps.isEmpty else { return 0 }
        return reps.reduce(0) { $0 + $1.confidence } / Double(reps.count)
    }

    /// Resumen de la serie con las repeticiones que SÍ tienen velocidad medida.
    /// Nil mientras no haya ninguna: no se inventa una pérdida con una sola.
    var setSummary: BarVelocityResult? {
        let withV = reps.filter { $0.concentricMs > 0 }
        guard let first = withV.first, let lastRep = withV.last else { return nil }
        let loss = first.concentricMs > 1e-6
            ? max(0, (first.concentricMs - lastRep.concentricMs) / first.concentricMs * 100)
            : 0
        let meanRom = withV.reduce(0) { $0 + $1.romMeters } / Double(withV.count)
        let meanConf = withV.reduce(0) { $0 + $1.confidence } / Double(withV.count)
        return BarVelocityResult(
            meanVelocityFirst: first.concentricMs,
            meanVelocityLast: lastRep.concentricMs,
            velocityLossPct: loss,
            romMeters: meanRom,
            confidence: meanConf,
            repVelocities: withV.map(\.concentricMs)
        )
    }

    // MARK: - Estado interno

    /// Un tramo: media repetición propuesta por el cruce de cero. NO trae
    /// amplitudes — de eso decide la curva de posición del ciclo entero.
    private struct Phase {
        let sign: Int          // +1 sube, -1 baja
        let t0: Double
        let t1: Double
    }

    /// La forma del ciclo, leída de la curva de posición: dónde está el fondo,
    /// cuánto se bajó, cuánto se subió y en cuánto tiempo.
    private struct CycleShape {
        let ascentM: Double
        let descentM: Double
        let concentricSeconds: Double
        let peakMs: Double
        let pathM: Double
    }

    private var lastT: Double?
    /// Primera muestra de la ventana — marca la ventana de cebado del sesgo.
    private var firstT: Double?
    private var bias: Double = 0
    /// Continua de la velocidad integrada, que se le resta para centrarla.
    private var velocityDC: Double = 0
    /// Muestras recientes (hasta un ciclo máximo). Sirven para preguntar «¿viajó
    /// la muñeca MIENTRAS giraba?», que es lo que separa una dominada de un brazo
    /// balanceándose al andar.
    private var recent: [(t: Double, aVert: Double, ax: Double, ay: Double, az: Double)] = []
    private var velocity: Double = 0
    /// Signo del tramo en curso (0 = dentro de la banda muerta).
    private var currentSign: Int = 0
    /// Instante en que empezó el tramo en curso.
    private var phaseStart: Double?
    private var pending: Phase?
    private var lastCloseAt: Double = -.infinity
    /// Ancla de orientación y su excursión en curso.
    private var anchorGravity: (Double, Double, Double)?
    private var angleOut = false
    private var angleOutStart: Double = 0
    private var anglePeakDeg: Double = 0
    private var stillSince: Double?

    // MARK: - Ciclo de vida

    mutating func reset() {
        reps = []
        lastT = nil
        firstT = nil
        bias = 0
        velocityDC = 0
        recent = []
        velocity = 0
        currentSign = 0
        phaseStart = nil
        pending = nil
        lastCloseAt = -.infinity
        lastRejection = nil
        trace = []
        anchorGravity = nil
        angleOut = false
        anglePeakDeg = 0
        stillSince = nil
    }

    /// Empuja una muestra. Devuelve la repetición SI se ha cerrado con ésta.
    @discardableResult
    mutating func push(_ s: SensorSample) -> SensorRepEvent? {
        guard let aVert = s.verticalAccel else { return nil }
        defer { lastT = s.t }
        guard let prev = lastT else {
            // El sesgo NO se siembra con la primera muestra: si esa muestra cae en
            // un pico, mete varios m/s de velocidad falsa que no se van nunca
            // (11-ago: por esto el contador se quedaba con signo fijo y cero reps).
            bias = 0
            firstT = s.t
            anchorGravity = gravityUnit(s)
            note(s.hasGravity
                 ? String(format: "gravedad OK (|g| %.2f)", s.gravityMagnitude)
                 : "SIN GRAVEDAD: build del reloj vieja o muestra v1 → no se cuenta nada")
            return nil
        }
        let dt = s.t - prev
        // Un salto de tiempo (pausa, hueco de muestreo) invalida la integración.
        guard dt > 0, dt < 0.5 else {
            softRestart(from: s)
            return nil
        }

        // 1. Velocidad vertical, centrada. Ni el sesgo del acelerómetro ni el
        //    arranque a mitad de gesto pueden dejarla con una continua: si la
        //    dejaran, el signo se queda fijo y no hay ni un cruce por cero — que es
        //    exactamente cómo el contador daba cero repeticiones (11-ago).
        let a = aVert - bias
        velocity += a * dt
        velocityDC += min(1, dt / max(0.2, tuning.velocityHighPassTauS)) * (velocity - velocityDC)
        let v = velocity - velocityDC

        // 2. ¿Quieta? Entonces se aprende el offset del acelerómetro. Muy despacio:
        //    el punto de giro de una repetición lenta también parece reposo.
        let primed = (s.t - (firstT ?? s.t)) >= tuning.biasPrimeS
        let quiet = abs(v) < tuning.stillVelocity && abs(a) < tuning.stillAccel
        var settled = false
        if quiet {
            let tau = primed ? tuning.biasTauS : 0.25
            bias += min(1, dt / max(0.05, tau)) * (aVert - bias)
            if stillSince == nil { stillSince = s.t }
            if let since = stillSince, s.t - since > tuning.stillAnchorS {
                // Muñeca parada de verdad: la velocidad se ancla a cero. Sin esto,
                // el filtro que le quita la continua sobrepasa durante la pausa
                // entre repeticiones e invita a un tramo FANTASMA de signo
                // contrario — con 2 s de pausa arriba solo contaba la primera.
                velocity = velocityDC
                settled = true
            }
        } else {
            stillSince = nil
        }

        // 4. Tramos por cruce de cero con banda muerta.
        let sign = v > tuning.velocityDeadband ? 1
                 : (v < -tuning.velocityDeadband ? -1 : 0)
        recent.append((t: s.t, aVert: a, ax: s.ax, ay: s.ay, az: s.az))
        while let head = recent.first, s.t - head.t > tuning.maxCycleS { recent.removeFirst() }

        var closed: SensorRepEvent?
        // Un tramo acaba por cambio de sentido, o porque la muñeca se paró: la
        // pausa arriba de la barra cierra la subida, no la alarga.
        let boundary = (sign != 0 && sign != currentSign) || (settled && currentSign != 0)
        if boundary {
            let closeAt = settled ? (stillSince ?? s.t) : s.t
            if currentSign != 0, let t0 = phaseStart, closeAt - t0 >= tuning.minPhaseS,
               closeAt - t0 <= tuning.maxPhaseS {
                closed = accept(phase: Phase(sign: currentSign, t0: t0, t1: closeAt))
            } else if currentSign != 0 {
                trace(String(format: "fase: dura %.2f s", closeAt - (phaseStart ?? closeAt)))
                pending = nil
            }
            currentSign = settled ? 0 : sign
            phaseStart = closeAt
        }

        // Un tramo eterno no es una repetición: se descarta.
        if let t0 = phaseStart, s.t - t0 > tuning.maxPhaseS {
            currentSign = 0
            phaseStart = nil
            pending = nil
        }

        // 5. Máquina de orientación — solo si la traslación no está contando.
        if closed == nil, let rep = pushAngle(s) { closed = rep }
        return closed
    }

    // MARK: - Traslación

    /// Empareja el tramo con el anterior: ida y vuelta = una repetición. Las
    /// amplitudes NO salen del cruce de cero (que puede caer descentrado y partía
    /// un press de banca en 0,21 + 0,53 m): salen de la curva de posición del
    /// ciclo entero, donde el fondo es el mínimo y el bloqueo es el máximo.
    private mutating func accept(phase: Phase) -> SensorRepEvent? {
        guard let previous = pending else { pending = phase; return nil }
        pending = phase
        guard phase.t0 - lastCloseAt >= tuning.refractoryS else { return nil }
        guard previous.sign == -phase.sign, phase.t0 - previous.t1 < 1.0 else { return nil }

        let cycle = phase.t1 - previous.t0
        guard cycle >= tuning.minCycleS, cycle <= tuning.maxCycleS else {
            trace(String(format: "par: ciclo %.2f s", cycle)); return nil
        }
        guard let shape = cycleShape(from: previous.t0, to: phase.t1) else {
            trace("par: sin curva"); return nil
        }

        let short = min(shape.ascentM, shape.descentM)
        let long = max(shape.ascentM, shape.descentM)
        guard short >= tuning.minRomM, long <= tuning.maxRomM else {
            trace(String(format: "par: rom %.3f/%.3f", shape.descentM, shape.ascentM)); return nil
        }
        guard long > 0, short / long >= tuning.romRatioMin else {
            trace(String(format: "par: asimétrico %.3f/%.3f", shape.descentM, shape.ascentM)); return nil
        }

        // ¿Era esto vertical? Si no, no se entrega número: ahí un remo sentado y un
        // brazo balanceándose son la misma señal.
        let verticalShare = min(1, (shape.ascentM + shape.descentM) / max(1e-6, shape.pathM))
        guard verticalShare >= tuning.verticalShareMin else {
            trace(String(format: "par: vertical %.2f", verticalShare)); return nil
        }

        let concentricMs = shape.concentricSeconds > 0.05
            ? shape.ascentM / shape.concentricSeconds : 0

        let romScore = min(1, short / 0.30)
        let symScore = short / long
        let cadenceScore = cadenceConsistency(cycle: cycle)
        var confidence = 0.40 * romScore + 0.35 * symScore + 0.25 * cadenceScore
        confidence = max(0, min(1, confidence * verticalShare.squareRootClamped))

        let index = reps.count + 1
        // Primera repetición de la serie: no hay cadencia con la que compararla,
        // así que se entrega como estimación aunque la geometría sea limpia.
        let level: RepConfidenceLevel = (confidence >= tuning.countedConfidence && index >= 2)
            ? .counted : .doubtful

        let event = SensorRepEvent(
            index: index,
            closedAt: phase.t1,
            concentricMs: concentricMs,
            peakMs: shape.peakMs,
            romMeters: shape.ascentM,
            concentricSeconds: shape.concentricSeconds,
            cycleSeconds: cycle,
            confidence: confidence,
            level: level
        )
        reps.append(event)
        note(String(format: "rep %d · %.0f cm · %.2f m/s · conf %.2f · ciclo %.1fs · %@",
                    index, shape.ascentM * 100, concentricMs, confidence, cycle, level.rawValue))
        lastCloseAt = phase.t1
        pending = nil
        anchorGravity = nil
        angleOut = false
        anglePeakDeg = 0
        return event
    }

    /// Reconstruye la posición vertical del ciclo y lee su forma. La velocidad se
    /// fuerza a cero en los dos extremos (tendencia quitada) — los dos anclajes por
    /// repetición que pide el plan — y de ahí sale el recorrido en metros.
    private func cycleShape(from t0: Double, to t1: Double) -> CycleShape? {
        let window = recent.filter { $0.t >= t0 && $0.t <= t1 }
        guard window.count >= 8 else { return nil }
        let times = window.map(\.t)
        let vz = Self.detrend(window.map(\.aVert), times: times)

        // Posición: integral de la velocidad, muestra a muestra.
        var pos = [Double](repeating: 0, count: vz.count)
        for i in 1..<vz.count {
            pos[i] = pos[i - 1] + vz[i] * (times[i] - times[i - 1])
        }
        // La forma se lee sin preguntar si bajó o subió primero: la MAYOR SUBIDA y
        // la MAYOR BAJADA de la curva. Preguntarlo por la posición de los extremos
        // fallaba justo cuando el ciclo arranca arriba (el máximo cae en la primera
        // muestra y la subida salía cero).
        var bestRise = 0.0, riseFrom = 0, riseTo = 0
        var minSoFar = pos[0], minAt = 0
        for i in pos.indices {
            if pos[i] - minSoFar > bestRise {
                bestRise = pos[i] - minSoFar
                riseFrom = minAt
                riseTo = i
            }
            if pos[i] < minSoFar { minSoFar = pos[i]; minAt = i }
        }
        var bestFall = 0.0
        var maxSoFar = pos[0]
        for value in pos {
            if maxSoFar - value > bestFall { bestFall = maxSoFar - value }
            if value > maxSoFar { maxSoFar = value }
        }

        let ascentM = bestRise
        let descentM = bestFall
        let concentricRange = riseFrom..<max(riseFrom + 1, riseTo)
        let concentricSeconds = times[min(riseTo, times.count - 1)] - times[riseFrom]
        let peak = vz[concentricRange].map(abs).max() ?? 0

        let dx = integrate(Self.detrend(window.map(\.ax), times: times), times: times)
        let dy = integrate(Self.detrend(window.map(\.ay), times: times), times: times)
        let dz = integrate(Self.detrend(window.map(\.az), times: times), times: times)
        // Recorrido 3D del ciclo: ida + vuelta, como las amplitudes verticales.
        let path = 2 * sqrt(dx * dx + dy * dy + dz * dz)

        return CycleShape(ascentM: max(0, ascentM), descentM: max(0, descentM),
                          concentricSeconds: max(0, concentricSeconds),
                          peakMs: peak, pathM: max(1e-6, path))
    }

    private func cadenceConsistency(cycle: Double) -> Double {
        let cycles = reps.suffix(3).map(\.cycleSeconds).filter { $0 > 0 }
        guard !cycles.isEmpty else { return 0.75 }   // sin referencia: ni premio ni castigo
        let reference = cycles.reduce(0, +) / Double(cycles.count)
        guard reference > 0 else { return 0.75 }
        return max(0, min(1, 1 - abs(cycle - reference) / reference))
    }

    // MARK: - Orientación (manos fijas: dominadas, fondos, flexiones)

    private mutating func pushAngle(_ s: SensorSample) -> SensorRepEvent? {
        guard s.hasGravity else { return nil }
        let g = gravityUnit(s)
        guard let anchor = anchorGravity else {
            anchorGravity = g
            return nil
        }
        let dot = max(-1, min(1, anchor.0 * g.0 + anchor.1 * g.1 + anchor.2 * g.2))
        let deg = acos(dot) * 180 / .pi

        if !angleOut {
            // Sin excursión abierta y pegado al ancla: se corrige la deriva de la
            // postura muy despacio, sin comerse ninguna excursión.
            if deg < 6 {
                let k = 0.02
                let bx = anchor.0 + k * (g.0 - anchor.0)
                let by = anchor.1 + k * (g.1 - anchor.1)
                let bz = anchor.2 + k * (g.2 - anchor.2)
                let m = sqrt(bx * bx + by * by + bz * bz)
                if m > 0.5 { anchorGravity = (bx / m, by / m, bz / m) }
            }
            if deg >= tuning.minAngleDeg {
                angleOut = true
                angleOutStart = s.t
                anglePeakDeg = deg
            }
            return nil
        }
        anglePeakDeg = max(anglePeakDeg, deg)
        // Vuelta al ancla → excursión cerrada.
        guard deg <= tuning.minAngleDeg * 0.4 else { return nil }
        angleOut = false
        let angleStart = angleOutStart
        let cycle = s.t - angleStart
        let anglePeak = anglePeakDeg
        anglePeakDeg = 0
        guard cycle >= tuning.minCycleS, cycle <= tuning.maxCycleS,
              s.t - lastCloseAt >= tuning.refractoryS else { return nil }
        // MANOS FIJAS: la muñeca giró, pero ¿viajó? Si viajó, esto no es una
        // dominada — es un curl (lo cuenta la traslación, con su velocidad) o es
        // un brazo balanceándose al andar (y no es una repetición de nada).
        let traveled = pathTraveled(from: angleStart, to: s.t)
        guard traveled < tuning.handsFixedPathM else {
            trace(String(format: "giro: la muñeca viajó %.2f m", traveled)); return nil
        }

        // Sin traslación no hay metros ni m/s honestos: se cuenta, no se mide.
        let index = reps.count + 1
        let event = SensorRepEvent(
            index: index,
            closedAt: s.t,
            concentricMs: 0,
            peakMs: 0,
            romMeters: 0,
            concentricSeconds: 0,
            cycleSeconds: cycle,
            confidence: 0.45 * cadenceConsistency(cycle: cycle) + 0.15,
            level: .doubtful
        )
        reps.append(event)
        note(String(format: "rep %d por giro · %.0f° · ciclo %.1fs · sin m/s",
                    index, anglePeak, cycle))
        lastCloseAt = s.t
        pending = nil
        return event
    }

    // MARK: - Utilidades

    private mutating func softRestart(from s: SensorSample) {
        velocity = 0
        velocityDC = 0
        currentSign = 0
        phaseStart = nil
        pending = nil
        bias = s.verticalAccel ?? bias
        anchorGravity = gravityUnit(s)
        angleOut = false
        anglePeakDeg = 0
    }

    /// Recorrido 3D de la muñeca entre dos instantes, con el mismo anclaje de
    /// velocidad a cero que se usa por tramo.
    private func pathTraveled(from t0: Double, to t1: Double) -> Double {
        let window = recent.filter { $0.t >= t0 && $0.t <= t1 }
        guard window.count >= 4 else { return 0 }
        let times = window.map(\.t)
        let dx = integrate(Self.detrend(window.map(\.ax), times: times), times: times)
        let dy = integrate(Self.detrend(window.map(\.ay), times: times), times: times)
        let dz = integrate(Self.detrend(window.map(\.az), times: times), times: times)
        return sqrt(dx * dx + dy * dy + dz * dz)
    }

    /// Por qué NO se contó la última excursión candidata, y una traza acotada de lo
    /// que fue pasando. Se guarda, no se imprime: la publica quien la quiera —el
    /// reloj la manda al teléfono y allí sí va a la consola— y los tests la leen.
    /// Sin esto, una serie que el atleta hizo y el reloj no vio es indiagnosticable.
    private(set) var lastRejection: String?
    private(set) var trace: [String] = []
    /// Tope de la traza: interesa lo ÚLTIMO, que es donde está el fallo que se acaba
    /// de ver.
    static let maxTrace = 60

    /// Vacía la traza acumulada (la lee quien la va a publicar).
    mutating func drainTrace() -> [String] {
        let out = trace
        trace = []
        return out
    }

    private mutating func trace(_ message: String) {
        lastRejection = message
        note(message)
    }

    private mutating func note(_ line: String) {
        trace.append(line)
        if trace.count > Self.maxTrace { trace.removeFirst(trace.count - Self.maxTrace) }
    }

    private func gravityUnit(_ s: SensorSample) -> (Double, Double, Double) {
        let m = s.gravityMagnitude
        guard m > 0.5 else { return (0, 0, -1) }
        return (s.grx / m, s.gry / m, s.grz / m)
    }

    /// Integra la aceleración y le quita la tendencia lineal para que la velocidad
    /// sea CERO en los dos extremos del tramo. Es el anclaje que mata la deriva.
    static func detrend(_ accel: [Double], times: [Double]) -> [Double] {
        guard accel.count == times.count, accel.count >= 2 else { return accel.map { _ in 0 } }
        var v = [Double](repeating: 0, count: accel.count)
        for i in 1..<accel.count {
            v[i] = v[i - 1] + accel[i] * (times[i] - times[i - 1])
        }
        let total = times[times.count - 1] - times[0]
        guard total > 0 else { return v }
        let end = v[v.count - 1]
        for i in v.indices {
            v[i] -= end * (times[i] - times[0]) / total
        }
        return v
    }

    private func detrendedVelocity(_ accel: [Double], times: [Double]) -> [Double] {
        Self.detrend(accel, times: times)
    }

    private func integrate(_ velocity: [Double], times: [Double]) -> Double {
        guard velocity.count == times.count, velocity.count >= 2 else { return 0 }
        var sum = 0.0
        for i in 1..<velocity.count {
            sum += velocity[i] * (times[i] - times[i - 1])
        }
        return sum
    }
}

private extension Double {
    /// Raíz acotada a [0,1] — suaviza el castigo por recorrido poco vertical.
    var squareRootClamped: Double { Swift.max(0, Swift.min(1, self)).squareRoot() }
}
