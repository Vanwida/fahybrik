import Foundation

// EL PLAN QUE EL MÓVIL LE MANDA A LA MUÑECA (F2, DECISIONS 2026-09-30).
//
// El móvil construye el plan con la MISMA función que usa la muñeca en solitario
// (`Vivo.planDe(_ sesion:)`) y lo empaqueta (`MirrorPlanVivo`, con su huella). Este
// objeto lo CACHEA —el plan solo cambia si cambian las zonas o el entorno; los
// segmentos de la sesión son `let`— y decide CUÁNDO se manda:
//   · al atarse la sesión espejo (nada enviado todavía en este canal),
//   · cuando cambia (otra huella),
//   · cuando la muñeca lo pide (`sync`), no más de una vez cada `planReenvioMinS`.
// Si el plan empaquetado no cabe en el presupuesto del canal (ver
// `MirrorWire.Presupuesto`), NO se manda ni se manda cursor: la muñeca cae a la cara
// de siempre. Honesto antes que roto.

@MainActor
final class PhoneMirrorPlanFeed {

    private var cacheado: MirrorPlanVivo?
    private var cabe = true
    private var planId: UUID?
    private var zonas: HRZoneProfile?
    private var entorno: RunEnvironment?
    private var enviado: String?
    private var enviadoEn: Date = .distantPast
    private var reenvioPedido = false

    /// El plan de esta sesión para la muñeca, o `nil` si no cabe en el canal.
    func plan(para session: WorkoutSession) -> MirrorPlanVivo? {
        if cacheado == nil || planId != session.plan.id || zonas != session.hrZones || entorno != session.runEnvironment {
            let nuevo = MirrorPlanVivo(plan: Vivo.planDe(session), entorno: session.runEnvironment)
            cacheado = nuevo
            planId = session.plan.id
            zonas = session.hrZones
            entorno = session.runEnvironment
            cabe = (MirrorEnvelope.encoding(type: MirrorWire.MessageType.plan, nuevo)?.count ?? Int.max) <= MirrorWire.Presupuesto.planMaxBytes
        }
        return cabe ? cacheado : nil
    }

    /// El plan que toca mandar ahora, o `nil`. Llamar antes de mandar la trama, para que el
    /// plan llegue primero.
    func pendienteDeEnvio(para session: WorkoutSession, ahora: Date = Date()) -> MirrorPlanVivo? {
        guard let p = plan(para: session) else { return nil }
        let nuevo = enviado != p.planHash
        let pedidoYLibre = reenvioPedido && ahora.timeIntervalSince(enviadoEn) >= MirrorWire.planReenvioMinS
        return nuevo || pedidoYLibre ? p : nil
    }

    func marcarEnviado(_ p: MirrorPlanVivo, ahora: Date = Date()) {
        enviado = p.planHash
        enviadoEn = ahora
        reenvioPedido = false
    }

    /// La muñeca dice que no lo tiene (`sync`): se manda en cuanto el presupuesto lo permita.
    func pedirReenvio() { reenvioPedido = true }

    /// Canal nuevo (otra muñeca, o la misma reatada): lo enviado ya no cuenta.
    func olvidarEnvio() {
        enviado = nil
        reenvioPedido = false
    }
}
