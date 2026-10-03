import SwiftUI

// LO QUE COMPARTEN TODAS LAS FILAS DE LOS PANELES: la fila que se toca, su columna de dosis y el nombre con su punto.
//
// Una fila o una tarjeta de movimiento es `FichaTocable` o lo lleva dentro. Si el movimiento tiene técnica (vídeo,
// descripción, claves o la nota que el coach dejó para hoy) es un botón que abre la hoja del ejercicio; si no, es
// texto quieto: un botón que no hace nada es una promesa sin cumplir. Una fila se toca de pie, con el móvil a un
// brazo: 48 pt como mínimo.

struct FichaTocable<Contenido: View>: View {
    let movimiento: MovimientoFicha
    let alAbrirTecnica: (WorkoutItem) -> Void
    var altoMinimo: CGFloat = Theme.Size.toque
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        if movimiento.tieneTecnica {
            Button {
                Haptics.light()
                alAbrirTecnica(movimiento.item)
            } label: {
                caja
            }
            .buttonStyle(PressScaleStyle(escala: 0.985))
            .accessibilityElement(children: .combine)
            .accessibilityHint(LecturaEjercicioPrevia.tieneVideo(movimiento.item) ? "Abre el vídeo de técnica" : "Abre la técnica")
            .accessibilityAddTraits(.isButton)
        } else {
            caja.accessibilityElement(children: .combine)
        }
    }

    private var caja: some View {
        contenido()
            .frame(maxWidth: .infinity, minHeight: altoMinimo, alignment: .leading)
            .contentShape(Rectangle())
    }
}

// MARK: - La columna de la derecha

/// La dosis grande de una fila y, debajo, contra qué (kilos, ritmo, zona, el total en Dobles). Lo que dice sale de
/// `MovimientoFicha.columna`; sin dosis no se pinta nada: la fila se queda con el nombre (jamás un «— reps» ni un 0).
struct FichaDosis: View {
    let columna: MovimientoFicha.Columna
    /// El apoyo con peso (en la tinta del texto) en vez de apagado: donde el kilo o el total importan tanto como la dosis.
    var apoyoFuerte = false
    /// A la derecha de la fila va alineada a la derecha; debajo del nombre (con el texto muy grande), a la izquierda.
    var alineacion: HorizontalAlignment = .trailing

    var body: some View {
        VStack(alignment: alineacion, spacing: 1) {
            if let principal = columna.principal {
                Text(principal)
                    .papel(.cuerpoFuerte)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.foreground)
                    .multilineTextAlignment(alineacion == .leading ? .leading : .trailing)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let segunda = columna.segundaLinea {
                Text(segunda)
                    .papel(apoyoFuerte ? .notaPesada : .nota)
                    .monospacedDigit()
                    .foregroundStyle(apoyoFuerte ? Theme.Color.foreground : Theme.Color.muted)
                    .multilineTextAlignment(alineacion == .leading ? .leading : .trailing)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - El nodo numerado de un recorrido

/// El número de una estación o de una pieza de una secuencia, en un círculo con el borde del color de su modalidad.
struct FichaNodoNumerado: View {
    let numero: Int
    let color: SwiftUI.Color
    let lado: CGFloat

    /// Cuánto tiñe su modalidad el nodo y el grosor de su borde.
    private static let tinte = 0.28
    private static let grosorDelBorde: CGFloat = 2

    var body: some View {
        Text("\(numero)")
            .papel(.notaPesada)
            .foregroundStyle(Theme.Color.foreground)
            .frame(width: lado, height: lado)
            .background(Theme.Color.tinte(color, Self.tinte, sobre: Theme.Color.background), in: Circle())
            .overlay(Circle().strokeBorder(color, lineWidth: Self.grosorDelBorde))
    }
}

// MARK: - El nombre con el punto de su modalidad

/// El nombre de un movimiento con el punto del color de su modalidad: la cabecera de las tarjetas de carrera.
struct FichaNombreConPunto: View {
    let movimiento: MovimientoFicha

    private static let punto: CGFloat = 10

    var body: some View {
        HStack(spacing: Theme.Spacing.m - 2) {
            Circle()
                .fill(Theme.Modality.color(movimiento.modalidad.rawValue))
                .frame(width: Self.punto, height: Self.punto)
                .accessibilityHidden(true)
            Text(movimiento.nombre)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

extension MovimientoFicha {
    /// El nombre se apaga cuando no te toca a ti (lo hace tu pareja): se sigue leyendo, pero no compite con lo tuyo.
    var tintaDelNombre: SwiftUI.Color {
        esDeLaPareja ? Theme.Color.muted : Theme.Color.foreground
    }
}
