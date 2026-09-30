import SwiftUI

// EL CUERPO de la bandeja: los cuatro cajones, pintados.
//
// Vive fuera de `ComunicadosBandejaView` porque esa pantalla es una pila de navegación con su carga, su
// cover y su cola de actos, y esto es lo único que se puede mirar sin nada de eso: dado un reparto, cómo
// queda. Así la prueba de galería dibuja LA MISMA lista que ve el atleta en vez de una reconstrucción
// parecida, que es como una captura acaba pasando por buena mientras la pantalla real está rota.
//
// No sabe de red ni de navegación: recibe el reparto y devuelve los toques.
//
// EL ORDEN no es cronológico y es la decisión de la pantalla: (1) lo que hay que decidir, (2) lo que hay
// que hacer, (3) el foco que no caduca, (4) lo que hay que entender. Un briefing de doce semanas por
// encima de una tarea que vence hoy sería ordenar por fecha de publicación, que es justo lo que hace el
// chat y por lo que las cosas se pierden.

struct ListaComunicados: View {
    let bandeja: BandejaComunicados
    /// Arranca la entrada escalonada. Falso en las capturas, para que dibujen.
    var revelado: Bool = true
    let onAbrir: (Comunicado) -> Void
    /// Cerrar una tarea desde la lista. Nulo en las ya cerradas: el servidor no deshace un «hecho».
    let onMarcarTarea: (Comunicado) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            if bandeja.enCalma {
                lineaEnCalma
                    .staggerReveal(revelado, index: 0)
            }

            ForEach(Array(bandeja.preguntas.enumerated()), id: \.element.id) { i, pregunta in
                tarjetaPregunta(pregunta)
                    .staggerReveal(revelado, index: 1 + i)
            }

            if !bandeja.paraHacer.isEmpty {
                seccion("Para hacer", aparte: InfoPill(text: DetalleDeFila.pendientes(bandeja.pendientesParaHacer), estilo: .velo)) {
                    ListaDia {
                        ForEach(bandeja.paraHacer) { c in filaParaHacer(c) }
                    }
                }
                .staggerReveal(revelado, index: 2)
            }

            if !bandeja.focos.isEmpty {
                seccion("El foco") {
                    ListaDia {
                        ForEach(bandeja.focos) { foco in
                            FilaComunicado(comunicado: foco, lineasDeDetalle: nil) { onAbrir(foco) }
                        }
                    }
                }
                .staggerReveal(revelado, index: 3)
            }

            if !bandeja.notas.isEmpty {
                seccion("Notas") {
                    ListaDia {
                        ForEach(bandeja.notas) { nota in
                            FilaComunicado(comunicado: nota) { onAbrir(nota) }
                        }
                    }
                }
                .staggerReveal(revelado, index: 4)
            }
        }
        .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// La calma también es información, y hoy no la da nadie.
    private var lineaEnCalma: some View {
        HStack(spacing: Theme.Spacing.s) {
            SelloEstadoDia(estado: .hecha, tam: 20)
            Text("Estás al día. Nada que responder ni que hacer.")
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private func seccion<Aparte: View, Contenido: View>(
        _ titulo: String,
        aparte: Aparte,
        @ViewBuilder contenido: () -> Contenido
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia(titulo) { aparte }
            contenido()
        }
    }

    private func seccion<Contenido: View>(
        _ titulo: String,
        @ViewBuilder contenido: () -> Contenido
    ) -> some View {
        seccion(titulo, aparte: EmptyView(), contenido: contenido)
    }

    // MARK: - Las filas de cada cajón

    /// La pregunta, arriba y con el tinte del acento mientras esté abierta. Cuando ya está respondida baja a
    /// tarjeta normal y enseña LO QUE ELEGISTE: una decisión que cambia el plan no puede desaparecer al
    /// contestarla.
    @ViewBuilder
    private func tarjetaPregunta(_ pregunta: Comunicado) -> some View {
        let respondida = pregunta.state == .respondido
        FilaComunicado(
            comunicado: pregunta,
            detalle: DetalleDeFila.pregunta(pregunta),
            onAbrir: { onAbrir(pregunta) },
            pie: {
                if !respondida {
                    BotonAccionDia("Responder", relleno: .acento, completa: true) { onAbrir(pregunta) }
                }
            }
        )
        .tarjetaDia(realce: !respondida, alAncho: true)
    }

    @ViewBuilder
    private func filaParaHacer(_ c: Comunicado) -> some View {
        if c.kind == .tarea {
            let hecha = c.state == .hecho
            FilaComunicado(
                comunicado: c,
                marca: MarcaDeFila(
                    hecho: hecha,
                    etiqueta: hecha ? "Hecho: \(c.title)" : "Marcar hecho: \(c.title)",
                    onTap: hecha ? nil : { onMarcarTarea(c) }
                ),
                detalle: DetalleDeFila.tarea(c),
                onAbrir: { onAbrir(c) }
            )
        } else {
            FilaComunicado(comunicado: c, detalle: DetalleDeFila.protocolo(c)) { onAbrir(c) }
        }
    }
}
