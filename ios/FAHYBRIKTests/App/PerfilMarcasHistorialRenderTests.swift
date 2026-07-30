import XCTest
import SwiftUI
@testable import FAHYBRIK

// PERFIL · MARCAS · HISTORIAL, RENDERIZADAS DE VERDAD — en sus dos extremos.
//
// Hermana de `HuecoDeclaradoRenderTests` y por lo mismo: no es una prueba de
// píxeles, es la prueba de que las tres pantallas se SOSTIENEN en los dos estados
// que el §6.3 llama «el caso de diseño» —el atleta recién dado de alta y el que
// lleva tiempo dentro—, y de paso el sitio de donde salen las capturas.
//
// Las tres vistas que se renderizan viven FUERA de su pantalla a propósito: dentro
// cuelgan de un ScrollView (Perfil y Marcas) o de un `CenteredScreen`, que es un
// ScrollView (Historial), e `ImageRenderer` no dibuja ScrollView.
//
// Los datos del extremo «con datos» son los de producción del 28-jul que ya
// transcribió el doble (`web/components/design-twin/screens/perfil-rendimiento/
// data.ts`, lectura por HTTP a Neon): 186,7 kg de sentadilla y 245 de peso muerto,
// VO₂ 42,35 del reloj, 2 marcas de 12 con récord. Las zonas y la batería cerrada
// son las del atleta veterano, porque el 64 no tiene ninguna de las dos y la
// captura tiene que enseñar también la fila con cifra.

final class PerfilMarcasHistorialRenderTests: XCTestCase {

    private static let ancho: CGFloat = 402   // iPhone 17 Pro dentro del área segura

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    // MARK: - Perfil · Rendimiento

    @MainActor
    func testPerfilReciénDadoDeAltaPintaLosContadoresEnCeroYNoInventaMedidas() {
        // La regla del §6.2 bis, comprobada ANTES de pintarla: el contador de tests
        // existe en cero («0 de 4 calibrados» es información) y el VO₂ que nadie ha
        // medido no existe todavía — ahí va la invitación, no un guion.
        let resumen = RendimientoResumen(
            tests: RendimientoEstados.tests(bateria(total: 4, completados: 0), lista: true),
            marcas: RendimientoEstados.marcas(catalogo(conRecord: 0), listas: true),
            vo2: RendimientoEstados.vo2(nil, listo: true),
            zonas: RendimientoEstados.zonas(nil, identidadCargada: true),
            fuerza: RendimientoEstados.fuerza([]),
            hasCoach: true
        )
        XCTAssertEqual(resumen.tests.estado, .valor("0", sufijo: "de 4", pie: "calibrados"),
                       "el contador se pinta en cero: es cuando más dice")
        XCTAssertEqual(resumen.vo2.estado, .vacio(invitacion: "Lo trae tu reloj, o el Cooper de 12 min"),
                       "un valor medido no existe hasta que se mide")
        // Pinta cifra, pero un cero no es un logro: el encabezado no le dice a un
        // atleta que no ha medido nada que ya lleva dos de cinco.
        XCTAssertFalse(resumen.tests.logrado)
        XCTAssertEqual(resumen.linea, "0 de 5 con dato")

        let imagen = render(filas(resumen, bateriaAbierta: true),
                            nombre: "perfil-rendimiento-alta", alto: 430)
        XCTAssertNotNil(imagen, "Rendimiento tiene que renderizar sin un solo dato")
    }

