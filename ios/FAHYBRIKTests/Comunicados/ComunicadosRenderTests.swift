import XCTest
import SwiftUI
@testable import FAHYBRIK

// «DEL COACH», DIBUJADO — la bandeja, sus cuatro estados y los cinco detalles, en «El día».
//
// No es una prueba de píxeles: es la prueba de que cada pantalla SE SOSTIENE en sus estados y el sitio de
// donde salen las capturas para mirarla sin una sesión viva. Cada una se saca en claro y en oscuro, con el
// acento de fábrica y con un club azul (un componente que lleva el naranja clavado solo se ve mal cuando un
// coach elige otro color).
//
// Se montan en una VENTANA de verdad (`CapturaVentana`): `ImageRenderer` no dibuja `ScrollView` ni respeta
// cómo reparte el alto un `FillingScreen`, y la altura es justo lo que se mira aquí. Lo que se dibuja es LO
// QUE SE ENVÍA (`ContenidoBandeja`, `ComunicadoXxxContenido`), no una reconstrucción del montaje.
final class ComunicadosRenderTests: XCTestCase {

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    /// El «hoy» de los escenarios, fijo: una captura que cambia de aspecto según el día en que se saque no
    /// sirve para comparar nada.
    private static let hoy = FechaES.fecha("2026-08-09")!

    // MARK: - La galería

    /// Una pantalla en sus cuatro caras: claro y oscuro, acento de fábrica y club azul.
    @MainActor
    private func galeria<V: View>(_ nombre: String, alto: CGFloat = 874, entera: Bool = false, _ vista: @autoclosure () -> V) {
        for (apariencia, oscuro) in [("claro", false), ("oscuro", true)] {
            let acentos: [(String, ClubTheme?)] = [("fabrica", nil), ("azul", ClubTheme.pruebaAzul)]
            for (acento, club) in acentos {
                let png = CapturaVentana.png(
                    ZStack { Theme.Color.background.ignoresSafeArea(); vista() },
                    alto: alto, oscuro: oscuro, club: club, entera: entera
                )
                CapturaVentana.guarda(png, nombre: "\(nombre)-\(apariencia)-\(acento)", en: self)
            }
        }
    }

    /// El texto más grande que admite el sistema: donde se rompen los layouts que no se pensaron.
    @MainActor
    private func enTextoGrande<V: View>(_ nombre: String, alto: CGFloat = 874, entera: Bool = true, _ vista: @autoclosure () -> V) {
        let png = CapturaVentana.png(
            ZStack { Theme.Color.background.ignoresSafeArea(); vista() },
            alto: alto, tamano: .accessibility3, entera: entera
        )
        CapturaVentana.guarda(png, nombre: "\(nombre)-claro-fabrica-ax3", en: self)
    }

    private func bandeja(_ estado: EstadoBandeja) -> some View {
        ContenidoBandeja(
            estado: estado, nombreCoach: "Pablo", revelado: true,
            alCerrar: {}, alAbrir: { _ in }, alMarcarTarea: { _ in }, alAbrirChat: {}, alRecargar: {}
        )
    }

    // MARK: - La bandeja

    @MainActor
    func testBandejaDeLaSemanaQueSeRehaceElPlan() {
        let b = BandejaComunicados.agrupar(EscenariosComunicados.semanaFuerte)
        XCTAssertFalse(b.enCalma)
        galeria("bandeja-semana-fuerte", entera: true, bandeja(.conCosas(b)))
        enTextoGrande("bandeja-semana-fuerte", bandeja(.conCosas(b)))
    }

    @MainActor
    func testBandejaAlDiaDiceQueEstaEnCalma() {
        let b = BandejaComunicados.agrupar(EscenariosComunicados.alDia)
        XCTAssertTrue(b.enCalma)
        galeria("bandeja-al-dia", entera: true, bandeja(.conCosas(b)))
    }

    /// El caso de diseño: el atleta recién dado de alta. Ni una fila, y aun así con sujeto y con salida.
    @MainActor
    func testBandejaVaciaTieneSujetoYSalida() {
        galeria("bandeja-vacia", bandeja(.vacia))
        enTextoGrande("bandeja-vacia", bandeja(.vacia))
    }

    @MainActor
    func testBandejaCargandoTieneLaFormaDeLoQueLlega() {
        galeria("bandeja-cargando", bandeja(.cargando))
    }

    @MainActor
    func testBandejaConErrorLoDiceYOfreceReintentar() {
        galeria("bandeja-error", bandeja(.error))
    }

    /// En la bandeja, lo que lleva voz lo dice sin abrirse: un glifo discreto y su duración, en la misma
    /// línea del ancla.
    @MainActor
    func testBandejaConVozEnLaFila() {
        let b = BandejaComunicados.agrupar(EscenariosComunicados.semanaFuerte + [EscenariosComunicados.notaDeFeedback()])
        XCTAssertEqual(b.notas.filter(\.tieneAudio).count, 1)
        galeria("bandeja-con-voz", entera: true, bandeja(.conCosas(b)))
    }

