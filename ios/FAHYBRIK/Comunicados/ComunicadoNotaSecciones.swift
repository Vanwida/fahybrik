import SwiftUI

// LAS SECCIONES DE UNA NOTA, DIBUJADAS — y el enlace que la cierra.
//
// Cada forma sabe cómo se pinta, y por eso una cifra sale de cifra, un reparto sale de barra y doce
// semanas salen de espina. Es el mismo dibujo que aprueba el coach en su previa
// (`web/components/v2/atleta-detalle/del-coach`): si aquí se pintara «parecido», él firmaría una nota que
// en este móvil se lee distinta.
//
// Vive fuera de `ComunicadoNotaView` porque la pantalla es un orden de piezas y esto son las piezas:
// mezclarlos deja la nota en un fichero que nadie relee.

// MARK: - Una sección

/// El cuerpo de la tarjeta de una sección. La CIFRA no lleva cabecera: el número es el titular, y ponerle
/// una encima lo bajaría a pie de foto. El nombre de la sección es del coach y se escribe como él lo
/// escribió (un subtítulo, no unas versales).
struct SeccionDeNota: View {
    let seccion: ComunicadoItem

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if seccion.forma == .cifra {
                CifraDeNota(seccion: seccion)
            } else {
                if let etiqueta = seccion.label, !etiqueta.isEmpty {
                    SubtituloDia(etiqueta)
                }
                cuerpo
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
        case .test_result:
            if let report = seccion.testResult?.report {
                InformeDeTestEnNota(report: report)
            }
        case .texto, .cifra:
            Text(seccion.content)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - La cifra

/// El número que el atleta viene a buscar: a tres metros y en cifra de ancho fijo, porque se va a comparar
/// con otro. Debajo, el pie con el matiz.
///
/// Una BANDA tiene dos extremos, y el «a» que los une va en texto normal aunque los dos lados vayan en
/// cifra: dentro del tipo del dato una palabra se lee como un tercer dato y parte la banda en tres.
private struct CifraDeNota: View {
    let seccion: ComunicadoItem

    private var cifra: String {
        seccion.content.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                if let banda = seccion.bandaDeLaCifra {
                    numero(banda.desde)
                    Text("a")
                        .papel(.cuerpo)
                        .foregroundStyle(Theme.Color.muted)
                    numero(banda.hasta)
                } else {
                    numero(cifra)
                }
            }
            if let pie = seccion.label, !pie.isEmpty {
                Text(pie)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    /// Una sola línea que se encoge antes que partirse: una cifra a dos líneas deja de ser una cifra.
    private func numero(_ texto: String) -> some View {
        Text(texto)
            .papel(.sujeto)
            .foregroundStyle(Theme.Color.foreground)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
    }
}

// MARK: - El reparto

/// La proporción, que se lee de un vistazo. Cada trozo pesa lo que dice su número y su color sale de su
/// SITIO en la barra: un catálogo de intensidades («dura», «moderada») sería el vocabulario de un
/// entrenador metido en el producto, y esto se vende a muchos.
private struct RepartoDeNota: View {
    let trozos: [TrozoReparto]

    /// La barra: fina, porque no es un gráfico, es una proporción.
    private static let alto: CGFloat = 10
    private static let separacion: CGFloat = 3
    private static let radio: CGFloat = 5
    /// Un trozo diminuto sigue teniendo que verse.
    private static let anchoMinimo: CGFloat = 4
    private static let punto: CGFloat = 10

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
        HStack(spacing: Theme.Spacing.s - 2) {
            Circle()
                .fill(TonosEspina.marca(tono))
                .frame(width: Self.punto, height: Self.punto)
            Text(trozo.cantidad)
                .papel(.notaPesada)
                .foregroundStyle(Theme.Color.foreground)
            Text(trozo.label)
                .papel(.nota)
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
/// El dibujo es el de `ZonasSemanaView`, que es la misma pieza que va a sus Analíticas: lo que se añade
/// aquí es el pie del ANCLA, porque dentro de una nota la gráfica llega sin la pantalla que normalmente
/// explica de dónde salen las bandas. Una banda estimada que se lee como medida es cómo un número que
/// nadie midió acaba siendo la prueba de algo.
private struct GraficaDeNota: View {
    let grafica: GraficaDeZonas

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            ZonasSemanaView(grafica: grafica)
            if let ancla = grafica.anchor {
                Text(PalabrasDeZonas.ancla(ancla))
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - El enlace cruzado

/// El pie de la nota: a qué otro comunicado apunta y cómo lo dejaste.
///
/// Un briefing que deja una decisión abierta lo DICE y lleva a ella, en vez de dejar que se pierda en otra
/// pantalla. Resuelto no desaparece: se queda como el recibo de lo que decidiste.
struct EnlaceCruzadoComunicado: View {
    let enlace: ComunicadoEnlazado
    let onAbrir: (String) -> Void

    var body: some View {
        Button {
            Haptics.light()
            onAbrir(enlace.id)
        } label: {
            HStack(alignment: .center, spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    HStack(spacing: Theme.Spacing.s) {
                        if let tipo = enlace.kind {
                            ChipTipoComunicado(tipo: tipo)
                        }
                        if enlace.resuelto {
                            SelloEstadoDia(estado: .hecha, tam: 20)
                        }
                    }
                    Text(enlace.title)
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(enlace.linea)
                        .papel(.nota)
                        // Sobre el tinte del acento (sin resolver) el texto es la tinta del tema.
                        .foregroundStyle(enlace.resuelto ? Theme.Color.muted : Theme.Color.foreground)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
            }
            .padding(Theme.Spacing.l)
            .tarjetaDia(realce: !enlace.resuelto, alAncho: true)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.985))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - El informe de un test

struct InformeDeTestEnNota: View {
    let report: CmjReportDTO

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.s) {
                Text("\(Int(report.unloadedCm.rounded()))")
                    .papel(.dato)
                    .foregroundStyle(Theme.Color.foreground)
                Text("cm · \(report.heightLabel)")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
            if let lri = report.lri, let label = report.lriLabel {
                Text("LRI \(Formato.esDecimal(lri, decimals: 2, siempreDecimales: true)) · \(label)")
                    .papel(.notaFuerte)
                    .foregroundStyle(Theme.Color.muted)
            }
            Text(report.lectura)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
