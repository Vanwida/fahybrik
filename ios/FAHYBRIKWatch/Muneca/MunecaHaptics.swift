import Foundation
import WatchKit

// LAS VIBRACIONES DE LA CARA NUEVA — UNA sola fuente (P5: un evento, un háptico).
//
// `MunecaHaptics` toca los golpes que decidió el núcleo (`Vivo.pulsos`); `MunecaDirector` mira
// el estado vivo (`Vivo.dirigir`) y los dispara. La cara nueva de correr, en solitario y en
// espejo, usa esto y nada más: mientras está en pantalla `Vivo.PoliticaHaptica` calla lo
// heredado (los `Haptics.*` del motor en solitario, los avisos locales de la cara de siempre),
// así que cada evento vibra una vez. Fuera de correr, o con la bandera apagada, nadie activa
// nada y todo suena como hasta hoy.
//
// La voz es de F4: cada emisión lleva su frase (`Vivo.Emision.voz`) y el director la entrega a
// `alVoz`, que hoy no está enganchado a nada. Aquí no se dice una palabra.

enum MunecaHaptics {

    /// Los golpes de una emisión, en el hilo principal (WatchKit descarta lo que suena fuera de él).
    @MainActor
    static func tocar(_ emision: Vivo.Emision) {
        for pulso in Vivo.pulsos(de: emision) {
            if pulso.despuesS <= 0 {
                WKInterfaceDevice.current().play(tipo(pulso.haptico))
            } else {
                let golpe = tipo(pulso.haptico)
                DispatchQueue.main.asyncAfter(deadline: .now() + pulso.despuesS) { WKInterfaceDevice.current().play(golpe) }
            }
        }
    }

    /// Del vocabulario del modelo (§4) al de WatchKit: los nombres son los mismos.
    static func tipo(_ h: Vivo.HapticoWK) -> WKHapticType {
        switch h {
        case .click: return .click
        case .start: return .start
        case .stop: return .stop
        case .notification: return .notification
        case .directionUp: return .directionUp
        case .directionDown: return .directionDown
        case .success: return .success
        case .failure: return .failure
        }
    }
}

/// El director de una sesión: guarda la memoria, mira el estado y vibra. Uno por cara nueva en pantalla.
@MainActor
final class MunecaDirector {

    private var memoria = Vivo.MemoriaDirector()
    /// La voz (F4): recibe lo que hay que decir. `nil` = nadie la reproduce todavía.
    var alVoz: ((Vivo.Emision) -> Void)?

    init() {}

    /// Un vistazo al estado vivo (y a las vueltas por km): lo que produce, vibra.
    func observar(_ estado: Vivo.EstadoVivo, registro: Vivo.RegistroVueltas? = nil) {
        emitir(Vivo.dirigir(&memoria, estado, registro: registro))
    }

    /// El atleta hizo algo (pausa, cerrar paso, vuelta): `.click`, el del vocabulario.
    func accion() {
        emitir([Vivo.Emitido(evento: .accion)])
    }

    private func emitir(_ cola: [Vivo.Emitido]) {
        guard let emision = memoria.componer(cola) else { return }
        MunecaHaptics.tocar(emision)
        if emision.voz != nil { alVoz?(emision) }
    }
}
