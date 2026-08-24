import Foundation

extension WorkoutSession {
    /// Las calorías de la sesión: las de las vueltas ya cerradas más las que lleve
    /// la ventana abierta. `nil` cuando nadie las ha medido — un entreno de hierro
    /// no las tiene, y un cero ahí diría que se midieron y salieron cero.
    var caloriasDeLaSesion: Int? {
        let cerradas = laps.compactMap(\.calories).reduce(0, +)
        let enCurso = Double(tramoErgCalories ?? 0)
        let total = cerradas + enCurso
        return total >= 1 ? Int(total.rounded()) : nil
    }
}
