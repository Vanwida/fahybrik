import Foundation
import Observation

// 5-question wellness micro-flow per docs/ux/07-daily-morning-checkin.md.
// Each value is 1..5 on a semantic scale; un-answered = nil. The submitted DTO
// uses snake_case explicit keys to match shared/schema/* and survive any
// encoder strategy.
@Observable
final class CheckinAnswers {
    var soreness: Int? = nil
    var mood: Int? = nil
    var motivation: Int? = nil
    var fatigue: Int? = nil
    var sleepQuality: Int? = nil
    var notes: String = ""

    var allAnswered: Bool {
        soreness != nil && mood != nil && motivation != nil
            && fatigue != nil && sleepQuality != nil
    }

    /// Daily Readiness sub-score 0..100. Soreness and Fatiga are inverted
    /// (5 worst = 0 points; 1 best = 20 points). Mood / Motivación / Sleep
    /// quality scale linearly (5 best = 20; 1 worst = 0). Returns 0 if any
    /// answer is missing.
    var subScore: Int {
        guard let s = soreness, let m = mood, let mo = motivation,
              let f = fatigue, let sq = sleepQuality else { return 0 }

        let sorenessPts  = (5 - s) * 5      // 1→20 .. 5→0
        let moodPts      = (m - 1) * 5      // 1→0  .. 5→20
        let motivPts     = (mo - 1) * 5
        let fatiguePts   = (5 - f) * 5
        let sleepQltyPts = (sq - 1) * 5
        return sorenessPts + moodPts + motivPts + fatiguePts + sleepQltyPts
    }

    func snapshot(score: Int, recordedAt: Date = Date()) -> CheckinSnapshot {
        CheckinSnapshot(
            recorded_at: ISO8601DateFormatter().string(from: recordedAt),
            soreness: soreness,
            mood: mood,
            motivation: motivation,
            fatigue: fatigue,
            sleep_quality: sleepQuality,
            notes: notes.isEmpty ? nil : notes,
            sub_score: score
        )
    }
}

struct CheckinSnapshot: Codable {
    let recorded_at: String
    let soreness: Int?
    let mood: Int?
    let motivation: Int?
    let fatigue: Int?
    let sleep_quality: Int?
    let notes: String?
    let sub_score: Int
}

// MARK: - Persistence (gating + draft notes)

enum CheckinStore {
    private static let lastCompletedKey     = "checkin.lastCompletedDate.v1"
    private static let lastSkippedKey       = "checkin.lastSkippedDate.v1"
    private static let lastAutoPresentedKey = "checkin.lastAutoPresentedDate.v1"
    private static let draftNotesKey        = "checkin.draftNotes.v1"
    private static let lastScoreKey         = "checkin.lastScore.v1"

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return f
    }()

    static func todayKey(_ now: Date = Date()) -> String {
        dayFormatter.string(from: now)
    }

    /// Whether the gate should present the check-in. True if no completion
    /// recorded for *today's* local-day key. Skip is also honored within the
    /// same day so we don't re-prompt repeatedly.
    static func isPending(now: Date = Date()) -> Bool {
        let key = todayKey(now)
        let lastDone = UserDefaults.standard.string(forKey: lastCompletedKey)
        let lastSkip = UserDefaults.standard.string(forKey: lastSkippedKey)
        return lastDone != key && lastSkip != key
    }

    /// Whether the gate already AUTO-presented the sheet today. SUAVE behavior:
    /// the sheet auto-opens only the first time per local day. If the athlete
    /// dismisses it without completing/skipping, the "pending" banner stays but
    /// we never auto-reopen — they tap it to reopen on their own terms.
    static func hasAutoPresentedToday(now: Date = Date()) -> Bool {
        UserDefaults.standard.string(forKey: lastAutoPresentedKey) == todayKey(now)
    }

    /// Records that the sheet auto-opened today, so later appearances this same
    /// day don't re-present it automatically.
    static func markAutoPresented(now: Date = Date()) {
        UserDefaults.standard.set(todayKey(now), forKey: lastAutoPresentedKey)
    }

    static func markCompleted(score: Int, now: Date = Date()) {
        UserDefaults.standard.set(todayKey(now), forKey: lastCompletedKey)
        UserDefaults.standard.set(score, forKey: lastScoreKey)
        UserDefaults.standard.removeObject(forKey: draftNotesKey)
    }

    static func markSkipped(now: Date = Date()) {
        UserDefaults.standard.set(todayKey(now), forKey: lastSkippedKey)
    }

    static func saveDraftNotes(_ notes: String) {
        if notes.isEmpty {
            UserDefaults.standard.removeObject(forKey: draftNotesKey)
        } else {
            UserDefaults.standard.set(notes, forKey: draftNotesKey)
        }
    }

    static func loadDraftNotes() -> String {
        UserDefaults.standard.string(forKey: draftNotesKey) ?? ""
    }

    static func lastScore() -> Int? {
        let v = UserDefaults.standard.integer(forKey: lastScoreKey)
        return v == 0 ? nil : v
    }
}

// MARK: - API submission (offline-first via RequestQueue)

enum CheckinAPI {
    static let path = "/api/checkins"

    /// Try POST `/api/checkins`. On any failure (404, network, decode), enqueue
    /// for replay via the shared RequestQueue. Per task brief: 404 must keep
    /// queue and not crash.
    static func submit(_ snapshot: CheckinSnapshot, bearer: String?) async {
        struct Wrapper: Encodable { let checkin: CheckinSnapshot }
        let wrapper = Wrapper(checkin: snapshot)

        do {
            try await APIClient.shared.postRaw(path: path, body: wrapper, bearer: bearer)
        } catch {
            if let body = try? JSONEncoder().encode(wrapper) {
                await RequestQueue.shared.enqueue(path: path, body: body, bearer: bearer)
            }
        }
    }
}
