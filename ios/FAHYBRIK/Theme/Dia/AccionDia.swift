import SwiftUI

// LA ACCIÓN DEL SUJETO — una pastilla de tinta invertida, sola.
//
// El sujeto es lo que MIRAS; esto es lo que TOCAS, y no compiten en peso (CONTRATO-UI §10.5):
// fondo = la tinta del tema, texto = el fondo del tema (así se invierte sola en claro y en
// oscuro, y sobre el acento del club sea cual sea), 52 pt de alto, cursiva de marca.
//
// Es SOLO el dibujo. Dentro de un sujeto que es un botón entero es la pastilla que lo
// representa; suelta, se envuelve en un `Button`:
//
//     Button(action: reintenta) { AccionDia("Reintentar", glifo: .reintentar, enCurso: reintentando) }
//         .buttonStyle(PressScaleStyle(escala: 0.96))
//
// No es un `ExpertPrimaryButton` (el botón de acento a todo el ancho, anclado abajo en una
// pantalla de flujo): aquélla es LA acción de una pantalla entera; ésta cierra un sujeto.

struct AccionDia: View {
    let titulo: String
    var glifo: GlifoDia?
    /// La acción está en marcha (reintentar, guardar): el glifo gira. Con Reducir movimiento, quieto.
    var enCurso: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(_ titulo: String, glifo: GlifoDia? = .flecha, enCurso: Bool = false) {
        self.titulo = titulo
        self.glifo = glifo
        self.enCurso = enCurso
    }

    var body: some View {
        HStack(spacing: Theme.Spacing.m - 2) {
            Text(titulo)
                .papel(.accion)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            if let glifo {
                IconoDia(glifo, tam: 20, peso: .bold)
                    .rotationEffect(.degrees(enCurso ? 360 : 0))
                    .animation(
                        enCurso && !reduceMotion ? .linear(duration: 0.78).repeatForever(autoreverses: false) : .default,
                        value: enCurso
                    )
            }
        }
        .foregroundStyle(Theme.Color.background)
        .padding(.horizontal, 22)
        .frame(minHeight: Theme.Size.accion)
        .background(Theme.Color.foreground, in: Capsule())
        .fixedSize(horizontal: false, vertical: true)
    }
}

#if DEBUG
#Preview("Acción · fábrica") { EnAmbasDia { GaleriaDia.SujetosActivos() } }
#Preview("Acción · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.SujetosActivos() } }
#endif
