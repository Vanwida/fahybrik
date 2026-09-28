import Foundation
@testable import FAHYBRIK

// LOS PLANES DE CORRER DEL CONTRATO — las sesiones de `screens/iphone-vivo-correr`
// (y de `reloj-correr/planes.ts`) escritas como las escribe el servidor: el
// `prescription_json` del coach con su gramática de carrera (`structure`, #61)
// y los campos planos de siempre al lado. Mismo decodificador que la app
// (`VivoPlanesDePrueba.plan`), cero mocks.
//
// Lo que la gramática NO puede decir y el plan del doble sí, se dice aquí:
//   · 551 y 538 traen la última recuperación dentro del «repetir ×N» (el doble
//     la quita en la última serie): un «repetir» repite su cuerpo entero.
//   · El libre usa lo que el constructor libre escribe (`FreeRunPlan`): un
//     ritmo es UN valor (3:50), no una banda. Es la única diferencia con el del
//     coach, y es del constructor, no del vivo.
extension VivoPlanesDePrueba {

    // MARK: - La gramática, en JSON del servidor

    enum Tramo {
        static func trabajo(metros m: Int, _ objetivo: String? = nil, cuesta: Double? = nil) -> String { seg("work", "{ \"type\": \"distance\", \"m\": \(m) }", objetivo, cuesta: cuesta) }
        static func trabajo(segundos s: Int, _ objetivo: String? = nil, cuesta: Double? = nil) -> String { seg("work", "{ \"type\": \"duration\", \"s\": \(s) }", objetivo, cuesta: cuesta) }
        static func recupera(segundos s: Int, modo: String, _ objetivo: String? = nil) -> String {
            seg("recovery", "{ \"type\": \"duration\", \"s\": \(s) }", objetivo, modo: modo)
        }
        static func repetir(_ veces: Int, _ elementos: [String]) -> String { "{ \"times\": \(veces), \"elements\": [\(elementos.joined(separator: ","))] }" }
        static func ritmo(_ min: Int, _ max: Int? = nil) -> String {
            max.map { "{ \"type\": \"pace\", \"min_s\": \(min), \"max_s\": \($0) }" } ?? "{ \"type\": \"pace\", \"value_s\": \(min) }"
        }
        static func zona(_ z: Int) -> String { "{ \"type\": \"hr_zone\", \"zone\": \(z) }" }
        static func rpe(_ v: Double) -> String { "{ \"type\": \"rpe\", \"value\": \(v) }" }

        private static func seg(_ kind: String, _ medida: String, _ objetivo: String?, cuesta: Double? = nil, modo: String? = nil) -> String {
            var partes = ["\"kind\": \"\(kind)\"", "\"measure\": \(medida)"]
            if let objetivo { partes.append("\"target\": \(objetivo)") }
            if let cuesta { partes.append("\"incline_pct\": \(cuesta)") }
            if let modo { partes.append("\"recovery_mode\": \"\(modo)\"") }
            return "{ " + partes.joined(separator: ", ") + " }"
        }
    }

    /// Una fase de la gramática: `warmup`, `main` o `cooldown`.
    static func fase(_ rol: String, _ elementos: [String]) -> String { "{ \"role\": \"\(rol)\", \"elements\": [\(elementos.joined(separator: ","))] }" }

    /// El ítem de carrera con su gramática y, al lado, los campos planos.
    static func carrera(_ uid: String, scheme: String, fases: [String], planos: String) -> String {
        item(uid, "Carrera", cat: "running", rx: "{ \"scheme\": \"\(scheme)\", \"modality\": \"run\", \(planos), \"structure\": [\(fases.joined(separator: ","))] }")
    }

    // MARK: - Las sesiones

    /// El caso ilustrativo del modelo: calentamiento 15′ · 6 × (1000 m a 3:45–3:55 / 90″ trote) · vuelta a la calma 10′.
    static func seisPorMilCompleto() throws -> WorkoutPlan {
        let fases = [
            fase("warmup", [Tramo.trabajo(segundos: 900)]),
            fase("main", [Tramo.repetir(6, [Tramo.trabajo(metros: 1000, Tramo.ritmo(225, 235)), Tramo.recupera(segundos: 90, modo: "trote")])]),
            fase("cooldown", [Tramo.trabajo(segundos: 600)]),
        ]
        let planos = "\"rounds\": 6, \"rest_s\": 90, \"sets\": [\(set(metros(1000), target: ritmoKm(225, 235), rest: 90))]"
        return try plan("6 × 1000", [bloque("Series 6×1000", formato: "intervals", pos: 1, [carrera("c1", scheme: "intervals", fases: fases, planos: planos)])])
    }

