import SwiftUI

// LOS GLIFOS PROPIOS DEL CHAT — SF Symbols para las ideas que el kit del día no nombra todavía.
//
// El kit (`GlifoDia`) fija UN símbolo por idea compartida (cerrar, más, reintentar, alerta…) y el chat los usa tal
// cual. Lo que sigue son las ideas que sólo existen en una conversación con adjuntos: enviar, grabar, documento,
// foto… Mismo trato que `IconoDia` (decorativos: el nombre accesible lo lleva el botón o la fila que los contiene).
// `play`, `alerta` y `papelera` ya están en el kit consolidado que aún no ha llegado a `main`: cuando llegue, se
// reemplazan por `GlifoDia` y se borran de aquí. Si otra pantalla necesita uno de estos, es la señal de subirlo.

enum GlifoChat: String {
    case enviar        = "arrow.up"
    case microfono     = "mic.fill"
    case sinMicrofono  = "mic.slash.fill"
    case onda          = "waveform"
    case documento     = "doc.fill"
    case foto          = "photo"
    case fotoRota      = "photo.badge.exclamationmark"
    case video         = "video.fill"
    case pausa         = "pause.fill"
    case descarga      = "arrow.down.circle"
    case alertaRellena = "exclamationmark.triangle.fill"
    case play          = "play.fill"
    case alerta        = "exclamationmark.triangle"
    case papelera      = "trash"

    var simbolo: String { rawValue }
}

/// Un glifo del chat, a su tamaño y peso. Decorativo para VoiceOver.
struct IconoChat: View {
    let glifo: GlifoChat
    var tam: CGFloat
    var peso: Font.Weight

    init(_ glifo: GlifoChat, tam: CGFloat = 20, peso: Font.Weight = .semibold) {
        self.glifo = glifo
        self.tam = tam
        self.peso = peso
    }

    var body: some View {
        Image(systemName: glifo.simbolo)
            .font(.system(size: tam, weight: peso))
            .accessibilityHidden(true)
    }
}

// MARK: - Medidas de la conversación

/// Las medidas que comparten las burbujas del chat: una sola fuente para que texto, voz, foto, vídeo y archivo
/// se lean como la misma familia.
enum MedidasChat {
    /// Lo más ancha que llega una burbuja: deja siempre aire al lado de quien habla.
    static let anchoMaximoBurbuja: CGFloat = 300
    static let radioBurbuja: CGFloat = 16
    /// La esquina «cola», del lado de quien habla.
    static let radioCola: CGFloat = 5
    static let aireHorizontalBurbuja: CGFloat = 14
    static let aireVerticalBurbuja: CGFloat = 10
    /// Lo más grande que sale una foto en la conversación.
    static let fotoMaxAncho: CGFloat = 240
    static let fotoMaxAlto: CGFloat = 320
    /// El disco oscuro bajo un botón que va SOBRE una foto o un vídeo (play, cerrar): negro con este alfa se lee sea
    /// cual sea la imagen de debajo, en claro y en oscuro.
    static let opacidadDelDiscoSobreMedio: Double = 0.42
}
