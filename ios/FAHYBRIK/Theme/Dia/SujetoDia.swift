import SwiftUI

// EL CASCARÓN DEL SUJETO — un bloque editorial a todo el ancho con el tinte de su momento.
//
// Es la superficie DOMINANTE de la pantalla (CONTRATO-UI §10.4: o manda sobre todo lo
// demás, o no lleva caja): la única con este radio (28) y la única con tipo de 44 pt.
// Una pantalla tiene UN sujeto; los tonos (`TonoDia`) dicen qué momento es.
//
// ALTURA (§6.1, estrategia `llena`). El cascarón pide todo el alto que sobre
// (`maxHeight: .infinity`) y reparte con un `Spacer` ENTRE lo de arriba y lo de abajo,
// de modo que el sobrante entra en el propio sujeto —entre el título y su acción— y
// jamás en una cola muerta debajo. Para que reciba ese sobrante hay que ponerlo en un
// `FillingScreen`; en un `ScrollView` a secas se queda en su alto natural.
//
// RANURAS. `arriba` es lo que ES (kicker, título, apoyo) y `abajo` lo que HACES (la
// acción, o lo que la sostiene). Los textos de dentro (`KickerDia`, `TituloDia`,
// `ApoyoDia`) leen el tono del entorno: no se le repite a cada uno.
//
//     SujetoDia(tono: .accion, etiqueta: "Series 6×800. Por hacer. Ver en el Plan", alTocar: { … }) {
//         KickerDia("Hoy · Carrera") { InfoPill(text: "Por hacer", estilo: .sobreAccion) }
//         TituloDia("Series 6×800")
//     } abajo: {
//         AccionDia("Ver en el Plan")
//     }
//
// Con `alTocar` el bloque ENTERO es UN botón (y su acción es solo la pastilla que lo dibuja);
// sin él es una sección que lleva sus propios controles dentro.

struct SujetoDia<Arriba: View, Abajo: View>: View {
    let tono: TonoDia
    /// El nombre accesible del botón entero, o de la sección. Es la frase que lee VoiceOver.
    var etiqueta: String?
    /// El bloque entero como botón.
    var alTocar: (() -> Void)?
    /// Algo cambia dentro y hay que anunciarlo al aparecer (un error de carga): el equivalente
    /// de `role="alert"` del doble. Usa `etiqueta` como texto.
    var anuncia: Bool
    @ViewBuilder let arriba: () -> Arriba
    @ViewBuilder let abajo: () -> Abajo

    private static var altoMinimo: CGFloat { 244 }

    init(
        tono: TonoDia,
        etiqueta: String? = nil,
        alTocar: (() -> Void)? = nil,
        anuncia: Bool = false,
        @ViewBuilder _ arriba: @escaping () -> Arriba,
        @ViewBuilder abajo: @escaping () -> Abajo
    ) {
        self.tono = tono
        self.etiqueta = etiqueta
        self.alTocar = alTocar
        self.anuncia = anuncia
        self.arriba = arriba
        self.abajo = abajo
    }

    @ViewBuilder
    var body: some View {
        if let alTocar {
            Button(action: alTocar) { bloque }
                .buttonStyle(PressScaleStyle(escala: 0.982))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(etiqueta ?? "")
                .accessibilityAddTraits(.isButton)
        } else if let etiqueta {
            bloque
                .accessibilityElement(children: .contain)
                .accessibilityLabel(etiqueta)
                .onAppear(perform: anunciaSiToca)
        } else {
            bloque
        }
    }

