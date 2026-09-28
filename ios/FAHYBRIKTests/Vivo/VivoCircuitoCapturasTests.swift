import XCTest
import SwiftUI
import UIKit
@testable import FAHYBRIK

// LA FAMILIA CIRCUITO, CAPTURADA — monta `VivoIphoneView` sobre un motor REAL con
// los planes de `VivoPlanesCircuito`, lo lleva al punto de cada escenario del
// contrato (`screens/iphone-vivo-circuito/casos.ts`) cerrando estaciones como lo
// haría el atleta, y vuelca la pantalla para compararla con
// `scratchpad/capturas-final/circuito-*-390.png`. Hermana de
// `VivoIphoneCapturasTests` (mismo volcado); aquí además se enlaza la máquina
// (el store del monitor en `.streaming`) y la banda, como en el contrato.
// Corre en CI (GitHub Actions): nunca en el Mac de Alex.
final class VivoCircuitoCapturasTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba
    private typealias C = VivoPlanesCircuito

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    /// Lo que marca el monitor en el escenario (el /500, las paladas, los vatios).
    private struct Monitor { var split: Double; var spm: Int; var vatios: Int }

    @MainActor
    private func captura(_ s: WorkoutSession, _ nombre: String, monitor: Monitor? = nil, horizontal: Bool = false,
                         pagina: VivoIdPagina = .vivo, espera: TimeInterval = 1.2,
                         trasMontar: (WorkoutSession) -> Void = { _ in }) {
        let pm5 = PM5ConnectionStore.shared
        if let monitor {
            pm5.connectionState = .streaming
            var l = PM5LiveSample()
            l.paceSecondsPer500m = monitor.split; l.strokeRate = monitor.spm; l.powerWatts = monitor.vatios
            pm5.live = l
        }
        defer { pm5.connectionState = .idle; pm5.live = PM5LiveSample() }
        let vista = VivoIphoneView(session: s, hrZones: s.hrZones, pm5: pm5,
                                   hrLink: .connected(name: "Banda"), treadmillLink: .idle, gpsActive: true, isBenchmark: false,
                                   alAccionDelHost: {}, alConectividad: {}, alTerminarYGuardar: {}, paginaInicial: pagina)
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
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
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

    // MARK: - Llevar el motor al punto del escenario

    /// Entra al bloque del circuito (el segmento `k`) ya corriendo, sin la cuenta de entrada.
    @MainActor
    private func entra(_ s: WorkoutSession, segmento k: Int) {
        if s.currentSegmentIndex != k { s.jumpTo(k) }
        if s.isAwaitingBlockStart { s.beginBlock() }
        s.condCountInRemaining = 0
    }

    /// Lo que tarda cada pieza al cerrarla (para que los parciales y el total sean de verdad).
    private func dura(_ nombre: String) -> Double {
        if nombre == "Run" { return 272 }
        if Vivo.esRoxzone(nombre) { return 22 }
        if nombre.contains("Sled") { return 150 }
        return 200
    }

    /// Cierra las `k` primeras piezas de la lista como el atleta: el reloj avanza
    /// lo que tarda cada una y el descanso prescrito se consume entero.
    @MainActor
    private func cierra(_ s: WorkoutSession, _ k: Int) {
        guard let seg = s.currentSegment else { return }
        let nombres = seg.declaredComponents.map(\.name)
        var t = s.lapElapsedSeconds
        for j in 0..<k {
            t += dura(nombres[j % max(1, nombres.count)])
            s.lapElapsedSeconds = t; s.elapsedSeconds = t
            s.markRoundDone()
            if s.fixedRestRemaining > 0 {
                t += s.fixedRestRemaining
                s.lapElapsedSeconds = t; s.elapsedSeconds = t
                s.skipFixedRest()
            }
        }
    }

    /// Un rato dentro de la pieza de ahora.
    @MainActor
    private func dentro(_ s: WorkoutSession, _ seg: Double) {
        s.lapElapsedSeconds += seg; s.elapsedSeconds += seg
    }

    /// El monitor cuenta: primera muestra en el arranque de la ventana, luego lo hecho.
    @MainActor
    private func erg(_ s: WorkoutSession, _ m: Monitor, metros: Double, cal: Int) {
        s.ergConnected = true
        s.sampleErg(paceSecPer500m: m.split, powerWatts: m.vatios, strokeRate: m.spm, distanceMeters: 0, caloriesKcal: 0)
        s.sampleErg(paceSecPer500m: m.split, powerWatts: m.vatios, strokeRate: m.spm, distanceMeters: metros, caloriesKcal: cal)
    }

    @MainActor
    private func gps(_ s: WorkoutSession, metros: Double) {
        s.lapGpsDistanceMeters = metros; s.lapHadGPS = true
    }

    // MARK: - 493 · rondas

    private let ski = Monitor(split: 121, spm: 41, vatios: 196)

    @MainActor
    func test493_estacionMedida() throws {
        let s = P.arranca(try C.sesion493())
        entra(s, segmento: 1); cierra(s, 1); dentro(s, 93)
        captura(s, "circuito-rondas-medida-ski", monitor: ski) { s in
            self.erg(s, self.ski, metros: 388, cal: 29); s.injectLiveHR(171, source: .strap)
        }
    }

    @MainActor
    func test493_descansoTrasLaEstacion() throws {
        let s = P.arranca(try C.sesion493())
        entra(s, segmento: 1); cierra(s, 1); dentro(s, 120)
        s.markRoundDone()
        captura(s, "circuito-rondas-medida-descanso") { s in s.injectLiveHR(169, source: .strap); s.fixedRestRemaining = 88 }
    }

    @MainActor
    func test493_sinMedir() throws {
        let s = P.arranca(try C.sesion493())
        entra(s, segmento: 1); cierra(s, 3); dentro(s, 73)
        captura(s, "circuito-rondas-sin-medir-bbj") { s in s.injectLiveHR(175, source: .strap) }
    }

    @MainActor
    func test493_carrera() throws {
        let s = P.arranca(try C.sesion493())
        entra(s, segmento: 1); cierra(s, 2); dentro(s, 246)
        captura(s, "circuito-rondas-carrera-run") { s in self.gps(s, metros: 927); s.injectLiveHR(170, source: .strap) }
    }

    @MainActor
    func test493_entraLaEstacion() throws {
        let s = P.arranca(try C.sesion493())
        entra(s, segmento: 1); cierra(s, 3); dentro(s, 2)
        captura(s, "circuito-rondas-carrera-entra-estacion") { s in s.injectLiveHR(165, source: .strap) }
    }

    // MARK: - 492 · la Estructura con parciales

    @MainActor
    func test492_estructura() throws {
        let s = P.arranca(try C.sesion492())
        entra(s, segmento: 0); cierra(s, 11); dentro(s, 52)
        s.markRoundDone()
        captura(s, "circuito-rondas-estructura", pagina: .estructura) { s in s.injectLiveHR(160, source: .strap); s.fixedRestRemaining = 80 }
    }

    // MARK: - HYROX

    /// El paso k de la estación n (0 = Run, 1 = Roxzone de entrada, 2 = estación, 3 = Roxzone de salida).
    private func enHyrox(_ n: Int, _ k: Int) -> Int { (n - 1) * 4 + k }

    @MainActor
    func testHyrox_run() throws {
        let s = P.arranca(try C.hyrox())
        entra(s, segmento: 0); cierra(s, enHyrox(5, 0)); dentro(s, 112)
        captura(s, "circuito-hyrox-run") { s in self.gps(s, metros: 407); s.injectLiveHR(171, source: .strap) }
    }

    @MainActor
    func testHyrox_runAlRitmoDelCoach() throws {
        let s = P.arranca(try C.hyrox(ritmoRun: P.ritmoKm(275, 285)))
        entra(s, segmento: 0); cierra(s, enHyrox(5, 0)); dentro(s, 108)
        captura(s, "circuito-hyrox-run-ritmo") { s in self.gps(s, metros: 405); s.injectLiveHR(170, source: .strap) }
    }

    @MainActor
    func testHyrox_ski() throws {
        let s = P.arranca(try C.hyrox())
        entra(s, segmento: 0); cierra(s, enHyrox(1, 2)); dentro(s, 150)
        let m = Monitor(split: 123, spm: 43, vatios: 188)
        captura(s, "circuito-hyrox-ski", monitor: m) { s in self.erg(s, m, metros: 623, cal: 45); s.injectLiveHR(172, source: .strap) }
    }

    @MainActor
    func testHyrox_sinMaquina() throws {
        let s = P.arranca(try C.hyrox())
        entra(s, segmento: 0); cierra(s, enHyrox(1, 2)); dentro(s, 152)
        captura(s, "circuito-hyrox-sin-maquina") { s in s.injectLiveHR(172, source: .strap) }
    }

    @MainActor
    func testHyrox_sled() throws {
        let s = P.arranca(try C.hyrox())
        entra(s, segmento: 0); cierra(s, enHyrox(2, 2)); dentro(s, 152)
        captura(s, "circuito-hyrox-sled-sled") { s in s.injectLiveHR(175, source: .strap) }
    }

    @MainActor
    func testHyrox_roxzoneDeSalida() throws {
        let s = P.arranca(try C.hyrox())
        entra(s, segmento: 0); cierra(s, enHyrox(2, 3)); dentro(s, 2)
        captura(s, "circuito-hyrox-sled-roxzone") { s in s.injectLiveHR(168, source: .strap) }
    }

    @MainActor
    func testHyrox_run3() throws {
        let s = P.arranca(try C.hyrox())
        entra(s, segmento: 0); cierra(s, enHyrox(3, 0)); dentro(s, 4)
        captura(s, "circuito-hyrox-sled-run3") { s in self.gps(s, metros: 14); s.injectLiveHR(162, source: .strap) }
    }

    @MainActor
    func testHyrox_roxzoneDeEntrada() throws {
        let s = P.arranca(try C.hyrox())
        entra(s, segmento: 0); cierra(s, enHyrox(8, 1)); dentro(s, 3)
        captura(s, "circuito-hyrox-entrada-roxzone") { s in s.injectLiveHR(171, source: .strap) }
    }

    @MainActor
    func testHyrox_wallBalls() throws {
        let s = P.arranca(try C.hyrox())
        entra(s, segmento: 0); cierra(s, enHyrox(8, 2)); dentro(s, 3)
        captura(s, "circuito-hyrox-entrada-wall-balls") { s in s.injectLiveHR(166, source: .strap) }
    }

    @MainActor
    func testHyrox_estructura() throws {
        let s = P.arranca(try C.hyrox())
        entra(s, segmento: 0); cierra(s, enHyrox(5, 0)); dentro(s, 112)
        captura(s, "circuito-hyrox-estructura", pagina: .estructura) { s in self.gps(s, metros: 407); s.injectLiveHR(171, source: .strap) }
    }

    // MARK: - Continuo remo → ski → bici

    @MainActor
    func testContinuo_remo() throws {
        let s = P.arranca(try C.continuo())
        entra(s, segmento: 0); dentro(s, 888)
        let m = Monitor(split: 128, spm: 26, vatios: 169)
        captura(s, "circuito-continuo-remo", monitor: m) { s in self.erg(s, m, metros: 3470, cal: 241); s.injectLiveHR(145, source: .strap) }
    }

    @MainActor
    func testContinuo_ski() throws {
        let s = P.arranca(try C.continuo())
        entra(s, segmento: 0); dentro(s, 900)
        s.jumpTo(1); entra(s, segmento: 1); dentro(s, 3)
        let m = Monitor(split: 135, spm: 38, vatios: 142)
        captura(s, "circuito-continuo-ski", monitor: m) { s in self.erg(s, m, metros: 11, cal: 1); s.injectLiveHR(142, source: .strap) }
    }

    @MainActor
    func testContinuo_bici() throws {
        let s = P.arranca(try C.continuo())
        entra(s, segmento: 0); dentro(s, 900)
        s.jumpTo(1); entra(s, segmento: 1); dentro(s, 900)
        s.jumpTo(2); entra(s, segmento: 2); dentro(s, 302)
        let m = Monitor(split: 62, spm: 86, vatios: 249)
        captura(s, "circuito-continuo-bici", monitor: m) { s in self.erg(s, m, metros: 2430, cal: 109); s.injectLiveHR(147, source: .strap) }
    }

    @MainActor
    func testContinuo_biciHorizontal() throws {
        let s = P.arranca(try C.continuo())
        entra(s, segmento: 0); dentro(s, 900)
        s.jumpTo(1); entra(s, segmento: 1); dentro(s, 900)
        s.jumpTo(2); entra(s, segmento: 2); dentro(s, 302)
        let m = Monitor(split: 62, spm: 86, vatios: 249)
        captura(s, "circuito-continuo-bici-horizontal", monitor: m, horizontal: true) { s in
            self.erg(s, m, metros: 2430, cal: 109); s.injectLiveHR(147, source: .strap)
        }
    }

    // MARK: - Libre

    @MainActor
    func testLibre_wallBalls() throws {
        let s = P.arranca(try C.libre())
        entra(s, segmento: 0); cierra(s, 4); dentro(s, 26)
        captura(s, "circuito-libre-wall-balls") { s in s.injectLiveHR(174, source: .strap) }
    }

    @MainActor
    func testLibre_row() throws {
        let s = P.arranca(try C.libre())
        entra(s, segmento: 0); cierra(s, 5); dentro(s, 4)
        let m = Monitor(split: 115, spm: 31, vatios: 230)
        captura(s, "circuito-libre-row", monitor: m) { s in self.erg(s, m, metros: 8, cal: 1); s.injectLiveHR(165, source: .strap) }
    }

    @MainActor
    func testLibre_estructura() throws {
        let s = P.arranca(try C.libre())
        entra(s, segmento: 0); cierra(s, 5); dentro(s, 7)
        let m = Monitor(split: 115, spm: 31, vatios: 230)
        captura(s, "circuito-libre-estructura", monitor: m, pagina: .estructura) { s in
            self.erg(s, m, metros: 20, cal: 1); s.injectLiveHR(165, source: .strap)
        }
    }
}
