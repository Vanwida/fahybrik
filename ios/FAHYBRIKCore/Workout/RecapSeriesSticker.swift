import Foundation

/// Pegatina de series = recorte del recap. Los mismos números.
/// Espejo de `shared/domain/recap-sticker.ts`. Sin marca. Sin día. Sin Meta.
enum RecapLayout {
    static let columnsFrom = 6
    static let stickerAncho = 700
    static let stickerAltoMax = 700

    struct Split: Equatable {
        let index: Int
        let durationS: Int?
        let distanceM: Double?
        let paceSPerKm: Double?
        let isBest: Bool
        let position: Int
    }

    struct Series: Equatable {
        let label: String
        let pauta: String?
        let splits: [Split]
        let columns: Int
    }

    enum Piece: Equatable {
        case series(Series)
        case block(RecapBlockDTO)
    }

    static func project(_ recap: RecapDTO) -> [Piece] {
        var pieces: [Piece] = []
        let blocks = recap.blocks
        var i = 0
        while i < blocks.count {
            let head = blocks[i]
            guard let key = seriesKey(head) else {
                pieces.append(.block(head))
                i += 1
                continue
            }
            var end = i + 1
            while end < blocks.count, seriesKey(blocks[end]) == key {
                end += 1
            }
            let run = Array(blocks[i..<end])
            if run.count >= 2 {
                pieces.append(.series(seriesDe(run)))
            } else {
                pieces.append(.block(head))
            }
            i = end
        }
        return pieces
    }

    static func projectSeriesSticker(_ recap: RecapDTO) -> Series? {
        for piece in project(recap) {
            if case .series(let series) = piece { return series }
        }
        return nil
    }

    static func stickerSplitNumbers(_ series: Series) -> [(durationS: Int?, paceSPerKm: Double?)] {
        series.splits.map { ($0.durationS, $0.paceSPerKm) }
    }

    private static func seriesKey(_ block: RecapBlockDTO) -> String? {
        guard block.kind == "run", let distance = block.distanceM, distance.isFinite, distance > 0 else {
            return nil
        }
        return "run:\(Int(distance.rounded()))"
    }

    private static func pautaDe(_ distanceM: Double?) -> String? {
        guard let distanceM, distanceM > 0 else { return nil }
        let metros = Int(distanceM.rounded())
        if metros >= 1000, metros % 1000 == 0 { return "\(metros / 1000) km" }
        return "\(metros) m"
    }

    private static func labelDe(_ blocks: [RecapBlockDTO]) -> String {
        let labels = blocks.map { $0.label.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard let first = labels.first else { return "Series" }
        return labels.allSatisfy { $0 == first } ? first : first
    }

    private static func splitsDe(_ blocks: [RecapBlockDTO]) -> [Split] {
        let durations = blocks.compactMap { block -> Int? in
            guard let s = block.durationS, s > 0 else { return nil }
            return s
        }
        let best = durations.count > 2 ? durations.min() : nil
        return blocks.enumerated().map { i, b in
            Split(
                index: i + 1,
                durationS: b.durationS,
                distanceM: b.distanceM,
                paceSPerKm: b.paceSPerKm,
                isBest: best != nil && b.durationS == best,
                position: b.position
            )
        }
    }

    private static func seriesDe(_ blocks: [RecapBlockDTO]) -> Series {
        let distance = blocks.first?.distanceM
        let uniform = blocks.allSatisfy { $0.distanceM == distance }
        return Series(
            label: labelDe(blocks),
            pauta: uniform ? pautaDe(distance) : nil,
            splits: splitsDe(blocks),
            columns: blocks.count >= columnsFrom ? 2 : 1
        )
    }
}

typealias RecapSeriesSticker = RecapLayout.Series
