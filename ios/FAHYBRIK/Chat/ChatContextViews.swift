import SwiftUI

// Las tres piezas visibles de «sobre qué va el mensaje». Espejo de la propuesta aprobada en el doble
// (`web/components/design-twin/screens/chat-contexto/`), con la piel de «El día».
//
// Ninguna de las tres es un control permanente en pantalla: el chip sólo existe mientras hay un sujeto esperando, la
// tarjeta vive dentro de un mensaje ya enviado, y el selector se levanta a petición. Eso era el encargo.

// MARK: - El chip que espera en el compositor

/// El sujeto elegido y aún sin enviar.
///
/// El filete del acento a la izquierda es lo que dice «esto va pegado a tu mensaje» sin gastar una palabra en
/// explicarlo. La ✕ lo quita: elegir mal no puede costar más que un toque (y mide 48 pt, como todo lo que se toca).
struct ChipDeContexto: View {
    let etiqueta: String
    let onQuitar: () -> Void

    private static let anchoDelFilete: CGFloat = 3

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        HStack(spacing: Theme.Spacing.s) {
            // Sobre un tinte del acento el texto es la tinta del tema, nunca `muted` (CONTRATO-UI §11.2).
            Text("Sobre")
                .papel(.nota)
                .foregroundStyle(Theme.Color.foreground)
            Text(etiqueta)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: Theme.Spacing.s)
            Button(action: onQuitar) {
                IconoDia(.cerrar, tam: 16, peso: .bold)
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle(escala: 0.92))
            .accessibilityLabel("Quitar el contexto")
        }
        .padding(.leading, Theme.Spacing.l)
        .padding(.trailing, Theme.Spacing.xs)
        .background(Theme.Color.accentTint(sobre: Theme.Color.background), in: forma)
        .overlay(alignment: .leading) {
            Rectangle().fill(Theme.Color.accent).frame(width: Self.anchoDelFilete)
        }
        .clipShape(forma)
        .overlay(forma.strokeBorder(Theme.Color.accentTintBorde, lineWidth: 1))
        .accessibilityElement(children: .contain)
    }
}

// MARK: - La tarjeta dentro del mensaje

/// De qué iba un mensaje ya enviado.
///
/// Va DENTRO de la burbuja (no como mensaje aparte) porque suelta obligaría al coach a emparejarla a ojo con la
/// pregunta de al lado. Sobre la burbuja propia (el acento del club) sólo lleva un contorno con la tinta del acento,
/// sin relleno: un relleno que aclare u oscurezca la burbuja resta contraste al texto justo donde se lee. Sobre la del
/// coach usa el fondo hundido del tema.
///
/// Lleva la línea de dato VIVA de la cosa cuando el servidor la sabe: la mitad del valor está en no tener que abrir
/// nada para contestar. El chevron y el toque sólo aparecen cuando la cosa sigue existiendo Y esta app sabe a dónde
/// llevar — un chevron que no responde miente más de lo que informa.
struct TarjetaDeContexto: View {
    let ref: ChatContextRef
    let mio: Bool
    /// Nil cuando no hay a dónde ir: entonces la tarjeta no se toca ni lo insinúa.
    var onAbrir: (() -> Void)? = nil

    var body: some View {
        if let onAbrir {
            Button {
                Haptics.light()
                onAbrir()
            } label: { cuerpo }
                .buttonStyle(PressScaleStyle(escala: 0.98))
                .accessibilityHint("Toca dos veces para abrirlo")
        } else {
            cuerpo
        }
    }

    private var cuerpo: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        return HStack(spacing: Theme.Spacing.s) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Sobre")
                    .papel(.etiqueta)
                Text(ref.label)
                    .papel(.notaFuerte)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                // El dato de ahora. Es lo que se está discutiendo («4×5 · 80% · descanso 90 s»), así que va en la
                // tarjeta y no detrás de un toque.
                if let preview = ref.preview, !preview.isEmpty {
                    Text(preview)
                        .papel(.nota)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if onAbrir != nil {
                IconoDia(.chevron, tam: 14, peso: .bold)
            }
        }
        .foregroundStyle(tinta)
        .padding(.vertical, Theme.Spacing.s)
        .padding(.horizontal, Theme.Spacing.m)
        .background(mio ? SwiftUI.Color.clear : Theme.Color.surfaceSunken, in: forma)
        .overlay(forma.strokeBorder(mio ? Theme.Color.accentOn.opacity(Self.contornoSobreAcento) : Theme.Color.hairline, lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(ref.preview.map { "Sobre \(ref.label). \($0)" } ?? "Sobre \(ref.label)")
    }

    /// Cuánto se ve el contorno de la tarjeta propia (la tinta del acento sobre el acento): lo justo para delimitar.
    private static let contornoSobreAcento: Double = 0.45

    private var tinta: SwiftUI.Color { mio ? Theme.Color.accentOn : Theme.Color.foreground }
}

// MARK: - El selector de entreno

/// «¿Sobre qué entreno?» — la única superficie nueva de toda la pieza, y sólo se ve si el atleta la pide desde el «+».
/// Una hoja del día: título, cierre de 48 pt y las secciones (Hoy · Esta semana · Antes) como listas de filas.
struct SelectorDeEntreno: View {
    let secciones: [(titulo: String, entrenos: [EntrenoElegible])]
    let cargando: Bool
    /// El `assignmentId` ya elegido, para marcarlo si se vuelve a abrir.
    let elegido: String?
    let onElegir: (EntrenoElegible) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        MarcoDeHojaChat("¿Sobre qué entreno?", cerrar: { dismiss() }) {
            SelectorDeEntrenoCuerpo(secciones: secciones, cargando: cargando, elegido: elegido, onElegir: onElegir, onVolver: { dismiss() })
        }
        .presentationDetents([.medium, .large])
    }
}

