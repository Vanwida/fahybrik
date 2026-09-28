import XCTest
@testable import FAHYBRIK

// SIN DETALLE NO SE GUARDA NADA CONTRA LA ASIGNACIÓN (28-sep).
//
// Cuando el detalle de la sesión pasaba de 60 KB o el móvil no lo tenía en caché,
// el reloj recibía solo el título, corría `WorkoutPlan.minimal` («Sesión», un tramo)
// y al terminar lo guardaba contra la sesión del coach como HECHA, con el tiempo de
// la sesión como marca. Ahora el detalle viaja por fichero, la muñeca lo pide si le
// falta y, mientras falte, no hay Empezar (`WatchSessionPlan`).
final class WatchSessionPlanTests: XCTestCase {

    // MARK: - Fixtures (formas reales de GET /api/athlete/assignments/{id}/detail)

    private func decode(_ json: String) throws -> AssignmentDetail {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return try d.decode(AssignmentDetail.self, from: Data(json.utf8))
    }

    /// Una sesión de fuerza normal: un bloque, un ejercicio.
    private func sesionDeFuerza(id: String = "901") throws -> AssignmentDetail {
        try decode("""
        {
          "assignment": { "id": "\(id)", "athlete_id": "64", "scheduled_for": "2026-09-28", "status": "scheduled" },
          "workout": { "name": "Fuerza A", "blocks": [ { "uid": "b", "title": "Fuerza", "format": "straight_sets", "block_position": 1, "items": [
            { "uid": "i1", "exercise_id": "e1", "exercise_name": "Back squat", "exercise_slug": "back-squat", "exercise_category": "strength",
              "exercise_video_url": "https://youtu.be/xyz", "cues": null, "params_json": {"sets": 4, "reps": 6, "load_kg": 80}, "notes": null }
          ] } ] } }
        """)
    }

    /// El test de salto de la asignación 477: sin bloques, se hace con la cámara.
    private func testDeSaltoSinBloques() throws -> AssignmentDetail {
        try decode("""
        {
          "assignment": {
            "id": "477", "athlete_id": "64", "scheduled_for": "2026-08-13", "status": "scheduled",
            "slot": null, "template_id": "1", "template_version": 1, "completed_at": null,
            "perceived_exertion": null, "station_assignment": null, "my_role": null,
            "store_results": [
              {"slug":"cmj","label":"CMJ","measure":"height","unit":"cm","derives":"none","modality":null,"optional":false}
            ]
          },
          "workout": {"name":"Perfil de salto (CMJ)","focus":null,"coach_note":null,"estimated_duration_minutes":null,"blocks":[]}
        }
        """)
    }

    private func hoy(id: String? = "901", isDone: Bool = false, dayKind: String = WatchDayKind.session,
                     detailJson: Data? = nil) -> WatchTodayPayload {
        WatchTodayPayload(
            dayKind: dayKind, assignmentId: id, title: "Fuerza A", focus: nil,
            estDurationMinutes: 60, intensityLabel: nil, activityKind: "strength",
            athleteHrZones: nil, readinessScore: nil, readinessDelta7d: nil,
            readinessWorstDriver: nil, isDone: isDone, doneCompleteness: nil,
            isDoubles: false, partnerFirstName: nil, partnerVisibility: nil,
            detailJson: detailJson, clubAccent: nil
        )
    }

    // MARK: - Sin detalle no hay plan (ni nada que guardar contra la asignación)

    func testSinDetalleLaMunecaNoTienePlanQueCorrer() {
        let plan = WatchSessionPlan.resolve(detail: nil)
        guard case .needsDetail = plan else {
            return XCTFail("sin detalle la muñeca espera la sesión, no corre una inventada: \(plan)")
        }
        XCTAssertNil(plan.runnable, "sin plan no hay Empezar, y sin entreno no se guarda nada")
    }

    func testSinDetalleSePideAlIPhone() {
        XCTAssertEqual(WatchDayDetail.toRequest(today: hoy(), detail: nil), "901")
    }

    func testNoSePideLoQueNoHaceFalta() throws {
        XCTAssertNil(WatchDayDetail.toRequest(today: hoy(), detail: try sesionDeFuerza()),
                     "ya lo tiene")
        XCTAssertNil(WatchDayDetail.toRequest(today: hoy(isDone: true), detail: nil),
                     "una sesión hecha no se vuelve a correr")
        XCTAssertNil(WatchDayDetail.toRequest(today: hoy(id: nil, dayKind: WatchDayKind.rest), detail: nil),
                     "un día de descanso no tiene sesión")
        XCTAssertNil(WatchDayDetail.toRequest(today: nil, detail: nil))
    }

