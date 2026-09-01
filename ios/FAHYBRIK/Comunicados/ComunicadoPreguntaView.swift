import SwiftUI

// LA PREGUNTA — una decisión, con lo que le pasa al plan según lo que elijas.
//
// Centrada (§6.1): esto es UNA SOLA decisión, así que el bloque se reparte el
// aire en vez de apilarse arriba. No lleva acción anclada a propósito: las
// opciones SON la acción, y un botón «Enviar» debajo solo añadiría un segundo
// toque a algo que se contesta con uno.
//
// La pieza que hace que esto no sea una encuesta es la CONSECUENCIA: cada opción
// dice qué le pasa a tu plan si la eliges. Sin eso el atleta contesta a ciegas y
// el coach recibe un dato que no sabe si está informado.

struct ComunicadoPreguntaView: View {
    let comunicado: Comunicado
    let acciones: ComunicadosAcciones
    let onVolver: () -> Void

    /// Volver a abrirla tras responder. El servidor guarda SIEMPRE la última
    /// elección, así que cambiar de idea es elegir otra vez — no hay un estado
    /// intermedio «sin respuesta» que se pueda pedir, y por eso esto es local:
    /// mientras no toques otra opción, la que le dijiste sigue siendo la buena.
    @State private var reeligiendo = false

    private var respondida: Bool { comunicado.state == .respondido && !reeligiendo }
    private var elegida: ComunicadoItem? { comunicado.opcionElegida }

    var body: some View {
        VStack(spacing: 0) {
            CabeceraComunicado(comunicado: comunicado, onVolver: onVolver) {
                InsigniaComunicado(insignia: comunicado.insignia())
            }
            CenteredScreen {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    TituloComunicado(comunicado: comunicado)
                    CuerpoComunicado(texto: comunicado.body)

                    if comunicado.blocks && comunicado.state != .respondido {
                        AvisoComunicado(
                            texto: "Mientras no lo digas, \(comunicado.nombreCoach) deja esta parte del plan a la espera."
                        )
                    }

                    VStack(spacing: Theme.Spacing.m) {
                        ForEach(comunicado.items) { opcion in
                            OpcionPreguntaCard(
                                opcion: opcion,
                                elegida: opcion.id == comunicado.answeredItemId,
                                apagada: respondida && opcion.id != comunicado.answeredItemId,
                                onTap: {
                                    reeligiendo = false
                                    Task { await acciones.responder(comunicado, itemId: opcion.id) }
                                }
                            )
                        }
                    }

                    if respondida, elegida != nil {
                        confirmacion
                    }
                    AvisoEnvioComunicado(estado: acciones.envio)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.xl)
            }
        }
    }

    private var confirmacion: some View {
        HStack(spacing: Theme.Spacing.s) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Color.ok)
            Text("Respondido. \(comunicado.nombreCoach) lo verá.")
                .scaledFont(13, weight: .medium, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                Haptics.light()
                reeligiendo = true
            } label: {
                Text("Cambiar")
                    .scaledFont(13, weight: .bold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Cambiar de respuesta")
        }
    }
}

// MARK: - Una opción

/// Una opción es una tarjeta tocable, no una fila de radio: lo que decide no es
/// el texto de la opción sino su consecuencia, y una consecuencia de dos líneas
/// no cabe al lado de un círculo.
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
            CardSurface(leftAccent: elegida, elevated: elegida) {
                HStack(alignment: .top, spacing: Theme.Spacing.m) {
                    Image(systemName: elegida ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 19, weight: .regular))
                        .foregroundStyle(elegida ? Theme.Color.ok : Theme.Color.faint)
                        .padding(.top, 1)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(opcion.content)
                            .scaledFont(16, weight: .bold, relativeTo: .headline)
                            .foregroundStyle(Theme.Color.foreground)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if let consecuencia = opcion.consequence, !consecuencia.isEmpty {
                            Text(consecuencia)
                                .scaledFont(13, relativeTo: .footnote)
                                .foregroundStyle(Theme.Color.muted)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .opacity(apagada ? 0.5 : 1)
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(
            [opcion.content, opcion.consequence].compactMap { $0 }.joined(separator: ". ")
        )
        .accessibilityAddTraits(elegida ? [.isButton, .isSelected] : .isButton)
    }
}
