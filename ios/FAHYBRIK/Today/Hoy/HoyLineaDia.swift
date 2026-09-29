import SwiftUI

// LA LÍNEA DEL DÍA — fecha, saludo por la hora y en qué instante estás.
//
// El instante sale del ESTADO de las sesiones (Antes · Entreno · Después), no de una hora del plan:
// el plan no la tiene y el reloj no sabe si ya entrenaste (`LecturaHoy.instanteDelDia`). Un día sin
// sesiones que recorrer dice qué día es en vez de dibujar un recorrido vacío. Es sobria a propósito:
// tres trazos y una palabra, para que el sujeto de debajo sea lo único que grita.

struct HoyLineaDia: View {
    let lectura: LecturaHoy

    @Environment(\.dynamicTypeSize) private var tamanoDeTexto

    private var instante: InstanteDelDia? { lectura.instanteDelDia }

    /// Con más de una sesión el día cuenta cuántas van.
    private var contador: String? {
        guard case .recorrido(_, let cerradas, let total)? = instante, total > 1 else { return nil }
        return "\(cerradas) de \(total) sesiones"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                Text(lectura.fecha)
                    .papel(.etiqueta)
                    .foregroundStyle(Theme.Color.accentText)
                Spacer(minLength: 0)
                if let contador {
                    Text(contador).papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
                }
            }
            Text(lectura.saludo)
                .papel(.saludo)
                .foregroundStyle(Theme.Color.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            pasos
                .padding(.top, Theme.Spacing.s)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var pasos: some View {
        if lectura.cargando {
            // Tres trazos con la forma del recorrido: nada salta cuando llega el día.
            HStack(alignment: .top, spacing: Theme.Spacing.s - 2) {
                ForEach(PasoDelDia.allCases, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 7) {
                        SkeletonBar(height: 6, radius: 3)
                        SkeletonBar(width: 56, height: 15, radius: 5)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Cargando tu día")
        } else {
            switch instante {
            case .recorrido(let ahora, _, _)? where tamanoDeTexto.isAccessibilitySize:
                // Con el texto de accesibilidad tres nombres de paso no caben en una fila sin cortarse
                // («Despu…»): se dice solo el de ahora, que es lo que la línea enseña de un vistazo.
                InfoPill(text: "Ahora: \(ahora.etiqueta)")
                    .frame(maxWidth: .infinity, alignment: .leading)
            case .recorrido(let ahora, let cerradas, let total)?:
                LineaDelDia(
                    pasos: PasoDelDia.allCases.map(\.etiqueta),
                    actual: ahora.rawValue,
                    etiquetaAccesible: "Tu día. Ahora: \(ahora.etiqueta)"
                        + (total > 1 ? ", \(cerradas) de \(total) sesiones cerradas" : "")
                )
            case .rotulo(let texto)?:
                InfoPill(text: texto)
                    .frame(maxWidth: .infinity, alignment: .leading)
            case nil:
                EmptyView()
            }
        }
    }
}

#if DEBUG
#Preview("Línea del día · fábrica") {
    EnAmbasDia {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            HoyLineaDia(lectura: HoyCasos.lectura("listo"))
            HoyLineaDia(lectura: HoyCasos.lectura("doble"))
            HoyLineaDia(lectura: HoyCasos.lectura("descanso"))
            HoyLineaDia(lectura: HoyCasos.lectura("cargando"))
        }
    }
}
#Preview("Línea del día · club azul") {
    EnAmbasDia(club: .pruebaAzul) { HoyLineaDia(lectura: HoyCasos.lectura("hecho")) }
}
#endif
