#if DEBUG
import SwiftUI

// EL ESCAPARATE DE LA CARA NUEVA DE CORRER (pila de la muñeca).
//
// Cada caso monta el `Vivo.EstadoVivo` de una situación del doble
// (`web/components/design-twin/screens/reloj-correr`, mismos planes y mismos
// números) y lo pinta con las MISMAS vistas del entreno (`MunecaVivo`), midiendo
// el lienzo del reloj en el que se lance. Para compararlo con la propuesta:
//
//     xcrun simctl launch <sim> com.fahybrid.app.watchkitapp -guion muneca-serie-dentro
//     xcrun simctl io <sim> screenshot serie.png
//
// Sufijos: `-datos`, `-vueltas` y `-estructura` abren esa página de la corona;
// `-atenuado` es la muñeca bajada (Always-On). Solo en DEBUG.

extension GuionEscaparate {

    static var munecaCorrer: [Caso] {
        [
            // ── El paso de correr ───────────────────────────────────────────
            muneca("muneca-serie-dentro", "Muñeca · serie 3/6 dentro de la banda") { Escena.serieDentro() },
            muneca("muneca-serie-dentro-datos", "Muñeca · Datos", pagina: .datos) { Escena.serieDentro() },
            muneca("muneca-serie-dentro-vueltas", "Muñeca · Vueltas", pagina: .vueltas) { Escena.serieDentro() },
            muneca("muneca-serie-dentro-estructura", "Muñeca · Estructura", pagina: .estructura) { Escena.serieDentro() },
            muneca("muneca-serie-dentro-atenuado", "Muñeca · Always-On", atenuado: true) { Escena.serieDentro() },
            muneca("muneca-serie-rapida", "Muñeca · serie yendo rápido (▲)") { Escena.serieRapida() },
            muneca("muneca-serie-lenta", "Muñeca · serie yendo lenta (▼)") { Escena.serieLenta() },
            muneca("muneca-serie-z5", "Muñeca · serie a zona (479)") { Escena.serieZ5() },
            muneca("muneca-recupera", "Muñeca · recuperación de 90″") { Escena.recupera() },
            muneca("muneca-cuenta", "Muñeca · 3-2-1") { Escena.cuenta() },
            muneca("muneca-go", "Muñeca · GO") { Escena.go() },
            muneca("muneca-rodaje-dentro", "Muñeca · rodaje Z2, dentro (491)") { Escena.rodaje(ppm: 145) },
            muneca("muneca-rodaje-fuera", "Muñeca · rodaje Z2, pulso alto") { Escena.rodaje(ppm: 158) },
            muneca("muneca-tirada-km", "Muñeca · tirada, tarjeta del km (494)", registro: Escena.registroDelKm()) { Escena.tirada() },
            muneca("muneca-strides", "Muñeca · stride a RPE (551)") { Escena.strides() },
            muneca("muneca-tanda-descanso", "Muñeca · descanso entre tandas (509)") { Escena.descansoTandas() },
            muneca("muneca-descanso", "Muñeca · descanso común (P8)") { Escena.descanso() },
            muneca("muneca-sin-gps", "Muñeca · el GPS aún no fija (538)") { Escena.sinGps() },
            muneca("muneca-sin-enlace", "Muñeca · sin enlace con el iPhone") { Escena.sinEnlace() },
            muneca("muneca-cinta", "Muñeca · cinta al 1 % (535)") { Escena.cinta() },
            muneca("muneca-pausa", "Muñeca · en pausa") { Escena.serieDentro(pausado: true) },
            muneca("muneca-completada", "Muñeca · sesión completada") { Escena.serieDentro(terminado: true) },
            // ── Las páginas de los lados ────────────────────────────────────
            Caso(id: "muneca-controles", titulo: "Muñeca · Controles", paginas: [], vista: { controlesDeEscaparate(pausado: false) }),
            Caso(id: "muneca-controles-pausa", titulo: "Muñeca · Controles en pausa", paginas: [], vista: { controlesDeEscaparate(pausado: true) }),
            Caso(id: "muneca-controles-terminar", titulo: "Muñeca · ¿Terminar y guardar?", paginas: [], vista: { controlesDeEscaparate(pausado: false, confirmando: true) }),
        ]
    }

    // MARK: - Montaje

    private static func muneca(_ id: String, _ titulo: String, pagina: Vivo.PaginaMuneca = .paso, atenuado: Bool = false,
                               registro: Vivo.RegistroVueltas = Vivo.RegistroVueltas(), _ escena: @escaping () -> Escena) -> Caso {
        Caso(id: id, titulo: titulo, paginas: [], vista: {
            AnyView(EscaparateMuneca(estado: escena().estado(), registro: registro, atenuado: atenuado, pagina: pagina))
        })
    }

