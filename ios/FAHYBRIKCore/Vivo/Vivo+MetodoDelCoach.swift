import Foundation

// EL MÉTODO DEL COACH, EN LAS REGLAS DEL VIVO — de `WristMethod` (lo que el servidor manda con la
// sesión, `AssignmentDetail.wristMethod`) a `Vivo.ReglasAviso` (lo que el vivo consulta para juzgar
// un paso y avisar). Es el puente que `WristMethod.swift` deja a propósito en este sitio.
//
// HARD RULE Nº0: cuánta holgura se da antes de avisar, cada cuánto se repite, cuándo se preavisa el
// final de un paso son MÉTODO del coach, no de la app. El servidor manda siempre el valor efectivo
// (el defecto del producto si el coach no tocó nada); sin `wrist_method` —una sesión cacheada antes
// de esta tanda, un servidor anterior— el vivo usa `reglasAvisoDefecto`, que son los mismos números.

extension Vivo {

    static func reglasDe(_ metodo: WristMethod?) -> ReglasAviso {
        guard let a = metodo?.alerts else { return reglasAvisoDefecto }
        return ReglasAviso(
            holgura: .init(ritmo: a.slack.paceS, ppm: a.slack.hrBpm, split500: a.slack.split500S,
                           vatios: a.slack.watts, cadencia: a.slack.cadenceSpm),
            cadenciaS: a.gapS,
            confirmacionS: a.confirmS,
            graciaZonaS: a.zoneGraceS,
            preavisoS: a.prewarnS,
            preavisoM: a.prewarnM,
            preavisoMinimoS: a.prewarnMinStepS,
            avisarEnCalentamiento: a.inWarmup,
            avisarEnRecuperacion: a.inRecovery
        )
    }

    /// Hacia qué lado avisa un rodaje a zona, según el coach. `ninguno` (no avisar) y `abajo` no caben aún en
    /// `MetodoAviso`: caen en su defecto (solo por arriba) hasta que el modelo los represente.
    static func metodoAvisoDe(_ m: WristMethod) -> MetodoAviso {
        MetodoAviso(zonaContinuaSoloArriba: m.alerts.continuousZone != .ambos)
    }
}
