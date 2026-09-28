import SwiftUI

// LAS PIEZAS — los átomos del vivo del iPhone (espejo de
// `kit-iphone-vivo/piezas.tsx`). Ninguna escribe un tamaño o un color que no
// salga de `VivoTokens`, y ninguna decide QUÉ se pinta: eso lo dicen
// `Vivo.laminaDelPaso`, `Vivo.heroeDeFamilia` y `Vivo.metricasDelPaso`.

/// El lienzo real (390–430 de ancho; horizontal si es más ancho que alto).
struct VivoLienzo: Equatable {
    var ancho: CGFloat
    var alto: CGFloat
    var horizontal: Bool { ancho > alto }
}

private struct VivoLienzoKey: EnvironmentKey {
    static let defaultValue = VivoLienzo(ancho: 402, alto: 874)
}

extension EnvironmentValues {
    var vivoLienzo: VivoLienzo {
        get { self[VivoLienzoKey.self] }
        set { self[VivoLienzoKey.self] = newValue }
    }
}

// MARK: - Texto

/// Toda cifra del vivo. `tono` en tinta por defecto; nunca naranja (el naranja es acción).
struct VivoNumeral: View {
    let texto: String
    let cuerpo: CGFloat
    var peso: Font.Weight = VivoTokens.Numeral.peso
    var tono: Color = VivoColor.tinta

    var body: some View {
        Text(texto)
            .font(VivoTokens.Numeral.fuente(cuerpo, peso: peso))
            .tracking(cuerpo >= VivoTokens.Numeral.umbralTrackingGrande ? cuerpo * VivoTokens.Numeral.trackingGrande : 0)
            .foregroundStyle(tono)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
    }
}

/// Etiqueta o unidad: 15 pt semibold en tinta2. El suelo.
struct VivoEtiqueta: View {
    let texto: String
    var tono: Color = VivoColor.tinta2
    var body: some View {
        Text(texto)
            .font(.system(size: VivoTokens.TI.etiqueta, weight: .semibold))
            .foregroundStyle(tono)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
    }
}

/// Una línea de cuerpo (17 pt): «Luego ·», «Viene:». Puede partirse en dos líneas; nunca se trunca.
struct VivoCuerpo: View {
    let texto: Text
    var body: some View {
        texto
            .font(.system(size: VivoTokens.TI.cuerpo, weight: .medium))
            .foregroundStyle(VivoColor.tinta)
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// La nota de honestidad: 15 pt en tinta2, centrada.
struct VivoNota: View {
    let texto: String
    var tono: Color = VivoColor.tinta2
    var body: some View {
        Text(texto)
            .font(.system(size: VivoTokens.TI.nota, weight: .medium))
            .foregroundStyle(tono)
            .multilineTextAlignment(.center)
            .lineLimit(2)
    }
}

// MARK: - Botones

enum VivoVariante { case primaria, superficie, sutil }

private func fondoBoton(_ v: VivoVariante, _ desactivado: Bool) -> Color {
    if desactivado { return VivoColor.desactivadoFondo }
    switch v {
    case .primaria: return VivoColor.accion
    case .superficie: return VivoColor.superficie2
    case .sutil: return .clear
    }
}

private func tintaBoton(_ v: VivoVariante, _ desactivado: Bool) -> Color {
    if desactivado { return VivoColor.desactivadoTinta }
    return v == .primaria ? VivoColor.sobreAccion : VivoColor.tinta
}

/// Un botón de la franja (64 pt) o menor (44 pt). Naranja SOLO si es la acción
/// primaria del momento. Desactivado = superficie y tinta2, y dice por qué.
struct VivoBoton: View {
    let etiqueta: String
    var variante: VivoVariante = .superficie
    var alto: CGFloat = VivoTokens.TI.boton.alto
    var desactivado = false
    var ancho: CGFloat? = nil
    let accion: () -> Void

    var body: some View {
        let grande = alto >= VivoTokens.TI.boton.alto
        Button(action: { if !desactivado { accion() } }) {
            Text(etiqueta)
                .font(.system(size: grande ? VivoTokens.TI.boton.cuerpo : VivoTokens.TI.botonMenor.cuerpo, weight: grande ? .bold : .semibold))
                .foregroundStyle(tintaBoton(variante, desactivado))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, grande ? 22 : 16)
                .frame(maxWidth: ancho == nil ? .infinity : nil, minHeight: alto, maxHeight: alto)
                .frame(width: ancho)
                .background(fondoBoton(variante, desactivado), in: RoundedRectangle(cornerRadius: VivoTokens.Radio.boton, style: .continuous))
        }
        .buttonStyle(VivoPulsarStyle())
        .disabled(desactivado)
        .accessibilityLabel(etiqueta)
    }
}

/// Un botón redondo de la franja (Pausa, Terminar): 64 × 64.
struct VivoBotonRedondo<Icono: View>: View {
    let nombre: String
    var variante: VivoVariante = .superficie
    var talla: CGFloat = VivoTokens.TI.boton.alto
    var accion: (() -> Void)? = nil
    @ViewBuilder let icono: () -> Icono

