import Foundation

// EL MENÚ DE UNA SESIÓN — qué puede hacerle el atleta y en qué orden, sin tocar SwiftUI.
//
// Ninguna de estas acciones es nueva: son las de cada fila de la vieja lista de días —mover, ver la
// técnica, corregir el estado, borrar un libre— con el mismo contrato de servidor, la misma
// actualización optimista y los mismos mensajes. Lo que el diseño añade es DÓNDE se tocan: el «···»
// de la acción anclada y el de cada fila secundaria, además de la pulsación larga sobre un día del
// carril (que no se descubre ni se alcanza con teclado).
//
// La lista es CONTEXTUAL a su estado:
//   pendiente / sin hacer → Marcar como hecha · Completar ahora
//   a medias              → Completar ahora · Deshacer hecho
//   hecha                 → Deshacer hecho
// Un LIBRE es del atleta: se edita mientras no esté hecho y se borra del todo, en cualquier estado.
// Las del coach no se borran: se deshacen. Sin coach no hay a quién preguntar, así que esa fila
// tampoco existe. Espejo de `accionesDeSesion` en `kit-plan/modelo.ts`.

enum ClaveAccion: String, Equatable {
    case tecnica, preguntar, mover, marcarHecha, completar, deshacer, editarLibre, borrarLibre
}

struct AccionDeSesion: Identifiable, Equatable {
    let clave: ClaveAccion
    let etiqueta: String
    /// El SF Symbol de la fila del menú.
    let simbolo: String
    /// Lo que borra o pisa algo: en rojo y con `role: .destructive`.
    var destructiva = false

    var id: ClaveAccion { clave }
}

extension AthleteWeekDaySession {

    func acciones(conCoach: Bool) -> [AccionDeSesion] {
        var a = [AccionDeSesion(clave: .tecnica, etiqueta: "Ver ejercicios y técnica", simbolo: "list.bullet.rectangle")]
        if conCoach { a.append(AccionDeSesion(clave: .preguntar, etiqueta: "Preguntar al coach", simbolo: "message")) }
        if puedeMoverse { a.append(AccionDeSesion(clave: .mover, etiqueta: "Mover a otro día", simbolo: "calendar")) }
        let marcar = AccionDeSesion(clave: .marcarHecha, etiqueta: "Marcar como hecha", simbolo: "checkmark")
        let completar = AccionDeSesion(clave: .completar, etiqueta: "Completar ahora", simbolo: "square.and.pencil")
        let deshacer = AccionDeSesion(clave: .deshacer, etiqueta: "Deshacer hecho", simbolo: "arrow.uturn.backward", destructiva: true)
        switch estado {
        case .pendiente, .saltada: a += [marcar, completar]
        case .parcial:             a += [completar, deshacer]
        case .hecha:               a += [deshacer]
        }
        if isSelfOrigin {
            if estado == .pendiente || estado == .saltada {
                a.append(AccionDeSesion(clave: .editarLibre, etiqueta: "Editar entreno libre", simbolo: "pencil"))
            }
            a.append(AccionDeSesion(clave: .borrarLibre, etiqueta: "Borrar entreno libre", simbolo: "trash", destructiva: true))
        }
        return a
    }
}
