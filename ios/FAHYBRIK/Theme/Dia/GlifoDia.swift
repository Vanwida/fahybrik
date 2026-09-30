import SwiftUI

// LOS GLIFOS DE «EL DÍA» — todos SF Symbols, con UN nombre por idea.
//
// El doble dibuja sus glifos a mano (`kit-dia/iconos.tsx`) porque en la web no hay SF
// Symbols; en iOS TODOS tienen su equivalente del sistema, así que no se dibuja ninguno:
// un SF Symbol sigue el peso del texto, se adapta a Dynamic Type y a Negrita, y lo pinta
// el sistema con la misma mano que el resto de la app. Lo que sí se fija aquí es cuál
// usa cada idea (chevron, flecha, reintentar…), para que las cuatro pestañas no escojan
// cuatro símbolos distintos para lo mismo.
//
// Son decorativos: el nombre accesible lo lleva el botón o la fila que los contiene.

enum GlifoDia: String, CaseIterable {
    case chevron    = "chevron.right"
    case flecha     = "arrow.right"
    case bandeja    = "tray"
    case chat       = "bubble.left"
    case mas        = "plus"
    case lupa       = "magnifyingglass"
    case calendario = "calendar"
    case diana      = "target"
    case pausa      = "pause.circle"
    case cronometro = "stopwatch"
    case video      = "video"
    case huellas    = "shoeprints.fill"
    case check      = "checkmark"
    case sube       = "arrow.up.right"
    case baja       = "arrow.down.right"
    case reintentar = "arrow.clockwise"
    case cerrar     = "xmark"
    case camara     = "camera"
    case silueta    = "person.fill"
    case lapiz      = "pencil"
    case puntos     = "ellipsis"
    case atras      = "chevron.left"
    case play       = "play.fill"
    case compartir  = "square.and.arrow.up"
    case ciclo      = "square.stack.3d.up"
    case candado    = "lock"
    case bandera    = "flag"
    case estrella   = "star"
    case enlace     = "link"
    case papelera   = "trash"
    case alerta     = "exclamationmark.triangle"
    /// Dos personas: un equipo, una pareja de Dobles.
    case equipo     = "person.2"
    case sinPersona = "person.crop.circle.badge.xmark"
    /// «Con {coach}».
    case coach      = "person.fill.checkmark"
    /// La identidad del atleta: su perfil.
    case perfil     = "person.crop.circle"
    case invitar    = "person.badge.plus"
    /// Entrenar: una mancuerna.
    case mancuerna  = "dumbbell"
    case reloj      = "applewatch"
    /// Cuenta: tres controles deslizantes.
    case ajustes    = "slider.horizontal.3"
    /// Privacidad: un escudo con cerradura.
    case escudo     = "lock.shield"
    case ayuda      = "questionmark.circle"
    case tarjeta    = "creditcard"
    /// El pulso: una actividad nueva del reloj.
    case pulso      = "waveform.path.ecg"
    // Las pantallas que cuelgan de Perfil: ajustes, lesiones y cada proveedor de «Dispositivos y apps».
    /// Mis días de entreno: el calendario con su reloj (`calendario` a secas es del kit).
    case diasDeEntreno = "calendar.badge.clock"
    case molestia   = "bandage"
    /// Avisos de voz en carrera.
    case voz        = "speaker.wave.2"
    /// Contar repeticiones con el reloj.
    case repeticiones = "figure.strengthtraining.traditional"
    /// Cómo se construye tu plan: bloques.
    case plan       = "rectangle.3.group"
    case coachFicha = "person.crop.rectangle"
    /// Enviar una sugerencia o un error.
    case sugerencia = "exclamationmark.bubble"
    case documento  = "doc.text"
    /// Deshacer la pareja de Dobles.
    case sinPareja  = "person.2.slash"
    /// El test de umbral (`cronometro` a secas es el stopwatch).
    case test       = "timer"
    /// Subir el movimiento de la muñeca (el reloj transmitiendo).
    case movimientoReloj = "applewatch.radiowaves.left.and.right"
    case appleWatch = "applewatch.watchface"
    case garmin     = "watch.analog"
    case appleSalud = "heart.text.square"
    case polar      = "heart.circle"
    case coros      = "gauge.with.dots.needle.67percent"
    case amazfit    = "figure.run.circle"
    /// Concept2 PM5: el Bluetooth del erg.
    case pm5        = "antenna.radiowaves.left.and.right"
    /// Exportar mis datos.
    case exportar   = "square.and.arrow.up.on.square"

    /// El nombre del SF Symbol.
    var simbolo: String { rawValue }
}

/// Un glifo del día, a su tamaño y peso. Decorativo para VoiceOver.
struct IconoDia: View {
    let glifo: GlifoDia
    var tam: CGFloat
    var peso: Font.Weight

    init(_ glifo: GlifoDia, tam: CGFloat = 20, peso: Font.Weight = .semibold) {
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

// MARK: - El sello de estado de una sesión

/// La marca de estado de una sesión: los mismos cuatro sellos que pinta el Plan (hecha ✓ verde,
/// a medias ½ ámbar, saltada ✕ neutra, por hacer ○ neutra). Con `tinta` los dibuja todos de un
/// solo color, para las superficies donde un verde o un ámbar no se leerían (el bloque del
/// acento): el estado va entonces por la FORMA y por la palabra que lo acompaña.
struct SelloEstadoDia: View {
    enum Estado: CaseIterable {
        case hecha, parcial, saltada, pendiente

        var simbolo: String {
            switch self {
            case .hecha:     return "checkmark.circle.fill"
            case .parcial:   return "circle.lefthalf.filled"
            case .saltada:   return "xmark.circle"
            case .pendiente: return "circle"
            }
        }

        fileprivate var color: SwiftUI.Color {
            switch self {
            case .hecha:     return Theme.Color.ok
            case .parcial:   return Theme.Color.warning
            case .saltada, .pendiente: return Theme.Color.muted
            }
        }
    }

    let estado: Estado
    var tam: CGFloat = 22
    /// Un solo color para los cuatro sellos (sobre el acento). `nil` = el color de cada estado.
    var tinta: SwiftUI.Color?

    var body: some View {
        Image(systemName: estado.simbolo)
            .font(.system(size: tam, weight: .semibold))
            .foregroundStyle(tinta ?? estado.color)
            .accessibilityHidden(true)
    }
}

#if DEBUG
#Preview("Sello y glifos · fábrica") { EnAmbasDia { GaleriaDia.Teselas() } }
#Preview("Sello y glifos · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Teselas() } }
#endif
