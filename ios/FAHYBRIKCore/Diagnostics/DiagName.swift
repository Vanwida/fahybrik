import Foundation

// LO QUE UN APARATO PUEDE CONTAR. La lista sale de las 14 pruebas en aparato de la
// auditoría (docs/auditoria-app-atleta/, T1–T14): cada prueba se tiene que poder leer
// en el registro — «startWatchApp ok → begin → mirroring → adopted», «remote
// disconnected», un `live_end` viejo que termina la grabación nueva, el permiso de
// HealthKit esperando en la muñeca…
//
// El nombre viaja en snake_case (el servidor exige `^[a-z][a-z0-9_]{1,63}$`). Añadir
// un caso aquí no requiere tocar el servidor: la lista abierta vive en la app.

enum DiagName: String, CaseIterable, Sendable {
    // MARK: link — el enlace muñeca↔móvil
    /// WCSession terminó de activarse (estado, emparejado, instalado, alcance).
    case wcActivated = "wc_activated"
    /// WCSession cambió de alcance (`sessionReachabilityDidChange`).
    case wcReachability = "wc_reachability"
    /// Cambió emparejado / app instalada en el reloj (`sessionWatchStateDidChange`).
    case wcWatchState = "wc_watch_state"
    /// Móvil: el resultado del ÚNICO `startWatchApp` de una intención (T1, T5).
    case startWatchApp = "start_watch_app"
    /// Reloj: arrancado por el móvil vía `handle(_ workoutConfiguration:)`.
    case launchedByPhone = "launched_by_phone"
    /// Reloj: `startMirroringToCompanionDevice` (T1, T7).
    case mirroringStarted = "mirroring_started"
    /// Móvil: HealthKit le entrega la sesión espejo (`workoutSessionMirroringStartHandler`).
    case mirrorAdopted = "mirror_adopted"
    /// Móvil: `recoverActiveWorkoutSession` (iOS 26) al volver.
    case mirrorRecovered = "mirror_recovered"
    /// Cualquiera de los dos: `didDisconnectFromRemoteDeviceWithError` (T6, T7).
    case remoteDisconnected = "remote_disconnected"
    /// `sendToRemoteWorkoutSession` falló (se cuenta el primero de cada racha).
    case remoteSendFailed = "remote_send_failed"
    /// El aviso de fin cruzando (móvil→reloj `live_end`, reloj→móvil `live_ended`).
    case liveEndSent = "live_end_sent"
    case liveEndReceived = "live_end_received"

    // MARK: session — la sesión de entreno en cada lado
    /// Móvil: empieza a entrenar (Empezar).
    case liveBegin = "live_begin"
    /// Móvil: el atleta termina (guardar o no).
    case liveEnd = "live_end"
    /// Reloj: qué decidió ante una petición de empezar (empezar, re-espejar, encolar,
    /// terminar-y-encolar, rechazar) y en qué estado estaba (T3, T8, T9).
    case startRequest = "start_request"
    /// Reloj: la grabación primaria empieza (`begin`), con su papel.
    case primaryBegin = "primary_begin"
    /// Reloj: la grabación primaria acaba (guardada / descartada).
    case primaryEnd = "primary_end"
    /// Estado de la `HKWorkoutSession` de este lado (`didChangeTo`).
    case hkState = "hk_state"
    /// `HKWorkoutSession didFailWithError`.
    case hkFailed = "hk_failed"
    /// Reloj: el permiso de HealthKit (T10: la hoja que nadie ve en la muñeca).
    case hkAuthorization = "hk_authorization"
    /// Móvil: qué hizo al adoptar una sesión espejo (coach / reabrir / terminar guardando).
    case adoptAction = "adopt_action"
    /// Móvil: la sesión espejo terminó (`.ended` de Apple).
    case mirrorEnded = "mirror_ended"
    /// Reloj: una sesión en solitario cede el sitio al espejo del móvil (T9).
    case soloYieldedToMirror = "solo_yielded_to_mirror"

    // MARK: save — guardar y subir
    /// Móvil: el entreno terminado contra el servidor (guardado, encolado o rechazado).
    case executionSaved = "execution_saved"
    /// Reloj: `HKLiveWorkoutBuilder.finishWorkout`.
    case hkWorkoutSaved = "hk_workout_saved"
    /// Reloj: el entreno terminado se entrega al móvil (`transferUserInfo`).
    case executionHandedToPhone = "execution_handed_to_phone"
    /// Reloj: el sistema no pudo entregar una transferencia (`didFinish … error`).
    case transferFailed = "transfer_failed"
    /// Móvil: llegó un entreno terminado desde la muñeca (decodificado o no).
    case watchExecutionReceived = "watch_execution_received"
    /// El acuse de un sobre de la muñeca: el móvil lo manda (held / saved /
    /// rejected) y el reloj lo aplica a su buzón (`WatchSaveLedger`).
    case executionReceipt = "execution_receipt"
    /// Móvil: al aparecer el resumen, el entreno terminado queda en disco (B-02).
    case draftStaged = "draft_staged"
    /// Móvil: al arrancar, un entreno terminado que no llegó a GUARDAR pasa a la cola.
    case draftRecovered = "draft_recovered"
    /// Móvil: la cola offline guardó / entregó / no pudo entregar una petición.
    case queueEnqueued = "queue_enqueued"
    case queueDelivered = "queue_delivered"
    case queueFailed = "queue_failed"

    // MARK: lifecycle
    case appLaunch = "app_launch"
    case appForeground = "app_foreground"
    case appBackground = "app_background"
    /// La sesión anterior murió con un entreno en marcha (la marca no se borró).
    case uncleanExit = "unclean_exit"
    /// La sesión del atleta se renovó (`/api/auth/refresh`) o falló al renovarse.
    case sessionRenewed = "session_renewed"

    // MARK: diagnostic — lo que Apple entrega por MetricKit (solo iPhone)
    case crash
    case hang
    case cpuException = "cpu_exception"
    case diskWriteException = "disk_write_exception"
}