    /// El mismo 6 × 1000 escrito en el constructor libre (`FreeRunPlan.estructura()`): el ritmo es un valor, 3:50.
    static func libreSeisPorMil() throws -> WorkoutPlan {
        let fases = [
            fase("warmup", [Tramo.trabajo(segundos: 900)]),
            fase("main", [Tramo.repetir(6, [Tramo.trabajo(metros: 1000, Tramo.ritmo(230)), Tramo.recupera(segundos: 90, modo: "trote")])]),
            fase("cooldown", [Tramo.trabajo(segundos: 600)]),
        ]
        let planos = "\"rounds\": 6, \"rest_s\": 90, \"sets\": [\(set(metros(1000), target: ritmoKm(230), rest: 90))]"
        return try plan("Mi 6 × 1000", [bloque("6×1000", formato: "intervals", pos: 1, [carrera("c1", scheme: "intervals", fases: fases, planos: planos)])])
    }

    /// 491 · Rodaje 50′ a Z2 · Movilidad 15′.
    static func sesion491() throws -> WorkoutPlan {
        let rodaje = "{ \"scheme\": \"steady\", \"modality\": \"run\", \"sets\": [\(set(segs(3000), target: zona(2)))] }"
        let movilidad = "{ \"scheme\": \"steady\", \"modality\": \"mobility\", \"sets\": [\(set(segs(900)))] }"
        return try plan("Rodaje Z2 50′", [
            bloque("Carrera continua", formato: "steady", pos: 1, [item("r1", "Carrera", cat: "running", rx: rodaje)]),
            bloque("Movilidad", formato: "steady", pos: 2, [item("m1", "Movilidad", cat: "mobility", rx: movilidad)]),
        ])
    }

    /// 494 · Tirada 80′ a Z2.
    static func sesion494() throws -> WorkoutPlan {
        let rx = "{ \"scheme\": \"steady\", \"modality\": \"run\", \"sets\": [\(set(segs(4800), target: zona(2)))] }"
        return try plan("Tirada Z2 80′", [bloque("Carrera continua", formato: "steady", pos: 1, [item("t1", "Carrera", cat: "running", rx: rx)])])
    }

    /// 538 · Progresivo de 8 tramos (10′ a 5:20, luego 7 × 1′ más rápido) · 4 × (600 m / 2′ trote) · 3 × (800 m / 3′ caminando).
    static func sesion538() throws -> WorkoutPlan {
        let tramos: [(Int, Int)] = [(272, 291), (267, 286), (261, 278), (255, 270), (250, 264), (246, 258), (242, 250)]
        let progresivo = [Tramo.trabajo(segundos: 600, Tramo.ritmo(320))] + tramos.map { Tramo.trabajo(segundos: 60, Tramo.ritmo($0.0, $0.1)) }
        let fases = [
            fase("main", progresivo + [
                Tramo.repetir(4, [Tramo.trabajo(metros: 600, Tramo.ritmo(218, 229)), Tramo.recupera(segundos: 120, modo: "trote", Tramo.ritmo(400, 436))]),
                Tramo.repetir(3, [Tramo.trabajo(metros: 800, Tramo.ritmo(229, 235)), Tramo.recupera(segundos: 180, modo: "caminar")]),
            ]),
        ]
        let planos = "\"sets\": [\(set(segs(600), target: ritmoKm(320)))]"
        return try plan("Progresivo + series", [bloque("Progresivo y series", formato: "intervals", pos: 1, [carrera("p1", scheme: "intervals", fases: fases, planos: planos)])])
    }

    /// 551 · Rodaje 6000 m a Z2 · 6 × (20″ a RPE 7 / 1′ caminando).
    static func sesion551() throws -> WorkoutPlan {
        let fases = [
            fase("main", [
                Tramo.trabajo(metros: 6000, Tramo.zona(2)),
                Tramo.repetir(6, [Tramo.trabajo(segundos: 20, Tramo.rpe(7)), Tramo.recupera(segundos: 60, modo: "caminar")]),
            ]),
        ]
        let planos = "\"sets\": [\(set(metros(6000), target: zona(2)))]"
        return try plan("Rodaje + strides", [bloque("Rodaje y strides", formato: "intervals", pos: 1, [carrera("s1", scheme: "intervals", fases: fases, planos: planos)])])
    }

