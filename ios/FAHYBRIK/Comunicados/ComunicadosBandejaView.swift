import SwiftUI

// LA BANDEJA — «Del coach».
//
// El sujeto es EL CONJUNTO Y SU ESTADO, no un comunicado suelto. Por eso lo primero que se ve no es lo
// más reciente sino lo que te BLOQUEA, y por eso la bandeja en calma se ve distinta de la bandeja llena:
// «estás al día» es información, y hoy no existe en ninguna parte de la app.
//
// Esta vista NO decide qué se ve: LEE el store, pide lo suyo, traduce a un `EstadoBandeja`
// (`DecideBandeja`, con sus tests) y se lo da a `ContenidoBandeja`, que solo pinta. Aquí viven la
// NAVEGACIÓN, la CARGA y la cola de ACTOS.
//
// Sin nada publicado degrada a VACÍO explicado, y la salida es el chat: la frontera entre las dos
// superficies se dice, no se supone. Y un fallo de carga sin nada guardado se dice con su reintento, no
// se disfraza de vacío.

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

    private var estado: EstadoBandeja {
        DecideBandeja.estado(
            bandeja,
            cargada: store.communications.hasLoaded,
            fallo: store.communications.loadFailed
        )
    }

    /// El nombre del coach para el vacío, donde no hay ningún comunicado del que
    /// sacarlo: se lee del hilo, que es donde ya vive. Sin él, «tu coach».
    private var nombreCoach: String {
        Comunicado.nombreCoach(store.chatThread.value?.coachName)
    }

    var body: some View {
        NavigationStack(path: $ruta) {
            ContenidoBandeja(
                estado: estado,
                nombreCoach: nombreCoach,
                revelado: revelado,
                alCerrar: { dismiss() },
                alAbrir: { ruta.append($0.id) },
                alMarcarTarea: { tarea in Task { await acciones?.marcarHecho(tarea) } },
                // Primero se apunta la salida y luego se cierra: dos presentaciones no pueden
                // levantarse a la vez, así que el chat lo abre AppShell cuando esta bandeja ya se ha ido.
                alAbrirChat: {
                    openChat(nil)
                    dismiss()
                },
                alRecargar: { await store.refreshCommunications(force: true) }
            )
            .background(Theme.Color.background.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: String.self) { id in
                destino(id)
            }
        }
        // La sesión baja por el entorno para que la voz del coach pueda ir a por
        // sus bytes desde cualquier detalle, sin cruzar el bearer por los cinco
        // cuerpos hasta llegar a una fila.
        .environment(\.bearerDeSesion, bearer)
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
            ComunicadoRetirado(alVolver: { ruta = [] })
                .background(Theme.Color.background.ignoresSafeArea())
                .toolbar(.hidden, for: .navigationBar)
        }
    }
}

// MARK: - Lo que se pinta

/// La cabecera y el estado que toca: la raíz sin red ni navegación, que es lo que miran las capturas.
struct ContenidoBandeja: View {
    let estado: EstadoBandeja
    let nombreCoach: String
    var revelado: Bool = true
    let alCerrar: () -> Void
    let alAbrir: (Comunicado) -> Void
    let alMarcarTarea: (Comunicado) -> Void
    let alAbrirChat: () -> Void
    let alRecargar: () async -> Void

    var body: some View {
        VStack(spacing: 0) {
            CabeceraBandeja(alCerrar: alCerrar)
            switch estado {
            case .cargando:
                FillingScreen { EsqueletoBandeja() }
            case .error:
                FillingScreen {
                    ErrorDeBandeja(alReintentar: alRecargar)
                    .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
                }
            case .vacia:
                FillingScreen { VacioBandeja(nombreCoach: nombreCoach, alAbrirChat: alAbrirChat) }
            case .conCosas(let bandeja):
                FillingScreen {
                    ListaComunicados(bandeja: bandeja, revelado: revelado, onAbrir: alAbrir, onMarcarTarea: alMarcarTarea)
                }
                .refreshable { await alRecargar() }
            }
        }
    }
}

/// «Lo que te ha publicado» y el título, con el cierre. Fija: no scrollea nunca.
struct CabeceraBandeja: View {
    let alCerrar: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Lo que te ha publicado")
                    .papel(.etiqueta)
                    .foregroundStyle(Theme.Color.muted)
                Text("Del coach")
                    .papel(.saludo)
                    .foregroundStyle(Theme.Color.foreground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            BotonCromoDia(.cerrar, etiqueta: "Cerrar", accion: alCerrar)
        }
        // El círculo del cromo cae 5 pt dentro de su área de 48: el margen lo compensa.
        .padding(EdgeInsets(top: Theme.Spacing.s, leading: Theme.Spacing.pantalla, bottom: Theme.Spacing.s, trailing: Theme.Spacing.pantalla - 5))
    }
}

