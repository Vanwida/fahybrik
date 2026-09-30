import SwiftUI

// LAS PIEZAS GENÉRICAS QUE EL KIT AÚN NO TIENE EN MAIN — provisionales, con la MISMA API que las del kit
// consolidado (`tarjetaDia`, `ListaDia`, `BotonAccionDia`, `BotonTextoDia`, `AvisoEnLineaDia`,
// `SujetoErrorDia`), que está en camino y todavía no ha aterrizado.
//
// Cuando aterrice, este fichero se BORRA y cada pieza se renombra a la del kit (`…DeTests`/`…Tests` →
// `…Dia`): la API de cada una es calculada para que sea solo un renombrado. No crece, no se usa fuera de
// `Tests/` y `Jump/`, y ninguna decide nada.

// MARK: - La tarjeta y la lista

extension View {
    /// Cara de tarjeta plana: superficie, filete y esquinas recortadas (radio 22). `realce` la tiñe del
    /// acento del club (lo que pide un acto); sobre ese tinte el texto es la tinta del tema.
    func tarjetaDeTests(realce: Bool = false, alAncho: Bool = false) -> some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        return self
            .frame(maxWidth: alAncho ? .infinity : nil, alignment: .topLeading)
            .background(realce ? Theme.Color.accentTint(sobre: Theme.Color.surface) : Theme.Color.surface, in: forma)
            .clipShape(forma)
            .overlay(forma.strokeBorder(realce ? Theme.Color.accentTintBorde : Theme.Color.hairline, lineWidth: 1))
    }
}

/// Una tarjeta con filas separadas por un filete, ENTRE las que de verdad se pintan.
struct ListaDeTests<Contenido: View>: View {
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
        .tarjetaDeTests()
    }
}

// MARK: - Los botones

/// El botón entero de una acción: una pastilla con háptico, escala de pulsación y los estados «inactivo» y
/// «ocupado» (que NO se atenúa: se lee «Preparando…» con su contraste entero).
///
/// Por defecto tinta invertida —fondo = la tinta del tema, texto = el fondo del tema— para no competir con
/// el sujeto (CONTRATO-UI §10.5).
struct BotonAccionTests: View {
    enum Relleno { case tinta, acento }

    enum Estado: Equatable {
        case normal
        case inactivo
        case ocupado(texto: String, voz: String)
    }

    let titulo: String
    var glifo: GlifoDia?
    var relleno: Relleno
    var completa: Bool
    var alto: CGFloat
    var estado: Estado
    let accion: () -> Void

    init(
        _ titulo: String,
        glifo: GlifoDia? = nil,
        relleno: Relleno = .tinta,
        completa: Bool = false,
        alto: CGFloat = Theme.Size.accion,
        estado: Estado = .normal,
        accion: @escaping () -> Void
    ) {
        self.titulo = titulo
        self.glifo = glifo
        self.relleno = relleno
        self.completa = completa
        self.alto = alto
        self.estado = estado
        self.accion = accion
    }

    private var ocupado: (texto: String, voz: String)? {
        if case let .ocupado(texto, voz) = estado { return (texto, voz) }
        return nil
    }

    private var tinta: SwiftUI.Color {
        if estado == .inactivo { return Theme.Color.muted }
        return relleno == .acento ? Theme.Color.accentOn : Theme.Color.background
    }

    private var fondo: SwiftUI.Color {
        if estado == .inactivo { return Theme.Color.surfaceElevated }
        return relleno == .acento ? Theme.Color.accent : Theme.Color.foreground
    }

    var body: some View {
        Button {
            guard estado == .normal else { return }
            Haptics.medium()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.m - 2) {
                Text(ocupado?.texto ?? titulo)
                    .papel(.accion)
                    .multilineTextAlignment(completa ? .center : .leading)
                if ocupado != nil {
                    ProgressView().tint(tinta)
                } else if let glifo {
                    IconoDia(glifo, tam: 20, peso: .bold)
                }
            }
            .foregroundStyle(tinta)
            .padding(.horizontal, 22)
            .frame(maxWidth: completa ? .infinity : nil, minHeight: alto)
            .background(fondo, in: Capsule())
            .overlay {
                if estado == .inactivo { Capsule().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1) }
            }
            .contentShape(Capsule())
            .fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(PressScaleStyle(escala: completa ? 0.98 : 0.96))
        .disabled(estado != .normal)
        .accessibilityLabel(ocupado?.voz ?? titulo)
        .accessibilityAddTraits(ocupado != nil ? .updatesFrequently : [])
    }
}

