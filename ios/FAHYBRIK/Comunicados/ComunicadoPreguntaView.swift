import SwiftUI

// LA PREGUNTA — una decisión, con lo que le pasa al plan según lo que elijas.
//
// El sujeto es la propia pregunta (un bloque `info`: el momento que espera tu respuesta) y las opciones
// van debajo. No lleva acción anclada a propósito: las opciones SON la acción, y un botón «Enviar» debajo
// solo añadiría un segundo toque a algo que se contesta con uno.
//
// La pieza que hace que esto no sea una encuesta es la CONSECUENCIA: cada opción dice qué le pasa a tu
// plan si la eliges. Sin eso el atleta contesta a ciegas y el coach recibe un dato que no sabe si está
// informado.

struct ComunicadoPreguntaView: View {
    let comunicado: Comunicado
    let acciones: ComunicadosAcciones
    let onVolver: () -> Void

    var body: some View {
        ComunicadoPreguntaContenido(
            comunicado: comunicado,
            envio: acciones.envio,
            onVolver: onVolver,
            onResponder: { opcion in Task { await acciones.responder(comunicado, itemId: opcion.id) } }
        )
    }
}

/// Lo que pinta la pregunta, sin saber de actos ni de red.
struct ComunicadoPreguntaContenido: View {
    let comunicado: Comunicado
    let envio: EnvioComunicado
    let onVolver: () -> Void
    let onResponder: (ComunicadoItem) -> Void

    /// Volver a abrirla tras responder. El servidor guarda SIEMPRE la última elección, así que cambiar de
    /// idea es elegir otra vez — no hay un estado intermedio «sin respuesta» que se pueda pedir, y por eso
    /// esto es local: mientras no toques otra opción, la que le dijiste sigue siendo la buena.
    @State private var reeligiendo = false

    /// `reeligiendo` inicial: solo para que una captura pueda enseñar la pregunta reabierta.
    init(comunicado: Comunicado, envio: EnvioComunicado, onVolver: @escaping () -> Void, onResponder: @escaping (ComunicadoItem) -> Void, reeligiendo: Bool = false) {
        self.comunicado = comunicado
        self.envio = envio
        self.onVolver = onVolver
        self.onResponder = onResponder
        _reeligiendo = State(initialValue: reeligiendo)
    }

    private var respondida: Bool { comunicado.state == .respondido && !reeligiendo }

    var body: some View {
        VStack(spacing: 0) {
            CabeceraComunicado(comunicado: comunicado, onVolver: onVolver) {
                InsigniaComunicado(insignia: comunicado.insignia())
            }
            FillingScreen {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    SujetoDia(tono: .info, etiqueta: [comunicado.title, comunicado.body].compactMap { $0 }.joined(separator: ". ")) {
                        KickerDia(comunicado.anchorKind.etiqueta ?? "Pregunta")
                        TituloDia(comunicado.title, ajuste: .escalones)
                        if let cuerpo = comunicado.body, !cuerpo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            ApoyoDia(cuerpo)
                        }
                    }
                    AudioDelComunicado(comunicado: comunicado)

                    if comunicado.blocks && comunicado.state != .respondido {
                        AvisoComunicado(texto: PieDeDetalle.preguntaBloquea(comunicado))
                    }

                    VStack(spacing: Theme.Spacing.m) {
                        ForEach(comunicado.items) { opcion in
                            OpcionPreguntaCard(
                                opcion: opcion,
                                elegida: opcion.id == comunicado.answeredItemId,
                                apagada: respondida && opcion.id != comunicado.answeredItemId,
                                onTap: {
                                    reeligiendo = false
                                    onResponder(opcion)
                                }
                            )
                        }
                    }

                    if respondida, comunicado.opcionElegida != nil {
                        confirmacion
                    }
                    AvisoEnvioComunicado(estado: envio)
                }
                .cuerpoDeDetalle()
            }
        }
    }

    private var confirmacion: some View {
        HStack(spacing: Theme.Spacing.s) {
            SelloEstadoDia(estado: .hecha, tam: 20)
            Text(PieDeDetalle.preguntaRespondida(comunicado))
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                Haptics.light()
                reeligiendo = true
            } label: {
                Text("Cambiar")
                    .papel(.rotulo)
                    .underline()
                    .foregroundStyle(Theme.Color.foreground)
                    .padding(.horizontal, Theme.Spacing.m)
                    .frame(minHeight: Theme.Size.toque)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
            .accessibilityLabel("Cambiar de respuesta")
        }
    }
}

// MARK: - Una opción

/// Una opción es una tarjeta tocable, no una fila de radio: lo que decide no es el texto de la opción sino
/// su consecuencia, y una consecuencia de dos líneas no cabe al lado de un círculo.
///
/// La elegida lleva el tinte del acento y su sello; las demás, ya respondida, se quedan en gris de apoyo
/// (cambian de tinta, no de opacidad: un texto a media opacidad deja de leerse).
struct OpcionPreguntaCard: View {
    let opcion: ComunicadoItem
    let elegida: Bool
    let apagada: Bool
    let onTap: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            onTap()
        } label: {
            HStack(alignment: .top, spacing: Theme.Spacing.m) {
                SelloEstadoDia(estado: elegida ? .hecha : .pendiente, tam: 24)
                    .padding(.top, 1)
                VStack(alignment: .leading, spacing: Theme.Spacing.xs + 1) {
                    Text(opcion.content)
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(apagada ? Theme.Color.muted : Theme.Color.foreground)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if let consecuencia = opcion.consequence, !consecuencia.isEmpty {
                        Text(consecuencia)
                            .papel(.nota)
                            .foregroundStyle(elegida ? Theme.Color.foreground : Theme.Color.muted)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(Theme.Spacing.l)
            .frame(minHeight: Theme.Size.toque + Theme.Spacing.l)
            .tarjetaDia(realce: elegida, alAncho: true)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.985))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            [opcion.content, opcion.consequence].compactMap { $0 }.joined(separator: ". ")
        )
        .accessibilityAddTraits(elegida ? [.isButton, .isSelected] : .isButton)
    }
}