    @MainActor
    func testComunicadoRetirado() {
        galeria("comunicado-retirado", ComunicadoRetirado(alVolver: {}))
    }

    // MARK: - Los detalles

    @MainActor
    func testPreguntaConSusConsecuencias() {
        let abierta = EscenariosComunicados.pregunta()
        galeria("pregunta-abierta", entera: true, pregunta(abierta))
        enTextoGrande("pregunta-abierta", pregunta(abierta))
        galeria("pregunta-respondida", entera: true, pregunta(EscenariosComunicados.pregunta(state: .respondido, answered: "9002")))
        galeria("pregunta-sin-conexion", entera: true, pregunta(abierta, envio: .enCola))
        galeria("pregunta-fallo", entera: true, pregunta(abierta, envio: .fallido("Tu coach ha retirado esto. Ya no hace falta que lo hagas.")))
    }

    @MainActor
    func testProtocoloPasosYAvance() {
        galeria("protocolo-sin-empezar", entera: true, protocolo(EscenariosComunicados.protocolo()))
        let aMedias = EscenariosComunicados.protocolo(marcados: ["9101", "9102"])
        XCTAssertEqual(aMedias.pasosHechos, 2)
        galeria("protocolo-a-medias", entera: true, protocolo(aMedias))
        enTextoGrande("protocolo-a-medias", protocolo(aMedias))
        var completo = EscenariosComunicados.protocolo(marcados: ["9101", "9102", "9104", "9105", "9106"])
        XCTAssertTrue(completo.protocoloCompleto)
        galeria("protocolo-completo", entera: true, protocolo(completo))
        completo.aplicarHecho()
        galeria("protocolo-cerrado", entera: true, protocolo(completo))
    }

    /// Un protocolo de pura lectura: sin contador arriba, sin regleta y sin CTA abajo. Pedirle que confirme
    /// lo que acaba de leer no mide nada.
    @MainActor
    func testProtocoloDeLecturaNoEnsenaAvanceNiCTA() {
        let p = EscenariosComunicados.protocoloDeLectura
        XCTAssertFalse(p.tienePasosMarcables)
        XCTAssertFalse(p.puedeMarcarseHecho)
        galeria("protocolo-lectura", entera: true, protocolo(p))
    }

    @MainActor
    func testTareaYFoco() {
        let abierta = EscenariosComunicados.semanaFuerte.first { $0.id == "103" }!
        galeria("tarea-abierta", tarea(abierta))
        galeria("tarea-hecha", tarea(EscenariosComunicados.alDia.first { $0.id == "103" }!))
        galeria("foco", ComunicadoFocoView(comunicado: EscenariosComunicados.foco, onVolver: {}))
    }

    // MARK: - La nota

    /// LA NOTA COMPLETA — las cuatro formas y el pie que la cierra: el porqué en prosa, la banda del objetivo
    /// en cifra, el reparto de la semana en barra, las once semanas en espina y, abajo, la pregunta de la que
    /// depende.
    @MainActor
    func testNotaConSusCuatroFormasYSuPie() {
        let n = EscenariosComunicados.notaConFormas()
        XCTAssertEqual(n.seccionesVisibles.map(\.forma), [.texto, .cifra, .reparto, .camino])
        galeria("nota-formas", entera: true, nota(n))
        enTextoGrande("nota-formas", nota(n))
    }

    /// La misma nota con la pregunta ya contestada: el pie no desaparece, pasa a ser el recibo de lo que
    /// decidió.
    @MainActor
    func testNotaConElPieYaResuelto() {
        let n = EscenariosComunicados.notaConFormas(enlaceResuelto: true)
        XCTAssertEqual(n.linked?.linea, "Ya la contestaste.")
        galeria("nota-formas-resuelta", entera: true, nota(n))
    }

    /// Sin plan asignado el camino llega nulo, y entonces esa sección NO se pinta: ni tarjeta ni hueco.
    @MainActor
    func testNotaSinPlan_noDejaElHuecoDelCamino() {
        let n = EscenariosComunicados.notaConFormas(conCamino: false)
        XCTAssertEqual(n.items.count, 4)
        XCTAssertEqual(n.seccionesVisibles.map(\.forma), [.texto, .cifra, .reparto])
        galeria("nota-sin-plan", entera: true, nota(n))
    }

