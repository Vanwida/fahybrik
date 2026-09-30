import SwiftUI

// LA BANDA DE EN MEDIO CUANDO HAY CONVERSACIÓN — la lista de mensajes y el scroll que la sostiene.
//
// `ListaMensajesChat` es la lista PLANA (sin scroll): lo que se ve, ya resuelto. `ConversacionChat` le pone el scroll,
// el salto al final y el teclado. Se separan porque el renderizador de capturas no dibuja `ScrollView` y porque la
// lista es lo único que cambia entre un chat y otro.

/// Los mensajes, uno bajo otro. Cada fila lleva sus acciones ya atadas a su id por quien la monta.
struct ListaMensajesChat: View {
    let mensajes: [ChatMessage]
    let coach: String
    let bearer: String?
    var onRetry: (String) -> Void = { _ in }
    var onDiscard: (String) -> Void = { _ in }
    var onDelete: (String) -> Void = { _ in }
    /// La acción de abrir la cosa de la que va un mensaje, o nil si no hay a dónde ir (entonces la tarjeta no se
    /// toca ni lo insinúa).
    var abrirContexto: (ChatContextRef) -> (() -> Void)? = { _ in nil }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            ForEach(mensajes) { mensaje in
                FilaMensajeChat(
                    mensaje: mensaje,
                    coach: coach,
                    bearer: bearer,
                    onRetry: { onRetry(mensaje.id) },
                    onDiscard: { onDiscard(mensaje.id) },
                    onDelete: { onDelete(mensaje.id) },
                    onAbrirContexto: mensaje.contexto.flatMap(abrirContexto)
                )
                .id(mensaje.id)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// La conversación con su scroll. Un chat se abre por el FINAL: lo último dicho es lo que traes en la cabeza, y sólo
/// saltar cuando LLEGA un mensaje nuevo te dejaba, al abrirlo, en el principio de toda la historia.
struct ConversacionChat: View {
    let mensajes: [ChatMessage]
    let coach: String
    let bearer: String?
    var onRetry: (String) -> Void = { _ in }
    var onDiscard: (String) -> Void = { _ in }
    var onDelete: (String) -> Void = { _ in }
    var abrirContexto: (ChatContextRef) -> (() -> Void)? = { _ in nil }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Lo que dura el deslizamiento hasta el último mensaje que llega.
    private static let duracionDelSalto = 0.18

    var body: some View {
        ScrollViewReader { lector in
            ScrollView {
                ListaMensajesChat(
                    mensajes: mensajes, coach: coach, bearer: bearer,
                    onRetry: onRetry, onDiscard: onDiscard, onDelete: onDelete, abrirContexto: abrirContexto
                )
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.vertical, Theme.Spacing.l)
            }
            .scrollDismissesKeyboard(.interactively)
            .onAppear {
                guard let ultimo = mensajes.last else { return }
                // Tras el primer layout: antes de él el lector aún no conoce la altura de las filas.
                DispatchQueue.main.async { lector.scrollTo(ultimo.id, anchor: .bottom) }
            }
            .onChange(of: mensajes.count) { _, _ in
                guard let ultimo = mensajes.last else { return }
                if reduceMotion {
                    lector.scrollTo(ultimo.id, anchor: .bottom)
                } else {
                    withAnimation(.easeOut(duration: Self.duracionDelSalto)) {
                        lector.scrollTo(ultimo.id, anchor: .bottom)
                    }
                }
            }
        }
    }
}
