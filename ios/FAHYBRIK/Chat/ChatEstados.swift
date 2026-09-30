import SwiftUI

// LOS ESTADOS DE LA BANDA DE EN MEDIO cuando NO hay conversación que leer: cargando, sin estrenar y no cargó.
//
// Son DOS estados y un esqueleto, no un bloque con un ternario — que es como estaban, y por eso el error no tenía
// reintento. Piezas propias, no `private var` de la vista, para poder pintarlas en las capturas (§8) y en las
// previews. Ninguno lleva sujeto del día: el chat es una conversación, no un estado del día.

// MARK: - Centrado en la banda

/// Reparte el hueco de la banda y CENTRA el estado en él; si el contenido no cabe (texto del sistema muy grande) la
/// banda scrollea en vez de recortar. Antes el vacío colgaba de un `padding(.top, 72)` fijo: ni centrado ni
/// scrolleable, con ~460 pt muertos debajo.
struct BandaCentradaChat<Contenido: View>: View {
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        GeometryReader { hueco in
            ScrollView {
                contenido()
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.vertical, Theme.Spacing.xl)
                    .frame(maxWidth: .infinity, minHeight: hueco.size.height)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }
}

// MARK: - La estructura común de un estado

/// Figura · título · mensaje · una salida · una nota. La forma de los dos estados con texto; cada uno pone su figura
/// y su salida.
struct EstadoCentradoChat<Figura: View>: View {
    let titulo: String
    let mensaje: String
    let salida: String
    var glifoDeSalida: GlifoDia? = nil
    var nota: String? = nil
    let alSalir: () -> Void
    @ViewBuilder let figura: () -> Figura

    var body: some View {
        VStack(spacing: Theme.Spacing.l) {
            figura()
            VStack(spacing: Theme.Spacing.s) {
                Text(titulo)
                    .papel(.seccion)
                    .foregroundStyle(Theme.Color.foreground)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                Text(mensaje)
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
            }
            BotonAccionDia(salida, glifo: glifoDeSalida, relleno: .acento, impacto: .medio, accion: alSalir)
            if let nota {
                Text(nota)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Sin conversación

/// El vacío gana SALIDA: un arranque que RELLENA el compositor y lo enfoca. No lo envía — el atleta lo edita y
/// decide. Escribirle al coach en frío es justo lo que cuesta, y una primera frase ya escrita quita ese peso.
struct ChatVacioState: View {
    let coachInitials: String
    /// «Escribe a <coach> para empezar», ya resuelto con el nombre real (o la versión neutra cuando no lo sabemos —
    /// nunca uno inventado).
    let prompt: String
    let onArranque: () -> Void

    /// Primera frase del arranque. Abierta a propósito: el atleta la termina.
    static let conversationStarter = "Hoy me he encontrado…"

    var body: some View {
        EstadoCentradoChat(
            titulo: prompt,
            mensaje: "Aquí van dudas, sensaciones y molestias. Lo que le cuentes cambia el entreno de mañana.",
            salida: "Contarle cómo he ido hoy",
            // No decimos «en línea»: el backend no expone presencia del coach y afirmarla sería fabricarla (§7).
            nota: "Te contesta cuando pueda.",
            alSalir: onArranque
        ) {
            CoachAvatar(initials: coachInitials, size: 72, relleno: true)
        }
    }
}

// MARK: - No cargó

/// El error, con el reintento que no tenía: antes esta rama reutilizaba el bloque del vacío cambiando sólo el copy,
/// así que el atleta leía «revisa tu conexión» y no tenía nada que tocar.
struct ChatErrorState: View {
    let onReintentar: () -> Void

    var body: some View {
        EstadoCentradoChat(
            titulo: "No se pudo cargar el chat",
            mensaje: "Revisa tu conexión. Lo que escribas ahora se guarda y sale solo en cuanto vuelvas a tener línea.",
            salida: "Reintentar",
            glifoDeSalida: .reintentar,
            alSalir: onReintentar
        ) {
            FichaDia(tono: .peligro) { IconoChat(.alerta, tam: 24) }
        }
    }
}

// MARK: - Cargando

/// El esqueleto de la conversación con la MISMA forma que lo que llega: burbujas de las dos manos, del ancho y el
/// alto de un mensaje corto y de uno largo. Sólo en la primera carga en frío.
struct ChatCargandoState: View {
    /// (mía, ancho, alto) de cada burbuja fantasma. Alternan para que se lea como una conversación.
    private static let formas: [(mia: Bool, ancho: CGFloat, alto: CGFloat)] = [
        (false, 250, 64), (true, 170, 44), (false, 210, 44), (true, 240, 64),
    ]

    var body: some View {
        VStack(spacing: Theme.Spacing.l) {
            ForEach(Array(Self.formas.enumerated()), id: \.offset) { _, forma in
                SkeletonBar(width: forma.ancho, height: forma.alto, radius: MedidasChat.radioBurbuja)
                    .frame(maxWidth: .infinity, alignment: forma.mia ? .trailing : .leading)
            }
        }
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.vertical, Theme.Spacing.l)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando conversación")
        .accessibilityAddTraits(.updatesFrequently)
    }
}

#if DEBUG
#Preview("Chat · sin estrenar") { EnAmbasDia { ChatVacioState(coachInitials: "MR", prompt: "Escribe a Marta para empezar", onArranque: {}) } }
#Preview("Chat · no carga") { EnAmbasDia { ChatErrorState(onReintentar: {}) } }
#Preview("Chat · cargando") { EnAmbasDia { ChatCargandoState().frame(height: 360) } }
#endif
