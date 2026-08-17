import Foundation

// REPRODUCIR UNA SERIE REAL CONTRA EL CONTADOR.
//
// El reloj archiva la señal inercial de la sesión (formato FHSC) y la manda al
// teléfono al cerrar el entreno. Este programa lee ese archivo y pasa cada
// ventana etiquetada por el MISMO `RepTracker` que corre en la muñeca, contando
// en voz alta: cuántas repeticiones cierra, con qué recorrido y qué velocidad, y
// por qué descarta lo que descarta.
//
// Existe porque validar el contador contra señal sintética no basta: pasa wall
// balls de laboratorio y suspende un back squat de verdad. Con el archivo del
// gimnasio se puede iterar el algoritmo cuantas veces haga falta sin pedirle al
// atleta que repita la serie.
//
// Cómo se compila y se usa (desde la raíz del repo):
//
//   S=ios/FAHYBRIKCore/Sensor
//   swiftc -O -o /tmp/replay $S/SensorTypes.swift $S/SensorDecimator.swift \
//       $S/ActivityDetector.swift $S/RepTracker.swift ios/tools/replay-sensor/main.swift
//   /tmp/replay <captura.fhsc>            # una serie por ventana
//   /tmp/replay <captura.fhsc> --muestras # + volcado de la vertical, para mirarla
//   /tmp/replay --sintetico /tmp/test.fhsc  # escribe un archivo de prueba
//
// Cómo se saca el archivo del iPhone (con el cable puesto):
//
//   xcrun devicectl list devices
//   xcrun devicectl device info files --device <UDID> \
//       --domain-type appDataContainer --domain-identifier com.fahybrid.app \
//       --username mobile
//   xcrun devicectl device copy from --device <UDID> \
//       --domain-type appDataContainer --domain-identifier com.fahybrid.app \
//       --source Library/Application\ Support/sensor-captures --destination ./capturas

let args = Array(CommandLine.arguments.dropFirst())

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data(("error: " + message + "\n").utf8))
    exit(1)
}

// MARK: - Generador de archivo de prueba (para verificar el propio reproductor)

func escribirSintetico(to path: String) {
    let hz = 50.0
    var samples: [SensorSample] = []
    var seed: UInt64 = 7
    func noise(_ amp: Double) -> Double {
        seed = seed &* 6364136223846793005 &+ 1442695040888963407
        return (Double(seed >> 33) / Double(UInt64(1) << 31) - 1) * amp
    }
    // 3 s quieto + 6 sentadillas de 45 cm a 3,5 s + 4 s quieto
    let rom = 0.45, cycle = 3.5, reps = 6.0
    func z(_ t: Double) -> Double {
        let u = t - 3
        guard u >= 0, u < reps * cycle else { return 0 }
        let k = floor(u / cycle)
        return -rom * 0.5 * (1 - cos(2 * .pi * (u - k * cycle) / cycle))
    }
    let dt = 1 / hz
    let total = 3 + reps * cycle + 4
    for i in 0..<Int(total * hz) {
        let t = Double(i) * dt
        let a = (z(t - dt) - 2 * z(t) + z(t + dt)) / (dt * dt)
        // Reloj girado: el gesto se reparte y la gravedad también.
        samples.append(SensorSample(
            t: t,
            ax: 0.55 * a + noise(0.15), ay: 0.2 * a + noise(0.15), az: 0.81 * a + noise(0.15),
            gx: 0, gy: 0, gz: 0,
            grx: -0.55, gry: -0.2, grz: -0.81
        ))
    }
    let iso = "2026-08-11T21:00:00.000Z"
    let header = SensorFileHeader(
        formatVersion: Int(SensorFileFormat.version),
        executionLocalId: "sintetico",
        startedAt: iso,
        sampleHz: hz,
        channels: SensorFileFormat.channels,
        captureMode: "classic",
        watchModel: "sintetico",
        wrist: nil,
        appVersion: nil,
        windows: [SensorWindowLabel(t0: 2.5, t1: total - 3.5, tramoId: "s1", exerciseId: nil,
                                    modality: "strength", movementName: "Back squat")],
        sampleCount: samples.count
    )
    guard let data = try? SensorFileCodec.encode(header: header, samples: samples) else {
        fail("no se pudo codificar el archivo sintético")
    }
    do { try data.write(to: URL(fileURLWithPath: path)) } catch { fail("\(error)") }
    print("escrito \(path) · \(samples.count) muestras · \(data.count) bytes")
}

if args.first == "--sintetico" {
    guard args.count >= 2 else { fail("uso: --sintetico <destino.fhsc>") }
    escribirSintetico(to: args[1])
    exit(0)
}

// MARK: - Reproducción

