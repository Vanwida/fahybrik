import SwiftUI

// VO₂ MÁX — tu motor.
//
// El número llevaba meses llegando del reloj y el atleta no lo veía en ninguna
// pantalla: sólo salía en el análisis corporal del entrenador. Esta pantalla es
// suya.
//
// Las cuatro reglas (docs/design/pantallas-que-ganan-su-altura.html):
//  1. SUJETO — el número. Grande, arriba, y nada compite con él. Ni el título
//     (vive en la barra de navegación) ni la explicación.
//  2. EL HUECO SE GANA — con historia, el número y su curva llenan la pantalla;
//     sin ella, el contenido se centra y el estado vacío ocupa el alto entero.
//  3. LA ACCIÓN ABAJO — «Probarme · Cooper 12 min» anclada, siempre a la vista.
//  4. LO SECUNDARIO SE PLIEGA — el VDOT de sus marcas es una fila con su fuente
//     escrita, no una segunda tarjeta que compita con el titular.
//
// LA COHERENCIA, que es lo delicado: hay DOS números de la misma familia y no
// valen lo mismo. Manda el del reloj (llega solo y es el que la gente reconoce
// de Apple y Garmin); el VDOT de sus marcas va debajo, etiquetado. NUNCA se
// promedian. La regla la decide el servidor (web/lib/athlete/vo2max.ts), no esta
// vista, para que ninguna otra pantalla pueda contradecirla.

struct Vo2MaxView: View {
    let bearer: String?
    var hrMaxSource: HRMaxSource? = nil

