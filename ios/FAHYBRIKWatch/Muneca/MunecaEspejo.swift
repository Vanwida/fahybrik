import SwiftUI

// LA MUÑECA EN ESPEJO — la MISMA pila (`MunecaVivo`) alimentada desde el iPhone.
//
// Con el móvil llevando el motor (el 90 % de los días) la muñeca no tiene sesión: tiene
// el plan y el cursor que manda el móvil, y de ellos produce el `Vivo.CuadroMuneca` con
// la misma `Vivo.cuadroMuneca` que en solitario (`Vivo.EspejoMuneca`, DECISIONS 30-09).
// Esta vista solo pide ese cuadro cada segundo (el reloj local corre solo entre tramas),
// se lo da a la pila y le cablea los mandos a las órdenes del espejo. No decide nada de
// lo que se pinta ni de cuándo se pinta (eso lo decide `CaraDelEspejo`).
//
// Mientras está en pantalla es la ÚNICA fuente de vibraciones (P5): activa `Vivo.PoliticaHaptica`
// (calla lo heredado) y su director las toca desde el estado que sale del mismo espejo, en la muñeca,
// igual con el móvil que sin él.
//
// Los mandos son los del espejo: pausar/reanudar paran o arrancan la grabación de la
// muñeca y lo avisan al móvil (como `MirrorHUDControlsPage`), cerrar paso y «Vuelta»
// viajan al motor del móvil, y Terminar (ya confirmado por la pila) guarda desde aquí.
// Un botón que el móvil no atiende (`MirrorWire.Capacidad`) NO se enseña.

/// De dónde sale lo que pinta la pila: el propietario del espejo en el entreno, o un
/// espejo montado a mano en el escaparate de DEBUG. La vista no distingue.
struct MunecaEspejoFuente {
    /// El cuadro a `ahora` con la talla y el Always-On del reloj, o `nil` si no hay con qué.
    var cuadro: (_ ahora: Date, _ entorno: Vivo.EntornoMuneca) -> Vivo.CuadroMuneca?
    /// El estado vivo y las vueltas por km a `ahora`, para que el director vibe desde lo que cambia; `nil` = no hay.
    var estadoDelDirector: ((_ ahora: Date) -> (estado: Vivo.EstadoVivo, registro: Vivo.RegistroVueltas)?)? = nil
    /// El paso vivo (su id devuelve la pila al Paso; su clave dice la acción del momento).
    var paso: () -> Vivo.Paso?
    var mandos: (_ cuadro: Vivo.CuadroMuneca, _ paso: Vivo.Paso?) -> MunecaMandos

    /// El espejo real: `WatchPrimaryOwner` con el plan, el cursor y lo que mide la muñeca.
    @MainActor
    static func delOwner(_ owner: WatchPrimaryOwner) -> MunecaEspejoFuente {
        MunecaEspejoFuente(
            cuadro: { ahora, entorno in
                owner.cuadroMuneca(ahora: ahora, gps: Vivo.estadoGps(precisionM: owner.gpsAccuracyM), entorno: entorno)
            },
            estadoDelDirector: { ahora in owner.estadoDelDirector(ahora: ahora, gps: Vivo.estadoGps(precisionM: owner.gpsAccuracyM)) },
            paso: { owner.espejo.pasoVivo },
            mandos: { cuadro, paso in owner.mandosMuneca(cuadro: cuadro, paso: paso) }
        )
    }
}

struct MunecaEspejo: View {
    let fuente: MunecaEspejoFuente
    /// La página de la corona con la que se abre (siempre Paso en el entreno; el escaparate abre las otras).
    var paginaInicial: Vivo.PaginaMuneca = .paso

    @Environment(\.isLuminanceReduced) private var atenuado
    @State private var director = MunecaDirector()

    /// Cada cuánto mira el director el estado (el mismo ritmo que en solitario).
    private static let miradaMs = MunecaAlimentador.miradaMs

    init(owner: WatchPrimaryOwner) {
        self.fuente = .delOwner(owner)
    }

    init(fuente: MunecaEspejoFuente, paginaInicial: Vivo.PaginaMuneca = .paso) {
        self.fuente = fuente
        self.paginaInicial = paginaInicial
    }

