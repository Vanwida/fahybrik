import SwiftUI

// EL PROTOCOLO — lo que el coach quiere que pase antes de algo.
//
// NADA SE OBLIGA: la casilla es del PASO y no del tipo. Un protocolo puede ser
// siete pasos marcables, tres líneas para leer, una mezcla de las dos cosas, o
// puro texto sin un solo paso. Lo que el coach escribe la víspera de una carrera
// (cuánta agua, cómo comer) es texto para leer, y ponerle un círculo no mediría
// si comió: mediría si tocó un círculo.
//
// De ahí sale toda la pantalla: el avance «N de M» y el botón de cerrar cuentan
// SOLO las casillas, y si no hay ninguna no se enseña ni una cosa ni la otra —
// leerlo era el acto, y ya queda visto al abrirlo.
//
// La columna izquierda es la MARCA que escribe el coach («−40'», «Al llegar»,
// «Con el café»): va en monoespaciado y alineada a la derecha porque una
// columna de instrumento se lee por la unidad, y con «−40'» y «−8'» alineados a
// la izquierda los minutos acaban en dos sitios distintos. Lo que dice esa marca
// es MÉTODO del coach y aquí no se interpreta: no se le pone título, no se
// asume que cuenta hacia atrás y no se reordena.

struct ComunicadoProtocoloView: View {
    let comunicado: Comunicado
    let acciones: ComunicadosAcciones
    let onVolver: () -> Void

    /// Ancho de la columna de marcas. El separador arranca donde arranca el
    /// texto, no en el borde de la tarjeta.
    private static let anchoMarca: CGFloat = 44

    private var pasos: [ComunicadoItem] { comunicado.items }
    private var marcados: Set<String> { Set(comunicado.markedItemIds) }
    private var hechos: Int { comunicado.pasosHechos }
    private var casillas: Int { comunicado.pasosMarcables.count }
    private var hayCasillas: Bool { comunicado.tienePasosMarcables }
    private var completo: Bool { comunicado.protocoloCompleto }
    private var cerrado: Bool { comunicado.state == .hecho }
    /// La columna solo existe si el coach escribió alguna marca: sin ella, el
    /// texto empieza donde empieza la tarjeta.
    private var hayMarcas: Bool { pasos.contains { $0.label?.isEmpty == false } }

    var body: some View {
        // La acción anclada solo existe cuando hay algo que cerrar. Un protocolo
        // de lectura con una barra vacía abajo prometería un acto que no tiene.
        if hayCasillas {
            contenido.anchoredAction { pie }
        } else {
            contenido
        }
    }