    @MainActor
    func testPerfilConDatosEnseñaSusCifrasYNoSuDescripcion() {
        let resumen = RendimientoResumen(
            tests: RendimientoEstados.tests(bateria(total: 4, completados: 4), lista: true),
            marcas: RendimientoEstados.marcas(catalogo(conRecord: 2), listas: true),
            vo2: RendimientoEstados.vo2(vo2(42.35), listo: true),
            zonas: RendimientoEstados.zonas(zonasDePulso(163), identidadCargada: true),
            fuerza: RendimientoEstados.fuerza(mil(sentadilla: 186.7, pesoMuerto: 245)),
            hasCoach: true
        )
        // El hallazgo del censo, hecho aserción: la fila de fuerza lleva SU número.
        XCTAssertEqual(
            resumen.fuerza.estado,
            .valor("245", sufijo: "kg", pie: "peso muerto · 2 levantamientos"),
            "el más pesado abre la fila, y el pie dice de qué levantamiento habla"
        )
        XCTAssertEqual(resumen.zonas.estado, .valor("163", sufijo: "ppm", pie: "Zonas de tu test de umbral"))
        XCTAssertEqual(resumen.linea, "5 de 5 con dato")

        let imagen = render(filas(resumen), nombre: "perfil-rendimiento-con-datos", alto: 430)
        XCTAssertNotNil(imagen, "Rendimiento tiene que renderizar con las cinco cifras")
    }

    @MainActor
    func testUnaFuenteQueNoContestaNoSeLeeComoUnHuecoDelAtleta() {
        // La mentira que este diseño evita: un servidor caído NO puede pintarle
        // «Aún no hay marcas que probar» a un atleta con récords. Sin respuesta la
        // fila dice que todavía no lo sabe, y el recuento de la sección se calla.
        let resumen = RendimientoResumen(
            tests: RendimientoEstados.tests(nil, lista: false),
            marcas: RendimientoEstados.marcas([], listas: false),
            vo2: RendimientoEstados.vo2(nil, listo: false),
            zonas: RendimientoEstados.zonas(nil, identidadCargada: false),
            fuerza: RendimientoEstados.fuerza(nil),
            hasCoach: true
        )
        XCTAssertEqual(resumen.marcas.estado, .cargando)
        XCTAssertNil(resumen.linea, "el recuento no puede bailar debajo del pulgar")
    }

    @MainActor
    func testElAtletaSinCoachNoCuentaLosDosHuecosQueEnSuAppNoExisten() {
        let resumen = RendimientoResumen(
            tests: .cargando(), marcas: RendimientoEstados.marcas(catalogo(conRecord: 2), listas: true),
            vo2: RendimientoEstados.vo2(vo2(42.35), listo: true),
            zonas: .cargando(),
            fuerza: RendimientoEstados.fuerza(mil(sentadilla: 186.7, pesoMuerto: 245)),
            hasCoach: false
        )
        XCTAssertEqual(resumen.visibles.count, 3)
        XCTAssertEqual(resumen.linea, "3 de 3 con dato")
    }

    // MARK: - Marcas

    @MainActor
    func testMarcasReciénDadoDeAltaEsUnaInvitacionPorFilaYNingunGuion() {
        let marcas = catalogo(conRecord: 0)
        XCTAssertEqual(
            MarcasGrupos.estado(marcas[0]),
            .vacio(invitacion: "Aún sin marca · ~4:00"),
            "sin marca la prueba es el sujeto de su fila; el guion se fue (§7)"
        )
        let imagen = render(MarcasGrupos(marks: marcas, bearer: nil),
                            nombre: "marcas-alta", alto: 1020)
        XCTAssertNotNil(imagen, "la biblioteca tiene que renderizar sin una sola marca")
    }

    @MainActor
    func testMarcasConRecordsPintaElTiempoMasGrandeQueSuEtiqueta() {
        let marcas = catalogo(conRecord: 3)
        guard case let .valor(cifra, _, _) = MarcasGrupos.estado(marcas[0]) else {
            return XCTFail("la marca con récord tiene que traer cifra")
        }
        XCTAssertEqual(cifra, "3:52")
        let imagen = render(MarcasGrupos(marks: marcas, bearer: nil),
                            nombre: "marcas-con-datos", alto: 1020)
        XCTAssertNotNil(imagen)
    }

