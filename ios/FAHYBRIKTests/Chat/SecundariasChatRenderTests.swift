import XCTest
import SwiftUI
@testable import FAHYBRIK

// EL CHAT, VISTO DE VERDAD — la galería de revisión de la pantalla del chat y sus hojas.
//
// Como la galería de Carreras: no compara píxeles, falla si una vista revienta y deja los PNG en `FAHYBRIK_CAPTURAS`
// (`<scratchpad>/hoy/ios-sec-chat/`) para revisarlos a ojo. Se monta en una ventana de verdad (`CapturaVentana`) porque
// `ImageRenderer` no dibuja `ScrollView` y el chat es un scroll con un compositor anclado.
final class SecundariasChatRenderTests: XCTestCase {

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    @MainActor
    private func captura(_ vista: some View, _ nombre: String, oscuro: Bool = false, club: ClubTheme? = nil,
                         alto: CGFloat = 780, tamano: DynamicTypeSize = .large) {
        let sufijo = (oscuro ? "oscuro" : "claro") + (club == nil ? "" : "-azul")
        CapturaVentana.guarda(
            CapturaVentana.png(vista, alto: alto, oscuro: oscuro, tamano: tamano, club: club),
            nombre: "chat-\(nombre)-\(sufijo)", en: self
        )
    }

    // MARK: Fixtures (datos de ejemplo, no de producción)

    private static let coach = IdentidadCoachChat(nombre: "Marta Ruiz")

    private static func texto(_ id: String, _ mio: Bool, _ cuerpo: String, hora: String = "hoy",
                              estado: ChatMessage.Status = .sent, contexto: ChatContextRef? = nil) -> ChatMessage {
        ChatMessage(id: id, sender: mio ? .me : .coach, kind: .text(cuerpo), timestamp: hora, status: estado, contexto: contexto)
    }

    private static let referencia = ChatContextRef(
        kind: "session", ref: "a1", sub: nil, label: "Fuerza A · hoy",
        preview: "Sentadilla 4×5 · 80% · descanso 90 s", exists: true, state: "pending"
    )

    private static var conversacion: [ChatMessage] {
        [
            texto("1", true, "Acabo la simulación. Las series de carrera bien, pero en el sled se me disparó el pulso.", hora: "ayer"),
            texto("2", false, "Es normal, el sled siempre manda el pulso arriba. Sal más controlado los primeros 10 metros y no bloquees la respiración.", hora: "ayer"),
            ChatMessage(id: "3", sender: .me, kind: .voice(source: ChatAttachmentSource(remoteURL: "/v"), duration: 23), timestamp: "hoy", status: .sent),
            texto("4", true, "¿Cambio la sentadilla de hoy si vengo cargado?", contexto: referencia),
            ChatMessage(id: "5", sender: .coach, kind: .file(source: ChatAttachmentSource(remoteURL: "/f"), name: "progresion-sentadilla.pdf", sizeBytes: 482_000), timestamp: "hoy", status: .sent),
            texto("6", true, "Me he despertado con la pierna cargada, ¿cambio el metcon por rodillo?", estado: .failed),
        ]
    }

    private static var conMedios: [ChatMessage] {
        [
            ChatMessage(id: "m1", sender: .coach, kind: .image(source: ChatAttachmentSource(remoteURL: "/i"), aspect: 1.5), timestamp: "hoy", status: .sent),
            ChatMessage(id: "m2", sender: .me, kind: .video(source: ChatAttachmentSource(remoteURL: "/vd"), duration: 48), timestamp: "hoy", status: .sent),
            texto("m3", true, "Te lo mando para que veas la técnica.", estado: .sending),
        ]
    }

    private static func adjunto(_ tipo: ChatAttachmentKind, _ nombre: String, bytes: Int, segundos: Int? = nil) -> ChatPickedAttachment {
        var meta = ChatAttachmentMeta()
        meta.sizeBytes = bytes
        meta.durationMs = segundos.map { $0 * 1000 }
        return ChatPickedAttachment(kind: tipo, localURL: URL(fileURLWithPath: "/tmp/\(nombre)"), filename: nombre,
                                    mimeType: "application/octet-stream", sizeBytes: bytes, meta: meta)
    }

