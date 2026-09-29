import Foundation

// LA BANDERA DE LAS ANALÍTICAS REHECHAS (mismo patrón que `VivoIphoneBandera`).
//
// ENCENDIDA en Debug, APAGADA en Release mientras el motor no sirva los ocho
// bloques y la segunda tanda (familias y sesión) no esté encima. La pestaña se
// llama «Analíticas» en los dos casos (firmado por Alex el 29-09). La vista
// vieja (`AnalyticsView`, siete contratos) sigue compilada y es lo que ve Release.
//
// Se puede forzar por UserDefaults (la hoja de diagnóstico la puede tocar):
//   defaults write <bundle> fahybrid.analiticas.panel -bool YES   → la portada nueva
//   defaults write <bundle> fahybrid.analiticas.panel -bool NO    → la vista vieja
enum AnaliticasBandera {
    static let clave = "fahybrid.analiticas.panel"

    static var activa: Bool {
        if let v = UserDefaults.standard.object(forKey: clave) as? Bool { return v }
        #if DEBUG
        return true
        #else
        return false
        #endif
    }
}
