import SwiftUI

// LA LLAVE PARA ABRIR «DEL COACH».
//
// La bandeja no puede quedar enterrada, pero tampoco es un destino primario que merezca una pestaña:
// vive en el cromo de Hoy (`BotonCromoDia`, con el globito de lo que te reclama) y `AppShell` la levanta
// como cover a través de esta clave, igual que hace con el hilo del chat. Quien quiera abrirla —el botón
// de Hoy, un push— llama a `openCoachInbox`; quien la aloja es solo AppShell.

private struct OpenCoachInboxKey: EnvironmentKey {
    static let defaultValue: (String?) -> Void = { _ in }
}

extension EnvironmentValues {
    /// Abre la bandeja «Del coach». Con un id, además abre ese comunicado (es
    /// por donde entra un push). Lo inyecta AppShell; fuera de él no hace nada,
    /// así que una vista previa nunca revienta.
    var openCoachInbox: (String?) -> Void {
        get { self[OpenCoachInboxKey.self] }
        set { self[OpenCoachInboxKey.self] = newValue }
    }
}
