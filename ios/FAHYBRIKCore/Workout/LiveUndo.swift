import Foundation

/// Un paso atrás del último avance en vivo. Espejo de `shared/domain/live-undo.ts`.
enum LiveUndo {
    enum Action: String, Equatable {
        case unconfirmLastSet
        case unmarkLastRound
        case reopenFromFinish
        case stepBackSegment
        case parkBlockGate
        case stepBackEmom
        case noop
    }

    struct Cursor: Equatable {
        var finished: Bool
        var awaitingFinish: Bool
        var hasConfirmedSet: Bool
        var segmentIndex: Int
        var sameBlockAsPrevious: Bool
        var roundsDone: Int
        var emomIntervalIndex: Int
        var isEmom: Bool
    }

    static func action(for c: Cursor) -> Action {
        if c.finished { return .noop }
        if c.awaitingFinish { return .reopenFromFinish }
        if c.hasConfirmedSet { return .unconfirmLastSet }
        if c.isEmom && c.emomIntervalIndex > 0 { return .stepBackEmom }
        if c.roundsDone > 0 { return .unmarkLastRound }
        if c.segmentIndex > 0 && c.sameBlockAsPrevious { return .stepBackSegment }
        if c.segmentIndex > 0 { return .parkBlockGate }
        return .noop
    }

    static func canUndo(_ c: Cursor) -> Bool {
        action(for: c) != .noop
    }
}

struct ConditioningUndoHold: Equatable {
    let segmentIndex: Int
    let roundsDone: Int
    let splits: [FixedStationSplit]
}
