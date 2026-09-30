#if DEBUG
import SwiftUI

// EL ESCAPARATE DE LA CARA NUEVA EN ESPEJO (F2b).
//
// Cada caso `muneca-espejo-*` es el MISMO de `muneca-*` (mismas escenas, mismos números) pero
// alimentado como lo alimenta el iPhone: no con un `Vivo.EstadoVivo` hecho a mano, sino con el
// plan y el cursor que manda el móvil, que la muñeca convierte en cuadro (`Vivo.EspejoMuneca`)
// y pinta con `MunecaEspejo`, la vista del entreno. Para que el espejo llegue a la escena hay
// que vivirla: `Recorrido` la recorre paso a paso a 1 Hz (tramas del móvil, metros y pulso del
// builder de la muñeca) y se queda en el segundo que dice la escena.
//
//     xcrun simctl launch <sim> com.fahybrid.app.watchkitapp -guion muneca-espejo-serie-dentro
//     xcrun simctl io <sim> screenshot serie.png
//
// Comparado con el solitario, la pantalla es la misma salvo el enlace (`.espejo` frente a
// `.solo`) y los números de la página Vueltas, que aquí salen del recorrido simulado y no de
// las vueltas fijas de la escena. Solo en DEBUG.

extension GuionEscaparate {

    static var munecaEspejo: [Caso] {
        [
            espejo("muneca-espejo-serie-dentro", "Espejo · serie 3/6 dentro de la banda") { Escena.serieDentro() },
            espejo("muneca-espejo-serie-dentro-datos", "Espejo · Datos", pagina: .datos) { Escena.serieDentro() },
            espejo("muneca-espejo-serie-dentro-vueltas", "Espejo · Vueltas", pagina: .vueltas) { Escena.serieDentro() },
            espejo("muneca-espejo-serie-dentro-estructura", "Espejo · Estructura", pagina: .estructura) { Escena.serieDentro() },
            espejo("muneca-espejo-serie-dentro-atenuado", "Espejo · Always-On", atenuado: true) { Escena.serieDentro() },
            espejo("muneca-espejo-serie-rapida", "Espejo · serie yendo rápido (▲)") { Escena.serieRapida() },
            espejo("muneca-espejo-serie-lenta", "Espejo · serie yendo lenta (▼)") { Escena.serieLenta() },
            espejo("muneca-espejo-serie-z5", "Espejo · serie a zona (479)") { Escena.serieZ5() },
            espejo("muneca-espejo-recupera", "Espejo · recuperación de 90″") { Escena.recupera() },
            espejo("muneca-espejo-cuenta", "Espejo · 3-2-1") { Escena.cuenta() },
            espejo("muneca-espejo-go", "Espejo · GO") { Escena.go() },
            espejo("muneca-espejo-rodaje-dentro", "Espejo · rodaje Z2, dentro (491)") { Escena.rodaje(ppm: 145) },
            espejo("muneca-espejo-rodaje-fuera", "Espejo · rodaje Z2, pulso alto") { Escena.rodaje(ppm: 158) },
            espejo("muneca-espejo-tirada-km", "Espejo · tirada, tarjeta del km (494)") { Escena.tirada() },
            espejo("muneca-espejo-strides", "Espejo · stride a RPE (551)") { Escena.strides() },
            espejo("muneca-espejo-tanda-descanso", "Espejo · descanso entre tandas (509)") { Escena.descansoTandas() },
            espejo("muneca-espejo-sin-gps", "Espejo · el GPS aún no fija (538)") { Escena.sinGps() },
            espejo("muneca-espejo-sin-enlace", "Espejo · sin enlace con el iPhone") { Escena.sinEnlace() },
            espejo("muneca-espejo-cinta", "Espejo · cinta al 1 % (535)") { Escena.cinta() },
            espejo("muneca-espejo-pausa", "Espejo · en pausa") { Escena.serieDentro(pausado: true) },
            espejo("muneca-espejo-completada", "Espejo · sesión completada") { Escena.serieDentro(terminado: true) },
        ]
    }