    @MainActor
    func testMarcasSinRespuestaTieneSalida() {
        // El error que no la tenía: `marks` vacío, los tres grupos saltados sin
        // `else` y una frase naranja de 13 pt sin reintentar (§5).
        let imagen = render(
            RedesignEmptyState(
                symbol: "arrow.clockwise",
                title: "No pudimos cargar tus marcas",
                message: "Revisa tu conexión e inténtalo de nuevo.",
                exit: .action(title: "Reintentar") {}
            ),
            nombre: "marcas-sin-respuesta", alto: 300
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - Historial

    @MainActor
    func testHistorialDeUnMesVacioOfreceLaSalidaQueElAtletaVieneABuscar() {
        let imagen = render(
            HistorialDelMes(
                viewed: YearMonth(year: 2026, month: 7),
                rows: [], loading: false, failed: false, selectedDay: nil,
                onReintentar: {}, onVerMesAnterior: {}, onVerElMes: {}, onAbrir: { _ in }
            ),
            nombre: "historial-mes-vacio", alto: 380
        )
        XCTAssertNotNil(imagen, "un mes vacío se pinta como un Vacío, centrado y con salida")
    }

    @MainActor
    func testHistorialConEntrenosEsUnaLista() throws {
        let mes = try mesConEntrenos()
        let filas = HistoryListRow.rows(from: mes)
        XCTAssertEqual(filas.count, 3)
        let imagen = render(
            HistorialDelMes(
                viewed: YearMonth(year: 2026, month: 7),
                rows: filas, loading: false, failed: false, selectedDay: nil,
                onReintentar: {}, onVerMesAnterior: {}, onVerElMes: {}, onAbrir: { _ in }
            ),
            nombre: "historial-con-entrenos", alto: 380
        )
        XCTAssertNotNil(imagen)
    }

    @MainActor
    func testHistorialSinRespuestaNoSeLeeComoUnMesSinEntrenos() {
        // La mentira que había: `fetch` se tragaba cualquier fallo y devolvía nil, y
        // la pantalla lo pintaba «Sin entrenos este mes». Ahora son dos estados.
        let imagen = render(
            HistorialDelMes(
                viewed: YearMonth(year: 2026, month: 7),
                rows: [], loading: false, failed: true, selectedDay: nil,
                onReintentar: {}, onVerMesAnterior: {}, onVerElMes: {}, onAbrir: { _ in }
            ),
            nombre: "historial-sin-respuesta", alto: 380
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - Montaje

    private func filas(_ resumen: RendimientoResumen, bateriaAbierta: Bool = false) -> some View {
        RendimientoFilas(
            resumen: resumen,
            bateriaAbierta: bateriaAbierta,
            bearer: nil,
            hasCoach: resumen.hasCoach,
            zonas: nil
        )
        .padding(.horizontal, Theme.Spacing.xl)
    }

    /// Por el CABLE y no a mano, como el resto de las pruebas de render: así la
    /// captura prueba también que lo que manda el servidor llega hasta el píxel.
    private func decodifica<T: Decodable>(_ json: String) -> T {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        // swiftlint:disable:next force_try
        return try! d.decode(T.self, from: Data(json.utf8))
    }

    private func bateria(total: Int, completados: Int) -> BatteryStatus {
        let tests = (0..<total).map { i in
            let hecho = i < completados
            return #"{"calibration_slug":"t\#(i)","label":"Test \#(i + 1)","assignment_id":"\#(i)","scheduled_for":"2026-07-0\#(i + 1)","session_status":"\#(hecho ? "completed" : "scheduled")","result_captured":\#(hecho),"result_pending":false}"#
        }
        return decodifica(
            #"{"total":\#(total),"completed":\#(completados),"tests":[\#(tests.joined(separator: ","))]}"#
        )
    }

    /// El catálogo de 12 pruebas del coach; las `conRecord` primeras traen su mejor
    /// marca, el resto llegan sin ninguna — que es literalmente el alta.
    private func catalogo(conRecord: Int) -> [MarkView] {
        let pruebas: [(String, String, String, String)] = [
            ("run_1k", "1 km", "run", "~4:00"),
            ("run_cooper", "Cooper 12 min", "run", "~2.600 m"),
            ("run_5k", "5K", "run", "~22:00"),
            ("run_10k", "10K", "run", "~46:00"),
            ("row_500", "Remo 500 m", "ergo", "~1:45"),
            ("row_2k", "Remo 2K", "ergo", "~7:30"),
            ("row_5k", "Remo 5K", "ergo", "~20:00"),
            ("ski_500", "Ski 500 m", "ergo", "~1:55"),
            ("ski_1k", "Ski 1 km", "ergo", "~4:05"),
            ("race_hyrox", "HYROX", "race", "~1:30:00"),
            ("race_10k", "10K popular", "race", "~46:00"),
            ("race_media", "Media maratón", "race", "~1:45:00"),
        ]
        return pruebas.enumerated().map { i, p in
            let (slug, label, grupo, aprox) = p
            let medidoPor = grupo == "race" ? "registered" : (grupo == "ergo" ? "erg" : "run")
            var campos = [
                #""slug":"\#(slug)""#, #""label":"\#(label)""#, #""group":"\#(grupo)""#,
                #""measured_by":"\#(medidoPor)""#, #""unit":"seconds""#,
                #""lower_is_better":true"#, #""approx_label":"\#(aprox)""#,
                #""target_distance_m":1000"#, #""history":[]"#,
            ]
            if i < conRecord {
                let resultado = #"{"id":"b\#(i)","value":232,"recorded_at":"2026-07-12T09:00:00Z","source":"athlete_test"}"#
                campos.append(#""best":\#(resultado)"#)
                campos.append(#""latest":\#(resultado)"#)
            }
            return decodifica(#"{\#(campos.joined(separator: ","))}"#)
        }
    }

    private func vo2(_ valor: Double) -> AthleteVo2Max {
        decodifica(
            #"{"headline":{"value":\#(valor),"source":"watch","measured_on":"2026-07-28"},"series":[],"baseline":null,"vdot":null}"#
        )
    }

    private func zonasDePulso(_ umbral: Int) -> HRZoneProfile {
        decodifica(
            #"{"lthr_bpm":\#(umbral),"estimated":false,"source":"lthr_measured","source_label":"Zonas de tu test de umbral","confidence":"measured","zones":[{"zone":1,"code":"Z1","label":"Recuperación","max_bpm":132,"range_label":"< 132 ppm"}]}"#
        )
    }

    /// Los 1RM de producción del atleta 64: sentadilla y peso muerto, sin press.
    private func mil(sentadilla: Double, pesoMuerto: Double) -> [StrengthMaxProfile] {
        [
            #"{"exercise_slug":"back_squat_1rm","exercise_label":"Sentadilla","one_rm_kg":\#(sentadilla),"unit":"kg","source":"athlete_test","recorded_at":"2026-07-27T18:00:00Z","history":[]}"#,
            #"{"exercise_slug":"deadlift_1rm","exercise_label":"Peso muerto","one_rm_kg":\#(pesoMuerto),"unit":"kg","source":"athlete_test","recorded_at":"2026-07-26T18:00:00Z","history":[]}"#,
        ].map { decodifica($0) }
    }

    private func mesConEntrenos() throws -> AthleteHistoryMonth {
        let json = """
        {"month":"2026-07","days":[
          {"date":"2026-07-28","is_rest":false,"sessions":[
            {"assignment_id":"1","title":"Simulación HYROX","total_duration_seconds":5210,"score_time_s":5210,"rpe":9,"with_partner":false,"has_route":false}]},
          {"date":"2026-07-26","is_rest":false,"sessions":[
            {"assignment_id":"2","title":"Rodaje Z2","total_duration_seconds":3000,"rpe":5,"with_partner":true,"has_route":true}]},
          {"date":"2026-07-24","is_rest":false,"sessions":[
            {"assignment_id":"3","title":"Fuerza · pierna","total_duration_seconds":3900,"rpe":7,"with_partner":false,"has_route":false}]}
        ]}
        """
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(AthleteHistoryMonth.self, from: Data(json.utf8))
    }

    // MARK: - Render

    @MainActor
    private func render(_ vista: some View, nombre: String, alto: CGFloat) -> UIImage? {
        let renderer = ImageRenderer(
            content: ZStack {
                Theme.Color.background
                vista
            }
            .frame(width: Self.ancho, height: alto)
            .environment(\.colorScheme, .dark)
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
