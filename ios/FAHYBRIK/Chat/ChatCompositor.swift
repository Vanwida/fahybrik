import SwiftUI
import UIKit

// EL COMPOSITOR — banda 3, anclada abajo: el «＋», el campo y el envío; o, si hay un adjunto elegido y aún sin enviar,
// su vista previa con descartar y enviar.
//
// Piezas que PINTAN: el borrador, el foco y las acciones vienen de fuera (`ChatView` es dueño del estado). Todos los
// controles miden 48 pt; el envío inactivo cambia de superficie y de tinta, no de opacidad.

// MARK: - El pie de la pantalla

/// El contenedor de la banda 3: aire, fondo del tema y un filete arriba. Recibe TODO lo que va anclado (el chip de
/// contexto y la fila de escritura) para que se lean como una sola pieza y no como dos bandas.
struct PieDelChat<Contenido: View>: View {
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        VStack(spacing: Theme.Spacing.s) { contenido() }
            .padding(.horizontal, Theme.Spacing.pantalla)
            .padding(.vertical, Theme.Spacing.m)
            .frame(maxWidth: .infinity)
            .background(Theme.Color.background)
            .overlay(alignment: .top) { Rectangle().fill(Theme.Color.hairline).frame(height: 1) }
    }
}

// MARK: - El botón redondo

/// El botón redondo de 48 pt del compositor: adjuntar, enviar, descartar.
struct BotonRedondoChat<Glifo: View>: View {
    enum Estilo {
        /// La acción que envía: acento del club con su tinta.
        case acento
        /// Lo secundario: la superficie con su filete.
        case suave
        /// Lo que aún no se puede hacer: cambia de superficie y de tinta, no de opacidad.
        case apagado

        fileprivate var fondo: SwiftUI.Color {
            switch self {
            case .acento: return Theme.Color.accent
            case .suave: return Theme.Color.surface
            case .apagado: return Theme.Color.surfaceElevated
            }
        }

        fileprivate var tinta: SwiftUI.Color {
            switch self {
            case .acento: return Theme.Color.accentOn
            case .suave: return Theme.Color.foreground
            case .apagado: return Theme.Color.muted
            }
        }
    }

    let etiqueta: String
    var estilo: Estilo
    let accion: () -> Void
    let glifo: Glifo

    init(etiqueta: String, estilo: Estilo, accion: @escaping () -> Void, @ViewBuilder glifo: () -> Glifo) {
        self.etiqueta = etiqueta
        self.estilo = estilo
        self.accion = accion
        self.glifo = glifo()
    }

    var body: some View {
        Button(action: accion) {
            glifo
                .foregroundStyle(estilo.tinta)
                .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                .background(estilo.fondo, in: Circle())
                .overlay { Circle().strokeBorder(estilo == .acento ? SwiftUI.Color.clear : Theme.Color.hairlineStrong, lineWidth: 1) }
                .contentShape(Circle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.92))
        .disabled(estilo == .apagado)
        .accessibilityLabel(etiqueta)
    }
}

// MARK: - Escribir

/// La fila de escritura: ＋ para adjuntar · campo · envío. El campo, al enfocarse, engorda su borde y lo pasa al
/// acento del club: un anillo de foco que sólo cambia de color no lo ve quien no distingue los colores.
struct CompositorTextoChat: View {
    @Binding var borrador: String
    var enFoco: FocusState<Bool>.Binding
    /// Lo que lee VoiceOver en el campo («Mensaje para <coach>»).
    let destino: String
    let alAdjuntar: () -> Void
    let alEnviar: () -> Void

