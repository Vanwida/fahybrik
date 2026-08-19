import Foundation
import UIKit
import SwiftUI

// Piel de marca que el atleta hereda de SU coach — nombre, logo y acento,
// tal y como los puso el coach en el panel. Viaja dentro de `GET /api/auth/me`
// (`shared/domain/coach/club-skin.ts` → `deviceClubTheme`).
//
// Todo campo puede llegar `null`: sin coach, o un coach que no ha tocado su
// piel, manda null y la app pinta la marca de este binario (FAHYBRID +
// naranja #F06A2A) exactamente como hasta hoy — ver los cuatro `static var`
// en Theme.Color que consumen `ClubThemeStore.current`.
//
// Los hexes del acento ya vienen resueltos por el servidor para el lienzo
// OSCURO (la app y el reloj — ver docstring de `club-accent.ts`). iOS NO
// recalcula ningún color: solo los lee y los pinta, para que panel y app
// nunca puedan divergir.

/// Los cuatro papeles del acento del club, ya resueltos — mapeo 1:1 con
/// `Theme.Color.accent` / `accentPress` / `accentOn` / `accentText`.
struct ClubAccentPayload: Codable, Equatable {
    /// Relleno de botón / pastilla activa / barra. → Theme.Color.accent
    let fill: String
    /// Texto y glifos ENCIMA del relleno. → Theme.Color.accentOn
    let onFill: String
    /// El relleno mientras se pulsa. → Theme.Color.accentPress
    let press: String
    /// El acento como TEXTO o icono sobre el fondo. → Theme.Color.accentText
    let text: String
    /// Alfa del tinte suave (mismo hex que `fill`). No consumido todavía —
    /// ningún token `*Tint` del atleta deriva hoy del acento del club.
    let softAlpha: Double

    var swiftUIFill: SwiftUI.Color? { fill.asWireColor.map(SwiftUI.Color.init) }
    var swiftUIOnFill: SwiftUI.Color? { onFill.asWireColor.map(SwiftUI.Color.init) }
    var swiftUIPress: SwiftUI.Color? { press.asWireColor.map(SwiftUI.Color.init) }
    var swiftUIText: SwiftUI.Color? { text.asWireColor.map(SwiftUI.Color.init) }
}

/// La piel del club — nombre, logo y acento. Nombre/logo se decodifican para
/// que el contrato quede completo desde ya, pero HOY solo el acento pinta
/// algo en iOS (ver Theme.Color); ninguna pantalla sustituye todavía el
/// wordmark o el icono de fábrica por los del club.
struct ClubTheme: Codable, Equatable {
    let name: String?
    let logoUrl: String?
    let accent: ClubAccentPayload?
}

/// Última piel de club conocida, persistida para que un arranque en frío SIN
/// red pinte ya los colores del coach en vez de un flash del naranja de
/// fábrica mientras responde `/auth/me`. Se limpia al cerrar sesión
/// (`AuthState.signOut`) para que un atleta nuevo en este teléfono nunca vea
/// la marca del coach anterior.
enum ClubThemeStore {
    private static let storageKey = "fahybrik.clubTheme"

    private static var cachedValue: ClubTheme?
    private static var hasLoadedFromDisk = false

    /// La piel activa — de memoria si ya se leyó en este proceso, si no del
    /// disco. `nil` en cualquier caso = pinta la marca del binario.
    static var current: ClubTheme? {
        if !hasLoadedFromDisk {
            cachedValue = readFromDisk()
            hasLoadedFromDisk = true
        }
        return cachedValue
    }

    /// Llamar tras cada `/auth/me` (y tras cualquier respuesta que reuse su
    /// forma, como el editor de perfil): guarda la piel nueva y la deja lista
    /// para el próximo arranque en frío.
    static func update(_ theme: ClubTheme?) {
        cachedValue = theme
        hasLoadedFromDisk = true
        guard let theme, let data = try? JSONEncoder().encode(theme) else {
            UserDefaults.standard.removeObject(forKey: storageKey)
            return
        }
        UserDefaults.standard.set(data, forKey: storageKey)
    }

    /// Cierre de sesión / cambio de atleta.
    static func clear() {
        cachedValue = nil
        hasLoadedFromDisk = true
        UserDefaults.standard.removeObject(forKey: storageKey)
    }

    private static func readFromDisk() -> ClubTheme? {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return nil }
        return try? JSONDecoder().decode(ClubTheme.self, from: data)
    }
}

private extension String {
    /// UIColor from a "#rrggbb" wire hex. Lenient about the leading `#`. nil
    /// on anything that doesn't parse — every accessor above falls back to
    /// the binary's own token rather than paint a garbled color.
    var asWireColor: UIColor? {
        var s = self
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let value = UInt32(s, radix: 16) else { return nil }
        return UIColor(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: 1
        )
    }
}
