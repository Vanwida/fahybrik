import Foundation

// LA BANDERA DEL VIVO NUEVO. ENCENDIDA en Debug y en Release (29-09): el vivo
// nuevo cubre ya lo que el recorrido real usaba del shell viejo (dobles y
// relevo, salir sin terminar, saltar de tramo). El shell viejo (`RunLiveShellView`)
// sigue compilado como vuelta atrás hasta la prueba en aparato (DECISIONS 2026-09-29).
// Se puede forzar por UserDefaults (la hoja de diagnóstico la puede tocar):
//   defaults write <bundle> fahybrid.vivoIphone.nuevo -bool NO   → el shell viejo
enum VivoIphoneBandera {
    static let clave = "fahybrid.vivoIphone.nuevo"

    static var activa: Bool {
        if let v = UserDefaults.standard.object(forKey: clave) as? Bool { return v }
        return true
    }
}