    /// Ilustrativo: calentamiento 10′ · tempo 20′ a 4:15–4:25 al 1 % · vuelta a la calma 5′, en cinta.
    static func tempoCinta() throws -> WorkoutPlan {
        let fases = [
            fase("warmup", [Tramo.trabajo(segundos: 600)]),
            fase("main", [Tramo.trabajo(segundos: 1200, Tramo.ritmo(255, 265), cuesta: 1)]),
            fase("cooldown", [Tramo.trabajo(segundos: 300)]),
        ]
        let planos = "\"sets\": [\(set(segs(1200), target: ritmoKm(255, 265)))]"
        return try plan("Tempo en cinta", [bloque("Tempo 20′", formato: "steady", pos: 1, [carrera("k1", scheme: "steady", fases: fases, planos: planos)])])
    }
}

// MARK: - Los escenarios del contrato, con el motor de verdad

/// Un escenario de `iphone-vivo-correr` montado sobre `WorkoutSession`: el plan
/// real, el cursor del motor movido con sus propios gestos (`runStructurePrimary`)
/// y las lecturas metidas por sus puertas de siempre (`sampleRunDistance` de
/// Salud, `injectLiveHR` de la banda, `sampleRunCadence` del podómetro,
/// `sampleTreadmillDistance` de la cinta). Lo que el motor no ve (el estado del
/// GPS, el ritmo de la banda de la cinta, la ruta) va aparte, en `fuera`.
struct EscenarioCorrer {
    struct Fuera {
        var gps: Vivo.EstadoGps = .listo
        var ritmoCinta: Double? = nil
        var cintaConectada = false
        var banda = true
        var ruta: [(Double, Double)] = []
    }
    let sesion: WorkoutSession
    var fuera = Fuera()
    /// Dónde se dejó el reloj: segundos en el paso y de sesión. El motor sigue
    /// corriendo mientras se monta la vista; `ajustarReloj()` lo devuelve aquí.
    let t: Double
    let sesionT: Double

    @MainActor
    init(sesion: WorkoutSession, fuera: Fuera = Fuera()) {
        self.sesion = sesion
        self.fuera = fuera
        t = sesion.lapElapsedSeconds - sesion.runLegStartElapsed
        sesionT = sesion.elapsedSeconds
    }

    @MainActor
    func ajustarReloj(masT: Double = 0) {
        sesion.lapElapsedSeconds = sesion.runLegStartElapsed + t + masT
        sesion.elapsedSeconds = sesionT + masT
    }

    typealias P = VivoPlanesDePrueba

    /// Arranca, se salta la cuenta de arranque y avanza `pasos` pasos con el gesto del motor.
    @MainActor
    static func enElPaso(_ plan: WorkoutPlan, entorno: RunEnvironment, pasos: Int) -> WorkoutSession {
        let s = P.arranca(plan, entorno: entorno)
        s.condCountInRemaining = 0
        if s.isRunStructureActive {
            s.runStructurePrimary()                 // fuera la cuenta de arranque (GO)
            for _ in 0..<pasos { s.runStructurePrimary() }
        }
        return s
    }

    /// `t` segundos dentro del paso, `metros` corridos en él, el pulso (el último manda; ≥ 6 dan tendencia) y la cadencia.
    @MainActor
    static func dentro(_ s: WorkoutSession, t: Double, metros: Double = 0, cinta: Bool = false, ppm: [Int], cadencia: Double? = nil, sesionT: Double) {
        if metros > 0 {
            if cinta { s.sampleTreadmillDistance(deltaMeters: metros) } else { s.sampleRunDistance(deltaMeters: metros, source: .healthkit) }
        }
        s.lapElapsedSeconds = s.runLegStartElapsed + t
        s.elapsedSeconds = sesionT
        for b in ppm { s.injectLiveHR(b, source: .strap) }
        if let cadencia { s.sampleRunCadence(stepsPerMinute: cadencia) }
    }

    // Las recuperaciones bajan el pulso: seis muestras que caen.
    static func bajando(_ hasta: Int) -> [Int] { (0..<6).map { hasta + 2 * (5 - $0) } }

