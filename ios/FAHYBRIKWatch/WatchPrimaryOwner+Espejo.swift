import Foundation

// F2 — EL ESPEJO CON LA MISMA CARA. Lo que `WatchPrimaryOwner` hace con el plan y el
// cursor que manda el móvil: los guarda en `Vivo.EspejoMuneca` (puro, en FAHYBRIKCore),
// le da lo que mide la propia muñeca (pulso y metros del builder) y ofrece a las vistas
// UNA función: `cuadroMuneca(ahora:)`. `nil` = no hay con qué (un móvil viejo, aún sin plan,
// o un cursor de otro plan): la vista cae a la cara de siempre y NO inventa.
//
// Nada aquí decide el enlace: el estado lo dice Apple (`link`, FH-56). Lo único que
// depende del tiempo —marcar «viejo» tras `MirrorWire.datoViejoTrasS` sin trama— es una
// comparación que hace el espejo al pintar, sin temporizadores. Quien pinta debe volver a
// pedir el cuadro cada segundo (un `TimelineView`), porque el reloj local corre solo.

extension WatchPrimaryOwner {

    /// `MessageType.plan`: reemplaza al plan anterior (otra huella = otro plan).
    func recibirPlanEspejo(_ plan: MirrorPlanVivo) {
        espejo.recibirPlan(plan)
    }

    /// El cursor de la trama, y el plan que falte se pide UNA vez (`sync`; el móvil lo reenvía).
    func recibirTramaEspejo(_ f: MirrorStateFrame) {
        let ahora = Date()
        espejo.recibirTrama(f, en: ahora)
        if espejo.planAPedir(en: ahora) != nil { sendCommand(MirrorWire.CommandKind.sync) }
        // El reloj cazó un death by (un minuto se cerró sin marcar): el móvil acaba el bloque con los minutos marcados.
        if let completos = espejo.tomarCazado() {
            send(type: MirrorWire.MessageType.command,
                 MirrorCommand(kind: MirrorWire.CommandKind.deathByFail, puntuacion: MirrorPuntuacion(rondas: completos, reps: nil)))
        }
    }

    /// Metros nuevos que entrega el builder (el mismo delta que ya se manda al móvil).
    func anotarDistanciaEspejo(_ deltaMetros: Double) {
        espejo.anotarDistancia(deltaM: deltaMetros, en: Date())
    }

    /// TODO lo que pinta la muñeca ahora: el MISMO `Vivo.CuadroMuneca` que en solitario. `gps` y
    /// `cadencia` son lecturas del propio reloj que este objeto no lleva (las da quien las tiene);
    /// `entorno` es la talla del reloj y el Always-On.
    func cuadroMuneca(ahora: Date = Date(), gps: Vivo.EstadoGps = .noAplica, cadencia: Double? = nil,
                      entorno: Vivo.EntornoMuneca = Vivo.EntornoMuneca()) -> Vivo.CuadroMuneca? {
        guard role == .mirror else { return nil }
        return espejo.cuadro(
            ahora: ahora,
            locales: Vivo.EspejoMuneca.Locales(gps: gps, cadencia: cadencia, enlaceApplePerdido: phoneUnlinked, entorno: entorno)
        )
    }

    /// El estado vivo del espejo y sus vueltas por km, para el director de hápticos: el MISMO estado del que
    /// sale el cuadro (`estadoVivo`), con el enlace que dice Apple. `nil` = no hay con qué.
    func estadoDelDirector(ahora: Date, gps: Vivo.EstadoGps) -> (estado: Vivo.EstadoVivo, registro: Vivo.RegistroVueltas)? {
        guard role == .mirror,
              let e = espejo.estadoVivo(ahora: ahora, locales: Vivo.EspejoMuneca.Locales(gps: gps, enlaceApplePerdido: phoneUnlinked))
        else { return nil }
        return (e, espejo.registro)
    }

    /// Qué cara pinta el espejo ahora: la pila nueva o lo que la pila no cubre. La decisión es pura y vive
    /// en Core (`CaraDelEspejo`, probada); aquí solo se le dan las cuatro cosas que mira.
    var caraDelEspejo: CaraDelEspejo {
        CaraDelEspejo.decide(espejo: espejo.estado, frame: frame, cubre: espejo.cubreLaMuneca, terminando: isEnding)
    }

    /// Lo que este móvil atiende de los comandos nuevos (`MirrorWire.Capacidad`): la muñeca solo ofrece esos botones.
    func movilAtiende(_ capacidad: String) -> Bool {
        frame?.capacidades?.contains(capacidad) == true
    }

    /// Un dato declarado en el descanso de fuerza viaja al motor del móvil (`CommandKind.anotar`).
    func enviarDeclaracion(_ d: Vivo.Declaracion) {
        send(type: MirrorWire.MessageType.command, MirrorCommand(kind: MirrorWire.CommandKind.anotar, declaracion: d))
    }

    /// «Vuelta» a mano: se anota en la muñeca (su página Vueltas) y se manda al motor del móvil.
    func vueltaAMano() {
        espejo.vueltaAMano(en: Date())
        sendCommand(MirrorWire.CommandKind.newLap)
    }
}
