import SwiftUI

// EL DETALLE de un comunicado — el reparto por tipo, y los dos detalles cortos.
//
// Abrir es un acto: al entrar se sella el «visto» (una vez, y solo si no lo
// estaba). Eso es lo que hoy no existe — el coach no sabe si el mensaje llegó,
// solo que lo mandó.
//
// Los cinco tipos comparten cabecera a propósito: abrir una pregunta y abrir un
// protocolo tienen que sentirse la misma casa. Lo que cambia es lo que cada uno
// te PIDE, y por eso cada tipo tiene su cuerpo.

struct ComunicadoDetalleView: View {
    let comunicado: Comunicado
    let acciones: ComunicadosAcciones
    let onVolver: () -> Void
    /// Abre el comunicado que éste lleva al pie. La pila la lleva la bandeja: un
    /// detalle no sabe navegar, sabe qué le falta.
    var onAbrirEnlazado: (String) -> Void = { _ in }

    var body: some View {
        Group {
            switch comunicado.kind {
            case .protocolo:
                ComunicadoProtocoloView(comunicado: comunicado, acciones: acciones, onVolver: onVolver)
            case .pregunta:
                ComunicadoPreguntaView(comunicado: comunicado, acciones: acciones, onVolver: onVolver)
            case .nota:
                ComunicadoNotaView(
                    comunicado: comunicado,
                    onVolver: onVolver,
                    onAbrirEnlazado: onAbrirEnlazado
                )
            case .tarea:
                ComunicadoTareaView(comunicado: comunicado, acciones: acciones, onVolver: onVolver)
            case .foco:
                ComunicadoFocoView(comunicado: comunicado, onVolver: onVolver)
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .task { await acciones.marcarVisto(comunicado) }
    }
}

// MARK: - Título y ancla, comunes a los cinco cuerpos

/// El titular del detalle. El ancla va DEBAJO y en micro: de dónde cuelga
/// informa, pero no es lo que el atleta viene a leer.
///
/// Y debajo, si lo lleva, la VOZ del coach. Vive en el titular —y no en cada uno
/// de los cinco cuerpos— porque es de quién te habla y no de lo que te pide: así
/// suena igual en una nota que en un protocolo, y un sexto tipo de comunicado no
/// nacería mudo por olvido.
struct TituloComunicado: View {
    let comunicado: Comunicado
    var tamano: CGFloat = 26

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                Text(comunicado.title)
                    .scaledFont(tamano, weight: .heavy, relativeTo: .title2, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                if let ancla = comunicado.anchorKind.etiqueta {
                    LabelText(text: ancla, color: Theme.Color.faint, size: 9.5)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            AudioDelComunicado(comunicado: comunicado)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// El cuerpo que escribe el coach, tal cual. Es su método: aquí no se recorta,
/// no se resume y no se le añade nada.
struct CuerpoComunicado: View {
    let texto: String?
    var tamano: CGFloat = 14.5

    var body: some View {
        if let texto, !texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Text(texto)
                .scaledFont(tamano, relativeTo: .callout)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - La tarea

/// LA TAREA — una acción con fecha, y el porqué que la separa de un recado.
///
/// Acción anclada abajo (§ regla 3): cerrarla es lo único que se hace aquí, y el
/// pulgar la tiene siempre a mano. Cuando ya está cerrada el botón desaparece:
/// el servidor no deshace un «hecho», así que dejarlo activo prometería algo que
/// no va a pasar.
struct ComunicadoTareaView: View {
    let comunicado: Comunicado
    let acciones: ComunicadosAcciones
    let onVolver: () -> Void

    private var hecha: Bool { comunicado.state == .hecho }

    var body: some View {
        VStack(spacing: 0) {
            CabeceraComunicado(comunicado: comunicado, onVolver: onVolver) {
                InsigniaComunicado(insignia: comunicado.insignia())
            }
            FillingScreen {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    TituloComunicado(comunicado: comunicado)
                    if let vence = comunicado.venceTexto() {
                        HStack(spacing: Theme.Spacing.s) {
                            Image(systemName: "calendar")
                                .font(.system(size: 13, weight: .semibold))
                            Text(vence)
                                .scaledFont(14, weight: .bold, relativeTo: .subheadline)
                        }
                        .foregroundStyle(colorVencimiento)
                        .accessibilityElement(children: .combine)
                    }
                    CuerpoComunicado(texto: comunicado.body)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xl)
            }
        }
        .anchoredAction {
            VStack(spacing: Theme.Spacing.s) {
                if comunicado.puedeMarcarseHecho {
                    ExpertPrimaryButton(title: "Marcar hecho") {
                        Task { await acciones.marcarHecho(comunicado) }
                    }
                }
                Text(hecha
                    ? "\(comunicado.nombreCoach) ya la ve cerrada."
                    : "\(comunicado.nombreCoach) verá que la has hecho.")
                    .scaledFont(11.5, weight: .medium, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
                    .multilineTextAlignment(.center)
                AvisoEnvioComunicado(estado: acciones.envio)
            }
        }
    }

    private var colorVencimiento: Color {
        guard !hecha else { return Theme.Color.muted }
        switch comunicado.vencimiento() {
        case .vencida: return Theme.Color.danger
        case .hoy: return Theme.Color.warning
        case .futura, .sinFecha: return Theme.Color.muted
        }
    }
}

// MARK: - El foco

/// EL FOCO — lo que no se te puede olvidar. No lleva acción anclada y no se
/// cierra: leerlo no lo apaga, y por eso tampoco reclama en la bandeja. Si se
/// cerrara dejaría de ser el foco; si reclamara, la bandeja no podría estar en
/// calma jamás.
struct ComunicadoFocoView: View {
    let comunicado: Comunicado
    let onVolver: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            CabeceraComunicado(comunicado: comunicado, onVolver: onVolver) {
                InsigniaComunicado(insignia: comunicado.insignia())
            }
            CenteredScreen {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    TituloComunicado(comunicado: comunicado, tamano: 30)
                    CuerpoComunicado(texto: comunicado.body, tamano: 15)
                    Text("Esto no se marca: está aquí para que no se te olvide.")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.xl)
            }
        }
    }
}