    private static func controlesDeEscaparate(pausado: Bool, confirmando: Bool = false) -> AnyView {
        AnyView(MunecaMedidor { _ in
            MunecaControles(pausado: pausado, control: MunecaControl(titulo: "Siguiente paso", icono: .siguiente, accion: {}),
                            alPausar: {}, alTerminar: {}, alBloquear: {}, confirmando: confirmando)
        })
    }

    /// El estado de una escena, pintado con la pila de verdad y los mandos vacíos.
    private struct EscaparateMuneca: View {
        let estado: Vivo.EstadoVivo
        let registro: Vivo.RegistroVueltas
        let atenuado: Bool
        let pagina: Vivo.PaginaMuneca

        var body: some View {
            MunecaMedidor { medidas in
                MunecaVivo(
                    cuadro: Vivo.cuadroMuneca(estado, registro: registro,
                                              entorno: Vivo.EntornoMuneca(medidas: medidas, alwaysOn: atenuado, accion: .pista)),
                    alPaso: estado.paso.id,
                    mandos: MunecaMandos(pausa: {}, terminar: {},
                                         control: MunecaControl(titulo: "Siguiente paso", icono: .siguiente, accion: {}),
                                         primaria: {}, mas30: {}, empezarYa: {}),
                    paginaInicial: pagina
                )
            }
            .environment(\.isLuminanceReduced, atenuado)
        }
    }

    // MARK: - Las escenas (los números del doble, `reloj-correr/casos.ts`)

    struct Escena {
        var plan: Vivo.PlanVivo
        var i: Int
        var t: Double
        var hecho: Double? = nil
        var ritmo: Double? = nil
        var ppm: Double? = nil
        var tendencia: Vivo.Tendencia? = nil
        var gps: Vivo.EstadoGps = .listo
        var enlace: Vivo.Enlace = .solo
        var viejos: [Vivo.CampoVivo] = []
        var sesionT: Double
        var sesionM: Double? = nil
        var vueltas: [Vivo.Vuelta] = []
        var cuenta: Int? = nil
        var go = false
        var pausado = false
        var terminado = false
        /// Calle o cinta: cambia quién mide los metros (en cinta, el móvil) y el plan que sale de la sesión.
        var entorno: RunEnvironment = .outdoor

        func estado() -> Vivo.EstadoVivo {
            let paso = plan.pasos[i]
            // El motor cuenta el tiempo del paso como «lo hecho» de un paso por tiempo.
            let hechoDelPaso = paso.medida.tipo == .tiempo ? t : hecho
            let lecturas = Vivo.Lecturas(t: t, hecho: hechoDelPaso, ritmo: ritmo, ppm: ppm, ppmTendencia: tendencia, gps: gps, viejos: viejos)
            let m = sesionM
            return Vivo.EstadoVivo(
                pasos: plan.pasos, i: i, lecturas: lecturas,
                sesion: Vivo.Sesion(t: sesionT, metros: m, ritmoMedio: (m ?? 0) > 50 ? sesionT / ((m ?? 1) / 1000) : nil, ppmMedio: ppm),
                zonas: plan.zonas, reglas: plan.reglas, pausado: pausado, enlace: enlace, vueltas: vueltas,
                metrosPaso: hechoDelPaso, cuenta: cuenta, go: go, terminado: terminado
            )
        }

        // MARK: Las sesiones

        /// Las zonas de un atleta de umbral 170 ppm, las del doble (`planes.ts#ZONAS`).
        private static let zonas = Vivo.ZonasCoach(techos: [138, 150, 160, 173, 192])

        private static func plan(_ p: WorkoutPlan?, entorno: RunEnvironment = .outdoor) -> Vivo.PlanVivo {
            var v = Vivo.planDe(p ?? Planes.series!, zonas: nil, entorno: entorno)
            v.zonas = zonas
            return v
        }

        /// El primer paso que cumple `donde` (o el primero), para no cablear índices.
        private static func indice(_ plan: Vivo.PlanVivo, ocurrencia: Int = 0, _ donde: (Vivo.Paso) -> Bool) -> Int {
            let todos = plan.pasos.indices.filter { donde(plan.pasos[$0]) }
            return todos.indices.contains(ocurrencia) ? todos[ocurrencia] : 0
        }

        private static func serie(_ p: Vivo.PlanVivo, _ n: Int) -> Int {
            indice(p) { $0.rol == .trabajo && $0.fase == .principal && $0.posicion?.serie?.n == n }
        }

        private static func vuelta(_ n: Int, _ s: Double, _ m: Double, _ ppm: Double, tanda: Int? = nil) -> Vivo.Vuelta {
            Vivo.Vuelta(n: n, tanda: tanda, clase: .serie, segundos: s, metros: m, ritmo: s / (m / 1000), ppm: ppm, veredicto: .dentro, eje: .ritmo)
        }

