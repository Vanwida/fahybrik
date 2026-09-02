import XCTest
@testable import FAHYBRIK

// FH-32 — TIME Recupera hitting 0 is the same door as «empezar ya».
// DISTANCE / open / a fabricated 0 must not fire.
final class MirrorTimedRestTests: XCTestCase {

    private func tramo(
        enDescanso: Bool,
        cierre: String?,
        ventanaQueda: Double?,
        parte: String? = "main",
        rondaN: Int? = 2,
        formaIndice: Int? = 1
    ) -> MirrorTramo {
        var t = MirrorTramo(
            formato: "intervals", modalidad: "run", etiqueta: "Recuperación", dosis: "1:00",
            rondaN: rondaN, rondaTotal: 3, enDescanso: enDescanso,
            cierre: cierre, objetivoMedida: nil, hechoMedida: nil,
            ventanaQueda: ventanaQueda, ventanaTotal: 60, enTramoS: 10,
            ritmoSecPorKm: nil, objetivoLabel: nil, objetivoEstado: nil, zonaViva: nil,
            siguiente: "800 m", cargaKg: nil, reps: nil
        )
        t.parte = parte
        t.formaIndice = formaIndice
        return t
    }

    func testTimeRestHitsZeroFiresOnce() {
        let rest = tramo(enDescanso: true, cierre: "sessionClock", ventanaQueda: 90)
        XCTAssertTrue(MirrorTimedRest.isTimedRunRest(rest))
        XCTAssertEqual(MirrorTimedRest.quedaViva(tramo: rest, sinceFrame: 30), 60)
        XCTAssertFalse(MirrorTimedRest.shouldAdvance(
            tramo: rest, sinceFrame: 30, alreadyFiredFor: nil
        ))
        XCTAssertTrue(MirrorTimedRest.shouldAdvance(
            tramo: rest, sinceFrame: 90, alreadyFiredFor: nil
        ))
        let fired = MirrorTimedRest.window(of: rest)
        XCTAssertFalse(MirrorTimedRest.shouldAdvance(
            tramo: rest, sinceFrame: 91, alreadyFiredFor: fired
        ), "one advance per Recupera window")
    }

    func testDistanceAndOpenNeverInventZero() {
        let dist = tramo(enDescanso: true, cierre: "machineGoal", ventanaQueda: nil)
        let open = tramo(enDescanso: true, cierre: "athleteTap", ventanaQueda: nil)
        let invented = tramo(enDescanso: true, cierre: "sessionClock", ventanaQueda: 0)
        for t in [dist, open, invented] {
            XCTAssertFalse(MirrorTimedRest.isTimedRunRest(t))
            XCTAssertNil(MirrorTimedRest.quedaViva(tramo: t, sinceFrame: 120))
            XCTAssertFalse(MirrorTimedRest.shouldAdvance(
                tramo: t, sinceFrame: 120, alreadyFiredFor: nil
            ))
        }
    }

    func testWorkAndIronRestDoNotFire() {
        let work = tramo(enDescanso: false, cierre: "sessionClock", ventanaQueda: 30)
        let iron = tramo(enDescanso: true, cierre: "sessionClock", ventanaQueda: 45, parte: nil)
        XCTAssertFalse(MirrorTimedRest.shouldAdvance(
            tramo: work, sinceFrame: 30, alreadyFiredFor: nil
        ))
        XCTAssertFalse(MirrorTimedRest.shouldAdvance(
            tramo: iron, sinceFrame: 45, alreadyFiredFor: nil
        ))
    }

    func testNextWindowCanFireAgain() {
        let first = tramo(enDescanso: true, cierre: "sessionClock", ventanaQueda: 60, rondaN: 2)
        let second = tramo(enDescanso: true, cierre: "sessionClock", ventanaQueda: 60, rondaN: 3)
        let fired = MirrorTimedRest.window(of: first)
        XCTAssertTrue(MirrorTimedRest.shouldAdvance(
            tramo: second, sinceFrame: 60, alreadyFiredFor: fired
        ))
    }
}
