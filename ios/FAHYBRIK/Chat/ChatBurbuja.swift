import SwiftUI

// LA BURBUJA Y LA FILA DE UN MENSAJE.
//
// Dos piezas: la FORMA y la SUPERFICIE que comparten todas las burbujas (texto, voz, foto, vídeo, archivo) y la FILA
// que las coloca (a la derecha si es del atleta, a la izquierda si es del coach) con su pie. Nada de esto decide:
// pinta un `ChatMessage` ya resuelto y lo que lee (`PieMensajeChat`, `lecturaParaVoz`) sale de `ChatLectura`.

// MARK: - Forma y superficie

/// La burbuja asimétrica: la esquina «cola» (aplanada) es la de ARRIBA del lado de quien habla — recibida = arriba
/// a la izquierda, enviada = arriba a la derecha. El resto, redondeadas.
struct FormaBurbujaChat: Shape {
    let mia: Bool

    func path(in rect: CGRect) -> Path {
        let grande = MedidasChat.radioBurbuja
        let cola = MedidasChat.radioCola
        let arribaIzq = mia ? grande : cola
        let arribaDer = mia ? cola : grande
        var p = Path()
        p.move(to: CGPoint(x: rect.minX + arribaIzq, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - arribaDer, y: rect.minY))
        p.addArc(center: CGPoint(x: rect.maxX - arribaDer, y: rect.minY + arribaDer),
                 radius: arribaDer, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - grande))
        p.addArc(center: CGPoint(x: rect.maxX - grande, y: rect.maxY - grande),
                 radius: grande, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX + grande, y: rect.maxY))
        p.addArc(center: CGPoint(x: rect.minX + grande, y: rect.maxY - grande),
                 radius: grande, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + arribaIzq))
        p.addArc(center: CGPoint(x: rect.minX + arribaIzq, y: rect.minY + arribaIzq),
                 radius: arribaIzq, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        p.closeSubpath()
        return p
    }
}

extension View {
    /// La superficie de una burbuja con contenido acolchado (texto, voz, archivo): el ACENTO DEL CLUB para lo propio
    /// y la superficie con su filete para lo del coach. Lo que llena la burbuja de punta a punta (foto, vídeo) recorta
    /// su propio contenido con `FormaBurbujaChat`.
    func burbujaChat(mia: Bool) -> some View {
        self
            .background(mia ? Theme.Color.accent : Theme.Color.surface)
            .overlay {
                if !mia { FormaBurbujaChat(mia: false).stroke(Theme.Color.hairlineStrong, lineWidth: 1) }
            }
            .clipShape(FormaBurbujaChat(mia: mia))
    }
}

// MARK: - La fila

struct FilaMensajeChat: View {
    let mensaje: ChatMessage
    /// El rótulo del coach para el pie (su nombre de pila, o el neutro). El pie lo pasa a minúsculas; VoiceOver lo
    /// lee tal cual.
    let coach: String
    /// El bearer del atleta: las burbujas con adjunto lo necesitan para cargar el medio remoto por el proxy
    /// autenticado.
    let bearer: String?
    /// Se toca un mensaje CAÍDO: reenviarlo.
    var onRetry: (() -> Void)? = nil
    /// Pulsación larga sobre un mensaje caído: descartarlo (tirar la fila sin enviar) en lugar de reintentarlo.
    var onDiscard: (() -> Void)? = nil
    /// Pulsación larga sobre un mensaje PROPIO ya enviado: borrarlo.
    var onDelete: (() -> Void)? = nil
    /// Abrir la cosa de la que va el mensaje. Nil = no hay a dónde ir, y entonces la tarjeta ni se toca ni lo
    /// insinúa.
    var onAbrirContexto: (() -> Void)? = nil

    private var fallido: Bool { mensaje.status == .failed }
    private var mia: Bool { mensaje.esMio }
    /// El atleta sólo puede borrar su propio mensaje, ya enviado.
    private var puedeBorrar: Bool { mia && mensaje.status == .sent }

