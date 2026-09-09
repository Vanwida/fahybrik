import Foundation

// FH-99 — ONE honest criterion for «reloj unido / grabando» on the phone.
// A bound HK mirror channel is NOT live until the wrist sends a recent signal.
// UI reads `mirrorIsLive`; never infer recording from `startWatchApp` success alone.

enum WristMirrorTruth {

    /// Seconds without wrist traffic before the mirror is considered stale.
    static let signalTimeout: TimeInterval = 15

    /// Grace after channel bind while waiting for the first frame/HR (prep → live).
    static let joinGrace: TimeInterval = 12

    static func mirrorIsLive(
        channelBound: Bool,
        boundAt: Date?,
        lastSignalAt: Date?,
        now: Date = Date()
    ) -> Bool {
        guard channelBound else { return false }
        if let last = lastSignalAt {
            return now.timeIntervalSince(last) <= signalTimeout
        }
        guard let boundAt else { return false }
        return now.timeIntervalSince(boundAt) <= joinGrace
    }

    static func mirrorIsStale(
        channelBound: Bool,
        lastSignalAt: Date?,
        now: Date = Date()
    ) -> Bool {
        guard channelBound, let last = lastSignalAt else { return false }
        return now.timeIntervalSince(last) > signalTimeout
    }
}
