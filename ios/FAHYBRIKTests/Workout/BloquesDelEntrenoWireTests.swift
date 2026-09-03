import XCTest
import SwiftUI
import UIKit
@testable import FAHYBRIK

// EL CABLE DEL PRESENTADOR — la hoja ya existía; faltaba quién la abre.
//
// Cuatro cromos, un solo disparador (`mostrarBloques = true`) y la misma
// etiqueta de `afd8d289`. FH-55 partió calle/cinta; FH-66 XOR puerta/live.
// Pegar el botón solo en `topStrip` deja ciegos a los otros tres.

final class BloquesDelEntrenoWireTests: XCTestCase {

    private static let lienzo = CGSize(width: 402, height: 874)
    private let etiqueta = "Ver el entreno entero"

    @MainActor
    func testElBotonDiceLaMismaEtiquetaDeAgosto() {
        XCTAssertTrue(etiquetas(de: BotonVerBloques(accion: {})).contains(etiqueta))
    }

    @MainActor
    func testLaPuertaLlevaElBoton() {
        let s = sesionDosBloques()
        s.start()
        XCTAssertEqual(PresentadorVivo.de(s), .puerta)
        s.stop()
        let vista = BlockPreviewGate(
            title: "Calentamiento", phaseTag: nil,
            blockNumber: 1, blockCount: 2, formatLabel: nil,
            segments: Array(s.plan.segments.prefix(1)),
            canGoBack: false, onEmpezar: {}, onBack: {}, onExit: {},
            alVerBloques: {}
        )
        XCTAssertTrue(etiquetas(de: vista).contains(etiqueta),
                      "sin el botón en la puerta no se puede saltar el calentamiento")
    }

    @MainActor
    func testLaCalleLlevaElBoton() {
        let s = sesionDeRodaje()
        s.runEnvironment = .outdoor
        s.start(); s.beginBlock(); s.stop()
        XCTAssertEqual(RunLiveChrome.de(s), .outdoor)
        let vista = OutdoorRunHUDView(session: s, hrZones: nil,
                                      alSalir: {}, alVerBloques: {})
        XCTAssertTrue(etiquetas(de: vista).contains(etiqueta),
                      "calle no hereda topStrip — el botón va en su cromo")
    }

    @MainActor
    func testLaCintaLlevaElBoton() {
        let s = sesionDeRodaje()
        s.runEnvironment = .treadmill
        s.start(); s.beginBlock(); s.stop()
        XCTAssertEqual(RunLiveChrome.de(s), .treadmill(empiezaSinCinta: false))
        let vista = TreadmillHUDView(session: s, hrZones: nil,
                                     alSalir: {}, alVerBloques: {})
        XCTAssertTrue(etiquetas(de: vista).contains(etiqueta),
                      "cinta no hereda topStrip — el botón va en su header")
    }

    @MainActor
    func testElTopStripDelLiveLlevaElBoton() {
        let s = sesionDosBloques()
        s.start()
        s.irAlBloque(s.bloques[1])
        s.beginBlock()
        s.stop()
        XCTAssertEqual(PresentadorVivo.de(s), .live(.fuerza))
        let vista = ActiveWorkoutView(session: s, onFinish: {}, onExit: {})
        XCTAssertTrue(etiquetas(de: vista).contains(etiqueta),
                      "HostVivo / fuerza / EMOM leen el botón de topStrip")
        UIApplication.shared.isIdleTimerDisabled = false
    }

    // MARK: - Andamio

    private func sesionDosBloques() -> WorkoutSession {
        let wu = WorkoutSegment(order: 1, title: "Movilidad", kind: .reps,
                                blockTitle: "Calentamiento", blockPosition: 1)
        let series = (0..<3).map { _ in
            PrescriptionSet(measure: .reps(5), target: nil, modality: nil,
                            restS: nil, tempo: nil, note: nil)
        }
        let fuerza = WorkoutSegment(
            order: 2, title: "Peso muerto", kind: .strength, targetReps: 5,
            blockTitle: "Fuerza", blockPosition: 2,
            prescription: Prescription(scheme: .sets, modality: nil, sets: series,
                                       rounds: nil, workS: nil, restS: nil, totalS: nil,
                                       target: nil, note: nil, start: nil, increment: nil))
        let plan = WorkoutPlan(id: UUID(), name: "Calentamiento + fuerza", format: .sets,
                               estimatedDurationSeconds: 2400, blockContext: "Fuerza",
                               zoneTargets: [], equipment: [], segments: [wu, fuerza],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        return WorkoutSession(plan: plan)
    }

    private func sesionDeRodaje() -> WorkoutSession {
        let tramo = WorkoutSegment(order: 1, title: "Rodaje 40:00", kind: .running,
                                   targetDurationSeconds: 2400, targetZone: .z2,
                                   blockTitle: "Carrera", blockPosition: 1)
        let plan = WorkoutPlan(id: UUID(), name: "Rodaje", format: .steady,
                               estimatedDurationSeconds: 2400, blockContext: "Carrera",
                               zoneTargets: [], equipment: [], segments: [tramo],
                               coachNote: nil, demoVideoUrl: nil, warmupChecklist: [])
        return WorkoutSession(plan: plan)
    }

    @MainActor
    private func etiquetas(de vista: some View) -> [String] {
        let host = UIHostingController(rootView: vista.environment(\.colorScheme, .dark))
        let window = UIWindow(frame: CGRect(origin: .zero, size: Self.lienzo))
        window.rootViewController = host
        window.makeKeyAndVisible()
        host.view.frame = window.bounds
        host.view.layoutIfNeeded()
        return recolectar(host.view)
    }

    private func recolectar(_ elemento: Any) -> [String] {
        var out: [String] = []
        if let obj = elemento as? NSObject, let label = obj.accessibilityLabel, !label.isEmpty {
            out.append(label)
        }
        if let hijos = (elemento as AnyObject).accessibilityElements as? [Any] {
            out.append(contentsOf: hijos.flatMap(recolectar))
        }
        if let view = elemento as? UIView {
            out.append(contentsOf: view.subviews.flatMap(recolectar))
        }
        return out
    }
}
