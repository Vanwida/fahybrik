import XCTest
import SwiftUI
import UIKit
@testable import FAHYBRIK

// LA FAMILIA FUERZA, CAPTURADA — cada pantalla del contrato
// (`iphone-vivo-fuerza`, capturas `fuerza-*-390.png`) sobre el motor REAL con
// los planes de `VivoPlanesDePruebaFuerza`. Mismo nombre que la captura del
// contrato, para compararlas una a una. Lo que el vivo sabe y el motor no (lo
// declarado en la anotación, el dato encendido, el aviso de deshacer) entra por
// `VivoArranque`; los gestos que el contrato hace después de montar (cortar el
// descanso, la plancha que se cierra sola) pasan por el cableado de verdad.
//
// Clase propia (no una extensión de `VivoIphoneCapturasTests`): su arnés es
// privado y otras familias lo tocan en paralelo. El arnés de aquí es el mismo
// más el `VivoArranque`; cuando las cinco familias estén, se une en uno.
final class VivoIphoneCapturasFuerzaTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba
    private static let todo: Set<Vivo.CampoAnotar> = [.reps, .kg, .esfuerzo]

    /// Monta el vivo sobre el motor, deja pasar el tiempo y guarda la pantalla
    /// entera como adjunto (y en `FAHYBRIK_CAPTURAS` si está en el entorno).
    @MainActor
    private func captura(_ s: WorkoutSession, _ nombre: String, espera: TimeInterval = 0.8, arranque: VivoArranque = VivoArranque(),
                         trasMontar: (WorkoutSession) -> Void = { _ in }) {
        // El pulso, de una banda (el contrato: `MOVIL`, sin reloj ni máquina).
        let vista = VivoIphoneView(session: s, hrZones: s.hrZones, pm5: PM5ConnectionStore.shared,
                                   hrLink: .connected(name: "Banda"), treadmillLink: .idle, gpsActive: false, isBenchmark: false,
                                   alAccionDelHost: {}, alConectividad: {}, alTerminarYGuardar: {}, arranque: arranque)
            .environment(\.colorScheme, .dark)
        let host = UIHostingController(rootView: vista)
        let bounds = UIScreen.main.bounds
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
        if let destino = ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map({ URL(fileURLWithPath: $0) }) {
            try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
            try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
        }
    }

    // MARK: - Series rectas con RIR (P11, contado por ti)

    /// Back Squat serie 3/5 con la 1 y la 2 declaradas a 5 × 100 kg · RIR 2.
    @MainActor
    private func rectas() throws -> (WorkoutSession, VivoArranque) {
        let s = P.arranca(try P.p11()); P.irA(s, segmento: 0)
        P.declarada(s, 0, reps: 5, kg: 100, rir: 2); P.declarada(s, 1, reps: 5, kg: 100, rir: 2)
        return (s, VivoArranque(declaradas: ["s0-q0": Self.todo, "s0-q1": Self.todo]))
    }

    @MainActor func testFuerzaRectasSerie() throws {
        let (s, a) = try rectas()
        captura(s, "fuerza-rectas-serie", arranque: a) { s in s.injectLiveHR(130, source: .strap); s.elapsedSeconds = 304 }
    }

    @MainActor func testFuerzaRectasAnotarRir() throws {
        let (s, a0) = try rectas(); var a = a0
        s.primaryAdvance(fromAthleteTap: true)          // «Serie hecha»: la 3 se cierra y corre su descanso
        s.setSetRIR(2, 1)                                // se toca el RIR y baja a 1
        a.declaradas["s0-q2"] = [.esfuerzo]; a.foco = VivoFoco(id: "s0-q2", campo: .esfuerzo); a.aviso = "Serie 3 hecha"
        captura(s, "fuerza-rectas-anotar-rir", arranque: a) { s in s.injectLiveHR(146, source: .strap); s.elapsedSeconds = 309; s.restRemainingSeconds = 116.9 }
    }

    @MainActor func testFuerzaRectasConfirmado() throws {
        let (s, a0) = try rectas(); var a = a0
        s.primaryAdvance(fromAthleteTap: true)
        s.setSetRIR(2, 1)
        a.declaradas["s0-q2"] = Self.todo; a.foco = VivoFoco(id: "s0-q2", campo: .esfuerzo)
        captura(s, "fuerza-rectas-confirmado", arranque: a) { s in s.injectLiveHR(143, source: .strap); s.elapsedSeconds = 312; s.restRemainingSeconds = 113.9 }
    }

    // MARK: - Superserie A1 → A2 (529)

    @MainActor func testFuerzaSuperserieA1() throws {
        let s = P.arranca(try P.sesion529()); P.irA(s, segmento: 1)
        captura(s, "fuerza-superserie-a1") { s in s.injectLiveHR(126, source: .strap); s.elapsedSeconds = 487 }
    }

    @MainActor func testFuerzaSuperserieA2Deshacer() throws {
        let s = P.arranca(try P.sesion529()); P.irA(s, segmento: 1)
        s.primaryAdvance(fromAthleteTap: true)          // A1 serie 1 hecha: A2 entra sin descanso
        captura(s, "fuerza-superserie-a2-deshacer", arranque: VivoArranque(aviso: "A1 · serie 1 hecha")) { s in
            s.injectLiveHR(118, source: .strap); s.elapsedSeconds = 491
        }
    }

    // MARK: - Pirámide @75–85 % RM y la cascada (392)

    @MainActor
    private func piramide() throws -> (WorkoutSession, VivoArranque) {
        let s = P.arranca(try P.piramide392()); P.irA(s, segmento: 0)
        P.declarada(s, 0, reps: 6, kg: 140)
        return (s, VivoArranque(declaradas: ["s0-q0": Self.todo]))
    }

    @MainActor func testFuerzaPiramideSerie() throws {
        let (s, a) = try piramide()
        captura(s, "fuerza-piramide-serie", arranque: a) { s in s.injectLiveHR(126, source: .strap); s.elapsedSeconds = 188 }
    }

    @MainActor func testFuerzaPiramideCascada() throws {
        let (s, a0) = try piramide(); var a = a0
        s.primaryAdvance(fromAthleteTap: true)          // la serie 2 se cierra
        s.setSetLoadCascade(1, 145)                      // dos clics: 140 → 145, y baja en cascada
        a.declaradas["s0-q1"] = [.kg]; a.foco = VivoFoco(id: "s0-q1", campo: .kg); a.aviso = "Serie 2 hecha"
        captura(s, "fuerza-piramide-cascada", arranque: a) { s in s.injectLiveHR(146, source: .strap); s.elapsedSeconds = 193; s.restRemainingSeconds = 146.9 }
    }

    @MainActor func testFuerzaPiramideConfirmado() throws {
        let (s, a0) = try piramide(); var a = a0
        s.primaryAdvance(fromAthleteTap: true)
        s.setSetLoadCascade(1, 145)
        a.declaradas["s0-q1"] = Self.todo; a.foco = VivoFoco(id: "s0-q1", campo: .kg)
        captura(s, "fuerza-piramide-confirmado", arranque: a) { s in s.injectLiveHR(143, source: .strap); s.elapsedSeconds = 196; s.restRemainingSeconds = 143.9 }
    }

    // MARK: - Anotar en el descanso: propuesto → declarado → confirmado (529)

    /// El descanso de 2′ tras la ronda 1 (A1 → A2), nada declarado todavía.
    @MainActor
    private func rondaUno() throws -> WorkoutSession {
        let s = P.arranca(try P.sesion529()); P.irA(s, segmento: 1)
        s.primaryAdvance(fromAthleteTap: true); s.lastPrimaryAdvanceAt = nil
        s.primaryAdvance(fromAthleteTap: true)
        return s
    }

    @MainActor func testFuerzaAnotarPropuesto() throws {
        let s = try rondaUno()
        captura(s, "fuerza-anotar-propuesto") { s in s.injectLiveHR(104, source: .strap); s.elapsedSeconds = 642; s.restRemainingSeconds = 24.9 }
    }

    @MainActor func testFuerzaAnotarDeclarado() throws {
        let s = try rondaUno()
        s.setSetLoadCascade(0, 130)
        let a = VivoArranque(declaradas: ["s1-q0": [.kg]], foco: VivoFoco(id: "s1-q0", campo: .kg))
        captura(s, "fuerza-anotar-declarado", arranque: a) { s in s.injectLiveHR(105, source: .strap); s.elapsedSeconds = 645; s.restRemainingSeconds = 21.9 }
    }

    @MainActor func testFuerzaAnotarConfirmado() throws {
        let s = try rondaUno()
        s.setSetLoadCascade(0, 130)
        let a = VivoArranque(declaradas: ["s1-q0": Self.todo, "s1-q1": Self.todo], foco: VivoFoco(id: "s1-q0", campo: .kg))
        captura(s, "fuerza-anotar-confirmado", arranque: a) { s in s.injectLiveHR(105, source: .strap); s.elapsedSeconds = 648; s.restRemainingSeconds = 18.9 }
    }

    // MARK: - Última serie → siguiente ejercicio, sin atasco (529)

    /// A2 serie 4/4 hecha con las rondas 1–3 declaradas (125, 127,5, 127,5 kg; 6 saltos):
    /// corre el descanso que anota la ronda 4 y anuncia B1.
    @MainActor
    private func ultimaRonda() throws -> (WorkoutSession, VivoArranque) {
        let s = P.arranca(try P.sesion529()); P.irA(s, segmento: 1)
        for (r, kg) in [125.0, 127.5, 127.5].enumerated() {
            P.declarada(s, 2 * r, reps: 8, kg: kg); P.declarada(s, 2 * r + 1, reps: 6)
        }
        s.confirmSet(6); s.dismissRest()                  // A1 serie 4: hecha, sin declarar
        s.confirmSet(7)                                   // A2 serie 4: la última del bloque → su descanso de 2′
        var a = VivoArranque()
        for k in 0..<6 { a.declaradas["s1-q\(k)"] = Self.todo }
        return (s, a)
    }

    @MainActor func testFuerzaUltimaVieneB1() throws {
        let (s, a0) = try ultimaRonda(); var a = a0
        a.aviso = "A2 · serie 4 hecha"
        captura(s, "fuerza-ultima-viene-b1", arranque: a) { s in s.injectLiveHR(150, source: .strap); s.elapsedSeconds = 1082; s.restRemainingSeconds = 118.9 }
    }

    /// Confirmar y «Empezar ya»: el descanso se corta y el cableado del vivo entra en B1.
    @MainActor func testFuerzaUltimaB1Serie1() throws {
        let (s, a0) = try ultimaRonda(); var a = a0
        a.declaradas["s1-q6"] = Self.todo; a.declaradas["s1-q7"] = Self.todo; a.aviso = "Descanso cortado"
        captura(s, "fuerza-ultima-b1-serie-1", arranque: a) { s in
            s.injectLiveHR(120, source: .strap); s.elapsedSeconds = 1093
            s.dismissRest()
        }
        XCTAssertEqual(s.currentSegmentIndex, 2, "tras la última serie del bloque A, el vivo entra en B")
        XCTAssertFalse(s.isAwaitingBlockStart, "sin pararse en la puerta: el descanso ya anunciaba B1")
    }

    // MARK: - Plancha por tiempo con «Colócate» (538)

    /// Side Plank serie 2/3 a los 6″ (la 1 cerrada por el reloj).
    @MainActor
    private func plancha() throws -> WorkoutSession {
        let s = P.arranca(try P.sesion538()); P.irA(s, segmento: 0)
        s.confirmSet(0); s.dismissRest()
        return s
    }

    @MainActor func testFuerzaPlanchaSerie() throws {
        let s = try plancha()
        captura(s, "fuerza-plancha-serie") { s in s.injectLiveHR(126, source: .strap); s.elapsedSeconds = 32; s.lapElapsedSeconds += 6 }
    }

    /// A los 20″ la serie se cierra sola y entra «Colócate» con sus 5″.
    @MainActor func testFuerzaPlanchaColocate() throws {
        let s = try plancha()
        captura(s, "fuerza-plancha-colocate", espera: 1.3) { s in s.injectLiveHR(123, source: .strap); s.elapsedSeconds = 46; s.lapElapsedSeconds += 20 }
        XCTAssertEqual(s.pendingSetIndex, 2, "la serie 2 la cerró el reloj")
    }

    @MainActor func testFuerzaPlancha321() throws {
        let s = try plancha()
        captura(s, "fuerza-plancha-321", espera: 0.5) { s in
            s.injectLiveHR(123, source: .strap); s.elapsedSeconds = 48
            s.confirmSet(1); s.startRest(5); s.restRemainingSeconds = 2.6
        }
    }

    // MARK: - Libre

    @MainActor func testFuerzaLibreSerie() throws {
        let s = P.arranca(try P.libre()); P.irA(s, segmento: 0)
        P.declarada(s, 0, reps: 10, kg: 80)
        captura(s, "fuerza-libre-serie", arranque: VivoArranque(declaradas: ["s0-q0": Self.todo])) { s in
            s.injectLiveHR(125, source: .strap); s.elapsedSeconds = 138
        }
    }
}