    private var contenido: some View {
        VStack(spacing: 0) {
            CabeceraComunicado(comunicado: comunicado, onVolver: onVolver) {
                if hayCasillas && !cerrado {
                    MonoText(
                        text: "\(hechos) de \(casillas)",
                        size: 13,
                        weight: .bold,
                        color: completo ? Theme.Color.ok : Theme.Color.muted
                    )
                } else {
                    InsigniaComunicado(insignia: comunicado.insignia())
                }
            }
            FillingScreen {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        TituloComunicado(comunicado: comunicado, tamano: 24)
                        CuerpoComunicado(texto: comunicado.body, tamano: 13.5)
                        if hayCasillas {
                            BarraPasosProtocolo(hechos: hechos, total: casillas)
                        }
                    }

                    if !pasos.isEmpty { tarjetaPasos }
                    if let nota = comunicado.finalNote,
                       !nota.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        notaFinal(nota)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xl)
            }
        }
    }

    private var tarjetaPasos: some View {
        CardSurface(padding: 0) {
            VStack(spacing: 0) {
                ForEach(Array(pasos.enumerated()), id: \.element.id) { i, paso in
                    if i > 0 {
                        Hairline().padding(.leading, sangradoFila)
                    }
                    FilaPasoProtocolo(
                        paso: paso,
                        hecho: marcados.contains(paso.id),
                        anchoMarca: hayMarcas ? Self.anchoMarca : 0,
                        // La columna de la casilla se reserva para TODAS las
                        // filas en cuanto una la lleva: si no, las de lectura
                        // partirían el texto por otro sitio y la tarjeta se
                        // leería como dos listas pegadas.
                        reservaCasilla: hayCasillas,
                        onTap: {
                            Task {
                                await acciones.marcarPaso(
                                    comunicado,
                                    itemId: paso.id,
                                    hecho: !marcados.contains(paso.id)
                                )
                            }
                        }
                    )
                }
            }
        }
    }

    private func notaFinal(_ nota: String) -> some View {
        CardSurface(leftAccent: true) {
            VStack(alignment: .leading, spacing: 6) {
                LabelText(text: "Nota de \(comunicado.nombreCoach)", size: 9.5)
                Text(nota)
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// La CTA no se activa hasta que están todas las casillas. Un «hecho» que se
    /// puede pulsar con cero marcadas no es un estado, es un botón — y el coach
    /// acabaría con el mismo dato que tiene hoy: ninguno.
    private var pie: some View {
        VStack(spacing: Theme.Spacing.s) {
            ExpertPrimaryButton(title: "Protocolo hecho", enabled: completo && !cerrado) {
                Task { await acciones.marcarHecho(comunicado) }
            }
            Text(pieCTA)
                .scaledFont(11.5, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.faint)
                .multilineTextAlignment(.center)
            AvisoEnvioComunicado(estado: acciones.envio)
        }
    }

    private var sangradoFila: CGFloat {
        Theme.Spacing.l + (hayMarcas ? Self.anchoMarca + Theme.Spacing.m : 0)
    }

    private var pieCTA: String {
        let coach = comunicado.nombreCoach
        if cerrado { return "\(coach) ya lo ve cerrado." }
        if completo { return "\(coach) verá que lo has hecho." }
        let faltan = casillas - hechos
        return faltan == 1
            ? "Te queda 1 paso por marcar."
            : "Te quedan \(faltan) pasos por marcar."
    }
}

// MARK: - El avance

/// Dos pasos de siete es un dato; una barra a medias, una sensación. Un
/// segmento por paso, así que el avance se cuenta con la vista.
struct BarraPasosProtocolo: View {
    let hechos: Int
    let total: Int

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<max(total, 1), id: \.self) { i in
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(i < hechos ? Theme.Color.ok : Theme.Color.surfaceSunken)
                    .frame(height: 4)
            }
        }
        .animation(.easeOut(duration: 0.18), value: hechos)
        .accessibilityHidden(true)
    }
}

// MARK: - La fila

/// Una fila del protocolo — con casilla o de lectura.
///
/// Con casilla, la fila ENTERA es el control: de pie, sudando y con una mano,
/// acertar un círculo de 20 pt no es realista. Sin ella no es un control en
/// absoluto: ni botón, ni área de toque, ni círculo apagado que invite a
/// pulsarlo. Es texto, y se lee.
struct FilaPasoProtocolo: View {
    let paso: ComunicadoItem
    let hecho: Bool
    let anchoMarca: CGFloat
    /// Deja el hueco de la casilla aunque esta fila no la lleve, para que el
    /// texto de todas las filas rompa por el mismo sitio.
    var reservaCasilla: Bool = true
    let onTap: () -> Void

    private static let anchoCasilla: CGFloat = 21

    var body: some View {
        if paso.checkable {
            Button {
                Haptics.light()
                onTap()
            } label: { fila }
                .buttonStyle(PressScaleStyle())
                .accessibilityLabel(etiqueta)
                .accessibilityValue(hecho ? "hecho" : "sin hacer")
                .accessibilityAddTraits(.isButton)
        } else {
            fila
                .accessibilityElement(children: .combine)
                .accessibilityLabel(etiqueta)
        }
    }

    private var fila: some View {
        HStack(spacing: Theme.Spacing.m) {
            if anchoMarca > 0 {
                MonoText(
                    text: paso.label ?? "",
                    size: 14,
                    weight: .bold,
                    color: hecho ? Theme.Color.faint : Theme.Color.foreground
                )
                .frame(width: anchoMarca, alignment: .trailing)
            }
            Text(paso.content)
                .scaledFont(14, weight: .medium, relativeTo: .subheadline)
                .foregroundStyle(colorTexto)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if paso.checkable {
                Image(systemName: hecho ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: Self.anchoCasilla, weight: .regular))
                    .foregroundStyle(hecho ? Theme.Color.ok : Theme.Color.faint)
            } else if reservaCasilla {
                SwiftUI.Color.clear.frame(width: Self.anchoCasilla, height: 1)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
    }

    /// Un paso de lectura no se apaga al avanzar el protocolo: no está «sin
    /// hacer», es que no había nada que hacer con él.
    private var colorTexto: Color {
        if !paso.checkable { return Theme.Color.foreground }
        return hecho ? Theme.Color.muted : Theme.Color.foreground
    }

    private var etiqueta: String {
        [paso.label, paso.content].compactMap { $0 }.joined(separator: ", ")
    }
}
