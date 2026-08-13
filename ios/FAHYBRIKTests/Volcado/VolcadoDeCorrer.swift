import SwiftUI
import XCTest
@testable import FAHYBRIK

// EL VOLCADO DE LAS PANTALLAS DE CORRER — la herramienta, no una prueba.
//
// ESTO NO AFIRMA NADA SOBRE LA APP. Su trabajo es producir los PNG con los que se
// dirige el acabado; falla solo si no consigue producirlos, y entonces dice cuál y
// por qué. Un volcado que se salta una pantalla en silencio deja creyendo que se
// miró algo que nadie vio, y eso es peor que no tenerlo.
//
// CÓMO SE SACAN LAS IMÁGENES (desde el Mac, con el simulador arrancado):
//
//   xcodebuild test -project ios/FAHYBRIK.xcodeproj -scheme FAHYBRIK \
//     -destination 'platform=iOS Simulator,id=<UDID>' \
//     -only-testing:FAHYBRIKTests/VolcadoDeCorrer
//   open "$(xcrun simctl get_app_container <UDID> com.fahybrid.app data)/Documents/volcado"
//
// Por qué ahí y no en el repo: ver la cabecera de `Volcado`.
//
// CADA PANTALLA VA EN SU MÉTODO A PROPÓSITO. Una vista que no rasterice tumba SU
// volcado y deja los otros cuatro escritos, en vez de abortar el lote entero en el
// primer tropiezo — que es justo cuando más falta hacen las imágenes que sí salen.
//
// ── LO QUE ESTE VOLCADO **NO** ENSEÑA, dicho aquí para que nadie lo dé por visto ──
// El cromo de Analíticas (el título y el rail de secciones) queda fuera: es una
// banda FIJA que no scrollea y vive en `AnalyticsView` colgada del store de la app.
// Lo que se vuelca es el contenido que scrolla por debajo, entero. Así que estas
// imágenes sirven para juzgar los bloques, su aire y su tinte; **no** la distancia
// entre el borde de la pantalla y el veredicto.
final class VolcadoDeCorrer: XCTestCase {

    // MARK: - ¿Estoy mejorando? · los tres estados

    /// TODO MEDIDO: el veredicto con su marca, las cuatro curvas, el reparto contra
    /// el objetivo del coach y el material de referencia de abajo.
    @MainActor
    func testVuelcaAnaliticasDeCorrerConTodoMedido() throws {
        try vuelca(analiticas(EscenariosDeCorrer.lleno), como: "correr-analiticas-lleno")
    }

    /// SIN TEST DE UMBRAL — la que prueba la honestidad de la pantalla: forma y
    /// reparto apagados con su candado, y UN solo botón para el test que las
    /// desbloquea las dos.
    @MainActor
    func testVuelcaAnaliticasDeCorrerSinTestDeUmbral() throws {
        try vuelca(analiticas(EscenariosDeCorrer.sinTestDeUmbral),
                   como: "correr-analiticas-sin-test-de-umbral")
    }

    /// TRES SEMANAS — «aún no», con el plazo dibujado y sin botón, porque esperar no
    /// es una acción.
    @MainActor
    func testVuelcaAnaliticasDeCorrerConPocaHistoria() throws {
        try vuelca(analiticas(EscenariosDeCorrer.pocaHistoria),
                   como: "correr-analiticas-poca-historia")
    }

    // MARK: - Al terminar de correr

    /// EL 6×800 RECIÉN TERMINADO. Ésta sí se vuelca al lienzo del dispositivo
    /// entero: ocupa la pantalla, ancla la acción al suelo y su reparto vertical
    /// —dónde cae el sujeto— ES el diseño. Recortada o estirada no se puede juzgar.
    ///
    /// Y no lleva envoltorio: esta pantalla se pinta su propio lienzo y su propio
    /// tinte, que es exactamente la diferencia con la de analíticas.
    @MainActor
    func testVuelcaLaLecturaDeUnaSerieAlTerminar() throws {
        let pantalla = LecturaDeCarreraView(
            carrera: EscenariosDeLaCarrera.series,
            zonas: EscenariosDeLaCarrera.zonasDePulso,
            onCerrar: {}
        )
        try vuelca(pantalla, como: "correr-lectura-series", alto: Volcado.altoDeDispositivo)
    }

    // MARK: - Los bloques del cuerpo

    /// LOS DOS BLOQUES TRANSVERSALES, juntos y en su sitio. Van juntos porque se
    /// citan: la afirmación de la carga habla del sueño que dibuja el bloque de
    /// arriba, y separarlos escondería lo único que ninguna otra app tiene.
    @MainActor
    func testVuelcaLosBloquesDelCuerpo() throws {
        let bloques = VStack(alignment: .leading, spacing: Theme.Spacing.xxxl) {
            ComoLlegoHoyBloque(readiness: EscenariosDelCuerpo.comoLlegaHoy, onCheckin: {})
            BloqueDeCarga(
                lecturas: EscenariosDelCuerpo.lecturasDeCarga,
                hechos: EscenariosDelCuerpo.hechos,
                metodo: EscenariosDelCuerpo.metodo,
                ventana: EscenariosDelCuerpo.ventana,
                onSalida: {}
            )
        }
        try vuelca(enSuSitio(bloques, tono: tonoDe(EscenariosDeCorrer.lleno)),
                   como: "correr-bloques-del-cuerpo")
    }

    // MARK: - El sitio de la pantalla, reproducido

    /// LA PANTALLA DE ANALÍTICAS DE CARRERA TAL Y COMO SE VE, no la vista suelta.
    ///
    /// `AnaliticasCorrerView` **no pinta ningún fondo**: el lienzo y el tinte del
    /// veredicto los pone `AnalyticsView`, que es quien la coloca. Volcarla sola
    /// daría una pantalla sin fondo — que es, literalmente, uno de los dos rechazos
    /// que este volcado existe para que no vuelvan a pasar.
    @MainActor
    private func analiticas(_ progreso: RunningProgressPayload) -> some View {
        enSuSitio(AnaliticasCorrerView(progreso: progreso, onSalida: {}),
                  tono: tonoDe(progreso))
    }

    /// El tono del lienzo sale del veredicto EFECTIVO, no del servido: si no queda
    /// gráfico que lo sostenga, el titular baja a «aún no» y el fondo tiene que
    /// bajar con él. Resolverlo por separado es cómo el tinte y el titular acaban
    /// discrepando en el mismo pintado.
    private func tonoDe(_ progreso: RunningProgressPayload) -> Color {
        AnaliticasCorrerView.tono(ProgresoDeCarrera.veredictoEfectivo(progreso).clase)
    }

    /// Lo que `AnalyticsView` le pone encima a lo que scrollea: el lienzo de la app,
    /// el tinte detrás de TODO y los 16 pt laterales. Cotejado contra
    /// `AnalyticsView.body` + `progresoDeCarrera` + `elCuerpo` (13-ago).
    @MainActor
    private func enSuSitio(_ contenido: some View, tono: Color) -> some View {
        ZStack(alignment: .top) {
            Theme.Color.background
            Ambiente(zona: nil, tono: tono)
            contenido
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.bottom, Theme.Spacing.xxl)
        }
    }
}
