import SwiftUI

// EL PÓSTER DE CARRERA — la única fotografía de la pantalla.
//
// La carrera hacia la que va todo el plan, con la cuenta atrás en cifras enormes. La foto
// sale de `BrandImagery` (`RaceCardBackground*`, la misma para la misma carrera).
//
// CONTRASTE MEDIDO (CONTRATO-UI §4.2). El texto va SIEMPRE sobre foto oscurecida, también con
// el tema claro: por eso el póster es una superficie de apariencia OSCURA anidada
// (`.environment(\.colorScheme, .dark)`; en la web, `data-appearance="dark"`), que sigue
// leyendo TOKENS y no hex. Entre la foto y el texto van dos capas: la propia foto se oscurece
// (las del catálogo llevan focos y muros de luz y, sin ello, la cuenta atrás en acento medía
// 2:1) y encima un velo del fondo oscuro en cuatro paradas, suave arriba —donde la foto se
// ve y el texto es grande y blanco— y cerrado abajo, donde van la fase y la simulación en
// 15-17 pt. Las paradas se ajustaron con una auditoría de píxeles sobre las fotos del doble;
// cambiarlas es volver a medir.
//
// Altura (§6.1). El póster de la PORTADA (`.portada`) tiene su alto y se queda ahí: el que absorbe el
// sobrante de esa pantalla es el sujeto. El póster que ES la pantalla (`.pantalla`, Carreras) pide todo
// el alto que sobre (`FillingScreen`) y reparte con un `Spacer` entre sus mitades.

struct PosterDia<Contenido: View>: View {

    /// Cuánto texto cae sobre la foto. Decide dónde cierra el velo.
    enum Densidad {
        /// La portada: un nombre, la cuenta atrás y una línea de fase. El velo cierra a la mitad.
        case portada
        /// El póster es la pantalla entera (Carreras): más texto encima, así que el velo cierra antes.
        case pantalla

        /// Las paradas del velo. Internas para poder medirlas en las pruebas (el peor caso de foto).
        var velo: [Gradient.Stop] {
            switch self {
            case .portada:
                return [.init(color: Self.fondo(0.36), location: 0),
                        .init(color: Self.fondo(0.42), location: 0.24),
                        .init(color: Self.fondo(0.84), location: 0.50),
                        .init(color: Self.fondo(0.80), location: 1)]
            case .pantalla:
                return [.init(color: Self.fondo(0.40), location: 0),
                        .init(color: Self.fondo(0.58), location: 0.20),
                        .init(color: Self.fondo(0.86), location: 0.42),
                        .init(color: Self.fondo(0.88), location: 1)]
            }
        }

        /// Cuánto se oscurece la propia foto antes del velo (multiplicador del brillo).
        var brillo: Double {
            switch self {
            case .portada:  return 0.56
            case .pantalla: return 0.52
            }
        }

        /// El póster de la portada tiene su alto y se queda ahí (el que se lleva el sobrante es el sujeto);
        /// el que ES la pantalla lo absorbe.
        fileprivate var absorbeElSobrante: Bool { self == .pantalla }

        fileprivate var altoMinimo: CGFloat {
            switch self {
            case .portada:  return 256
            case .pantalla: return 400
            }
        }

        private static func fondo(_ opacidad: Double) -> SwiftUI.Color {
            Theme.Color.background.opacity(opacidad)
        }
    }

    /// Nombre del asset (ver `BrandImagery.raceCardBackgrounds`).
    let foto: String
    var densidad: Densidad = .portada
    /// Nombre accesible del póster entero cuando es un botón; VoiceOver lo lee en vez del contenido.
    var etiqueta: String?
    /// El póster entero como botón.
    var alTocar: (() -> Void)?
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        if let alTocar {
            Button(action: alTocar) { cuerpo }
                .buttonStyle(PressScaleStyle(escala: 0.982))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(etiqueta ?? "")
                .accessibilityAddTraits(.isButton)
        } else {
            cuerpo
        }
    }

    private var cuerpo: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.sujeto, style: .continuous)
        return VStack(alignment: .leading, spacing: 10) { contenido() }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(EdgeInsets(top: 16, leading: 20, bottom: 18, trailing: 20))
            .frame(minHeight: densidad.altoMinimo, maxHeight: densidad.absorbeElSobrante ? .infinity : nil, alignment: .topLeading)
            .background { capas }
            .clipShape(forma)
            .contentShape(forma)
            // La superficie oscura anidada: el equivalente de `data-appearance="dark"`.
            .environment(\.colorScheme, .dark)
    }

    /// Foto oscurecida y velo. Decorativas: el contenido lleva el significado.
    private var capas: some View {
        ZStack {
            Theme.Color.background
            // `brightness()` de CSS multiplica; `colorMultiply` también. Después, contraste y saturación.
            Image(foto)
                .resizable()
                .scaledToFill()
                .colorMultiply(SwiftUI.Color(white: densidad.brillo))
                .contrast(1.06)
                .saturation(0.95)
            LinearGradient(stops: densidad.velo, startPoint: .top, endPoint: .bottom)
        }
        .accessibilityHidden(true)
    }
}

// MARK: - La cuenta atrás

/// Los días que faltan, enormes: el número en el acento y su unidad al lado. El día de la carrera
/// (`dias <= 0`) es una palabra, «Hoy», no una cifra: el número deja de decir nada y se cambia por
/// lo que el atleta necesita leer. Va en acento como TEXTO GRANDE (3:1): sólo puede ponerse sobre
/// la foto oscurecida del `PosterDia`, que es donde se midió.
struct CuentaAtrasDia: View {
    let dias: Int

    /// El texto del número: «12», o «Hoy» el día de la carrera.
    static func cifra(dias: Int) -> String { dias <= 0 ? "Hoy" : "\(dias)" }
    /// La unidad, con su singular; vacía el día de la carrera.
    static func unidad(dias: Int) -> String? { dias <= 0 ? nil : (dias == 1 ? "día" : "días") }

    var body: some View {
        HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.s + 2) {
            Text(Self.cifra(dias: dias))
                .papel(dias <= 0 ? .cuentaHoy : .cuenta)
                .foregroundStyle(Theme.Color.accentText)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            if let unidad = Self.unidad(dias: dias) {
                Text(unidad)
                    .papel(.seccion)
                    .foregroundStyle(Theme.Color.foreground)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(dias <= 0 ? "Es hoy" : "Faltan \(dias) \(Self.unidad(dias: dias) ?? "")")
    }
}

// MARK: - Un panel sobre la foto

extension View {
    /// Un panel translúcido sobre la foto del póster (el objetivo de tiempo, el predicho): el fondo
    /// oscuro del tema al 62 % y un contorno del texto al 26 %. Sólo dentro de un `PosterDia`.
    func panelSobreFoto() -> some View {
        self
            .background(Theme.Color.background.opacity(0.62), in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
                    .strokeBorder(Theme.Color.foreground.opacity(0.26), lineWidth: 1)
            )
    }
}

#if DEBUG
#Preview("Póster · fábrica") { EnAmbasDia { GaleriaDia.Posters() } }
#Preview("Póster · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Posters() } }
#endif
