import CoreBluetooth
import Foundation

// Concept2 PM5 BLE GATT IDs per the official "Concept2 BLE Communications
// Interface Definition" spec. The PM5 advertises the C2 Information Service
// in its scan response; we filter on it to avoid connecting to non-Concept2
// devices. The rower/ski-erg streaming data lives under the Rowing Service
// (CE060030-…). General/additional/stroke chunks are notified at 1 Hz; split
// and end-of-workout chunks fire on transitions (lap, segment end, finish).
enum PM5GATT {
    static let infoService = CBUUID(string: "CE060000-43E5-11E4-916C-0800200C9A66")
    static let rowingService = CBUUID(string: "CE060030-43E5-11E4-916C-0800200C9A66")

    // Identifying read-only chars on the info service.
    static let charSerialNumber  = CBUUID(string: "CE060012-43E5-11E4-916C-0800200C9A66")
    static let charHardwareRev   = CBUUID(string: "CE060013-43E5-11E4-916C-0800200C9A66")
    static let charFirmwareRev   = CBUUID(string: "CE060014-43E5-11E4-916C-0800200C9A66")

    // Rowing stream notify characteristics (subset we consume — others exist
    // but aren't needed for the live data grid).
    static let charGeneralStatus           = CBUUID(string: "CE060031-43E5-11E4-916C-0800200C9A66")
    static let charAdditionalStatus        = CBUUID(string: "CE060032-43E5-11E4-916C-0800200C9A66")
    static let charAdditionalStatus2       = CBUUID(string: "CE060033-43E5-11E4-916C-0800200C9A66")
    static let charStrokeData              = CBUUID(string: "CE060035-43E5-11E4-916C-0800200C9A66")
    static let charAdditionalStrokeData    = CBUUID(string: "CE060036-43E5-11E4-916C-0800200C9A66")
    static let charSplitIntervalData       = CBUUID(string: "CE060037-43E5-11E4-916C-0800200C9A66")
    static let charAdditionalSplitIntervalData = CBUUID(string: "CE060038-43E5-11E4-916C-0800200C9A66")
    static let charEndOfWorkoutSummary     = CBUUID(string: "CE060039-43E5-11E4-916C-0800200C9A66")

    // The two split characteristics (0x37 + 0x38) both fire on a split/interval
    // boundary; we join them by interval number into one `PM5Split` (see parser).
    static let splitChars: Set<CBUUID> = [charSplitIntervalData, charAdditionalSplitIntervalData]

    static let allNotifyChars: [CBUUID] = [
        charGeneralStatus,
        charAdditionalStatus,
        charAdditionalStatus2,
        charStrokeData,
        charAdditionalStrokeData,
        charSplitIntervalData,
        charAdditionalSplitIntervalData,
        charEndOfWorkoutSummary,
    ]
}

// Persistence key for "remember last paired PM5". Only stores the
// CoreBluetooth peripheral identifier (UUID), not anything PII.
enum PM5Defaults {
    static let lastPairedIdentifier = "pm5.lastPairedIdentifier"
    static let lastPairedName = "pm5.lastPairedName"
}
