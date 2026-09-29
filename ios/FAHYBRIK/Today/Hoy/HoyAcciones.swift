import SwiftUI

// LO QUE LA PORTADA PUEDE HACER — y nada más.
//
// Las piezas de Hoy PINTAN una `LecturaHoy` y avisan de qué ha tocado el atleta; adónde lleva
// cada toque (una pestaña, una hoja, el motor del entreno) lo decide quien monta la pantalla
// (`InicioView`), que es el único que tiene el `AppDataStore`, el chat y las presentaciones.
// Así cada pieza se ve en una `#Preview` y en la galería de capturas con `HoyAcciones.ninguna`,
// sin cablear nada.
//
// Una regla de producto atraviesa todo esto (DECISIONS 6-ago): el PLAN es la única puerta que
// empieza un entreno. Ninguna acción de aquí lanza el motor de la sesión del coach: `abrirPlan`
// lleva a la pestaña, y lo único que arranca algo es lo que ya vivía en Inicio y no es «empezar
// la sesión del coach» — retomar lo guardado y montar uno libre.

/// Cómo se cerró el check-in desde la propia portada.
enum CierreDelCheckin: Equatable {
    case hecho
    case saltado
}

struct HoyAcciones {
    /// Cambia de pestaña (Plan, Analíticas, Perfil…).
    var abrirPestana: (AppTab) -> Void = { _ in }
    /// Lleva al Plan: lo que dice cada sujeto del día (sesión, hecho, descanso, unirse en vivo).
    var abrirPlan: () -> Void = {}
    var abrirChat: () -> Void = {}
    var abrirComunicados: () -> Void = {}

    /// Vuelve a un entreno guardado para luego.
    var retomarEntreno: () -> Void = {}
    /// El constructor de entreno libre.
    var crearEntrenoLibre: () -> Void = {}
    /// El hub de tests (batería, marcas, zonas).
    var abrirTests: () -> Void = {}
    /// La biblioteca de marcas («Probarme»).
    var abrirMarcas: () -> Void = {}
    var abrirDisposicion: () -> Void = {}
    var buscarCarrera: () -> Void = {}
    var elegirHuecoDeLaRevision: () -> Void = {}
    /// Abre la videollamada de la revisión reservada.
    var unirseALaRevision: (URL) -> Void = { _ in }

    /// Hacer el check-in cuando NO es el sujeto (la hoja larga: plan en pausa, sin coach, error…).
    var hacerCheckin: () -> Void = {}
    /// El check-in se cerró dentro del propio sujeto.
    var checkinCerrado: (CierreDelCheckin) -> Void = { _ in }
    /// Añadir una nota al check-in en curso (la hoja de la nota).
    var anadirNotaAlCheckin: () -> Void = {}
    /// El servidor ya tiene el check-in: la cifra de disposición se puede releer.
    var checkinSincronizado: () async -> Void = {}
    var bearer: String?

    /// Vuelve a pedir el plan tras un fallo de carga.
    var reintentarCarga: () async -> Void = {}

    /// Sin cablear: para las previews y las capturas.
    static let ninguna = HoyAcciones()
}
