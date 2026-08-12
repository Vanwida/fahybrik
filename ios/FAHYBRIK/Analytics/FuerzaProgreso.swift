import SwiftUI

// FUERZA · ¿ESTOY MÁS FUERTE? — la evidencia de cambio, donde el atleta pregunta.
//
// LA REGLA QUE GOBIERNA ESTO: en Perfil se queda QUIÉN ERES —los números de hoy,
// el 1RM con el que se escribe tu próximo entreno—, y CÓMO HAS CAMBIADO vive
// donde se pregunta si vas a mejor. La evolución de cada levantamiento llevaba
// meses escondida dentro de «Mi fuerza», tres toques por debajo de Perfil, que
// es la pantalla donde nadie va a preguntarse si está progresando.
//
// QUÉ MIDE UNA SERIE DECIDE DE QUÉ SECCIÓN ES, no cómo se llama. La batería de
// un atleta produce series de todo: un 5k en segundos, un Cooper en metros, un
// umbral en pulsaciones, una sentadilla en kilos. Sólo dos unidades miden fuerza
// —el peso que mueve y las repeticiones que aguanta—, y son las únicas que entran
// aquí. Un 5k en la sección de fuerza no es un dato de más: es un dato en la
// sección equivocada.
//
// EL ACABADO ES EL DE `AnaliticasCorrerView`: cero cajas, cero líneas divisorias,
// versalita + aire por toda separación, cifras en mono con la unidad en versalita
// al lado, y el mismo trazo de curva (`CurvaCompacta` comparte el dibujo con
// `LineaDeProgreso`, no lo reimplementa).
//
// AQUÍ NO SE INVENTA UN VEREDICTO DE SECCIÓN. El juicio de cada serie es su
// delta —dos medidas guardadas, restadas— y la dirección de la mejora la decide
// la unidad (`BenchmarkDelta`), nunca esta vista: así un +2,5 kg no puede leerse
// verde aquí y rojo en la pantalla de al lado.

// MARK: - El modelo (puro)

/// Una serie de fuerza lista para leerse: qué mide, cuánto vale hoy, cuánto se
/// ha movido desde cuándo, y por dónde ha pasado.
struct CurvaDeFuerza: Identifiable, Equatable {
    let id: String
    /// «Sentadilla», «Dominadas estrictas» — el nombre que el atleta reconoce.
    let titulo: String
    /// La unidad tal como la guarda el servidor. Manda el formato Y la dirección
    /// de la mejora, así que jamás se traduce ni se normaliza por el camino.
    let unidad: String
    /// Cronológica, de la más vieja a la de hoy.
    let valores: [Double]
    /// Cuándo se midió la ANTERIOR — la ventana del delta. Nil cuando no se sabe
    /// (una fecha ilegible no se adivina) o cuando no hay medida anterior.
    let desde: Date?

    var ultimo: Double { valores.last ?? 0 }

    /// La última medida contra la anterior, en el signo crudo de la unidad (un
    /// 5k más lento sale en positivo). Nil con una sola medida: no hay contra qué.
    var delta: Double? {
        guard valores.count >= 2 else { return nil }
        return valores[valores.count - 1] - valores[valores.count - 2]
    }

    /// ¿Mejora? Nil = no juzga — una sola medida, o cero cambio.
    var mejora: Bool? {
        guard let delta, delta != 0 else { return nil }
        return BenchmarkDelta.improved(unit: unidad, delta: delta)
    }

    /// Sin dos medidas no hay curva, y en su sitio va el acto que la llena.
    var tieneCurva: Bool { valores.count >= 2 }
}

enum FuerzaProgreso {
    /// LAS UNIDADES QUE MIDEN FUERZA. Se decide por la unidad y no por una lista
    /// de slugs a propósito: el catálogo de pruebas lo escribe cada entrenador, y
    /// una lista cerrada dejaría fuera el primer levantamiento que añada.
    static let unidadesDeFuerza: Set<String> = ["kg", "reps"]

    /// La evolución de cada 1RM. Funde el historial con la versión actual POR
    /// NÚMERO DE VERSIÓN, que es lo que hace que dé igual si el servidor incluye
    /// la versión de hoy dentro del historial o la manda sólo arriba.
    ///
    /// Devuelve TAMBIÉN los levantamientos con una única medida: esconderlos le
    /// enseñaría cuatro de sus seis levantamientos a un atleta sin decirle por
    /// qué faltan dos. La fila declara el hueco con el acto que lo llena.
    static func levantamientos(_ maxes: [StrengthMaxProfile]) -> [CurvaDeFuerza] {
        maxes.compactMap { m in
            var porVersion: [Int: StrengthMaxPoint] = [:]
            for p in m.history { porVersion[p.version] = p }
            // La actual, cuando trae versión, gana a la homónima del historial:
            // es la que el resto de la app usa para calcular porcentajes.
            if let v = m.version {
                porVersion[v] = StrengthMaxPoint(
                    oneRmKg: m.oneRmKg, version: v,
                    recordedAt: m.recordedAt ?? porVersion[v]?.recordedAt ?? "",
                    source: m.source
                )
            }
            let ordenados = porVersion.sorted { $0.key < $1.key }.map(\.value)
            // Sin versión y sin historial no hay serie que ordenar, pero sí una
            // medida: la de arriba.
            let serie = ordenados.isEmpty
                ? [StrengthMaxPoint(oneRmKg: m.oneRmKg, version: 1,
                                    recordedAt: m.recordedAt ?? "", source: m.source)]
                : ordenados
            return CurvaDeFuerza(
                id: m.exerciseSlug,
                titulo: m.exerciseLabel,
                unidad: "kg",
                valores: serie.map(\.oneRmKg),
                desde: serie.count >= 2 ? StatsDateParser.parse(serie[serie.count - 2].recordedAt) : nil
            )
        }
    }

