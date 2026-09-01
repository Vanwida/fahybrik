import SwiftUI

// LA GRÁFICA DE ZONAS, DIBUJADA — una barra apilada por semana.
//
// Es el mismo dibujo que mira el coach en la ficha del atleta
// (`web/components/v2/atleta-detalle/rendimiento/ZonasChart.tsx`). Tiene que
// serlo: si aquí se pintara «parecido», él marcaría un tramo sobre una forma y el
// atleta abriría otra.
//
// PRESENTACIONAL PURA. No sabe de red ni de comunicados: recibe la gráfica ya
// resuelta y la pinta. Toda la cuenta —qué semanas faltan, dónde cae la rejilla,
// qué celdas ocupa un rango— vive en `GraficaDeZonas`, que se prueba sin vista.
//
// CUATRO DECISIONES QUE SE VEN:
//   · Una semana sin dato NO pinta barra. Deja su hueco y una marca fina BAJO la
//     línea base, donde no se puede confundir con un valor pequeño.
//   · El color es la escala de FC del sistema, la misma del aro del reloj. El
//     naranja no entra NUNCA dentro del área de datos: aquí el naranja es lo que
//     dice el coach (sus rangos), y dato y opinión no se pueden confundir.
//   · Rótulo directo sólo en el pico. En una nota, dentro de una tarjeta, dos
//     números encima de dos barras vecinas se pisan y no se lee ninguno.
//   · CABE SIEMPRE, no se desliza. La del coach scrollea porque es su mesa de
//     trabajo; ésta es una LECTURA dentro de un briefing, y lo que el atleta
//     tiene que ver de un vistazo es la forma entera (dónde estaba y dónde está).
//     Un scroll dentro de otro scroll además se pelea con el dedo, y lo que se
//     queda fuera del primer golpe de vista no lo busca nadie.
//
// Y por eso lo que el coach ESCRIBIÓ sobre cada tramo va debajo, en una lista, y
// no dentro de su pastilla: a este ancho «Sierra: todo a tope, nada de base» no
// cabe en diez semanas de barra, y media frase recortada es peor que ninguna.
// Arriba queda el tramo (qué semanas, de qué tono) y abajo lo que dijo de él.

struct ZonasSemanaView: View {
    let grafica: GraficaDeZonas

    // MARK: La geometría, en un sitio
    //
    // Compacta a propósito: esto vive DENTRO de una nota, entre párrafos, y una
    // gráfica que ocupa la pantalla entera convierte el briefing en un informe.

    private enum Trazo {
        /// Del borde de arriba a la línea base.
        static let alto: CGFloat = 132
        /// Aire de arriba, donde cabe el rótulo del pico.
        static let aireArriba: CGFloat = 20
        /// La columna de las marcas del eje. Cabe «1 h 30», que es lo que
        /// escribe la rejilla cuando la ventana es corta: partido en dos líneas
        /// deja de ser una marca y pasa a ser un párrafo.
        static let eje: CGFloat = 46
        /// Lo que ocupa una semana como mucho: por encima, cuatro barras
        /// quedarían sueltas cada una en su descampado.
        static let semanaMax: CGFloat = 34
        /// Y lo que ocupa su barra dentro. La barra nunca llena su hueco: el aire
        /// es lo que separa una semana de la siguiente, y por eso es una
        /// proporción y no un número fijo (a 13 puntos de semana, 6 de aire se
        /// comerían la barra).
        static let proporcionBarra: CGFloat = 0.66
        static let barraMax: CGFloat = 20
        static let barraMin: CGFloat = 3
        /// El hueco entre franjas, del color del fondo: el aire separa, nunca un
        /// borde. Y el redondeo del extremo de arriba de la pila.
        static let separacion: CGFloat = 1.5
        static let capitel: CGFloat = 3
        /// La marca de una semana sin dato, bajo la base.
        static let marcaHueco: CGFloat = 5
        static let altoEtiquetaX: CGFloat = 14
        /// La banda de los rangos del coach: fina, porque es un eje y no un
        /// resumen (lo que él escribió va debajo, en su lista).
        static let altoRango: CGFloat = 10
        static let aireRango: CGFloat = 5
        /// Lo que necesita una fecha del eje para no pisar a la siguiente.
        static let aireEtiquetaX: CGFloat = 46
    }

