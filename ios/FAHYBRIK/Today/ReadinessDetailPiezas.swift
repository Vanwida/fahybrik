import SwiftUI

// LAS PIEZAS DEL DETALLE DE LA DISPOSICIÓN: una fila de «qué lo explica», su barra y la tendencia de siete
// días. Son superficies del kit (filas dentro de una `ListaDia`, una tarjeta plana): nada de sombra ni de
// color de estado en el texto — el estado va en la barra y en palabras.

// MARK: - Una fila de «qué lo explica»
//
// Icono + nombre + estado, luego valor · referencia y, debajo, la barra del componente (su ancho = lo que
// aporta; su color, el estado de la fila). La fila del check-in es la única que se toca (chevron → el
// check-in).
struct FilaDeContribuyente: View {
    let contribuyente: Contribuyente
    let alTocar: (() -> Void)?

    var body: some View {
        Group {
            if let alTocar {
                Button(action: alTocar) { fila }
                    .buttonStyle(PressScaleStyle(escala: 0.99))
            } else {
                fila
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(contribuyente.axLabel)
        .accessibilityAddTraits(contribuyente.isAction ? .isButton : [])
    }

    private var fila: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            FichaDia {
                Image(systemName: contribuyente.icon).font(.system(size: 20, weight: .semibold))
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.xs + 2) {
                cabecera
                if let valor = contribuyente.valueText { lectura(valor) }
                if let fraccion = contribuyente.barFraction {
                    BarraDeComponente(fraccion: fraccion, color: contribuyente.barColor)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque + Theme.Spacing.m, alignment: .top)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    /// Nombre a la izquierda y estado a la derecha; con texto grande el estado baja debajo del nombre.
    private var cabecera: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.s) {
                nombre
                Spacer(minLength: Theme.Spacing.s)
                estado
            }
            VStack(alignment: .leading, spacing: 2) {
                nombre
                estado
            }
        }
    }

    private var nombre: some View {
        Text(contribuyente.name)
            .papel(.cuerpoFuerte)
            .foregroundStyle(Theme.Color.foreground)
    }

    /// El estado dicho con palabras; su color vive en la barra de debajo, nunca en el texto. «Hacer» (el
    /// check-in sin hacer) es la única fila que pide algo y por eso pesa más que las demás.
    private var estado: some View {
        HStack(spacing: Theme.Spacing.xs + 2) {
            Text(contribuyente.statusLabel)
                .papel(.notaFuerte)
                .foregroundStyle(contribuyente.isAction ? Theme.Color.foreground : Theme.Color.muted)
            if contribuyente.isAction {
                IconoDia(.chevron, tam: 16).foregroundStyle(Theme.Color.muted)
            }
        }
    }

    private func lectura(_ valor: String) -> some View {
        HStack(spacing: Theme.Spacing.xs + 1) {
            Text(valor)
                .papel(.notaPesada)
                .foregroundStyle(Theme.Color.foreground)
            if let referencia = contribuyente.referenceText {
                Text("· \(referencia)")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }
}

/// Una barra fina: una pista hundida con el relleno en `fraccion` (0…1). Nunca menos de 4 pt, para que un
/// componente bajo se vea.
struct BarraDeComponente: View {
    let fraccion: Double
    let color: Color

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Color.surfaceSunken)
                Capsule()
                    .fill(color)
                    .frame(width: max(4, geo.size.width * CGFloat(min(1, max(0, fraccion)))))
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}

// MARK: - La tendencia de siete días
//
// Las barras del score de los últimos siete días (del más antiguo a hoy). Una sola serie, sin ejes ni leyenda:
// la forma, con hoy en el acento y su valor encima, y la letra del día debajo.
struct TendenciaDeSiete: View {
    let puntos: [ReadinessTrendPoint]

    // Las barras escalan de 0 a 100 en un eje FIJO para que sus alturas se comparen; un suelo pequeño deja ver
    // un día bajo. Base plana en la línea, solo la parte de arriba redondeada.
    private let alturaMaxima: CGFloat = 92
    private let alturaMinima: CGFloat = 8
    private let espacioDelValor: CGFloat = 24

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            HStack(alignment: .bottom, spacing: 0) {
                ForEach(puntos.indices, id: \.self) { i in
                    barra(puntos[i], esHoy: i == puntos.count - 1)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: alturaMaxima + espacioDelValor, alignment: .bottom)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Theme.Color.hairlineStrong).frame(height: 1)
            }
            HStack(spacing: 0) {
                ForEach(puntos.indices, id: \.self) { i in
                    Text(Self.letraDelDia(puntos[i].recordedFor))
                        .papel(i == puntos.count - 1 ? .notaPesada : .nota)
                        .foregroundStyle(i == puntos.count - 1 ? Theme.Color.foreground : Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .padding(Theme.Spacing.l)
        .tarjetaDia(alAncho: true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.etiquetaAccesible(puntos))
    }

    private func altura(_ score: Int) -> CGFloat {
        let acotado = CGFloat(min(100, max(0, score)))
        return alturaMinima + (alturaMaxima - alturaMinima) * (acotado / 100)
    }

    private func barra(_ punto: ReadinessTrendPoint, esHoy: Bool) -> some View {
        VStack(spacing: 4) {
            if esHoy {
                Text("\(punto.score)")
                    .papel(.notaPesada)
                    .foregroundStyle(Theme.Color.foreground)
            }
            UnevenRoundedRectangle(
                topLeadingRadius: 4, bottomLeadingRadius: 0,
                bottomTrailingRadius: 0, topTrailingRadius: 4, style: .continuous
            )
            .fill(esHoy ? Theme.Color.accent : Theme.Color.neutral.opacity(0.3))
            .frame(width: 14, height: altura(punto.score))
        }
    }

    /// La letra del día en español (L M X J V S D) desde una fecha ISO.
    static func letraDelDia(_ iso: String) -> String {
        guard let fecha = ReadinessDetailSheet.isoDate(iso) else { return "·" }
        var calendario = Calendar(identifier: .gregorian)
        calendario.timeZone = TimeZone(identifier: "UTC")!
        // weekday: 1 = domingo … 7 = sábado.
        let letras = ["D", "L", "M", "X", "J", "V", "S"]
        return letras[(calendario.component(.weekday, from: fecha) - 1) % 7]
    }

    static func etiquetaAccesible(_ puntos: [ReadinessTrendPoint]) -> String {
        var etiqueta = "Últimos 7 días. "
        if let hoy = puntos.last?.score { etiqueta += "Hoy \(hoy). " }
        if let chip = ReadinessDetailSheet.deltaChip(puntos) { etiqueta += "\(chip)." }
        return etiqueta
    }
}
