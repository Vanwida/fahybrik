import Foundation

// QUÉ CARA PINTA EL ESPEJO: la decisión, pura y sin SwiftUI (F2b de «correr en la
// muñeca», DECISIONS 2026-09-30; sin bandera desde F8).
//
// El móvil nuevo manda plan y cursor en TODO entreno (fuerza, WOD, HYROX…); que haya cuadro
// (`Vivo.EspejoMuneca.estado == .vivo`) no dice que la pila deba pintarlo. Esta función junta lo
// que sí lo dice y devuelve una de dos:
//
//   · `.muneca`  la pila nueva (`MunecaVivo`), alimentada del cuadro del espejo;
//   · `.sinPila` lo que la pila no cubre: la puerta de un bloque, la lista de movilidad y el
//     «Grabando en la muñeca» de antes de la primera trama (`MirrorHUDView`).
//
// La pila es la de todo lo que se entrena con reloj (`Vivo.familiaMuneca`, una sola regla para el
// reloj en solitario y para el espejo). Cae a `.sinPila`, y nunca inventa, cuando:
//   · el reloj está guardando (`isEnding`: «Guardando…» manda);
//   · no hay cuadro: móvil viejo (sin cursor), plan aún sin llegar, o cursor de otro plan;
//   · aún no hay trama;
//   · el paso vivo es una lista de movilidad (`Vivo.EspejoMuneca.cubreLaMuneca`, decidido sobre el
//     plan y no sobre el tramo);
//   · el móvil espera «Empezar» en la puerta de un bloque (`gate`).
//
// Pausa, la cuenta atrás del 3-2-1 de arranque y «sesión completada» las trae el propio cuadro
// (`pausado`, `capa`, `cara`), como en solitario.

enum CaraDelEspejo: Equatable {
    case sinPila
    case muneca

    /// Las fases del cable en las que la pila manda. `gate` no está: la puerta de un bloque es del
    /// móvil hasta que el atleta empieza.
    static let fasesDeLaPila: Set<String> = [
        MirrorWire.Phase.active, MirrorWire.Phase.paused, MirrorWire.Phase.countIn, MirrorWire.Phase.finished,
    ]

    /// `cubre`: el paso vivo del plan es de una familia que la pila pinta (`Vivo.EspejoMuneca.cubreLaMuneca`).
    static func decide(espejo: Vivo.EspejoMuneca.Estado, frame: MirrorStateFrame?, cubre: Bool, terminando: Bool) -> CaraDelEspejo {
        guard !terminando, espejo == .vivo, let f = frame, cubre else { return .sinPila }
        return fasesDeLaPila.contains(f.phase) ? .muneca : .sinPila
    }
}
