import SwiftUI

// LAS PIEZAS DE LA GRÁFICA DE ZONAS — una barra, una franja, la banda de rangos
// y la leyenda.
//
// Viven fuera de `ZonasSemanaView` porque esa pieza es un ORDEN (dónde va el
// eje, dónde las semanas, dónde lo que dijo el coach) y esto son las cosas que
// se ordenan: mezclarlos deja la gráfica en un fichero que nadie relee.
//
// Ninguna inventa un color: los de zona salen de `HRZone` y los de tono, de
// `Theme`.

// MARK: - Cuando no hay ni una barra

/// LA GRÁFICA VACÍA, dicha con palabras.
///
/// No es un hueco ni un eje con rejilla y nada dentro: es un estado, y tiene dos
/// motivos distintos (sin umbral no se puede repartir nada; con umbral, faltan
/// entrenos con pulso). El periodo se escribe SIEMPRE, porque sin dibujo el
/// atleta no tiene de dónde sacar qué semanas le está enseñando su coach.
///
/// Los rangos que el coach marcó NO se enseñan aquí, y es una decisión: un tramo
/// marcado es un comentario SOBRE una forma, y sin la forma delante es una
/// afirmación que el atleta no puede comprobar. Lo que él quiera decirle de esas
/// semanas ya va en el texto de la nota, que sí se lee entero.
struct VacioDeZonas: View {
    let grafica: GraficaDeZonas

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            MonoText(text: PalabrasDeZonas.ventana(grafica), size: 10, weight: .bold,
                     color: Theme.Color.faint, escala: true, relativeTo: .caption2)
            Text(PalabrasDeZonas.vacio(grafica))
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, Theme.Spacing.s)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Una barra

/// Una semana. Con dato es una pila de franjas; sin dato no es nada (su ausencia
/// se dice abajo, bajo la base).
struct BarraDeSemana: View {
    let celda: CeldaDeSemana
    let escala: EscalaDeZonas
    let alto: CGFloat
    let aireArriba: CGFloat
    let ancho: CGFloat
    /// El número escrito encima. Sólo lo lleva el pico.
    let rotulo: String?

    private static let separacion: CGFloat = 1.5
    private static let capitel: CGFloat = 3