    // MARK: La pantalla, montada como la monta ChatView (sin su estado)

    private struct Pantalla<Banda: View, Pie: View>: View {
        let coach: IdentidadCoachChat
        let banda: Banda
        let pie: Pie
        init(coach: IdentidadCoachChat, @ViewBuilder banda: () -> Banda, @ViewBuilder pie: () -> Pie) {
            self.coach = coach; self.banda = banda(); self.pie = pie()
        }
        var body: some View {
            VStack(spacing: 0) {
                CabeceraChat(coach: coach, conCierre: true)
                Hairline()
                banda
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Color.background)
            .safeAreaInset(edge: .bottom, spacing: 0) { pie }
        }
    }

    private struct PieDePrueba: View {
        var borrador: String = ""
        var etiquetaContexto: String?
        var adjunto: ChatPickedAttachment?
        @State private var texto = ""
        @FocusState private var foco: Bool
        var body: some View {
            PieDelChat {
                if let etiquetaContexto { ChipDeContexto(etiqueta: etiquetaContexto, onQuitar: {}) }
                if let adjunto {
                    CompositorAdjuntoChat(adjunto: adjunto, alDescartar: {}, alEnviar: {})
                } else {
                    CompositorTextoChat(borrador: $texto, enFoco: $foco, destino: "Mensaje para Marta", alAdjuntar: {}, alEnviar: {})
                        .onAppear { texto = borrador }
                }
            }
        }
    }

    private func conversacion(_ mensajes: [ChatMessage], pie: PieDePrueba = PieDePrueba()) -> some View {
        Pantalla(coach: Self.coach) {
            ConversacionChat(mensajes: mensajes, coach: Self.coach.rotuloDeAutor, bearer: nil,
                             abrirContexto: { _ in { } })
        } pie: { pie }
    }

    // MARK: Pruebas

    @MainActor
    func testConversacion() {
        captura(conversacion(Self.conversacion), "conversacion")
        captura(conversacion(Self.conversacion), "conversacion", oscuro: true)
        captura(conversacion(Self.conversacion), "conversacion", club: .pruebaAzul)
        captura(conversacion(Self.conversacion), "conversacion", oscuro: true, club: .pruebaAzul)
        captura(conversacion(Self.conversacion), "conversacion-ax3", tamano: .accessibility3)
    }

    @MainActor
    func testMediosYEnvio() {
        captura(conversacion(Self.conMedios), "medios")
        captura(conversacion(Self.conMedios), "medios", oscuro: true, club: .pruebaAzul)
    }

    @MainActor
    func testElCompositor() {
        let espera = conversacion(Self.conversacion, pie: PieDePrueba(borrador: "Hoy me he encontrado…"))
        captura(espera, "compositor-borrador")
        captura(conversacion(Self.conversacion, pie: PieDePrueba(etiquetaContexto: "Fuerza A · hoy")), "compositor-contexto")
        captura(conversacion(Self.conversacion, pie: PieDePrueba(etiquetaContexto: "Fuerza A · hoy")), "compositor-contexto", oscuro: true, club: .pruebaAzul)
        captura(conversacion(Self.conversacion, pie: PieDePrueba(adjunto: Self.adjunto(.file, "analitica-sangre-septiembre.pdf", bytes: 1_200_000))), "compositor-adjunto")
        captura(conversacion(Self.conversacion, pie: PieDePrueba(adjunto: Self.adjunto(.voice, "nota.m4a", bytes: 90_000, segundos: 17))), "compositor-voz", oscuro: true)
    }

