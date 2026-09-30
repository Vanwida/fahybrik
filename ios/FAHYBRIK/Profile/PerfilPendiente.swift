import SwiftUI

// «PENDIENTE» — lo que espera una respuesta suya, en UNA superficie. Espejo de `pendiente.tsx`.
//
// Es el equivalente de «Contigo» en Hoy, y la misma regla: se pinta lo que hay y nada más (sin nada
// pendiente no hay sección, ni un envoltorio vacío), en el orden en que CADUCA
// (`DecidePerfil.pendientes`), y solo entran ACTOS. Una suscripción que termina o una invitación
// enviada no reclaman nada: viven como estado en su puerta.
//
// La pregunta de COROS deja de ser un diálogo del sistema que salta al abrir Perfil: es la primera
// fila y se contesta ahí mismo, con sus tres respuestas a la vista. «Ahora no» no la borra del todo
// (el servidor la conserva y se vuelve a preguntar al abrir Perfil), y lo dice.

/// Lo que el atleta contesta a «¿Esto es el entreno?».
enum RespuestaCoros: Equatable {
    case si, no, ahoraNo
}

struct PendientePerfilSeccion: View {
    let items: [PendientePerfil]
    /// Hay una respuesta en camino al servidor: no admite otra encima.
    let respondiendoCoros: Bool
    let alResponderCoros: (RespuestaCoros) -> Void
    let alAbrirSuscripcion: () -> Void
    let alInvitarPareja: () -> Void

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                TituloSeccionDia("Pendiente") {
                    InfoPill(text: items.count == 1 ? "1 cosa" : "\(items.count) cosas", estilo: .velo)
                }
                ListaDia {
                    ForEach(items) { fila($0) }
                }
            }
        }
    }

    @ViewBuilder
    private func fila(_ item: PendientePerfil) -> some View {
        switch item {
        case let .coros(inicio):
            FilaCorosPerfil(inicio: inicio, enCurso: respondiendoCoros, alResponder: alResponderCoros)
        case .suscripcion:
            filaTocable(FichaDia(.tarjeta, tono: .peligro), TextosPerfil.pendiente(item), alTocar: alAbrirSuscripcion)
        case .pareja:
            filaTocable(FichaDia(.invitar, tono: .normal), TextosPerfil.pendiente(item), alTocar: alInvitarPareja)
        }
    }

    /// Una fila que se toca: ficha, título, detalle y chevron.
    private func filaTocable(_ ficha: FichaDia<IconoDia>, _ texto: (titulo: String, detalle: String), alTocar: @escaping () -> Void) -> some View {
        FilaDia(ficha: ficha, titulo: texto.titulo, etiqueta: "\(texto.titulo). \(texto.detalle)", altoMinimo: 72, alTocar: alTocar) {
            Text(texto.detalle)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - La pregunta de COROS

/// La pregunta, con sus tres respuestas dentro de la propia fila.
private struct FilaCorosPerfil: View {
    let inicio: String?
    let enCurso: Bool
    let alResponder: (RespuestaCoros) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                FichaDia(.pulso, tono: .realce)
                VStack(alignment: .leading, spacing: 2) {
                    Text(TextosPerfil.preguntaCoros)
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    // Sobre el tinte del acento, la tinta del tema: el gris de apoyo baja de 4,5:1 con
                    // un acento claro (regla medida del kit).
                    Text(TextosPerfil.detalleCoros(inicio: inicio))
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            respuestas
        }
        .padding(EdgeInsets(top: 16, leading: 16, bottom: 12, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.accentTint)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(TextosPerfil.preguntaCoros)
    }

    /// Sí · No · Ahora no. Con texto grande las tres no caben en una línea y pasan a una columna.
    private var respuestas: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.s) { botones }
            VStack(alignment: .leading, spacing: Theme.Spacing.s) { botones }
        }
        .opacity(enCurso ? 0.5 : 1)
        .disabled(enCurso)
    }

    @ViewBuilder
    private var botones: some View {
        BotonRespuestaPerfil("Sí", variante: .tinta) { alResponder(.si) }
        BotonRespuestaPerfil("No", variante: .borde) { alResponder(.no) }
        BotonRespuestaPerfil("Ahora no", variante: .texto) { alResponder(.ahoraNo) }
    }
}

/// Una de las tres respuestas. Tres pesos: la que se elige casi siempre (tinta), la alternativa (contorno)
/// y la que aplaza (texto subrayado). Todas de 48 pt de alto.
private struct BotonRespuestaPerfil: View {
    enum Variante { case tinta, borde, texto }

    let titulo: String
    let variante: Variante
    let accion: () -> Void

    init(_ titulo: String, variante: Variante, accion: @escaping () -> Void) {
        self.titulo = titulo
        self.variante = variante
        self.accion = accion
    }

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            Text(titulo)
                .papel(.accion)
                .underline(variante == .texto, pattern: .solid)
                .foregroundStyle(variante == .tinta ? Theme.Color.background : Theme.Color.foreground)
                .padding(.horizontal, variante == .tinta ? 26 : variante == .borde ? 24 : Theme.Spacing.s)
                .frame(minHeight: Theme.Size.toque)
                .background {
                    switch variante {
                    case .tinta: Capsule().fill(Theme.Color.foreground)
                    case .borde: Capsule().strokeBorder(Theme.Color.foreground, lineWidth: 1.5)
                    case .texto: Color.clear
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
    }
}