    private var bloque: some View {
        let papeles = tono.papeles
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.sujeto, style: .continuous)
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) { arriba() }
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 22)
            VStack(alignment: .leading, spacing: Theme.Spacing.l) { abajo() }
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(EdgeInsets(top: 22, leading: 22, bottom: 20, trailing: 22))
        .frame(minHeight: Self.altoMinimo, maxHeight: .infinity, alignment: .topLeading)
        .background {
            ZStack {
                papeles.fondo
                TirasDia()
                    .fill(papeles.deco.color)
                    .blendMode(papeles.deco.mezcla)
            }
            .compositingGroup()
        }
        .overlay { forma.strokeBorder(papeles.borde, lineWidth: 1) }
        .clipShape(forma)
        .contentShape(forma)
        .environment(\.tonoDia, tono)
    }

    private func anunciaSiToca() {
        guard anuncia, let etiqueta else { return }
        AccessibilityNotification.Announcement(etiqueta).post()
    }
}

extension SujetoDia where Abajo == EmptyView {
    /// Un sujeto sin acción propia (el sujeto de un estado de solo lectura).
    init(
        tono: TonoDia,
        etiqueta: String? = nil,
        alTocar: (() -> Void)? = nil,
        anuncia: Bool = false,
        @ViewBuilder _ arriba: @escaping () -> Arriba
    ) {
        self.init(tono: tono, etiqueta: etiqueta, alTocar: alTocar, anuncia: anuncia, arriba, abajo: { EmptyView() })
    }
}

// MARK: - Las tiras de marca

/// Las tiras oblicuas: el corte inclinado del logotipo, como única decoración del sujeto. Dos
/// tiras (una ancha pegada al borde derecho y otra fina más adentro), inclinadas 18° y
/// desbordando 30 pt por arriba y por abajo para que el corte no muestre extremos.
private struct TirasDia: Shape {
    func path(in rect: CGRect) -> Path {
        let desborde: CGFloat = 30
        let alto = rect.height + 2 * desborde
        let inclinacion = tan(18 * .pi / 180) * alto / 2
        var trazo = Path()
        for (derecha, ancho) in [(CGFloat(-24), CGFloat(84)), (CGFloat(76), CGFloat(22))] {
            let x1 = rect.maxX - derecha
            let x0 = x1 - ancho
            // Arriba se corre a la derecha y abajo a la izquierda: `skewX(-18°)` alrededor del centro.
            trazo.move(to: CGPoint(x: x0 + inclinacion, y: rect.minY - desborde))
            trazo.addLine(to: CGPoint(x: x1 + inclinacion, y: rect.minY - desborde))
            trazo.addLine(to: CGPoint(x: x1 - inclinacion, y: rect.maxY + desborde))
            trazo.addLine(to: CGPoint(x: x0 - inclinacion, y: rect.maxY + desborde))
            trazo.closeSubpath()
        }
        return trazo
    }
}

// MARK: - Los textos del sujeto (leen el tono del entorno)

private struct TonoDiaKey: EnvironmentKey {
    static let defaultValue: TonoDia = .neutro
}

extension EnvironmentValues {
    /// El tono del sujeto en que está la vista. Lo pone `SujetoDia`; lo leen sus textos.
    var tonoDia: TonoDia {
        get { self[TonoDiaKey.self] }
        set { self[TonoDiaKey.self] = newValue }
    }
}

/// La etiqueta que abre un sujeto, con algo a la derecha si hace falta (una pastilla de estado,
/// un glifo, «2 de 5»).
struct KickerDia<Aparte: View>: View {
    let texto: String
    let aparte: Aparte
    @Environment(\.tonoDia) private var tono

    init(_ texto: String, @ViewBuilder aparte: () -> Aparte) {
        self.texto = texto
        self.aparte = aparte()
    }

    private var etiqueta: some View {
        Text(texto)
            .papel(.kicker)
            .foregroundStyle(tono.papeles.tinta)
    }

    var body: some View {
        // Si la etiqueta y lo suyo no caben en una línea (texto grande), lo suyo pasa debajo: una etiqueta
        // partida por la mitad de la palabra («CARRER/A») no se lee.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.m) {
                etiqueta
                Spacer(minLength: Theme.Spacing.m)
                aparte
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                etiqueta
                aparte
            }
        }
        .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
    }
}

extension KickerDia where Aparte == EmptyView {
    init(_ texto: String) {
        self.init(texto, aparte: { EmptyView() })
    }
}

