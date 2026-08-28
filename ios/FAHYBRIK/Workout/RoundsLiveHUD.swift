import SwiftUI

// Lecturas de una lista de rondas. La cara For Time / RoundsLiveHUD se borró:
// el vivo pinta `livePicture`. Estas cuentas siguen siendo del dominio.

enum RoundsReadings {
    static func mediaS(_ cerradas: [Double]) -> Double? {
        guard cerradas.count >= 2 else { return nil }
        return cerradas.reduce(0, +) / Double(cerradas.count)
    }

    static func proyeccionS(rondas: Int, cerradas: [Double]) -> Double? {
        mediaS(cerradas).map { ($0 * Double(rondas)).rounded() }
    }

    static func caidaS(_ cerradas: [Double]) -> Double? {
        guard let media = mediaS(cerradas), let ultima = cerradas.last else { return nil }
        let delta = ultima - media
        return abs(delta) >= 3 ? delta : nil
    }

    static func hiloPorTramos(rondas: Int, anchoPt: CGFloat) -> Bool {
        rondas > 0 && anchoPt / CGFloat(rondas) >= 4
    }
}

enum RoundsListBudget {
    static let stripPt: CGFloat = 40
    static let bandaListaPt: CGFloat = 144
    static let cabeceraPt: CGFloat = 34
    static let filaPt: CGFloat = 38
    static let huecosPt: CGFloat = 24

    static func rondasListadas(alto: CGFloat) -> Int {
        let paraFilas = alto - stripPt - bandaListaPt - cabeceraPt - huecosPt
        return max(0, Int(paraFilas / filaPt))
    }
}