    var body: some View {
        Button(action: { accion?() }) {
            icono()
                .foregroundStyle(tintaBoton(variante, false))
                .frame(width: talla, height: talla)
                .background(fondoBoton(variante, false), in: Circle())
        }
        .buttonStyle(VivoPulsarStyle())
        .accessibilityLabel(nombre)
    }
}

struct VivoPulsarStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.92 : 1)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}

// MARK: - Chips de enlace (I10): forma + palabra, nunca un color nuevo

struct VivoChip: View {
    let chip: Vivo.ChipEnlace
    var accion: (() -> Void)? = nil
    @State private var late = false

    private var relleno: Bool { chip.estado == .ok }
    private var tono: Color { chip.estado == .apagado ? VivoColor.tinta2 : VivoColor.tinta }

    var body: some View {
        Button(action: { accion?() }) {
            HStack(spacing: 6) {
                VivoIcono(chip.clave).opacity(chip.estado == .apagado ? 0.7 : 1)
                if chip.estado == .buscando {
                    Circle().fill(VivoColor.tinta).frame(width: 6, height: 6).opacity(late ? 0.25 : 1)
                        .onAppear { withAnimation(.easeInOut(duration: 0.55).repeatForever()) { late = true } }
                }
                Text(chip.texto).font(.system(size: VivoTokens.TI.chip.cuerpo, weight: .semibold)).lineLimit(1)
            }
            .foregroundStyle(tono)
            .padding(.leading, 8).padding(.trailing, 10)
            .frame(height: VivoTokens.TI.chip.alto)
            .background(relleno ? VivoColor.superficie2 : .clear, in: RoundedRectangle(cornerRadius: VivoTokens.Radio.chip, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: VivoTokens.Radio.chip, style: .continuous).stroke(relleno ? .clear : VivoColor.carril, lineWidth: 1.5))
        }
        .buttonStyle(VivoPulsarStyle())
        .accessibilityLabel(chip.texto)
    }
}

/// Los iconos del vivo: símbolos del sistema, un tamaño.
struct VivoIcono: View {
    let nombre: String
    var talla: CGFloat = 16
    var peso: Font.Weight = .semibold

    init(_ clave: Vivo.ClaveEnlace, talla: CGFloat = 16) {
        switch clave {
        case .reloj: nombre = "applewatch"
        case .gps: nombre = "location.fill"
        case .maquina: nombre = "water.waves"
        case .pulso: nombre = "heart.fill"
        }
        self.talla = talla
    }

    init(sistema: String, talla: CGFloat = 24, peso: Font.Weight = .semibold) {
        nombre = sistema
        self.talla = talla
        self.peso = peso
    }

    var body: some View {
        Image(systemName: nombre).font(.system(size: talla, weight: peso)).frame(width: talla + 2, height: talla + 2)
    }
}

// MARK: - Superficie, corazón y chip de zona

/// Una superficie sobre el negro (celda, tarjeta de anotación).
struct VivoSuperficie<Contenido: View>: View {
    var padding: CGFloat = 14
    @ViewBuilder let contenido: () -> Contenido
    var body: some View {
        contenido()
            .padding(padding)
            .background(VivoColor.celda, in: RoundedRectangle(cornerRadius: VivoTokens.Radio.superficie, style: .continuous))
    }
}

/// El corazón del pulso, en tinta2.
struct VivoCorazon: View {
    var talla: CGFloat = 13
    var body: some View {
        Image(systemName: "heart.fill").font(.system(size: talla, weight: .semibold)).foregroundStyle(VivoColor.tinta2)
    }
}

/// «Z4» en el color de la zona del coach.
struct VivoChipZona: View {
    let zona: Vivo.ZonaVista
    var body: some View {
        Text("Z\(zona.n)")
            .font(.system(size: VivoTokens.TI.etiqueta, weight: .bold))
            .foregroundStyle(VivoColor.zona(zona))
    }
}
