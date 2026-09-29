import XCTest
import SwiftUI
@testable import FAHYBRIK

// MARCAS · HISTORIAL, RENDERIZADAS DE VERDAD — en sus dos extremos.
//
// Hermana de `HuecoDeclaradoRenderTests` y por lo mismo: no es una prueba de
// píxeles, es la prueba de que las dos pantallas se SOSTIENEN en los dos estados
// que el §6.3 llama «el caso de diseño» —el atleta recién dado de alta y el que
// lleva tiempo dentro—, y de paso el sitio de donde salen las capturas.
//
// Las vistas que se renderizan viven FUERA de su pantalla a propósito: dentro
// cuelgan de un ScrollView (Marcas) o de un `CenteredScreen`, que es un
// ScrollView (Historial), e `ImageRenderer` no dibuja ScrollView.
//
// (Perfil salió de aquí: su galería, con los veinte casos del doble, es
// `Profile/GaleriaPerfilRenderTests`.)

final class MarcasHistorialRenderTests: XCTestCase {

    private static let ancho: CGFloat = 402   // iPhone 17 Pro dentro del área segura

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
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

    /// Por el CABLE y no a mano, como el resto de las pruebas de render: así la
    /// captura prueba también que lo que manda el servidor llega hasta el píxel.
    private func decodifica<T: Decodable>(_ json: String) -> T {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        // swiftlint:disable:next force_try
        return try! d.decode(T.self, from: Data(json.utf8))
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
