import SwiftUI

// EL CUERPO de la bandeja: los cuatro cajones, pintados.
//
// Vive fuera de `ComunicadosBandejaView` porque esa pantalla es una pila de
// navegación con su carga, su cover y su cola de actos, y esto es lo único que
// se puede mirar sin nada de eso: dado un reparto, cómo queda. Así el render de
// prueba dibuja LA MISMA lista que ve el atleta en vez de una reconstrucción
// parecida, que es como una captura acaba pasando por buena mientras la pantalla
// real está rota.
//
// No sabe de red ni de navegación: recibe el reparto y devuelve los toques.

struct ListaComunicados: View {
    let bandeja: BandejaComunicados
    /// Arranca la entrada escalonada. Falso en las capturas, para que dibujen.
    var revelado: Bool = true
    let onAbrir: (Comunicado) -> Void
    /// Cerrar una tarea desde la lista. Nulo en las ya cerradas: el servidor no
    /// deshace un «hecho».
    let onMarcarTarea: (Comunicado) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            if bandeja.enCalma {
                lineaEnCalma
                    .staggerReveal(revelado, index: 0)
            }

            ForEach(Array(bandeja.preguntas.enumerated()), id: \.element.id) { i, pregunta in
                tarjetaPregunta(pregunta)
                    .staggerReveal(revelado, index: 1 + i)
            }

            if !bandeja.paraHacer.isEmpty {
                seccion("Para hacer", accesorio: accesorioParaHacer) {
                    ForEach(bandeja.paraHacer) { c in
                        CardSurface(padding: Theme.Spacing.m) { tarjetaParaHacer(c) }
                    }
                }
                .staggerReveal(revelado, index: 2)
            }

            if !bandeja.focos.isEmpty {
                seccion("El foco") {
                    ForEach(bandeja.focos) { foco in
                        CardSurface { tarjetaFoco(foco) }
                    }
                }
                .staggerReveal(revelado, index: 3)
            }

            if !bandeja.notas.isEmpty {
                seccion("Notas") {
                    ForEach(bandeja.notas) { nota in
                        CardSurface(padding: Theme.Spacing.m) {
                            TarjetaComunicado(comunicado: nota) { onAbrir(nota) }
                        }
                    }
                }
                .staggerReveal(revelado, index: 4)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.l)
        .padding(.bottom, Theme.Spacing.xl)
    }

    /// La calma también es información, y hoy no la da nadie.
    private var lineaEnCalma: some View {
        HStack(spacing: Theme.Spacing.s) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.ok)
            Text("Estás al día. Nada que responder ni que hacer.")
                .scaledFont(13, weight: .medium, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
        }
        .accessibilityElement(children: .combine)
    }

    private var accesorioParaHacer: String {
        let n = bandeja.pendientesParaHacer
        if n == 0 { return "nada pendiente" }
        return n == 1 ? "1 pendiente" : "\(n) pendientes"
    }

    private func seccion<Content: View>(
        _ titulo: String,
        accesorio: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack {
                SectionLabel(text: titulo)
                Spacer(minLength: Theme.Spacing.s)
                if let accesorio {
                    Text(accesorio)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.faint)
                }
            }
            content()
        }
    }

    // MARK: - Las tarjetas de cada cajón

    /// La pregunta, arriba y con filo de acento mientras esté abierta. Cuando ya
    /// está respondida baja a tarjeta normal y enseña LO QUE ELEGISTE: una
    /// decisión que cambia el plan no puede desaparecer al contestarla.
    @ViewBuilder
    private func tarjetaPregunta(_ pregunta: Comunicado) -> some View {
        let respondida = pregunta.state == .respondido
        CardSurface(topAccent: !respondida, elevated: !respondida) {
            TarjetaComunicado(
                comunicado: pregunta,
                detalle: Self.detallePregunta(pregunta),
                onAbrir: { onAbrir(pregunta) },
                pie: {
                    if !respondida {
                        ExpertPrimaryButton(title: "Responder", height: 46) { onAbrir(pregunta) }
                    }
                }
            )
        }
    }

    @ViewBuilder
    private func tarjetaParaHacer(_ c: Comunicado) -> some View {
        if c.kind == .tarea {
            let hecha = c.state == .hecho
            TarjetaComunicado(
                comunicado: c,
                marcar: (
                    hecho: hecha,
                    etiqueta: hecha ? "Hecho: \(c.title)" : "Marcar hecho: \(c.title)",
                    onTap: hecha ? nil : { onMarcarTarea(c) }
                ),
                detalle: Self.detalleTarea(c),
                onAbrir: { onAbrir(c) }
            )
        } else {
            TarjetaComunicado(comunicado: c, detalle: Self.detalleProtocolo(c)) { onAbrir(c) }
        }
    }

    private func tarjetaFoco(_ foco: Comunicado) -> some View {
        Button {
            Haptics.light()
            onAbrir(foco)
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack(spacing: Theme.Spacing.s) {
                    ChipTipoComunicado(tipo: .foco)
                    Spacer(minLength: Theme.Spacing.s)
                    InsigniaComunicado(insignia: foco.insignia())
                }
                Text(foco.title)
                    .scaledFont(17, weight: .bold, relativeTo: .headline)
                    .foregroundStyle(Theme.Color.foreground)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                if let linea = foco.body, !linea.isEmpty {
                    Text(linea)
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle())
    }

    // MARK: - La línea que se lee sin abrir

    /// Respondida, la pregunta enseña lo que elegiste y su consecuencia: en
    /// octubre eso es justo lo que el atleta viene a buscar.
    static func detallePregunta(_ pregunta: Comunicado) -> String? {
        guard let elegida = pregunta.opcionElegida else { return pregunta.body }
        let consecuencia = elegida.consequence.map { " \($0)" } ?? ""
        return "Le dijiste: \(elegida.content).\(consecuencia)"
    }

    /// Cuándo vence y por qué importa. Sin el porqué una tarea es un recado.
    static func detalleTarea(_ tarea: Comunicado) -> String? {
        guard tarea.state != .hecho else { return tarea.body }
        let porque = tarea.body?.trimmingCharacters(in: .whitespacesAndNewlines)
        return [tarea.venceTexto(), porque]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: ". ")
    }

    /// Un protocolo a medias dice por dónde va: volver a la bandeja y no ver que
    /// llevas cuatro de siete obliga a abrirlo solo para saberlo.
    ///
    /// Cuenta SOLO las casillas: un protocolo de lectura no lleva ninguna, así
    /// que no tiene avance que enseñar y se queda con su propia línea.
    static func detalleProtocolo(_ p: Comunicado) -> String? {
        let casillas = p.pasosMarcables.count
        guard casillas > 0, p.state != .hecho, p.pasosHechos > 0 else { return p.body }
        return "Llevas \(p.pasosHechos) de \(casillas) pasos."
    }
}