guard let path = args.first else {
    fail("uso: replay <captura.fhsc> [--muestras] | --sintetico <destino>")
}
guard let data = FileManager.default.contents(atPath: path) else {
    fail("no puedo leer \(path)")
}
let volcarMuestras = args.contains("--muestras")
// Los archivos v1 no traen gravedad y sin eje vertical no se cuenta nada. Con esto
// se APROXIMA el eje del gesto por su componente principal, para poder mirar la
// geometría de una serie ya grabada. Es un apaño de diagnóstico, no el mecanismo:
// el eje principal de una muñeca andando es el balanceo del brazo, y por eso en
// producción la gravedad es obligatoria.
let ejeEstimado = args.contains("--eje-estimado")

/// Componente principal de la aceleración (power iteration arrancando por el eje de
/// más varianza — arrancar por (1,0,0) no converge si X no varía).
func ejePrincipal(_ ss: [SensorSample]) -> (Double, Double, Double) {
    let n = Double(ss.count)
    let mx = ss.reduce(0.0) { $0 + $1.ax } / n
    let my = ss.reduce(0.0) { $0 + $1.ay } / n
    let mz = ss.reduce(0.0) { $0 + $1.az } / n
    var cxx = 0.0, cxy = 0.0, cxz = 0.0, cyy = 0.0, cyz = 0.0, czz = 0.0
    for s in ss {
        let x = s.ax - mx, y = s.ay - my, z = s.az - mz
        cxx += x * x; cxy += x * y; cxz += x * z
        cyy += y * y; cyz += y * z; czz += z * z
    }
    var v = cxx >= cyy && cxx >= czz ? (1.0, 0.0, 0.0)
          : (cyy >= czz ? (0.0, 1.0, 0.0) : (0.0, 0.0, 1.0))
    for _ in 0..<24 {
        let nx = cxx * v.0 + cxy * v.1 + cxz * v.2
        let ny = cxy * v.0 + cyy * v.1 + cyz * v.2
        let nz = cxz * v.0 + cyz * v.1 + czz * v.2
        let norm = (nx * nx + ny * ny + nz * nz).squareRoot()
        if norm < 1e-9 { break }
        v = (nx / norm, ny / norm, nz / norm)
    }
    return v
}

let decoded: SensorFileCodec.Decoded
do { decoded = try SensorFileCodec.decode(data) } catch { fail("archivo ilegible: \(error)") }

let h = decoded.header
let samples = decoded.samples
let span = (samples.last?.t ?? 0) - (samples.first?.t ?? 0)
let conGravedad = samples.filter(\.hasGravity).count
print("""
ARCHIVO   \(path)
formato   v\(h.formatVersion) · \(h.channels.count) canales · \(Int(h.sampleHz)) Hz · \(h.captureMode)
reloj     \(h.watchModel ?? "?") · app \(h.appVersion ?? "?") · muñeca \(h.wrist ?? "?")
señal     \(samples.count) muestras · \(String(format: "%.1f", span)) s
gravedad  \(conGravedad) de \(samples.count) muestras \(conGravedad == 0 ? "← SIN GRAVEDAD: build vieja del reloj, no se puede contar" : "")
ventanas  \(h.windows.count)
""")

if let notes = h.notes, !notes.isEmpty {
    // La historia que el propio reloj dejó escrita: por qué abrió (o no abrió) una
    // serie, y qué decidió en cada excursión.
    print("\nLO QUE CONTÓ EL RELOJ (cabecera del archivo)")
    for n in notes { print("   \(n)") }
}

if h.windows.isEmpty {
    print("""
    · No hay ventanas etiquetadas: o la build del reloj es anterior al sellado de
      series, o el entreno no abrió ninguna. Se recorre el archivo entero como una
      sola serie, que cuenta de más por definición (incluye colocarse y descansar).
    """)
}

struct Ventana {
    let t0: Double
    let t1: Double
    let nombre: String
    let modalidad: String?
}

let ventanas: [Ventana] = h.windows.isEmpty
    ? [Ventana(t0: samples.first?.t ?? 0, t1: samples.last?.t ?? 0,
               nombre: "TODO EL ARCHIVO", modalidad: nil)]
    : h.windows.map { w in
        Ventana(t0: w.t0, t1: w.t1 ?? (samples.last?.t ?? w.t0),
                nombre: w.movementName ?? w.tramoId ?? "serie", modalidad: w.modality)
    }

