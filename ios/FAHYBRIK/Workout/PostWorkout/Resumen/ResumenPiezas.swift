import SwiftUI

// LAS PIEZAS DEL RESUMEN AL TERMINAR — la tarjeta, los campos y la acción anclada.
//
// El resumen es una pantalla de FORMULARIO dentro de la piel del día: tarjetas planas con su
// rótulo de 15 pt, campos que se leen de pie y botones de 48 pt. Ninguna de estas piezas existía
// en `Theme/Dia` (el día no tenía campos): viven aquí con nombre propio y, si otra pantalla del
// kit las necesita, suben a `Theme/Dia` (lo decide quien consolida el kit, no esta pantalla).

// MARK: - La tarjeta

/// La tarjeta de una sección del resumen: cara plana del día (superficie, contorno fino, radio de
/// tarjeta) con su rótulo en mayúsculas arriba. `pendiente` es la que pide un acto (qué hiciste, el
/// esfuerzo sin decir): se tiñe del acento del club como la tesela con realce, y sobre el tinte el
/// texto pasa a la tinta del tema (el gris de apoyo baja de AA sobre un acento claro, CONTRATO-UI
/// §11.2). `hecho` pone el check cuando el atleta ya contestó.
struct TarjetaResumen<Contenido: View>: View {
    let etiqueta: String
    var pendiente = false
    var hecho = false
    @ViewBuilder let contenido: () -> Contenido

    /// El color del texto de apoyo dentro de una tarjeta: gris sobre la superficie, tinta sobre el tinte.
    static func apoyo(pendiente: Bool) -> SwiftUI.Color {
        pendiente ? Theme.Color.foreground : Theme.Color.muted
    }

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(spacing: Theme.Spacing.s) {
                Text(etiqueta)
                    .papel(.etiqueta)
                    .foregroundStyle(Self.apoyo(pendiente: pendiente))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: Theme.Spacing.s)
                if hecho {
                    IconoDia(.check, tam: 18, peso: .heavy)
                        .foregroundStyle(Theme.Color.ok)
                }
            }
            contenido()
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(pendiente ? Theme.Color.accentTint(sobre: Theme.Color.surface) : Theme.Color.surface, in: forma)
        .overlay(forma.strokeBorder(pendiente ? Theme.Color.accentTintBorde : Theme.Color.hairline, lineWidth: 1))
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Los campos

/// El hueco donde se teclea: una superficie hundida a la altura de un toque.
private struct HuecoDeCampo: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, Theme.Spacing.m)
            .frame(minHeight: Theme.Size.toque)
            .background(Theme.Color.surfaceSunken, in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
    }
}

/// Una fila «rótulo · campo»: el rótulo a la izquierda y el campo a la derecha; con el texto del
/// sistema en tamaños de accesibilidad, el campo pasa debajo en vez de estrujar el rótulo.
private struct FilaDeCampo<Campo: View>: View {
    let etiqueta: String
    @ViewBuilder let campo: () -> Campo

    private var rotulo: some View {
        Text(etiqueta)
            .papel(.cuerpo)
            .foregroundStyle(Theme.Color.foreground)
            .fixedSize(horizontal: false, vertical: true)
    }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.m) {
                rotulo
                Spacer(minLength: Theme.Spacing.m)
                campo()
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                rotulo
                campo()
            }
        }
    }
}

/// Un número entero a mano (FC, rondas, reps). Vacío = no declarado: `valor` queda nil y no se envía.
struct CampoCifraResumen: View {
    let etiqueta: String
    var unidad: String = ""
    @Binding var valor: Int?

    @State private var texto = ""
    @ScaledMetric(relativeTo: .body) private var anchoCampo: CGFloat = 88

    var body: some View {
        FilaDeCampo(etiqueta: etiqueta) {
            HStack(spacing: Theme.Spacing.s) {
                TextField("—", text: $texto)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .papel(.cuerpoFuerte)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(width: anchoCampo)
                    .accessibilityLabel(unidad.isEmpty ? etiqueta : "\(etiqueta), en \(unidad)")
                    .onChange(of: texto) { _, nuevo in valor = Int(nuevo) }
                    .onAppear { if let valor, texto.isEmpty { texto = String(valor) } }
                if !unidad.isEmpty {
                    Text(unidad)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                        .accessibilityHidden(true)
                }
            }
            .modifier(HuecoDeCampo())
        }
    }
}

