import SwiftUI

// EL PROTOCOLO — lo que el coach quiere que pase antes de algo.
//
// NADA SE OBLIGA: la casilla es del PASO y no del tipo. Un protocolo puede ser siete pasos marcables,
// tres líneas para leer, una mezcla de las dos cosas, o puro texto sin un solo paso. Lo que el coach
// escribe la víspera de una carrera (cuánta agua, cómo comer) es texto para leer, y ponerle un círculo no
// mediría si comió: mediría si tocó un círculo.
//
// De ahí sale toda la pantalla: el avance «N de M» y el botón de cerrar cuentan SOLO las casillas, y si
// no hay ninguna no se enseña ni una cosa ni la otra — leerlo era el acto, y ya queda visto al abrirlo.
//
// La columna izquierda es la MARCA que escribe el coach («−40'», «Al llegar», «Con el café»): va en cifra
// de ancho fijo y alineada a la derecha porque una columna de instrumento se lee por la unidad, y con
// «−40'» y «−8'» alineados a la izquierda los minutos acaban en dos sitios distintos. Lo que dice esa
// marca es MÉTODO del coach y aquí no se interpreta: no se le pone título, no se asume que cuenta hacia
// atrás y no se reordena.

struct ComunicadoProtocoloView: View {
    let comunicado: Comunicado
    let acciones: ComunicadosAcciones
    let onVolver: () -> Void

    var body: some View {
        ComunicadoProtocoloContenido(
            comunicado: comunicado,
            envio: acciones.envio,
            onVolver: onVolver,
            onMarcarPaso: { paso, hecho in
                Task { await acciones.marcarPaso(comunicado, itemId: paso.id, hecho: hecho) }
            },
            onMarcarHecho: { Task { await acciones.marcarHecho(comunicado) } }
        )
    }
}

/// Lo que pinta el protocolo, sin saber de actos ni de red.
struct ComunicadoProtocoloContenido: View {
    let comunicado: Comunicado
    let envio: EnvioComunicado
    let onVolver: () -> Void
    let onMarcarPaso: (ComunicadoItem, Bool) -> Void
    let onMarcarHecho: () -> Void

    /// Ancho de la columna de marcas: escala con el texto, que si no a tamaño accesible «−40'» se parte.
    @ScaledMetric(relativeTo: .subheadline) private var anchoMarca: CGFloat = 52

    private var pasos: [ComunicadoItem] { comunicado.items }
    private var marcados: Set<String> { Set(comunicado.markedItemIds) }
    private var hechos: Int { comunicado.pasosHechos }
    private var casillas: Int { comunicado.pasosMarcables.count }
    private var hayCasillas: Bool { comunicado.tienePasosMarcables }
    private var completo: Bool { comunicado.protocoloCompleto }
    private var cerrado: Bool { comunicado.state == .hecho }
    /// La columna solo existe si el coach escribió alguna marca: sin ella, el texto empieza donde empieza
    /// la tarjeta.
    private var hayMarcas: Bool { pasos.contains { $0.label?.isEmpty == false } }

