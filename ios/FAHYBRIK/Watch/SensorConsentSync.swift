import Foundation
import UIKit

// EL PERMISO DEL MOVIMIENTO DEL RELOJ, HACIA FUERA: cuándo se pregunta y cómo llega
// al servidor lo que el atleta decidió (DECISIONS 2026-09-25).
//
// Lo que decide el atleta está en `SensorCaptureConsent` (SensorFileReceiver.swift);
// aquí, las dos cosas que salen de él:
//   · `SensorConsentPrompt` — si toca enseñar la hoja, y qué pasa con cada respuesta.
//   · `SensorConsentSync`   — el PUT del sí y el DELETE de la retirada, reintentados
//     hasta que el servidor los confirma.

/// Cuándo sale la hoja y qué hace cada respuesta.
@MainActor
enum SensorConsentPrompt {
    enum Respuesta: Equatable {
        case subirlo
        case ahoraNo
    }

    /// Tras GUARDAR (2xx) un entreno en el móvil: ¿sale la hoja antes de cerrar el
    /// resumen?
    ///
    /// Solo si hay un archivo de la muñeca esperando y el atleta aún no ha
    /// contestado. NO basta con que la muñeca acompañara el entreno: cuando lo lleva
    /// el móvil, el reloj espeja y no graba el movimiento (solo graba en los entrenos
    /// que lleva él solo), y la hoja diría «el reloj ha grabado» sin que hubiera nada.
    static func shouldAskAfterSave() -> Bool {
        shouldAsk(hasWristCapture: SensorFileReceiver.shared.hasPendingCaptures, state: SensorCaptureConsent.state)
    }

    /// La regla, pura.
    nonisolated static func shouldAsk(
        hasWristCapture: Bool,
        state: SensorConsentState,
        currentVersion: String = SensorCaptureConsent.currentVersion
    ) -> Bool {
        hasWristCapture && state.needsAnswer(current: currentVersion)
    }

    /// Al abrir la app: el primer entreno grabado SOLO en el reloj no tuvo resumen en
    /// el móvil donde preguntar. Su archivo espera aquí, así que la hoja sale la
    /// próxima vez que se abre la app, una vez (Alex, 25-09).
    ///
    /// Nunca encima de otra cosa. Se pregunta con la app en sus pestañas y nada
    /// delante: ni un entreno en vivo (tampoco minimizado, ni con la muñeca grabando),
    /// ni el resumen, ni el chat, ni otra hoja. Lo decide UIKit — si la raíz ya está
    /// presentando algo, no se pregunta — porque los entrenos se abren desde
    /// muchas pantallas (Inicio, Plan, Marcas, Tests…) y ninguna señal propia los
    /// cubre todos. Si no toca ahora, se vuelve a mirar al próximo primer plano.
    static func shouldAskOnOpen() -> Bool {
        guard shouldAskOnOpen(
            hasPendingWatchCapture: SensorFileReceiver.shared.hasPendingCaptures,
            state: SensorCaptureConsent.state
        ) else { return false }
        guard !LiveWorkoutResume.shared.hasLiveSession,
              PhoneLiveSession.shared.phase == .idle,
              !PhoneLiveSession.shared.hasMirroredHKSession
        else { return false }
        return shellIsUncovered
    }

    /// La regla, pura: la misma que tras GUARDAR.
    nonisolated static func shouldAskOnOpen(
        hasPendingWatchCapture: Bool,
        state: SensorConsentState,
        currentVersion: String = SensorCaptureConsent.currentVersion
    ) -> Bool {
        shouldAsk(hasWristCapture: hasPendingWatchCapture, state: state, currentVersion: currentVersion)
    }

    /// La respuesta de la hoja. Las dos cuentan como contestada: «Ahora no» no vuelve
    /// a preguntar, y se cambia en Perfil › Privacidad. «Ahora no» no toca nada más:
    /// el entreno ya está guardado y el conteo en vivo sigue igual.
    static func answer(_ respuesta: Respuesta, bearer: String?) {
        SensorCaptureConsent.store.update { state in
            state.markAsked()
            if respuesta == .subirlo {
                state.grant(version: SensorCaptureConsent.currentVersion)
            }
        }
        guard respuesta == .subirlo else {
            // «Ahora no»: lo que espera en el móvil no va a salir nunca, así que no se
            // queda ocupando sitio (lo mismo que apagar el interruptor).
            SensorFileReceiver.shared.discardPending()
            return
        }
        Task {
            await SensorConsentSync.shared.push(bearer: bearer)
            // El archivo por el que se preguntó sube en cuanto el servidor tiene el sí.
            await SensorUploader.shared.run(bearer: bearer)
        }
    }

