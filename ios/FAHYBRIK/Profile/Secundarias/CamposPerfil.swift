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

// MARK: - Campos numéricos

/// Una fila para un número con decimales opcionales («Peso levantado · kg»). Parte de un texto local y
/// devuelve `nil` mientras lo escrito no sea un número: el campo nace VACÍO, no en un valor por defecto que
/// se cuela si el atleta no lo toca.
struct CampoNumeroPerfil: View {
    let etiqueta: String
    var unidad: String?
    @Binding var valor: Double?
    var placeholder = "—"

    @State private var texto = ""

    var body: some View {
        CampoTextoPerfil(etiqueta: etiqueta, placeholder: placeholder, texto: $texto, teclado: .decimalPad, unidad: unidad)
            .onChange(of: texto) { _, nuevo in
                valor = Double(nuevo.replacingOccurrences(of: ",", with: "."))
            }
            .onAppear {
                if let v = valor, texto.isEmpty {
                    texto = v.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(v)) : Formato.esDecimal(v)
                }
            }
    }
}

/// Lo mismo para un entero (repeticiones).
struct CampoEnteroPerfil: View {
    let etiqueta: String
    var unidad: String?
    @Binding var valor: Int?

    @State private var texto = ""

    var body: some View {
        CampoTextoPerfil(etiqueta: etiqueta, placeholder: "—", texto: $texto, teclado: .numberPad, unidad: unidad)
            .onChange(of: texto) { _, nuevo in valor = Int(nuevo) }
            .onAppear { if let v = valor, texto.isEmpty { texto = String(v) } }
    }
}

/// Una fila para un tiempo en `mm:ss` (un ritmo). Los atletas piensan en minutos, no en fechas.
struct CampoRitmoPerfil: View {
    let etiqueta: String
    @Binding var segundos: Int?

    @State private var texto = ""

    var body: some View {
        CampoTextoPerfil(etiqueta: etiqueta, placeholder: "mm:ss", texto: $texto, teclado: .numbersAndPunctuation)
            .onChange(of: texto) { _, nuevo in segundos = TimeMinSecRow.parse(nuevo) }
            .onAppear { if let s = segundos, texto.isEmpty { texto = Formato.clock(s) } }
    }
}

// MARK: - Elegir una opción entre pocas

/// Las opciones a la vista, una al lado de otra (con texto grande pasan a una por fila): el acento del club
/// marca la elegida. Cada una es un objetivo de 48 pt. Con `elegidaOpcional` tocar la elegida la quita (una
/// elección que se puede no hacer, como la transición de una molestia).
struct SelectorDeOpcionesPerfil<Clave: Hashable>: View {
    let opciones: [(clave: Clave, titulo: String)]
    private let esActiva: (Clave) -> Bool
    private let alElegir: (Clave) -> Void

    private let columnas = [GridItem(.adaptive(minimum: 140), spacing: Theme.Spacing.s)]

    init(opciones: [(clave: Clave, titulo: String)], elegida: Binding<Clave>) {
        self.opciones = opciones
        esActiva = { $0 == elegida.wrappedValue }
        alElegir = { elegida.wrappedValue = $0 }
    }

    init(opciones: [(clave: Clave, titulo: String)], elegidaOpcional: Binding<Clave?>) {
        self.opciones = opciones
        esActiva = { elegidaOpcional.wrappedValue == $0 }
        alElegir = { elegidaOpcional.wrappedValue = elegidaOpcional.wrappedValue == $0 ? nil : $0 }
    }

    var body: some View {
        LazyVGrid(columns: columnas, spacing: Theme.Spacing.s) {
            ForEach(Array(opciones.enumerated()), id: \.offset) { _, opcion in
                let activa = esActiva(opcion.clave)
                Button {
                    Haptics.light()
                    alElegir(opcion.clave)
                } label: {
                    Text(opcion.titulo)
                        .papel(.notaFuerte)
                        .foregroundStyle(activa ? Theme.Color.accentOn : Theme.Color.foreground)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
                        .background(
                            activa ? Theme.Color.accent : Theme.Color.surface,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                                .strokeBorder(activa ? Color.clear : Theme.Color.hairlineStrong, lineWidth: 1)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle(escala: 0.97))
                .accessibilityAddTraits(activa ? [.isSelected, .isButton] : .isButton)
            }
        }
    }
}

// MARK: - El estado de una pantalla que carga

/// Lo que una pantalla de datos tiene delante: todavía nada, un fallo SIN nada guardado que enseñar, o el dato.
/// El fallo no es el vacío: un vacío es un dato (`datos` con lista vacía), un fallo es que no se supo.
enum CargaDePantallaPerfil<Dato> {
    case cargando
    case error
    case datos(Dato)
}