    // MARK: - Con detalle se corre el plan del coach

    func testConDetalleSeCorreElPlanDelCoach() throws {
        let plan = try XCTUnwrap(WatchSessionPlan.resolve(detail: try sesionDeFuerza()).runnable)
        XCTAssertEqual(plan.name, "Fuerza A")
        XCTAssertEqual(plan.segments.first?.title, "Back squat")
        XCTAssertNotEqual(plan.segments.first?.title, "Sesión")
    }

    // MARK: - Un test de salto programado para hoy

    func testUnTestDeSaltoSinBloquesNoSeCorreEnLaMuneca() throws {
        let plan = WatchSessionPlan.resolve(detail: try testDeSaltoSinBloques())
        guard case .phoneOnly(.jumpTest) = plan else {
            return XCTFail("un test de salto se hace con la cámara del iPhone, no «Sesión»: \(plan)")
        }
        XCTAssertNil(plan.runnable)
    }

    // MARK: - El detalle por fichero

    /// Los bytes que manda el iPhone (mismo codificador que el contexto, sin vídeos)
    /// son los que la muñeca decodifica y corre.
    func testElFicheroDelDetalleLlegaCorrible() throws {
        let original = try sesionDeFuerza()
        let bytes = WatchWire.strippingVideoURLs(from: try WatchWire.detailEncoder.encode(original))
        XCTAssertFalse(String(decoding: bytes, as: UTF8.self).contains("exercise_video_url"))
        let recibido = try WatchWire.detailDecoder.decode(AssignmentDetail.self, from: bytes)
        XCTAssertNotNil(WatchSessionPlan.resolve(detail: recibido).runnable)
    }

    /// El del contexto manda; si no vino, el del fichero de ESA asignación, nunca el
    /// de otra.
    func testElDetalleDelFicheroSoloValeParaSuAsignacion() throws {
        let fichero = try sesionDeFuerza(id: "901")
        XCTAssertEqual(WatchDayDetail.pick(assignmentId: "901", fromContext: nil,
                                           fromFile: ("901", fichero))?.assignment.id, "901")
        XCTAssertNil(WatchDayDetail.pick(assignmentId: "902", fromContext: nil,
                                         fromFile: ("901", fichero)),
                     "el detalle de otra sesión no se corre contra esta")
        let contexto = try sesionDeFuerza(id: "901")
        XCTAssertEqual(WatchDayDetail.pick(assignmentId: "901", fromContext: contexto,
                                           fromFile: nil)?.workout?.name, "Fuerza A")
    }

    // MARK: - Guardia de código: la muñeca no fabrica planes

    /// Ningún fichero del reloj construye el plan de solo título. Es la pieza que
    /// guardaba «Sesión» contra la asignación; si vuelve, vuelve el fallo.
    func testLaMunecaNoConstruyeElPlanDeSoloTitulo() throws {
        let ios = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()    // …/FAHYBRIKTests/Workout
            .deletingLastPathComponent()    // …/FAHYBRIKTests
            .deletingLastPathComponent()    // …/ios
        let fm = FileManager.default
        var revisados = 0
        for dir in ["FAHYBRIKWatch", "FAHYBRIKCore/Watch"] {
            let root = ios.appendingPathComponent(dir)
            try XCTSkipUnless(fm.fileExists(atPath: root.path), "fuentes no presentes en esta ejecución")
            guard let walker = fm.enumerator(at: root, includingPropertiesForKeys: nil) else { continue }
            for case let url as URL in walker where url.pathExtension == "swift" {
                let code = try String(contentsOf: url, encoding: .utf8)
                    .split(separator: "\n", omittingEmptySubsequences: false)
                    .map { line -> Substring in
                        guard let c = line.range(of: "//") else { return line }
                        return line[line.startIndex..<c.lowerBound]
                    }
                    .joined(separator: "\n")
                XCTAssertFalse(code.contains(".minimal("),
                               "\(url.lastPathComponent) construye un plan de solo título")
                revisados += 1
            }
        }
        XCTAssertGreaterThan(revisados, 10, "la guardia no puede pasar sin mirar nada")
    }
}
