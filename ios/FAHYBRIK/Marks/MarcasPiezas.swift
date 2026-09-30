import SwiftUI

// LAS PIEZAS GENÉRICAS QUE «TUS MARCAS» NECESITA Y EL KIT DEL DÍA AÚN NO TIENE.
//
// La consolidación del kit (`TarjetaDia`/`ListaDia`, `MarcoDeHojaDia`, `CampoDia`, `BotonAccionDia`,
// `BotonTextoDia`, `AvisoEnLineaDia`, `SujetoErrorDia`) no ha aterrizado en main, y estas pantallas no pueden
// esperar. Cada pieza de aquí es la cara local de una del kit, con el mismo papel y las mismas medidas: cuando
// aterricen, se sustituyen una a una (`Marcas` → `Dia`) y este fichero se borra. Nada de esto es específico de
// las marcas: es lo que el orquestador debería subir.
//
// Sólo tokens del kit y del tema: ningún hex, ningún naranja, ningún tamaño de fuente suelto.

// MARK: - La tarjeta y la lista de filas (`TarjetaDia` / `ListaDia`)

extension View {
    /// Cara de tarjeta plana: superficie, filete y esquinas recortadas. `realce` la tiñe del acento del club
    /// (lo que ya está en marcha); sobre ese tinte el texto es la tinta del tema, no `muted`.
    func tarjetaMarcas(realce: Bool = false, alAncho: Bool = false) -> some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        return self
            .frame(maxWidth: alAncho ? .infinity : nil, alignment: .topLeading)
            .background(realce ? Theme.Color.accentTint(sobre: Theme.Color.surface) : Theme.Color.surface, in: forma)
            .clipShape(forma)
            .overlay(forma.strokeBorder(realce ? Theme.Color.accentTintBorde : Theme.Color.hairline, lineWidth: 1))
    }
}

/// Una tarjeta con filas separadas por un filete, ENTRE las que de verdad se pintan.
struct ListaMarcas<Contenido: View>: View {
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
        .tarjetaMarcas()
    }
}

// MARK: - Un símbolo que `GlifoDia` aún no nombra

/// Un SF Symbol del sistema para las ideas que el enum `GlifoDia` todavía no recoge (estrella, triángulo de
/// aviso, play). Decorativo: el nombre accesible lo lleva quien lo contiene.
struct IconoMarcas: View {
    let simbolo: String
    var tam: CGFloat
    var peso: Font.Weight

    init(_ simbolo: String, tam: CGFloat = 20, peso: Font.Weight = .semibold) {
        self.simbolo = simbolo
        self.tam = tam
        self.peso = peso
    }

    var body: some View {
        Image(systemName: simbolo)
            .font(.system(size: tam, weight: peso))
            .accessibilityHidden(true)
    }
}

// MARK: - Error con salida (`SujetoErrorDia`)

/// «No pudimos cargar X», con su reintento: un sujeto de peligro que se anuncia solo a VoiceOver. El peligro va
/// en el tinte, jamás en el texto. Mientras se reintenta, no admite otro toque y el glifo gira.
struct ErrorDeMarcas: View {
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
            Button {
                guard !enMarcha else { return }
                Haptics.light()
                enMarcha = true
                Task {
                    await alReintentar()
                    enMarcha = false
                }
            } label: {
                AccionDia(enMarcha ? "Reintentando" : "Reintentar", glifo: .reintentar, enCurso: enMarcha)
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
            .disabled(enMarcha)
            .accessibilityAddTraits(enMarcha ? .updatesFrequently : [])
        }
    }
}

// MARK: - Aviso en línea y botón de texto (`AvisoEnLineaDia` / `BotonTextoDia`)

/// Un error que se lee DENTRO de la pantalla o de la hoja, con su salida si la hay. Tinte del peligro, la marca
/// con forma (el triángulo) y el texto en la tinta del tema: el peligro va en la marca, no en el texto.
struct AvisoEnLineaMarcas<Salida: View>: View {
    let texto: String
    let salida: Salida