    private var puedeEnviar: Bool { !borrador.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            BotonRedondoChat(etiqueta: "Adjuntar", estilo: .suave, accion: alAdjuntar) {
                IconoDia(.mas, tam: 22, peso: .semibold)
            }

            TextField("", text: $borrador, prompt: Text("Mensaje…").foregroundStyle(Theme.Color.muted))
                .focused(enFoco)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.horizontal, Theme.Spacing.l)
                .frame(minHeight: Theme.Size.toque)
                .background(Theme.Color.surface, in: Capsule())
                .overlay {
                    Capsule().strokeBorder(
                        enFoco.wrappedValue ? Theme.Color.accentText : Theme.Color.hairlineStrong,
                        lineWidth: enFoco.wrappedValue ? 2 : 1
                    )
                }
                .submitLabel(.send)
                .onSubmit(alEnviar)
                .accessibilityLabel(destino)

            BotonRedondoChat(etiqueta: "Enviar mensaje", estilo: puedeEnviar ? .acento : .apagado, accion: alEnviar) {
                IconoChat(.enviar, tam: 20, peso: .bold)
            }
        }
    }
}

// MARK: - El adjunto esperando

/// Un adjunto ya elegido y aún sin enviar: qué es, con descartar y enviar. Es la puerta de «revisar antes de enviar»:
/// el adjunto sólo sale del teléfono cuando el atleta toca enviar.
struct CompositorAdjuntoChat: View {
    let adjunto: ChatPickedAttachment
    let alDescartar: () -> Void
    let alEnviar: () -> Void

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            AdjuntoPendienteChat(adjunto: adjunto)
            Spacer(minLength: Theme.Spacing.s)
            BotonRedondoChat(etiqueta: "Descartar adjunto", estilo: .suave, accion: alDescartar) {
                IconoDia(.cerrar, tam: 18, peso: .bold)
            }
            BotonRedondoChat(etiqueta: "Enviar adjunto", estilo: .acento, accion: alEnviar) {
                IconoChat(.enviar, tam: 20, peso: .bold)
            }
        }
    }
}

/// La vista previa compacta de un adjunto elegido: una miniatura (foto) o el glifo de su tipo (vídeo, archivo, voz),
/// con su título y su tamaño o duración. Sólo pinta; el descartar y el enviar son del compositor.
struct AdjuntoPendienteChat: View {
    let adjunto: ChatPickedAttachment
    @State private var miniatura: UIImage?

    private static let lado: CGFloat = 48

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            ZStack {
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .fill(Theme.Color.surfaceElevated)
                if let miniatura {
                    Image(uiImage: miniatura)
                        .resizable().scaledToFill()
                        .frame(width: Self.lado, height: Self.lado)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
                } else {
                    IconoChat(glifo, tam: 20)
                        .foregroundStyle(Theme.Color.foreground)
                }
                if adjunto.kind == .video {
                    IconoChat(.play, tam: 12, peso: .bold)
                        .foregroundStyle(Theme.Color.foreground)
                        .frame(width: 24, height: 24)
                        .background(.regularMaterial, in: Circle())
                }
            }
            .frame(width: Self.lado, height: Self.lado)
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous).strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))

            VStack(alignment: .leading, spacing: 0) {
                Text(titulo)
                    .papel(.rotulo)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Text(detalle)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
            }
        }
        .task(id: adjunto.localURL) { await cargaMiniatura() }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Adjunto listo para enviar: \(titulo)")
    }

    private var glifo: GlifoChat {
        switch adjunto.kind {
        case .voice: return .onda
        case .image: return .foto
        case .video: return .video
        case .file: return .documento
        }
    }

    private var titulo: String {
        switch adjunto.kind {
        case .voice: return "Nota de voz"
        case .image: return "Foto"
        case .video: return "Vídeo"
        case .file: return adjunto.filename
        }
    }

    private var detalle: String {
        if let segundos = adjunto.meta.durationSeconds { return Formato.clock(segundos) }
        if adjunto.sizeBytes > 0 { return ByteCountLabel.format(adjunto.sizeBytes) }
        return "Listo para enviar"
    }

    @MainActor
    private func cargaMiniatura() async {
        guard adjunto.kind == .image else { return }
        let ruta = adjunto.localURL.path
        miniatura = await Task.detached { UIImage(contentsOfFile: ruta) }.value
    }
}
