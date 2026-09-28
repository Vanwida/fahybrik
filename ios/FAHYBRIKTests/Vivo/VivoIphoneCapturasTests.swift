import XCTest
import SwiftUI
import UIKit
@testable import FAHYBRIK

// LA GRAMÁTICA DEL VIVO NUEVO, CAPTURADA EN EL SIMULADOR — monta `VivoIphoneView`
// sobre un motor REAL con los planes del coach (`VivoPlanesDePrueba`) y vuelca
// la pantalla entera del iPhone 17 Pro, para compararla con las capturas del
// contrato (`iphone-vivo-gramatica`). El volcado es el arnés común
// (`VivoArnesDeCapturas.swift`).
final class VivoIphoneCapturasTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba

    /// La foto de un escenario con el arnés común (`fotografiarVivo`). Interna: las
    /// familias añaden sus escenarios en su fichero (`+Ergo`, `+Wod`, `Correr`).
    /// `hrLink`, `treadmillLink`, `pagina` y `lectura` (lo que dirían el GPS y la
    /// cinta) son para las familias que los necesitan; por defecto, lo de siempre.
    @MainActor
    func captura(_ s: WorkoutSession, _ nombre: String, test: Bool = false, horizontal: Bool = false,
                 espera: TimeInterval = 0.8, antesDeEsperar: TimeInterval = 0.4,
                 hrLink: DeviceLink = .idle, treadmillLink: DeviceLink = .idle,
                 pagina: VivoIdPagina = .vivo, lectura: VivoLecturaDePrueba? = nil,
                 trasMontar: (WorkoutSession) -> Void = { _ in }) {
        let m = VivoMontaje(test: test, horizontal: horizontal, hrLink: hrLink, treadmillLink: treadmillLink,
                            pagina: pagina, lectura: lectura)
        fotografiarVivo(s, m, fotos: [VivoFoto(nombre: nombre, en: espera)], antesDeEsperar: antesDeEsperar, trasMontar: trasMontar)
    }

    private func erg(_ s: WorkoutSession, pace: Double, w: Int, spm: Int, m: Double, cal: Int) {
        s.ergConnected = true
        s.sampleErg(paceSecPer500m: pace, powerWatts: w, strokeRate: spm, distanceMeters: m, caloriesKcal: cal)
        s.injectLiveHR(157, source: .pm5)
    }

    // MARK: - Correr

    @MainActor
    func testCorrerSerie() throws {
        let s = P.arranca(try P.seisPorMil(), entorno: .outdoor)
        s.runCountInRemaining = 0
        captura(s, "gramatica-correr") { s in
            s.injectLiveHR(171, source: .strap)
            s.lapElapsedSeconds = 160; s.elapsedSeconds = 160
            s.lapGpsDistanceMeters = 620; s.lapHadGPS = true
        }
    }

    @MainActor
    func testCorrerRecuperacion() throws {
        let s = P.arranca(try P.seisPorMil(), entorno: .outdoor)
        s.runCountInRemaining = 0
        s.primaryAdvance(fromAthleteTap: true)
        captura(s, "gramatica-recupera") { s in
            s.injectLiveHR(148, source: .strap)
            s.elapsedSeconds = 300
        }
    }

    @MainActor
    func testRodajeZona() throws {
        let s = P.arranca(try P.rodajeZ2(), entorno: .outdoor)
        captura(s, "gramatica-rodaje-z2") { s in
            s.injectLiveHR(146, source: .strap)
            s.lapElapsedSeconds = 1000; s.elapsedSeconds = 1000
            s.lapGpsDistanceMeters = 3120; s.lapHadGPS = true
        }
    }

    // MARK: - Fuerza

    @MainActor
    func testFuerzaA1() throws {
        let s = P.arranca(try P.superserie()); s.primeSetsIfNeeded()
        captura(s, "gramatica-fuerza-a1") { s in s.injectLiveHR(126, source: .strap); s.elapsedSeconds = 487 }
    }

    @MainActor
    func testFuerzaDescansoAnota() throws {
        let s = P.arranca(try P.superserie()); s.primeSetsIfNeeded()
        s.primaryAdvance(fromAthleteTap: true)
        s.lastPrimaryAdvanceAt = nil
        s.primaryAdvance(fromAthleteTap: true)
        captura(s, "gramatica-anotar-propuesto") { s in s.injectLiveHR(104, source: .strap); s.elapsedSeconds = 642 }
    }

    @MainActor
    func testFuerzaRectas() throws {
        let s = P.arranca(try P.seriesRectas()); s.primeSetsIfNeeded()
        captura(s, "fuerza-rectas-serie") { s in s.injectLiveHR(128, source: .strap) }
    }

    // MARK: - Ergo y test

    @MainActor
    func testErgoSki() throws {
        let s = P.arranca(try P.skiSeries())
        captura(s, "gramatica-ergo", espera: 4.2) { s in
            self.erg(s, pace: 119, w: 210, spm: 42, m: 134, cal: 10)
            s.lapElapsedSeconds = 240; s.elapsedSeconds = 240
        }
    }

    @MainActor
    func testErgoHorizontal() throws {
        let s = P.arranca(try P.skiSeries())
        captura(s, "gramatica-horizontal", horizontal: true, espera: 4.2) { s in
            self.erg(s, pace: 119, w: 210, spm: 42, m: 134, cal: 10)
            s.lapElapsedSeconds = 240; s.elapsedSeconds = 240
        }
    }

    @MainActor
    func testErgoSinMaquina() throws {
        let s = P.arranca(try P.skiSeries())
        captura(s, "gramatica-sin-maquina", espera: 4.2) { s in s.injectLiveHR(150, source: .strap) }
    }

    @MainActor
    func testTestRemo() throws {
        let s = P.arranca(try P.testRemo())
        captura(s, "gramatica-test", test: true, espera: 4.2) { s in self.erg(s, pace: 108, w: 278, spm: 31, m: 640, cal: 40); s.elapsedSeconds = 138 }
    }

    // MARK: - WOD

    @MainActor
    func testEmomTarea() throws {
        let s = P.arranca(try P.emom())
        captura(s, "gramatica-emom-tarea", espera: 4.2) { s in s.injectLiveHR(160, source: .strap) }
    }

    @MainActor
    func testAmrap() throws {
        let s = P.arranca(try P.amrap())
        captura(s, "gramatica-amrap", espera: 4.2) { s in
            s.injectLiveHR(163, source: .strap)
            s.bumpAmrapRound(); s.bumpAmrapRound(); s.bumpAmrapRound(); s.bumpAmrapRound()
            s.elapsedSeconds = 430; s.lapElapsedSeconds = 430
        }
    }

    @MainActor
    func testForTime() throws {
        let s = P.arranca(try P.chipper())
        captura(s, "gramatica-fortime", espera: 4.2) { s in
            s.injectLiveHR(171, source: .strap)
            s.markRoundDone()
            s.elapsedSeconds = 95; s.lapElapsedSeconds = 95
        }
    }

    @MainActor
    func testTabata() throws {
        let s = P.arranca(try P.tabata())
        captura(s, "gramatica-tabata", espera: 4.2) { s in s.injectLiveHR(168, source: .strap) }
    }

    @MainActor
    func testDeathBy() throws {
        let s = P.arranca(try P.deathBy())
        captura(s, "gramatica-deathby", espera: 4.2) { s in s.injectLiveHR(158, source: .strap) }
    }

    // MARK: - Circuito

    @MainActor
    func testCircuitoCarrera() throws {
        let s = P.arranca(try P.circuito(), entorno: .outdoor)
        captura(s, "gramatica-circuito-carrera", espera: 4.2) { s in
            s.injectLiveHR(158, source: .strap)
            s.elapsedSeconds = 140; s.lapElapsedSeconds = 140
        }
    }

    @MainActor
    func testCircuitoDescanso() throws {
        let s = P.arranca(try P.circuito(), entorno: .outdoor)
        captura(s, "gramatica-descanso", espera: 4.2) { s in
            s.injectLiveHR(118, source: .strap)
            s.markRoundDone(); s.markRoundDone(); s.markRoundDone()
            s.elapsedSeconds = 964; s.lapElapsedSeconds = 964
        }
    }

    // MARK: - Estados de la carcasa

    @MainActor
    func testPausa() throws {
        let s = P.arranca(try P.seisPorMil(), entorno: .outdoor)
        s.runCountInRemaining = 0
        captura(s, "gramatica-pausa") { s in s.injectLiveHR(160, source: .strap); s.togglePause() }
    }

    @MainActor
    func testCuentaAtras() throws {
        let s = P.arranca(try P.emom())
        captura(s, "gramatica-cuenta-atras", espera: 0.3) { s in s.injectLiveHR(150, source: .strap) }
    }
}
