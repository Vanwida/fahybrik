import SwiftUI

// LOS CONTROLES DEL CONSTRUCTOR DE ENTRENO LIBRE — contadores, selectores, teselas y tarjetas de movimiento.
// Comparten cara con el resto de piezas del flujo (`ConstructorLibrePiezas.swift`): papeles del día, radios
// por papel y el acento del club solo en lo elegido.

// MARK: - El contador

/// El contador −/valor/+: la única manera de poner un número en el constructor (cero texto libre). El
/// valor pesa como un dato del día (32 pt, cifras tabulares); los botones son chapas del cromo de 48 pt.
struct FreeStepper: View {
    let label: String
    @Binding var value: Int
    let step: Int
    var minValue: Int = 0
    var maxValue: Int = 100_000
    let format: (Int) -> String

    @Environment(\.controlLibreDentroDeTarjeta) private var dentroDeTarjeta

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            RotuloControlLibre(label)
            HStack(spacing: Theme.Spacing.m) {
                boton("minus", delta: -step, activo: value > minValue)
                Text(format(value))
                    .papel(.dato)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(maxWidth: .infinity)
                boton("plus", delta: step, activo: value < maxValue)
            }
        }
        .padding(dentroDeTarjeta ? Theme.Spacing.m : Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(CaraDeControlLibre(dentroDeTarjeta: dentroDeTarjeta))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(format(value))
        .accessibilityAdjustableAction { direccion in
            switch direccion {
            case .increment: ajusta(step)
            case .decrement: ajusta(-step)
            @unknown default: break
            }
        }
    }

    private func boton(_ simbolo: String, delta: Int, activo: Bool) -> some View {
        Button { ajusta(delta) } label: {
            ChapitaDia(tam: 44) {
                Image(systemName: simbolo).font(.system(size: 18, weight: .bold))
            }
            .opacity(activo ? 1 : 0.4)
            .frame(width: Theme.Size.toque, height: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.9))
        .disabled(!activo)
        .accessibilityLabel(delta > 0 ? "Sumar" : "Restar")
    }

    private func ajusta(_ delta: Int) {
        Haptics.light()
        value = min(maxValue, max(minValue, value + delta))
    }
}

// MARK: - El selector de opciones

/// Un selector segmentado de 2-4 opciones («Distancia · Tiempo · Calorías»). La elegida lleva el acento
/// del club con su tinta encima; las otras, la cara de tarjeta. Con el texto del sistema muy grande las
/// opciones pasan a una columna en vez de cortarse.
struct FreeKindToggle<Option: Identifiable & Equatable>: View {
    let title: String
    let options: [Option]
    @Binding var selection: Option
    let label: (Option) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            RotuloControlLibre(title)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: Theme.Spacing.s) { opciones }
                VStack(spacing: Theme.Spacing.s) { opciones }
            }
        }
    }

    private var opciones: some View {
        ForEach(options) { opcion in
            OpcionLibre(texto: label(opcion), elegida: selection == opcion) {
                Haptics.light()
                selection = opcion
            }
        }
    }
}

/// Una opción de un selector: pastilla de 48 pt. Sin `lineLimit` que la corte: si no cabe, el selector
/// entero pasa a columna.
struct OpcionLibre: View {
    let texto: String
    let elegida: Bool
    let accion: () -> Void