for (i, v) in ventanas.enumerated() {
    let dentro = samples.filter { $0.t >= v.t0 && $0.t <= v.t1 }
    let cuenta = SensorPipelineCountability.countsReps(modality: v.modalidad)
    print("""

    ── serie \(i + 1)/\(ventanas.count) · \(v.nombre) · \(v.modalidad ?? "modalidad ?") \
    · \(String(format: "%.1f", v.t1 - v.t0)) s · \(dentro.count) muestras \
    \(cuenta ? "" : "· NO se cuenta esta modalidad")
    """)
    guard cuenta, dentro.count >= 40 else { continue }

    var muestras = dentro
    if ejeEstimado, dentro.contains(where: { !$0.hasGravity }) {
        let eje = ejePrincipal(dentro)
        print(String(format: "   eje estimado (%.2f, %.2f, %.2f) — aproximación de diagnóstico",
                     eje.0, eje.1, eje.2))
        muestras = dentro.map {
            SensorSample(t: $0.t, ax: $0.ax, ay: $0.ay, az: $0.az,
                         gx: $0.gx, gy: $0.gy, gz: $0.gz,
                         grx: -eje.0, gry: -eje.1, grz: -eje.2)
        }
    }
    var tracker = RepTracker()
    for s in muestras { tracker.push(s) }

    for line in tracker.trace { print("   \(line)") }
    let vs = tracker.reps.filter { $0.concentricMs > 0 }.map(\.concentricMs)
    print(String(format: "   ⇒ %d repeticiones · confianza %.2f · nivel %@%@",
                 tracker.count, tracker.confidence, tracker.level.rawValue,
                 vs.isEmpty ? "" : String(format: " · m/s %.2f→%.2f",
                                          vs.first ?? 0, vs.last ?? 0)))

    // CÓMO SE MOVIÓ LA MUÑECA, sin integrar nada: el pico y el valor eficaz de la
    // aceleración vertical, y cuánto basculó la gravedad respecto a su media. Los
    // tres dicen a qué se parece el gesto antes de creerse ningún metro: una barra a
    // la espalda deja el antebrazo casi fijo (pocos grados) y un squat controlado no
    // pasa de 2-3 m/s²; decenas de grados o cinco g son otra cosa.
    let verticales = dentro.compactMap(\.verticalAccel)
    if !verticales.isEmpty {
        let pico = verticales.map(abs).max() ?? 0
        let rms = (verticales.reduce(0) { $0 + $1 * $1 } / Double(verticales.count)).squareRoot()
        var mg = (0.0, 0.0, 0.0)
        for s in dentro where s.hasGravity {
            let m = s.gravityMagnitude
            mg = (mg.0 + s.grx / m, mg.1 + s.gry / m, mg.2 + s.grz / m)
        }
        let n = Double(max(1, dentro.filter(\.hasGravity).count))
        var media = (mg.0 / n, mg.1 / n, mg.2 / n)
        let mm = (media.0 * media.0 + media.1 * media.1 + media.2 * media.2).squareRoot()
        if mm > 0.1 { media = (media.0 / mm, media.1 / mm, media.2 / mm) }
        let angulos = dentro.filter(\.hasGravity).map { s -> Double in
            let m = s.gravityMagnitude
            let d = max(-1, min(1, (s.grx / m) * media.0 + (s.gry / m) * media.1 + (s.grz / m) * media.2))
            return acos(d) * 180 / .pi
        }.sorted()
        let p95 = angulos[Int(Double(angulos.count - 1) * 0.95)]
        print(String(format: "   señal: pico %.1f m/s² · eficaz %.2f · la muñeca basculó hasta %.0f°",
                     pico, rms, p95))
    }

    // Trabajo y descanso. En una serie contable manda lo que dicen las
    // repeticiones (es lo que hace el vivo); el detector por energía se imprime al
    // lado porque su discrepancia es información: si dice 0 s con seis
    // repeticiones cerradas, su umbral no sirve para ese movimiento.
    let work = tracker.reps.reduce(0.0) { $0 + max(0, $1.cycleSeconds) }
    let span = v.t1 - v.t0
    let energia = ActivityDetector().analyze(dentro)
    print(String(format: "   trabajo %.1f s · descanso %.1f s (por repeticiones) · por energía: %.1f s",
                 min(work, span), max(0, span - work), energia.workSeconds))

    if volcarMuestras {
        print("   t,vertical_m_s2")
        for s in dentro {
            guard let a = s.verticalAccel else { continue }
            print(String(format: "   %.2f,%.3f", s.t, a))
        }
    }
}

/// La regla de qué modalidades se cuentan vive en `SensorPipeline`, que es
/// @MainActor y arrastra el resto del target. Aquí se replica la ÚNICA línea que
/// hace falta, marcada para que nadie la crea la fuente.
enum SensorPipelineCountability {
    static func countsReps(modality: String?) -> Bool {
        switch modality?.lowercased() {
        case "run", "row", "ski", "bike", "mobility": return false
        default: return true
        }
    }
}
