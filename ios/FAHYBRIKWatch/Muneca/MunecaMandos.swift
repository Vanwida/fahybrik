import Foundation

// LO QUE LA MUÑECA PUEDE HACER — las acciones que la pila recibe de fuera.
//
// La pila y sus páginas no conocen la sesión: reciben un `CuadroMuneca` para
// pintar y estos mandos para actuar. Quien alimenta la muñeca (`MunecaSolo`, con
// el motor local; luego el espejo, con las órdenes al iPhone) decide QUÉ hace cada
// uno; la vista solo los dispara. Un mando que es `nil` no existe en ese modo y no
// se enseña: jamás un botón que no hace nada.

/// El control contextual de la página Controles: «Vuelta» en un rodaje, «Siguiente
/// paso» en una sesión con pasos. El título es del vocabulario de `Vivo.ClavePrimaria`.
struct MunecaControl {
    enum Icono { case vuelta, siguiente, marcar }

    var titulo: String
    var icono: Icono
    var accion: () -> Void
}

/// Lo que se puede hacer sobre la anotación del descanso de fuerza. `nil` = este descanso no anota nada (o quien
/// lleva el motor no atiende lo declarado): la cara no lo enseña.
struct MunecaAnotar {
    /// Tocar una serie de la lista (índice en las series del descanso).
    var abrir: (Int) -> Void
    /// Tocar un dato de la serie abierta: lo enciende (o lo apaga).
    var enfocar: (Vivo.CampoAnotar) -> Void
    /// La corona con un dato encendido: +1 sube el dato, −1 lo baja.
    var girar: (Int) -> Void
}

struct MunecaMandos {
    /// Pausa / Reanudar.
    var pausa: () -> Void
    /// «¿Terminar y guardar?» ya confirmado.
    var terminar: () -> Void
    /// ¿Cerrar el paso a mano pide «¿Terminar y guardar?»? Sí en el último paso (cerrarlo guarda la
    /// sesión) y sin certeza de que no lo sea. El defecto pregunta: quien lo sabe, lo dice (`Vivo.CierreSeguro`).
    var pideConfirmarAlCerrar: Bool = true
    /// Perder lo grabado. Solo existe con el enlace con el iPhone roto; `nil` = no se ofrece.
    var descartar: (() -> Void)? = nil
    /// El atleta ha hecho algo (pausa, cerrar paso, vuelta): el director toca su `.click`.
    var alActuar: () -> Void = {}
    var control: MunecaControl? = nil
    /// La acción del momento: doble toque (S9 / Ultra 2 y dos toques en la pantalla en
    /// cualquier reloj) y, en un Ultra, botón Acción. `nil` = ahora no hay nada que cerrar.
    var primaria: (() -> Void)? = nil
    /// «+30 s» del descanso; `nil` = este motor no puede estirar ese descanso.
    var mas30: (() -> Void)? = nil
    /// Reabrir el último tramo cerrado a mano (5 s, `Vivo.deshacerMs`); `nil` = este motor no lo atiende y no se
    /// ofrece. Cuándo se puede lo dice el estado (`CuadroMuneca.deshacerS`), no la muñeca.
    var deshacer: (() -> Void)? = nil
    /// El botón «Empezar ya» del descanso.
    var empezarYa: () -> Void = {}
    /// Anotar en el descanso (fuerza).
    var anotar: MunecaAnotar? = nil
    /// La corona en la campana de un AMRAP: +1 sube las reps de la puntuación, −1 las baja. `nil` = no hay campana.
    var puntuar: ((Int) -> Void)? = nil
}