/// El contenido de la hoja, plano y sin scroll propio (lo pone el marco): las secciones, el esqueleto de lo que aún
/// llega, o el vacío con su salida.
struct SelectorDeEntrenoCuerpo: View {
    let secciones: [(titulo: String, entrenos: [EntrenoElegible])]
    let cargando: Bool
    let elegido: String?
    let onElegir: (EntrenoElegible) -> Void
    let onVolver: () -> Void

    var body: some View {
        if secciones.isEmpty {
            vacio
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                ForEach(secciones, id: \.titulo) { seccion in
                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        TituloSeccionDia(seccion.titulo)
                        ListaChat {
                            ForEach(seccion.entrenos) { entreno in fila(entreno) }
                        }
                    }
                }
                if cargando { esqueletoDeLosDeAntes }
            }
        }
    }

    private func fila(_ entreno: EntrenoElegible) -> some View {
        let marcado = elegido == entreno.assignmentId
        return Button {
            onElegir(entreno)
        } label: {
            HStack(spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(entreno.titulo)
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.leading)
                    // El pie es lo que desempata dos «Fuerza A» en la lista.
                    if let pie = entreno.pie {
                        Text(pie)
                            .papel(.nota)
                            .foregroundStyle(Theme.Color.muted)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }
                Spacer(minLength: Theme.Spacing.s)
                // Hecho = verde por FORMA y por palabra (el nombre accesible lo dice), no sólo por color.
                if entreno.hecho {
                    IconoDia(.check, tam: 18, peso: .bold)
                        .foregroundStyle(Theme.Color.ok)
                }
                Text(entreno.cuando)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque, alignment: .leading)
            // El ya elegido se tiñe del acento del club (y lo dice VoiceOver): al volver a abrir el selector se ve
            // cuál estaba puesto.
            .background(marcado ? Theme.Color.accentTint : SwiftUI.Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.99))
        .accessibilityLabel("\(entreno.titulo), \(entreno.cuando)\(entreno.hecho ? ", hecho" : "")")
        .accessibilityAddTraits(marcado ? .isSelected : [])
    }

    /// Lo de la semana anterior aún viaja: una sección fantasma con la misma forma (título y dos filas).
    private var esqueletoDeLosDeAntes: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SkeletonBar(width: 96, height: 22)
            VStack(spacing: 0) {
                ForEach(0..<2, id: \.self) { i in
                    if i > 0 { Hairline() }
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        SkeletonBar(width: 180, height: 17)
                        SkeletonBar(width: 120, height: 15)
                    }
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, Theme.Spacing.m)
                    .frame(maxWidth: .infinity, minHeight: Theme.Size.toque, alignment: .leading)
                }
            }
            .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous).strokeBorder(Theme.Color.hairline, lineWidth: 1))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Buscando los entrenos de antes")
        .accessibilityAddTraits(.updatesFrequently)
    }

    /// Sin plan publicado no hay entrenos que señalar, y decirlo es mejor que una lista vacía: el atleta entiende que
    /// no es un fallo suyo. La salida es volver al chat y escribir sin más.
    private var vacio: some View {
        VStack(spacing: Theme.Spacing.l) {
            VStack(spacing: Theme.Spacing.s) {
                Text("Todavía no hay entrenos que señalar")
                    .papel(.seccion)
                    .foregroundStyle(Theme.Color.foreground)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                Text("Cuando tengas la semana publicada podrás preguntar por un entreno concreto. Mientras, escríbele sin más.")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
            }
            BotonAccionChat("Volver al chat", relleno: .tinta, completa: true, accion: onVolver)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Theme.Spacing.xl)
    }
}

#if DEBUG
enum CasosContextoChat {
    static let entrenos: [(titulo: String, entrenos: [EntrenoElegible])] = [
        (titulo: "Hoy", entrenos: [
            EntrenoElegible(assignmentId: "a1", titulo: "Fuerza A", cuando: "hoy", pie: "Sentadilla 4×5 · 4 bloques", hecho: false),
        ]),
        (titulo: "Esta semana", entrenos: [
            EntrenoElegible(assignmentId: "a2", titulo: "Series 6×800", cuando: "jue", pie: "6×800 m · 2 bloques", hecho: false),
            EntrenoElegible(assignmentId: "a3", titulo: "Rodaje suave", cuando: "ayer", pie: nil, hecho: true),
        ]),
    ]

    static let referencia = ChatContextRef(
        kind: "session", ref: "a1", sub: nil, label: "Fuerza A · hoy",
        preview: "Sentadilla 4×5 · 80% · descanso 90 s", exists: true, state: "pending"
    )
}

#Preview("Selector · fábrica") {
    EnAmbasDia { SelectorDeEntrenoCuerpo(secciones: CasosContextoChat.entrenos, cargando: true, elegido: "a2", onElegir: { _ in }, onVolver: {}) }
}
#Preview("Selector · vacío") {
    EnAmbasDia { SelectorDeEntrenoCuerpo(secciones: [], cargando: false, elegido: nil, onElegir: { _ in }, onVolver: {}) }
}
#Preview("Contexto · tarjeta y chip") {
    EnAmbasDia {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            TarjetaDeContexto(ref: CasosContextoChat.referencia, mio: false, onAbrir: {})
            TarjetaDeContexto(ref: CasosContextoChat.referencia, mio: true)
            ChipDeContexto(etiqueta: "Fuerza A · hoy", onQuitar: {})
        }
    }
}
#endif
