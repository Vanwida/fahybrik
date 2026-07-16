import XCTest
@testable import FAHYBRIK

// Tests guiados — the delta mapping (direction per unit + formatting) and the
// new wire decodes (start, history, per-entry deltas), all against the same
// snake_case decoder APIClient uses.
final class BenchmarkDeltaTests: XCTestCase {

    private func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    // MARK: - Direction per unit (mirrors the server rule)

    func testSecondsLowerIsBetter() {
        XCTAssertTrue(BenchmarkDelta.improved(unit: "seconds", delta: -12))
        XCTAssertFalse(BenchmarkDelta.improved(unit: "seconds", delta: 12))
        XCTAssertFalse(BenchmarkDelta.improved(unit: "seconds", delta: 0))
    }

    func testCountAndLoadUnitsHigherIsBetter() {
        for unit in ["kg", "bpm", "meters", "reps", "calories"] {
            XCTAssertTrue(BenchmarkDelta.improved(unit: unit, delta: 2), unit)
            XCTAssertFalse(BenchmarkDelta.improved(unit: unit, delta: -2), unit)
            XCTAssertFalse(BenchmarkDelta.improved(unit: unit, delta: 0), unit)
        }
    }

    // MARK: - Value formatting

    func testValueLabels() {
        XCTAssertEqual(BenchmarkDelta.valueLabel(unit: "seconds", value: 1334), "22:14")
        XCTAssertEqual(BenchmarkDelta.valueLabel(unit: "seconds", value: 45), "45s")
        XCTAssertEqual(BenchmarkDelta.valueLabel(unit: "seconds", value: 3760), "1:02:40")
        XCTAssertEqual(BenchmarkDelta.valueLabel(unit: "kg", value: 142.5), "142.5 kg")
        XCTAssertEqual(BenchmarkDelta.valueLabel(unit: "kg", value: 140), "140 kg")
        XCTAssertEqual(BenchmarkDelta.valueLabel(unit: "bpm", value: 32), "32 bpm")
        XCTAssertEqual(BenchmarkDelta.valueLabel(unit: "meters", value: 850), "850 m")
        XCTAssertEqual(BenchmarkDelta.valueLabel(unit: "reps", value: 24), "24 reps")
        XCTAssertEqual(BenchmarkDelta.valueLabel(unit: "calories", value: 18), "18 cal")
    }

    func testDeltaLabelsKeepTheRawDirection() {
        XCTAssertEqual(BenchmarkDelta.deltaLabel(unit: "seconds", delta: -12), "−12 s")
        XCTAssertEqual(BenchmarkDelta.deltaLabel(unit: "seconds", delta: -65), "−1:05")
        XCTAssertEqual(BenchmarkDelta.deltaLabel(unit: "seconds", delta: 12), "+12 s")
        XCTAssertEqual(BenchmarkDelta.deltaLabel(unit: "kg", delta: 2.5), "+2.5 kg")
        XCTAssertEqual(BenchmarkDelta.deltaLabel(unit: "kg", delta: -5), "−5 kg")
        XCTAssertEqual(BenchmarkDelta.deltaLabel(unit: "bpm", delta: 3), "+3 bpm")
    }

    // MARK: - Series last value / delta

    func testSeriesLastDeltaNeedsTwoPoints() throws {
        let json = """
        {"series":[{"exercise_slug":"run_5k","label":"5K","unit":"seconds",
          "results":[{"value":1400,"recorded_at":"2026-06-01T09:00:00Z"},
                     {"value":1334,"recorded_at":"2026-07-01T09:00:00Z"}]}]}
        """
        let resp = try makeDecoder().decode(BenchmarkHistoryResponse.self, from: Data(json.utf8))
        let series = try XCTUnwrap(resp.series.first)
        XCTAssertEqual(series.lastValue, 1334)
        XCTAssertEqual(series.lastDelta, -66)

        let single = BenchmarkSeries(
            exerciseSlug: "run_5k", label: "5K", unit: "seconds",
            results: [BenchmarkPoint(value: 1400, recordedAt: "2026-06-01")]
        )
        XCTAssertEqual(single.lastValue, 1400)
        XCTAssertNil(single.lastDelta)
    }

    // MARK: - Wire decodes

    func testStartTestResponseDecodesTheRealWire() throws {
        // Verified E2E shape: numeric assignment_id, reused flag, 6-field
        // store_results with nullable derives/modality + the optional flag.
        let json = """
        {"assignment_id":482,"scheduled_for":"2026-07-16","reused":false,
         "store_results":[
           {"slug":"run_5k","unit":"seconds","measure":"time","label":"5K",
            "derives":"run_zones","modality":"run","optional":false},
           {"slug":"hrr60","unit":"bpm","measure":"hrr","label":"Recuperación",
            "derives":null,"modality":null,"optional":true}]}
        """
        let resp = try makeDecoder().decode(StartTestResponse.self, from: Data(json.utf8))
        XCTAssertEqual(resp.assignmentId, "482")   // normalized to the app's String shape
        XCTAssertEqual(resp.scheduledFor, "2026-07-16")
        XCTAssertEqual(resp.reused, false)
        XCTAssertEqual(resp.storeResults.count, 2)
        XCTAssertEqual(TestMeasure(resp.storeResults[1].measure), .hrr)
        XCTAssertFalse(resp.storeResults[0].isOptional)
        XCTAssertTrue(resp.storeResults[1].isOptional)
    }

