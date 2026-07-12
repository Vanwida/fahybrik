import XCTest
@testable import FAHYBRIK

// #28 — the joint side-by-side + streak: wire decode (the reserved-word `self` alias
// and snake_case are load-bearing) and the PURE gating/formatting (honest-null hides
// tonnage / RPE / the PR chip; a fresh pair hides the whole streak section).
final class DoblesJointTests: XCTestCase {

    private func side(name: String? = "Ana", time: Int? = 1700, rpe: Int? = 7,
                      pr: Int = 0, tonnage: Double? = nil) -> JointSummarySide {
        JointSummarySide(name: name, totalTimeS: time, rpe: rpe, prCount: pr, tonnageKg: tonnage)
    }
    private func dto(_ selfSide: JointSummarySide, _ partner: JointSummarySide?,
                     month: Int = 3, weeks: Int = 1) -> JointSummaryDTO {
        JointSummaryDTO(selfSide: selfSide, partner: partner, jointThisMonth: month, weeksStreak: weeks)
    }

    // MARK: - Wire decode (real decoder: convertFromSnakeCase + `self` alias)

    func testJointSummaryDecodesWithSelfAlias() throws {
        let json = Data(#"""
        {"self":{"name":"Ana","total_time_s":1700,"rpe":7,"pr_count":1,"tonnage_kg":500},
         "partner":null,"joint_this_month":2,"weeks_streak":1}
        """#.utf8)
        let d = try APIClient.makeJSONDecoder().decode(JointSummaryDTO.self, from: json)
        XCTAssertEqual(d.selfSide.name, "Ana")           // the `self` → selfSide alias works
        XCTAssertEqual(d.selfSide.totalTimeS, 1700)
        XCTAssertEqual(d.selfSide.prCount, 1)
        XCTAssertEqual(d.selfSide.tonnageKg, 500)
        XCTAssertNil(d.partner)                          // honest-null partner
        XCTAssertEqual(d.jointThisMonth, 2)
        XCTAssertEqual(d.weeksStreak, 1)
    }

    func testStreakBlockDecodes() throws {
        let json = Data(#"""
        {"joint_this_month":2,"weeks_streak":2,
         "last_joint":{"date":"2026-07-15","title":"Sim Dobles","self_time_s":1700,"partner_time_s":1800}}
        """#.utf8)
        let s = try APIClient.makeJSONDecoder().decode(DoblesStreakBlock.self, from: json)
        XCTAssertEqual(s.jointThisMonth, 2)
        XCTAssertEqual(s.weeksStreak, 2)
        XCTAssertEqual(s.lastJoint?.title, "Sim Dobles")
        XCTAssertEqual(s.lastJoint?.selfTimeS, 1700)
        XCTAssertEqual(s.lastJoint?.partnerTimeS, 1800)
    }

    // MARK: - JointShareData gating

    func testShareDataNilWhenNoPartner() {
        XCTAssertNil(JointShareData.from(dto: dto(side(), nil), title: "Sim", date: Date(), partnerFallback: nil))
    }

    func testShareDataBuildsBothSidesWithFooter() throws {
        let data = try XCTUnwrap(JointShareData.from(
            dto: dto(side(name: "Ana", time: 1700, rpe: 7, pr: 1, tonnage: 500),
                     side(name: "Marcos", time: 1800, rpe: 8, pr: 0, tonnage: 620), month: 3),
            title: "Sim Dobles", date: Date(), partnerFallback: "Marcos"))
        XCTAssertEqual(data.title, "Sim Dobles")
        XCTAssertEqual(data.selfSide.timeText, "28:20")       // 1700 s
        XCTAssertEqual(data.selfSide.tonnageText, "500 kg")
        XCTAssertTrue(data.selfSide.hasPR)                    // pr 1
        XCTAssertEqual(data.partnerSide.name, "Marcos")
        XCTAssertFalse(data.partnerSide.hasPR)               // pr 0
        XCTAssertEqual(data.footerText, "3ª sesión juntos este mes")
    }

    func testShareDataHonestNullGating() throws {
        // No strength load → no tonnage; no RPE → hidden; no time → "—".
        let data = try XCTUnwrap(JointShareData.from(
            dto: dto(side(name: nil, time: nil, rpe: nil, pr: 0, tonnage: nil),
                     side(name: "Marcos", time: 1800, rpe: nil, pr: 2, tonnage: nil)),
            title: "Sim", date: Date(), partnerFallback: nil))
        XCTAssertNil(data.selfSide.tonnageText)
        XCTAssertNil(data.selfSide.rpe)
        XCTAssertEqual(data.selfSide.timeText, "—")
        XCTAssertEqual(data.selfSide.name, "Tú")             // name null → self fallback
        XCTAssertTrue(data.partnerSide.hasPR)                // pr 2 → chip
        XCTAssertNil(data.partnerSide.tonnageText)
    }

    // MARK: - Streak section gating

    func testStreakHasHistoryGate() {
        XCTAssertFalse(DoblesStreakBlock(jointThisMonth: 0, weeksStreak: 0, lastJoint: nil).hasHistory)
        XCTAssertTrue(DoblesStreakBlock(jointThisMonth: 1, weeksStreak: 0, lastJoint: nil).hasHistory)
        XCTAssertTrue(DoblesStreakBlock(jointThisMonth: 0, weeksStreak: 2, lastJoint: nil).hasHistory)
        let last = DoblesLastJoint(date: "2026-07-15", title: "Sim", selfTimeS: 1700, partnerTimeS: nil)
        XCTAssertTrue(DoblesStreakBlock(jointThisMonth: 0, weeksStreak: 0, lastJoint: last).hasHistory)
    }

    // MARK: - Formatting

    func testDateFormatting() {
        XCTAssertEqual(DoblesJointFormat.isoDayMonth("2026-07-15"), "15 jul")
        XCTAssertEqual(DoblesJointFormat.isoDayMonth("garbage"), "garbage")   // tolerant
    }
}
