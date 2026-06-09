import Foundation

// Athlete-side race service. Today this is offline-first: race context is
// surfaced from a local demo for the build slice (matching how Today /
// Workout screens hydrate before #31 wires real ingestion). Submissions
// (race result + debrief) post to the API and fall back to RequestQueue if
// the endpoint isn't live yet — same pattern as CheckinAPI.

enum RaceAPI {
    static let resultPath = "/api/athlete/race-results"
    static let debriefPath = "/api/athlete/race-debriefs"

    static func submitResult(_ payload: RaceResultSubmit, bearer: String?) async {
        struct Wrapper: Encodable { let race_result: RaceResultSubmit }
        await postOrEnqueue(path: resultPath, wrapper: Wrapper(race_result: payload), bearer: bearer)
    }

    static func submitDebrief(_ payload: RaceDebriefSubmit, bearer: String?) async {
        struct Wrapper: Encodable { let race_debrief: RaceDebriefSubmit }
        await postOrEnqueue(path: debriefPath, wrapper: Wrapper(race_debrief: payload), bearer: bearer)
    }

    private static func postOrEnqueue<W: Encodable>(path: String, wrapper: W, bearer: String?) async {
        do {
            try await APIClient.shared.postRaw(path: path, body: wrapper, bearer: bearer)
        } catch {
            if let body = try? JSONEncoder().encode(wrapper) {
                await RequestQueue.shared.enqueue(path: path, body: body, bearer: bearer)
            }
        }
    }
}

// MARK: - Local persistence: post-race debrief draft + completion gate

enum RaceStore {
    private static let debriefDoneKey = "race.debriefCompleted.v1"

    static func markDebriefCompleted(forResultId raceResultId: String) {
        var done = UserDefaults.standard.array(forKey: debriefDoneKey) as? [String] ?? []
        if !done.contains(raceResultId) {
            done.append(raceResultId)
            UserDefaults.standard.set(done, forKey: debriefDoneKey)
        }
    }

    static func isDebriefCompleted(forResultId raceResultId: String) -> Bool {
        let done = UserDefaults.standard.array(forKey: debriefDoneKey) as? [String] ?? []
        return done.contains(raceResultId)
    }
}