    /// Las series de la batería que miden fuerza.
    ///
    /// `yaEnLevantamientos` son los slugs que ya tienen curva de 1RM: un test de
    /// sentadilla escribe LAS DOS COSAS —una marca fechada y un 1RM versionado—,
    /// así que sin este descarte el atleta vería su sentadilla dos veces, con dos
    /// curvas del mismo hecho. Manda la del 1RM: es la que gobierna los
    /// porcentajes de su plan.
    static func tests(_ series: [BenchmarkSeries], yaEnLevantamientos: Set<String>) -> [CurvaDeFuerza] {
        series.compactMap { s in
            guard unidadesDeFuerza.contains(s.unit),
                  !yaEnLevantamientos.contains(s.exerciseSlug),
                  !s.results.isEmpty else { return nil }
            return CurvaDeFuerza(
                id: s.exerciseSlug,
                titulo: s.label,
                unidad: s.unit,
                valores: s.results.map(\.value),
                desde: s.results.count >= 2
                    ? StatsDateParser.parse(s.results[s.results.count - 2].recordedAt)
                    : nil
            )
        }
    }
}

// MARK: - El pintado

/// LOS DOS BLOQUES DE FUERZA, en la gramática de `AnaliticasCorrerView`: la
/// etiqueta en versalita, las filas separadas por aire, y ni una caja.
///
/// Son dos y no uno porque son dos actos distintos: un 1RM es el peso que mueves
/// —y el número con el que se te escribe el próximo entreno—, y un test de la
/// batería es una marca que se bate. Cuando uno de los dos no tiene nada, el
/// otro se sostiene solo.
struct BloquesDeFuerza: View {
    let levantamientos: [CurvaDeFuerza]
    let tests: [CurvaDeFuerza]

    /// ¿Hay algo que pintar? Lo pregunta la pantalla antes de decidir si la
    /// sección está vacía: con esto llena, no lo está.
    var hayAlgo: Bool { !levantamientos.isEmpty || !tests.isEmpty }

    var body: some View {
        // El mismo reparto que la pantalla hermana: `xl` dentro de un grupo,
        // `xxxl` entre grupos. Se agrupa con aire, nunca con una raya.
        VStack(alignment: .leading, spacing: Theme.Spacing.xxxl) {
            if !levantamientos.isEmpty {
                BloqueDeLectura(etiqueta: "Cuánto levantas") {
                    filas(levantamientos)
                }
            }
            if !tests.isEmpty {
                BloqueDeLectura(etiqueta: "Tus tests de fuerza") {
                    filas(tests)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func filas(_ curvas: [CurvaDeFuerza]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
            ForEach(curvas) { FilaDeFuerza(curva: $0) }
        }
        .padding(.top, Theme.Spacing.xs)
    }
}

/// Un levantamiento: qué es, cuánto vale hoy con cuánto ha subido y desde
/// cuándo, y su curva debajo A TODO EL ANCHO.
///
/// La curva NO va en una columna estrecha al lado de la cifra, y no es una
/// preferencia: en 104 pt la línea y su fantasma quedan a cuatro píxeles el uno
/// del otro, y lo único que esta pantalla tiene que enseñar es justo esa
/// distancia. Además, apretar cifra + delta + ventana + gráfico en una sola
/// línea partía «+7,5 kg» en dos. A todo el ancho la lectura cabe entera y la
/// mejora se ve — que es el trato de la pantalla hermana.
private struct FilaDeFuerza: View {
    let curva: CurvaDeFuerza

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(curva.titulo)
                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .lineLimit(1)

            let lectura = BenchmarkDelta.split(unit: curva.unidad, value: curva.ultimo)
            CifraDeBloque(valor: lectura.cifra, unidad: lectura.unidad, tam: 28) {
                if let delta = curva.delta {
                    DeltaDeBloque(
                        mejor: curva.mejora,
                        valor: BenchmarkDelta.deltaLabel(unit: curva.unidad, delta: delta),
                        ventana: ventana
                    )
                }
            }

            if curva.tieneCurva {
                CurvaCompacta(
                    valores: curva.valores,
                    mejorEsMenor: BenchmarkDelta.lowerIsBetter(unit: curva.unidad)
                )
                .padding(.top, 2)
            } else {
                // §6.2 bis: el hueco se declara cuando hay un acto concreto
                // detrás. Una segunda medida es exactamente eso.
                Text("Repítelo y aquí sale tu curva")
                    .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(lecturaAccesible)
    }

    /// «desde 12 mar» — un delta sin su ventana miente por omisión. Sin fecha
    /// legible se dice lo único que se sabe: que es contra la medida anterior.
    private var ventana: String {
        guard let desde = curva.desde else { return "vs la anterior" }
        return "desde \(StatsDateParser.dayMonth(desde))"
    }

    private var lecturaAccesible: String {
        var partes = ["\(curva.titulo), \(BenchmarkDelta.valueLabel(unit: curva.unidad, value: curva.ultimo))"]
        if let delta = curva.delta {
            let cambio = BenchmarkDelta.deltaLabel(unit: curva.unidad, delta: delta)
            switch curva.mejora {
            case .some(true):  partes.append("mejora de \(cambio) \(ventana)")
            case .some(false): partes.append("empeora \(cambio) \(ventana)")
            case .none:        partes.append("sin cambio \(ventana)")
            }
        } else {
            partes.append("una sola medida, repítelo y aparecerá tu curva")
        }
        return partes.joined(separator: ". ")
    }
}