    var body: some View {
        ZStack(alignment: .bottom) {
            if let semana = celda.semana, !semana.pila.isEmpty {
                pila(semana)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(PalabrasDeZonas.desglose(celda))
    }

    private func pila(_ semana: SemanaEnZonas) -> some View {
        let trozos = Array(semana.pila.reversed())
        return VStack(spacing: 0) {
            if let rotulo {
                Text(rotulo)
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
                    .fixedSize()
                    .padding(.bottom, 3)
            }
            VStack(spacing: 0) {
                ForEach(Array(trozos.enumerated()), id: \.element.id) { i, trozo in
                    // El hueco cae SIEMPRE entre dos colores: se le quita por
                    // arriba a cada franja menos a la de arriba del todo, y así
                    // la pila mide exactamente lo que suma.
                    if i > 0 {
                        Color.clear.frame(height: Self.separacion)
                    }
                    FranjaDeZona(banda: trozo.banda)
                        .frame(width: ancho, height: altoDe(trozo, primera: i == 0))
                }
            }
            .clipShape(
                UnevenRoundedRectangle(
                    topLeadingRadius: Self.capitel, bottomLeadingRadius: 0,
                    bottomTrailingRadius: 0, topTrailingRadius: Self.capitel,
                    style: .continuous
                )
            )
        }
    }

    private func altoDe(_ trozo: TrozoDeSemana, primera: Bool) -> CGFloat {
        let util = alto - aireArriba
        let bruto = escala.fraccion(trozo.segundos) * util
        return max(1, primera ? bruto : bruto - Self.separacion)
    }
}

/// El color de una franja. El hueco va RAYADO y no en gris liso: un bloque gris
/// se lee como «una zona más», y esto es justo la ausencia de una.
struct FranjaDeZona: View {
    let banda: BandaDeZona

    var body: some View {
        if let zona = banda.zona {
            Rectangle().fill(zona.color)
        } else {
            Rectangle()
                .fill(Theme.Color.neutralTint)
                .overlay {
                    RayadoDiagonal()
                        .stroke(Theme.Color.neutral.opacity(0.55), lineWidth: 1.2)
                        .clipped()
                }
        }
    }
}

/// Diagonales a 45°, el mismo rayado que la gráfica del coach.
struct RayadoDiagonal: Shape {
    var paso: CGFloat = 5

    func path(in rect: CGRect) -> Path {
        var p = Path()
        var x = rect.minX - rect.height
        while x < rect.maxX {
            p.move(to: CGPoint(x: x, y: rect.maxY))
            p.addLine(to: CGPoint(x: x + rect.height, y: rect.minY))
            x += paso
        }
        return p
    }
}

// MARK: - Los rangos del coach

/// QUÉ SEMANAS marcó, tumbado bajo el eje. Sin una palabra dentro: a este ancho
/// la frase no cabe, y lo que dijo se lee entero justo debajo, en su lista.
struct BandaDeRangos: View {
    let rangos: [RangoDibujado]
    let semana: CGFloat
    let alto: CGFloat

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(rangos) { rango in
                pastilla(rango)
                    .frame(width: ancho(rango), height: alto)
                    .offset(x: CGFloat(rango.desde) * semana + 1)
            }
        }
        .frame(height: alto, alignment: .topLeading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHidden(true)
    }

    private func ancho(_ rango: RangoDibujado) -> CGFloat {
        max(0, CGFloat(rango.celdas) * semana - 2)
    }

    private func pastilla(_ rango: RangoDibujado) -> some View {
        let color = TonoDeRango.color(rango.tono)
        return RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(color.opacity(0.18))
            .overlay {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .stroke(color.opacity(0.5), lineWidth: 1)
            }
    }
}

/// LO QUE DIJO de cada tramo, entero. Es la mitad del feedback: la gráfica
/// enseña la forma y esto es la frase por la que el coach la marcó.
struct TramosDelCoach: View {
    let rangos: [RangoDibujado]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            ForEach(rangos) { rango in
                fila(rango)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func fila(_ rango: RangoDibujado) -> some View {
        let color = TonoDeRango.color(rango.tono)
        return HStack(alignment: .top, spacing: Theme.Spacing.s) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(color.opacity(0.9))
                .frame(width: 3, height: 26)
            VStack(alignment: .leading, spacing: 2) {
                MonoText(text: rango.semanas, size: 10, weight: .bold, color: color,
                         escala: true, relativeTo: .caption2)
                Text(rango.etiqueta)
                    .scaledFont(12.5, weight: .medium, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

extension TonoDeRango {
    /// El tono, en los colores del sistema. Que un reparto sea bueno o malo lo
    /// dice el COACH al marcarlo: aquí sólo se pinta lo que él eligió, y por eso
    /// la app no colorea nunca una zona por su cuenta.
    static func color(_ tono: TonoDeRango) -> Color {
        switch tono {
        case .atencion: return Theme.Color.warning
        case .bien:     return Theme.Color.ok
        case .neutro:   return Theme.Color.muted
        }
    }
}

// MARK: - La leyenda

/// Qué es cada color. Sólo las franjas que salen en el dibujo.
struct LeyendaDeZonas: View {
    let bandas: [BandaDeZona]

    var body: some View {
        FlowLayout(spacing: Theme.Spacing.m) {
            ForEach(bandas, id: \.rawValue) { banda in
                HStack(spacing: 5) {
                    muestra(banda)
                    Text(banda.etiqueta)
                        .scaledFont(11, weight: .medium, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                }
                .fixedSize()
            }
        }
        .accessibilityHidden(true)
    }

    private func muestra(_ banda: BandaDeZona) -> some View {
        RoundedRectangle(cornerRadius: 2, style: .continuous)
            .fill(banda.zona?.color ?? Theme.Color.neutralTint)
            .overlay {
                if banda.zona == nil {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .stroke(Theme.Color.neutral.opacity(0.55), lineWidth: 1)
                }
            }
            .frame(width: 9, height: 9)
    }
}
