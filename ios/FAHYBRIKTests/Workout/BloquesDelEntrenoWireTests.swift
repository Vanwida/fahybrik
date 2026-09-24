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

    // EL INTERRUPTOR DE ACCESIBILIDAD — sin él la cosecha sale vacía.
    //
    // SwiftUI no publica su árbol de accesibilidad (los `accessibilityLabel` de
    // sus `Button`) a quien lo lea desde dentro del proceso salvo que la
    // automatización de accesibilidad esté encendida, que es lo que hacen
    // XCUITest y VoiceOver. Apagada, `recolectar` no ve NINGÚN botón: fallaban
    // los cinco tests a la vez, también el `BotonVerBloques` suelto, que no tiene
    // cable ninguno. Es el mismo interruptor que KIF (`KIFEnableAccessibility`) y
    // AccessibilitySnapshot (`ASAccessibilityEnabler`). Se deja como estaba al
    // acabar la clase: la suite corre en orden aleatorio.
    private enum Automatizacion {
        typealias Lee = @convention(c) () -> Int32
        typealias Pone = @convention(c) (Int32) -> Void

        static let simbolos: (lee: Lee, pone: Pone)? = {
            let ruta = "/usr/lib/libAccessibility.dylib"
            var candidatas = [ruta]
            if let raiz = ProcessInfo.processInfo.environment["IPHONE_SIMULATOR_ROOT"] {
                candidatas.insert((raiz as NSString).appendingPathComponent(ruta), at: 0)
            }
            var handle: UnsafeMutableRawPointer?
            for candidata in candidatas where handle == nil {
                handle = dlopen(candidata, RTLD_NOW | RTLD_LOCAL)
            }
            guard let handle,
                  let lee = dlsym(handle, "_AXSAutomationEnabled"),
                  let pone = dlsym(handle, "_AXSSetAutomationEnabled") else { return nil }
            return (unsafeBitCast(lee, to: Lee.self), unsafeBitCast(pone, to: Pone.self))
        }()

        static var previa: Int32?
    }

    override class func setUp() {
        super.setUp()
        guard let ax = Automatizacion.simbolos else { return }
        Automatizacion.previa = ax.lee()
        ax.pone(1)
        // El cambio se anuncia por notificación: una vuelta de bucle para que
        // UIKit/SwiftUI la reciban antes del primer anfitrión.
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
    }

    override class func tearDown() {
        if let ax = Automatizacion.simbolos, let previa = Automatizacion.previa {
            ax.pone(previa)
        }
        super.tearDown()
    }

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
            canGoBack: false, onStartBlock: {}, onBack: {}, onExit: {},
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
        let vista = ShellDePrueba(session: s)
        XCTAssertTrue(etiquetas(de: vista).contains(etiqueta),
                      "calle monta RunLiveShellView — el botón va en CromoVivoEntreno")
    }

    @MainActor
    func testLaCintaLlevaElBoton() {
        let s = sesionDeRodaje()
        s.runEnvironment = .treadmill
        s.start(); s.beginBlock(); s.stop()
        XCTAssertEqual(RunLiveChrome.de(s), .treadmill(empiezaSinCinta: false))
        let vista = ShellDePrueba(session: s)
        XCTAssertTrue(etiquetas(de: vista).contains(etiqueta),
                      "cinta monta RunLiveShellView — el botón va en CromoVivoEntreno, no en TreadmillHUDView")
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
                      "fuerza / EMOM usan CromoVivoEntreno compartido")
        UIApplication.shared.isIdleTimerDisabled = false
    }

    // MARK: - Andamio

    /// El único árbol live — misma forma que `ActiveWorkoutView.superficieMontada`.
    private struct ShellDePrueba: View {
        let session: WorkoutSession
        @State private var partnerStripCollapsed = false

        var body: some View {
            RunLiveShellView(
                session: session,
                hrZones: nil,
                accionTitulo: "HECHO",
                alTocarAccion: {},
                alSalir: {},
                alVerBloques: {},
                alConectividad: {},
                alTapPM5: {},
                alTapHR: {},
                alPausa: {},
                pm5: PM5Pool.shared.any,
                hrLink: .idle,
                partnerStripCollapsed: $partnerStripCollapsed
            )
        }
    }

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
        XCTAssertNotNil(Automatizacion.simbolos,
                        "sin libAccessibility no se enciende la automatización y SwiftUI no publica ninguna etiqueta")
        let host = UIHostingController(rootView: vista.environment(\.colorScheme, .dark))
        let window = UIWindow(frame: CGRect(origin: .zero, size: Self.lienzo))
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer {
            // Misma higiene que `Volcado`: una ventana clave viva se la lleva
            // puesta la prueba de al lado en una suite en orden aleatorio.
            window.isHidden = true
            window.rootViewController = nil
        }
        host.view.frame = window.bounds
        host.view.layoutIfNeeded()
        // Una vuelta de bucle, como `Volcado`: hay bandas que se colocan en dos
        // pasadas (se miden con una preferencia).
        RunLoop.current.run(until: Date())
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
