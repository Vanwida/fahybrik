import Foundation

// FH-77 — picker families + format presets. Mirrors shared/domain/objectives/catalog.ts.

enum ObjectiveFamily: String, CaseIterable, Identifiable {
    case running
    case hybrid
    case crossfit
    case ocr
    case other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .running: return "Running"
        case .hybrid: return "Híbrida"
        case .crossfit: return "CrossFit"
        case .ocr: return "OCR"
        case .other: return "Otro"
        }
    }
}

enum HunterRaceVariant: String, CaseIterable, Identifiable {
    case legend
    case alpha
    case sprinter

    var id: String { rawValue }

    var label: String {
        switch self {
        case .legend: return "Legend · 13 km"
        case .alpha: return "Alpha · 7 km"
        case .sprinter: return "Sprinter · 3,5 km"
        }
    }
}

enum RunningDistancePreset: String, CaseIterable, Identifiable {
    case km5 = "5k"
    case km10 = "10k"
    case half = "half"
    case marathon = "marathon"
    case custom

    var id: String { rawValue }

    var label: String {
        switch self {
        case .km5: return "5 km"
        case .km10: return "10 km"
        case .half: return "21,1 km"
        case .marathon: return "42,2 km"
        case .custom: return "Otra"
        }
    }

    var meters: Int? {
        switch self {
        case .km5: return 5000
        case .km10: return 10000
        case .half: return 21100
        case .marathon: return 42200
        case .custom: return nil
        }
    }
}

enum ObjectiveEventKind: String, CaseIterable, Identifiable {
    case running
    case hybrid
    case crossfit
    case ocr
    case other

    var id: String { rawValue }

    var wireType: String {
        switch self {
        case .running: return "running"
        case .hybrid: return "hyrox"
        case .crossfit: return "crossfit"
        case .ocr: return "ocr"
        case .other: return "other"
        }
    }

    var wireSeries: String? {
        switch self {
        case .hybrid: return "other"
        case .crossfit: return "cf_open"
        case .running: return "rfea"
        case .ocr: return "spartan"
        case .other: return "other"
        }
    }

    var label: String {
        switch self {
        case .running: return "Running"
        case .hybrid: return "Híbrida"
        case .crossfit: return "CrossFit"
        case .ocr: return "OCR"
        case .other: return "Otro"
        }
    }
}

extension RaceCalendarEvent {
    var objectiveFamily: ObjectiveFamily {
        if let family, let parsed = ObjectiveFamily(rawValue: family) {
            return parsed
        }
        if type == "crossfit" { return .crossfit }
        if type == "running" { return .running }
        if type == "ocr" { return .ocr }
        if type == "hyrox" || series == "hunter_race" || series == "deka" { return .hybrid }
        return .other
    }

    var isHyroxGoalGapEligible: Bool {
        (type ?? "").lowercased() == "hyrox" && (series ?? "hyrox").lowercased() == "hyrox"
    }

    var isHunterRace: Bool {
        (series ?? "").lowercased() == "hunter_race"
    }
}

extension UpcomingRace {
    var supportsHyroxGoalGap: Bool {
        (eventType ?? "").lowercased() == "hyrox"
    }
}
