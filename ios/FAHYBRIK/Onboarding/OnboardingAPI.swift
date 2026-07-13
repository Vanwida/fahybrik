import Foundation

// Submission flow:
//   POST /api/onboarding/submit { snapshot }
// If endpoint is unreachable, the payload is queued and replayed on next foreground.
enum OnboardingAPI {
    static let endpointPath = "/api/onboarding/submit"

    static func submit(_ snapshot: OnboardingSnapshot, bearer: String?) async {
        do {
            // OnboardingSnapshot already uses snake_case keys explicitly so we
            // bypass the global keyEncodingStrategy by encoding the wrapper as-is.
            try await APIClient.shared.postRaw(
                path: endpointPath,
                body: SubmitWrapper(snapshot: snapshot),
                bearer: bearer
            )
        } catch {
            // Queue for replay — but NOT a deterministic 4xx (AUDIT: it would replay forever).
            if RequestQueue.isRetriable(error), let body = try? JSONEncoder().encode(SubmitWrapper(snapshot: snapshot)) {
                await RequestQueue.shared.enqueue(
                    path: endpointPath,
                    body: body,
                    bearer: bearer
                )
            }
        }
    }

    private struct SubmitWrapper: Encodable {
        let snapshot: OnboardingSnapshot
        enum CodingKeys: String, CodingKey { case snapshot }
    }
}
