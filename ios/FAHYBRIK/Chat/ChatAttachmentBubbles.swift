import SwiftUI
import UIKit

// Las burbujas de voz y de foto, en LAS DOS direcciones (atleta = acento del club, coach = superficie). El vídeo y el
// archivo viven en `ChatMediaBubbles.swift`; la forma y la superficie que comparten todas, en `ChatBurbuja.swift`.

// MARK: - Voice bubble (real playback)

extension ChatAttachmentSource {
    /// Los mismos bytes, dichos con las palabras del reproductor compartido. El chat sabe volverse una fuente de voz;
    /// el reproductor no debe saber de adjuntos.
    var fuenteDeVoz: FuenteDeVoz { FuenteDeVoz(local: localURL, remota: remoteURL) }
}

/// La burbuja es del chat; el motor de debajo (`ReproductorDeVoz`, `OndaDeVoz`, `OndaConProgreso`) es compartido con
/// cualquier otra pantalla que lleve la voz del coach — hoy, el comunicado publicado.
struct ChatVoiceBubble: View {
    let isMe: Bool
    let source: ChatAttachmentSource
    let metaDuration: Double?
    let bearer: String?
    @StateObject private var player = ReproductorDeVoz()

    private var tintaDelGlifo: Color { isMe ? Theme.Color.accentOn : Theme.Color.accentText }
    private var tintaDeLaOnda: Color { isMe ? Theme.Color.accentOn : Theme.Color.foreground }
    /// Lo que aún no ha sonado, atenuado hacia el fondo de la burbuja.
    private var tintaPorSonar: Color { (isMe ? Theme.Color.accentOn : Theme.Color.muted).opacity(0.45) }

    private var duracion: String {
        Formato.clock(player.duracionReal ?? metaDuration ?? 0)
    }

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            Button { player.alternar(fuente: source.fuenteDeVoz, bearer: bearer) } label: {
                Group {
                    if player.cargando {
                        ProgressView().tint(tintaDelGlifo)
                    } else if player.fallo {
                        IconoChat(.alertaRellena, tam: 20, peso: .bold)
                    } else if player.sonando {
                        IconoChat(.pausa, tam: 20, peso: .bold)
                    } else {
                        IconoChat(.play, tam: 20, peso: .bold)
                    }
                }
                .foregroundStyle(tintaDelGlifo)
                .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle(escala: 0.92))
            .accessibilityLabel(player.sonando ? "Pausar nota de voz" : "Reproducir nota de voz")

            OndaConProgreso(barras: OndaDeVoz.barras(semilla: source.fuenteDeVoz.semilla),
                            avance: player.avance,
                            sonada: tintaDeLaOnda, porSonar: tintaPorSonar)
                .frame(width: 108, height: 24)

            Text(duracion)
                .papel(.notaFuerte)
                .monospacedDigit()
                .foregroundStyle(isMe ? Theme.Color.accentOn : Theme.Color.muted)
        }
        .padding(.leading, Theme.Spacing.xs)
        .padding(.trailing, MedidasChat.aireHorizontalBurbuja)
        .burbujaChat(mia: isMe)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Nota de voz, \(duracion)")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { player.alternar(fuente: source.fuenteDeVoz, bearer: bearer) }
    }
}

// MARK: - Image bubble

struct ChatImageBubble: View {
    let isMe: Bool
    let source: ChatAttachmentSource
    let aspect: Double?          // ancho/alto de los metadatos: reserva el hueco antes de cargar
    let bearer: String?

    @State private var image: UIImage?
    @State private var failed = false
    @State private var showViewer = false

    private var displaySize: CGSize {
        let ratio: CGFloat = image.map { $0.size.width / max(1, $0.size.height) }
            ?? aspect.map { CGFloat($0) } ?? 1
        if ratio >= 1 {                        // apaisada / cuadrada
            let w = MedidasChat.fotoMaxAncho
            let h = min(MedidasChat.fotoMaxAlto, w / ratio)
            return CGSize(width: w, height: h)
        } else {                               // vertical
            let h = MedidasChat.fotoMaxAlto
            let w = min(MedidasChat.fotoMaxAncho, h * ratio)
            return CGSize(width: w, height: h)
        }
    }

