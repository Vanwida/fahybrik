import XCTest
import SwiftUI
import UIKit
@testable import FAHYBRIK

// LAS CAPTURAS DEL WOD — cada escenario del contrato (`screens/iphone-vivo-wod/`,
// capturas `wod-*-390.png`) montado sobre un motor REAL con el plan del coach, y
// sus gestos (Hecho, +1 ronda, los ± de la puntuación, Guardar) por el MISMO
// camino que el dedo (`VivoIphoneView.guion`). Varias fotos por escenario: antes
// y después del gesto. Mismo patrón que `VivoIphoneCapturasTests`: adjuntos
// que se quedan en el .xcresult y, si `FAHYBRIK_CAPTURAS` está, a esa carpeta.
extension VivoIphoneCapturasTests {

    private typealias W = VivoPlanesDePrueba

    /// Una foto a los `en` segundos de montar.
    struct Foto { let nombre: String; let en: TimeInterval }

    /// El vivo sobre el motor `s`, con lo marcado del WOD y un guion; una foto por instante.
    @MainActor
    private func fotos(_ s: WorkoutSession, _ fotos: [Foto], wod: Vivo.EstadoWod = .init(), guion: [VivoGestoGuion] = [],
                       remo: Bool = false, trasMontar: (WorkoutSession) -> Void = { _ in }) {
        let pm5 = PM5ConnectionStore.shared
        let antes = (pm5.connectionState, pm5.live)
        if remo { pm5.connectionState = .streaming }
        let vista = VivoIphoneView(session: s, hrZones: s.hrZones, pm5: pm5,
                                   hrLink: .connected(name: "Banda"), treadmillLink: .idle, gpsActive: false, isBenchmark: false,
                                   alAccionDelHost: {}, alConectividad: {}, alTerminarYGuardar: {},
                                   wodInicial: wod, guion: guion)
            .environment(\.colorScheme, .dark)
        let host = UIHostingController(rootView: vista)
        let bounds = UIScreen.main.bounds
        let escena = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = escena.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: bounds)
        window.frame = bounds
        window.overrideUserInterfaceStyle = .dark
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer {
            s.stop(); window.isHidden = true; window.rootViewController = nil
            pm5.connectionState = antes.0; pm5.live = antes.1
        }
        host.view.frame = bounds
        host.view.layoutIfNeeded()
        trasMontar(s)
        let destino = ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
        let inicio = Date()
        for f in fotos {
            RunLoop.current.run(until: inicio.addingTimeInterval(f.en))
            host.view.layoutIfNeeded()
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            let fmt = UIGraphicsImageRendererFormat(); fmt.scale = 3
            let img = UIGraphicsImageRenderer(bounds: bounds, format: fmt).image { _ in
                if !host.view.drawHierarchy(in: bounds, afterScreenUpdates: true) { host.view.layer.render(in: UIGraphicsGetCurrentContext()!) }
            }
            guard let png = img.pngData() else { XCTFail("sin png \(f.nombre)"); continue }
            let a = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            a.name = f.nombre; a.lifetime = .keepAlways; add(a)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(f.nombre).png"))
            }
        }
    }

    /// Los ids de los pasos por índice (el plan del adaptador), para sembrar lo marcado.
    @MainActor
    private func hechas(_ s: WorkoutSession, _ porIndice: [Int: Double]) -> Vivo.EstadoWod {
        let pasos = Vivo.planDe(s.plan, zonas: s.hrZones, entorno: s.runEnvironment).pasos
        return Vivo.EstadoWod(hechas: Dictionary(uniqueKeysWithValues: porIndice.map { (pasos[$0.key].id, $0.value) }))
    }

    /// Coloca el reloj de la ventana en su segundo `t` (y el de la sesión).
    @MainActor
    private func enVentana(_ s: WorkoutSession, t: Double, sesion: Double) {
        s.syncTramoIfNeeded()
        s.tramoStartElapsed = s.lapElapsedSeconds - t
        s.elapsedSeconds = sesion
    }

    // MARK: - EMOM 498

    @MainActor
    private func emomEnMinuto(_ k: Int) throws -> WorkoutSession {
        let s = W.arranca(try W.emom498())
        s.skipCountIn()
        for _ in 0..<k { s.primaryAdvance() }
        return s
    }

    @MainActor
    func testWodEmomRemo() throws {
        let s = try emomEnMinuto(3)
        fotos(s, [Foto(nombre: "wod-emom-remo", en: 1.2)], wod: hechas(s, [0: 22, 2: 21]), remo: true) { s in
            s.ergConnected = true
            self.enVentana(s, t: 24, sesion: 204)
            s.emomPhaseRemaining = 36
            // El monitor al empezar el minuto y ahora: los metros y calorías de ESTE minuto son la diferencia.
            s.sampleErg(paceSecPer500m: 132, powerWatts: 160, strokeRate: 28, distanceMeters: 225, caloriesKcal: 18)
            s.sampleErg(paceSecPer500m: 132, powerWatts: 160, strokeRate: 28, distanceMeters: 316, caloriesKcal: 25)
            PM5ConnectionStore.shared.live.paceSecondsPer500m = 132
            s.injectLiveHR(151, source: .strap)
        }
    }

    @MainActor
    func testWodEmomCarga() throws {
        let s = try emomEnMinuto(4)
        fotos(s, [Foto(nombre: "wod-emom-carga-tarea", en: 1.0), Foto(nombre: "wod-emom-carga-respiro", en: 2.4)],
              wod: hechas(s, [0: 22, 2: 21]), guion: [VivoGestoGuion(en: 1.5, gesto: .primaria)]) { s in
            self.enVentana(s, t: 19, sesion: 259)
            s.emomPhaseRemaining = 41
            s.injectLiveHR(134, source: .strap)
        }
    }

    // MARK: - AMRAP

    @MainActor
    private func amrapEn(_ plan: WorkoutPlan, rondas: Int, t: Double) -> WorkoutSession {
        let s = W.arranca(plan)
        s.tickConditioning(dt: 3.5)
        for _ in 0..<rondas { s.bumpAmrapRound() }
        s.condStartElapsed = s.lapElapsedSeconds - t
        s.elapsedSeconds = t
        return s
    }

    @MainActor
    func testWodAmrapRemo() throws {
        let s = amrapEn(try W.amrapRemo(), rondas: 3, t: 575)
        fotos(s, [Foto(nombre: "wod-amrap-remo-ronda4", en: 1.0), Foto(nombre: "wod-amrap-remo-mas1", en: 2.4)],
              guion: [VivoGestoGuion(en: 1.5, gesto: .primaria)], remo: true) { s in
            s.ergConnected = true
            s.sampleErg(paceSecPer500m: 127, powerWatts: 170, strokeRate: 30, distanceMeters: 1000, caloriesKcal: 60)
            PM5ConnectionStore.shared.live.paceSecondsPer500m = 127
            s.injectLiveHR(168, source: .strap)
        }
    }

    @MainActor
    func testWodAmrapCampana() throws {
        let s = amrapEn(try W.amrapRemo(), rondas: 5, t: 720.5)
        s.tickConditioning(dt: 0.25)
        s.elapsedSeconds = 720
        XCTAssertTrue(s.isAwaitingFinishDecision, "la campana: el motor espera la puntuación")
        fotos(s, [Foto(nombre: "wod-amrap-campana-campana", en: 1.0), Foto(nombre: "wod-amrap-campana-reps", en: 2.4),
                  Foto(nombre: "wod-amrap-campana-guardado", en: 3.6)],
              guion: [VivoGestoGuion(en: 1.4, gesto: .puntuacion(10)), VivoGestoGuion(en: 1.7, gesto: .puntuacion(6)),
                      VivoGestoGuion(en: 3.0, gesto: .primaria)]) { s in
            s.injectLiveHR(171, source: .strap)
        }
        XCTAssertTrue(s.isFinished, "Guardar cierra la sesión")
        XCTAssertEqual(s.capturedScoreRounds, 5)
        XCTAssertEqual(s.capturedScoreReps, 16)
    }

    @MainActor
    func testWodAmrapLibre() throws {
        let s = amrapEn(try W.amrapLibre(), rondas: 9, t: 612)
        fotos(s, [Foto(nombre: "wod-amrap-libre", en: 1.0)]) { s in s.injectLiveHR(171, source: .strap) }
    }

    // MARK: - For Time · chipper

    /// Cierra las primeras `n` estaciones, cada una con su parcial.
    @MainActor
    private func chipperEn(estacion n: Int, t: Double, total: Double) throws -> WorkoutSession {
        let s = W.arranca(try W.chipper10(), entorno: .outdoor)
        s.tickConditioning(dt: 3.5)
        let parciales: [Double] = [62, 118, 78, 71, 64, 55, 68, 92]
        for k in 0..<n {
            s.syncTramoIfNeeded()
            s.tramoStartElapsed = s.lapElapsedSeconds - parciales[k]
            s.markRoundDone()
        }
        s.condStartElapsed = s.lapElapsedSeconds - total
        s.elapsedSeconds = total
        enVentana(s, t: t, sesion: total)
        return s
    }

    @MainActor
    func testWodChipper() throws {
        let s = try chipperEn(estacion: 1, t: 48, total: 110)
        fotos(s, [Foto(nombre: "wod-chipper-wallball", en: 1.0), Foto(nombre: "wod-chipper-remo", en: 2.4)],
              guion: [VivoGestoGuion(en: 1.5, gesto: .primaria)], remo: true) { s in
            s.injectLiveHR(169, source: .strap)
        }
    }

    @MainActor
    func testWodChipperCap() throws {
        let s = try chipperEn(estacion: 8, t: 41, total: 1428)
        fotos(s, [Foto(nombre: "wod-chipper-cap", en: 1.0)]) { s in s.injectLiveHR(169, source: .strap) }
    }

    // MARK: - Tabata

    /// Hasta la ronda `r` (0-based), en su trabajo; `descanso` = ya en los 10″ de después.
    @MainActor
    private func tabataEn(ronda r: Int, descanso: Bool, quedan: Double, sesion: Double) throws -> WorkoutSession {
        let s = W.arranca(try W.tabataBurpee())
        s.tickConditioning(dt: 3.5)
        for _ in 0..<r { s.tickConditioning(dt: 20); s.tickConditioning(dt: 10) }
        if descanso { s.tickConditioning(dt: 20) }
        s.rotPhaseRemaining = quedan
        enVentana(s, t: (descanso ? 10 : 20) - quedan, sesion: sesion)
        return s
    }

    @MainActor
    func testWodTabata() throws {
        let s = try tabataEn(ronda: 3, descanso: false, quedan: 8, sesion: 102)
        fotos(s, [Foto(nombre: "wod-tabata", en: 1.0)]) { s in s.injectLiveHR(177, source: .strap) }
    }

    @MainActor
    func testWodTabataDescanso() throws {
        let s = try tabataEn(ronda: 3, descanso: true, quedan: 8, sesion: 112)
        fotos(s, [Foto(nombre: "wod-tabata-descanso", en: 1.0)]) { s in s.injectLiveHR(176, source: .strap) }
    }

    // MARK: - Death by

    @MainActor
    private func deathByEn(minuto k: Int, t: Double, sesion: Double) throws -> WorkoutSession {
        let s = W.arranca(try W.deathByBurpee())
        s.tickConditioning(dt: 3.5)
        for _ in 0..<k { s.tickConditioning(dt: 60) }
        s.rotPhaseRemaining = 60 - t
        enVentana(s, t: t, sesion: sesion)
        return s
    }

    @MainActor
    func testWodDeathBy() throws {
        let s = try deathByEn(minuto: 6, t: 19, sesion: 379)
        fotos(s, [Foto(nombre: "wod-deathby-minuto", en: 1.0), Foto(nombre: "wod-deathby-hecho", en: 2.4)],
              wod: hechas(s, [0: 6, 1: 9, 2: 13, 3: 18, 4: 24, 5: 31]), guion: [VivoGestoGuion(en: 1.5, gesto: .primaria)]) { s in
            s.injectLiveHR(169, source: .strap)
        }
    }

    @MainActor
    func testWodDeathByCazado() throws {
        let s = try deathByEn(minuto: 9, t: 57.5, sesion: 597)
        fotos(s, [Foto(nombre: "wod-deathby-cazado-quedan", en: 0.8), Foto(nombre: "wod-deathby-cazado-cazado", en: 4.4)],
              wod: hechas(s, [0: 6, 1: 9, 2: 13, 3: 18, 4: 24, 5: 31, 6: 37, 7: 45, 8: 52])) { s in
            s.injectLiveHR(180, source: .strap)
        }
        XCTAssertTrue(s.isFinished, "el reloj te caza: se acabó")
        XCTAssertEqual(s.capturedScoreRounds, 9, "la puntuación son los minutos marcados, no el que te cazó")
    }
}
