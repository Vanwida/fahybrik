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

    private let fileURL: URL
    private var entries: [QueuedRequest] = []
    private var loaded = false

    init(filename: String = "request-queue.json") {
        let dir = try! FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        self.fileURL = dir.appendingPathComponent(filename)
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
