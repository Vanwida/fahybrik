import Foundation

// Disk-backed FIFO queue for offline-first API submissions (onboarding submit,
// HealthKit sync batches, Apple auth callback). Each entry is a self-contained
// JSON envelope so we can replay regardless of in-memory state.
struct QueuedRequest: Codable, Identifiable {
    let id: UUID
    let path: String
    let bodyJson: Data
    let bearer: String?
    let createdAt: Date
}

actor RequestQueue {
    static let shared = RequestQueue()

    /// AUDIT — a 4xx is a DETERMINISTIC client error (bad request, 404 no_partner /
    /// not_found, 409): replaying it fails identically, so it must NOT enter the offline
    /// queue (it would sit there retrying forever). Only OFFLINE / network / server-5xx /
    /// timeout failures are transient and worth a replay. Every enqueue site gates on
    /// this. (A 2xx-with-bad-body `.decoding` is handled separately at the call site — the
    /// request SUCCEEDED, so it must never be replayed either.)
    nonisolated static func isRetriable(_ error: Error) -> Bool {
        if case APIError.http(let code, _) = error { return code >= 500 }
        return true
    }

    private let fileURL: URL
    private var entries: [QueuedRequest] = []
    private var loaded = false

    init(filename: String = "request-queue.json") {
        // Application Support is the canonical home; if the FS denies it
        // (sandbox edge cases, full disk), degrade to the temp dir so a queue
        // hiccup can never crash app launch.
        let dir: URL
        if let support = try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ) {
            dir = support
        } else {
            dir = FileManager.default.temporaryDirectory
        }
        self.fileURL = dir.appendingPathComponent(filename)
    }

    /// Replay window. An entry older than this is dropped instead of replayed:
    /// days-old wellness/workout submissions landing out of the blue would
    /// mislead the coach's "what happened this week" more than help it, and any
    /// genuinely-offline stretch worth recovering (a weekend without signal)
    /// fits well inside it.
    private static let maxEntryAge: TimeInterval = 72 * 3600

    /// Re-entrance guard: drain is fired from several places (launch, bearer
    /// change, foreground) and must never interleave two replay loops.
    private var draining = false

    /// Replays queued entries FIFO with the CURRENT session bearer (the stored
    /// one may have rotated or died since capture; a single-athlete device means
    /// the live token is always the right owner).
    ///
    /// This is the missing half of "offline-first": every feature enqueued its
    /// transient failures "for replay" but nothing ever drained the queue, so
    /// the file was durable capture with no delivery — data loss with extra
    /// steps (found 27-jul-2026 while tracing check-ins that never reached the
    /// server). Outcome per entry:
    ///   • 2xx → delivered, removed.
    ///   • deterministic 4xx (not 401) → poison, dropped (replaying forever
    ///     can't fix a bad request; matches the enqueue-side gate).
    ///   • 401 → the SESSION is dead, not the entry: stop, keep everything —
    ///     the next drain after re-auth delivers with the live token.
    ///   • offline / 5xx / timeout → transient: stop, keep order, retry on the
    ///     next drain.
    func drain(bearer: String?) async {
        guard !draining else { return }
        draining = true
        defer { draining = false }

        await loadIfNeeded()
        while let entry = entries.first {
            if Date().timeIntervalSince(entry.createdAt) > Self.maxEntryAge {
                entries.removeFirst()
                persist()
                continue
            }
            do {
                try await APIClient.shared.postJSONData(
                    path: entry.path,
                    data: entry.bodyJson,
                    bearer: bearer ?? entry.bearer
                )
                entries.removeFirst()
                persist()
            } catch {
                if case APIError.http(let code, _) = error, (400..<500).contains(code) {
                    if code == 401 { return }
                    entries.removeFirst()
                    persist()
                    continue
                }
                return
            }
        }
    }

    func enqueue(path: String, body: Data, bearer: String? = nil) async {
        await loadIfNeeded()
        let r = QueuedRequest(
            id: UUID(),
            path: path,
            bodyJson: body,
            bearer: bearer,
            createdAt: Date()
        )
        entries.append(r)
        persist()
    }

    func snapshot() async -> [QueuedRequest] {
        await loadIfNeeded()
        return entries
    }

    func remove(id: UUID) async {
        await loadIfNeeded()
        entries.removeAll { $0.id == id }
        persist()
    }

    private func loadIfNeeded() async {
        guard !loaded else { return }
        loaded = true
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let data = try Data(contentsOf: fileURL)
            entries = try JSONDecoder().decode([QueuedRequest].self, from: data)
        } catch {
            entries = []
        }
    }

    private func persist() {
        do {
            let data = try JSONEncoder().encode(entries)
            try data.write(to: fileURL, options: [.atomic])
        } catch {
            // intentional swallow: a queue persist failure must not crash the app
        }
    }
}
