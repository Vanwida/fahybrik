import SwiftUI
import WatchKit

// CONTROLES — la página de la izquierda (P4): el orden y el sitio de Apple
// Entreno. Pausa / Reanudar, el control contextual (Vuelta o Siguiente paso),
// Bloqueo (Water Lock) y Terminar, que siempre pregunta «¿Terminar y guardar?».
// Espejo de `kit-reloj/paginas.tsx#PaginaControles` y `ConfirmarTerminar`.
//
// «Descartar» (perder lo grabado) solo aparece con el enlace con el iPhone roto, y pregunta como
// Terminar. La pregunta es de `MunecaConfirmar`, la misma que sale al cerrar el último paso.
//
// Botones de ≥ 44 pt con su rótulo a 15 pt. El naranja es la acción: el icono
// de cada control, y el fondo del que está activo (Reanudar mientras haya pausa).
// No sabe de la sesión: recibe qué hacer en `MunecaMandos`.

struct MunecaControles: View {
    let pausado: Bool
    let control: MunecaControl?
    let alPausar: () -> Void
    let alTerminar: () -> Void
    /// Perder lo grabado; `nil` = no se ofrece (solo con el enlace con el iPhone roto).
    let alDescartar: (() -> Void)?
    /// El Water Lock es del sistema: la esfera deja de responder al dedo hasta girar
    /// la corona. No hay estado de vuelta: quien lo quita es watchOS.
    let alBloquear: () -> Void
    /// Tras una acción que se ve en el vivo (pausa, vuelta, siguiente paso) se vuelve a él.
    let alIrAlVivo: () -> Void

    @Environment(\.munecaMedidas) private var medidas

    private enum Pregunta { case terminar, descartar }
    @State private var confirmando: Pregunta?

    /// `confirmando`: abre ya en «¿Terminar y guardar?» (el escaparate de DEBUG; en el entreno, siempre falso).
    init(pausado: Bool, control: MunecaControl?, alPausar: @escaping () -> Void, alTerminar: @escaping () -> Void,
         alDescartar: (() -> Void)? = nil,
         alBloquear: @escaping () -> Void = { WKInterfaceDevice.current().enableWaterLock() },
         alIrAlVivo: @escaping () -> Void = {}, confirmando: Bool = false) {
        self.pausado = pausado
        self.control = control
        self.alPausar = alPausar
        self.alTerminar = alTerminar
        self.alDescartar = alDescartar
        self.alBloquear = alBloquear
        self.alIrAlVivo = alIrAlVivo
        _confirmando = State(initialValue: confirmando ? .terminar : nil)
    }

    var body: some View {
        switch confirmando {
        case .terminar:
            MunecaConfirmar(pregunta: "¿Terminar y guardar?", accion: "Terminar",
                            alConfirmar: { confirmando = nil; alTerminar() }, alSeguir: { confirmando = nil })
        case .descartar:
            MunecaConfirmar(pregunta: "¿Descartar el entreno?", accion: "Descartar",
                            alConfirmar: { confirmando = nil; alDescartar?() }, alSeguir: { confirmando = nil })
        case nil:
            controles
        }
    }

    // MARK: - Los cuatro controles

    /// El ancho y el alto de cada botón: 86 × 58 a 46 mm, y lo que quepa en un reloj
    /// más pequeño sin bajar de 44 pt.
    private var ancho: CGFloat {
        Swift.min(MunecaForma.controlAncho, (CGFloat(medidas.anchoUtil) - MunecaForma.controlHueco) / 2)
    }

    private var alto: CGFloat {
        // Cada fila lleva su rótulo (una línea de 15 pt, y dos en la de «Siguiente paso») y 5 pt de aire.
        let rotulos = CGFloat(Vivo.TipoMuneca.nota * MunecaForma.interlinea) * 3 + 2 * MunecaForma.controlAireRotulo
        let porFilas = (CGFloat(medidas.altoUtil) - MunecaForma.controlHueco - rotulos) / 2
        return Swift.max(MunecaForma.tocableMin, Swift.min(MunecaForma.controlAlto, porFilas))
    }

    private var controles: some View {
        ScrollView(.vertical, showsIndicators: false) {
            Grid(horizontalSpacing: MunecaForma.controlHueco, verticalSpacing: MunecaForma.controlHueco) {
                GridRow {
                    boton(icono: pausado ? "play.fill" : "pause.fill", titulo: pausado ? "Reanudar" : "Pausa", activo: pausado) {
                        alPausar()
                        alIrAlVivo()
                    }
                    if let control {
                        boton(icono: control.icono == .vuelta ? "arrow.clockwise" : "forward.end", titulo: control.titulo) {
                            control.accion()
                            alIrAlVivo()
                        }
                    } else {
                        Color.clear.frame(width: ancho, height: alto)
                    }
                }
                GridRow {
                    boton(icono: "drop", titulo: "Bloqueo") {
                        alBloquear()
                        alIrAlVivo()
                    }
                    boton(icono: "xmark", titulo: "Terminar") { confirmando = .terminar }
                }
                if alDescartar != nil {
                    GridRow {
                        boton(icono: "trash", titulo: "Descartar") { confirmando = .descartar }
                        Color.clear.frame(width: ancho, height: alto)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, CGFloat(Vivo.MedidasMuneca.arribaSafe))
            .padding(.bottom, CGFloat(Vivo.MedidasMuneca.abajoSafe))
        }
        .defaultScrollAnchor(.center)
    }

    private func boton(icono: String, titulo: String, activo: Bool = false, accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            VStack(spacing: MunecaForma.controlAireRotulo) {
                RoundedRectangle(cornerRadius: MunecaForma.controlRadio, style: .continuous)
                    .fill(activo ? MunecaPaleta.accion : MunecaPaleta.superficie2)
                    .frame(width: ancho, height: alto)
                    .overlay {
                        Image(systemName: icono)
                            .font(.system(size: MunecaForma.iconoControl, weight: .semibold))
                            .foregroundStyle(activo ? MunecaPaleta.sobreAccion : MunecaPaleta.accion)
                    }
                Text(titulo)
                    .font(MunecaTipo.notaSemibold)
                    .foregroundStyle(MunecaPaleta.tinta)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    // El rótulo puede pasar del botón hasta la mitad del hueco de cada lado: «Siguiente» no se parte.
                    .frame(width: ancho + MunecaForma.controlHueco)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(titulo)
    }
}

// MARK: - La pregunta antes de lo que no se deshace

/// «¿Terminar y guardar?» / «¿Descartar el entreno?»: la acción (naranja) o Seguir. Nunca un tercer botón.
/// La usan la página Controles y el cierre del último paso.
struct MunecaConfirmar: View {
    let pregunta: String
    /// El rótulo del botón que confirma.
    let accion: String
    let alConfirmar: () -> Void
    let alSeguir: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Spacer(minLength: 0)
            Text(pregunta)
                .font(MunecaTipo.fuente(Vivo.TipoMuneca.tercero, 600))
                .foregroundStyle(MunecaPaleta.tinta)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 8)
            MunecaBoton(titulo: accion, accion: alConfirmar)
            MunecaBoton(titulo: "Seguir", variante: .superficie, accion: alSeguir)
            Spacer(minLength: 0)
        }
        .padding(.top, CGFloat(Vivo.MedidasMuneca.arribaSafe))
        .padding(.bottom, CGFloat(Vivo.MedidasMuneca.abajoSafe))
        .padding(.horizontal, CGFloat(Vivo.MedidasMuneca.ladoSafe))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
