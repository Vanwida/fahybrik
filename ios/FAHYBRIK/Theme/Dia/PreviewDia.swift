#if DEBUG
import SwiftUI

// LO QUE NECESITA UNA PREVIEW (Y LA GALERÍA DE LAS PRUEBAS) DE «EL DÍA»: un club con otro
// acento y las dos apariencias a la vez.
//
// Todo lo del kit se comprueba en claro y en oscuro y con un acento de club DISTINTO del naranja
// de fábrica: un componente que lleva el naranja clavado sólo se ve mal cuando un coach elige
// otro color, que es justo cuando ya no hay quien lo arregle. Por eso la comprobación no es
// opcional y vive junto al kit, no en una prueba suelta.

extension ClubTheme {
    /// Un azul con tinta CLARA: el caso contrario al naranja de fábrica (tinta oscura sobre relleno
    /// vivo). Los cuatro papeles salen de `buildClubAccent('#2C5F9E')` (`club-accent.ts`), que es
    /// lo que el servidor le mandaría a un club que eligiera ese color.
    static let pruebaAzul = ClubTheme(
        name: "Club de prueba",
        logoUrl: nil,
        accent: ClubAccentPayload(fill: "#2c5f9e", onFill: "#f5f5f5", press: "#255186", text: "#5982b3", softAlpha: 0.14)
    )

    /// Un amarillo con tinta OSCURA y texto de acento clarísimo: el caso que más castiga al
    /// «acento como texto» sobre lienzo claro. Sale de `buildClubAccent('#F5C518')`.
    static let pruebaAmarillo = ClubTheme(
        name: "Club de prueba",
        logoUrl: nil,
        accent: ClubAccentPayload(fill: "#f5c518", onFill: "#0a0a0a", press: "#d0a714", text: "#f5c518", softAlpha: 0.14)
    )

    /// Un verde y un violeta más, para medir contrastes sobre un abanico y no sobre un solo ejemplo.
    /// Salen de `buildClubAccent` con `#1B8A5A` y `#8E2DE2`.
    static let pruebaVerde = ClubTheme(
        name: "Club de prueba",
        logoUrl: nil,
        accent: ClubAccentPayload(fill: "#1b8a5a", onFill: "#0a0a0a", press: "#17754c", text: "#269062", softAlpha: 0.14)
    )
    static let pruebaVioleta = ClubTheme(
        name: "Club de prueba",
        logoUrl: nil,
        accent: ClubAccentPayload(fill: "#8e2de2", onFill: "#f5f5f5", press: "#7926c0", text: "#a65ae8", softAlpha: 0.14)
    )

    /// Los acentos de prueba, para recorrerlos en una prueba.
    static let acentosDePrueba: [ClubTheme] = [pruebaAzul, pruebaAmarillo, pruebaVerde, pruebaVioleta]
}

/// El contenido en claro (arriba) y en oscuro (abajo), sobre el lienzo de cada apariencia, con el
/// acento de `club` (`nil` = el de fábrica). El acento vive en un almacén global: se fija al montar
/// la vista, así que sólo puede haber uno por preview — de ahí que cada componente tenga la suya
/// «de fábrica» y otra «club azul».
struct EnAmbasDia<Contenido: View>: View {
    let contenido: Contenido

    init(club: ClubTheme? = nil, @ViewBuilder contenido: () -> Contenido) {
        ClubThemeStore.update(club)
        self.contenido = contenido()
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach([ColorScheme.light, .dark], id: \.self) { esquema in
                contenido
                    .padding(Theme.Spacing.pantalla)
                    .frame(maxWidth: .infinity)
                    .background(Theme.Color.background)
                    .environment(\.colorScheme, esquema)
            }
        }
    }
}
#endif