    private static func espejo(_ id: String, _ titulo: String, pagina: Vivo.PaginaMuneca = .paso, atenuado: Bool = false,
                               _ escena: @escaping () -> Escena) -> Caso {
        Caso(id: id, titulo: titulo, paginas: [], vista: {
            AnyView(EscaparateMunecaEspejo(recorrido: Recorrido(escena()), atenuado: atenuado, pagina: pagina))
        })
    }

    /// La pila del entreno, con un espejo ya vivido y los mandos vacíos (los mismos que el escaparate del solitario).
    private struct EscaparateMunecaEspejo: View {
        let recorrido: Recorrido
        let atenuado: Bool
        let pagina: Vivo.PaginaMuneca

        var body: some View {
            let fuente = MunecaEspejoFuente(
                cuadro: { _, entorno in recorrido.cuadro(entorno) },
                paso: { recorrido.espejo.pasoVivo },
                mandos: { _, _ in
                    MunecaMandos(pausa: {}, terminar: {},
                                 control: MunecaControl(titulo: "Siguiente paso", icono: .siguiente, accion: {}),
                                 primaria: {}, mas30: {}, empezarYa: {})
                }
            )
            MunecaEspejo(fuente: fuente, paginaInicial: pagina)
                .environment(\.isLuminanceReduced, atenuado)
        }
    }

    // MARK: - El recorrido: vivir la escena como la vive el espejo

    /// Lleva un `Vivo.EspejoMuneca` desde el primer paso hasta el segundo de la escena, con lo que
    /// entrega el iPhone (el plan una vez; una trama con cursor al empezar cada paso y otra al final)
    /// y lo que mide la muñeca (metros y pulso cada segundo). El ritmo de cada paso sale de las
    /// vueltas de la escena si las trae; si no, del ritmo actual de la escena.
    private struct Recorrido {
        private static let base = Date(timeIntervalSinceReferenceDate: 1_048_576)
        /// Ritmo (s/km) de un paso de recuperación o de un tramo sin dato: un trote.
        private static let ritmoDeTrote: Double = 420

        let escena: Escena
        private(set) var espejo = Vivo.EspejoMuneca()
        private var ahora = Recorrido.base
        private let hash: String
        /// Los metros que la muñeca lleva medidos en el recorrido (para no contarlos dos veces al saltar).
        private var yaMedido = 0.0

        init(_ escena: Escena) {
            self.escena = escena
            let plan = MirrorPlanVivo(plan: escena.plan, entorno: escena.entorno)
            hash = plan.planHash
            espejo.recibirPlan(plan)
            vivir()
        }

        func cuadro(_ entorno: Vivo.EntornoMuneca) -> Vivo.CuadroMuneca? {
            espejo.cuadro(ahora: ahora, locales: Vivo.EspejoMuneca.Locales(
                gps: escena.gps, enlaceApplePerdido: escena.enlace == .sinEnlace, entorno: entorno))
        }

        // MARK: Vivir la escena

        private mutating func vivir() {
            var sesionS = 0.0
            var trabajo = 0
            for j in 0..<escena.i {
                let paso = escena.plan.pasos[j]
                let ritmo = ritmoDe(paso, trabajo: &trabajo)
                let (segundos, metros) = duracionYMetros(paso, ritmo: ritmo)
                enviar(j, enPasoS: 0, sesionS: sesionS)
                mover(segundos: segundos, metros: metros, ppm: ppmDe(paso))
                sesionS += segundos
            }
            // El paso de la escena. Los metros que llevaba en él: los hechos si se mide por distancia; si no,
            // los que da su ritmo actual. Lo que la sesión llevaba ANTES (si la escena lo sabe) se anota de
            // golpe: un salto que el ritmo actual descarta.
            let paso = escena.plan.pasos[escena.i]
            let metros = paso.medida.tipo == .distancia ? (escena.hecho ?? 0) : (escena.ritmo.map { escena.t * 1000 / $0 } ?? 0)
            let antes = Swift.max(0, (escena.sesionM ?? 0) - metros)
            enviar(escena.i, enPasoS: 0, sesionS: escena.sesionT - escena.t, salto: Swift.max(0, antes - yaMedido))
            mover(segundos: escena.t, metros: metros, ppm: escena.ppm, tendencia: escena.tendencia)
            // La trama final lleva el cursor tal como lo saca el móvil de la escena (con lo que mida él).
            espejo.recibirTrama(trama(cursor: Vivo.cursorDe(escena.estado(), planHash: hash, entorno: escena.entorno)), en: ahora)
        }

