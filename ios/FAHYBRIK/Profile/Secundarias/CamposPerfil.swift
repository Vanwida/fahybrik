import SwiftUI

// LOS CAMPOS DE LOS FORMULARIOS QUE CUELGAN DE PERFIL — una fila por dato, dentro de un `GrupoPerfil`.
//
// La etiqueta va ENCIMA del valor (no a su izquierda con un ancho fijo): con el texto del sistema grande
// una etiqueta de 110 pt se comía el campo. Cada fila es un objetivo táctil de 48 pt como mínimo, y
// tocar en cualquier punto de ella pone el foco en el campo. El fondo es el de la tarjeta; no hay caja
// dentro de la caja.

/// Una fila de texto: etiqueta arriba (papel `rotulo`), campo debajo (papel `cuerpoFuerte`) y, si lleva,
/// la unidad a la derecha.
struct CampoTextoPerfil: View {
    let etiqueta: String
    var placeholder = ""
    @Binding var texto: String
    var teclado: UIKeyboardType = .default
    var capitalizacion: TextInputAutocapitalization = .sentences
    var unidad: String?
    /// El nombre accesible del campo cuando la etiqueta sola no basta («Altura en centímetros»).
    var nombreAccesible: String?

    @FocusState private var enfocado: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(etiqueta)
                .papel(.rotulo)
                .foregroundStyle(Theme.Color.muted)
            HStack(spacing: Theme.Spacing.s) {
                TextField(placeholder, text: $texto)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .keyboardType(teclado)
                    .textInputAutocapitalization(capitalizacion)
                    .focused($enfocado)
                    .accessibilityLabel(nombreAccesible ?? etiqueta)
                if let unidad {
                    Text(unidad).papel(.nota).foregroundStyle(Theme.Color.muted)
                }
            }
            .frame(minHeight: 28)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(maxWidth: .infinity, minHeight: Theme.Size.toque + Theme.Spacing.m, alignment: .leading)
        .contentShape(Rectangle())
        .onTapGesture { enfocado = true }
    }
}

/// Una fila que abre un menú del sistema con sus opciones: etiqueta arriba y, debajo, el valor con el
/// chevron doble de «esto se elige». `vacio` pone el valor en apoyo (aún sin elegir).
struct FilaMenuPerfil<Opciones: View>: View {
    let etiqueta: String
    let valor: String
    var vacio = false
    @ViewBuilder let opciones: () -> Opciones

    var body: some View {
        Menu {
            opciones()
        } label: {
            HStack(spacing: Theme.Spacing.m) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(etiqueta).papel(.rotulo).foregroundStyle(Theme.Color.muted)
                    Text(valor)
                        .papel(vacio ? .cuerpo : .cuerpoFuerte)
                        .foregroundStyle(vacio ? Theme.Color.muted : Theme.Color.foreground)
                }
                Spacer(minLength: Theme.Spacing.m)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque + Theme.Spacing.m, alignment: .leading)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("\(etiqueta): \(valor)")
    }
}

/// Un aviso EN LÍNEA de un formulario: lo que salió mal o lo que hay que comprobar, junto al sitio donde
/// se arregla. El color de estado va en el icono y en el borde; el texto es la tinta del tema.
struct AvisoEnLineaPerfil: View {
    enum Tono { case peligro, info }

    let tono: Tono
    let texto: String

    private var color: SwiftUI.Color { tono == .peligro ? Theme.Color.danger : Theme.Color.info }
    private var simbolo: String { tono == .peligro ? "exclamationmark.triangle.fill" : "info.circle.fill" }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
            Image(systemName: simbolo)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(color)
                .accessibilityHidden(true)
            Text(texto)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Theme.Spacing.l)
        .background(Theme.Color.tinte(color, 0.10, sobre: Theme.Color.surface), in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous).strokeBorder(color.opacity(0.34), lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}
