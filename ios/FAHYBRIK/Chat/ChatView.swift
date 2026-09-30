import SwiftUI
import UIKit

// EL CHAT CON EL COACH — la conversación directa entre el atleta y su coach. La identidad del coach es un DATO del
// hilo (`chatThread`), nunca un literal.
//
// TRES BANDAS (CONTRATO-UI §6): cabecera fija · conversación (que llena y scrollea, o se centra si está vacía) ·
// compositor anclado abajo. Cada banda es una pieza propia:
//
//   · `CabeceraChat`         quién es el coach y el cierre                       (ChatCabecera)
//   · `ConversacionChat`     la lista de mensajes y su scroll                    (ChatConversacion, ChatBurbuja)
//   · estados sin conversación: cargando · sin estrenar · no cargó              (ChatEstados)
//   · `CompositorTextoChat`  ＋ · campo · envío, o el adjunto esperando         (ChatCompositor)
//
// Esta vista sólo POSEE el estado y los conecta. Lo que decide vive fuera y se prueba solo (`ChatLectura`); de dónde
// sale la conversación, en `ChatView+Conversacion`; cómo se envía, en `ChatView+Envio`.
//
// Presentación: el chat lo levanta `AppShell` como cover (con `\.openChat`) y el Plan como hoja; en ambos hay un
// cierre en la cabecera (`\.isPresented`). Cache-first: se abre con la conversación cacheada del almacén y el stream
// SSE va encima. Los envíos son optimistas, con cola sin red como respaldo.
struct ChatView: View {
    let bearer: String?

    /// Se abre con un sujeto ya puesto cuando viene del menú de una cosa concreta; sin él desde una cabecera. A partir
    /// de ahí el dueño es esta pantalla: el atleta lo quita con la ✕ o lo cambia desde el «+».
    init(bearer: String?, contextoInicial: ChatContextChoice? = nil) {
        self.bearer = bearer
        _contexto = State(initialValue: contextoInicial)
    }

    // La capa de datos cache-first compartida. El historial vive en su porción `chatMessages` y la identidad del coach
    // en `chatThread`, así que la pantalla se abre desde memoria/disco y revalida en silencio — el mismo motor que las
    // demás pestañas. Lo inyecta `AppShell` (cover) o lo re-inyecta el Plan (hoja).
    @Environment(AppDataStore.self) var store

    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented

    // Estado de la conversación. Internos (no `private`) porque las extensiones de `ChatView+*` los leen y escriben.
    @State var messages: [ChatMessage] = []
    @State var draft: String = ""
    @State var isLoading: Bool = true
    @State var loadFailed: Bool = false
    @FocusState var inputFocused: Bool

    /// El nombre del coach, leído del sobre del hilo. Nil = no lo sabemos: se pintan los textos neutros.
    @State var coachName: String? = nil

    /// El id de usuario del propio atleta, aprendido del primer mensaje que envía (la respuesta del POST trae
    /// `senderUserId`). Se persiste para que la autoría sea estable entre arranques sin una ida a la red para «quién
    /// soy».
    @State var myUserId: String? = UserDefaults.standard.string(forKey: ChatView.myUserIdKey)
    static let myUserIdKey = "fahybrik.chat.myUserId"

    /// La entrega en tiempo real la lleva el stream SSE del backend (`liveLoop()`). Este intervalo es la cadencia de
    /// RESPALDO: marca el paso de la recuperación REST y del intento de reconexión cuando el stream se corta o no
    /// puede abrirse, así un servidor sin SSE degrada limpio a un sondeo cada 3 s. Única fuente de esa cadencia.
    static let pollInterval: Duration = .seconds(3)

    // MARK: Sobre qué va el mensaje
    //
    // El contexto es un ADJUNTO más, y por eso entra por el «+» y no por un control nuevo: el coste en pantalla era la
    // restricción del encargo. Espera visible en el compositor hasta que se envía, con el mismo contrato de
    // revisar-antes-de-enviar que ya tienen la foto y la nota de voz.
    @State var contexto: ChatContextChoice?
    @State var mostrarSelector = false
    /// La semana anterior, sólo si el atleta abre el selector. La de ahora ya vive en el almacén; esta se pide una vez y
    /// se recuerda mientras el chat esté abierto — no hay endpoint nuevo para ninguna de las dos.
    @State var semanaAnterior: AthleteWeekPayload?
    @State var cargandoSemanaAnterior = false
    /// Qué se abrió al tocar la tarjeta de un mensaje.
    @State var destinoContexto: DestinoDeContexto?

