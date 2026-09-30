import SwiftUI

// LAS HOJAS, LOS AVISOS Y LOS DIÁLOGOS DE CONFIRMACIÓN de «Dispositivos y apps», aparte del cuerpo para que el
// compilador no tenga que comprobar de una vez un tipo enorme. Todo lo que desconecta pide confirmación; conectar
// abre la página del proveedor en una hoja de Safari y, al cerrarla, se vuelve a leer quién está conectado.

struct DeviceConnectionsPresentation: ViewModifier {
    @Binding var polarSafari: SafariURL?
    @Binding var corosSafari: SafariURL?
    @Binding var polarAlert: String?
    @Binding var corosAlert: String?
    @Binding var showCorosDisconnectConfirm: Bool
    @Binding var showCorosLinkAsk: Bool
    @Binding var showHealthDisconnectConfirm: Bool
    @Binding var showWatchWorkoutsDisconnectConfirm: Bool

    let onLoadWearables: () async -> Void
    let onPullCoros: () async -> Void
    let onDisconnectCoros: () async -> Void
    let onAnswerCorosLink: (Bool) async -> Void
    let onDisconnectAppleHealth: () -> Void
    let onDisconnectWatchWorkouts: () -> Void

    func body(content: Content) -> some View {
        content
            .sheet(item: $polarSafari, onDismiss: { Task { await onLoadWearables() } }) { item in
                SafariView(url: item.url).ignoresSafeArea()
            }
            .sheet(item: $corosSafari, onDismiss: { Task { await onLoadWearables(); await onPullCoros() } }) { item in
                SafariView(url: item.url).ignoresSafeArea()
            }
            .modifier(DeviceConnectionsAlerts(
                polarAlert: $polarAlert,
                corosAlert: $corosAlert,
                showCorosDisconnectConfirm: $showCorosDisconnectConfirm,
                showCorosLinkAsk: $showCorosLinkAsk,
                showHealthDisconnectConfirm: $showHealthDisconnectConfirm,
                showWatchWorkoutsDisconnectConfirm: $showWatchWorkoutsDisconnectConfirm,
                onDisconnectCoros: onDisconnectCoros,
                onAnswerCorosLink: onAnswerCorosLink,
                onDisconnectAppleHealth: onDisconnectAppleHealth,
                onDisconnectWatchWorkouts: onDisconnectWatchWorkouts
            ))
    }
}

private struct DeviceConnectionsAlerts: ViewModifier {
    @Binding var polarAlert: String?
    @Binding var corosAlert: String?
    @Binding var showCorosDisconnectConfirm: Bool
    @Binding var showCorosLinkAsk: Bool
    @Binding var showHealthDisconnectConfirm: Bool
    @Binding var showWatchWorkoutsDisconnectConfirm: Bool

    let onDisconnectCoros: () async -> Void
    let onAnswerCorosLink: (Bool) async -> Void
    let onDisconnectAppleHealth: () -> Void
    let onDisconnectWatchWorkouts: () -> Void

    private var polarAlertBinding: Binding<Bool> {
        Binding(get: { polarAlert != nil }, set: { if !$0 { polarAlert = nil } })
    }

    private var corosAlertBinding: Binding<Bool> {
        Binding(get: { corosAlert != nil }, set: { if !$0 { corosAlert = nil } })
    }

    func body(content: Content) -> some View {
        content
            .alert("Polar", isPresented: polarAlertBinding, presenting: polarAlert) { _ in
                Button("Entendido", role: .cancel) {}
            } message: { message in
                Text(message)
            }
            .alert("COROS", isPresented: corosAlertBinding, presenting: corosAlert) { _ in
                Button("Entendido", role: .cancel) {}
            } message: { message in
                Text(message)
            }
            .confirmationDialog(
                "¿Desconectar COROS?",
                isPresented: $showCorosDisconnectConfirm,
                titleVisibility: .visible
            ) {
                Button("Desconectar", role: .destructive) { Task { await onDisconnectCoros() } }
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text("Revocamos el acceso a tu cuenta COROS. El historial ya importado se conserva.")
            }
            .confirmationDialog(
                "¿Esto es el entreno?",
                isPresented: $showCorosLinkAsk,
                titleVisibility: .visible
            ) {
                Button("Sí") { Task { await onAnswerCorosLink(true) } }
                Button("No") { Task { await onAnswerCorosLink(false) } }
                Button("Ahora no", role: .cancel) {}
            } message: {
                Text("Hay un entreno previsto hoy y una actividad nueva en COROS. Si dices que no, la actividad queda en el historial y el plan no se toca.")
            }
            .confirmationDialog(
                "¿Desconectar Apple Salud?",
                isPresented: $showHealthDisconnectConfirm,
                titleVisibility: .visible
            ) {
                Button("Desconectar", role: .destructive) { onDisconnectAppleHealth() }
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text("Dejaremos de leer y sincronizar tus datos de salud. Podrás volver a conectarlos cuando quieras.")
            }
            .confirmationDialog(
                "¿Quitar tus carreras del reloj?",
                isPresented: $showWatchWorkoutsDisconnectConfirm,
                titleVisibility: .visible
            ) {
                Button("Quitar", role: .destructive) { onDisconnectWatchWorkouts() }
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text("Las quitaremos de la app Entrenamiento del reloj. Seguirás teniéndolas aquí, en \(Marca.nombre).")
            }
    }
}
