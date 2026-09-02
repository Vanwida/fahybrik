import XCTest
@testable import FAHYBRIK

// UNA AUTO-PAUSA NO PUEDE SOBREVIVIR A QUIEN LA VIGILA.
//
// El caso real: el atleta para en un semáforo (la pantalla de calle auto-pausa),
// cierra esa pantalla, y la sesión se quedaba PAUSADA PARA SIEMPRE — el crono
// parado y el entreno guardándose con ese tiempo de menos. La causa no era una
// llamada olvidada en un `teardown`: era que el invariante vivía en la vista.
// Ahora lo garantiza la sesión, y esto lo fija.
@MainActor
final class AutoPausaNoSobreviveTests: XCTestCase {

    private func sesionCorriendo() -> WorkoutSession {
        let seg = WorkoutSegment(order: 1, title: "Rodaje", kind: .running,
                                 blockTitle: "Rodaje", blockPosition: 1, prescription: nil)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Rodaje", format: .steady, estimatedDurationSeconds: 1_800,
            blockContext: "Libre", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, demoVideoUrl: nil, warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    /// El caso del semáforo: se auto-pausa, se cierra la pantalla, y la sesión
    /// tiene que volver a correr sola.
    func testCerrarLaPantallaLevantaLaAutoPausa() {
        let s = sesionCorriendo()
        s.beginAutoPauseEvaluation()
        s.autoPause()
        XCTAssertTrue(s.isPaused)
        XCTAssertTrue(s.autoPaused)

        s.endAutoPauseEvaluation()
        XCTAssertFalse(s.isPaused, "la sesión se quedaba pausada para siempre")
        XCTAssertFalse(s.autoPaused)
    }

    /// Y una pausa MANUAL no se toca: ésa es del atleta, no nuestra.
    func testLaPausaManualSobreviveALaPantalla() {
        let s = sesionCorriendo()
        s.beginAutoPauseEvaluation()
        s.togglePause()
        XCTAssertTrue(s.isPaused)
        XCTAssertFalse(s.autoPaused)

        s.endAutoPauseEvaluation()
        XCTAssertTrue(s.isPaused, "una pausa manual no la levanta nadie más que el atleta")
    }

    /// Sin nadie vigilando no se puede auto-pausar: nadie podría deshacerlo.
    func testSinVigilanteNoHayAutoPausa() {
        let s = sesionCorriendo()
        s.autoPause()
        XCTAssertFalse(s.isPaused)
    }

    /// Con dos pantallas mirando (una se abre encima de otra), la auto-pausa sólo
    /// se libera cuando se va la ÚLTIMA.
    func testSoloSeLiberaCuandoSeVaElUltimo() {
        let s = sesionCorriendo()
        s.beginAutoPauseEvaluation()
        s.beginAutoPauseEvaluation()
        s.autoPause()

        s.endAutoPauseEvaluation()
        XCTAssertTrue(s.isPaused, "todavía queda quien la vigile")
        s.endAutoPauseEvaluation()
        XCTAssertFalse(s.isPaused)
    }
}
