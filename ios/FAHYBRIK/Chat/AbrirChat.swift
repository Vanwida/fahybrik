import SwiftUI

// LA PUERTA AL CHAT — el valor de entorno con el que cualquier pantalla pide abrir la conversación con el coach.
//
// El chat no es una pestaña (no debe estar enterrado, pero tampoco es un destino primario): se llega desde el
// icono de una cabecera o desde el menú de una cosa concreta. `AppShell` es dueño de la presentación (un
// `fullScreenCover`) y expone el abridor por aquí; los botones de cabecera con su globo de no leídos viven ya
// en el cromo de cada pestaña (`CromoDia`), no en una pieza suelta.

private struct OpenChatKey: EnvironmentKey {
    static let defaultValue: (ChatContextChoice?) -> Void = { _ in }
}

extension EnvironmentValues {
    /// Levanta el chat con el coach. Lo inyecta `AppShell`; en cualquier otro sitio (una preview, una captura)
    /// no hace nada, así que una cabecera suelta nunca revienta.
    ///
    /// Lleva carga OPCIONAL: sobre qué se quiere hablar. Nil desde una cabecera
    /// («quiero escribirle»), con contexto desde el menú de una cosa concreta
    /// («quiero preguntar por ESTE entreno»). Es UNA sola puerta a propósito: dos
    /// aberturas —una con contexto y otra sin— serían dos sitios que abren el
    /// mismo chat y divergirían en cuanto una se tocara.
    var openChat: (ChatContextChoice?) -> Void {
        get { self[OpenChatKey.self] }
        set { self[OpenChatKey.self] = newValue }
    }
}
