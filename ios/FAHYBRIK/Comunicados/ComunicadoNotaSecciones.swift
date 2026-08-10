import SwiftUI

// LAS SECCIONES DE UNA NOTA, DIBUJADAS — y el enlace que la cierra.
//
// Cada forma sabe cómo se pinta, y por eso una cifra sale de cifra, un reparto
// sale de barra y doce semanas salen de espina. Es el mismo dibujo que aprueba
// el coach en su previa (`web/components/v2/atleta-detalle/del-coach`): si aquí
// se pintara «parecido», él firmaría una nota que en este móvil se lee distinta.
//
// Vive fuera de `ComunicadoNotaView` porque la pantalla es un orden de piezas y
// esto son las piezas: mezclarlos deja la nota en un fichero que nadie relee.

// MARK: - Una sección

/// El cuerpo de la tarjeta de una sección. La CIFRA no lleva cabecera: el número
/// es el titular, y ponerle una encima lo bajaría a pie de foto.
struct SeccionDeNota: View {
    let seccion: ComunicadoItem

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if seccion.forma == .cifra {
                CifraDeNota(seccion: seccion)
            } else {
                if let etiqueta = seccion.label, !etiqueta.isEmpty {
                    LabelText(text: etiqueta, size: 10)
                    Hairline()
                }
                cuerpo
            }
        }
    }

    @ViewBuilder
    private var cuerpo: some View {
        switch seccion.forma {
        case .reparto:
            RepartoDeNota(trozos: seccion.trozos)
        case .camino:
            if let camino = seccion.camino {
                EspinaDelPlan(camino: camino)
            }
        case .grafica:
            if let grafica = seccion.grafica {
                GraficaDeNota(grafica: grafica)
            }
        case .texto, .cifra:
            Text(seccion.content)
                .scaledFont(14, relativeTo: .callout)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - La cifra

/// El número que el atleta viene a buscar: a tres metros y en mono, porque se va
/// a comparar con otro. Debajo, el pie con el matiz.
///
/// Una BANDA tiene dos extremos, y el «a» que los une va en SANS aunque los dos
/// lados vayan en mono: dentro del monoespaciado una palabra ocupa una columna
/// de instrumento y parte la banda en tres datos en vez de en una.
private struct CifraDeNota: View {
    let seccion: ComunicadoItem

    private var cifra: String {
        seccion.content.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                if let banda = seccion.bandaDeLaCifra {
                    MonoText(text: banda.desde, size: 38, weight: .heavy)
                    Text("a")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(Theme.Color.muted)
                    MonoText(text: banda.hasta, size: 38, weight: .heavy)
                } else {
                    MonoText(text: cifra, size: 38, weight: .heavy)
                }
            }
            .minimumScaleFactor(0.6)
            .lineLimit(1)
            if let pie = seccion.label, !pie.isEmpty {
                Text(pie)
                    .scaledFont(12.5, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - El reparto

/// La proporción, que se lee de un vistazo. Cada trozo pesa lo que dice su
/// número y su color sale de su SITIO en la barra: un catálogo de intensidades
/// («dura», «moderada») sería el vocabulario de un entrenador metido en el
/// producto, y esto se vende a muchos.
private struct RepartoDeNota: View {
    let trozos: [TrozoReparto]

    /// La barra: fina, porque no es un gráfico, es una proporción.
    private static let alto: CGFloat = 8
    private static let separacion: CGFloat = 3
    private static let radio: CGFloat = 4
    /// Un trozo diminuto sigue teniendo que verse.
    private static let anchoMinimo: CGFloat = 4
    private static let punto: CGFloat = 7

    private var total: Double { trozos.reduce(0) { $0 + $1.valueNum } }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            barra
            FlowLayout(spacing: Theme.Spacing.l) {
                ForEach(Array(trozos.enumerated()), id: \.element.id) { i, trozo in
                    leyenda(trozo, tono: i)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(etiquetaDeVoz)
    }

    private var barra: some View {
        GeometryReader { geo in
            HStack(spacing: Self.separacion) {
                ForEach(Array(trozos.enumerated()), id: \.element.id) { i, trozo in
                    RoundedRectangle(cornerRadius: Self.radio, style: .continuous)
                        .fill(TonosEspina.marca(i))
                        .frame(width: ancho(trozo, en: geo.size.width))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(height: Self.alto)
        .accessibilityHidden(true)
    }

    private func ancho(_ trozo: TrozoReparto, en disponible: CGFloat) -> CGFloat {
        guard total > 0, trozos.count > 0 else { return 0 }
        let util = disponible - Self.separacion * CGFloat(trozos.count - 1)
        guard util > 0 else { return Self.anchoMinimo }
        return max(Self.anchoMinimo, util * CGFloat(trozo.valueNum / total))
    }

    private func leyenda(_ trozo: TrozoReparto, tono: Int) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(TonosEspina.marca(tono))
                .frame(width: Self.punto, height: Self.punto)
            MonoText(text: trozo.cantidad, size: 13, weight: .bold,
                     escala: true, relativeTo: .caption)
            Text(trozo.label)
                .scaledFont(12.5, weight: .medium, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
        }
        .fixedSize()
    }

    /// Dicho de corrido para quien lo escucha: la barra no dice nada en voz alta.
    private var etiquetaDeVoz: String {
        trozos.map { "\($0.cantidad) \($0.label)" }.joined(separator: ", ")
    }
}

// MARK: - La gráfica

/// SUS SEMANAS, y encima lo que el coach marcó sobre ellas.
///
/// El dibujo es el de `ZonasSemanaView`, que es la misma pieza que va a sus
/// Analíticas: lo que se añade aquí es el pie del ANCLA, porque dentro de una
/// nota la gráfica llega sin la pantalla que normalmente explica de dónde salen
/// las bandas. Una banda estimada que se lee como medida es cómo un número que
/// nadie midió acaba siendo la prueba de algo.
private struct GraficaDeNota: View {
    let grafica: GraficaDeZonas

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            ZonasSemanaView(grafica: grafica)
            if let ancla = grafica.anchor {
                Text(PalabrasDeZonas.ancla(ancla))
                    .scaledFont(11.5, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - El enlace cruzado

/// El pie de la nota: a qué otro comunicado apunta y cómo lo dejaste.
///
/// Un briefing que deja una decisión abierta lo DICE y lleva a ella, en vez de
/// dejar que se pierda en otra pantalla. Resuelto no desaparece: se queda como
/// el recibo de lo que decidiste.
struct EnlaceCruzadoComunicado: View {
    let enlace: ComunicadoEnlazado
    let onAbrir: (String) -> Void

    var body: some View {
        Button {
            Haptics.light()
            onAbrir(enlace.id)
        } label: {
            CardSurface(leftAccent: !enlace.resuelto) {
                HStack(alignment: .center, spacing: Theme.Spacing.m) {
                    VStack(alignment: .leading, spacing: 7) {
                        HStack(spacing: Theme.Spacing.s) {
                            if let tipo = enlace.kind {
                                ChipTipoComunicado(tipo: tipo)
                            }
                            if enlace.resuelto {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(Theme.Color.ok)
                            }
                        }
                        Text(enlace.title)
                            .scaledFont(14.5, weight: .semibold, relativeTo: .subheadline)
                            .foregroundStyle(Theme.Color.foreground)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(enlace.linea)
                            .scaledFont(12.5, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.muted)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Theme.Color.faint)
                }
            }
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
