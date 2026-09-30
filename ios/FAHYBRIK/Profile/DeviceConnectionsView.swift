import SwiftUI
import HealthKit

// «DISPOSITIVOS Y APPS» — agrupa Apple Watch, Garmin, Apple Salud, Polar, COROS, Amazfit y el PM5. Patrón
// TrainingPeaks: una puerta en Perfil, las marcas dentro.
//
// Tres grupos por lo que hace cada marca con el atleta: las que RECIBEN el entreno (el plan te sale en el reloj),
// las que SOLO LEEN lo que haces (tu entrenador lo ve, el plan no baja) y las del GIMNASIO (Bluetooth en el
// momento). Cada fila dice su estado con una marca (un punto) y una palabra; conectar es SIEMPRE un toque del
// atleta y desconectar pide confirmación: nada se conecta ni se reconecta solo.
//
// El fichero tiene el estado y el cuerpo; las acciones contra cada proveedor están en
// `DeviceConnectionsView+Acciones.swift`, las frases en `DispositivosTextos.swift` (funciones puras, con sus
// pruebas) y los diálogos en `DeviceConnectionsPresentation.swift`.

struct DeviceConnectionsView: View {
    let bearer: String?

    @Environment(AppDataStore.self) var store
    @Environment(\.scenePhase) private var scenePhase

    @State var aviso: AvisoDia.Contenido? = nil

    @State var healthConnected: Bool = HealthKitConnection.isConnected
    @State var healthRequesting: Bool = false
    @State var healthDenied: Bool = false
    let healthAvailable: Bool = HKHealthStore.isHealthDataAvailable()
    @State var showHealthDisconnectConfirm: Bool = false
    @State var healthShowRevokeHint: Bool = false

    var watchScheduler: AppleWatchWorkoutScheduler { AppleWatchWorkoutScheduler.shared }
    @State var watchWorkoutsDenied: Bool = false
    @State var showWatchWorkoutsDisconnectConfirm: Bool = false

    @State var polarConnected: Bool = false
    @State var polarConnecting: Bool = false
    @State var polarSafari: SafariURL? = nil
    @State var polarAlert: String? = nil

    @State var corosConnected: Bool = false
    @State var corosConnecting: Bool = false
    @State var corosSyncing: Bool = false
    @State var corosSafari: SafariURL? = nil
    @State var corosAlert: String? = nil
    @State var showCorosDisconnectConfirm: Bool = false
    @State var corosPendingLink: WearablePendingLink? = nil
    @State var showCorosLinkAsk: Bool = false

    var body: some View {
        PantallaPerfil(titulo: "Dispositivos y apps") {
            Text("Elige qué integración quieres activar. Cada marca hace una cosa distinta: algunas reciben tu entreno, otras solo leen lo que haces.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            gruposDeDispositivos
        }
        .avisoDia($aviso)
        .task {
            await loadWearables()
            await pullCorosIfConnected()
            await watchScheduler.refreshAuthorization()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await pullCorosIfConnected() }
        }
        .modifier(DeviceConnectionsPresentation(
            polarSafari: $polarSafari,
            corosSafari: $corosSafari,
            polarAlert: $polarAlert,
            corosAlert: $corosAlert,
            showCorosDisconnectConfirm: $showCorosDisconnectConfirm,
            showCorosLinkAsk: $showCorosLinkAsk,
            showHealthDisconnectConfirm: $showHealthDisconnectConfirm,
            showWatchWorkoutsDisconnectConfirm: $showWatchWorkoutsDisconnectConfirm,
            onLoadWearables: { await loadWearables() },
            onPullCoros: { await pullCorosIfConnected() },
            onDisconnectCoros: { await disconnectCoros() },
            onAnswerCorosLink: { yes in await answerCorosLink(yes: yes) },
            onDisconnectAppleHealth: disconnectAppleHealth,
            onDisconnectWatchWorkouts: disconnectWatchWorkouts
        ))
    }

    // MARK: - Los grupos

