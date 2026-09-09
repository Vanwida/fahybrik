import Foundation

// FH-97 — one end-delivery state machine (phone → watch MirrorEnd). Pure policy.

enum PhoneMirrorEndPolicy {
    /// First send + retries (t=0,2,4,6,8).
    static let retryIntervalSeconds: TimeInterval = 2
    static let maxSendCount = 5
    /// Phone releases mirrored HK handle after this — wrist teardown is wrist-owned.
    static let releaseChannelAfterSeconds: TimeInterval = 10

    static func shouldScheduleRetry(sentCount: Int) -> Bool {
        sentCount < maxSendCount
    }

    static func shouldReleaseChannel(elapsedSeconds: TimeInterval) -> Bool {
        elapsedSeconds >= releaseChannelAfterSeconds
    }
}