    /// EL FEEDBACK ENTERO — que por debajo es una nota y nada más: la gráfica con los dos tramos que el
    /// coach marcó, su voz encima, y lo que ve escrito. Es el caso de diseño: si esto no se sostiene en 402
    /// puntos de ancho, el feedback no existe en el móvil por muy bien que se marque en el escritorio.
    @MainActor
    func testNotaDeFeedbackConSuGraficaYSuVoz() {
        let n = EscenariosComunicados.notaDeFeedback()
        XCTAssertEqual(n.seccionesVisibles.map(\.forma), [.grafica, .texto])
        XCTAssertTrue(n.tieneAudio)
        galeria("nota-feedback", entera: true, nota(n))
        enTextoGrande("nota-feedback", nota(n))
    }

    /// De este atleta todavía no hay una sola semana medida. La sección NO desaparece: enseña qué periodo
    /// miró el coach y por qué está en blanco.
    @MainActor
    func testNotaDeFeedbackSinSemanasMedidas_loDiceConPalabras() {
        let n = EscenariosComunicados.notaDeFeedback(grafica: EscenariosComunicados.graficaSinSemanas)
        XCTAssertEqual(n.seccionesVisibles.map(\.forma), [.grafica, .texto])
        XCTAssertTrue(EscenariosComunicados.graficaSinSemanas.estaVacia)
        galeria("nota-feedback-vacia", entera: true, nota(n))
    }

    /// Una sección que NO es una gráfica (llega nula) se salta entera; y sin voz, ni fila de reproductor ni
    /// hueco donde iría.
    @MainActor
    func testNotaDeFeedbackSinGraficaNiVoz_noDejaHuecos() {
        let sinGrafica = EscenariosComunicados.notaDeFeedback(grafica: nil)
        XCTAssertEqual(sinGrafica.items.count, 2)
        XCTAssertEqual(sinGrafica.seccionesVisibles.map(\.forma), [.texto])
        let sinVoz = EscenariosComunicados.notaDeFeedback(conAudio: false)
        XCTAssertFalse(sinVoz.tieneAudio)
        galeria("nota-feedback-sin-grafica", entera: true, nota(sinGrafica))
        galeria("nota-feedback-sin-voz", entera: true, nota(sinVoz))
    }

    // MARK: - Las zonas

    /// LA GRÁFICA SOLA, que es la pieza que se va a reutilizar en sus Analíticas: veinticuatro semanas
    /// apiladas, el hueco de la que no se midió, el gris rayado de lo que no se pudo repartir y los rangos
    /// del coach debajo. En claro y oscuro la escala de zonas cambia (`HRZone.color`).
    @MainActor
    func testGraficaDeZonas() {
        galeria("zonas-semanas", alto: 640, entera: true, tarjetaDeZonas(EscenariosComunicados.graficaDeZonas))
        enTextoGrande("zonas-semanas", alto: 640, tarjetaDeZonas(EscenariosComunicados.graficaDeZonas))
    }

    /// Una ventana corta con la mitad de las semanas sin medir: el hueco NO es un cero, y por eso no hay
    /// barra sino una marca fina bajo la base.
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
        galeria("zonas-huecos", alto: 520, tarjetaDeZonas(g))
    }

    @MainActor
    func testGraficaDeZonasVacia() {
        galeria("zonas-vacia", alto: 260, tarjetaDeZonas(EscenariosComunicados.graficaSinSemanas))
    }

    /// LA ESPINA SOLA (es de Plan, y la nota la incrusta): el color dice de qué tramo es cada nodo, el
    /// relleno dice qué rompe la rutina y el anillo dice dónde estás.
    @MainActor
    func testEspinaDentroDeLaNota() {
        galeria("espina-en-nota", alto: 560, entera: true, EspinaDelPlan(camino: EscenariosComunicados.camino).padding(Theme.Spacing.pantalla))
    }

    // MARK: - Los montajes

    private func pregunta(_ c: Comunicado, envio: EnvioComunicado = .ok) -> some View {
        ComunicadoPreguntaContenido(comunicado: c, envio: envio, onVolver: {}, onResponder: { _ in })
    }

    private func protocolo(_ c: Comunicado, envio: EnvioComunicado = .ok) -> some View {
        ComunicadoProtocoloContenido(comunicado: c, envio: envio, onVolver: {}, onMarcarPaso: { _, _ in }, onMarcarHecho: {})
    }

    private func tarea(_ c: Comunicado, envio: EnvioComunicado = .ok) -> some View {
        ComunicadoTareaContenido(comunicado: c, envio: envio, onVolver: {}, onMarcarHecho: {})
    }

    private func nota(_ c: Comunicado) -> some View {
        ComunicadoNotaView(comunicado: c, onVolver: {}, onAbrirEnlazado: { _ in })
    }

    /// La gráfica como la ve la nota: dentro de una tarjeta, con el margen de la pantalla.
    private func tarjetaDeZonas(_ g: GraficaDeZonas) -> some View {
        ScrollView {
            ZonasSemanaView(grafica: g)
                .padding(Theme.Spacing.l)
                .tarjetaDia(alAncho: true)
                .padding(Theme.Spacing.pantalla)
        }
    }
}
