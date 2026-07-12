import Foundation

// MARK: - Review-prompt persistence (#59)
//
// The small amount of state the App Store review gate reads (see `ReviewGate`):
// first use, saved-workout count, last request, last bug report. Backed by
// UserDefaults (the `@AppStorage` sink), with an injectable store so the recorder
// can be exercised in isolation. The DECISION lives in the pure `ReviewGate`; this
// only persists the inputs and records the outcomes.
struct ReviewPromptStore {
    static let shared = ReviewPromptStore()

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    private enum Key {
        static let firstUseAt = "fahybrik.review.firstUseAt"
        static let workoutsSaved = "fahybrik.review.workoutsSaved"
        static let lastRequestedAt = "fahybrik.review.lastRequestedAt"
        static let lastBugReportAt = "fahybrik.review.lastBugReportAt"
    }

    // A stored 0 means "never" for the timestamp keys (UserDefaults returns 0 for
    // an absent Double), mapped back to nil so the gate reads it correctly.
    private func date(_ key: String) -> Date? {
        let t = defaults.double(forKey: key)
        return t > 0 ? Date(timeIntervalSince1970: t) : nil
    }

    var firstUseAt: Date? { date(Key.firstUseAt) }
    var workoutsSaved: Int { defaults.integer(forKey: Key.workoutsSaved) }
    var lastRequestedAt: Date? { date(Key.lastRequestedAt) }
    var lastBugReportAt: Date? { date(Key.lastBugReportAt) }

    /// Call once per successfully-saved workout (prescribed, dobles, manual or
    /// free — it happened even if the network is offline). Seeds `firstUseAt` on
    /// the first save and increments the volume counter.
    func recordWorkoutSaved(now: Date = Date()) {
        if firstUseAt == nil {
            defaults.set(now.timeIntervalSince1970, forKey: Key.firstUseAt)
        }
        defaults.set(workoutsSaved + 1, forKey: Key.workoutsSaved)
    }

    /// Record that a review was requested (starts the between-requests cooldown).
    func recordReviewRequested(now: Date = Date()) {
        defaults.set(now.timeIntervalSince1970, forKey: Key.lastRequestedAt)
    }

    /// Record a "Algo falla" report (opens the 24h no-review window).
    func recordBugReport(now: Date = Date()) {
        defaults.set(now.timeIntervalSince1970, forKey: Key.lastBugReportAt)
    }
}
