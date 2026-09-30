import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA GALERÍA DE LAS PANTALLAS QUE CUELGAN DEL PLAN — el ciclo, el índice de técnica de una sesión, la ficha de un
// ejercicio, el selector de día del constructor y los estados sin datos. Cada una en claro y en oscuro, con el
// acento de fábrica y con el de un club azul (tinta clara): una pantalla con el acento clavado solo se ve mal
// cuando un coach elige otro.
//
// `ImageRenderer` no pinta un `ScrollView` ni una hoja: por eso se dibuja lo que cada pantalla mete DENTRO de su
// scroll (`CuerpoDelCiclo`, `indice`, `columna`) sobre el lienzo del iPhone 17 Pro. Los PNG van a
// `FAHYBRIK_CAPTURAS` (con `TEST_RUNNER_FAHYBRIK_CAPTURAS` desde `xcodebuild`) y como adjuntos.

final class PlanSecundariasGaleriaTests: XCTestCase {

    private static let ancho: CGFloat = 402

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    private struct Variante {
        let nombre: String
        let esquema: ColorScheme
        let club: ClubTheme?
    }

    private static let variantes: [Variante] = [
        Variante(nombre: "claro-fabrica", esquema: .light, club: nil),
        Variante(nombre: "oscuro-fabrica", esquema: .dark, club: nil),
        Variante(nombre: "claro-azul", esquema: .light, club: .pruebaAzul),
        Variante(nombre: "oscuro-azul", esquema: .dark, club: .pruebaAzul),
    ]

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    // MARK: - El ciclo

    @MainActor
    func testCicloCompletoYConHueco() {
        galeria("ciclo-completo", alto: 900) { cabeceraDeCiclo(CuerpoDelCiclo(ciclo: EscenariosCiclo.completo)) }
        galeria("ciclo-hueco", alto: 760) { cabeceraDeCiclo(CuerpoDelCiclo(ciclo: EscenariosCiclo.conHueco)) }
        galeria("ciclo-sin-etapa", alto: 700) { cabeceraDeCiclo(CuerpoDelCiclo(ciclo: EscenariosCiclo.sinEtapaActiva)) }
    }

    /// El ciclo sin plan: el estado vacío del scaffold compartido.
    @MainActor
    func testEstadosSinDatos() {
        galeria("estado-vacio", alto: 520) {
            RedesignEmptyState(
                symbol: "square.stack.3d.up", title: "Aún no tienes plan",
                message: "Cuando tu coach publique tu primera etapa, aquí verás por dónde vas y cuánto queda.",
                exit: .explained(note: LoPublicaElCoach.frase))
                .padding(.top, 120)
        }
        galeria("estado-error", alto: 520) {
            RedesignEmptyState(
                symbol: "wifi.exclamationmark", title: "No pudimos cargar tu ciclo",
                message: "Revisa tu conexión e inténtalo de nuevo.",
                exit: .action(title: "Reintentar", perform: {}))
                .padding(.top, 120)
        }
    }

    // MARK: - La técnica

    @MainActor
    func testIndiceDeTecnicaDeUnaSesion() throws {
        let bloques = try Self.bloquesDeEjemplo()
        let hoja = SessionExercisesSheet(assignmentId: "1", sessionTitle: "Fuerza y ritmo", bearer: nil, onPreguntar: { _ in })
        galeria("tecnica-indice", alto: 640) { hoja.indice(bloques) }
    }

    @MainActor
    func testFichaDeUnEjercicio() throws {
        let items = try Self.bloquesDeEjemplo().flatMap(\.items)
        let piramide = try XCTUnwrap(items.first { $0.exerciseName == "Sentadilla trasera" })
        galeria("tecnica-ficha-piramide", alto: 900) { ExerciseDetailView(item: piramide).columna }
        let trote = try XCTUnwrap(items.first { $0.exerciseName == "Trote suave" })
        galeria("tecnica-ficha-correr", alto: 260) { ExerciseDetailView(item: trote).columna }
    }

    // MARK: - El selector de día