    @Environment(\.controlLibreDentroDeTarjeta) private var dentroDeTarjeta

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        let reposo = dentroDeTarjeta ? Theme.Color.surfaceSunken : Theme.Color.surface
        Button(action: accion) {
            Text(texto)
                .papel(elegida ? .notaPesada : .notaFuerte)
                .foregroundStyle(elegida ? Theme.Color.accentOn : Theme.Color.foreground)
                .fixedSize()
                .padding(.horizontal, Theme.Spacing.m)
                .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
                .background(elegida ? Theme.Color.accent : reposo, in: forma)
                .overlay(forma.strokeBorder(elegida ? .clear : Theme.Color.hairline, lineWidth: 1))
                .contentShape(forma)
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(texto)
        .accessibilityAddTraits(elegida ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - La zona de pulso

/// Z1…Z5. La zona elegida lleva SU color (el mismo código que la muñeca): el color de zona es semántico,
/// no del club.
struct FreeZonePicker: View {
    @Binding var zone: Int

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            RotuloControlLibre("Zona de pulso")
            HStack(spacing: Theme.Spacing.s) {
                ForEach(HRZone.allCases, id: \.rawValue) { z in
                    let elegida = zone == z.rawValue
                    let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
                    Button {
                        Haptics.light()
                        zone = z.rawValue
                    } label: {
                        Text(z.label)
                            .papel(.notaPesada)
                            .foregroundStyle(elegida ? Theme.Color.foreground : Theme.Color.muted)
                            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
                            .background(elegida ? z.tint : Theme.Color.surface, in: forma)
                            .overlay(forma.strokeBorder(elegida ? z.color : Theme.Color.hairline, lineWidth: elegida ? 2 : 1))
                            .contentShape(forma)
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityLabel("Zona \(z.rawValue)")
                    .accessibilityAddTraits(elegida ? [.isButton, .isSelected] : .isButton)
                }
            }
        }
    }
}

// MARK: - La rueda de carga

// La rueda de carga (Alex, entrenando: el −/+ "es súper lento"). Pasos de 2,5 kg, el patrón nativo que ya
// usamos en Registrar carrera: giras y estás en 80 desde 20 en un gesto, no en 24 toques. `units` = kg / 2,5
// (el mismo entero que ya guarda el draft, así que el modelo no se entera). La usan también las hojas de
// carga del entreno en vivo.
struct KgWheel: View {
    let label: String
    @Binding var units: Int
    var minUnits: Int = 1          // 2,5 kg
    var maxUnits: Int = 120        // 300 kg

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            RotuloControlLibre(label)
            Picker(label, selection: $units) {
                ForEach(minUnits...maxUnits, id: \.self) { u in
                    Text(Self.kgLabel(Double(u) * 2.5))
                        .font(ScaledFontModifier.fuente(size: 20, weight: .heavy, italic: true, tabular: true))
                        .tag(u)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 120)
            .clipped()
        }
    }

    /// "82,5 kg" / "80 kg" — coma decimal y sin ,0 de relleno.
    static func kgLabel(_ v: Double) -> String {
        let whole = v.truncatingRemainder(dividingBy: 1) == 0
        let num = whole ? String(Int(v)) : Formato.esDecimal(v)
        return num + " kg"
    }
}

// MARK: - «Tu entreno»

/// El resumen vivo de lo que llevas montado. Va teñido del acento (es lo que se está haciendo) y, por la
/// regla del kit, el texto sobre el tinte es la tinta del tema, no un gris ni el acento.
struct FreePreviewCard: View {
    /// Nunca llega vacía: las pantallas que la pintan ya tienen formato, y con él, línea.
    let line: String

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text("Tu entreno")
                .papel(.etiqueta)
                .foregroundStyle(Theme.Color.foreground)
            Text(line)
                .papel(.seccion)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.l)
        .background(Theme.Color.accentTint(sobre: Theme.Color.surface), in: forma)
        .overlay(forma.strokeBorder(Theme.Color.accentTintBorde, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Tu entreno: \(line)")
    }
}

// MARK: - La tesela de elección (modalidad, formato)

/// Una opción grande de la rejilla de modalidad o de formato: su ficha de icono, el nombre y una línea
/// que explica qué es. Elegida, se tiñe del acento con su marca de hecho.
struct FreeBuilderTile: View {
    let icon: String?
    let title: String
    let subtitle: String?
    let selected: Bool
    let action: () -> Void

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        Button(action: action) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack(alignment: .top) {
                    if let icon {
                        FichaDia(tono: selected ? .realce : .normal) {
                            Image(systemName: icon).font(.system(size: 22, weight: .semibold))
                        }
                    }
                    Spacer(minLength: 0)
                    if selected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(Theme.Color.foreground)
                            .accessibilityHidden(true)
                    }
                }
                Spacer(minLength: 0)
                Text(title)
                    .papel(.seccion)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                if let subtitle {
                    Text(subtitle)
                        .papel(.nota)
                        .foregroundStyle(selected ? Theme.Color.foreground : Theme.Color.muted)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .frame(minHeight: icon == nil ? 112 : 148)
            .padding(Theme.Spacing.l)
            .background(selected ? Theme.Color.accentTint(sobre: Theme.Color.surface) : Theme.Color.surface, in: forma)
            .overlay(forma.strokeBorder(selected ? Theme.Color.accentTintBorde : Theme.Color.hairline, lineWidth: 1))
            .contentShape(forma)
        }
        .buttonStyle(PressScaleStyle(escala: 0.982))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(subtitle.map { "\(title). \($0)" } ?? title)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

/// La rejilla de dos columnas de las teselas de elección. Con texto de accesibilidad, una columna.
struct RejillaEleccionLibre<Contenido: View>: View {
    @ViewBuilder let contenido: () -> Contenido
    @Environment(\.dynamicTypeSize) private var tamanoDeTexto

