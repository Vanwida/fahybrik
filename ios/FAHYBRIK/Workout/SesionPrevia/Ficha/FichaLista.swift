import SwiftUI

// UNA LISTA DE FILAS — todo lo que se lee de un vistazo cuando un bloque lleva varios movimientos: un AMRAP, un For Time, una tanda de
// fuerza, un calentamiento, las piezas de un test.
//
// Una fila dice, en ESE orden: el nombre; debajo y apagado, lo que se hace distinto (el %RM, el tempo, el descanso), las cargas de una
// rampa (`lineaDeSeries`) y lo que escribió el coach para ese movimiento (dos líneas como mucho: entera, en la hoja de técnica); y a la
// derecha la dosis y contra qué. Sin dosis, el nombre solo.
//
//   · `.miniatura`: con la miniatura del movimiento (su póster o su loseta). Lo normal en un bloque de trabajo.
//   · `.compacta`: sin miniatura y con `dosis · contra` apagado, porque en un calentamiento lo que importa es que no se olvide uno, no
//     cuánto pesa cada cosa.
//   · `.numerada`: las piezas de una secuencia, una detrás de otra: un nodo numerado sobre un raíl en vez de la miniatura.
//
// Una tarjeta GRANDE por movimiento solo cuando el movimiento es lo único del bloque (`FichaTarjetaDeEjercicio`): con varios, cada uno
// en su tarjeta hacía scrollear una pantalla entera para ver cinco ejercicios y se perdía el hilo de qué había que hacer.

struct FichaLista: View {
    enum Estilo { case miniatura, compacta, numerada }

    let movimientos: [MovimientoFicha]
    var estilo: Estilo = .miniatura
    let alAbrirTecnica: (WorkoutItem) -> Void

    /// El nodo de una pieza numerada y el aire que le deja el raíl por arriba y por abajo.
    @ScaledMetric(relativeTo: .subheadline) private var nodo: CGFloat = 30
    @Environment(\.dynamicTypeSize) private var tamanoDeTexto

    private static let aireEntreLineas: CGFloat = 2
    private static let lineasDeLaNota = 2
    private static let grosorDelRiel: CGFloat = 2
    private static let recorteDelRiel: CGFloat = 20

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(movimientos.enumerated()), id: \.element.id) { i, movimiento in
                if i > 0, estilo != .numerada { Hairline() }
                FichaTocable(movimiento: movimiento, alAbrirTecnica: alAbrirTecnica, altoMinimo: altoMinimo) {
                    fila(movimiento, numero: i + 1)
                }
            }
        }
        .background(alignment: .topLeading) { if estilo == .numerada { riel } }
    }

    /// La dosis va alineada a la derecha, o a la izquierda cuando el texto es tan grande que baja debajo del nombre.
    private var alineacionDeLaDosis: HorizontalAlignment { tamanoDeTexto.isAccessibilitySize ? .leading : .trailing }

    private var altoMinimo: CGFloat {
        switch estilo {
        case .miniatura: return FichaMedidas.altoDeFila
        case .compacta:  return Theme.Size.toque
        case .numerada:  return FichaMedidas.altoDeFilaNumerada
        }
    }

    @ViewBuilder
    private func fila(_ m: MovimientoFicha, numero: Int) -> some View {
        switch estilo {
        case .miniatura:
            HStack(spacing: Theme.Spacing.m) {
                FichaMiniatura(movimiento: m, tamano: .fila)
                conDosis { textos(m) } derecha: { FichaDosis(columna: m.columnaDeFila, alineacion: alineacionDeLaDosis) }
            }
            .padding(.vertical, Theme.Spacing.s)
        case .compacta:
            conDosis { textos(m, fuerte: false) } derecha: {
                if let linea = m.columna.enUnaLinea {
                    Text(linea)
                        .papel(.nota)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Color.muted)
                        .multilineTextAlignment(.trailing)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, Theme.Spacing.xs)
        case .numerada:
            HStack(spacing: Theme.Spacing.m) {
                FichaNodoNumerado(numero: numero, color: Theme.Modality.color(m.modalidad.rawValue), lado: nodo)
                conDosis { textos(m) } derecha: {
                    FichaDosis(columna: m.columnaDeFila, apoyoFuerte: true, alineacion: alineacionDeLaDosis)
                }
            }
            .padding(.vertical, Theme.Spacing.s)
        }
    }

    /// Los textos a la izquierda y la dosis a la derecha; con el texto muy grande, la dosis debajo. No se usa `FilaAdaptableDia`: ese
    /// mide el ancho IDEAL de la izquierda, y una nota larga lo desborda aunque se pueda partir en líneas, así que la dosis caía debajo
    /// de cualquier fila con nota. Aquí la izquierda se parte y la dosis conserva su sitio.
    @ViewBuilder
    private func conDosis<Izquierda: View, Derecha: View>(
        @ViewBuilder _ izquierda: () -> Izquierda, @ViewBuilder derecha: () -> Derecha
    ) -> some View {
        if tamanoDeTexto.isAccessibilitySize {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                izquierda()
                derecha()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m) {
                izquierda().frame(maxWidth: .infinity, alignment: .leading)
                derecha().layoutPriority(1)
            }
        }
    }

    /// El nombre y, debajo y apagado, lo que se hace distinto, las cargas de una rampa y lo que escribió el coach.
    private func textos(_ m: MovimientoFicha, fuerte: Bool = true) -> some View {
        VStack(alignment: .leading, spacing: Self.aireEntreLineas) {
            Text(m.nombre)
                .papel(fuerte ? .cuerpoFuerte : .cuerpo)
                .foregroundStyle(m.tintaDelNombre)
                .fixedSize(horizontal: false, vertical: true)
            if let secundaria = m.secundaria { apagado(secundaria) }
            if let cargas = m.lineaDeSeries { apagado(cargas) }
            if let nota = m.nota { apagado(nota, lineas: Self.lineasDeLaNota) }
        }
    }

    private func apagado(_ texto: String, lineas: Int? = nil) -> some View {
        Text(texto)
            .papel(.nota)
            .foregroundStyle(Theme.Color.muted)
            .lineLimit(lineas)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// El raíl que une los nodos: del centro del primero al del último.
    private var riel: some View {
        Rectangle()
            .fill(Theme.Color.hairlineStrong)
            .frame(width: Self.grosorDelRiel)
            .padding(.leading, nodo / 2 - Self.grosorDelRiel / 2)
            .padding(.vertical, Self.recorteDelRiel)
            .accessibilityHidden(true)
    }
}