    @MainActor
    func testSelectorDeDia() {
        galeria("programar-dia", alto: 140) {
            ProgramarDiaPicker(selectedISO: .constant("2026-08-19"), todayISO: "2026-08-19")
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.top, Theme.Spacing.l)
        }
    }

    // MARK: - Fixtures

    /// Dos bloques con una pirámide de fuerza y una carrera, decodificados como llegan del servidor.
    private static func bloquesDeEjemplo() throws -> [WorkoutBlock] {
        let json = """
        {
          "assignment": { "id": "asg_g1", "athlete_id": "ath_g1", "scheduled_for": "2026-08-19", "status": "scheduled" },
          "workout": { "name": "Fuerza y ritmo", "blocks": [
            { "uid": "b1", "title": "Fuerza", "format": "straight_sets", "block_position": 1, "items": [
              { "uid": "i1", "exercise_id": "e1", "exercise_name": "Sentadilla trasera", "exercise_slug": "back-squat",
                "exercise_category": "strength", "exercise_video_url": null,
                "cues": "Aprieta el suelo con todo el pie y sube el pecho antes que la cadera.",
                "exercise_description": "Barra alta sobre los trapecios, pies a la anchura de los hombros y las puntas algo abiertas.",
                "params_json": { "sets": 5 },
                "prescription_json": { "scheme": "sets", "modality": "strength", "sets": [
                  { "measure": { "kind": "reps", "value": 10 }, "target": { "kind": "percent_rm", "value": 60 }, "rest_s": 120 },
                  { "measure": { "kind": "reps", "value": 8 }, "target": { "kind": "percent_rm", "value": 70 }, "rest_s": 150 },
                  { "measure": { "kind": "reps", "value": 6 }, "target": { "kind": "percent_rm", "value": 75 }, "rest_s": 180 }
                ] },
                "resolved_load": null,
                "notes": "Si la última serie se te va de técnica, quédate en el 70 %." },
              { "uid": "i2", "exercise_id": "e2", "exercise_name": "Press banca", "exercise_slug": "bench",
                "exercise_category": "strength", "exercise_video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "cues": null, "params_json": { "sets": 4 }, "prescription_json": null, "notes": null }
            ] },
            { "uid": "b2", "title": "Rodaje", "format": "free", "block_position": 2, "items": [
              { "uid": "i3", "exercise_id": "e3", "exercise_name": "Trote suave", "exercise_slug": "trote",
                "exercise_category": "running", "exercise_video_url": null, "cues": null,
                "params_json": { "durationSeconds": 1200 }, "prescription_json": null, "notes": null }
            ] }
          ] }
        }
        """
        // Como el cliente de la app: el cable es snake_case y los modelos, camelCase.
        let decodificador = JSONDecoder()
        decodificador.keyDecodingStrategy = .convertFromSnakeCase
        let detalle = try decodificador.decode(AssignmentDetail.self, from: Data(json.utf8))
        return try XCTUnwrap(detalle.workout).blocks
    }

    // MARK: - Render

    /// La cabecera fija del ciclo (el cromo) sobre su cuerpo, como la pantalla los apila.
    private func cabeceraDeCiclo(_ cuerpo: some View) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            HStack {
                Text("Tu plan").papel(.etiqueta).foregroundStyle(Theme.Color.accentText)
                Spacer()
                BotonCromoDia(.cerrar, etiqueta: "Cerrar", accion: {})
            }
            .padding(.leading, Theme.Spacing.pantalla)
            .padding(.trailing, Theme.Spacing.s)
            .frame(minHeight: 56)
            cuerpo.padding(.horizontal, Theme.Spacing.pantalla)
        }
    }

    @MainActor
    private func galeria(_ nombre: String, alto: CGFloat, @ViewBuilder _ vista: () -> some View) {
        for v in Self.variantes {
            ClubThemeStore.update(v.club)
            let renderer = ImageRenderer(
                content: ZStack(alignment: .top) {
                    Theme.Color.background
                    vista().fixedSize(horizontal: false, vertical: true)
                }
                .frame(width: Self.ancho, height: alto, alignment: .top)
                .environment(\.colorScheme, v.esquema)
            )
            renderer.scale = 2
            guard let imagen = renderer.uiImage, let png = imagen.pngData() else {
                XCTFail("No se pudo pintar \(nombre) · \(v.nombre)")
                continue
            }
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = "\(nombre)-\(v.nombre)"
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(nombre)-\(v.nombre).png"))
            }
        }
        ClubThemeStore.clear()
    }
}