    // MARK: Adjuntos (voz / foto / vídeo / archivo)
    //
    // Qué fuente de medios está presentando ahora el «＋» del compositor.
    @State var showAttachMenu = false
    @State var activeSheet: AttachmentSheet? = nil
    /// Un error amable y descartable (pasa del límite, falla el selector o la codificación): el aviso de fallo del día.
    @State var aviso: AvisoDia.Contenido? = nil
    /// El adjunto recién capturado, grabado o elegido tras cada fila optimista, por su id local: la fuente del
    /// reintento y de la subida (nunca en el estado de render).
    @State var pendingAttachments: [String: ChatPickedAttachment] = [:]
    /// La URL remota (proxy) una vez subido, para que un reintento tras un ENVÍO caído se salte la subida (ya hecha).
    @State var uploadedURLs: [String: String] = [:]
    /// Una foto, vídeo o archivo que el atleta ha ELEGIDO pero aún no ha enviado: vista previa pendiente en el
    /// compositor (miniatura + descartar ✕ + enviar ↑). Nada se sube ni se envía hasta que toca enviar: elegir nunca
    /// dispara nada solo. (La voz lleva su propio flujo grabar → escuchar → enviar dentro de su hoja.)
    @State var composerAttachment: ChatPickedAttachment? = nil

    enum AttachmentSheet: Identifiable {
        case voice, cameraPhoto, cameraVideo, library, document
        var id: Int { hashValue }
    }

    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    /// El coach tal como lo dicen la cabecera, el vacío y el pie de cada mensaje.
    var coach: IdentidadCoachChat { IdentidadCoachChat(nombre: coachName) }

    var body: some View {
        VStack(spacing: 0) {
            CabeceraChat(coach: coach, conCierre: isPresented, alCerrar: { dismiss() })
            Hairline()
            banda
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Color.background.ignoresSafeArea())
        // El aviso de fallo va ANTES del compositor: así queda justo encima de él y no debajo, lejos de lo que falló.
        .avisoDia($aviso)
        // El compositor va como INSET inferior: se ancla abajo, sube con el teclado y la lista scrollea por encima.
        .safeAreaInset(edge: .bottom, spacing: 0) { pie }
        // Se cancela solo al desmontar la vista.
        .task {
            seedFromCache()
            await loadInitial()
            await liveLoop()
        }
        // El título ya no es «Adjuntar»: este menú también sirve para decir SOBRE QUÉ va el mensaje, y la fila nueva va
        // la ÚLTIMA a propósito — mover las cinco de siempre rompería la memoria muscular de quien ya las usa. Es el
        // diálogo del sistema (su piel no se toca).
        .confirmationDialog("Añadir al mensaje", isPresented: $showAttachMenu, titleVisibility: .visible) {
            Button("Grabar nota de voz") { activeSheet = .voice }
            if cameraAvailable {
                Button("Hacer una foto") { activeSheet = .cameraPhoto }
                Button("Grabar vídeo") { activeSheet = .cameraVideo }
            }
            Button("Foto o vídeo de la galería") { activeSheet = .library }
            Button("Archivo") { activeSheet = .document }
            Button("Sobre un entreno") { abrirSelectorDeEntreno() }
            Button("Cancelar", role: .cancel) {}
        }
        .sheet(item: $activeSheet) { sheet in attachmentSheet(sheet) }
        .sheet(item: $destinoContexto) { destino in
            switch destino {
            case .entrenoHecho(let assignmentId, let titulo):
                ExecutedWorkoutView(
                    assignmentId: assignmentId,
                    fallbackTitle: titulo,
                    bearer: bearer,
                    hrZones: store.identity.value?.hrZones,
                    onClose: { destinoContexto = nil }
                )
            case .entrenoPorHacer(let assignmentId, let titulo):
                SessionExercisesSheet(
                    assignmentId: assignmentId,
                    sessionTitle: titulo,
                    bearer: bearer
                )
            }
        }
        .sheet(isPresented: $mostrarSelector) {
            SelectorDeEntreno(
                secciones: EntrenosSeñalables.secciones(
                    semana: store.planWeek.value?.week,
                    anterior: semanaAnterior
                ),
                cargando: cargandoSemanaAnterior,
                elegido: contexto?.target.ref,
                onElegir: { elegible in
                    contexto = elegible.eleccion
                    mostrarSelector = false
                    Haptics.light()
                }
            )
        }
    }