        /// Tramo de la sesión que viene de una vuelta de la escena (su ritmo) o el ritmo actual.
        private func ritmoDe(_ paso: Vivo.Paso, trabajo: inout Int) -> Double {
            guard paso.rol == .trabajo, paso.fase == .principal else { return Self.ritmoDeTrote }
            defer { trabajo += 1 }
            return escena.vueltas.indices.contains(trabajo) ? (escena.vueltas[trabajo].ritmo ?? escena.ritmo ?? 300) : (escena.ritmo ?? 300)
        }

        private func duracionYMetros(_ paso: Vivo.Paso, ritmo: Double) -> (Double, Double) {
            let prescrito = paso.medida.prescrito ?? 60
            switch paso.medida.tipo {
            case .tiempo: return (prescrito, prescrito * 1000 / ritmo)
            case .distancia: return (prescrito * ritmo / 1000, prescrito)
            default: return (60, 0)
            }
        }

        private func ppmDe(_ paso: Vivo.Paso) -> Double? {
            paso.rol == .trabajo ? (escena.vueltas.last?.ppm ?? escena.ppm) : escena.ppm.map { $0 - 25 }
        }

        // MARK: El móvil manda, la muñeca mide

        private func trama(cursor: MirrorCursor) -> MirrorStateFrame {
            var f = MirrorStateFrame(phase: cursor.pausado ? MirrorWire.Phase.paused : MirrorWire.Phase.active,
                                     blockTitle: nil, lineTitle: nil, detailLine: nil, progressText: nil,
                                     sessionElapsed: cursor.sesionS, lapElapsed: cursor.enPasoS, countdownRemaining: nil,
                                     targetZone: nil, isFinalStep: nil, restRemaining: nil)
            f.cursor = cursor
            return f
        }

        /// La trama con la que el móvil anuncia el paso `i` y, si la escena sabe cuánto llevaba la sesión, los
        /// metros que la muñeca ya había medido antes (un salto, no un ritmo).
        private mutating func enviar(_ i: Int, enPasoS: Double, sesionS: Double, salto: Double = 0) {
            if salto > 0 {
                espejo.anotarDistancia(deltaM: salto, en: ahora)
                yaMedido += salto
            }
            let f = trama(cursor: MirrorCursor(planHash: hash, i: i, enPasoS: enPasoS, sesionS: sesionS, pausado: false))
            espejo.recibirTrama(f, en: ahora)
        }

        /// Los últimos segundos en los que el pulso sube o baja lo bastante para que se lea la tendencia.
        private static let segundosDeTendencia = 6.0
        /// Lo que cambia el pulso por segundo en esos últimos segundos, en latidos.
        private static let latidosPorSegundo = 2.0

        /// `segundos` de carrera a 1 Hz con `metros` repartidos parejo y el pulso (con su tendencia al final).
        private mutating func mover(segundos: Double, metros: Double, ppm: Double?, tendencia: Vivo.Tendencia? = nil) {
            var restante = segundos
            while restante > 0 {
                let dt = Swift.min(1, restante)
                ahora = ahora.addingTimeInterval(dt)
                if metros > 0, segundos > 0 {
                    espejo.anotarDistancia(deltaM: metros * dt / segundos, en: ahora)
                    yaMedido += metros * dt / segundos
                }
                if let ppm {
                    let hastaElFinal = Swift.min(restante - dt, Self.segundosDeTendencia)
                    let empuje = hastaElFinal * Self.latidosPorSegundo
                    let latido = tendencia == .baja ? ppm + empuje : (tendencia == .sube ? ppm - empuje : ppm)
                    espejo.anotarPulso(Int(latido.rounded()), en: ahora)
                }
                restante -= dt
            }
        }
    }
}
#endif
