import XCTest
import SwiftUI
import UIKit
@testable import FAHYBRIK

// LA GRAMÁTICA DEL VIVO NUEVO, CAPTURADA EN EL SIMULADOR — monta `VivoIphoneView`
// sobre un motor REAL con los planes del coach (`VivoPlanesDePrueba`) y vuelca
// la pantalla entera del iPhone 17 Pro, para compararla con las capturas del
// contrato (`iphone-vivo-gramatica`). Hermana del arnés de la auditoría del
// 28-09. Las imágenes van a `FAHYBRIK_CAPTURAS` (una carpeta) si está en el
// entorno; si no, solo al adjunto del test.
final class VivoIphoneCapturasTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    /// Interna (no privada): una familia añade sus escenarios en su propio fichero
    /// (`VivoIphoneCapturasTests+Ergo.swift`) con el MISMO arnés. `hrLink`: la
    /// banda de pulso enlazada (el chip «Banda»).
    @MainActor
    func captura(_ s: WorkoutSession, _ nombre: String, test: Bool = false, horizontal: Bool = false,
                 espera: TimeInterval = 0.8, antesDeEsperar: TimeInterval = 0.4, hrLink: DeviceLink = .idle,
                 trasMontar: (WorkoutSession) -> Void = { _ in }) {
        let vista = VivoIphoneView(session: s, hrZones: s.hrZones, pm5: PM5ConnectionStore.shared,
                                   hrLink: hrLink, treadmillLink: .idle, gpsActive: false, isBenchmark: test,
                                   alAccionDelHost: {}, alConectividad: {}, alTerminarYGuardar: {})
            .environment(\.colorScheme, .dark)
        let host = UIHostingController(rootView: vista)
        let base = UIScreen.main.bounds
        let bounds = horizontal ? CGRect(x: 0, y: 0, width: base.height, height: base.width) : base
        let escena = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = escena.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: bounds)
        window.frame = bounds
        window.overrideUserInterfaceStyle = .dark
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { s.stop(); window.isHidden = true; window.rootViewController = nil }
        host.view.frame = bounds
        host.view.layoutIfNeeded()
        RunLoop.current.run(until: Date().addingTimeInterval(antesDeEsperar))
        trasMontar(s)
        RunLoop.current.run(until: Date().addingTimeInterval(espera))
        host.view.layoutIfNeeded()
        RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        let fmt = UIGraphicsImageRendererFormat(); fmt.scale = 3
        let img = UIGraphicsImageRenderer(bounds: bounds, format: fmt).image { _ in
            if !host.view.drawHierarchy(in: bounds, afterScreenUpdates: true) {
                host.view.layer.render(in: UIGraphicsGetCurrentContext()!)
            }
        }
        guard let png = img.pngData() else { XCTFail("sin png \(nombre)"); return }
        let a = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        a.name = nombre; a.lifetime = .keepAlways; add(a)
        if let destino {
            try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
            try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
        }
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