    var body: some View {
        let columnas = tamanoDeTexto.isAccessibilitySize ? 1 : 2
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: Theme.Spacing.m, alignment: .top), count: columnas),
            spacing: Theme.Spacing.m
        ) { contenido() }
    }
}

// MARK: - La tarjeta de un movimiento

/// La tarjeta de un ejercicio de fuerza o de un movimiento del WOD: el nombre con sus controles de orden
/// (subir, bajar, quitar) y, debajo, su dosis. Una sola cara para los dos caminos y para la hoja de
/// «¿Qué hiciste?», que tiene que ofrecer exactamente el mismo control.
struct TarjetaMovimientoLibre<Contenido: View>: View {
    let nombre: String
    let puedeSubir: Bool
    let puedeBajar: Bool
    let alSubir: () -> Void
    let alBajar: () -> Void
    let alQuitar: () -> Void
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack(alignment: .top, spacing: Theme.Spacing.xs) {
                Text(nombre)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, minHeight: Theme.Size.toque, alignment: .leading)
                    .accessibilityAddTraits(.isHeader)
                if puedeSubir || puedeBajar {
                    control("chevron.up", activo: puedeSubir, etiqueta: "Subir \(nombre)", accion: alSubir)
                    control("chevron.down", activo: puedeBajar, etiqueta: "Bajar \(nombre)", accion: alBajar)
                }
                control("trash", activo: true, etiqueta: "Quitar \(nombre)", accion: alQuitar)
            }
            contenido()
                .environment(\.controlLibreDentroDeTarjeta, true)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaDia()
    }

    private func control(_ simbolo: String, activo: Bool, etiqueta: String, accion: @escaping () -> Void) -> some View {
        Button { Haptics.light(); accion() } label: {
            Image(systemName: simbolo)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(activo ? Theme.Color.foreground : Theme.Color.faint)
                .frame(width: Theme.Size.toque, height: Theme.Size.toque)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.9))
        .disabled(!activo)
        .accessibilityLabel(etiqueta)
    }
}

/// Dentro de una tarjeta de movimiento, los contadores no llevan otra cara de tarjeta (una tarjeta dentro
/// de otra es ruido): van hundidos, sin contorno. Lo marca el entorno.
private struct DentroDeTarjetaKey: EnvironmentKey { static let defaultValue = false }

extension EnvironmentValues {
    var controlLibreDentroDeTarjeta: Bool {
        get { self[DentroDeTarjetaKey.self] }
        set { self[DentroDeTarjetaKey.self] = newValue }
    }
}

// MARK: - La hoja

/// El marco de una hoja del constructor (el editor de un tramo de correr): el título a 24 pt, el cuerpo
/// con scroll y «Hecho» anclado abajo, a mano del pulgar. El sistema pone el agarre y el gesto de bajar;
/// lo editado ya está escrito (la hoja trabaja sobre un `Binding`), así que bajarla también vale.
struct MarcoHojaLibre<Contenido: View>: View {
    let titulo: String
    let alTerminar: () -> Void
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        VStack(spacing: 0) {
            Text(titulo)
                .papel(.seccion)
                .foregroundStyle(Theme.Color.foreground)
                .frame(maxWidth: .infinity, minHeight: Theme.Size.toque, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.top, Theme.Spacing.l)
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) { contenido() }
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.vertical, Theme.Spacing.s)
            }
            Button { Haptics.light(); alTerminar() } label: {
                Text("Hecho")
                    .papel(.accion)
                    .foregroundStyle(Theme.Color.background)
                    .frame(maxWidth: .infinity, minHeight: Theme.Size.accion)
                    .background(Theme.Color.foreground, in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(PressScaleStyle(escala: 0.98))
            .padding(.horizontal, Theme.Spacing.pantalla)
            .padding(.vertical, Theme.Spacing.m)
            .overlay(alignment: .top) { Rectangle().fill(Theme.Color.hairline).frame(height: 1) }
        }
        .background(Theme.Color.background)
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.Color.background)
        .presentationCornerRadius(Theme.Radius.sujeto)
    }
}

/// Una nota de apoyo dentro del formulario («El tramo lo cierras tú desde el reloj.»): 15 pt, gris.
struct NotaLibre: View {
    let texto: String
    init(_ texto: String) { self.texto = texto }

    var body: some View {
        Text(texto)
            .papel(.nota)
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// La cara de un contador: tarjeta suelta en el formulario, hueco hundido dentro de una tarjeta.
private struct CaraDeControlLibre: ViewModifier {
    let dentroDeTarjeta: Bool

    func body(content: Content) -> some View {
        if dentroDeTarjeta {
            content.background(Theme.Color.surfaceSunken, in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
        } else {
            content.tarjetaDia()
        }
    }
}
