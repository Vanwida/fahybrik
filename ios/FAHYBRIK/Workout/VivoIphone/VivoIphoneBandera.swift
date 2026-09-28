import Foundation

// LA BANDERA DEL VIVO NUEVO. Por defecto ENCENDIDA en Debug y APAGADA en
// Release hasta que las cinco familias estén portadas sobre `VivoIphoneView`.
// Se puede forzar por UserDefaults (la hoja de diagnóstico la puede tocar):
//   defaults write <bundle> fahybrid.vivoIphone.nuevo -bool YES
enum VivoIphoneBandera {
    static let clave = "fahybrid.vivoIphone.nuevo"

    static var activa: Bool {
        if let v = UserDefaults.standard.object(forKey: clave) as? Bool { return v }
        #if DEBUG
        return true
        #else
        return false
        #endif
    }
}
