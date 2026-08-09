import SwiftUI

// LA BANDEJA — «Del coach».
//
// El sujeto es EL CONJUNTO Y SU ESTADO, no un comunicado suelto. Por eso lo
// primero que se ve no es lo más reciente sino lo que te BLOQUEA, y por eso la
// bandeja en calma se ve distinta de la bandeja llena: «estás al día» es
// información, y hoy no existe en ninguna parte de la app.
//
// El orden NO es cronológico: (1) lo que hay que decidir, (2) lo que hay que
// hacer, (3) el foco que no caduca, (4) lo que hay que entender. Un briefing de
// doce semanas por encima de una tarea que vence hoy sería ordenar por fecha de
// publicación, que es justo lo que hace el chat y por lo que las cosas se
// pierden. Dentro de cada cajón manda el orden del servidor.
//
// Sin nada publicado degrada a VACÍO explicado, y la salida es el chat: la
// frontera entre las dos superficies se dice, no se supone.

struct ComunicadosBandejaView: View {
    var bearer: String?
    /// Comunicado a abrir nada más entrar — por aquí entra un push.
    var abrirId: String?

    @Environment(AppDataStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openChat) private var openChat

    @State private var ruta: [String] = []
    @State private var revelado = false
    /// UNA sola para toda la pila: los actos se hacen desde la lista Y desde los
    /// detalles, y con una instancia por pantalla el aviso de «se envió» o «se
    /// guardó sin conexión» se perdería al navegar.
    @State private var acciones: ComunicadosAcciones?

    private var bandeja: BandejaComunicados { store.bandejaComunicados }

    /// El nombre del coach para el vacío, donde no hay ningún comunicado del que
    /// sacarlo: se lee del hilo, que es donde ya vive. Sin él, «tu coach».
    private var nombreCoach: String {
        Comunicado.nombreCoach(store.chatThread.value?.coachName)
    }

    var body: some View {
        NavigationStack(path: $ruta) {
            contenido
                .background(Theme.Color.background.ignoresSafeArea())
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: String.self) { id in
                    destino(id)
                }
        }
        .task {
            if acciones == nil { acciones = ComunicadosAcciones(store: store, bearer: bearer) }
            await store.refreshCommunications()
            // El push trae el id: se abre ESE comunicado, no una lista donde hay
            // que volver a buscarlo.
            if let abrirId, bandeja.todos.contains(where: { $0.id == abrirId }) {
                ruta = [abrirId]
            }
            withAnimation(Theme.Motion.reveal) { revelado = true }
        }
    }

    // MARK: - Chrome

    private var cabecera: some View {
        HStack(spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 2) {
                LabelText(text: "Lo que te ha publicado", color: Theme.Color.accentText)
                Text("Del coach")
                    .scaledFont(28, weight: .heavy, relativeTo: .title, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            Button {
                Haptics.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: 32, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cerrar")
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.s)
    }

    @ViewBuilder
    private var contenido: some View {
        VStack(spacing: 0) {
            cabecera
            if bandeja.estaVacia {
                if store.communications.hasLoaded {
                    CenteredScreen { vacio }
                } else {
                    CenteredScreen { cargando }
                }
            } else {
                FillingScreen {
                    ListaComunicados(
                        bandeja: bandeja,
                        revelado: revelado,
                        onAbrir: { ruta.append($0.id) },
                        onMarcarTarea: { tarea in Task { await acciones?.marcarHecho(tarea) } }
                    )
                }
                .refreshable { await store.refreshCommunications(force: true) }
            }
        }
    }

    private var cargando: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SkeletonBar(height: 18)
            SkeletonBar(width: 220, height: 14)
            SkeletonBar(height: 74)
            SkeletonBar(height: 74)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .accessibilityLabel("Cargando")
    }

    private var vacio: some View {
        RedesignEmptyState(
            symbol: "tray",
            title: "Aquí no hay nada todavía",
            message: "Cuando \(nombreCoach) te publique un protocolo, una tarea o el porqué de tu plan, vivirá aquí. El día a día sigue en el chat.",
            // Primero se apunta la salida y luego se cierra: dos presentaciones
            // no pueden levantarse a la vez, así que el chat lo abre AppShell
            // cuando esta bandeja ya se ha ido.
            exit: .action(title: "Abrir el chat", perform: {
                openChat()
                dismiss()
            }),
            note: "Lo que se publica aquí lleva estado: \(nombreCoach) ve si lo has hecho, no solo si lo has abierto."
        )
    }

    // MARK: - Navegación

    /// El destino se resuelve por id contra la porción compartida, no con una
    /// copia congelada al navegar: así el detalle se repinta solo cuando el acto
    /// cambia el estado, y un comunicado que el coach archiva mientras lo tienes
    /// abierto no se queda pintado como si siguiera vivo.
    @ViewBuilder
    private func destino(_ id: String) -> some View {
        if let c = store.bandejaComunicados.todos.first(where: { $0.id == id }),
           let acciones {
            ComunicadoDetalleView(
                comunicado: c,
                acciones: acciones,
                onVolver: { ruta.removeLast() },
                // El pie de una nota lleva a otro comunicado: se APILA, no se
                // sustituye — volver tiene que devolverte al briefing que
                // estabas leyendo, no sacarte a la lista.
                onAbrirEnlazado: { ruta.append($0) }
            )
        } else {
            CenteredScreen {
                RedesignEmptyState(
                    symbol: "tray",
                    title: "Esto ya no está",
                    message: "Tu coach lo ha retirado. Si te queda alguna duda, el chat sigue abierto.",
                    exit: .action(title: "Volver", perform: { ruta = [] })
                )
            }
            .background(Theme.Color.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}
