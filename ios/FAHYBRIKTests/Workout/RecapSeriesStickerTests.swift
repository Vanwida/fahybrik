import XCTest
@testable import FAHYBRIK

final class RecapSeriesStickerTests: XCTestCase {

    private let laps: [(durationS: Int, paceSPerKm: Double)] = [
        (88, 220), (87, 217), (87, 217), (86, 215),
        (86, 215), (85, 212), (85, 212), (82, 205),
    ]

    private func recapLleno() -> RecapDTO {
        var blocks: [RecapBlockDTO] = laps.enumerated().map { i, lap in
            RecapBlockDTO(
                position: i,
                label: "VO2max",
                kind: "run",
                modality: "run",
                durationS: lap.durationS,
                distanceM: 400,
                paceSPerKm: lap.paceSPerKm
            )
        }
        blocks.append(RecapBlockDTO(
            position: 8, label: "Sled push", kind: "station",
            modality: "other", durationS: 42, distanceM: 50
        ))
        blocks.append(RecapBlockDTO(
            position: 9, label: "Lunges", kind: "station",
            modality: "other", durationS: 95, distanceM: 100
        ))
        return RecapDTO(blocks: blocks)
    }

    func testParcialesDeLaPegatinaSonLosDelRecap() throws {
        let recap = recapLleno()
        let sticker = try XCTUnwrap(RecapLayout.projectSeriesSticker(recap))
        XCTAssertEqual(sticker.label, "VO2max")
        XCTAssertEqual(sticker.pauta, "400 m")
        XCTAssertEqual(sticker.columns, 2)
        XCTAssertEqual(sticker.splits.count, 8)

        let run = recap.blocks.filter { $0.kind == "run" }
        let numbers = RecapLayout.stickerSplitNumbers(sticker)
        XCTAssertEqual(numbers.map(\.durationS), run.map(\.durationS))
        XCTAssertEqual(numbers.map(\.paceSPerKm), run.map(\.paceSPerKm))
        XCTAssertTrue(sticker.splits.allSatisfy { $0.paceSPerKm != 240 })
        XCTAssertEqual(sticker.splits.last?.isBest, true)
        XCTAssertEqual(sticker.splits.filter(\.isBest).count, 1)
    }

    func testSledYLungesQuedanEnElRecapYFueraDeLaPegatina() {
        let recap = recapLleno()
        let labels = RecapLayout.project(recap).map { piece -> String in
            switch piece {
            case .series(let s): return s.label
            case .block(let b): return b.label
            }
        }
        XCTAssertEqual(labels, ["VO2max", "Sled push", "Lunges"])
        XCTAssertEqual(RecapLayout.projectSeriesSticker(recap)?.splits.count, 8)
        XCTAssertTrue(recap.blocks.contains { $0.label == "Sled push" })
        XCTAssertTrue(recap.blocks.contains { $0.label == "Lunges" })
    }

    func testSinTandaNoHayPegatina() {
        let recap = RecapDTO(blocks: [
            RecapBlockDTO(
                position: 0, label: "Correr", kind: "run", modality: "run",
                durationS: 219, distanceM: 1000, paceSPerKm: 219
            ),
            RecapBlockDTO(
                position: 1, label: "Sled push", kind: "station",
                modality: "other", durationS: 42, distanceM: 50
            ),
        ])
        XCTAssertNil(RecapLayout.projectSeriesSticker(recap))
        XCTAssertTrue(RecapLayout.project(recap).allSatisfy {
            if case .block = $0 { return true }
            return false
        })
    }

    func testSimulacroConKilometroEntreEstacionesNoEsTanda() {
        var blocks: [RecapBlockDTO] = []
        for round in 1...3 {
            blocks.append(RecapBlockDTO(
                position: round * 2,
                label: "Correr",
                kind: "run",
                modality: "run",
                durationS: 255 + round * 5,
                distanceM: 1000,
                paceSPerKm: Double(255 + round * 5),
                round: round
            ))
            blocks.append(RecapBlockDTO(
                position: round * 2 + 1,
                label: "Estación \(round)",
                kind: "station",
                modality: "other",
                durationS: 40,
                distanceM: 50,
                round: round
            ))
        }
        XCTAssertNil(RecapLayout.projectSeriesSticker(RecapDTO(blocks: blocks)))
    }

    func testLaPegatinaCabeEnUnaEsquina() {
        XCTAssertEqual(RecapLayout.stickerAncho, 700)
        XCTAssertEqual(RecapLayout.stickerAltoMax, 700)
        XCTAssertLessThan(Double(RecapLayout.stickerAncho) / 1080, 0.7)
        XCTAssertLessThan(Double(RecapLayout.stickerAltoMax) / 1920, 0.4)
        XCTAssertEqual(RecapLayout.columnsFrom, 6)
    }
}