/// El título del sujeto baja un escalón en vez de partirse en cinco líneas: 44 · 36 · 30 según lo largo que es. El
/// más pequeño sigue siendo el sujeto: manda sobre todo lo demás.
enum EscalonDeTitulo: CGFloat {
    case grande = 44
    case medio = 36
    case chico = 30

    init(titulo: String) {
        switch titulo.count {
        case ...24: self = .grande
        case ...40: self = .medio
        default:    self = .chico
        }
    }
}

/// El título del sujeto: display de marca, pesado e inclinado (herencia del logotipo). Un título largo no se
/// parte en cinco líneas: cada pantalla dice CÓMO se ajusta (`Ajuste`), y en todos los casos crece con el texto
/// del sistema, no baja de su medida base y no pasa de ×1,3 (los papeles grandes).
struct TituloDia: View {
    enum Ajuste: Equatable {
        /// El título entero a 44 pt: el de una frase corta («Series 6×800»). Un título de VARIAS palabras se parte entre
        /// palabras; una palabra SOLA («Construyendo», que la pone el coach y puede ser larga) no se parte por la
        /// mitad: se encoge hasta caber en una línea, hasta la mitad de su tamaño.
        case libre
        /// Baja de escalón según lo largo que es (`EscalonDeTitulo`: 44 · 36 · 30) y llega a tres líneas.
        case escalones
        /// Un NOMBRE que no admite recortarse: dos líneas y, si no caben, más pequeño hasta `minimo` de su tamaño
        /// (44 → ~31 pt: a partir de ahí ya no es el sujeto de la pantalla). Con el texto del sistema en tamaños de
        /// accesibilidad pasa a lo que haga falta: cortado con «…» ya no es el nombre de nadie.
        case reduce(minimo: CGFloat = 0.7)
    }

    let texto: String
    var ajuste: Ajuste
    @Environment(\.tonoDia) private var tono
    @Environment(\.dynamicTypeSize) private var tamanoDeTexto

    /// Hasta dónde se encoge una palabra sola: por debajo de la mitad del sujeto ya no manda sobre lo demás.
    private static let escalaMinimaDeUnaPalabra: CGFloat = 0.5

    init(_ texto: String, ajuste: Ajuste = .libre) {
        self.texto = texto
        self.ajuste = ajuste
    }

    var body: some View {
        Group {
            switch ajuste {
            case .libre:
                let unaPalabra = !texto.contains(" ")
                Text(texto).papel(.sujeto)
                    .lineLimit(unaPalabra ? 1 : nil)
                    .minimumScaleFactor(unaPalabra ? Self.escalaMinimaDeUnaPalabra : 1)
            case .escalones:
                Text(texto).papel(.sujeto, tamano: EscalonDeTitulo(titulo: texto).rawValue).lineLimit(3)
            case .reduce(let minimo):
                Text(texto).papel(.sujeto)
                    .lineLimit(tamanoDeTexto.isAccessibilitySize ? nil : 2)
                    .minimumScaleFactor(minimo)
            }
        }
        .foregroundStyle(tono.papeles.tinta)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
    }
}

/// La frase de apoyo bajo el título. Sólida y jamás un gris (ver `TonoDia.Papeles.tinta`).
struct ApoyoDia: View {
    let texto: String
    @Environment(\.tonoDia) private var tono

    init(_ texto: String) { self.texto = texto }

    var body: some View {
        Text(texto)
            .papel(.cuerpo)
            .foregroundStyle(tono.papeles.tinta)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

#if DEBUG
#Preview("Sujeto · momentos · fábrica") { EnAmbasDia { GaleriaDia.SujetosActivos() } }
#Preview("Sujeto · momentos · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.SujetosActivos() } }
#Preview("Sujeto · estados · fábrica") { EnAmbasDia { GaleriaDia.SujetosDeEstado() } }
#Preview("Sujeto · estados · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.SujetosDeEstado() } }
#endif