    var body: some View {
        HStack(alignment: .bottom, spacing: Theme.Spacing.s) {
            if mia { Spacer(minLength: Theme.Spacing.xxl) }

            VStack(alignment: mia ? .trailing : .leading, spacing: Theme.Spacing.xs) {
                // Una foto o una nota de voz también pueden ser «sobre este entreno». Esas burbujas pintan su propia
                // superficie (el medio a sangre), así que la tarjeta se apoya ENCIMA en vez de dentro; en el texto,
                // que es el caso normal, va dentro.
                if let ref = mensaje.contexto, !mensaje.isText {
                    TarjetaDeContexto(ref: ref, mio: mia, onAbrir: onAbrirContexto)
                        .frame(maxWidth: MedidasChat.anchoMaximoBurbuja, alignment: mia ? .trailing : .leading)
                }
                burbuja
                pie
            }
            // Menú de pulsación larga: reintentar/descartar una fila caída o borrar un mensaje propio. Se aplica a la
            // columna de la burbuja para que la copia levantada sea sólo la burbuja (como en iMessage), nunca la fila
            // entera.
            .accionesDeMensaje(
                fallido: fallido,
                puedeBorrar: puedeBorrar,
                onRetry: { onRetry?() },
                onDiscard: { onDiscard?() },
                onDelete: { onDelete?() }
            )

            if !mia { Spacer(minLength: Theme.Spacing.xxl) }
        }
        // Un mensaje caído se reintenta tocando la fila entera. Las filas sanas NO añaden ningún gesto de fila, para
        // que los botones de dentro (reproducir, abrir, ampliar) reciban sus toques limpios.
        .toqueDeFilaCaida(fallido) { onRetry?() }
        // El texto se lee como UN elemento de VoiceOver; las filas con adjunto dejan sus hijos alcanzables (los
        // botones de reproducir y abrir).
        .modifier(AccesibilidadDeFila(
            esTexto: mensaje.isText,
            etiqueta: mensaje.lecturaParaVoz(coach: coach),
            pista: fallido ? "No enviado. Toca dos veces para reintentar." : ""
        ))
    }

    // MARK: Pie

    @ViewBuilder
    private var pie: some View {
        let pie = PieMensajeChat.de(mensaje, coach: coach)
        if pie.fallido {
            // Con el texto del sistema muy grande la marca + la palabra + el botón no caben en una línea: el botón
            // baja debajo en vez de truncarse.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: Theme.Spacing.s) {
                    avisoDeCaida(pie.texto)
                    botonReintentar
                }
                VStack(alignment: .trailing, spacing: 0) {
                    avisoDeCaida(pie.texto)
                    botonReintentar
                }
            }
        } else {
            Text(pie.texto)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    /// El peligro va en la marca (el triángulo), jamás en el texto.
    private func avisoDeCaida(_ texto: String) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            IconoChat(.alerta, tam: 16)
                .foregroundStyle(Theme.Color.danger)
            Text(texto)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: true, vertical: false)
        }
    }

    private var botonReintentar: some View {
        Button {
            Haptics.light()
            onRetry?()
        } label: {
            Text("Reintentar")
                .papel(.rotulo)
                .foregroundStyle(Theme.Color.foreground)
                .underline()
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, Theme.Spacing.s)
                .frame(minHeight: Theme.Size.toque)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
    }

    // MARK: Burbuja

    @ViewBuilder
    private var burbuja: some View {
        switch mensaje.kind {
        case .text(let cuerpo):
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                // El sujeto va DENTRO de la burbuja: pregunta y cosa preguntada son UNA sola, no dos elementos que
                // emparejar a ojo.
                if let ref = mensaje.contexto {
                    TarjetaDeContexto(ref: ref, mio: mia, onAbrir: onAbrirContexto)
                }
                Text(cuerpo)
                    .papel(.cuerpo)
                    .foregroundStyle(mia ? Theme.Color.accentOn : Theme.Color.foreground)
                    .multilineTextAlignment(.leading)
            }
            .padding(.horizontal, MedidasChat.aireHorizontalBurbuja)
            .padding(.vertical, MedidasChat.aireVerticalBurbuja)
            .burbujaChat(mia: mia)
            .marcaDeCaida(fallido, mia: mia)
            .frame(maxWidth: MedidasChat.anchoMaximoBurbuja, alignment: mia ? .trailing : .leading)
        case .voice(let source, let duration):
            ChatVoiceBubble(isMe: mia, source: source, metaDuration: duration, bearer: bearer)
                .marcaDeCaida(fallido, mia: mia)
        case .image(let source, let aspect):
            ChatImageBubble(isMe: mia, source: source, aspect: aspect, bearer: bearer)
                .marcaDeCaida(fallido, mia: mia)
        case .video(let source, let duration):
            ChatVideoBubble(isMe: mia, source: source, metaDuration: duration, bearer: bearer)
                .marcaDeCaida(fallido, mia: mia)
        case .file(let source, let nombre, let bytes):
            ChatFileBubble(isMe: mia, source: source, name: nombre, sizeBytes: bytes, bearer: bearer)
                .marcaDeCaida(fallido, mia: mia)
        }
    }
}

