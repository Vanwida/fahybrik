import Foundation

// EL CIERRE SEGURO — un entreno nunca termina por un toque accidental (IMG_2385).
//
// Cerrar un paso a mano es un doble toque (P4). En un paso cualquiera es barato: el siguiente
// empieza y se puede seguir. En el ÚLTIMO paso, cerrarlo cierra y GUARDA la sesión, y eso no
// se deshace: pide «¿Terminar y guardar?», el mismo diálogo de Terminar. Aquí vive la decisión,
// pura, para que el solitario y el espejo la compartan.
//
// Falla hacia PREGUNTAR: si no se puede saber con certeza que el paso no es el último (no hay
// plan, el cursor está fuera del plan, el móvil no lo dice), se pregunta. Una pregunta de más
// cuesta un toque; un guardado de menos, el entreno.

extension Vivo {

    enum CierreSeguro {

        /// ¿El paso `indice` de `total` es el último? `nil` = no se sabe. `marcaDelMovil` es lo que
        /// dice el móvil llevando el motor (`isFinalStep`): si dice que sí, es el último aunque el
        /// cursor no lo diga (gana la marca más cauta).
        static func esUltimoPaso(indice: Int, de total: Int, marcaDelMovil: Bool? = nil) -> Bool? {
            guard total > 0, indice >= 0, indice < total else { return nil }
            return indice == total - 1 || marcaDelMovil == true
        }

        /// ¿Cerrar a mano pide confirmación? «Vuelta» no cierra nada (parte el rodaje sin acabarlo);
        /// lo demás cierra el paso, y en el último —o sin saber si lo es— se pregunta.
        static func pideConfirmar(esVuelta: Bool, ultimoPaso: Bool?) -> Bool {
            !esVuelta && (ultimoPaso ?? true)
        }

        /// «Descartar» (perder lo grabado) solo se ofrece con el enlace con el iPhone roto: con el móvil
        /// llevando el entreno, descartar es cosa suya. Lo dice Apple, no un temporizador (FH-56).
        static func ofreceDescartar(role: WatchPrimaryLifecycle.Role?, link: WatchPrimaryLifecycle.Link) -> Bool {
            WatchPrimaryLifecycle.phoneUnlinked(role: role, link: link)
        }
    }
}