/// La salida discreta de 48 pt: un glifo delante, la palabra y, a la derecha, lo que haga falta. El acento
/// se lo lleva el glifo; la palabra, la tinta del tema (un texto de botón no va en `accentText`).
struct BotonTextoTests<Icono: View, Derecha: View>: View {
    enum Tono { case acento, tinta, suave }

    let titulo: String
    var tono: Tono = .acento
    var centrado = false
    var desactivado = false
    var expandido: Bool?
    let accion: () -> Void
    @ViewBuilder let icono: () -> Icono
    @ViewBuilder let derecha: () -> Derecha

    private var tinta: SwiftUI.Color { tono == .suave ? Theme.Color.muted : Theme.Color.foreground }

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.s) {
                if centrado { Spacer(minLength: 0) }
                icono().foregroundStyle(tono == .acento ? Theme.Color.accentText : tinta)
                Text(titulo)
                    .papel(.cuerpoFuerte)
                    .multilineTextAlignment(centrado ? .center : .leading)
                if centrado { Spacer(minLength: 0) } else { Spacer(minLength: Theme.Spacing.s) }
                derecha().foregroundStyle(Theme.Color.muted)
            }
            .foregroundStyle(tinta)
            .padding(.horizontal, Theme.Spacing.l)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
        .disabled(desactivado)
        .accessibilityValue(expandido.map { $0 ? "desplegado" : "plegado" } ?? "")
    }
}

extension BotonTextoTests where Icono == EmptyView, Derecha == EmptyView {
    init(_ titulo: String, tono: Tono = .acento, centrado: Bool = false, desactivado: Bool = false, accion: @escaping () -> Void) {
        self.init(titulo: titulo, tono: tono, centrado: centrado, desactivado: desactivado, accion: accion, icono: { EmptyView() }, derecha: { EmptyView() })
    }
}

extension BotonTextoTests {
    init(_ titulo: String, tono: Tono = .acento, centrado: Bool = false, desactivado: Bool = false, expandido: Bool? = nil,
         accion: @escaping () -> Void, @ViewBuilder icono: @escaping () -> Icono, @ViewBuilder derecha: @escaping () -> Derecha) {
        self.init(titulo: titulo, tono: tono, centrado: centrado, desactivado: desactivado, expandido: expandido, accion: accion, icono: icono, derecha: derecha)
    }
}

// MARK: - Los avisos

/// Un error que se lee DENTRO de la pantalla, con su salida si la hay: tinte del peligro, marca con forma
/// (el triángulo) y texto en la tinta del tema — el peligro va en la marca, jamás en el texto.
struct AvisoEnLineaTests<Salida: View>: View {
    let texto: String
    @ViewBuilder let salida: () -> Salida

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .top, spacing: Theme.Spacing.m - 2) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Theme.Color.danger)
                    .accessibilityHidden(true)
                Text(texto)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            salida()
        }
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.dangerTint, in: forma)
        .overlay(forma.strokeBorder(Theme.Color.danger.opacity(0.34), lineWidth: 1))
        .accessibilityElement(children: .contain)
    }
}

extension AvisoEnLineaTests {
    init(_ texto: String, @ViewBuilder salida: @escaping () -> Salida) {
        self.init(texto: texto, salida: salida)
    }
}

extension AvisoEnLineaTests where Salida == EmptyView {
    init(_ texto: String) { self.init(texto: texto, salida: { EmptyView() }) }
}

/// «No pudimos cargar X», con su reintento: un sujeto de peligro que se anuncia solo a VoiceOver.
struct SujetoErrorTests: View {
    let kicker: String
    let titulo: String
    let apoyo: String
    let alReintentar: () async -> Void

    @State private var enMarcha = false

    var body: some View {
        SujetoDia(tono: .peligro, etiqueta: "\(titulo). \(apoyo)", anuncia: true) {
            KickerDia(kicker)
            TituloDia(titulo)
            ApoyoDia(apoyo)
        } abajo: {
            BotonAccionTests(
                enMarcha ? "Reintentando" : "Reintentar",
                estado: enMarcha ? .ocupado(texto: "Reintentando", voz: "Reintentando") : .normal
            ) {
                enMarcha = true
                Task {
                    await alReintentar()
                    enMarcha = false
                }
            }
        }
    }
}
