import SwiftUI

// CONTROLES DE LA LÁMINA — Pausar naranja grande, Terminar rojo abajo, y la
// confirmación como página («¿Terminar y guardar?»), no como diálogo del sistema.
//
// UNA sola pieza para las dos vías: `PauseFinishPage` (sin móvil) y
// `MirrorRodajeControlesPage` (en espejo) la alimentan con SUS acciones y ella
// pinta lo mismo. Antes el espejo tenía botones viejos de 52 pt y otra
// composición, y el atleta veía dos pantallas de Controles según llevara el
// móvil encima.

/// Un botón de la lámina: título en negrita, esquinas continuas de 18 pt y, si
/// hace falta, un borde de 1,5 pt. El alto lo marca el peso de la acción.
struct RodajeBotonLamina: View {
    let titulo: String
    let alto: CGFloat
    let fondo: Color
    let tinta: Color
    var borde: Color? = nil
    let action: () -> Void

    var body: some View {
        Button {
            WatchHaptics.tap()
            action()
        } label: {
            Text(titulo)
                .font(.system(size: 15, weight: .heavy))
                .foregroundStyle(tinta)
                .frame(maxWidth: .infinity)
                .frame(height: alto)
                .background(fondo)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay {
                    if let borde {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(borde, lineWidth: 1.5)
                    }
                }
        }
        .buttonStyle(.plain)
    }
}

/// Los colores de la lámina para cada peso de acción (tinta oscura sobre el
/// naranja de marca, rojo apagado para lo destructivo).
enum RodajeBotonEstilo {
    static let tintaSobreNaranja = Color(red: 22/255, green: 8/255, blue: 0)
    static let tintaSobreRojo = Color(red: 42/255, green: 0, blue: 0)
    static let fondoTerminar = Color(red: 36/255, green: 11/255, blue: 11/255)
    static let bordeTerminar = Color(red: 115/255, green: 35/255, blue: 35/255)
}

struct RodajeControles: View {
    /// Una acción secundaria entre Pausar y Terminar («Nuevo tramo», «Siguiente
    /// bloque»). Sólo las que el llamante sabe que existen ahora.
    struct Extra: Identifiable {
        let titulo: String
        let action: () -> Void
        var id: String { titulo }
    }

    /// Lo que se está confirmando. Un solo estado para las dos preguntas.
    private enum Confirmando {
        case terminar, descartar

        var pregunta: String {
            switch self {
            case .terminar: return "¿Terminar\ny guardar?"
            case .descartar: return "¿Descartar\nel entreno?"
            }
        }

        var accion: String {
            switch self {
            case .terminar: return "Terminar"
            case .descartar: return "Descartar"
            }
        }
    }

    let encabezado: String
    let pausado: Bool
    let onPausa: () -> Void
    var extras: [Extra] = []
    /// Sólo en espejo con el enlace roto: la razón y lo que sigue pasando.
    var avisoSinEnlace: Bool = false
    /// Línea fija bajo los botones (en espejo: quién manda el entreno).
    var pie: String? = nil
    let onTerminar: () -> Void
    /// Sólo en espejo con el enlace roto: tirar el entreno de la muñeca.
    var onDescartar: (() -> Void)? = nil

    @State private var confirmando: Confirmando?

    var body: some View {
        if let confirmando {
            confirmar(confirmando)
        } else {
            controles
        }
    }

    private var controles: some View {
        VStack(spacing: 0) {
            RodajeVersales(texto: encabezado, tono: RodajeTipo.contexto)
            GeometryReader { geo in
                let d = distribucion(en: geo.size.height)
                VStack(spacing: 0) {
                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(spacing: d.hueco) {
                            if avisoSinEnlace { sinEnlace }
                            RodajeBotonLamina(
                                titulo: pausado ? "Reanudar" : "Pausar",
                                alto: d.pausar,
                                fondo: WatchTheme.orange,
                                tinta: RodajeBotonEstilo.tintaSobreNaranja,
                                action: onPausa
                            )
                            ForEach(extras) { extra in
                                RodajeBotonLamina(
                                    titulo: extra.titulo,
                                    alto: d.extra,
                                    fondo: WatchTheme.surfaceRaised,
                                    tinta: WatchTheme.ink,
                                    action: extra.action
                                )
                            }
                            RodajeBotonLamina(
                                titulo: "Terminar",
                                alto: d.terminar,
                                fondo: RodajeBotonEstilo.fondoTerminar,
                                tinta: WatchTheme.zoneRed,
                                borde: RodajeBotonEstilo.bordeTerminar
                            ) {
                                confirmando = .terminar
                            }
                            if onDescartar != nil { descartar }
                        }
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: geo.size.height - (d.muestraPie ? RodajeControlesMedidas.altoPie : 0),
                               alignment: .center)
                    }
                    if d.muestraPie, let pie {
                        Text(pie)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(RodajeTipo.dim)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(height: RodajeControlesMedidas.altoPie, alignment: .bottom)
                    }
                }
            }
            RodajePuntos(activa: RodajePagina.controles.punto)
        }
    }

    /// Lo que ocupan el aviso de conexión y Descartar (que no se estiran) se
    /// descuenta del hueco antes de repartir los botones. Con el enlace roto casi
    /// nunca cabe todo: los botones bajan al suelo y la página se recorre.
    private func distribucion(en alto: CGFloat) -> RodajeControlesMedidas.Distribucion {
        let reservado: CGFloat = (avisoSinEnlace ? 62 : 0) + (onDescartar != nil ? 40 : 0)
        return RodajeControlesMedidas.distribuir(
            disponible: alto - reservado,
            extras: extras.count,
            pie: pie != nil && onDescartar == nil
        )
    }

    private var sinEnlace: some View {
        VStack(spacing: 2) {
            Text("Sin conexión con el iPhone")
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(WatchTheme.orange)
            Text("El entreno se sigue grabando aquí.")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(RodajeTipo.dim)
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity)
    }

    private var descartar: some View {
        Button {
            WatchHaptics.tap()
            confirmando = .descartar
        } label: {
            Text("Descartar")
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(RodajeTipo.dim)
                .frame(maxWidth: .infinity)
                .frame(height: 36)
        }
        .buttonStyle(.plain)
    }

    private func confirmar(_ que: Confirmando) -> some View {
        VStack(spacing: 0) {
            RodajeVersales(texto: encabezado, tono: RodajeTipo.contexto)
            Spacer(minLength: 4)
            Text(que.pregunta)
                .font(.system(size: 17, weight: .heavy))
                .multilineTextAlignment(.center)
                .foregroundStyle(WatchTheme.ink)
                .padding(.horizontal, 4)
            Spacer(minLength: 4)
            VStack(spacing: 8) {
                RodajeBotonLamina(
                    titulo: que.accion,
                    alto: 48,
                    fondo: WatchTheme.zoneRed,
                    tinta: RodajeBotonEstilo.tintaSobreRojo
                ) {
                    switch que {
                    case .terminar: onTerminar()
                    case .descartar: onDescartar?()
                    }
                }
                RodajeBotonLamina(
                    titulo: "Seguir",
                    alto: 44,
                    fondo: WatchTheme.surfaceRaised,
                    tinta: WatchTheme.ink
                ) {
                    confirmando = nil
                }
            }
            .padding(.bottom, 6)
        }
    }
}