    @MainActor static func serieDentro(libre: Bool = false) throws -> EscenarioCorrer {
        let s = enElPaso(libre ? try P.libreSeisPorMil() : try P.seisPorMilCompleto(), entorno: .outdoor, pasos: 5)
        dentro(s, t: 87, metros: 380, ppm: [171], cadencia: 181, sesionT: 1627)
        return EscenarioCorrer(sesion: s)
    }

    @MainActor static func serieRapida() throws -> EscenarioCorrer {
        let s = enElPaso(try P.seisPorMilCompleto(), entorno: .outdoor, pasos: 5)
        dentro(s, t: 46.5, metros: 223, ppm: [172], cadencia: 181, sesionT: 1590)
        return EscenarioCorrer(sesion: s)
    }

    /// La recuperación tras la serie 3, a `t` s de sus 90″.
    @MainActor static func recuperacion(t: Double) throws -> EscenarioCorrer {
        let s = enElPaso(try P.seisPorMilCompleto(), entorno: .outdoor, pasos: 6)
        dentro(s, t: t, metros: t * 1000 / 369, ppm: bajando(128), cadencia: 166, sesionT: 1768 + t)
        return EscenarioCorrer(sesion: s)
    }

    /// La serie 4 recién empezada (`t` s): el GO en el primer segundo.
    @MainActor static func serie4(t: Double) throws -> EscenarioCorrer {
        let s = enElPaso(try P.seisPorMilCompleto(), entorno: .outdoor, pasos: 7)
        dentro(s, t: t, metros: t * 1000 / 231, ppm: [141], cadencia: 182, sesionT: 1858 + t)
        return EscenarioCorrer(sesion: s)
    }

    @MainActor static func rodajeZ2() throws -> EscenarioCorrer {
        let s = enElPaso(try P.sesion491(), entorno: .outdoor, pasos: 0)
        dentro(s, t: 756, metros: 2310, ppm: [145], cadencia: 174, sesionT: 756)
        return EscenarioCorrer(sesion: s)
    }

    @MainActor static func cinta(conectada: Bool) throws -> EscenarioCorrer {
        let s = enElPaso(try P.tempoCinta(), entorno: conectada ? .treadmill : .indoor, pasos: 1)
        dentro(s, t: 202, metros: conectada ? 777 : 0, cinta: true, ppm: [172], sesionT: 802)
        var fuera = Fuera(gps: .noAplica)
        if conectada { fuera.cintaConectada = true; fuera.ritmoCinta = 258 }
        return EscenarioCorrer(sesion: s, fuera: fuera)
    }

    /// El progresivo de 538: `tramo` 3 (a 52 s de su minuto) o 4 (recién entrado).
    @MainActor static func progresivo(tramo: Int) throws -> EscenarioCorrer {
        let s = enElPaso(try P.sesion538(), entorno: .outdoor, pasos: tramo - 1)
        if tramo == 3 { dentro(s, t: 52, metros: 188, ppm: [159], cadencia: 174, sesionT: 712) }
        else { dentro(s, t: 3, metros: 13.4, ppm: [141], cadencia: 174, sesionT: 723) }
        return EscenarioCorrer(sesion: s)
    }

    /// 551: el stride 3 (a 10 s de sus 20″) o la recuperación que lo sigue.
    @MainActor static func strides(recupera: Bool) throws -> EscenarioCorrer {
        let s = enElPaso(try P.sesion551(), entorno: .outdoor, pasos: recupera ? 6 : 5)
        if recupera { dentro(s, t: 2, metros: 3, ppm: bajando(170), sesionT: 2150) }
        else { dentro(s, t: 10, metros: 50, ppm: [154], cadencia: 181, sesionT: 2138) }
        return EscenarioCorrer(sesion: s)
    }

    /// 494: la tirada a 24′, a `metros` de la salida, con su ruta.
    @MainActor static func tirada(metros: Double) throws -> EscenarioCorrer {
        let s = enElPaso(try P.sesion494(), entorno: .outdoor, pasos: 0)
        dentro(s, t: 1452, metros: metros, ppm: [146], cadencia: 170, sesionT: 1452)
        // Un circuito de ~5 km por el parque: 60 puntos alrededor de un óvalo.
        let ruta = (0..<60).map { k -> (Double, Double) in
            let a = Double(k) / 60 * 2 * .pi
            return (41.3870 + 0.0055 * sin(a), 2.1870 + 0.0085 * cos(a))
        }
        return EscenarioCorrer(sesion: s, fuera: Fuera(ruta: ruta))
    }
}
