import Foundation

// Snake_case Codable on the wire — matches the FAHYBRIK nutrition API contract.
// All fields explicit (no JSON blobs).
//
// The backend is ENTRY-centric: every logged food carries its own absolute
// macros (kcal / protein_g / carbs_g / fat_g) for the consumed quantity — there
// is no per-100g normalisation server-side and no meal_type. The UI computes
// absolute macros locally (per-100g × quantity) before POSTing.
//
//   POST   /api/athlete/nutrition            create entry
//   GET    /api/athlete/nutrition?date=…     day log + totals
//   DELETE /api/athlete/nutrition/{id}       delete entry
//   GET    /api/athlete/nutrition/barcode?code=…   barcode lookup (per 100g)
//   POST   /api/athlete/nutrition/photo      photo → estimated items (absolute)

enum FoodSource: String, Codable {
    case manual = "manual"   // user-entered custom
    case barcode = "barcode" // EAN/UPC scan → barcode lookup
    case photo = "photo"     // photo + AI vision estimate
    /// AUDIT-B2 — a source this build doesn't know (a new backend value) decodes here
    /// instead of throwing and blanking the day log. We only ever ENCODE the real cases.
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = FoodSource(rawValue: raw) ?? .unknown
    }
}

// MARK: - Wire: create entry

// Body for POST /api/athlete/nutrition. Encoded with convertToSnakeCase, so
// `loggedFor` → `logged_for`, `proteinG` → `protein_g`, etc.
struct NutritionEntryCreate: Encodable {
    let loggedFor: String      // "YYYY-MM-DD"
    let name: String
    let kcal: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
    let quantity: Double?
    let unit: String?
    let source: FoodSource
    let barcode: String?
    let raw: String?
}

// MARK: - Wire: read entry / day

// One logged entry as returned by GET …/nutrition. Macros are absolute (for the
// consumed quantity). `source` decodes leniently — an unknown server value maps
// to `.manual` rather than failing the whole day decode.
struct NutritionEntry: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let kcal: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
    let quantity: Double?
    let unit: String?
    let source: FoodSource

    private enum CodingKeys: String, CodingKey {
        case id, name, kcal, proteinG, carbsG, fatG, quantity, unit, source
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        kcal = (try? c.decode(Double.self, forKey: .kcal)) ?? 0
        proteinG = (try? c.decode(Double.self, forKey: .proteinG)) ?? 0
        carbsG = (try? c.decode(Double.self, forKey: .carbsG)) ?? 0
        fatG = (try? c.decode(Double.self, forKey: .fatG)) ?? 0
        quantity = try? c.decodeIfPresent(Double.self, forKey: .quantity)
        unit = try? c.decodeIfPresent(String.self, forKey: .unit)
        let rawSource = (try? c.decode(String.self, forKey: .source)) ?? "manual"
        source = FoodSource(rawValue: rawSource) ?? .manual
    }

    // Memberwise init for previews / optimistic inserts.
    init(
        id: String,
        name: String,
        kcal: Double,
        proteinG: Double,
        carbsG: Double,
        fatG: Double,
        quantity: Double?,
        unit: String?,
        source: FoodSource
    ) {
        self.id = id
        self.name = name
        self.kcal = kcal
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
        self.quantity = quantity
        self.unit = unit
        self.source = source
    }
}

struct MacroTotals: Decodable, Equatable {
    var kcal: Double = 0
    var proteinG: Double = 0
    var carbsG: Double = 0
    var fatG: Double = 0

    private enum CodingKeys: String, CodingKey {
        case kcal, proteinG, carbsG, fatG
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kcal = (try? c.decode(Double.self, forKey: .kcal)) ?? 0
        proteinG = (try? c.decode(Double.self, forKey: .proteinG)) ?? 0
        carbsG = (try? c.decode(Double.self, forKey: .carbsG)) ?? 0
        fatG = (try? c.decode(Double.self, forKey: .fatG)) ?? 0
    }

    static func sum(_ entries: [NutritionEntry]) -> MacroTotals {
        entries.reduce(into: MacroTotals()) { acc, e in
            acc.kcal += e.kcal
            acc.proteinG += e.proteinG
            acc.carbsG += e.carbsG
            acc.fatG += e.fatG
        }
    }
}

// Response of GET /api/athlete/nutrition?date=YYYY-MM-DD.
struct NutritionDayResponse: Decodable {
    let date: String
    let entries: [NutritionEntry]
    let totals: MacroTotals
}

// AUDIT — POST /api/athlete/nutrition responds `{ "entry": {...} }` (201), NOT a bare
// NutritionEntry. Decoding the bare entry threw keyNotFound → the save looked failed
// (and re-POSTing duplicated) even though the 201 persisted. This is the real envelope.
struct NutritionCreateResponse: Decodable {
    let entry: NutritionEntry
}

// MARK: - Wire: barcode lookup

// Response of GET /api/athlete/nutrition/barcode?code=XXXX. Macros are per 100g
// (`per` is "100g"); the UI scales by the chosen quantity before POSTing.
struct BarcodeLookupResponse: Decodable {
    let found: Bool
    let name: String?
    let kcal: Double?
    let proteinG: Double?
    let carbsG: Double?
    let fatG: Double?
    let per: String?
    let barcode: String?
    // AUDIT — the wire `raw` is a full OpenFoodFacts OBJECT, not a String. Typing it as
    // String? threw typeMismatch on every found:true product ("no encontrado" for all).
    // The client doesn't need it, so it's dropped (synthesized decode ignores the key).
    // Follow-up server-side si algún día se quiere capturar la provenance en el lookup.
}

// MARK: - Wire: search by name

// One result of GET /api/athlete/nutrition/search?q=… Macros are per 100g
// (`per` is "100g"); the UI scales by the chosen quantity before POSTing.
struct FoodSearchResult: Decodable, Identifiable, Hashable {
    // OFF results have no stable id of their own; synthesise one so SwiftUI
    // lists stay diffable (name + brand + barcode is unique enough here).
    var id: String { "\(name)|\(brand ?? "")|\(barcode ?? "")" }
    let name: String
    let brand: String?
    let kcal: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
    let per: String
    let barcode: String?
}

struct FoodSearchResponse: Decodable {
    let results: [FoodSearchResult]
}

// MARK: - Wire: photo analysis

// One AI-estimated item from POST /api/athlete/nutrition/photo. Macros are
// absolute for the whole estimated portion (no per-100g normalisation).
struct PhotoFoodItem: Decodable, Identifiable, Hashable {
    var id: String { "\(name)-\(Int(kcal))-\(Int(proteinG))" }
    let name: String
    let kcal: Double
    let proteinG: Double
    let carbsG: Double
    let fatG: Double
    let confidence: Double?
}

struct PhotoAnalysisResponse: Decodable {
    let items: [PhotoFoodItem]
}

// MARK: - Domain error

// Surfaced when the server has no vision model wired (HTTP 501
// vision_not_configured). The UI shows an honest "no disponible" message and
// keeps manual / barcode flows working.
struct NutritionPhotoUnavailable: Error {}
