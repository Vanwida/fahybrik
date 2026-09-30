import XCTest
import SwiftUI
@testable import FAHYBRIK

// FH-95 — the pre-live athlete path must expose exactly ONE «Empezar» (Brief, acción `.empezar`).
final class PreWorkoutFlowSourceTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Workout/
            .deletingLastPathComponent()  // FAHYBRIKTests/
            .deletingLastPathComponent()  // ios/
    }

    /// The compiled text of a source file: whole-line comments (`//`, `///`,
    /// `// MARK:`) removed. FH-95's own comments NAME the button («the sole
    /// ▶ EMPEZAR», «not pre-live ▶ EMPEZAR») — they are not buttons. The rule
    /// counts what the athlete can tap, so it reads code, not prose.
    private func code(_ relativePath: String) throws -> String {
        let text = try String(contentsOf: iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
        return text.components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    func testBriefReadyToStartIsSoleEmpezarOnPreLivePath() throws {
        let brief = try code("FAHYBRIK/Workout/PreWorkoutBriefView.swift")
        // La sesión previa decide su acción en `LecturaSesionPrevia` y la pinta con `AccionAncladaPrevia`:
        // «Empezar» es UN solo `case .empezar` (el que suelta el vivo).
        XCTAssertEqual(brief.components(separatedBy: "case .empezar:").count - 1, 1)
        let hub = try code("FAHYBRIK/Workout/PreWorkoutDevicesHubView.swift")
        XCTAssertFalse(hub.contains("▶ EMPEZAR"))
        XCTAssertFalse(hub.contains("▶ Empezar"))
        let blockGate = try code("FAHYBRIK/Workout/BlockPreviewGate.swift")
        XCTAssertFalse(blockGate.contains("▶ EMPEZAR"))
        XCTAssertFalse(blockGate.contains(".empezar"))
        XCTAssertTrue(blockGate.contains("Arrancar bloque"))
    }

    func testSequentialStartStepMachineRemoved() throws {
        let eligibility = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Devices/PreWorkoutDevices.swift"))
        XCTAssertFalse(eligibility.contains("nextStartStep"))
        XCTAssertFalse(eligibility.contains("StartStep"))
        let ergFlow = iosRoot.appendingPathComponent("FAHYBRIK/Workout/ErgPreStartFlow.swift")
        XCTAssertFalse(FileManager.default.fileExists(atPath: ergFlow.path))
        let gate = iosRoot.appendingPathComponent("FAHYBRIK/Workout/SessionStartGate.swift")
        XCTAssertFalse(FileManager.default.fileExists(atPath: gate.path))
    }

    func testReleaseLiveLivesInOnePlace() throws {
        let release = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutReleaseLive.swift"))
        XCTAssertTrue(release.contains("PhoneLiveSession.shared.begin"))
        let brief = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutBriefView.swift"))
        XCTAssertTrue(brief.contains("PreWorkoutReleaseLive.release"))
    }

    /// El reloj no se pregunta: ni «Preparar grabación en el reloj», ni «Continuar sin
    /// reloj», ni puerta por el estado del reloj. Se lanza solo al empezar.
    func testWatchIsNeverAskedInThePreLiveFlow() throws {
        let release = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutReleaseLive.swift"))
        XCTAssertFalse(release.contains("prepWatchRecording"))
        XCTAssertFalse(release.contains("noteWatchPrepIntent"))
        let card = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutWatchCard.swift"))
        XCTAssertFalse(card.contains("Button"), "la tarjeta del reloj es solo informativa")
        XCTAssertFalse(card.contains("SecondaryButton"))
        XCTAssertFalse(card.contains("Continuar sin reloj"))
        XCTAssertFalse(card.contains("Preparar grabación"))
        XCTAssertFalse(card.contains("Esperando al reloj"))
        let brief = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PreWorkoutBriefView.swift"))
        XCTAssertFalse(brief.contains("prepWatchRecording"))
        XCTAssertFalse(brief.contains("watchUnavailable"))
        let policy = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIKCore/Workout/SessionStartPolicy.swift"))
        XCTAssertFalse(policy.contains("watchProceedWithoutWrist"))
        XCTAssertFalse(policy.contains("watchResolved"))
        let phone = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIK/Workout/PhoneLiveSession.swift"))
        XCTAssertFalse(phone.contains("noteWatchPrepIntent"))
        XCTAssertFalse(phone.contains("watchJoinStartedAt"))
        XCTAssertFalse(phone.contains("watchJoinHintSeconds"))
    }

    // FH-56 — a redundant/compatible `handle(_:)` is decided by ONE pure policy
    // (`WatchPrimaryLifecycle.startAction` → re-mirror, never ignore, never end);
    // the homemade «mirror channel alive» watchdog behind the old
    // `shouldIgnoreRedundantStart` / `shouldFinishBeforeRestart` is gone.
    func testWatchStartIsDecidedByStartActionNotByHomemadeWatchdog() throws {
        let owner = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIKWatch/WatchPrimaryOwner.swift"))
        let lifecycle = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIKCore/Workout/WatchPrimaryLifecycle.swift"))
        let policy = try String(contentsOf: iosRoot.appendingPathComponent("FAHYBRIKCore/Watch/MirrorPrimaryLaunchPolicy.swift"))
        XCTAssertTrue(owner.contains("WatchPrimaryLifecycle.startAction("))
        XCTAssertTrue(owner.contains("MirrorPrimaryLaunchPolicy.configurationsCompatible("))
        XCTAssertTrue(owner.contains("WatchPrimaryLifecycle.shouldForceIdleFromStuckEnding("))
        XCTAssertTrue(owner.contains("case .remirror:"), "compatible redundant start re-mirrors")
        XCTAssertTrue(lifecycle.contains("static func startAction("))
        XCTAssertTrue(lifecycle.contains("enum Link"), "the link is Apple's, not a watchdog")
        XCTAssertFalse(policy.contains("static func shouldIgnoreRedundantStart"))
        XCTAssertFalse(policy.contains("static func shouldFinishBeforeRestart"))
        XCTAssertFalse(policy.contains("mirrorChannelAlive"))
        XCTAssertFalse(owner.contains("mirrorChannelAlive"))
        XCTAssertFalse(owner.contains("reconcileIdleBeforeLaunch"))
    }
}

// La tarjeta del reloj del brief y los chips del reloj en el vivo, RENDERIZADOS de
// verdad: informativos, sin botones, en el castellano del box. Sitio de donde salen
// las capturas (`FAHYBRIK_CAPTURAS=<carpeta>`); sin la variable no escribe nada.
final class RelojInformativoRenderTests: XCTestCase {

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    @MainActor
    private func render(_ vista: some View, ancho: CGFloat = 402, alto: CGFloat, nombre: String) throws {
        let renderer = ImageRenderer(
            content: vista
                .padding(20)
                .frame(width: ancho, height: alto, alignment: .topLeading)
                .background(Theme.Color.background)
                .environment(\.colorScheme, .dark)
        )
        renderer.scale = 3
        let imagen = try XCTUnwrap(renderer.uiImage, nombre)
        guard let png = imagen.pngData() else { return }
        let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        add(adjunto)
        if let destino {
            try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
            try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
        }
    }

    @MainActor
    func testLaTarjetaDelRelojDelBriefEnSusDosEstados() throws {
        WatchPresence.shared.refresh(paired: true, installed: true)
        try render(PreWorkoutWatchCard(mirror: PhoneLiveSession.shared), alto: 120,
                   nombre: "brief-reloj-listo")
        WatchPresence.shared.refresh(paired: false, installed: false)
        try render(PreWorkoutWatchCard(mirror: PhoneLiveSession.shared), alto: 120,
                   nombre: "brief-sin-apple-watch")
    }

    @MainActor
    func testLosChipsDelRelojEnElVivo() throws {
        let estados: [(String, Vivo.Dispositivos.Reloj)] = [
            ("vivo-reloj-conectando", .conectando),
            ("vivo-reloj-grabando", .segundaPantalla),
            ("vivo-reloj-sin-conexion", .sinConexion),
        ]
        for (nombre, reloj) in estados {
            let paso = Vivo.Paso(id: "chip", clase: .series, rol: .trabajo, fase: .principal,
                                 medida: .init(tipo: .distancia, prescrito: 1000, mide: .gps))
            let chips = Vivo.enlacesDe(.init(reloj: reloj, maquina: nil, pulsometro: .banda),
                                       paso, Vivo.Lecturas(t: 60, hecho: nil, ritmo: nil, ppm: 160))
            let chip = try XCTUnwrap(chips.first { $0.clave == .reloj })
            try render(VStack(alignment: .leading, spacing: 8) {
                VivoChip(chip: chip)
                if let nota = chip.nota { Text(nota).font(.footnote).foregroundStyle(.secondary) }
            }, alto: 90, nombre: nombre)
        }
    }
}