    var body: some View {
        // La acción anclada solo existe cuando hay algo que cerrar. Un protocolo de lectura con una barra
        // vacía abajo prometería un acto que no tiene.
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
                    Text("\(hechos) de \(casillas)")
                        .papel(.notaPesada)
                        .foregroundStyle(Theme.Color.foreground)
                        .accessibilityLabel("\(hechos) de \(casillas) pasos")
                } else {
                    InsigniaComunicado(insignia: comunicado.insignia())
                }
            }
            FillingScreen {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                        TituloComunicado(comunicado: comunicado)
                        CuerpoComunicado(texto: comunicado.body)
                        if hayCasillas {
                            RegletaDia(n: hechos, de: casillas)
                        }
                    }

                    if !pasos.isEmpty { tarjetaPasos }
                    NotaFinalComunicado(comunicado: comunicado)
                    Spacer(minLength: 0)
                }
                .cuerpoDeDetalle()
            }
        }
    }

    private var tarjetaPasos: some View {
        ListaDia {
            ForEach(pasos) { paso in
                FilaPasoProtocolo(
                    paso: paso,
                    hecho: marcados.contains(paso.id),
                    anchoMarca: hayMarcas ? anchoMarca : 0,
                    // La columna de la casilla se reserva para TODAS las filas en cuanto una la lleva: si
                    // no, las de lectura partirían el texto por otro sitio y la tarjeta se leería como dos
                    // listas pegadas.
                    reservaCasilla: hayCasillas,
                    onTap: { onMarcarPaso(paso, !marcados.contains(paso.id)) }
                )
            }
        }
    }

    /// La CTA no se activa hasta que están todas las casillas. Un «hecho» que se puede pulsar con cero
    /// marcadas no es un estado, es un botón — y el coach acabaría con el mismo dato que tiene hoy: ninguno.
    /// Cerrado, el botón desaparece: el servidor no deshace un «hecho».
    private var pie: some View {
        VStack(spacing: Theme.Spacing.s) {
            if !cerrado {
                BotonAccionDia(
                    "Protocolo hecho",
                    relleno: .acento,
                    completa: true,
                    estado: completo ? .normal : .inactivo,
                    impacto: .medio,
                    accion: onMarcarHecho
                )
            }
            Text(PieDeDetalle.protocolo(comunicado))
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            AvisoEnvioComunicado(estado: envio)
        }
        .padding(.horizontal, Theme.Spacing.pantalla - Theme.Spacing.l)
    }
}

// MARK: - La fila

/// Una fila del protocolo — con casilla o de lectura.
///
/// Con casilla, la fila ENTERA es el control: de pie, sudando y con una mano, acertar un círculo de 20 pt
/// no es realista. Sin ella no es un control en absoluto: ni botón, ni área de toque, ni círculo apagado
/// que invite a pulsarlo. Es texto, y se lee.
struct FilaPasoProtocolo: View {
    let paso: ComunicadoItem
    let hecho: Bool
    let anchoMarca: CGFloat
    /// Deja el hueco de la casilla aunque esta fila no la lleve, para que el texto de todas las filas
    /// rompa por el mismo sitio.
    var reservaCasilla: Bool = true
    let onTap: () -> Void

    private static let casilla: CGFloat = 28

    var body: some View {
        if paso.checkable {
            Button {
                Haptics.light()
                onTap()
            } label: { fila }
                .buttonStyle(PressScaleStyle(escala: 0.985))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(etiqueta)
                .accessibilityValue(hecho ? "hecho" : "sin hacer")
                .accessibilityAddTraits(.isButton)
        } else {
            fila
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(etiqueta)
        }
    }

    private var fila: some View {
        HStack(spacing: Theme.Spacing.m) {
            if anchoMarca > 0 {
                Text(paso.label ?? "")
                    .papel(.notaPesada)
                    .foregroundStyle(hecho ? Theme.Color.muted : Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(width: anchoMarca, alignment: .trailing)
            }
            Text(paso.content)
                .papel(.cuerpo)
                .foregroundStyle(colorTexto)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if paso.checkable {
                SelloEstadoDia(estado: hecho ? .hecha : .pendiente, tam: Self.casilla)
            } else if reservaCasilla {
                SwiftUI.Color.clear.frame(width: Self.casilla, height: 1)
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: 60)
        .contentShape(Rectangle())
    }

    /// Un paso de lectura no se apaga al avanzar el protocolo: no está «sin hacer», es que no había nada
    /// que hacer con él.
    private var colorTexto: Color {
        if !paso.checkable { return Theme.Color.foreground }
        return hecho ? Theme.Color.muted : Theme.Color.foreground
    }

    private var etiqueta: String {
        [paso.label, paso.content].compactMap { $0 }.joined(separator: ", ")
    }
}
