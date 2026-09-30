import SwiftUI

// VO₂ MÁX — tu motor.
//
// El número llevaba meses llegando del reloj y el atleta no lo veía en ninguna pantalla: solo salía en el
// análisis corporal del entrenador. Esta pantalla es suya.
//
// Las cuatro reglas (docs/design/pantallas-que-ganan-su-altura.html):
//  1. SUJETO — el número. Grande, arriba, y nada compite con él. Ni el título ni la explicación.
//  2. EL HUECO SE GANA — con historia, el número y su curva llenan la pantalla; sin ella, el estado vacío
//     es el propio sujeto y ocupa el alto entero.
//  3. LA ACCIÓN ABAJO — «Probarme · Cooper 12 min» anclada, siempre a la vista.
//  4. LO SECUNDARIO SE PLIEGA — el VDOT de sus marcas es una fila con su fuente escrita, no una segunda
//     tarjeta que compita con el titular.
//
// LA COHERENCIA, que es lo delicado: hay DOS números de la misma familia y no valen lo mismo. Manda el del
// reloj (llega solo y es el que la gente reconoce de Apple y Garmin); el VDOT de sus marcas va debajo,
// etiquetado. NUNCA se promedian. La regla la decide el servidor (web/lib/athlete/vo2max.ts), no esta
// vista, para que ninguna otra pantalla pueda contradecirla.
//
// La vista se parte en CONTENEDOR (pide el dato y lleva a Cooper) y `Vo2MaxCuerpo` (pinta un estado ya
// resuelto), para montarla con datos de ejemplo en las `#Preview` y en la galería.

struct Vo2MaxView: View {
    let bearer: String?
    var hrZones: HRZoneProfile? = nil

    /// `nil` dentro de `.datos` = «nadie lo ha medido todavía»: una respuesta, no un fallo.
    @State private var carga: CargaDePantallaPerfil<AthleteVo2Max?> = .cargando
    /// Una sola salida hacia el Cooper, compartida por la acción anclada y por la del estado vacío: el destino
    /// se declara una vez.
    @State private var goToCooper = false

    var body: some View {
        Vo2MaxCuerpo(
            carga: carga,
            alProbarCooper: { goToCooper = true },
            alReintentar: { Task { await load() } }
        )
        .navigationDestination(isPresented: $goToCooper) {
            MarkDetailView(slug: Vo2MaxCuerpo.cooperSlug, bearer: bearer, hrZones: hrZones)
        }
        .task { await load() }
    }

    private func load() async {
        if case .error = carga { carga = .cargando }
        do {
            carga = .datos(try await Vo2MaxService.fetch(bearer: bearer))
        } catch {
            carga = .error
        }
    }
}

/// Lo que se pinta de «VO₂ máx» con el estado ya resuelto.
struct Vo2MaxCuerpo: View {
    let carga: CargaDePantallaPerfil<AthleteVo2Max?>
    var alProbarCooper: () -> Void = {}
    var alReintentar: () -> Void = {}

    /// El Cooper vive en su ficha de marca, que ya sabe pedir calle/cinta, enseñar el récord a batir y lanzar la
    /// sesión. Empujar allí es una sola verdad; un segundo lanzador aquí sería la misma lógica escrita dos veces.
    static let cooperCTA = "Probarme · Cooper 12 min"
    /// Slug canónico del catálogo (shared/domain/coach/benchmark-slugs.ts).
    static let cooperSlug = "cooper_12min"

    var body: some View {
        switch carga {
        case .cargando:
            PantallaPerfil(titulo: "VO₂ máx") { EsqueletoDelNumero() }
        case .error:
            PantallaPerfil(titulo: "VO₂ máx", alto: .llena) {
                ErrorDePantallaPerfil(kicker: "VO₂ máx", titulo: "No hemos podido cargarlo", apoyo: "Vuelve a intentarlo en un momento.", alReintentar: alReintentar)
            }
        case let .datos(datos):
            if let datos, let headline = datos.headline {
                PantallaPerfil(titulo: "VO₂ máx") {
                    SujetoDelNumero(headline: headline, baseline: datos.baseline)
                    if datos.series.count >= 2 { CurvaDelNumero(series: datos.series) }
                    if let vdot = datos.vdot { OtroNumeroDeLaFamilia(vdot: vdot, headline: headline) }
                    Que()
                } pie: {
                    AccionAncladaPerfil(titulo: Self.cooperCTA, accion: alProbarCooper)
                }
            } else {
                // Estado vacío CON salida: el Cooper de 12 minutos no es un consuelo, es la prueba de campo que
                // mide exactamente esto.
                PantallaPerfil(titulo: "VO₂ máx", alto: .llena) {
                    VacioDePantallaPerfil(
                        kicker: "VO₂ máx",
                        titulo: "Aún no tenemos tu VO₂ máx",
                        apoyo: "Tu reloj lo calcula solo cuando sales a correr fuera. Si no tienes uno compatible, el Cooper lo mide igual de bien: 12 minutos corriendo todo lo que puedas, y de la distancia sale tu número.",
                        accion: (Self.cooperCTA, .flecha, alProbarCooper)
                    )
                }
            }
        }
    }
}

// MARK: - 1 · El sujeto

/// El número, su unidad, cuánto se ha movido y de dónde sale. Nada más.
private struct SujetoDelNumero: View {
    let headline: Vo2MaxHeadline
    let baseline: Double?

