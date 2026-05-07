import Foundation

// Demo persona — Marc Vidal · HYROX BCN 2026 · 42 days out · REAL block w2d4.
// Mirrors docs/design/fahybrik-design-system/project/athlete_app/data.jsx
// PERSONA. Real data comes from the backend; this is the dev fixture so the
// screens render at élite density before APIs ship.
struct TodayPersona {
    let name = "Marc Vidal"
    let initials = "MV"
    let raceName = "HYROX BCN"
    let daysToRace = 42
    let block = "REAL"
    let week = 2
    let day = 4
    let recoveryPct = 72
    let hrvDelta = "▲"
    let hrvValue = 58
    let hrvUnit = "ms"
    let sleep = "7h 12m"
    let sleepHours = "7:12"
    let rhr = 48
    let weeklyCompliance = "5/6"
    let weeklyVolumeDelta = "+12%"
    let weeklyRpe = "7.2"
    let ctl = 75
    let ctlTrend = "▲"
    let atl = 63
    let atlTrend = "▲"
    let tsb = 12
    let tsbLabel = "fresco"
    let acr = "1.1"
    let acrLabel = "normal"
    let z34 = 68
    let readiness = 78
    let polZ12 = 78
    let polZ3 = 8
    let polZ45 = 14
    let yesterdayTitle = "100m Run · 50 Wall Balls"
    let yesterdayDuration = "24:32"
    let yesterdayRpe = 8
    let yesterdayCoachNote = "Bien metido. Mantén."

    static let demo = TodayPersona()
}
