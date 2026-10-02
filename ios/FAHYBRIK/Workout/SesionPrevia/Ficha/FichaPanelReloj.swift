import SwiftUI

// LOS PANELES DE RELOJ — un reloj que manda (AMRAP, For Time, circuito, Tabata, Death By) y el EMOM.
//
// Lo grande es la cifra del reloj («12:00», «3 rondas», «20/10») con su pie («AMRAP», «Tope 14 min»); debajo, lo que se
// hace. El EMOM lo dibuja como lo que es: una pista de minutos que alternan, con un color por movimiento y la misma
// leyenda debajo, para ver de un vistazo qué toca cada minuto.

/// La tarjeta del reloj: la cifra grande y su pie, sobre el tinte del club.
struct FichaRelojTarjeta: View {
    let reloj: BloqueFicha.Reloj

    var body: some View {
        FilaAdaptableDia(alineacion: .firstTextBaseline) {
            Text(reloj.grande)
                .papel(.sujeto)
                .monospacedDigit()
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        } derecha: {
            Text(reloj.pie)
                .papel(.etiqueta)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, FichaMedidas.rellenoDeTarjetaGrande)
        .padding(.vertical, Theme.Spacing.l)
        .tarjetaDia(realce: true, alAncho: true)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - AMRAP, For Time, circuito…

struct FichaPanelReloj: View {
    let bloque: BloqueFicha
    let alAbrirTecnica: (WorkoutItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: FichaMedidas.dentroDelPanel) {
            if let reloj = bloque.reloj { FichaRelojTarjeta(reloj: reloj) }
            FichaLista(movimientos: bloque.movimientos, alAbrirTecnica: alAbrirTecnica)
        }
    }
}

// MARK: - EMOM

struct FichaPanelEmom: View {
    let bloque: BloqueFicha
    let alAbrirTecnica: (WorkoutItem) -> Void

    @ScaledMetric(relativeTo: .subheadline) private var altoDeLaCelda: CGFloat = 40

    private static let aireDeLaPista: CGFloat = 6
    /// Cuánto tiñe su color el minuto de la pista, su contorno y el grosor de éste.
    private static let tinteDeLaCelda = 0.24
    private static let bordeDeLaCelda = 0.7
    private static let grosorDelBorde: CGFloat = 1.5
    /// El cuadradito de color de la leyenda.
    private static let ladoDeLaLeyenda: CGFloat = 14
    private static let radioDeLaLeyenda: CGFloat = 5
    /// Hasta cuántos minutos caben en seis columnas; con más, diez, para que la pista no crezca a lo alto.
    private static let minutosEnSeisColumnas = 12

    var body: some View {
        VStack(alignment: .leading, spacing: FichaMedidas.dentroDelPanel) {
            if let reloj = bloque.reloj { FichaRelojTarjeta(reloj: reloj) }
            pista
            leyenda
        }
    }

    /// Un color por movimiento DENTRO de la pista, no el de su modalidad: dos movimientos de modalidades parecidas (remo
    /// y wall balls) no se distinguirían, y la pista existe justo para ver que se alternan. Son los cuatro colores del
    /// tema que no avisan de un peligro.
    private static func color(del movimiento: Int) -> SwiftUI.Color {
        switch movimiento % 4 {
        case 0:  return Theme.Color.accent
        case 1:  return Theme.Color.info
        case 2:  return Theme.Color.ok
        default: return Theme.Color.warning
        }
    }

    @ViewBuilder
    private var pista: some View {
        let movimientoDeCada = bloque.movimientoDeCadaMinuto
        if !movimientoDeCada.isEmpty {
            let columnas = movimientoDeCada.count <= Self.minutosEnSeisColumnas ? 6 : 10
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: Self.aireDeLaPista), count: columnas),
                spacing: Self.aireDeLaPista
            ) {
                ForEach(Array(movimientoDeCada.enumerated()), id: \.offset) { minuto, movimiento in
                    celda(minuto + 1, color: Self.color(del: movimiento))
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(movimientoDeCada.count) minutos, alternando los movimientos")
        }
    }

    private func celda(_ minuto: Int, color: SwiftUI.Color) -> some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
        return Text("\(minuto)")
            .papel(.notaPesada)
            .foregroundStyle(Theme.Color.foreground)
            .frame(maxWidth: .infinity, minHeight: altoDeLaCelda)
            .background(Theme.Color.tinte(color, Self.tinteDeLaCelda, sobre: Theme.Color.surface), in: forma)
            .overlay(forma.strokeBorder(color.opacity(Self.bordeDeLaCelda), lineWidth: Self.grosorDelBorde))
    }

    /// La leyenda de la pista: cada movimiento con su color, su papel («Min impar») y su dosis.
    private var leyenda: some View {
        VStack(spacing: 0) {
            ForEach(Array(bloque.movimientos.enumerated()), id: \.element.id) { i, movimiento in
                if i > 0 { Hairline() }
                FichaTocable(movimiento: movimiento, alAbrirTecnica: alAbrirTecnica, altoMinimo: FichaMedidas.altoDeFila) {
                    fila(movimiento, color: Self.color(del: i))
                }
            }
        }
    }

    private func fila(_ m: MovimientoFicha, color: SwiftUI.Color) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            RoundedRectangle(cornerRadius: Self.radioDeLaLeyenda, style: .continuous)
                .fill(color)
                .frame(width: Self.ladoDeLaLeyenda, height: Self.ladoDeLaLeyenda)
                .accessibilityHidden(true)
            FilaAdaptableDia(alineacion: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(m.nombre)
                        .papel(.cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    if let rol = m.rol {
                        Text(rol).papel(.nota).foregroundStyle(Theme.Color.muted)
                    }
                }
            } derecha: {
                FichaDosis(columna: m.columna)
            }
        }
        .padding(.vertical, Theme.Spacing.s)
    }
}