    var body: some View {
        let cambio = Vo2Texto.cambio(ultimo: headline.value, baseline: baseline)
        let fuente = Vo2Texto.fuente(headline)
        SujetoDia(
            tono: .neutro,
            etiqueta: "VO2 máximo \(Formato.esDecimal(headline.value)) mililitros por kilo y minuto. \(cambio?.texto ?? ""). \(fuente)"
        ) {
            KickerDia("Tu motor")
            HStack(alignment: .lastTextBaseline, spacing: Theme.Spacing.s) {
                Text(Formato.esDecimal(headline.value)).papel(.cuenta)
                Text("ml/kg·min").papel(.notaFuerte)
            }
            .foregroundStyle(Theme.Color.foreground)
            if let cambio {
                InfoPill(text: cambio.texto, estilo: cambio.mejora ? .acento : .neutro, glifo: cambio.mejora ? .sube : nil)
            }
            ApoyoDia(fuente)
        }
    }
}

// MARK: - 2 · La curva

private struct CurvaDelNumero: View {
    let series: [Vo2MaxPoint]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Últimos 3 meses")
            AnaliticasGraficoLineas(
                series: [SerieDeLinea(
                    id: "vo2", etiqueta: "VO₂ máx",
                    puntos: series.map { PuntoDeSerie(t: $0.isoDate, v: $0.value) },
                    color: Theme.Color.familiaCorrer, rotuloFinal: true
                )],
                formatoY: { Formato.esDecimal($0) },
                leyenda: false
            )
            .padding(Theme.Spacing.l)
            .frame(maxWidth: .infinity)
            .tarjetaPerfil()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Vo2Texto.resumenDeLaCurva(series))
        }
    }
}

// MARK: - 3 · El otro número de la familia

/// El VDOT que sale de sus marcas. Va DEBAJO y con su fuente escrita: no es una segunda medida del mismo
/// número, es un modelo de ritmo que comparte unidades. Decirlo aquí es lo que evita que dos cifras distintas
/// de la misma familia se lean como un fallo.
private struct OtroNumeroDeLaFamilia: View {
    let vdot: Vo2MaxVdot
    let headline: Vo2MaxHeadline

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Según tus marcas") {
                Text(Formato.esDecimal(vdot.value)).papel(.dato).foregroundStyle(Theme.Color.foreground)
            }
            NotaPerfil("Tu VDOT, estimado con tu \(vdot.markLabel). \(Vo2Texto.quienMide(headline)) lo mide de otra manera, así que los dos números no coinciden — y ninguno corrige al otro.")
        }
        .accessibilityElement(children: .combine)
    }
}

private struct Que: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Qué es")
            Text("El oxígeno máximo que tu cuerpo puede usar por minuto. Es el techo de tu motor aeróbico: cuanto más alto, más rato aguantas a ritmos altos. Se mueve con semanas de trabajo, no con un entreno.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Cargando

/// El esqueleto con la forma de lo que llega: el sujeto y, debajo, la curva.
private struct EsqueletoDelNumero: View {
    var body: some View {
        VStack(alignment: .leading, spacing: PantallaPerfil<EmptyView, EmptyView>.entreBloques) {
            SujetoDia(tono: .neutro, etiqueta: "Cargando tu VO₂ máx") {
                SkeletonBar(width: 96, height: 15, radius: 5).frame(minHeight: 32)
                SkeletonBar(width: 190, height: 80, radius: 12)
                SkeletonBar(height: 17, radius: 6).frame(maxWidth: 260)
            }
            SkeletonBar(width: 200, height: 24, radius: 8)
            SkeletonBar(height: 190, radius: Theme.Radius.tarjeta)
        }
    }
}

// MARK: - Textos (puros)

/// Lo que dice la pantalla, sin pintarla: así se comprueba sin montar una vista.
enum Vo2Texto {
    static func fuente(_ headline: Vo2MaxHeadline) -> String {
        switch headline.source {
        case .watch:  return "Lo mide tu reloj · \(fechaCorta(headline.measuredOn))"
        case .cooper: return "De tu Cooper de 12 min · \(fechaCorta(headline.measuredOn))"
        }
    }

    static func quienMide(_ headline: Vo2MaxHeadline) -> String {
        headline.source == .watch ? "El reloj" : "El Cooper"
    }

    /// «+0,7 vs tu media de 3 meses». Nil cuando no hay base con la que comparar o cuando el movimiento no llega a
    /// una décima: no se inventa una flecha.
    static func cambio(ultimo: Double, baseline: Double?) -> (texto: String, mejora: Bool)? {
        guard let baseline else { return nil }
        let delta = (ultimo - baseline).redondeado(a: 1)
        guard abs(delta) >= 0.1 else { return ("En tu media de 3 meses", false) }
        let signo = delta > 0 ? "+" : "\u{2212}"
        return ("\(signo)\(Formato.esDecimal(abs(delta))) vs tu media de 3 meses", delta > 0)
    }

    static func resumenDeLaCurva(_ series: [Vo2MaxPoint]) -> String {
        guard let first = series.first, let last = series.last else { return "Sin curva" }
        return "Últimos 3 meses: de \(Formato.esDecimal(first.value)) a \(Formato.esDecimal(last.value))."
    }

    /// «28 jul» a partir de un día ISO local del atleta (sin aritmética de zonas).
    static func fechaCorta(_ iso: String) -> String {
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
    func redondeado(a decimales: Int) -> Double {
        let factor = pow(10.0, Double(decimales))
        return (self * factor).rounded() / factor
    }
}