    // MARK: - La banda de en medio
    //
    // La estrategia de altura la decide el CONTENIDO, no la pantalla (§6.1): con mensajes `llena` y scrollea; sin ellos
    // el MISMO hueco se reparte y `centra`. Qué estado toca lo decide `BandaChat.resolver`; aquí sólo se pinta.

    @ViewBuilder
    private var banda: some View {
        let mensajes = displayMessages
        switch BandaChat.resolver(
            hayMensajes: !mensajes.isEmpty,
            cargando: isLoading,
            historialCargado: store.chatMessages.hasLoaded,
            fallo: loadFailed
        ) {
        case .cargando:
            ChatCargandoState()
        case .error:
            BandaCentradaChat { ChatErrorState { Task { await retryLoad() } } }
        case .vacio:
            BandaCentradaChat {
                ChatVacioState(coachInitials: coach.iniciales, prompt: coach.invitacion) {
                    draft = ChatVacioState.conversationStarter
                    inputFocused = true
                }
            }
        case .conversacion:
            ConversacionChat(
                mensajes: mensajes,
                coach: coach.rotuloDeAutor,
                bearer: bearer,
                onRetry: { retry($0) },
                onDiscard: { discard($0) },
                onDelete: { deleteSentMessage($0) },
                // Nil cuando no hay a dónde ir: la tarjeta entonces no se toca ni lo insinúa.
                abrirContexto: { ref in
                    DestinoDeContexto.para(ref).map { destino in { destinoContexto = destino } }
                }
            )
        }
    }

    @MainActor
    private func retryLoad() async {
        isLoading = true
        loadFailed = false
        await loadInitial()
    }

    // MARK: - El pie

    /// El compositor con lo que espera encima: el sujeto (que va en la misma banda, así chip y compositor se leen como
    /// una pieza — vale igual para una foto: una imagen también puede ser «sobre este entreno») y la fila de escritura
    /// o el adjunto pendiente.
    private var pie: some View {
        PieDelChat {
            if let contexto {
                ChipDeContexto(etiqueta: contexto.etiqueta) {
                    self.contexto = nil
                    Haptics.light()
                }
            }
            if let adjunto = composerAttachment {
                CompositorAdjuntoChat(
                    adjunto: adjunto,
                    alDescartar: discardComposerAttachment,
                    alEnviar: sendComposerAttachment
                )
            } else {
                CompositorTextoChat(
                    borrador: $draft,
                    enFoco: $inputFocused,
                    destino: coach.destinoDelMensaje,
                    alAdjuntar: {
                        Haptics.light()
                        inputFocused = false
                        showAttachMenu = true
                    },
                    alEnviar: send
                )
            }
        }
    }

    /// Abre el selector y, la primera vez, trae la semana anterior. La de ahora ya está en el almacén, así que la lista
    /// se pinta al instante y lo de «Antes» aparece en cuanto llega.
    private func abrirSelectorDeEntreno() {
        mostrarSelector = true
        guard semanaAnterior == nil, !cargandoSemanaAnterior, let bearer else { return }
        cargandoSemanaAnterior = true
        Task {
            defer { cargandoSemanaAnterior = false }
            // Sin semana anterior el selector sigue siendo útil (hoy y esta semana ya están): un fallo aquí no es un
            // error que enseñar.
            semanaAnterior = try? await PlanService.fetchWeek(bearer: bearer, weekOffset: -1).week
        }
    }
}
