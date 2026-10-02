import SwiftUI

// EL PANEL DE ESTACIONES — una simulación tipo HYROX como un recorrido, no como dieciséis filas.
//
// «Run 1 km, estación, Run 1 km, estación…» son N estaciones precedidas de la MISMA carrera: aquí van en un raíl, con
// la carrera entre estación y estación («Sales corriendo 1 km» primero, «Corres 1 km» entre medias) y cada estación
// numerada, con el borde del color de su modalidad. En Dobles, la dosis grande es TU parte y debajo va el total; una
// estación que hace tu pareja se enseña apagada, con quién la hace.

struct FichaPanelEstaciones: View {
    let bloque: BloqueFicha
    let alAbrirTecnica: (WorkoutItem) -> Void

    /// El nodo de una estación y la columna del raíl. Escalan con el texto: el número no puede salirse del círculo.
    @ScaledMetric(relativeTo: .subheadline) private var nodo: CGFloat = 36

    private static let grosorDelRiel: CGFloat = 2
    /// Lo que el raíl se queda corto por arriba y por abajo: nace en el primer punto y acaba en el último nodo.
    private static let recorteDelRiel: CGFloat = 18
    private static let altoDeLaCarrera: CGFloat = 34
    private static let puntoDeLaCarrera: CGFloat = 10
    /// El aro del color del lienzo alrededor del punto: «corta» el raíl para que el punto se lea suelto.
    private static let aroDelPunto: CGFloat = 4

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(bloque.movimientos.enumerated()), id: \.element.id) { i, movimiento in
                if let carrera = bloque.carreraAntesDeLaEstacion(i) { carreraEntreEstaciones(carrera) }
                FichaTocable(movimiento: movimiento, alAbrirTecnica: alAbrirTecnica, altoMinimo: FichaMedidas.altoDeFila) {
                    estacion(i + 1, movimiento)
                }
            }
        }
        .background(alignment: .topLeading) { riel }
    }

    private var riel: some View {
        Rectangle()
            .fill(Theme.Color.hairlineStrong)
            .frame(width: Self.grosorDelRiel)
            .padding(.leading, nodo / 2 - Self.grosorDelRiel / 2)
            .padding(.vertical, Self.recorteDelRiel)
            .accessibilityHidden(true)
    }

    /// La carrera entre estaciones: un punto del color de correr sobre el raíl y la frase.
    private func carreraEntreEstaciones(_ frase: String) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            Circle()
                .fill(Theme.Modality.color(PrescriptionModality.run.rawValue))
                .frame(width: Self.puntoDeLaCarrera, height: Self.puntoDeLaCarrera)
                .padding(Self.aroDelPunto)
                .background(Theme.Color.background, in: Circle())
                .frame(width: nodo)
                .accessibilityHidden(true)
            Text(frase)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: Self.altoDeLaCarrera)
    }

    private func estacion(_ numero: Int, _ m: MovimientoFicha) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            nodoDeLaEstacion(numero, color: Theme.Modality.color(m.modalidad.rawValue))
            FichaMiniatura(movimiento: m, tamano: .fila)
            FilaAdaptableDia(alineacion: .center) {
                Text(m.nombre)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(m.tintaDelNombre)
                    .fixedSize(horizontal: false, vertical: true)
            } derecha: {
                FichaDosis(columna: m.columna, apoyoFuerte: true)
            }
        }
    }

    private func nodoDeLaEstacion(_ numero: Int, color: SwiftUI.Color) -> some View {
        Text("\(numero)")
            .papel(.notaPesada)
            .foregroundStyle(Theme.Color.foreground)
            .frame(width: nodo, height: nodo)
            .background(Theme.Color.tinte(color, 0.28, sobre: Theme.Color.background), in: Circle())
            .overlay(Circle().strokeBorder(color, lineWidth: 2))
    }
}
