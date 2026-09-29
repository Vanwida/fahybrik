import SwiftUI

// EL CUERPO DE «PERFIL» — lo que se pinta dentro del scroll, sin saber de dónde salen los datos.
//
// Recibe una `LecturaPerfil` ya resuelta y unas manos (`CallbacksPerfil`) y solo PINTA: la vista raíz
// (`ProfileView`) lee el store, hace las peticiones y ejecuta las acciones; este cuerpo no conoce ni
// el `AppDataStore` ni una petición. Por eso se puede renderizar entero con datos de ejemplo (las
// `#Preview` y las pruebas) y comparar contra el doble, estado a estado.
//
// TESIS: Perfil no es un panel de ajustes, es EL ATLETA. Al abrirlo se viene a una de dos cosas, y el
// orden sale de ahí: a ver quién eres en cifras (tu nombre, tu foto, tus métricas y tus cinco
// números) o a arreglar algo (una pregunta pendiente, un reloj, la suscripción). Los ajustes se
// quedan al fondo.
//
// LAS DECISIONES DE JERARQUÍA (las del doble), una línea cada una:
//  1. El sujeto es el atleta: el único bloque que pasa de 40 pt, con el tinte de la marca, su foto con
//     la chapita de cámara y su nombre en el display.
//  2. Un perfil recién creado no parece roto: el sujeto se vuelve la invitación honesta a completarlo,
//     con UNA acción (completar, o poner el nombre); la foto nunca se obliga, se ofrece con la
//     chapita del avatar.
//  3. El acento sólido es para «haz esto ahora» y Perfil no tiene ningún momento así: la marca va en
//     el tinte y en la regleta del test que falta.
//  4. «Pendiente» solo existe si hay algo que hacer, y solo entran actos: esperar no es un acto. La
//     pregunta de COROS se contesta dentro de su fila.
//  5. Rendimiento son teselas con la cifra a 32 pt: un contador se pinta en cero, un valor medido no
//     existe hasta que se mide (entonces, su invitación).
//  6. Las puertas dicen qué saben del atleta antes que qué hay dentro; se pliegan las que no tienen
//     nada que decir, y una que dice algo NUNCA se pliega.
//  7. Cerrar sesión pesa lo mínimo: solo texto, con el peligro en el texto.
//
// ALTURA (§6.1, estrategia `llena`): en un `FillingScreen` el cuerpo scrollea cuando desborda y,
// cuando NO llega al alto, el sobrante entra en el propio sujeto (entre su título y su acción), jamás
// en una cola muerta.

/// Adónde se puede ir desde la pestaña (dentro de su propia `NavigationStack`: `AppShell` aloja cada
/// pestaña en plano y no hay una pila compartida).
enum DestinoPerfil: Hashable {
    /// Una de las seis puertas.
    case puerta(ClavePuerta)
    /// La pantalla de una de las cinco cifras de Rendimiento.
    case cifra(FilaRendimiento.Clave)
    /// La suscripción (desde «Pendiente»).
    case suscripcion
}

/// Todo lo que el cuerpo puede pedir a quien lo monta. Cada uno tiene su nombre en el doble.
struct CallbacksPerfil {
    var alEditar: () -> Void = {}
    var alFoto: () -> Void = {}
    /// Vuelve a pedir el perfil entero tras un error de carga.
    var alReintentarPerfil: () async -> Void = {}
    var alAbrir: (DestinoPerfil) -> Void = { _ in }
    /// Vuelve a pedir SOLO una cifra que no contestó.
    var alReintentarCifra: (FilaRendimiento.Clave) -> Void = { _ in }
    /// Vuelve a pedirlas todas.
    var alReintentarCifras: () -> Void = {}
    var alResponderCoros: (RespuestaCoros) -> Void = { _ in }
    var alInvitarPareja: () -> Void = {}
    var alCerrarSesion: () -> Void = {}
    var alDiagnostico: () -> Void = {}
}

struct PerfilContenido: View {
    let lectura: LecturaPerfil
    /// Hay una respuesta de COROS en camino al servidor.
    var respondiendoCoros = false
    var callbacks = CallbacksPerfil()

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let modo = DecidePerfil.modoIdentidad(lectura)
        VStack(alignment: .leading, spacing: 22) {
            // La `id` por momento: al cambiar de momento, el bloque nuevo entra, no se reescribe.
            SujetoDePerfil(
                lectura: lectura,
                alEditar: callbacks.alEditar,
                alFoto: callbacks.alFoto,
                alReintentar: callbacks.alReintentarPerfil
            )
            .id(modo)
            .transition(.opacity)

            PendientePerfilSeccion(
                items: DecidePerfil.pendientes(lectura),
                respondiendoCoros: respondiendoCoros,
                alResponderCoros: callbacks.alResponderCoros,
                alAbrirSuscripcion: { callbacks.alAbrir(.suscripcion) },
                alInvitarPareja: callbacks.alInvitarPareja
            )

            RendimientoPerfilSeccion(
                lectura: lectura,
                alAbrir: { callbacks.alAbrir(.cifra($0)) },
                alReintentarFuente: callbacks.alReintentarCifra,
                alReintentarTodo: callbacks.alReintentarCifras
            )

            AjustesPerfilSeccion(
                puertas: DecidePerfil.puertas(lectura),
                alAbrir: { callbacks.alAbrir(.puerta($0)) }
            )

            PiePerfil(
                version: lectura.version,
                alCerrarSesion: callbacks.alCerrarSesion,
                alDiagnostico: callbacks.alDiagnostico
            )
        }
        .padding(EdgeInsets(top: 12, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(reduceMotion ? nil : Theme.Motion.reveal, value: modo)
    }
}