    var body: some View {
        Button { if image != nil { Haptics.light(); showViewer = true } } label: {
            ZStack {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .frame(width: displaySize.width, height: displaySize.height)
                        .clipped()
                } else if failed {
                    Rectangle()
                        .fill(Theme.Color.surfaceSunken)
                        .frame(width: displaySize.width, height: displaySize.height)
                        .overlay {
                            IconoChat(.fotoRota, tam: 28, peso: .regular)
                                .foregroundStyle(Theme.Color.muted)
                        }
                } else {
                    // Cargando: el esqueleto con la MISMA forma que la foto que llega.
                    SkeletonBar(width: displaySize.width, height: displaySize.height, radius: 0)
                }
            }
            .clipShape(FormaBurbujaChat(mia: isMe))
            .overlay { FormaBurbujaChat(mia: isMe).stroke(Theme.Color.hairline, lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .task(id: taskKey) { await load() }
        .fullScreenCover(isPresented: $showViewer) {
            if let image { ChatImageViewer(image: image) }
        }
        .accessibilityLabel(failed ? "Foto. No se pudo cargar." : "Foto. Toca para ampliar.")
    }

    private var taskKey: String { source.remoteURL ?? source.localURL?.absoluteString ?? "" }

    // @MainActor: la decodificación pesada corre fuera del hilo principal (Task.detached / el actor del loader), pero
    // la asignación al @State se reanuda aquí.
    @MainActor
    private func load() async {
        failed = false
        if let local = source.localURL {
            let img = await Task.detached { UIImage(contentsOfFile: local.path) }.value
            if let img { image = img } else { failed = true }
            return
        }
        guard let remote = source.remoteURL, let bearer else { failed = true; return }
        do { image = try await ChatMediaLoader.shared.image(remoteURL: remote, bearer: bearer) }
        catch { failed = true }
    }
}

/// Visor a pantalla completa con zoom (pellizco y arrastre; doble toque para restablecer).
struct ChatImageViewer: View {
    let image: UIImage
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @GestureState private var pinch: CGFloat = 1

    /// Lo más que se amplía una foto con el pellizco.
    private static let zoomMaximo: CGFloat = 4
    /// A cuánto salta el doble toque.
    private static let zoomDelDobleToque: CGFloat = 2.5

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .scaleEffect(max(1, scale * pinch))
                .offset(offset)
                .gesture(
                    MagnificationGesture()
                        .updating($pinch) { v, s, _ in s = v }
                        .onEnded { v in scale = max(1, min(Self.zoomMaximo, scale * v)) }
                )
                .gesture(
                    DragGesture()
                        .onChanged { v in if scale > 1 { offset = v.translation } }
                        .onEnded { _ in if scale <= 1 { withAnimation(.spring) { offset = .zero } } }
                )
                .onTapGesture(count: 2) {
                    withAnimation(.spring) { scale = scale > 1 ? 1 : Self.zoomDelDobleToque; offset = .zero }
                }
                .accessibilityLabel("Foto ampliada")
            VStack {
                HStack {
                    Spacer()
                    BotonCierreSobreMedio(alCerrar: { dismiss() })
                }
                Spacer()
            }
            .padding(Theme.Spacing.s)
        }
        .statusBarHidden()
    }
}

/// El cierre de un visor de medios (foto, vídeo): una ✕ de 48 pt sobre un disco oscuro, que se lee sea cual sea la
/// foto que hay debajo.
struct BotonCierreSobreMedio: View {
    let alCerrar: () -> Void

    var body: some View {
        Button { Haptics.light(); alCerrar() } label: {
            IconoDia(.cerrar, tam: 18, peso: .bold)
                .foregroundStyle(.white)
                .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                .background(Color.black.opacity(MedidasChat.opacidadDelDiscoSobreMedio), in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.92))
        .accessibilityLabel("Cerrar")
    }
}