    init(_ texto: String, @ViewBuilder salida: () -> Salida) {
        self.texto = texto
        self.salida = salida()
    }

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .top, spacing: Theme.Spacing.m - 2) {
                IconoMarcas("exclamationmark.triangle")
                    .foregroundStyle(Theme.Color.danger)
                    .padding(.top, 1)
                Text(texto)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            salida
        }
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.dangerTint, in: forma)
        .overlay(forma.strokeBorder(Theme.Color.danger.opacity(0.34), lineWidth: 1))
        .accessibilityElement(children: .contain)
    }
}

extension AvisoEnLineaMarcas where Salida == EmptyView {
    init(_ texto: String) { self.init(texto, salida: { EmptyView() }) }
}

/// La salida discreta de 48 pt. La palabra va en la tinta del tema, no en `accentText`: un texto de botón no va
/// en el acento del club.
struct BotonTextoMarcas: View {
    let titulo: String
    let accion: () -> Void

    init(_ titulo: String, accion: @escaping () -> Void) {
        self.titulo = titulo
        self.accion = accion
    }

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            Text(titulo)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .padding(.horizontal, Theme.Spacing.l)
                .frame(minHeight: Theme.Size.toque)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
    }
}

// MARK: - La acción anclada (`BotonAccionDia`)

/// La acción que ancla una pantalla o cierra una hoja: una pastilla a todo el ancho y 56 pt. En una pantalla es
/// de tinta invertida (no compite con el sujeto); en una hoja, «haz esto ahora», del acento. Inactiva cambia de
/// superficie y de tinta, no de opacidad; ocupada NO se atenúa (se lee «Guardando…» con su contraste entero) y a
/// la vez no admite otro toque.
struct AccionAncladaMarcas: View {
    enum Relleno { case tinta, acento }
    enum Estado: Equatable {
        case normal
        case inactiva
        case ocupada(texto: String, voz: String)
    }

    let titulo: String
    /// El SF Symbol que va delante.
    var simbolo: String?
    var relleno: Relleno = .tinta
    var estado: Estado = .normal
    let alTocar: () -> Void

    private static var alto: CGFloat { 56 }

    private var tinta: SwiftUI.Color {
        if estado == .inactiva { return Theme.Color.muted }
        return relleno == .acento ? Theme.Color.accentOn : Theme.Color.background
    }

    private var fondo: SwiftUI.Color {
        if estado == .inactiva { return Theme.Color.surfaceElevated }
        return relleno == .acento ? Theme.Color.accent : Theme.Color.foreground
    }

    var body: some View {
        let ocupada: (texto: String, voz: String)? = {
            if case let .ocupada(texto, voz) = estado { return (texto, voz) }
            return nil
        }()
        Button {
            guard estado == .normal else { return }
            Haptics.medium()
            alTocar()
        } label: {
            HStack(spacing: Theme.Spacing.m - 2) {
                if ocupada != nil {
                    ProgressView().tint(tinta)
                } else if let simbolo {
                    IconoMarcas(simbolo, tam: 20, peso: .bold)
                }
                Text(ocupada?.texto ?? titulo)
                    .papel(.accion)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }
            .foregroundStyle(tinta)
            .padding(.horizontal, 22)
            .frame(maxWidth: .infinity, minHeight: Self.alto)
            .background(fondo, in: Capsule())
            .overlay {
                if estado == .inactiva { Capsule().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1) }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
        .disabled(estado != .normal)
        .accessibilityLabel(ocupada?.voz ?? titulo)
        .accessibilityAddTraits(ocupada != nil ? .updatesFrequently : [])
    }
}

extension View {
    /// `.anchoredAction` con el margen de las pantallas del día: el pie ancla con 16 y el margen es 20, los 4
    /// restantes van dentro. Sin acción no hay pie: una barra muerta con su filete no dice nada.
    @ViewBuilder
    func anclandoMarcas<Contenido: View>(si hay: Bool, @ViewBuilder _ contenido: () -> Contenido) -> some View {
        if hay {
            anchoredAction { contenido().padding(.horizontal, Theme.Spacing.pantalla - Theme.Spacing.l) }
        } else {
            self
        }
    }
}