        private static let dosSeries = [vuelta(1, 231, 1000, 169), vuelta(2, 228, 1000, 171)]

        static func serieDentro(pausado: Bool = false, terminado: Bool = false) -> Escena {
            let p = plan(Planes.series)
            return Escena(plan: p, i: serie(p, 3), t: 88, hecho: 380, ritmo: 231, ppm: 171, sesionT: 1627, sesionM: 5581,
                          vueltas: dosSeries, pausado: pausado, terminado: terminado)
        }

        static func serieRapida() -> Escena {
            let p = plan(Planes.series)
            return Escena(plan: p, i: serie(p, 3), t: 46.5, hecho: 223, ritmo: 218, ppm: 172, sesionT: 1590, sesionM: 5375, vueltas: dosSeries)
        }

        static func serieLenta() -> Escena {
            let p = plan(Planes.series)
            return Escena(plan: p, i: serie(p, 3), t: 60, hecho: 250, ritmo: 246, ppm: 168, sesionT: 1600, sesionM: 5400, vueltas: dosSeries)
        }

        static func serieZ5() -> Escena {
            let p = plan(PlanesMuneca.seriesZ5)
            return Escena(plan: p, i: serie(p, 2), t: 96, hecho: 460, ritmo: 208, ppm: 176, sesionT: 714, sesionM: 2564,
                          vueltas: [Vivo.Vuelta(n: 1, clase: .serie, segundos: 168, metros: 800, ritmo: 210, ppm: 175, veredicto: .dentro, eje: .zona)])
        }

        static func recupera() -> Escena {
            let p = plan(Planes.series)
            return Escena(plan: p, i: serie(p, 3) + 1, t: 76, ppm: 141, tendencia: .baja, sesionT: 1844, sesionM: 6401, vueltas: dosSeries)
        }

        static func cuenta() -> Escena {
            var e = recupera()
            e.t = 87
            e.cuenta = 3
            return e
        }

        static func go() -> Escena {
            let p = plan(Planes.series)
            return Escena(plan: p, i: serie(p, 4), t: 0.4, hecho: 2, ppm: 141, sesionT: 1858, sesionM: 6410, vueltas: dosSeries, go: true)
        }

        static func rodaje(ppm: Double) -> Escena {
            let p = plan(Planes.rodaje)
            return Escena(plan: p, i: 0, t: 754, ritmo: 328, ppm: ppm, sesionT: 754, sesionM: 2299,
                          vueltas: [km(1, 331, 141), km(2, 327, 144)])
        }

        private static func km(_ n: Int, _ s: Double, _ ppm: Double) -> Vivo.Vuelta {
            Vivo.Vuelta(n: n, clase: .auto, segundos: s, metros: Vivo.metrosKm, vueltaM: Vivo.metrosKm, ritmo: s, ppm: ppm, veredicto: nil)
        }

        static func tirada() -> Escena {
            let p = plan(PlanesMuneca.tirada)
            return Escena(plan: p, i: 0, t: 1469, ritmo: 291, ppm: 146, sesionT: 1469, sesionM: 5002,
                          vueltas: [km(1, 295, 139), km(2, 293, 143), km(3, 291, 145), km(4, 289, 146)])
        }

        /// El km 5 recién cruzado: la tarjeta de la vuelta automática.
        static func registroDelKm() -> Vivo.RegistroVueltas {
            var r = Vivo.RegistroVueltas()
            let paso = plan(PlanesMuneca.tirada).pasos[0]
            r.observar(paso, sesionT: 1178, sesionM: 4000, ppm: 146)
            r.observar(paso, sesionT: 1468, sesionM: 5001, ppm: 146)
            return r
        }

        static func strides() -> Escena {
            let p = plan(PlanesMuneca.strides)
            let i = indice(p) { $0.rol == .trabajo && $0.posicion?.serie?.n == 3 }
            return Escena(plan: p, i: i, t: 10, ritmo: 240, ppm: 154, sesionT: 2138, sesionM: 6490)
        }

        static func descansoTandas() -> Escena {
            let p = plan(PlanesMuneca.tandas, entorno: .treadmill)
            let i = indice(p, ocurrencia: 1) { $0.clase == .descansoTandas }
            return Escena(plan: p, i: i, t: 54, ppm: 152, tendencia: .baja, gps: .noAplica, sesionT: 2094, sesionM: 5118, entorno: .treadmill)
        }

        /// La cara común de descanso (P8), con un descanso de fuerza: la de correr con tandas usa hoy la de recuperación.
        static func descanso() -> Escena {
            let p = plan(Planes.fuerza)
            let i = indice(p) { $0.rol == .descanso }
            return Escena(plan: p, i: i, t: 54, ppm: 131, tendencia: .baja, gps: .noAplica, sesionT: 900)
        }

