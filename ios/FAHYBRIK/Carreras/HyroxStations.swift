import Foundation

// The HYROX 16-element layout (8×1km runs interleaved with 8 stations), in the
// canonical fixed order. Single iOS source of truth for the station labels +
// which indices are runs. Mirrors /shared/schema/hyrox-layout.ts on the web.
// Consumed by the Carreras flow (race-history splits, station detail).

enum HyroxStation {
    static let count = 16
    static let runIndices: [Int] = [1, 3, 5, 7, 9, 11, 13, 15]

    static let labels: [Int: String] = [
        1: "Run 1km",
        2: "SkiErg 1km",
        3: "Run 1km",
        4: "Sled push",
        5: "Run 1km",
        6: "Sled pull",
        7: "Run 1km",
        8: "Burpee broad jump 80m",
        9: "Run 1km",
        10: "Row 1km",
        11: "Run 1km",
        12: "Farmer carry 200m",
        13: "Run 1km",
        14: "Sandbag lunge 200m",
        15: "Run 1km",
        16: "Wall ball 100"
    ]
}