    var body: some View {
        MunecaMedidor { medidas in
            // Un tic por segundo: entre tramas el reloj del paso y el de la sesión los cuenta la muñeca.
            TimelineView(.periodic(from: .now, by: 1)) { contexto in
                let entorno = Vivo.EntornoMuneca(medidas: medidas, alwaysOn: atenuado, accion: .pista)
                if let cuadro = fuente.cuadro(contexto.date, entorno) {
                    let paso = fuente.paso()
                    MunecaVivo(
                        cuadro: cuadro,
                        alPaso: paso?.id ?? "",
                        mandos: conAccion(fuente.mandos(cuadro, paso)),
                        paginaInicial: paginaInicial
                    )
                } else {
                    // Solo un instante entre que se deja de tener cuadro y la vista se cambia a la de siempre.
                    MunecaPaleta.fondo.ignoresSafeArea()
                }
            }
        }
        .task {
            while !Task.isCancelled {
                mirar()
                try? await Task.sleep(for: .milliseconds(Self.miradaMs))
            }
        }
        .onAppear { Vivo.PoliticaHaptica.compartida.activar() }
        // La cara se va (la sesión acaba, el enlace cambia de cara): una mirada de más para que «sesión hecha» suene.
        .onDisappear {
            mirar()
            Vivo.PoliticaHaptica.compartida.soltar()
        }
    }

    /// Un vistazo al estado del espejo: lo que cambia desde la última mirada, el director lo vibra.
    private func mirar() {
        guard let x = fuente.estadoDelDirector?(Date()) else { return }
        director.observar(x.estado, registro: x.registro)
    }

    /// Lo que el atleta hace con los mandos, el director lo toca como `.click`.
    private func conAccion(_ mandos: MunecaMandos) -> MunecaMandos {
        var m = mandos
        m.alActuar = { director.accion() }
        return m
    }
}

// MARK: - Los mandos del espejo

extension WatchPrimaryOwner {

