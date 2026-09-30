import SwiftUI

// EL CUERPO DE «CARRERAS» — lo que se pinta dentro del scroll, sin saber de dónde salen los datos.
//
// Recibe una `LecturaCarreras` ya resuelta y unas manos (`CallbacksCarreras`) y solo PINTA: la vista
// raíz (`CarrerasView`) lee el store, hace las peticiones y ejecuta las acciones; este cuerpo no
// conoce ni el `AppDataStore` ni una petición. Por eso se puede renderizar entero con datos de
// ejemplo (la galería de `#Preview` y las pruebas) y comparar contra el doble, estado a estado.
//
// LAS DECISIONES DE JERARQUÍA (las del doble), una línea cada una:
//  1. El sujeto es un póster con la única foto de la pestaña y el único bloque que pasa de 40 pt:
//     si todo pesara lo mismo, «lo que importa ahora» no se leería.
//  2. El acento sólido es para «haz esto ahora» (la cuenta atrás, fijar, importar); el color de
//     estado (por delante, te faltan) va en la marca, nunca en la cifra.
//  3. La acción es una pastilla de tinta invertida y sola, y es la SALIDA del hueco más importante
//     del póster: sin meta se fija, sin ser principal se hace, sin resultado se importa. Solo con
//     predicho es «Ver mi camino».
//  4. El predicho jamás inventa un tiempo: parcial dice qué tramos faltan, sin datos dice que se
//     llena solo, sin meta dice cómo fijarla.
//  5. «Próximas» y «Pasadas» son secciones, no pilas de tarjetas iguales.
//  6. Lo que un atleta no puede llenar (un puesto que nadie midió, una estación sin tiempo) se
//     calla; lo que SÍ puede llenar con un acto se declara con su salida.
//  7. Una carrera de equipo dice, en cada sitio donde aparece, que su tiempo es del equipo.
//  8. Las acciones raras (preguntar al coach, hacer principal, eliminar) cuelgan de un ⋯; «Eliminar»
//     y «No soy yo» siempre pasan por su confirmación.

/// Todo lo que el cuerpo puede pedir a quien lo monta. Cada uno tiene su nombre en el doble.
struct CallbacksCarreras {
    /// Abre lo que dice la acción del póster (el detalle, la hoja de la meta, promover, conectar pareja).
    var alAbrirObjetivo: (AccionObjetivoCarrera, ProximaCarrera) -> Void = { _, _ in }
    /// Abre el detalle de una próxima.
    var alAbrirProxima: (ProximaCarrera) -> Void = { _ in }
    /// Una acción rara de una carrera (pulsación larga).
    var alElegirAccion: (AccionCarrera, ProximaCarrera) -> Void = { _, _ in }
    /// El «⋯» de una carrera.
    var alMostrarAcciones: (ProximaCarrera) -> Void = { _ in }
    var alBuscar: () -> Void = {}
    var alImportar: () -> Void = {}
    var alQuitarImportacion: () -> Void = {}
    var alAbrirEstacion: (String) -> Void = { _ in }
    var alAbrirPredichoVsReal: () -> Void = {}
    /// Vuelve a pedir la pestaña entera tras un error de carga.
    var alReintentarTodo: () async -> Void = {}
    var alReintentarPredicho: () -> Void = {}
    var alReintentarAnalisis: () -> Void = {}
}

