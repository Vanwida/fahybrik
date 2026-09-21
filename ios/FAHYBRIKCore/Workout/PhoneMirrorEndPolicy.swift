import Foundation

// FH-97 / FH-56 — phone-side end. ONE `MirrorEnd` over HK (plus the durable
// WCSession `live_end_v1`, FH-101). No resend cadence: the retry loop was a
// homemade link engine. What remains is a UI deadline — the phone leaves
// `.ending` on its own if Apple never reports `.ended` (wrist out of range).

enum PhoneMirrorEndPolicy {
    /// Phone releases mirrored HK handle + UI after this — wrist teardown is wrist-owned.
    static let releaseChannelAfterSeconds: TimeInterval = 10

    static func shouldReleaseChannel(elapsedSeconds: TimeInterval) -> Bool {
        elapsedSeconds >= releaseChannelAfterSeconds
    }
}
