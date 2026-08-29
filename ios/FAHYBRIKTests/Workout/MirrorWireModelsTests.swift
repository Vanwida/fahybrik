import XCTest
@testable import FAHYBRIK

// Mirror wire contract (#68 mirror fix): the countIn phase is ADDITIVE — a new VALUE
// in the existing `phase` string, not a new field. A countIn frame round-trips through
// the envelope, and an OLDER frame (a phase this build predates, or a minimal frame
// missing the optional content) still decodes, so an old phone ↔ new watch never
// breaks on the addition.
final class MirrorWireModelsTests: XCTestCase {

    private func sampleFrame(phase: String, countdown: Double?) -> MirrorStateFrame {
        MirrorStateFrame(
            phase: phase, blockTitle: "Series", lineTitle: "800 m",
            detailLine: "4:25–4:35/km", progressText: "TRAMO 1/3",
            sessionElapsed: 42, lapElapsed: 7, countdownRemaining: countdown,
            targetZone: 2, isFinalStep: nil, restRemaining: nil
        )
    }

    // MARK: - countIn frame survives the envelope round-trip

    func testCountInFrameRoundTripsThroughEnvelope() throws {
        let f = sampleFrame(phase: MirrorWire.Phase.countIn, countdown: 3)
        let data = try XCTUnwrap(MirrorEnvelope.encoding(type: MirrorWire.MessageType.frame, f))
        let env = try XCTUnwrap(MirrorEnvelope.decoding(data))
        XCTAssertEqual(env.type, MirrorWire.MessageType.frame)
        let back = try XCTUnwrap(env.body(as: MirrorStateFrame.self))
        XCTAssertEqual(back, f)
        XCTAssertEqual(back.phase, MirrorWire.Phase.countIn)
        XCTAssertEqual(back.countdownRemaining, 3)
    }

    func testEveryKnownPhaseRoundTrips() throws {
        for phase in [MirrorWire.Phase.gate, MirrorWire.Phase.countIn,
                      MirrorWire.Phase.active, MirrorWire.Phase.paused, MirrorWire.Phase.finished] {
            let f = sampleFrame(phase: phase, countdown: nil)
            let data = try XCTUnwrap(MirrorEnvelope.encoding(type: MirrorWire.MessageType.frame, f))
            let back = try XCTUnwrap(MirrorEnvelope.decoding(data)?.body(as: MirrorStateFrame.self))
            XCTAssertEqual(back.phase, phase)
        }
    }

    // MARK: - Old / minimal frames still decode (additive, tolerant)

    func testMinimalOldFrameDecodes() throws {
        // An OLDER phone that sent only the required fields (all content is optional)
        // still decodes — nothing added by this fix is required on the wire.
        let json = Data(#"{"phase":"active","sessionElapsed":10,"lapElapsed":2}"#.utf8)
        let f = try MirrorWire.decoder.decode(MirrorStateFrame.self, from: json)
        XCTAssertEqual(f.phase, MirrorWire.Phase.active)
        XCTAssertNil(f.lineTitle)
        XCTAssertNil(f.progressText)
        XCTAssertNil(f.countdownRemaining)
    }

    func testUnknownPhaseDecodesTolerantly() throws {
        // A phase value this build doesn't know is still a valid string — the HUD falls
        // to its active branch rather than failing the whole decode.
        let json = Data(#"{"phase":"someFuturePhase","sessionElapsed":1,"lapElapsed":1}"#.utf8)
        let f = try MirrorWire.decoder.decode(MirrorStateFrame.self, from: json)
        XCTAssertEqual(f.phase, "someFuturePhase")
    }

    // MARK: - Haptic cue message (phone engine → wrist)

    func testHapticCueRoundTripsThroughEnvelope() throws {
        let h = MirrorHaptic(cue: MirrorWire.HapticCue.go, seq: 7)
        let data = try XCTUnwrap(MirrorEnvelope.encoding(type: MirrorWire.MessageType.haptic, h))
        let env = try XCTUnwrap(MirrorEnvelope.decoding(data))
        XCTAssertEqual(env.type, MirrorWire.MessageType.haptic)
        let back = try XCTUnwrap(env.body(as: MirrorHaptic.self))
        XCTAssertEqual(back.cue, MirrorWire.HapticCue.go)
        XCTAssertEqual(back.seq, 7)
    }

    func testFrameEmbeddedHapticRoundTrips() throws {
        var f = sampleFrame(phase: MirrorWire.Phase.active, countdown: nil)
        f.hapticCue = MirrorWire.HapticCue.tick
        f.hapticSeq = 3
        let data = try XCTUnwrap(MirrorEnvelope.encoding(type: MirrorWire.MessageType.frame, f))
        let back = try XCTUnwrap(MirrorEnvelope.decoding(data)?.body(as: MirrorStateFrame.self))
        XCTAssertEqual(back.hapticCue, MirrorWire.HapticCue.tick)
        XCTAssertEqual(back.hapticSeq, 3)
    }

    func testAllHapticCueNamesRoundTrip() throws {
        let cues = [
            MirrorWire.HapticCue.tick,
            MirrorWire.HapticCue.go,
            MirrorWire.HapticCue.stop,
            MirrorWire.HapticCue.finish,
        ]
        for cue in cues {
            let h = MirrorHaptic(cue: cue)
            let data = try XCTUnwrap(MirrorEnvelope.encoding(type: MirrorWire.MessageType.haptic, h))
            let back = try XCTUnwrap(MirrorEnvelope.decoding(data)?.body(as: MirrorHaptic.self))
            XCTAssertEqual(back.cue, cue)
        }
    }

    func testUnaTramaConCamposQueYaNoExistenSigueDecodificando() throws {
        // Un móvil con los tres campos de cinta (`beltDistanceM` y compañía, borrados
        // al quitar su pantalla) manda una trama que los lleva. El reloj nuevo tiene
        // que IGNORARLOS, no fallar el decode entero: si fallara, un teléfono sin
        // actualizar dejaría la muñeca en negro toda la sesión.
        let json = Data(#"""
        {"phase":"active","sessionElapsed":10,"lapElapsed":2,
         "beltDistanceM":620,"beltTargetM":800,"beltPaceSecPerKm":278}
        """#.utf8)
        let f = try MirrorWire.decoder.decode(MirrorStateFrame.self, from: json)
        XCTAssertEqual(f.phase, MirrorWire.Phase.active)
        XCTAssertEqual(f.sessionElapsed, 10)
    }
}
