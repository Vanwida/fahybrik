import SwiftUI

// EL MARCO DE UNA HOJA de «Carreras» (importar, buscar y fijar carrera, el tiempo objetivo) y sus
// controles de formulario. Espejo de `hojas.tsx` y de los chips/segmentados de `buscar.tsx`/`meta.tsx`.
//
// En iOS la hoja es un `.sheet`: el sistema pone el agarre, el gesto de bajar y el fondo inerte. Este
// marco pone lo que el diseño añade: el título a 24 pt con su cierre de 48 pt (y «Atrás» cuando se
// está dentro de un paso), el cuerpo con scroll y la acción anclada abajo (§6, regla 3), siempre
// visible aunque el teclado esté abierto.

/// El cuerpo de una hoja: título, cierre, contenido que scrollea y, si la hay, la acción anclada.
struct MarcoDeHojaCarreras<Contenido: View, Accion: View>: View {
    let titulo: String
    /// Volver un paso dentro de la hoja (en lugar de cerrarla).
    var atras: (() -> Void)?
    let cerrar: () -> Void
    let conAccion: Bool
    let contenido: Contenido
    let accion: Accion

    init(
        _ titulo: String,
        atras: (() -> Void)? = nil,
        cerrar: @escaping () -> Void,
        @ViewBuilder contenido: () -> Contenido,
        @ViewBuilder accion: () -> Accion
    ) {
        self.titulo = titulo
        self.atras = atras
        self.cerrar = cerrar
        self.conAccion = true
        self.contenido = contenido()
        self.accion = accion()
    }

    var body: some View {
        VStack(spacing: 0) {
            cabecera
            ScrollView {
                contenido
                    .padding(EdgeInsets(top: 4, leading: Theme.Spacing.pantalla, bottom: 24, trailing: Theme.Spacing.pantalla))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if conAccion {
                    VStack(spacing: 4) { accion }
                        .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 16, trailing: Theme.Spacing.pantalla))
                        .frame(maxWidth: .infinity)
                        .background(Theme.Color.background)
                        .overlay(alignment: .top) { Rectangle().fill(Theme.Color.hairline).frame(height: 1) }
                }
            }
        }
        .background(Theme.Color.background)
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.Color.background)
        .presentationCornerRadius(Theme.Radius.sujeto)
    }

    private var cabecera: some View {
        HStack(spacing: Theme.Spacing.s) {
            Text(titulo)
                .papel(.seccion)
                .foregroundStyle(Theme.Color.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            if let atras {
                Button {
                    Haptics.light()
                    atras()
                } label: {
                    Text("Atrás")
                        .papel(.rotulo)
                        .foregroundStyle(Theme.Color.accentText)
                        .padding(.horizontal, Theme.Spacing.m)
                        .frame(minHeight: Theme.Size.toque)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle(escala: 0.96))
            }
            Button {
                Haptics.light()
                cerrar()
            } label: {
                IconoDia(.cerrar, tam: 20, peso: .bold)
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle(escala: 0.92))
            .accessibilityLabel("Cerrar")
        }
        .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 4, trailing: Theme.Spacing.s))
        .frame(minHeight: 56)
    }
}

extension MarcoDeHojaCarreras where Accion == EmptyView {
    /// Una hoja sin acción anclada: el pie respeta el gesto de inicio.
    init(
        _ titulo: String,
        atras: (() -> Void)? = nil,
        cerrar: @escaping () -> Void,
        @ViewBuilder contenido: () -> Contenido
    ) {
        self.titulo = titulo
        self.atras = atras
        self.cerrar = cerrar
        self.conAccion = false
        self.contenido = contenido()
        self.accion = EmptyView()
    }
}

// MARK: - Controles de formulario

