import Foundation

// ATR block periodization — pedagogical phase labels (decision D2).
//
// The backend / coach side carry the raw block siglas (ACC / TRANS / REAL).
// Athletes must NOT see the raw siglas — they see the pedagogical name. The
// labels mirror the Documento Maestro del Proyecto (sección 4, modalidad Pro),
// which is ground truth: acumulación, intensificación y tapering. An athlete
// and Pablo always read the same word for the same block.
//
//   ACC   → Acumulación     (volumen + capacidad general)
//   TRANS → Intensificación (trabajo específico de carrera)
//   REAL  → Tapering        (afinado + pico el día A-event)
//
// Anything unrecognised is returned capitalized as-is so we never lose data.
func atrPhaseLabel(_ phase: String, locale: String = "es") -> String {
    let key = phase.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    let isSpanish = locale.lowercased().hasPrefix("es")
    switch key {
    case "ACC":
        return isSpanish ? "Acumulación" : "Accumulation"
    case "TRANS":
        return isSpanish ? "Intensificación" : "Intensification"
    case "REAL":
        return isSpanish ? "Tapering" : "Tapering"
    default:
        return phase.prefix(1).uppercased() + phase.dropFirst().lowercased()
    }
}
