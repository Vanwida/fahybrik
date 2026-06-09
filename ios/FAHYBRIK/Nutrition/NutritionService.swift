import Foundation

// Athlete-facing nutrition store, wired to the real backend.
//
//   GET    /api/athlete/nutrition?date=YYYY-MM-DD   day log + totals
//   POST   /api/athlete/nutrition                   create entry
//   DELETE /api/athlete/nutrition/{id}              delete entry
//   GET    /api/athlete/nutrition/barcode?code=…    barcode lookup (per 100g)
//   POST   /api/athlete/nutrition/photo             photo → estimated items
//
// snake_case JSON ⇄ camelCase Swift handled by APIClient's encode/decode
// strategies. The store owns the day the UI is showing (`selectedDate`),
// fetches its entries + totals, and does optimistic add/delete with rollback.
@MainActor
final class NutritionService: ObservableObject {
    static let shared = NutritionService()

    @Published private(set) var selectedDate: Date = Calendar.current.startOfDay(for: Date())
    @Published private(set) var entries: [NutritionEntry] = []
    @Published private(set) var totals: MacroTotals = MacroTotals()
    @Published private(set) var isLoading: Bool = false
    @Published private(set) var lastError: String? = nil

    private var bearer: String? {
        UserDefaults.standard.string(forKey: "fahybrik.bearer")
    }

    private static let dateFmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private init() {}

    // MARK: - Day navigation

    func setDate(_ date: Date) async {
        selectedDate = Calendar.current.startOfDay(for: date)
        await loadDay()
    }

    func goToPreviousDay() async {
        await setDate(Calendar.current.date(byAdding: .day, value: -1, to: selectedDate) ?? selectedDate)
    }

    func goToNextDay() async {
        await setDate(Calendar.current.date(byAdding: .day, value: 1, to: selectedDate) ?? selectedDate)
    }

    var isToday: Bool {
        Calendar.current.isDateInToday(selectedDate)
    }

    var selectedDateISO: String { Self.dateFmt.string(from: selectedDate) }

    // MARK: - Fetch

    func loadDay() async {
        guard let bearer else {
            entries = []
            totals = MacroTotals()
            lastError = nil
            return
        }
        isLoading = true
        lastError = nil
        defer { isLoading = false }
        do {
            let path = "api/athlete/nutrition?date=\(selectedDateISO)"
            let resp: NutritionDayResponse = try await APIClient.shared.get(path: path, bearer: bearer)
            entries = resp.entries
            totals = resp.totals
        } catch {
            entries = []
            totals = MacroTotals()
            lastError = "No se pudieron cargar las comidas."
        }
    }

    // MARK: - Create

    /// Create an entry with absolute macros for the consumed amount. On success
    /// the day is reloaded so totals + ids come from the server (no fabricated
    /// values). On failure the error is surfaced and nothing is added.
    func addEntry(
        name: String,
        kcal: Double,
        protein_g: Double,
        carbs_g: Double,
        fat_g: Double,
        quantity: Double?,
        unit: String?,
        source: FoodSource,
        barcode: String? = nil,
        raw: String? = nil
    ) async -> Bool {
        guard let bearer else {
            lastError = "Sesión no disponible."
            return false
        }
        let body = NutritionEntryCreate(
            loggedFor: selectedDateISO,
            name: name,
            kcal: kcal,
            proteinG: protein_g,
            carbsG: carbs_g,
            fatG: fat_g,
            quantity: quantity,
            unit: unit,
            source: source,
            barcode: barcode,
            raw: raw
        )
        do {
            let _: NutritionEntry = try await APIClient.shared.post(
                path: "api/athlete/nutrition",
                body: body,
                bearer: bearer
            )
            await loadDay()
            return true
        } catch {
            lastError = "No se pudo guardar la comida."
            return false
        }
    }

    // MARK: - Delete

    /// Optimistic delete with rollback on failure.
    func deleteEntry(_ id: String) async {
        guard let bearer else { return }
        let snapshot = entries
        let snapshotTotals = totals
        entries.removeAll { $0.id == id }
        totals = MacroTotals.sum(entries)
        do {
            let _: Empty = try await APIClient.shared.delete(
                path: "api/athlete/nutrition/\(id)",
                body: Optional<Empty>.none,
                bearer: bearer
            )
            // Re-sync totals authoritatively.
            await loadDay()
        } catch {
            entries = snapshot
            totals = snapshotTotals
            lastError = "No se pudo borrar la comida."
        }
    }

    // MARK: - Barcode lookup

    /// `GET …/nutrition/barcode?code=`. Returns the per-100g lookup, or nil when
    /// the product is not found / the request fails.
    func lookupBarcode(code: String) async -> BarcodeLookupResponse? {
        guard let bearer,
              let encoded = code.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            return nil
        }
        do {
            let resp: BarcodeLookupResponse = try await APIClient.shared.get(
                path: "api/athlete/nutrition/barcode?code=\(encoded)",
                bearer: bearer
            )
            return resp.found ? resp : nil
        } catch {
            return nil
        }
    }

    // MARK: - Search by name

    /// `GET …/nutrition/search?q=`. Returns per-100g results, or [] when nothing
    /// matches / the request fails (the backend is graceful by contract).
    func searchFoods(query: String) async throws -> [FoodSearchResult] {
        guard let bearer,
              let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            return []
        }
        let resp: FoodSearchResponse = try await APIClient.shared.get(
            path: "api/athlete/nutrition/search?q=\(encoded)",
            bearer: bearer
        )
        return resp.results
    }

    // MARK: - Photo analysis

    /// `POST …/nutrition/photo` (multipart image). Returns the estimated items.
    /// Throws `NutritionPhotoUnavailable` when the server has no vision model
    /// configured (HTTP 501) so the caller can show "Foto-IA no disponible aún"
    /// and offer manual entry instead.
    func analyzePhoto(imageData: Data) async throws -> [PhotoFoodItem] {
        guard let bearer else { throw NutritionPhotoUnavailable() }
        do {
            let resp: PhotoAnalysisResponse = try await APIClient.shared.postImage(
                path: "api/athlete/nutrition/photo",
                imageData: imageData,
                bearer: bearer
            )
            return resp.items
        } catch let APIError.http(status, _) where status == 501 {
            throw NutritionPhotoUnavailable()
        }
    }
}