/// Un chip de filtro: 44 pt, elegido = relleno del acento con su tinta encima, sin elegir = cara con
/// contorno. El estado va también en el rasgo «seleccionado» (el color solo no basta, §4.2).
struct ChipFiltroCarreras: View {
    let texto: String
    let elegido: Bool
    let accion: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            Text(texto)
                .papel(.rotulo)
                .foregroundStyle(elegido ? Theme.Color.accentOn : Theme.Color.foreground)
                .padding(.horizontal, Theme.Spacing.l)
                .frame(minHeight: 44)
                .background(elegido ? Theme.Color.accent : Theme.Color.surface, in: Capsule())
                .overlay(Capsule().strokeBorder(elegido ? SwiftUI.Color.clear : Theme.Color.hairlineStrong, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
        .accessibilityAddTraits(elegido ? [.isSelected, .isButton] : .isButton)
    }
}

/// Una fila de chips con su etiqueta, que scrollea en horizontal cuando no caben.
struct FilaChipsCarreras<Contenido: View>: View {
    let etiqueta: String
    let contenido: Contenido

    init(_ etiqueta: String, @ViewBuilder contenido: () -> Contenido) {
        self.etiqueta = etiqueta
        self.contenido = contenido()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(etiqueta).papel(.etiqueta).foregroundStyle(Theme.Color.muted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Theme.Spacing.s) { contenido }
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.bottom, 2)
            }
            // La fila llega al borde de la hoja: el margen lateral lo pone su contenido.
            .padding(.horizontal, -Theme.Spacing.pantalla)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(etiqueta)
    }
}

/// Un selector segmentado de la familia: 44 pt por opción, la elegida rellena con el acento.
struct SegmentadoCarreras<Valor: Hashable>: View {
    let etiqueta: String
    let opciones: [(valor: Valor, texto: String)]
    @Binding var seleccion: Valor

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(etiqueta).papel(.etiqueta).foregroundStyle(Theme.Color.muted)
            HStack(spacing: 4) {
                ForEach(Array(opciones.enumerated()), id: \.offset) { _, o in
                    let elegida = o.valor == seleccion
                    Button {
                        guard !elegida else { return }
                        Haptics.light()
                        withAnimation(.easeOut(duration: 0.16)) { seleccion = o.valor }
                    } label: {
                        Text(o.texto)
                            .papel(.rotulo)
                            .foregroundStyle(elegida ? Theme.Color.accentOn : Theme.Color.foreground)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(elegida ? Theme.Color.accent : SwiftUI.Color.clear, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(o.texto)
                    .accessibilityAddTraits(elegida ? [.isSelected, .isButton] : .isButton)
                }
            }
            .padding(4)
            .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous).strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(etiqueta)
    }
}

/// Las tres ruedas de un tiempo exacto (h · min · s): la vía discreta cuando la meta no es un peldaño.
/// UNA implementación para «Fijar objetivo» y «Tu tiempo objetivo» (estaba escrita dos veces).
struct RuedasDeTiempoCarreras: View {
    @Binding var tiempo: TiempoExacto

    var body: some View {
        HStack(spacing: Theme.Spacing.s) {
            rueda($tiempo.h, 0...5, "h", "Horas")
            rueda($tiempo.m, 0...59, "min", "Minutos")
            rueda($tiempo.s, 0...59, "s", "Segundos")
        }
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, Theme.Spacing.s)
        .frame(maxWidth: .infinity)
        .tarjetaCarreras()
    }

    private func rueda(_ valor: Binding<Int>, _ rango: ClosedRange<Int>, _ unidad: String, _ nombre: String) -> some View {
        VStack(spacing: 2) {
            Picker(nombre, selection: valor) {
                ForEach(Array(rango), id: \.self) { n in
                    Text(String(format: "%02d", n))
                        .papel(.seccion)
                        .tag(n)
                }
            }
            .pickerStyle(.wheel)
            .labelsHidden()
            .frame(height: 96)
            .clipped()
            Text(unidad).papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(nombre): \(valor.wrappedValue)")
        .accessibilityAdjustableAction { direccion in
            switch direccion {
            case .increment: if valor.wrappedValue < rango.upperBound { valor.wrappedValue += 1 }
            case .decrement: if valor.wrappedValue > rango.lowerBound { valor.wrappedValue -= 1 }
            default: break
            }
        }
    }
}