    /// El interruptor de Perfil › Privacidad. Sin «¿seguro?»: retirar cuesta un toque,
    /// igual que dar. Tocarlo también es contestar, así que la hoja ya no sale.
    ///
    /// Apagar retira el permiso Y borra lo subido (en el servidor, por el DELETE) y lo
    /// que espera en el móvil (aquí, ya).
    static func setUpload(_ on: Bool, bearer: String?) {
        SensorCaptureConsent.store.update { state in
            state.markAsked()
            if on {
                state.grant(version: SensorCaptureConsent.currentVersion)
            } else {
                state.withdraw()
            }
        }
        if !on { SensorFileReceiver.shared.discardPending() }
        Task {
            await SensorConsentSync.shared.push(bearer: bearer)
            if on { await SensorUploader.shared.run(bearer: bearer) }
        }
    }

    /// Nada presentado sobre las pestañas. Se recorre el árbol entero y no solo la
    /// raíz: según desde dónde se abra, quien presenta puede ser un hijo (la barra de
    /// pestañas, el contenedor de una pestaña).
    private static var shellIsUncovered: Bool {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }),
              let root = scene.keyWindow?.rootViewController
        else { return false }
        return !isPresenting(root)
    }

    private static func isPresenting(_ controller: UIViewController) -> Bool {
        if controller.presentedViewController != nil { return true }
        return controller.children.contains { isPresenting($0) }
    }
}

/// Lleva al servidor lo que el atleta decidió y el servidor aún no sabe.
///
/// Se llama al decidir, al abrir la app y al volver a primer plano (AppShell, junto
/// a la cola). Cualquier fallo — sin cobertura, 5xx, 401, un 409 de versión — deja
/// la bandera puesta y se reintenta en la próxima ocasión: la retirada es una
/// promesa al atleta (borrar lo subido) y el sí es lo que el servidor exige antes
/// de aceptar un archivo. Nada de esto va a `RequestQueue`, que solo sabe de POST.
@MainActor
final class SensorConsentSync {
    static let shared = SensorConsentSync()

    static let path = "/api/athlete/sensor-consent"

    /// Tope de llamadas por pasada. Una pasada normal hace una o dos (retirada y luego
    /// sí); el tope solo impide un bucle si el servidor contestara algo imposible.
    private static let maxCallsPerPass = 6

    private var running = false
    private var again = false

    private init() {}

    /// Una sola pasada a la vez. Si el atleta cambia de idea mientras una llamada va
    /// por el aire, la pasada en curso vuelve a mirar al terminar, en vez de dejar
    /// el cambio esperando al próximo arranque.
    func push(bearer: String?) async {
        guard let bearer = bearer ?? KeychainTokenStore.shared.read(), !bearer.isEmpty else { return }
        if running {
            again = true
            return
        }
        running = true
        defer { running = false }
        // El atleta de esta pasada: si cambia la sesión a mitad, lo suyo no se toca
        // con el bearer de otro.
        let store = SensorConsentStore(athleteId: AuthState.persistedAthleteId())
        repeat {
            again = false
            await pass(store: store, bearer: bearer)
        } while again
    }

    private func pass(store: SensorConsentStore, bearer: String) async {
        for _ in 0..<Self.maxCallsPerPass {
            let state = store.load()
            guard let call = state.nextCall(current: SensorCaptureConsent.currentVersion) else { return }
            // Antes de borrar lo subido, que acabe la subida en curso: si no, un archivo
            // podría aterrizar en el almacén justo DESPUÉS del borrado y quedarse allí.
            if call == .withdraw { await SensorUploader.shared.settle() }
            guard await Self.send(call, bearer: bearer) else { return }
            store.update { $0.confirm(call, revision: state.revision) }
        }
    }

    /// 2xx = hecho. El cuerpo no se lee: `{ granted, version }` y
    /// `{ withdrawn, deleted_captures }` no cambian lo que la app hace después, y
    /// exigir su forma exacta solo añadiría una manera más de reintentar para siempre.
    private static func send(_ call: SensorConsentState.Call, bearer: String) async -> Bool {
        do {
            switch call {
            case .grant(let version):
                let _: Empty = try await APIClient.shared.put(
                    path: path,
                    body: SensorConsentGrantBody(version: version),
                    bearer: bearer
                )
            case .withdraw:
                let _: Empty = try await APIClient.shared.delete(
                    path: path,
                    body: Optional<Empty>.none,
                    bearer: bearer
                )
            }
            return true
        } catch {
            return false
        }
    }
}

/// `PUT /api/athlete/sensor-consent` — la versión exacta del texto aceptado.
struct SensorConsentGrantBody: Encodable {
    let version: String
}
