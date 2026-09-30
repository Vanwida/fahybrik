import Foundation

// QUÉ CARA PINTA EL ESPEJO — la decisión, pura y sin SwiftUI (F2b de «correr en la
// muñeca», DECISIONS 2026-09-30).
//
// El móvil nuevo manda plan y cursor en TODO entreno (fuerza, WOD, HYROX…), no solo al
// correr; que haya cuadro (`Vivo.EspejoMuneca.estado == .vivo`) no dice que la cara nueva
// deba pintarlo. Esta función junta lo que sí lo dice y devuelve una de dos:
//
//   · `.muneca`   la pila nueva (`MunecaVivo`), alimentada del cuadro del espejo;
//   · `.deSiempre` TODO lo de hoy: las tres páginas de `MirrorRodajePaginas`, el guion de
//     cada modalidad y las capas de fase, sin tocar.
//
// La cara nueva es la de todo lo que se entrena con reloj (`Vivo.familiaMuneca`, una sola regla para el reloj en
// solitario y para el espejo). Cae a la de siempre, y nunca inventa, cuando:
//   · la bandera de TestFlight (`MunecaBandera`) está apagada;
//   · el reloj está guardando (`isEnding`: «Guardando…» manda);
//   · no hay cuadro: móvil viejo (sin cursor), plan aún sin llegar, o cursor de otro plan;
//   · aún no hay trama;
//   · el paso vivo es una lista de movilidad (`Vivo.EspejoMuneca.cubreLaMuneca`, decidido sobre el plan y
//     no sobre el tramo);
//   · el móvil espera «Empezar» en la puerta de un bloque (`gate`: sigue la puerta de siempre).
//
// Pausa, la cuenta atrás del 3-2-1 de arranque y «sesión completada» las trae el propio
// cuadro (`pausado`, `capa`, `cara`), como en solitario: no se tapan con las capas viejas.

enum CaraDelEspejo: Equatable {
    case deSiempre
    case muneca

    /// Las fases del cable en las que la cara nueva manda. `gate` no está: la puerta de un
    /// bloque sigue siendo la de siempre (las puertas entre bloques de correr son de otra fase).
    static let fasesDeLaCaraNueva: Set<String> = [
        MirrorWire.Phase.active, MirrorWire.Phase.paused, MirrorWire.Phase.countIn, MirrorWire.Phase.finished,
    ]

    /// `cubre`: el paso vivo del plan es de una familia que la cara nueva pinta (`Vivo.EspejoMuneca.cubreLaMuneca`).
    static func decide(bandera: Bool, espejo: Vivo.EspejoMuneca.Estado, frame: MirrorStateFrame?, cubre: Bool, terminando: Bool) -> CaraDelEspejo {
        guard bandera, !terminando, espejo == .vivo, let f = frame else { return .deSiempre }
        guard cubre else { return .deSiempre }
        return fasesDeLaCaraNueva.contains(f.phase) ? .muneca : .deSiempre
    }

    /// ¿Sigue mandando la cara de siempre? Lo que hay que respetar de ella (hápticos locales
    /// del espejo, capas de fase) solo se aplica entonces: con la cara nueva ya no existe.
    var esDeSiempre: Bool { self == .deSiempre }
}
