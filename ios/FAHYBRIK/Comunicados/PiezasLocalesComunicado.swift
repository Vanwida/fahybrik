import SwiftUI

// LAS PIEZAS GENÉRICAS QUE «DEL COACH» NECESITA Y EL KIT DEL DÍA AÚN NO TIENE.
//
// El kit consolidado (tarjeta plana con filas, botón de acción entero, subtítulo, aviso en línea, glifos
// de retroceso y alerta) todavía no ha aterrizado en `Theme/Dia`. Mientras tanto viven aquí, con el
// nombre de su sitio, para que esta zona compile sola; cuando aterricen, cada una se sustituye por la del
// kit y este fichero se borra. Ninguna inventa un color ni una medida: todo sale de `Theme`.

// MARK: - Un SF Symbol del día

/// Un SF Symbol decorativo, a su tamaño y peso. Es `IconoDia` para los glifos que `GlifoDia` todavía no
/// nombra (retroceso, alerta, pregunta…).
struct IconoSF: View {
    let nombre: String
    var tam: CGFloat
    var peso: Font.Weight

    init(_ nombre: String, tam: CGFloat = 20, peso: Font.Weight = .semibold) {
        self.nombre = nombre
        self.tam = tam
        self.peso = peso
    }

    var body: some View {
        Image(systemName: nombre)
            .font(.system(size: tam, weight: peso))
            .accessibilityHidden(true)
    }
}

// MARK: - La tarjeta plana

extension View {
    /// Cara de tarjeta plana: superficie, filete y esquinas. `realce` la tiñe del acento del club (lo que
    /// pide un acto o ya está en marcha); sobre ese tinte el texto es la tinta del tema.
    func tarjetaComunicado(realce: Bool = false, alAncho: Bool = false) -> some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        return self
            .frame(maxWidth: alAncho ? .infinity : nil, alignment: .topLeading)
            .background(realce ? Theme.Color.accentTint(sobre: Theme.Color.surface) : Theme.Color.surface, in: forma)
            .clipShape(forma)
            .overlay(forma.strokeBorder(realce ? Theme.Color.accentTintBorde : Theme.Color.hairline, lineWidth: 1))
    }
}

/// Una tarjeta con filas separadas por un filete, puesto ENTRE las que de verdad se pintan.
struct ListaDeFilasComunicado<Contenido: View>: View {
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        VStack(spacing: 0) {
            Group(subviews: contenido()) { filas in
                ForEach(Array(filas.enumerated()), id: \.offset) { i, fila in
                    if i > 0 { Hairline() }
                    fila
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaComunicado()
    }
}

// MARK: - El botón de acción

/// La pastilla de acción entera: háptico, escala de pulsación y los estados «inactivo» (falta algo: cambia
/// de superficie y de tinta, no de opacidad, §4.2) y «en curso». 52 pt de alto.
struct BotonAccionComunicado: View {
    enum Relleno {
        /// «Haz esto ahora» dentro de una pantalla sin sujeto al que subordinarse.
        case acento
        /// La acción de un sujeto: tinta invertida, no compite con lo que se mira.
        case tinta
    }

    /// Cuánto se nota la pulsación en el pulgar: una pastilla suelta pide poco; la que cierra algo, más.
    enum Impacto { case ligero, medio }

    let titulo: String
    var simbolo: String?
    var relleno: Relleno = .tinta
    var completa = false
    var inactivo = false
    var enCurso = false
    var impacto: Impacto = .ligero
    let accion: () -> Void

    private func golpe() {
        switch impacto {
        case .ligero: Haptics.light()
        case .medio: Haptics.medium()
        }
    }

    private var tinta: Color {
        if inactivo { return Theme.Color.muted }
        return relleno == .acento ? Theme.Color.accentOn : Theme.Color.background
    }

    private var fondo: Color {
        if inactivo { return Theme.Color.surfaceElevated }
        return relleno == .acento ? Theme.Color.accent : Theme.Color.foreground
    }

    var body: some View {
        Button {
            guard !inactivo, !enCurso else { return }
            golpe()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.m - 2) {
                if enCurso {
                    ProgressView().tint(tinta)
                } else if let simbolo {
                    IconoSF(simbolo, tam: 20, peso: .bold)
                }
                Text(titulo)
                    .papel(.accion)
                    .multilineTextAlignment(completa ? .center : .leading)
            }
            .foregroundStyle(tinta)
            .padding(.horizontal, 22)
            .frame(maxWidth: completa ? .infinity : nil, minHeight: Theme.Size.accion)
            .background(fondo, in: Capsule())
            .overlay { if inactivo { Capsule().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1) } }
            .contentShape(Capsule())
            .fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(PressScaleStyle(escala: completa ? 0.98 : 0.96))
        .disabled(inactivo || enCurso)
        .accessibilityLabel(titulo)
    }
}

// MARK: - Subtítulo y aviso en línea

/// El título de un bloque dentro de una sección (el nombre que el coach le puso): un escalón bajo el de
/// sección, en la tinta del tema y como cabecera para VoiceOver.
struct SubtituloComunicado: View {
    let texto: String

    init(_ texto: String) { self.texto = texto }

    var body: some View {
        Text(texto)
            .papel(.cuerpoFuerte)
            .foregroundStyle(Theme.Color.foreground)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Un error que se lee DENTRO de la pantalla, donde está el problema: tinte del peligro, marca con forma
/// (el triángulo) y texto en la tinta del tema — el peligro va en la marca, jamás en el texto.
struct AvisoEnLineaComunicado: View {
    let texto: String

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        HStack(alignment: .top, spacing: Theme.Spacing.m - 2) {
            IconoSF("exclamationmark.triangle", tam: 20)
                .foregroundStyle(Theme.Color.danger)
                .padding(.top, 1)
            Text(texto)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.dangerTint, in: forma)
        .overlay(forma.strokeBorder(Theme.Color.danger.opacity(0.34), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - El título de un sujeto

/// El título de un sujeto que lleva TEXTO DEL COACH (largo y de longitud desconocida): 30 pt en vez de los
/// 44 del sujeto de un estado del día, que con una pregunta entera ocuparía media pantalla. Sigue mandando
/// sobre todo lo demás de la pantalla.
struct TituloDeSujeto: View {
    let texto: String
    @Environment(\.tonoDia) private var tono

    init(_ texto: String) { self.texto = texto }

    var body: some View {
        Text(texto)
            .papel(.saludo)
            .foregroundStyle(tono.papeles.tinta)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}
