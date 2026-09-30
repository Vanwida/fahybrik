import Foundation
import Observation

// EL ALIMENTADOR DE LA MUÑECA EN SOLITARIO — de `WorkoutSession` (el motor local)
// a lo que la pila necesita: el `Vivo.EstadoVivo`, el `CuadroMuneca` y los mandos.
// Es el ÚNICO sitio de la carpeta que conoce la sesión; las vistas de la pila son
// funciones puras de lo que sale de aquí.
//
// No hay un segundo adaptador: usa `Vivo.estadoDeMuneca` / `Vivo.cuadroMuneca`, los
// mismos del iPhone. Lo propio de la muñeca es de dónde salen tres lecturas que el
// motor no ve: el ritmo ACTUAL (la ventana de 10 s que llena el builder, la lleva el
// coordinador), el estado del GPS y, más adelante, el enlace (en solitario, `.solo`).
//
// Las vueltas del correr continuo (km automático, «Vuelta» a mano) las lleva el vivo
// y no el motor: `RegistroVueltas`, mirando la sesión cada medio segundo, como en el
// iPhone. Un rodaje sigue siendo UN paso.

@MainActor
@Observable
final class MunecaAlimentador {

    /// Cada cuánto se mira la sesión para el km automático (el mismo ritmo que el iPhone).
    static let miradaMs = 500

    private let session: WorkoutSession
    /// Ritmo actual a `ahora` (s de sesión), de la ventana del coordinador; `nil` = no se sabe.
    @ObservationIgnored private let ritmoActual: (Double) -> Double?
    /// Cómo va el GPS ahora mismo.
    @ObservationIgnored private let gps: () -> Vivo.EstadoGps
    @ObservationIgnored private let pausar: () -> Void
    @ObservationIgnored private let terminar: () -> Void

    private(set) var registro = Vivo.RegistroVueltas()
    /// Quien vibra: el director mira este mismo estado y es la única fuente de hápticos de la cara nueva.
    @ObservationIgnored let director = MunecaDirector()
    /// Lo declarado en el descanso de fuerza y lo que hay abierto: la muñeca lo conserva y cada dato va al motor.
    private(set) var anotar = Vivo.AnotarMuneca()
    /// Lo que quedaba del descanso de la serie en la mirada anterior: al pasar de >0 a 0 el descanso acabó solo.
    @ObservationIgnored private var restAntes: Double = 0
    /// El plan en pasos, calculado una vez por sesión y entorno (no en cada tic).
    @ObservationIgnored private var planGuardado: (clave: String, plan: Vivo.PlanVivo)?

    init(session: WorkoutSession,
         ritmoActual: @escaping (Double) -> Double?,
         gps: @escaping () -> Vivo.EstadoGps,
         pausar: @escaping () -> Void,
         terminar: @escaping () -> Void) {
        self.session = session
        self.ritmoActual = ritmoActual
        self.gps = gps
        self.pausar = pausar
        self.terminar = terminar
    }

    // MARK: - El estado

    private var plan: Vivo.PlanVivo {
        let clave = "\(session.plan.id)|\(session.runEnvironment?.rawValue ?? "-")|\(session.hrZones?.lthrBpm ?? 0)"
        if let g = planGuardado, g.clave == clave { return g.plan }
        // La muñeca sola no tiene monitor de máquina (lo lleva el móvil): en un ergo, los metros y el /500 los dices tú.
        let nuevo = Vivo.segunEnlace(Vivo.planDe(session), maquina: nil)
        planGuardado = (clave, nuevo)
        return nuevo
    }

    func estado() -> Vivo.EstadoVivo {
        let fuentes = Vivo.FuentesMuneca(ritmoActual: ritmoActual(session.elapsedSeconds), gps: gps(), enlace: .solo)
        return Vivo.estadoDeMuneca(session, plan: plan, fuentes: fuentes)
    }

    func cuadro(_ e: Vivo.EstadoVivo, medidas: Vivo.MedidasMuneca, alwaysOn: Bool) -> Vivo.CuadroMuneca {
        Vivo.cuadroMuneca(e, registro: registro, entorno: Vivo.EntornoMuneca(medidas: medidas, alwaysOn: alwaysOn, accion: .pista), anotar: anotar)
    }