    @MainActor
    func testLosEstados() {
        let pie = PieDePrueba()
        for oscuro in [false, true] {
            captura(Pantalla(coach: Self.coach, banda: {
                BandaCentradaChat { ChatVacioState(coachInitials: Self.coach.iniciales, prompt: Self.coach.invitacion, onArranque: {}) }
            }, pie: { pie }), "vacio", oscuro: oscuro)
            captura(Pantalla(coach: Self.coach, banda: { BandaCentradaChat { ChatErrorState(onReintentar: {}) } }, pie: { pie }), "error", oscuro: oscuro)
            captura(Pantalla(coach: Self.coach, banda: { ChatCargandoState() }, pie: { pie }), "cargando", oscuro: oscuro)
        }
        captura(Pantalla(coach: Self.coach, banda: {
            BandaCentradaChat { ChatVacioState(coachInitials: Self.coach.iniciales, prompt: Self.coach.invitacion, onArranque: {}) }
        }, pie: { pie }), "vacio", club: .pruebaAzul)
        // Sin nombre de coach: silueta y textos neutros, nada inventado.
        let sinNombre = IdentidadCoachChat(nombre: nil)
        captura(Pantalla(coach: sinNombre, banda: {
            BandaCentradaChat { ChatVacioState(coachInitials: sinNombre.iniciales, prompt: sinNombre.invitacion, onArranque: {}) }
        }, pie: { pie }), "vacio-sin-nombre")
        captura(Pantalla(coach: Self.coach, banda: {
            BandaCentradaChat { ChatVacioState(coachInitials: Self.coach.iniciales, prompt: Self.coach.invitacion, onArranque: {}) }
        }, pie: { pie }), "vacio-ax3", tamano: .accessibility3)
    }

    // MARK: Las hojas

    private var seleccion: [(titulo: String, entrenos: [EntrenoElegible])] {
        [
            (titulo: "Hoy", entrenos: [EntrenoElegible(assignmentId: "a1", titulo: "Fuerza A", cuando: "hoy", pie: "Sentadilla 4×5 · 4 bloques", hecho: false)]),
            (titulo: "Esta semana", entrenos: [
                EntrenoElegible(assignmentId: "a2", titulo: "Series 6×800", cuando: "jue", pie: "6×800 m · 2 bloques", hecho: false),
                EntrenoElegible(assignmentId: "a3", titulo: "Rodaje suave", cuando: "ayer", pie: nil, hecho: true),
            ]),
        ]
    }

    @MainActor
    func testElSelectorDeEntreno() {
        let datos = SelectorDeEntreno(secciones: seleccion, cargando: true, elegido: "a2", onElegir: { _ in })
        captura(datos, "selector")
        captura(datos, "selector", oscuro: true, club: .pruebaAzul)
        captura(SelectorDeEntreno(secciones: [], cargando: false, elegido: nil, onElegir: { _ in }), "selector-vacio")
    }

    private func nota(_ fase: VoiceRecorderEngine.Phase) -> some View {
        NotaDeVozHoja(
            lectura: LecturaNotaDeVoz(
                fase: fase, transcurrido: 14, duracion: 23,
                niveles: Array(repeating: LecturaNotaDeVoz.nivelesDeRelleno, count: 3).flatMap { $0 },
                avance: 0.4, sonando: false
            ),
            alCerrar: {}, alGrabar: {}, alParar: {}, alEscuchar: {}, alRepetir: {}, alEnviar: {}, alAbrirAjustes: {}
        )
    }

    @MainActor
    func testLaNotaDeVoz() {
        for (nombre, fase) in [("reposo", VoiceRecorderEngine.Phase.idle), ("grabando", .recording), ("grabada", .recorded), ("sin-micro", .denied)] {
            captura(nota(fase), "voz-\(nombre)", alto: 420)
        }
        captura(nota(.recorded), "voz-grabada", oscuro: true, club: .pruebaAzul, alto: 420)
    }

    // MARK: El pie

    @MainActor
    func testElMensajeAbreSuTarjeta() {
        // Una tarjeta con destino y otra sin él: la que no lleva a ningún sitio no insinúa el toque.
        let ambas = VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            TarjetaDeContexto(ref: Self.referencia, mio: false, onAbrir: {})
            TarjetaDeContexto(ref: Self.referencia, mio: true)
            ChipDeContexto(etiqueta: "Fuerza A · hoy", onQuitar: {})
        }
        .padding(Theme.Spacing.pantalla)
        .background(Theme.Color.background)
        captura(ambas, "tarjetas", alto: 380)
        captura(ambas, "tarjetas", oscuro: true, club: .pruebaAzul, alto: 380)
    }
}