struct CarrerasContenido: View {
    let lectura: LecturaCarreras
    var callbacks = CallbacksCarreras()

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let sujeto = DecideCarreras.sujeto(lectura)
        let restantes = DecideCarreras.proximasRestantes(lectura, sujeto: sujeto)
        let verProximas = [.cargando, .objetivo, .postcarrera].contains(sujeto.tipo)
        let verPasadas = sujeto.tipo != .vacio && sujeto.tipo != .error
        let invitacion = sujeto.tipo == .postcarrera
            ? (titulo: "Fija tu próxima carrera", detalle: "Tendrás cuenta atrás, el predicho de tu tiempo y un plan que apunta a esa fecha.")
            : (titulo: "Buscar otra carrera", detalle: "Fijar una nueva la hace tu principal y pasa la actual a secundaria.")
        VStack(alignment: .leading, spacing: 22) {
            cabecera
            // La `id` por sujeto: al cambiar de sujeto, el bloque nuevo entra, no se reescribe.
            sujetoView(sujeto)
                .id(sujeto.tipo)
                .transition(.opacity)
            if verProximas {
                ProximasCarreras(
                    lectura: lectura,
                    items: restantes,
                    principalId: DecideCarreras.principalDe(lectura.proximas)?.raceId,
                    invitacion: invitacion,
                    alAbrir: callbacks.alAbrirProxima,
                    alElegir: callbacks.alElegirAccion,
                    alAcciones: callbacks.alMostrarAcciones,
                    alBuscar: callbacks.alBuscar
                )
            }
            if verPasadas {
                PasadasCarreras(
                    lectura: lectura,
                    sujeto: sujeto,
                    alImportar: callbacks.alImportar,
                    alQuitarImportacion: callbacks.alQuitarImportacion,
                    alAbrirEstacion: callbacks.alAbrirEstacion,
                    alAbrirPredichoVsReal: callbacks.alAbrirPredichoVsReal,
                    alReintentarAnalisis: callbacks.alReintentarAnalisis
                )
            }
        }
        .padding(EdgeInsets(top: 6, leading: Theme.Spacing.pantalla, bottom: 32, trailing: Theme.Spacing.pantalla))
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(reduceMotion ? nil : Theme.Motion.reveal, value: sujeto.tipo)
    }

    private var cabecera: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Rendimiento y carreras").papel(.etiqueta).foregroundStyle(Theme.Color.accentText)
            Text("Mis carreras")
                .papel(.saludo)
                .foregroundStyle(Theme.Color.foreground)
                .accessibilityAddTraits(.isHeader)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func sujetoView(_ sujeto: SujetoCarreras) -> some View {
        switch sujeto {
        case .cargando:
            PosterCargandoCarreras()
        case .error:
            SujetoErrorDia(
                kicker: "Tus carreras", titulo: "No pudimos cargar tus carreras",
                apoyo: "Revisa tu conexión e inténtalo de nuevo.", alReintentar: callbacks.alReintentarTodo)
        case .postcarrera(let carrera, let dias):
            PosterPostcarreraCarreras(carrera: carrera, dias: dias, hoy: lectura.hoy, alImportar: callbacks.alImportar)
        case .objetivo(let carrera, let principal):
            PosterObjetivoCarreras(
                carrera: carrera,
                principal: principal,
                hoy: lectura.hoy,
                prediccion: lectura.prediccion,
                alAbrir: { callbacks.alAbrirObjetivo($0, carrera) },
                alAcciones: { callbacks.alMostrarAcciones(carrera) },
                alReintentarPredicho: callbacks.alReintentarPredicho
            )
        case .ultima(let carrera):
            PosterUltimaCarreras(carrera: carrera, pasadas: lectura.pasadas, hoy: lectura.hoy, alBuscar: callbacks.alBuscar)
        case .vacio:
            PosterVacioCarreras(alBuscar: callbacks.alBuscar, alImportar: callbacks.alImportar)
        }
    }
}

/// El cromo de arriba: el logotipo en el centro y el chat a la derecha (solo con coach). Fijo: no
/// scrollea nunca. Sin coach no hay hilo al que llevar, así que no hay botón.
struct CromoCarreras: View {
    let conCoach: Bool
    let noLeidos: Int
    let alChat: () -> Void

    var body: some View {
        ZStack {
            Wordmark(size: 24)
            HStack {
                Spacer(minLength: 0)
                if conCoach {
                    BotonCromoDia(
                        .chat,
                        etiqueta: noLeidos > 0 ? "Chat con tu coach, \(noLeidos) sin leer" : "Chat con tu coach",
                        n: noLeidos,
                        accion: alChat
                    )
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.s)
        .frame(height: 56)
    }
}
