import SwiftUI

// «COROS» — lo que se ve al tocar una cuenta COROS ya conectada: sincronizar ahora y desconectar. El estado de la
// conexión y la sincronización son del anfitrión (`DeviceConnectionsView`); esta pantalla solo los lee y pide las
// dos acciones.

struct CorosConnectionDetailView: View {
    let bearer: String?
    @Binding var corosSyncing: Bool
    let onSync: () async -> Void
    let onDisconnectRequest: () -> Void

    var body: some View {
        PantallaPerfil(titulo: "COROS") {
            Text("Lee tus entrenos desde tu cuenta COROS. El plan no baja al reloj — solo importamos lo que haces.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                Haptics.light()
                Task { await onSync() }
            } label: {
                AccionDia(corosSyncing ? "Sincronizando…" : "Sincronizar ahora", glifo: .reintentar, enCurso: corosSyncing)
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
            .disabled(corosSyncing || bearer == nil)
            .accessibilityLabel(corosSyncing ? "Sincronizando COROS" : "Sincronizar ahora")

            AccionTextoPerfil(titulo: "Desconectar COROS", peligro: true, accion: onDisconnectRequest)
                .disabled(corosSyncing)
        }
    }
}