        static func sinGps() -> Escena {
            let p = plan(Planes.progresivo)
            let i = indice(p) { $0.rol == .trabajo && $0.posicion?.tramo?.n == 1 }
            return Escena(plan: p, i: i, t: 4, hecho: 0, ritmo: nil, ppm: 118, gps: .buscando, sesionT: 4, sesionM: nil)
        }

        static func sinEnlace() -> Escena {
            var e = cinta()
            e.enlace = .sinEnlace
            return e
        }

        static func cinta() -> Escena {
            let p = plan(PlanesMuneca.tempoCinta, entorno: .treadmill)
            let i = indice(p) { $0.rol == .trabajo && $0.fase == .principal }
            return Escena(plan: p, i: i, t: 202, ritmo: 258, ppm: 172, gps: .noAplica, sesionT: 802, sesionM: 777, entorno: .treadmill)
        }
    }
}

// MARK: - Las sesiones que el kit del doble trae y `Planes` no

/// 479 (series a Z5), 494 (tirada), 551 (strides a RPE), 509 (tandas en cinta) y el tempo en cinta,
/// escritos como los escribe el servidor (la gramática de correr del coach), con los ayudantes de `Planes`.
private enum PlanesMuneca {

    private static func objetivoZona(_ z: Int) -> String { "{ \"type\": \"hr_zone\", \"zone\": \(z) }" }
    private static func objetivoRpe(_ v: Double) -> String { "{ \"type\": \"rpe\", \"value\": \(v) }" }

    /// Un tramo con cuesta (cinta), que los ayudantes de `Planes` no llevan.
    private static func tramo(_ segundos: Int, _ objetivo: String?, cuesta: Double) -> String {
        var partes = ["\"kind\": \"work\"", "\"measure\": { \"type\": \"duration\", \"s\": \(segundos) }", "\"incline_pct\": \(cuesta)"]
        if let objetivo { partes.append("\"target\": \(objetivo)") }
        return "{ " + partes.joined(separator: ", ") + " }"
    }

    static var seriesZ5: WorkoutPlan? {
        let fases = [
            Planes.fase("warmup", [Planes.trabajoS(300, objetivoZona(2))]),
            Planes.fase("main", [Planes.repetir(6, [Planes.trabajoM(800, objetivoZona(5)), Planes.recupera(150, "trote")])]),
        ]
        return Planes.plan("Series a Z5", [Planes.bloque("Series 6×800", "intervals", 1, [
            Planes.carrera("z1", fases: fases, planos: "\"rounds\": 6, \"rest_s\": 150, \"sets\": [\(Planes.set(Planes.metros(800), Planes.zona(5), 150))]")])])
    }

    static var tirada: WorkoutPlan? {
        let rx = "{ \"scheme\": \"steady\", \"modality\": \"run\", \"sets\": [\(Planes.set(Planes.segs(4800), Planes.zona(2)))] }"
        return Planes.plan("Tirada Z2 80′", [Planes.bloque("Carrera continua", "steady", 1, [Planes.item("t1", "Carrera", "running", rx)])])
    }

    static var strides: WorkoutPlan? {
        let fases = [Planes.fase("main", [
            Planes.trabajoM(6000, objetivoZona(2)),
            Planes.repetir(6, [Planes.trabajoS(20, objetivoRpe(7)), Planes.recupera(60, "caminar")]),
        ])]
        return Planes.plan("Rodaje + strides", [Planes.bloque("Rodaje y strides", "intervals", 1, [
            Planes.carrera("s1", fases: fases, planos: "\"sets\": [\(Planes.set(Planes.metros(6000), Planes.zona(2)))]")])])
    }

    static var tandas: WorkoutPlan? {
        let tanda = Planes.repetir(6, [Planes.trabajoS(60), Planes.recupera(60, "caminar")])
        let fases = [
            Planes.fase("warmup", [Planes.trabajoS(480)]),
            Planes.fase("main", [Planes.repetir(3, [tanda, Planes.recupera(300, "parado")])]),
        ]
        return Planes.plan("Cinta 3 × (6 × 1′)", [Planes.bloque("Drills y tandas", "intervals", 1, [
            Planes.carrera("k1", fases: fases, planos: "\"sets\": [\(Planes.set(Planes.segs(60)))]")])])
    }

    static var tempoCinta: WorkoutPlan? {
        let fases = [
            Planes.fase("warmup", [Planes.trabajoS(600)]),
            Planes.fase("main", [tramo(1200, Planes.ritmo(255, 265), cuesta: 1)]),
            Planes.fase("cooldown", [Planes.trabajoS(300)]),
        ]
        return Planes.plan("Tempo en cinta", [Planes.bloque("Tempo 20′", "steady", 1, [
            Planes.carrera("k1", fases: fases, planos: "\"sets\": [\(Planes.set(Planes.segs(1200), Planes.ritmoKm(255, 265)))]")])])
    }
}
#endif