    private var gruposDeDispositivos: some View {
        VStack(alignment: .leading, spacing: PantallaPerfil<EmptyView, EmptyView>.entreBloques) {
            grupo(
                titulo: "Reciben tu entreno",
                pie: "El plan te aparece en el reloj. No necesitas el móvil para entrenar."
            ) {
                appleWatchRow
                NavigationLink {
                    GarminSetupView(bearer: bearer)
                } label: {
                    FilaDeDispositivo(
                        glifo: .garmin, titulo: "Garmin", detalle: "Cómo poner tu entreno en el reloj",
                        estado: EstadoDeProveedor(texto: "ver cómo", estilo: .acento)
                    )
                }
                .filaTocablePerfil()
            }

            grupo(
                titulo: "Solo leen lo que haces",
                pie: "Tus entrenos llegan a tu entrenador, pero el plan no baja al reloj."
            ) {
                appleHealthRow
                polarRow
                corosRow
                FilaDeDispositivo(
                    glifo: .amazfit, titulo: "Amazfit", detalle: "Activa «Apple Salud» en la app Zepp › Más ajustes",
                    estado: EstadoDeProveedor(texto: "vía Salud", estilo: .velo), conChevron: false
                )
            }

            grupo(
                titulo: "En el gimnasio",
                pie: "Se conectan por Bluetooth en el momento. La banda de pulso y la cinta se buscan al empezar el entreno."
            ) {
                NavigationLink {
                    PM5SettingsView(store: PM5ConnectionStore.shared)
                } label: {
                    FilaDeDispositivo(
                        glifo: .pm5, titulo: "Concept2 PM5",
                        detalle: PM5ConnectionStore.shared.rememberedDeviceName ?? "Sin emparejar",
                        estado: PM5ConnectionStore.shared.rememberedDeviceName == nil
                            ? nil : EstadoDeProveedor(texto: "pareado", estilo: .velo, marca: Theme.Color.ok)
                    )
                }
                .filaTocablePerfil()
            }
        }
    }