/// Un tiempo a mano en `mm:ss` (los atletas piensan en minutos). La lectura es la de `TimeMinSecRow`:
/// una sola regla para qué es un tiempo válido.
struct CampoTiempoResumen: View {
    let etiqueta: String
    @Binding var segundos: Int?

    @State private var texto = ""
    @ScaledMetric(relativeTo: .body) private var anchoCampo: CGFloat = 104

    var body: some View {
        FilaDeCampo(etiqueta: etiqueta) {
            TextField("mm:ss", text: $texto)
                .keyboardType(.numbersAndPunctuation)
                .multilineTextAlignment(.trailing)
                .papel(.cuerpoFuerte)
                .monospacedDigit()
                .foregroundStyle(Theme.Color.foreground)
                .frame(width: anchoCampo)
                .accessibilityLabel("\(etiqueta), en minutos y segundos")
                .onChange(of: texto) { _, nuevo in segundos = TimeMinSecRow.parse(nuevo) }
                .onAppear { if let segundos, texto.isEmpty { texto = Formato.clock(segundos) } }
                .modifier(HuecoDeCampo())
        }
    }
}

/// Texto libre (las notas, la nota de la molestia, cómo se escaló).
struct CampoTextoResumen: View {
    let marcador: String
    let etiquetaAccesible: String
    @Binding var texto: String
    var lineas: ClosedRange<Int> = 2...4

    var body: some View {
        TextField(marcador, text: $texto, axis: .vertical)
            .lineLimit(lineas)
            .papel(.cuerpo)
            .foregroundStyle(Theme.Color.foreground)
            .padding(.vertical, Theme.Spacing.m)
            .modifier(HuecoDeCampo())
            .accessibilityLabel(etiquetaAccesible)
    }
}

// MARK: - Los botones

/// Una opción que se elige (dificultad, zona de la molestia, RX): relleno del acento cuando está
/// elegida, contorno cuando no. 48 pt de alto y el texto baja de línea antes de encogerse.
struct OpcionResumen: View {
    let titulo: String
    let elegida: Bool
    var etiquetaAccesible: String?
    var pista: String?
    let alTocar: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            alTocar()
        } label: {
            Text(titulo)
                .papel(.notaFuerte)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(elegida ? Theme.Color.accentOn : Theme.Color.foreground)
                .padding(.horizontal, Theme.Spacing.s)
                .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
                .background(elegida ? Theme.Color.accent : Theme.Color.surfaceElevated, in: Capsule())
                .overlay(Capsule().strokeBorder(elegida ? SwiftUI.Color.clear : Theme.Color.hairlineStrong, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
        .accessibilityLabel(etiquetaAccesible ?? titulo)
        .accessibilityHint(pista ?? "")
        .accessibilityAddTraits(elegida ? [.isSelected, .isButton] : .isButton)
    }
}

/// La acción secundaria de una tarjeta («Añadir movimientos»): contorno y tinta del tema, sin gastar
/// el acento (el acento es la opción elegida y el tinte de lo pendiente).
struct BotonContornoResumen: View {
    let titulo: String
    let alTocar: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            alTocar()
        } label: {
            Text(titulo)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
                .overlay(Capsule().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.97))
    }
}

/// LA acción de la pantalla, anclada abajo: la pastilla de tinta invertida del día a todo el ancho
/// (la misma voz que la acción anclada del Plan). El sujeto es lo que miras; esto es lo que tocas.
struct AccionAncladaResumen: View {
    let titulo: String
    /// En marcha (guardando): no se puede pulsar dos veces.
    var enCurso = false
    let alTocar: () -> Void

    private static var alto: CGFloat { 56 }

    var body: some View {
        Button {
            Haptics.medium()
            alTocar()
        } label: {
            Text(titulo)
                .papel(.accion)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.Color.background)
                .padding(.horizontal, 22)
                .frame(maxWidth: .infinity, minHeight: Self.alto)
                // Sin velo al estar en curso: el título ya dice «GUARDANDO…» y un velo bajaría el
                // contraste de la tinta invertida por debajo de AA.
                .background(Theme.Color.foreground, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
        .disabled(enCurso)
    }
}
