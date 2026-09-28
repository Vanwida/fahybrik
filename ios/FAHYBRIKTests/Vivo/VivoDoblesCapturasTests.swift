import XCTest
import SwiftUI
import UIKit
@testable import FAHYBRIK

// LOS DOBLES Y LAS SALIDAS, CAPTURADOS — el vivo nuevo sobre el motor real del
// simulacro de dobles (`VivoPlanesDobles`), con la presencia de la pareja y las
// salidas del host. El relevo se da por el MISMO camino que el dedo (el guion) y
// se comprueba en el motor que la estación de la pareja no graba nada tuyo.
// Corre en CI (GitHub Actions), nunca en el Mac de Alex.
final class VivoDoblesCapturasTests: XCTestCase {

    private typealias D = VivoPlanesDobles

    private let marta = DoblesLiveStripState.live(name: D.pareja, paused: false, blockName: "SkiErg", progress: "600 m",
                                                  elapsedS: 754, hrBpm: 162, ageS: 3)

    @MainActor
    func testElRelevoSeDaConElDedoYNoGraba() throws {
        let s = try D.sesion(en: 1)
        s.lapElapsedSeconds = 95; s.elapsedSeconds = 420
        let m = VivoMontaje(hrLink: .connected(name: "Banda"), guion: [VivoGestoGuion(en: 1.0, gesto: .primaria)],
                            minimizar: true, pareja: marta)
        fotografiarVivo(s, m, fotos: [VivoFoto(nombre: "dobles-relevo", en: 0.6), VivoFoto(nombre: "dobles-tras-relevo", en: 2.0)])
        XCTAssertFalse(s.laps.contains { $0.templateSegmentId == 2169 }, "el relevo no graba la estación de la pareja")
        XCTAssertEqual(s.currentSegmentIndex, 2, "«Relevo» pasa a lo tuyo (advanceRelay), no cierra una vuelta")
    }

    @MainActor
    func testElRepartoConSuPacto() throws {
        let s = try D.sesion(en: 3)
        s.lapElapsedSeconds = 40; s.elapsedSeconds = 1300
        fotografiarVivo(s, VivoMontaje(hrLink: .connected(name: "Banda"), minimizar: true, pareja: marta),
                        fotos: [VivoFoto(nombre: "dobles-reparto", en: 0.6)])
    }

    @MainActor
    func testLaHojaConTodasLasSalidas() throws {
        let s = try D.sesion(en: 0)
        s.lapElapsedSeconds = 130; s.elapsedSeconds = 130
        var guardado = false
        let m = VivoMontaje(guion: [VivoGestoGuion(en: 0.3, gesto: .parar)],
                            salidas: VivoSalidas(guardarParaLuego: { guardado = true }, descartar: {}), minimizar: true)
        fotografiarVivo(s, m, fotos: [VivoFoto(nombre: "salidas-hoja", en: 1.0)])
        XCTAssertFalse(guardado, "abrir la hoja no sale de nada")
        XCTAssertTrue(s.hasBlockAfterCurrent, "con otro bloque detrás, la hoja ofrece cerrar solo este")
    }

    /// La Estructura (no la ruta del circuito): 493, en el calentamiento; las filas
    /// del bloque de rondas llevan su chevrón (se salta a ellas).
    @MainActor
    func testLaEstructuraConSaltos() throws {
        let s = WorkoutSession(plan: try VivoPlanesCircuito.sesion493())
        s.start(); s.beginBlock(); s.stop()
        XCTAssertEqual(s.currentSegmentIndex, 0)
        fotografiarVivo(s, VivoMontaje(pagina: .estructura, minimizar: true, saltar: true),
                        fotos: [VivoFoto(nombre: "estructura-saltos", en: 0.6)])
    }
}