    /// Lo que la pila puede hacer con el móvil llevando el motor. La acción del momento sale del cuadro (el mismo
    /// vocabulario cerrado que en solitario, `Vivo.clavePrimariaMuneca`): «Vuelta» parte el rodaje sin cerrarlo,
    /// «Confirmar» declara lo anotado en el descanso de fuerza y lo manda al motor del móvil, y lo demás cierra el
    /// paso con el `advance` de siempre (también cortar un descanso: el móvil decide qué sigue).
    func mandosMuneca(cuadro: Vivo.CuadroMuneca, paso: Vivo.Paso?) -> MunecaMandos {
        let clave = cuadro.primaria
        let pausado = cuadro.pausado
        let cerrar = { self.sendCommand(MirrorWire.CommandKind.advance) }
        // «Hecho» de una ventana y «+1 ronda» solo MARCAN: los cuenta la muñeca (y las rondas, además, el motor del móvil).
        let marca = paso.map { Vivo.marcaSinCerrar(clave, $0) } ?? false
        let marcar = {
            if case .amrap? = paso?.wod {
                self.espejo.rondaHecha(ahora: Date())
                if self.movilAtiende(MirrorWire.Capacidad.ronda) { self.sendCommand(MirrorWire.CommandKind.ronda) }
            } else {
                self.espejo.marcarHecha(ahora: Date())
            }
        }
        // La campana de un AMRAP: la puntuación dicha viaja al móvil, que la guarda y cierra la sesión.
        let guardar = {
            guard self.movilAtiende(MirrorWire.Capacidad.puntuacion), let p = self.espejo.puntuacion(ahora: Date()) else { cerrar(); return }
            self.send(type: MirrorWire.MessageType.command, MirrorCommand(kind: MirrorWire.CommandKind.puntuacion, puntuacion: p))
        }
        // Cerrar el ÚLTIMO paso guarda la sesión: se pregunta (`Vivo.CierreSeguro`). Sin plan vivo, también.
        // «Vuelta», «Confirmar», «Guardar» y lo que solo marca no cierran nada: no preguntan.
        let noCierra = paso.map { Vivo.noCierraNada(clave, $0) } ?? (clave == .vuelta || clave == .confirmar)
        let pideConfirmar = Vivo.CierreSeguro.pideConfirmar(esVuelta: noCierra, ultimoPaso: espejo.ultimoPaso)
        // «Vuelta» solo si el móvil la atiende (un móvil con cursor la anuncia) y no en pausa.
        let vuelta: (() -> Void)? = clave == .vuelta && movilAtiende(MirrorWire.Capacidad.vuelta)
            ? {
                guard !pausado else { return }
                self.vueltaAMano()
            } : nil
        let esVuelta = clave == .vuelta
        let cierraElPaso = clave != nil && !esVuelta && clave != .confirmar && clave != .guardar && !marca
        let confirmar = {
            for d in self.espejo.confirmarAnotacion(ahora: Date()) { self.enviarDeclaracion(d) }
        }
        // Lo declarado solo se ofrece si el móvil lo atiende: prometer un dato que nadie guarda es mentir.
        let anotar: MunecaAnotar? = movilAtiende(MirrorWire.Capacidad.anotar) ? MunecaAnotar(
            abrir: { k in self.espejo.abrirSerie(k, ahora: Date()) },
            enfocar: { campo in self.espejo.enfocarDato(campo, ahora: Date()) },
            girar: { dir in
                if let d = self.espejo.girarDato(dir, ahora: Date()) { self.enviarDeclaracion(d) }
            }
        ) : nil

        return MunecaMandos(
            pausa: { self.alternarPausaDelEspejo(estaPausado: pausado) },
            terminar: { self.finishByAthlete() },
            pideConfirmarAlCerrar: pideConfirmar,
            // «Descartar» solo con el enlace roto: con el móvil llevando el entreno, descartar es cosa suya.
            descartar: Vivo.CierreSeguro.ofreceDescartar(role: role, link: link) ? { self.discardByAthlete() } : nil,
            control: control(clave: clave, marca: marca, esVuelta: esVuelta, cierraElPaso: clave != nil && !esVuelta, vuelta: vuelta, cerrar: cerrar, marcar: marcar),
            primaria: clave == .confirmar ? confirmar : (esVuelta ? vuelta : (clave == .guardar ? guardar : (marca ? marcar : (cierraElPaso ? cerrar : nil)))),
            // Sin la capacidad `mas30` el móvil no estira un descanso: sin botón.
            mas30: movilAtiende(MirrorWire.Capacidad.mas30) ? { self.sendCommand(MirrorWire.CommandKind.plus30) } : nil,
            // Sin la capacidad `deshacer` el móvil no reabre un tramo: sin aviso. Cuándo se puede lo dice el cursor.
            deshacer: movilAtiende(MirrorWire.Capacidad.deshacer) ? { self.sendCommand(MirrorWire.CommandKind.undo) } : nil,
            empezarYa: { cerrar() },
            anotar: anotar,
            puntuar: { dir in self.espejo.girarPuntuacion(dir, ahora: Date()) }
        )
    }

    private func control(clave: Vivo.ClavePrimaria?, marca: Bool, esVuelta: Bool, cierraElPaso: Bool, vuelta: (() -> Void)?,
                         cerrar: @escaping () -> Void, marcar: @escaping () -> Void) -> MunecaControl? {
        if esVuelta, let vuelta {
            return MunecaControl(titulo: Vivo.ClavePrimaria.vuelta.texto, icono: .vuelta, accion: vuelta)
        }
        if marca, let clave {
            return MunecaControl(titulo: clave.texto, icono: .marcar, accion: marcar)
        }
        if cierraElPaso {
            return MunecaControl(titulo: Vivo.ClavePrimaria.siguientePaso.texto, icono: .siguiente, accion: cerrar)
        }
        return nil
    }

    /// Pausa/Reanudar: para o arranca la grabación de la muñeca y lo avisa al móvil, igual que
    /// `MirrorHUDControlsPage` (que se queda para el resto de modalidades).
    private func alternarPausaDelEspejo(estaPausado: Bool) {
        if estaPausado {
            resumeIfPaused()
            sendCommand(MirrorWire.CommandKind.resume)
        } else {
            pause()
            sendCommand(MirrorWire.CommandKind.pause)
        }
    }
}