    private var celdas: [CeldaDeSemana] { grafica.celdas }
    private var rangos: [RangoDibujado] { grafica.rangosDibujados }
    private var escala: EscalaDeZonas { EscalaDeZonas(techo: grafica.techo) }

    private var altoDelCuadro: CGFloat {
        Trazo.alto + 1 + Trazo.marcaHueco + Trazo.altoEtiquetaX
            + (rangos.isEmpty ? 0 : Trazo.altoRango + Trazo.aireRango)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            if grafica.estaVacia {
                // Sin una sola barra la gráfica NO desaparece: se dice con
                // palabras. Los rangos del coach se quedan fuera a propósito
                // (ver `VacioDeZonas`).
                VacioDeZonas(grafica: grafica)
            } else {
                GeometryReader { geo in
                    cuadro(ancho: geo.size.width)
                }
                .frame(height: altoDelCuadro)

                LeyendaDeZonas(bandas: bandasPresentes)

                if !rangos.isEmpty {
                    TramosDelCoach(rangos: rangos)
                }

                if let sinDato = PalabrasDeZonas.semanasSinDato(grafica.semanasSinDato) {
                    Text("\(sinDato). Ahí no sabemos qué hiciste, no es que no entrenaras.")
                        .scaledFont(11.5, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    /// Sólo las franjas que de verdad salen en el dibujo. Una leyenda con seis
    /// entradas cuando en pantalla hay tres enseña a no leerla.
    private var bandasPresentes: [BandaDeZona] {
        BandaDeZona.allCases.filter { banda in
            celdas.contains { ($0.semana?.segundos(banda) ?? 0) > 0 }
        }
    }

    // MARK: - El cuadro: el eje y las semanas, que caben enteras

    private func cuadro(ancho: CGFloat) -> some View {
        let disponible = max(0, ancho - Trazo.eje)
        let semana = anchoDeSemana(disponible)

        return HStack(alignment: .top, spacing: 0) {
            ejeVertical
                .frame(width: Trazo.eje, height: Trazo.alto, alignment: .trailing)
                .accessibilityHidden(true)

            semanas(semana: semana, ancho: semana * CGFloat(celdas.count))
                .frame(width: disponible, alignment: .leading)
        }
    }

    /// Cuánto mide una semana en pantalla: se reparte el ancho que le den, y sólo
    /// deja de estirarse cuando estirarse más sería separar cuatro barras a lo
    /// largo de la tarjeta. Veinticuatro semanas en un móvil salen estrechas a
    /// propósito: lo que cuenta esta gráfica es la FORMA, y la forma se lee.
    private func anchoDeSemana(_ disponible: CGFloat) -> CGFloat {
        let n = max(1, CGFloat(celdas.count))
        return min(Trazo.semanaMax, max(0, disponible / n))
    }

    private func anchoDeBarra(_ semana: CGFloat) -> CGFloat {
        max(Trazo.barraMin, min(Trazo.barraMax, semana * Trazo.proporcionBarra))
    }

    // MARK: - El eje vertical

    /// Las marcas, alineadas a la rejilla que se dibuja al lado. Van fuera del
    /// scroll: la escala tiene que seguir ahí cuando mueves las semanas.
    private var ejeVertical: some View {
        ZStack(alignment: .topLeading) {
            ForEach(escala.marcas, id: \.self) { marca in
                Text(PalabrasDeZonas.rato(marca))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(Theme.Color.faint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .frame(width: Trazo.eje - 6, alignment: .trailing)
                    .offset(y: y(marca) - 6)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    /// Dónde cae un valor dentro del trazado: 0 arriba del todo, `alto` en la base.
    private func y(_ segundos: Int) -> CGFloat {
        Trazo.alto - escala.fraccion(segundos) * (Trazo.alto - Trazo.aireArriba)
    }

    // MARK: - Las semanas

    private func semanas(semana: CGFloat, ancho: CGFloat) -> some View {
        let barra = anchoDeBarra(semana)
        let pico = indiceDelPico
        let rotuladas = semanasRotuladas(ancho: ancho, semana: semana)

        return VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                rejilla
                HStack(spacing: 0) {
                    ForEach(Array(celdas.enumerated()), id: \.element.id) { i, celda in
                        BarraDeSemana(
                            celda: celda,
                            escala: escala,
                            alto: Trazo.alto,
                            aireArriba: Trazo.aireArriba,
                            ancho: barra,
                            rotulo: i == pico ? PalabrasDeZonas.rato(celda.semana?.segundos ?? 0) : nil
                        )
                        .frame(width: semana)
                    }
                }
            }
            .frame(height: Trazo.alto)

            Rectangle()
                .fill(Theme.Color.hairlineStrong)
                .frame(height: 1)
                .accessibilityHidden(true)

            marcasDeHueco(semana: semana, barra: barra)
            etiquetasDeSemana(semana: semana, rotuladas: rotuladas)

            if !rangos.isEmpty {
                BandaDeRangos(rangos: rangos, semana: semana, alto: Trazo.altoRango)
                    .padding(.top, Trazo.aireRango)
            }
        }
    }

    private var rejilla: some View {
        ZStack(alignment: .topLeading) {
            ForEach(escala.marcas, id: \.self) { marca in
                Rectangle()
                    .fill(Theme.Color.hairline)
                    .frame(height: 1)
                    .offset(y: y(marca))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityHidden(true)
    }

    /// La semana sin dato deja su hueco arriba y se dice AQUÍ, bajo la base,
    /// donde no se puede leer como una barra diminuta.
    private func marcasDeHueco(semana: CGFloat, barra: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(celdas.enumerated()), id: \.element.id) { _, celda in
                Group {
                    if celda.semana == nil {
                        Rectangle()
                            .fill(Theme.Color.faint)
                            .frame(width: barra, height: 1.5)
                    } else {
                        Color.clear.frame(width: barra, height: 1.5)
                    }
                }
                .frame(width: semana, height: Trazo.marcaHueco, alignment: .top)
            }
        }
        .padding(.top, 3)
        .frame(height: Trazo.marcaHueco, alignment: .top)
        .accessibilityHidden(true)
    }

    /// Las fechas del eje. Cada una ocupa el hueco de SU semana aunque no se
    /// escriba —un hueco vacío tiene que seguir siendo un hueco— y se sale de él
    /// por los lados, que es lo que la deja centrada sobre su barra.
    private func etiquetasDeSemana(semana: CGFloat, rotuladas: Set<Int>) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(celdas.enumerated()), id: \.element.id) { i, celda in
                Group {
                    if rotuladas.contains(i) {
                        Text(PalabrasDeZonas.semanaCorta(celda.weekStart))
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(Theme.Color.faint)
                            .lineLimit(1)
                            .fixedSize()
                    } else {
                        Color.clear.frame(width: 1, height: 1)
                    }
                }
                .frame(width: semana)
            }
        }
        .frame(height: Trazo.altoEtiquetaX)
        .accessibilityHidden(true)
    }

    /// Qué semanas llevan su fecha escrita. Veintiséis seguidas no se leen: se
    /// rotula una de cada tantas, siempre la primera y siempre la última.
    ///
    /// Los dos extremos NO se negocian (dónde empieza la ventana y dónde está
    /// hoy); lo que se cae es la fecha del medio que quedaría pegada a la última,
    /// porque dos fechas solapadas no se leen ninguna de las dos.
    private func semanasRotuladas(ancho: CGFloat, semana: CGFloat) -> Set<Int> {
        let ultima = celdas.count - 1
        guard ultima > 0 else { return [0] }
        let caben = max(2, Int(ancho / Trazo.aireEtiquetaX))
        let salto = max(1, Int(ceil(Double(celdas.count) / Double(caben))))
        var indices = Set(stride(from: 0, to: celdas.count, by: salto).filter {
            $0 == 0 || CGFloat(ultima - $0) * semana >= Trazo.aireEtiquetaX
        })
        indices.insert(0)
        indices.insert(ultima)
        return indices
    }

    /// La semana más alta, que es la única que lleva su número escrito.
    private var indiceDelPico: Int? {
        var pico: Int?
        var mayor = 0
        for (i, celda) in celdas.enumerated() {
            let valor = celda.semana?.segundos ?? 0
            if valor > mayor {
                mayor = valor
                pico = i
            }
        }
        return pico
    }
}