    private func grupo<Filas: View>(
        titulo: String,
        pie: String,
        @ViewBuilder filas: @escaping () -> Filas
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                TituloSeccionDia(titulo)
                NotaPerfil(pie)
            }
            GrupoPerfil { filas() }
        }
    }

    // MARK: - Apple Watch

    private var appleWatchRow: some View {
        let dicho = TextosDeDispositivos.reloj(
            soportado: watchScheduler.isSupported, denegado: watchWorkoutsDenied,
            activado: watchScheduler.isEnabled, programadas: watchScheduler.scheduledCount
        )
        return FilaInterruptorPerfil(
            glifo: .appleWatch, titulo: "Apple Watch", detalle: dicho.texto, marca: dicho.marca?.color,
            enCurso: watchScheduler.isWorking, deshabilitado: !watchScheduler.isSupported,
            nombreAccesible: "Carreras en el Apple Watch",
            activo: watchWorkoutsToggle
        )
    }

    private var watchWorkoutsToggle: Binding<Bool> {
        Binding(
            get: { watchScheduler.isEnabled },
            set: { turnOn in
                Haptics.light()
                if turnOn {
                    Task { await connectWatchWorkouts() }
                } else {
                    showWatchWorkoutsDisconnectConfirm = true
                }
            }
        )
    }

    // MARK: - Apple Salud

    /// La fila y, debajo, cómo va el histórico (si hay algo que decir): el estado del barrido, no un segundo botón.
    private var appleHealthRow: some View {
        let dicho = TextosDeDispositivos.salud(
            disponible: healthAvailable, conectado: healthConnected, pidiendo: healthRequesting,
            denegado: healthDenied, pistaDeRevocar: healthShowRevokeHint
        )
        return VStack(spacing: 0) {
            FilaInterruptorPerfil(
                glifo: .appleSalud, titulo: "Apple Health", detalle: dicho.texto, marca: dicho.marca?.color,
                enCurso: healthRequesting, deshabilitado: !healthAvailable,
                activo: healthToggle
            )
            if healthConnected {
                HealthHistoryImportPanel(athleteId: AuthState.persistedAthleteId())
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var healthToggle: Binding<Bool> {
        Binding(
            get: { healthConnected },
            set: { turnOn in
                Haptics.light()
                if turnOn {
                    Task { await connectAppleHealth() }
                } else {
                    showHealthDisconnectConfirm = true
                }
            }
        )
    }

    // MARK: - Polar

    private var polarRow: some View {
        Button {
            guard !polarConnected, !polarConnecting else { return }
            Haptics.light()
            Task { await connectPolar() }
        } label: {
            FilaDeDispositivo(
                glifo: .polar, titulo: "Polar", detalle: TextosDeDispositivos.polar(conectado: polarConnected),
                estado: polarConnected
                    ? EstadoDeProveedor(texto: "conectada", estilo: .velo, marca: Theme.Color.ok)
                    : EstadoDeProveedor(texto: "conectar", estilo: .acento),
                enCurso: polarConnecting, conChevron: !polarConnected
            )
        }
        .filaTocablePerfil()
        .disabled(polarConnected || polarConnecting || bearer == nil)
        .accessibilityHint(polarConnected ? "" : "Toca para conectar tu cuenta Polar")
    }

    // MARK: - COROS

    @ViewBuilder
    private var corosRow: some View {
        if corosConnected {
            NavigationLink {
                CorosConnectionDetailView(
                    bearer: bearer,
                    corosSyncing: $corosSyncing,
                    onSync: { await syncCoros(userInitiated: true) },
                    onDisconnectRequest: { showCorosDisconnectConfirm = true }
                )
            } label: {
                corosRowLabel
            }
            .filaTocablePerfil()
        } else {
            Button {
                guard !corosConnecting else { return }
                Haptics.light()
                Task { await connectCoros() }
            } label: {
                corosRowLabel
            }
            .filaTocablePerfil()
            .disabled(corosConnecting || corosSyncing || bearer == nil)
        }
    }

    private var corosRowLabel: some View {
        FilaDeDispositivo(
            glifo: .coros, titulo: "COROS",
            detalle: TextosDeDispositivos.coros(sincronizando: corosSyncing, conectado: corosConnected),
            estado: corosConnected
                ? EstadoDeProveedor(texto: "conectada", estilo: .velo, marca: Theme.Color.ok)
                : EstadoDeProveedor(texto: "conectar", estilo: .acento),
            enCurso: corosConnecting || corosSyncing
        )
        .accessibilityHint(corosConnected ? "Ver opciones de sincronización" : "Toca para conectar tu cuenta COROS")
    }
}

// MARK: - Una fila de proveedor

/// Cómo se dice el estado de un proveedor a la derecha de su fila: una pastilla (y un punto de color de estado si
/// significa algo) o, si hay algo en marcha, un indicador.
struct EstadoDeProveedor: Equatable {
    let texto: String
    let estilo: InfoPill.Estilo
    var marca: SwiftUI.Color?
}

/// Una fila de «Dispositivos y apps»: su ficha, su nombre, lo que hace y su estado. Es solo el dibujo: la envuelve un
/// `NavigationLink` o un `Button`.
struct FilaDeDispositivo: View {
    let glifo: GlifoDia
    let titulo: String
    let detalle: String
    var estado: EstadoDeProveedor?
    var enCurso = false
    var conChevron = true

    var body: some View {
        FilaPerfil(glifo: glifo, titulo: titulo, detalle: detalle) {
            HStack(spacing: Theme.Spacing.s) {
                if enCurso {
                    ProgressView()
                } else {
                    if let estado {
                        if let marca = estado.marca {
                            Circle().fill(marca).frame(width: 10, height: 10).accessibilityHidden(true)
                        }
                        InfoPill(text: estado.texto, estilo: estado.estilo)
                    }
                    if conChevron { ChevronDeFilaPerfil() }
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(titulo), \(detalle)\(estado.map { ", \($0.texto)" } ?? "")")
    }
}
