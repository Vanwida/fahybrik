import XCTest
import SwiftUI
@testable import FAHYBRIK

// «DEL COACH», DIBUJADO — la bandeja y las piezas de los detalles.
//
// Hermana de `HubChatAnaliticasRenderTests`, y por lo mismo: no es una prueba de
// píxeles, es la prueba de que la pantalla se SOSTIENE en sus estados y el sitio
// de donde salen las capturas para mirarla sin una sesión viva.
//
// Los tres estados que importan: la semana en la que se rehace el plan (una
// pregunta que bloquea, dos tareas —una vencida—, un protocolo a medias, el foco
// y el briefing), la misma bandeja resuelta, y el atleta recién dado de alta.
//
// OJO con el arnés: `ImageRenderer` no dibuja `ScrollView`, así que se dibuja
// `ListaComunicados` —que es EXACTAMENTE lo que la pantalla mete dentro del
// scroll— y no la pantalla entera. Por eso la lista vive en su propia pieza.
final class ComunicadosRenderTests: XCTestCase {

    private static let lienzo = CGSize(width: 402, height: 900)
    /// Para la lista completa, que no cabe en una pantalla y se recorta.
    private static let lienzoLargo = CGSize(width: 402, height: 1500)

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    /// El «hoy» de los escenarios, fijo: una captura que cambia de aspecto según
    /// el día en que se saque no sirve para comparar nada.
    private static let hoy = FechaES.fecha("2026-08-09")!

    // MARK: - La bandeja

    @MainActor
    func testBandejaDeLaSemanaQueSeRehaceElPlan() {
        let imagen = render(
            ListaComunicados(
                bandeja: BandejaComunicados.agrupar(EscenariosComunicados.semanaFuerte),
                onAbrir: { _ in },
                onMarcarTarea: { _ in }
            ),
            nombre: "coach-bandeja-semana-fuerte",
            alto: Self.lienzoLargo.height
        )
        XCTAssertNotNil(imagen)
    }

    @MainActor
    func testBandejaAlDiaDiceQueEstaEnCalma() {
        let bandeja = BandejaComunicados.agrupar(EscenariosComunicados.alDia)
        XCTAssertTrue(bandeja.enCalma)
        let imagen = render(
            ListaComunicados(bandeja: bandeja, onAbrir: { _ in }, onMarcarTarea: { _ in }),
            nombre: "coach-bandeja-al-dia",
            alto: Self.lienzoLargo.height
        )
        XCTAssertNotNil(imagen)
    }

