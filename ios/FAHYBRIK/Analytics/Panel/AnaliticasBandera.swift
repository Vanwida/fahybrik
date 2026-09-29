import Foundation

// LA BANDERA DE LAS ANALÍTICAS REHECHAS (mismo patrón que `VivoIphoneBandera`).
//
// ENCENDIDA por defecto también en Release (decisión de Alex el 29-09: solo la
// prueban él y el equipo). La pestaña se llama «Analíticas» en los dos casos
// (firmado el 29-09). La vista vieja (`AnalyticsView`, siete contratos) sigue
// compilada hasta que la portada se pruebe en aparato y la segunda tanda
// (familias y sesión) esté encima; apagar la bandera la devuelve.
//
// Se puede forzar por UserDefaults (la hoja de diagnóstico la puede tocar):
//   defaults write <bundle> fahybrid.analiticas.panel -bool YES   → la portada nueva
//   defaults write <bundle> fahybrid.analiticas.panel -bool NO    → la vista vieja
enum AnaliticasBandera {
    static let clave = "fahybrid.analiticas.panel"

    static var activa: Bool {
        UserDefaults.standard.object(forKey: clave) as? Bool ?? true
    }
}
