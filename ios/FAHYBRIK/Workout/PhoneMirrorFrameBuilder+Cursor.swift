import Foundation

// EL CURSOR EN LA TRAMA (F2). Con un plan en la muñeca (`PhoneMirrorPlanFeed`), cada
// trama dice DÓNDE está el entreno en él. El estado sale de `Vivo.estadoDeMuneca`, la
// MISMA función que usa la muñeca en solitario, y el cursor de `Vivo.cursorDe`, que es
// quien decide qué viaja y qué mide la muñeca por su cuenta. Aquí no se decide nada.

extension PhoneMirrorFrameBuilder {

    /// Lo que este móvil sabe hacer con los comandos de la muñeca. Solo lo que el motor
    /// atiende de verdad: `undo`, `plus30` y la voz de la muñeca no se anuncian hasta que
    /// el motor los tenga (ver `PhoneMirrorCommandRelay`).
    static let capacidades: [String] = [MirrorWire.Capacidad.vuelta]

    static func cursor(from session: WorkoutSession, plan: MirrorPlanVivo, context: PhoneMirrorFrameContext) -> MirrorCursor {
        // El ritmo de un paso de cinta enchufada es el de la banda (lo que ya manda `beltPaceSecPerKm`);
        // en el resto lo mide la muñeca y aquí no se manda. Sin banda viva, «no se sabe»: nunca la media del tramo.
        let banda = context.isTreadmillLive() ? session.liveBeltPaceSecPerKm.map(Double.init) : nil
        let estado = Vivo.estadoDeMuneca(session, plan: plan.plan,
                                         fuentes: Vivo.FuentesMuneca(ritmoActual: banda, enlace: .espejo))
        return Vivo.cursorDe(
            estado,
            planHash: plan.planHash,
            entorno: plan.entorno,
            // Los relojes del motor están congelados en la puerta de un bloque y esperando decisión.
            parado: session.isAwaitingBlockStart || session.isAwaitingFinishDecision,
            cuentaRestanteS: session.isTramoCountIn ? session.tramoCountInRemaining : nil
        )
    }

    /// Lo del cursor que obliga a mandar una trama nueva: el plan, el paso, si los relojes corren y la
    /// cuenta de arranque al segundo. Los relojes en sí NO entran (la muñeca los cuenta sola): si
    /// entraran, cada segundo forzaría una trama.
    static func cursorKey(_ c: MirrorCursor?) -> String {
        guard let c else { return "" }
        let cuenta = c.cuentaS.map { String(Swift.max(0, Int(ceil($0)))) } ?? ""
        return [c.planHash, String(c.i), c.pausado ? "p" : "", c.terminado ? "t" : "", c.parado ? "q" : "", cuenta].joined(separator: ",")
    }
}