// MARK: - Modificadores de la fila

private extension View {
    /// El contorno de un mensaje que no salió. Va en la FORMA (un filete de peligro de 2 pt) y no en la opacidad:
    /// atenuar un mensaje le quita el contraste justo cuando hay que leerlo y tocarlo.
    @ViewBuilder
    func marcaDeCaida(_ activa: Bool, mia: Bool) -> some View {
        if activa {
            self.overlay { FormaBurbujaChat(mia: mia).stroke(Theme.Color.danger, lineWidth: 2) }
        } else {
            self
        }
    }

    /// El toque de fila sólo cuando el mensaje cayó, para no interceptar los botones de las filas sanas.
    @ViewBuilder
    func toqueDeFilaCaida(_ activo: Bool, accion: @escaping () -> Void) -> some View {
        if activo {
            self.contentShape(Rectangle()).onTapGesture(perform: accion)
        } else {
            self
        }
    }

    /// El menú de pulsación larga de una burbuja: una fila CAÍDA ofrece Reintentar + Descartar; la propia ya enviada,
    /// Eliminar. Cualquier otra (la del coach, una que aún se envía) no tiene menú, para que el gesto no se coma los
    /// toques de los controles de las burbujas sanas. Las mismas acciones van como acciones de VoiceOver: una
    /// pulsación larga no se descubre con el lector de pantalla.
    @ViewBuilder
    func accionesDeMensaje(
        fallido: Bool,
        puedeBorrar: Bool,
        onRetry: @escaping () -> Void,
        onDiscard: @escaping () -> Void,
        onDelete: @escaping () -> Void
    ) -> some View {
        if fallido {
            self
                .contextMenu {
                    Button { onRetry() } label: { Label("Reintentar", systemImage: GlifoDia.reintentar.simbolo) }
                    Button(role: .destructive) { onDiscard() } label: { Label("Descartar", systemImage: GlifoChat.papelera.simbolo) }
                }
                .accessibilityAction(named: "Reintentar", onRetry)
                .accessibilityAction(named: "Descartar", onDiscard)
        } else if puedeBorrar {
            self
                .contextMenu {
                    Button(role: .destructive) { onDelete() } label: { Label("Eliminar mensaje", systemImage: GlifoChat.papelera.simbolo) }
                }
                .accessibilityAction(named: "Eliminar mensaje", onDelete)
        } else {
            self
        }
    }
}

/// Las filas de texto se combinan en un solo elemento de VoiceOver; las de adjunto quedan en `.contain` para que los
/// controles de su burbuja sigan accesibles uno a uno.
private struct AccesibilidadDeFila: ViewModifier {
    let esTexto: Bool
    let etiqueta: String
    let pista: String

    func body(content: Content) -> some View {
        if esTexto {
            content
                .accessibilityElement(children: .combine)
                .accessibilityLabel(etiqueta)
                .accessibilityHint(pista)
        } else {
            content.accessibilityElement(children: .contain)
        }
    }
}