    /// El caso de diseño: el atleta recién dado de alta. Ni una tarjeta, y aun
    /// así con sujeto y con salida — la frontera con el chat se dice.
    @MainActor
    func testBandejaVaciaTieneSujetoYSalida() {
        let imagen = render(
            centrado {
                RedesignEmptyState(
                    symbol: "tray",
                    title: "Aquí no hay nada todavía",
                    message: "Cuando Pablo te publique un protocolo, una tarea o el porqué de tu plan, vivirá aquí. El día a día sigue en el chat.",
                    exit: .action(title: "Abrir el chat", perform: {}),
                    note: "Lo que se publica aquí lleva estado: Pablo ve si lo has hecho, no solo si lo has abierto."
                )
            },
            nombre: "coach-bandeja-vacia"
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - Los detalles

    @MainActor
    func testProtocoloPasosYAvance() {
        let p = EscenariosComunicados.protocolo(marcados: ["9101", "9102"])
        let imagen = render(
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                CabeceraComunicado(comunicado: p, onVolver: {}) {
                    MonoText(
                        text: "\(p.pasosHechos) de \(p.pasosMarcables.count)",
                        size: 13, weight: .bold, color: Theme.Color.muted
                    )
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    TituloComunicado(comunicado: p, tamano: 24)
                    BarraPasosProtocolo(hechos: p.pasosHechos, total: p.pasosMarcables.count)
                    CardSurface(padding: 0) {
                        VStack(spacing: 0) {
                            ForEach(Array(p.items.enumerated()), id: \.element.id) { i, paso in
                                if i > 0 {
                                    Hairline().padding(.leading, Theme.Spacing.l + 44 + Theme.Spacing.m)
                                }
                                FilaPasoProtocolo(
                                    paso: paso,
                                    hecho: p.markedItemIds.contains(paso.id),
                                    anchoMarca: 44,
                                    reservaCasilla: p.tienePasosMarcables,
                                    onTap: {}
                                )
                            }
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "coach-protocolo-a-medias"
        )
        XCTAssertNotNil(imagen)
    }

    /// Un protocolo de pura lectura: sin contador arriba, sin barra y sin CTA
    /// abajo. Pedirle que confirme lo que acaba de leer no mide nada.
    @MainActor
    func testProtocoloDeLecturaNoEnsenaAvanceNiCTA() {
        let p = EscenariosComunicados.protocoloDeLectura
        XCTAssertFalse(p.tienePasosMarcables)
        XCTAssertFalse(p.puedeMarcarseHecho)
        let imagen = render(
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                CabeceraComunicado(comunicado: p, onVolver: {}) {
                    InsigniaComunicado(insignia: p.insignia(hoy: Self.hoy))
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    TituloComunicado(comunicado: p, tamano: 24)
                    CuerpoComunicado(texto: p.body, tamano: 13.5)
                    if let cierre = p.finalNote {
                        CardSurface(leftAccent: true) {
                            VStack(alignment: .leading, spacing: 6) {
                                LabelText(text: "Nota de \(p.nombreCoach)", size: 9.5)
                                Text(cierre)
                                    .scaledFont(13, relativeTo: .footnote)
                                    .foregroundStyle(Theme.Color.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "coach-protocolo-lectura"
        )
        XCTAssertNotNil(imagen)
    }

    @MainActor
    func testPreguntaConSusConsecuencias() {
        let p = EscenariosComunicados.pregunta()
        let imagen = render(
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                CabeceraComunicado(comunicado: p, onVolver: {}) {
                    InsigniaComunicado(insignia: p.insignia(hoy: Self.hoy))
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    TituloComunicado(comunicado: p)
                    CuerpoComunicado(texto: p.body)
                    AvisoComunicado(
                        texto: "Mientras no lo digas, Pablo deja esta parte del plan a la espera."
                    )
                    VStack(spacing: Theme.Spacing.m) {
                        ForEach(p.items) { opcion in
                            OpcionPreguntaCard(
                                opcion: opcion, elegida: false, apagada: false, onTap: {}
                            )
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "coach-pregunta"
        )
        XCTAssertNotNil(imagen)
    }

    @MainActor
    func testNotaPorSecciones() {
        let n = EscenariosComunicados.nota
        let imagen = render(
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                CabeceraComunicado(comunicado: n, onVolver: {}) {
                    InsigniaComunicado(insignia: n.insignia(hoy: Self.hoy))
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    TituloComunicado(comunicado: n)
                    CuerpoComunicado(texto: n.body, tamano: 13.5)
                    ForEach(n.items) { seccion in
                        CardSurface {
                            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                                if let etiqueta = seccion.label {
                                    LabelText(text: etiqueta, size: 10)
                                    Hairline()
                                }
                                Text(seccion.content)
                                    .scaledFont(14, relativeTo: .callout)
                                    .foregroundStyle(Theme.Color.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "coach-nota"
        )
        XCTAssertNotNil(imagen)
    }

    /// LA NOTA COMPLETA — las cuatro formas y el pie que la cierra.
    ///
    /// Es el caso de diseño: el porqué en prosa, la banda del objetivo en mono,
    /// el reparto de la semana en barra, las once semanas en espina, y abajo la
    /// pregunta de la que depende. Se dibuja `CuerpoDeLaNota`, que es LO QUE SE
    /// ENVÍA — no una copia del montaje.
    @MainActor
    func testNotaConSusCuatroFormasYSuPie() {
        let n = EscenariosComunicados.notaConFormas()
        XCTAssertEqual(n.seccionesVisibles.map(\.forma), [.texto, .cifra, .reparto, .camino])
        let imagen = render(
            VStack(alignment: .leading, spacing: 0) {
                CabeceraComunicado(comunicado: n, onVolver: {}) {
                    InsigniaComunicado(insignia: n.insignia(hoy: Self.hoy))
                }
                CuerpoDeLaNota(comunicado: n)
                Spacer(minLength: 0)
            },
            nombre: "coach-nota-formas",
            alto: Self.lienzoLargo.height
        )
        XCTAssertNotNil(imagen)
    }

    /// La misma nota con la pregunta ya contestada: el pie no desaparece, pasa a
    /// ser el recibo de lo que decidió.
    @MainActor
    func testNotaConElPieYaResuelto() {
        let n = EscenariosComunicados.notaConFormas(enlaceResuelto: true)
        XCTAssertEqual(n.linked?.linea, "Ya la contestaste.")
        let imagen = render(
            VStack(alignment: .leading, spacing: 0) {
                CuerpoDeLaNota(comunicado: n)
                Spacer(minLength: 0)
            },
            nombre: "coach-nota-formas-resuelta",
            alto: Self.lienzoLargo.height
        )
        XCTAssertNotNil(imagen)
    }

    /// LA ESPINA SOLA, que es la pieza que se va a reutilizar en la vista de un
    /// ciclo: el color dice de qué tramo es cada nodo, el relleno dice qué rompe
    /// la rutina y el anillo dice dónde estás.
    @MainActor
    func testEspinaDelPlan() {
        let imagen = render(
            VStack(alignment: .leading) {
                EspinaDelPlan(camino: EscenariosComunicados.camino)
                    .padding(Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "plan-espina"
        )
        XCTAssertNotNil(imagen)
    }

    /// La misma espina en CLARO. El doble sólo se ha mirado en oscuro, pero la
    /// app sigue la apariencia del sistema: el tono del primer tramo no puede
    /// ser el naranja de marca cuando se escribe, porque sobre lienzo blanco no
    /// llega a 4,5:1. Esta captura es la que enseña que sí se lee.
    @MainActor
    func testEspinaDelPlanEnClaro() {
        let imagen = render(
            VStack(alignment: .leading) {
                EspinaDelPlan(camino: EscenariosComunicados.camino)
                    .padding(Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "plan-espina-claro",
            esquema: .light
        )
        XCTAssertNotNil(imagen)
    }

    /// Sin plan asignado el camino llega nulo, y entonces esa sección NO se
    /// pinta: ni tarjeta ni hueco. La nota se queda con las otras tres.
    @MainActor
    func testNotaSinPlan_noDejaElHuecoDelCamino() {
        let n = EscenariosComunicados.notaConFormas(conCamino: false)
        XCTAssertEqual(n.items.count, 4)
        XCTAssertEqual(n.seccionesVisibles.map(\.forma), [.texto, .cifra, .reparto])
        let imagen = render(
            VStack(alignment: .leading, spacing: 0) {
                CuerpoDeLaNota(comunicado: n)
                Spacer(minLength: 0)
            },
            nombre: "coach-nota-sin-plan",
            alto: Self.lienzoLargo.height
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - El feedback

    /// EL FEEDBACK ENTERO — que por debajo es una nota y nada más: la gráfica con
    /// los dos tramos que el coach marcó, su voz encima, y lo que ve escrito.
    ///
    /// Es el caso de diseño de la tanda: si esto no se sostiene en 402 puntos de
    /// ancho, el feedback no existe en el móvil por muy bien que se marque en el
    /// escritorio.
    @MainActor
    func testNotaDeFeedbackConSuGraficaYSuVoz() {
        let n = EscenariosComunicados.notaDeFeedback()
        XCTAssertEqual(n.seccionesVisibles.map(\.forma), [.grafica, .texto])
        XCTAssertTrue(n.tieneAudio)
        let imagen = render(
            VStack(alignment: .leading, spacing: 0) {
                CabeceraComunicado(comunicado: n, onVolver: {}) {
                    InsigniaComunicado(insignia: n.insignia(hoy: Self.hoy))
                }
                CuerpoDeLaNota(comunicado: n)
                Spacer(minLength: 0)
            },
            nombre: "coach-nota-feedback",
            alto: Self.lienzoLargo.height
        )
        XCTAssertNotNil(imagen)
    }

    /// De este atleta todavía no hay una sola semana medida. La sección NO
    /// desaparece: enseña qué periodo miró el coach y por qué está en blanco.
    /// Ni un eje con rejilla vacía, ni un suelo de ceros, ni un hueco mudo.
    @MainActor
    func testNotaDeFeedbackSinSemanasMedidas_loDiceConPalabras() {
        let n = EscenariosComunicados.notaDeFeedback(
            grafica: EscenariosComunicados.graficaSinSemanas
        )
        XCTAssertEqual(n.seccionesVisibles.map(\.forma), [.grafica, .texto])
        XCTAssertTrue(EscenariosComunicados.graficaSinSemanas.estaVacia)
        let imagen = render(
            VStack(alignment: .leading, spacing: 0) {
                CuerpoDeLaNota(comunicado: n)
                Spacer(minLength: 0)
            },
            nombre: "coach-nota-feedback-vacia"
        )
        XCTAssertNotNil(imagen)
    }

    /// Y una sección que NO es una gráfica (llega nula) se salta entera: ahí no
    /// hay ni dibujo ni nada que explicar.
    @MainActor
    func testNotaDeFeedbackConSeccionQueNoEsGrafica_noDejaHueco() {
        let n = EscenariosComunicados.notaDeFeedback(grafica: nil)
        XCTAssertEqual(n.items.count, 2)
        XCTAssertEqual(n.seccionesVisibles.map(\.forma), [.texto])
        let imagen = render(
            VStack(alignment: .leading, spacing: 0) {
                CuerpoDeLaNota(comunicado: n)
                Spacer(minLength: 0)
            },
            nombre: "coach-nota-feedback-sin-grafica"
        )
        XCTAssertNotNil(imagen)
    }

    /// Sin voz, ni fila de reproductor ni hueco donde iría.
    @MainActor
    func testNotaDeFeedbackSinVoz_noPintaElReproductor() {
        let n = EscenariosComunicados.notaDeFeedback(conAudio: false)
        XCTAssertFalse(n.tieneAudio)
        let imagen = render(
            VStack(alignment: .leading, spacing: 0) {
                CuerpoDeLaNota(comunicado: n)
                Spacer(minLength: 0)
            },
            nombre: "coach-nota-feedback-sin-voz",
            alto: Self.lienzoLargo.height
        )
        XCTAssertNotNil(imagen)
    }

    /// LA GRÁFICA SOLA, que es la pieza que se va a reutilizar en sus Analíticas:
    /// veinticuatro semanas apiladas, el hueco de la que no se midió, el gris
    /// rayado de lo que no se pudo repartir y los rangos del coach debajo.
    @MainActor
    func testGraficaDeZonas() {
        let imagen = render(
            VStack(alignment: .leading) {
                CardSurface {
                    ZonasSemanaView(grafica: EscenariosComunicados.graficaDeZonas)
                }
                .padding(Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "zonas-semanas"
        )
        XCTAssertNotNil(imagen)
    }

    /// La misma gráfica en CLARO. La escala de zonas se oscurece para el lienzo
    /// blanco (`HRZone.color`), y esta captura es la que enseña que las cinco
    /// bandas siguen distinguiéndose entre ellas y del gris rayado.
    @MainActor
    func testGraficaDeZonasEnClaro() {
        let imagen = render(
            VStack(alignment: .leading) {
                CardSurface {
                    ZonasSemanaView(grafica: EscenariosComunicados.graficaDeZonas)
                }
                .padding(Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "zonas-semanas-claro",
            esquema: .light
        )
        XCTAssertNotNil(imagen)
    }

    /// Una ventana corta con la mitad de las semanas sin medir: el hueco NO es un
    /// cero, y por eso no hay barra sino una marca fina bajo la base.
    @MainActor
    func testGraficaDeZonasConHuecos() {
        let g = GraficaDeZonas(
            weekStart: "2026-06-01", weeks: 8, modality: "run",
            weeksData: [
                SemanaEnZonas(weekStart: "2026-06-01", z1S: 1_800, z2S: 3_600, z3S: 900),
                SemanaEnZonas(weekStart: "2026-06-15", z1S: 600, z2S: 1_200, noHrS: 2_400),
                SemanaEnZonas(weekStart: "2026-07-06", z1S: 2_400, z2S: 5_400, z4S: 900),
            ],
            anchor: AnclaDeZonas(source: "from_age", lthrBpm: 154),
            ranges: []
        )
        XCTAssertEqual(g.semanasSinDato, 5)
        let imagen = render(
            VStack(alignment: .leading) {
                CardSurface {
                    ZonasSemanaView(grafica: g)
                }
                .padding(Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "zonas-semanas-huecos"
        )
        XCTAssertNotNil(imagen)
    }

    /// En la bandeja, lo que lleva voz lo dice sin abrirse: un glifo discreto y
    /// su duración, en la misma línea del ancla.
    @MainActor
    func testBandejaConVozEnLaTarjeta() {
        let bandeja = BandejaComunicados.agrupar(
            EscenariosComunicados.semanaFuerte + [EscenariosComunicados.notaDeFeedback()]
        )
        XCTAssertEqual(bandeja.notas.filter(\.tieneAudio).count, 1)
        let imagen = render(
            ListaComunicados(bandeja: bandeja, onAbrir: { _ in }, onMarcarTarea: { _ in }),
            nombre: "coach-bandeja-con-voz",
            alto: Self.lienzoLargo.height
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - Render

    @ViewBuilder
    private func centrado(@ViewBuilder _ vista: () -> some View) -> some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            vista()
            Spacer(minLength: 0)
        }
    }

    @MainActor
    private func render(
        _ vista: some View,
        nombre: String,
        alto: CGFloat? = nil,
        esquema: ColorScheme = .dark
    ) -> UIImage? {
        let renderer = ImageRenderer(
            content: ZStack {
                Theme.Color.background
                vista
            }
            .frame(width: Self.lienzo.width, height: alto ?? Self.lienzo.height)
            .environment(\.colorScheme, esquema)
        )
        renderer.scale = 3
        guard let imagen = renderer.uiImage else { return nil }

        if let png = imagen.pngData() {
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = nombre
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
            }
        }
        return imagen
    }
}