    @State private var data: AthleteVo2Max? = nil
    @State private var loading = true
    @State private var failed = false
    /// Una sola salida hacia el Cooper, compartida por la acción anclada y por la
    /// del estado vacío — el destino se declara una vez.
    @State private var goToCooper = false

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            content
        }
        .navigationTitle("VO₂ máx")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $goToCooper) {
            MarkDetailView(slug: Self.cooperSlug, bearer: bearer, hrMaxSource: hrMaxSource)
        }
        .task { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            CenteredScreen { ProgressView().tint(Theme.Color.muted) }
        } else if let data, let headline = data.headline {
            measured(headline: headline, data: data)
        } else {
            noNumberYet
        }
    }

    // MARK: - 1 · El sujeto y su historia

    private func measured(headline: Vo2MaxHeadline, data: AthleteVo2Max) -> some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.xl) {
                hero(headline: headline, baseline: data.baseline)
                if data.series.count >= 2 {
                    trend(data.series)
                }
                if let vdot = data.vdot {
                    alsoInYourNumbers(vdot: vdot, headline: headline)
                }
                whatItMeans
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.l)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .anchoredAction {
            ExpertPrimaryButton(title: Self.cooperCTA.uppercased()) { goToCooper = true }
        }
    }

    /// El número, su unidad, cuánto se ha movido y de dónde sale. Nada más.
    private func hero(headline: Vo2MaxHeadline, baseline: Double?) -> some View {
        VStack(spacing: Theme.Spacing.s) {
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                HeroNumber(text: esDecimal(headline.value), size: 88)
                Text("ml/kg·min")
                    .scaledFont(12, weight: .semibold, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .padding(.bottom, 12)
            }
            if let chip = deltaChip(latest: headline.value, baseline: baseline) {
                Text(chip.text)
                    .scaledFont(12, weight: .semibold, relativeTo: .caption)
                    .foregroundStyle(chip.improving ? Theme.Color.ok : Theme.Color.muted)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Theme.Color.surfaceSunken)
                    .clipShape(Capsule())
            }
            Text(sourceLine(headline))
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.faint)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "VO2 máximo \(esDecimal(headline.value)) mililitros por kilo y minuto. "
            + "\(deltaChip(latest: headline.value, baseline: baseline)?.text ?? ""). \(sourceLine(headline))"
        )
    }

    // MARK: - 2 · La curva

    private func trend(_ series: [Vo2MaxPoint]) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            LabelText(text: "Últimos 3 meses")
            LineSeriesChart(
                points: chartPoints(series),
                axis: chartAxis(series),
                axLabel: trendAxLabel(series)
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - 3 · El otro número de la familia

    /// El VDOT que sale de sus marcas. Va DEBAJO y con su fuente escrita: no es
    /// una segunda medida del mismo número, es un modelo de ritmo que comparte
    /// unidades. Decirlo aquí es lo que evita que dos cifras distintas de la
    /// misma familia se lean como un fallo.
    private func alsoInYourNumbers(vdot: Vo2MaxVdot, headline: Vo2MaxHeadline) -> some View {
        CardSurface(padding: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Según tus marcas")
                        .scaledFont(14, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                    Spacer(minLength: 8)
                    Text(esDecimal(vdot.value))
                        .font(.system(size: 22, weight: .heavy, design: .default).monospacedDigit())
                        .italic()
                        .foregroundStyle(Theme.Color.foreground)
                }
                Text("Tu VDOT, estimado con tu \(vdot.markLabel). \(headlineNoun(headline)) lo mide de otra manera, así que los dos números no coinciden — y ninguno corrige al otro.")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var whatItMeans: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelText(text: "Qué es")
            Text("El oxígeno máximo que tu cuerpo puede usar por minuto. Es el techo de tu motor aeróbico: cuanto más alto, más rato aguantas a ritmos altos. Se mueve con semanas de trabajo, no con un entreno.")
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - 4 · Sin número todavía

    /// Estado vacío CON salida: el Cooper de 12 minutos no es un consuelo, es la
    /// prueba de campo que mide exactamente esto.
    private var noNumberYet: some View {
        CenteredScreen {
            RedesignEmptyState(
                symbol: failed ? "arrow.clockwise" : "lungs.fill",
                title: failed ? "No hemos podido cargarlo" : "Aún no tenemos tu VO₂ máx",
                message: failed
                    ? "Vuelve a intentarlo en un momento."
                    : "Tu reloj lo calcula solo cuando sales a correr fuera. Si no tienes uno compatible, el Cooper lo mide igual de bien: 12 minutos corriendo todo lo que puedas, y de la distancia sale tu número.",
                exit: failed
                    ? .action(title: "Reintentar", perform: { Task { await load() } })
                    : .action(title: Self.cooperCTA, perform: { goToCooper = true })
            )
        }
    }

    // MARK: - Cooper

    /// El Cooper vive en su ficha de marca, que ya sabe pedir calle/cinta, enseñar
    /// el récord a batir y lanzar la sesión. Empujar allí es una sola verdad; un
    /// segundo lanzador aquí sería la misma lógica escrita dos veces.
    private static let cooperCTA = "Probarme · Cooper 12 min"
    /// Slug canónico del catálogo (shared/domain/coach/benchmark-slugs.ts).
    private static let cooperSlug = "cooper_12min"

    // MARK: - Load

    private func load() async {
        loading = true
        failed = false
        do {
            data = try await Vo2MaxService.fetch(bearer: bearer)
        } catch {
            data = nil
            failed = true
        }
        loading = false
    }

    // MARK: - Presentation helpers

    private func sourceLine(_ headline: Vo2MaxHeadline) -> String {
        switch headline.source {
        case .watch:  return "Lo mide tu reloj · \(shortDate(headline.measuredOn))"
        case .cooper: return "De tu Cooper de 12 min · \(shortDate(headline.measuredOn))"
        }
    }

    private func headlineNoun(_ headline: Vo2MaxHeadline) -> String {
        headline.source == .watch ? "El reloj" : "El Cooper"
    }

    /// «+0,7 vs tu media de 3 meses». Nil cuando no hay base con la que comparar
    /// o cuando el movimiento no llega a una décima — no se inventa una flecha.
    private func deltaChip(latest: Double, baseline: Double?) -> (text: String, improving: Bool)? {
        guard let baseline else { return nil }
        let delta = (latest - baseline).rounded(toPlaces: 1)
        guard abs(delta) >= 0.1 else { return ("En tu media de 3 meses", false) }
        let sign = delta > 0 ? "+" : "\u{2212}"
        return ("\(sign)\(esDecimal(abs(delta))) vs tu media de 3 meses", delta > 0)
    }

    private func chartPoints(_ series: [Vo2MaxPoint]) -> [CardSeriesPoint] {
        let values = series.map(\.value)
        let lo = values.min() ?? 0
        let hi = values.max() ?? 0
        let span = hi - lo
        return series.enumerated().map { index, point in
            CardSeriesPoint(
                id: point.isoDate,
                // Sin recorrido (todo el tramo idéntico) la línea va centrada, que
                // es la verdad: no se ha movido.
                height: span > 0 ? (point.value - lo) / span : 0.5,
                display: esDecimal(point.value),
                current: index == series.count - 1,
                label: nil
            )
        }
    }

    private func chartAxis(_ series: [Vo2MaxPoint]) -> CardSeriesAxis? {
        let values = series.map(\.value)
        guard let lo = values.min(), let hi = values.max(), hi > lo else { return nil }
        return CardSeriesAxis(min_display: esDecimal(lo), max_display: esDecimal(hi))
    }

    private func trendAxLabel(_ series: [Vo2MaxPoint]) -> String {
        guard let first = series.first, let last = series.last else { return "Sin curva" }
        return "Últimos 3 meses: de \(esDecimal(first.value)) a \(esDecimal(last.value))."
    }

    /// «42,4» — coma decimal, una cifra, y sin decimal cuando es redondo.
    private func esDecimal(_ v: Double) -> String {
        if v == v.rounded() { return String(Int(v)) }
        return String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",")
    }

    /// «28 jul» a partir de un día ISO local del atleta (sin aritmética de zonas).
    private func shortDate(_ iso: String) -> String {
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        parser.timeZone = TimeZone(identifier: "UTC")
        guard let date = parser.date(from: iso) else { return iso }
        let out = DateFormatter()
        out.locale = Locale(identifier: "es_ES")
        out.timeZone = TimeZone(identifier: "UTC")
        out.dateFormat = "d MMM"
        return out.string(from: date)
    }
}

private extension Double {
    func rounded(toPlaces places: Int) -> Double {
        let factor = pow(10.0, Double(places))
        return (self * factor).rounded() / factor
    }
}