    /// Un vistazo a la sesión: si el rodaje ha cruzado otro km, su vuelta y su tarjeta; lo que decide el motor de
    /// la fuerza (la serie por tiempo se cierra sola; al acabar un descanso se sigue); y lo que el director saca de
    /// lo que ha cambiado desde la última mirada (GO, avisos, km…).
    func observar() {
        let e = estado()
        registro.observar(e.paso, sesionT: e.sesion.t, sesionM: e.sesion.metros, ppm: e.lecturas.ppm)
        director.observar(e, registro: registro)
        session.vivoCerrarSerieCumplida()
        if restAntes > 0, session.restRemainingSeconds <= 0 { session.vivoAlAcabarDescanso() }
        restAntes = session.restRemainingSeconds
        let medidas = session.vivoMedidasDeSensor(e.pasos)
        if medidas != anotar.medidas { anotar.medidas = medidas }
    }

    // MARK: - Lo que se puede hacer

    /// Cada dato declarado entra al motor por la puerta de siempre (`vivoDeclarar`).
    private func aplicar(_ declaraciones: [Vivo.Declaracion], _ e: Vivo.EstadoVivo) {
        for d in declaraciones { session.vivoDeclarar(d, pasos: e.pasos) }
    }

    /// Los mandos de la pila con el motor local. La acción del momento sale del vocabulario cerrado del núcleo
    /// (`Vivo.clavePrimariaMuneca`): «Vuelta» parte el rodaje SIN cerrarlo; «Confirmar» declara lo anotado; lo demás
    /// cierra el paso por el mismo camino que ya usa el reloj (`applyCommand(advance)`), o salta el descanso si corre
    /// uno del motor. Lo que decide el motor de la fuerza (la última serie lleva al siguiente ejercicio) va detrás.
    func mandos(_ e: Vivo.EstadoVivo) -> MunecaMandos {
        let clave = Vivo.clavePrimariaMuneca(e, anotar)
        let esVuelta = clave == .vuelta
        // Cerrar el ÚLTIMO paso guarda la sesión: se pregunta (`Vivo.CierreSeguro`). Sin certeza, también.
        // «Vuelta» y «Confirmar» no cierran nada: no preguntan.
        let ultimo = Vivo.CierreSeguro.esUltimoPaso(indice: e.i, de: e.pasos.count)
        let pideConfirmar = Vivo.CierreSeguro.pideConfirmar(esVuelta: esVuelta || clave == .confirmar, ultimoPaso: ultimo)
        let cerrar = { [session] in
            if session.restRemainingSeconds > 0 { session.dismissRest(); session.vivoAlAcabarDescanso() }
            else { session.applyCommand(MirrorWire.CommandKind.advance); session.vivoTrasCerrarSerie() }
            // Ya contestó «¿Terminar y guardar?»: el motor esperaba su decisión del final y esa fue. No se le
            // pregunta otra vez con la pantalla de «Sesión completada» (esa es para cuando el reloj acaba solo).
            if pideConfirmar, session.isAwaitingFinishDecision { session.finish() }
        }
        let vuelta = { [weak self] in
            guard let self, !self.session.isPaused else { return }
            let x = self.estado()
            self.registro.aMano(sesionT: x.sesion.t, sesionM: x.sesion.metros, ppm: x.lecturas.ppm)
        }
        let confirmar = { [weak self] in
            guard let self else { return }
            let x = self.estado()
            self.aplicar(self.anotar.confirmar(x), x)
        }
        return MunecaMandos(
            pausa: pausar,
            terminar: terminar,
            pideConfirmarAlCerrar: pideConfirmar,
            alActuar: { [director] in director.accion() },
            control: MunecaControl(
                titulo: (esVuelta ? Vivo.ClavePrimaria.vuelta : .siguientePaso).texto,
                icono: esVuelta ? .vuelta : .siguiente,
                accion: esVuelta ? vuelta : cerrar
            ),
            primaria: clave == nil ? nil : (clave == .confirmar ? confirmar : (esVuelta ? vuelta : cerrar)),
            mas30: session.vivoPuedeSumar30 ? { [session] in session.vivoSumar30() } : nil,
            // El motor local reabre el último tramo cerrado a mano; cuándo se puede lo dice `EstadoVivo.deshacerS`.
            deshacer: { [session] in session.undoRunLegClose() },
            empezarYa: cerrar,
            anotar: MunecaAnotar(
                abrir: { [weak self] k in guard let self else { return }; self.anotar.abrir(k, self.estado()) },
                enfocar: { [weak self] campo in guard let self else { return }; self.anotar.enfocar(campo, self.estado()) },
                girar: { [weak self] dir in
                    guard let self else { return }
                    let x = self.estado()
                    if let d = self.anotar.girar(dir, x) { self.aplicar([d], x) }
                }
            )
        )
    }
}