/// El atleta recién dado de alta: ni una fila, y aun así con sujeto y con salida — la frontera con el chat
/// se dice, no se supone.
struct VacioBandeja: View {
    let nombreCoach: String
    let alAbrirChat: () -> Void

    var body: some View {
        SujetoDia(
            tono: .acento,
            etiqueta: "Aquí no hay nada todavía. Cuando \(nombreCoach) te publique algo, vivirá aquí."
        ) {
            KickerDia("Del coach")
            TituloDeSujeto("Aquí no hay nada todavía")
            ApoyoDia("Cuando \(nombreCoach) te publique un protocolo, una tarea o el porqué de tu plan, vivirá aquí. El día a día sigue en el chat.")
        } abajo: {
            BotonAccionComunicado(titulo: "Abrir el chat", simbolo: "bubble.left", accion: alAbrirChat)
            Text("Lo que se publica aquí lleva estado: \(nombreCoach) ve si lo has hecho, no solo si lo has abierto.")
                .papel(.nota)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
    }
}

/// La primera carga en frío: la MISMA forma que lo que llega (la pregunta con su botón, el título de una
/// sección y tres filas), para que nada salte al llegar los datos.
struct EsqueletoBandeja: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                SkeletonBar(width: 90, height: 15)
                SkeletonBar(height: 24)
                SkeletonBar(width: 220, height: 15)
                SkeletonBar(height: Theme.Size.accion)
            }
            .padding(Theme.Spacing.l)
            .tarjetaComunicado(alAncho: true)

            SkeletonBar(width: 150, height: 24)
            VStack(spacing: 0) {
                ForEach(0..<3, id: \.self) { i in
                    if i > 0 { Hairline() }
                    HStack(alignment: .top, spacing: Theme.Spacing.m + 2) {
                        SkeletonBar(width: FichaDia<IconoDia>.lado, height: FichaDia<IconoDia>.lado)
                        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                            SkeletonBar(width: 90, height: 15)
                            SkeletonBar(height: 17)
                            SkeletonBar(width: 200, height: 15)
                        }
                    }
                    .padding(EdgeInsets(top: 14, leading: Theme.Spacing.l, bottom: 14, trailing: Theme.Spacing.l))
                }
            }
            .tarjetaComunicado(alAncho: true)
        }
        .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando")
    }
}

/// El comunicado que el coach ha retirado mientras lo tenías abierto: se dice y se vuelve a la lista.
struct ComunicadoRetirado: View {
    let alVolver: () -> Void

    var body: some View {
        FillingScreen {
            SujetoDia(
                tono: .neutro,
                etiqueta: "Esto ya no está. Tu coach lo ha retirado."
            ) {
                KickerDia("Del coach")
                TituloDeSujeto("Esto ya no está")
                ApoyoDia("Tu coach lo ha retirado. Si te queda alguna duda, el chat sigue abierto.")
            } abajo: {
                BotonAccionComunicado(titulo: "Volver", simbolo: "chevron.left", accion: alVolver)
            }
            .padding(EdgeInsets(top: Theme.Spacing.l, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
        }
    }
}

/// La bandeja no cargó y no hay copia guardada: se dice qué, dónde estás y qué hacer, con su reintento. Es
/// un sujeto de peligro que se anuncia solo a VoiceOver; el peligro va en el tinte, nunca en el texto.
struct ErrorDeBandeja: View {
    let alReintentar: () async -> Void

    @State private var enMarcha = false

    var body: some View {
        SujetoDia(
            tono: .peligro,
            etiqueta: "No pudimos cargar tu bandeja. Revisa tu conexión e inténtalo de nuevo.",
            anuncia: true
        ) {
            KickerDia("Del coach")
            TituloDeSujeto("No pudimos cargar tu bandeja")
            ApoyoDia("Revisa tu conexión e inténtalo de nuevo.")
        } abajo: {
            BotonAccionComunicado(titulo: enMarcha ? "Reintentando" : "Reintentar", simbolo: "arrow.clockwise", enCurso: enMarcha) {
                enMarcha = true
                Task {
                    await alReintentar()
                    enMarcha = false
                }
            }
        }
    }
}