    func testStartTestResponseToleratesStringIdAndMissingFlags() throws {
        // If the backend ever harmonizes ids to strings (like the status
        // endpoint) or drops reused/optional, the decode must keep working.
        let json = """
        {"assignment_id":"731","scheduled_for":"2026-07-16",
         "store_results":[{"slug":"row_2k","unit":"seconds","measure":"time","label":"2K remo"}]}
        """
        let resp = try makeDecoder().decode(StartTestResponse.self, from: Data(json.utf8))
        XCTAssertEqual(resp.assignmentId, "731")
        XCTAssertNil(resp.reused)
        XCTAssertFalse(resp.storeResults[0].isOptional)   // absent → required
    }

    // MARK: - Save gating (optional never blocks)

    func testOptionalEntriesNeverBlockTheSave() {
        // Required filled + optional missing → saveable (the omission is honest).
        XCTAssertTrue(TestResultGating.canSave(entries: [
            (value: 1334, isOptional: false),
            (value: nil, isOptional: true),
        ]))
        // Required missing → blocked, optional presence can't unlock it.
        XCTAssertFalse(TestResultGating.canSave(entries: [
            (value: nil, isOptional: false),
            (value: 32, isOptional: true),
        ]))
        // Nothing measured at all → nothing to send.
        XCTAssertFalse(TestResultGating.canSave(entries: [
            (value: nil, isOptional: true),
        ]))
        // Optional-only but measured → saveable.
        XCTAssertTrue(TestResultGating.canSave(entries: [
            (value: 32, isOptional: true),
        ]))
        XCTAssertFalse(TestResultGating.canSave(entries: []))
    }

    func testRecordResultDecodesEntryDeltas() throws {
        let json = """
        {"ok":true,"benchmarks_written":2,"zones_derived":[{"modality":"run","threshold_s":238}],
         "strength_maxes_written":0,"level_recomputed":false,
         "entries":[{"slug":"run_5k","value":1334,"prev_value":1346,"improved":true},
                    {"slug":"hrr60","value":32,"prev_value":null,"improved":null}]}
        """
        let res = try makeDecoder().decode(RecordBatteryResult.self, from: Data(json.utf8))
        let entries = try XCTUnwrap(res.entries)
        XCTAssertEqual(entries.count, 2)
        XCTAssertEqual(entries[0].prevValue, 1346)
        XCTAssertEqual(entries[0].improved, true)
        XCTAssertNil(entries[1].prevValue)   // first mark — nothing to beat
        XCTAssertEqual(res.improvedEntries.map(\.slug), ["run_5k"])
    }

    // MARK: - Celebration mapping (mockup C)

    func testCelebrationItemsMapThroughTheTestContract() {
        let specs = [
            StoreResultSpec(slug: "run_5k", unit: "seconds", measure: "time",
                            label: "5K", derives: nil, modality: nil, optional: nil),
            StoreResultSpec(slug: "hrr60", unit: "bpm", measure: "hrr",
                            label: "Recuperación", derives: nil, modality: nil, optional: true),
        ]
        let entries = [
            RecordBatteryResult.EntryDelta(slug: "run_5k", value: 1334, prevValue: 1346, improved: true),
            RecordBatteryResult.EntryDelta(slug: "hrr60", value: 34, prevValue: 31, improved: true),
            RecordBatteryResult.EntryDelta(slug: "unknown_slug", value: 10, prevValue: nil, improved: nil),
        ]
        let items = TestRecordCelebrationView.items(from: entries, specs: specs)
        XCTAssertEqual(items.count, 3)
        XCTAssertEqual(items[0].label, "5K")
        XCTAssertEqual(items[0].valueText, "22:14")
        XCTAssertEqual(items[0].deltaText, "−12 s vs tu marca anterior")
        XCTAssertEqual(items[1].valueText, "34 bpm")
        XCTAssertEqual(items[1].deltaText, "+3 bpm vs tu marca anterior")
        // Unknown slug degrades honestly: slug as label, no delta without a prev.
        XCTAssertEqual(items[2].label, "unknown_slug")
        XCTAssertNil(items[2].deltaText)
    }

    func testRecordResultToleratesMissingEntries() throws {
        // The pre-deltas backend shape must keep decoding (no celebration, no crash).
        let json = """
        {"ok":true,"benchmarks_written":1,"zones_derived":[],
         "strength_maxes_written":1,"level_recomputed":true}
        """
        let res = try makeDecoder().decode(RecordBatteryResult.self, from: Data(json.utf8))
        XCTAssertNil(res.entries)
        XCTAssertTrue(res.improvedEntries.isEmpty)
    }
}
