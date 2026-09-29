import Foundation

// LAS FRASES DE «PLAN» — el copy de los estados y de los diálogos, en un solo sitio y probado
// (`PlanLecturaTests`): español natural de gimnasio, tuteo, cero guiones largos, y ninguna frase que
// afirme lo que el coach hará o por qué pausó nada (DECISIONS 7-ago: «ninguno de los tres afirma qué
// hará el coach ni cuándo»).
//
// Lo que sale de un dato (el nombre del coach, una fecha) entra por parámetro: el nombre del coach es
// un DATO (HARD RULE Nº0), jamás una constante. Espejo de `web/components/design-twin/kit-plan/textos.ts`.

enum PlanTextos {

    private static func tuCoach(_ coach: String?) -> String { coach ?? "Tu coach" }

    enum Pausa {
        static let kicker = "Plan en pausa"
        static let titulo = "Tu plan está en pausa"
        static func apoyo(coach: String?) -> String {
            "\(tuCoach(coach)) ha pausado tu plan. Tu progreso está guardado y no pierdes nada."
        }
        /// El código del motivo (`paused_reason`) NO sale al atleta: solo desde cuándo, si se sabe.
        static func nota(desde: String?) -> String {
            desde.flatMap(FechaES.larga).map { "En pausa desde el \($0)." } ?? "Retomamos en cuanto estés listo."
        }
    }

    enum ErrorDeCarga {
        static let kicker = "Tu plan"
        static let titulo = "No pudimos cargar tu plan"
        static let apoyo = "Revisa tu conexión e inténtalo de nuevo."
    }

    enum EmpiezaDespues {
        static let kicker = "Tu plan"
        static func titulo(inicio: String) -> String {
            "Tu plan empieza el \(FechaES.conDia(inicio) ?? "próximo lunes")"
        }
        static let apoyo = "Esta semana no tienes sesiones. Ya está todo montado y te espera."
        /// Sin semana que ver, la frase dice por qué no hay salida.
        static let nota = "Aparecerá aquí el mismo día."
    }

    enum Preparando {
        static let kicker = "Tu plan"
        static let titulo = "Tu plan se está preparando"
        static func apoyo(coach: String?) -> String {
            "En cuanto \(coach ?? "tu coach") lo asigne lo verás aquí, día a día."
        }
    }

    enum SemanaFalla {
        static let kicker = "Esa semana"
        static let titulo = "No pudimos cargar esa semana"
        static let apoyo = "Revisa tu conexión e inténtalo de nuevo. Lo de esta semana sigue donde estaba."
    }

    enum SemanaVacia {
        static let kicker = "Esa semana"
        static let titulo = "Esa semana aún no tiene sesiones"
        static let apoyo = "En cuanto haya algo lo verás aquí."
    }

    enum Descanso {
        static let kicker = "Descanso"
        static func titulo(esHoy: Bool) -> String { esHoy ? "Hoy descansas" : "Descanso" }
        static func apoyo(esHoy: Bool) -> String {
            esHoy ? "No hay nada en el plan para hoy." : "Nada en el plan para este día."
        }
        static let semanaCerrada = "La semana ya está cerrada."
    }

    enum Muro {
        static let titulo = "Límite de visibilidad"
        static let porDefecto = "Tu entrenador ha limitado hasta dónde puedes ver el plan."
        static let cerrar = "Entendido"
    }

    enum Deshacer {
        static let titulo = "¿Deshacer este entreno?"
        static let mensaje = "Se borrará lo que registraste y el entreno volverá a pendiente. Esto no se puede deshacer."
        static let confirmar = "Deshacer y borrar lo registrado"
    }

    enum Borrar {
        static let titulo = "¿Borrar este entreno libre?"
        static let mensaje = "Lo creaste tú: se borra el entreno y lo registrado. No volverá a aparecer."
        static let confirmar = "Borrar del todo"
    }

    enum Fallo {
        static let marcar = "No se pudo marcar como hecha. Inténtalo de nuevo."
        static let mover = "No se pudo mover la sesión. Inténtalo de nuevo."
        static let deshacer = "No se pudo deshacer la sesión. Inténtalo de nuevo."
        static let borrar = "No se pudo borrar el entreno. Inténtalo de nuevo."

        /// Traduce un fallo de mover a lo que el atleta necesita saber. 409 = la sesión está congelada; 422 = fuera
        /// de esta semana; 404 = ya no existe. Lo usan el Plan con coach y el del atleta libre: una sola frase por caso.
        static func deMover(_ error: Error) -> String {
            guard case let APIError.http(status, data) = error else {
                return "No se pudo mover la sesión. Revisa tu conexión."
            }
            let code = (try? JSONDecoder().decode(APIErrorBody.self, from: data))?.error.code
            switch status {
            case 409: return "Esta sesión ya está completada y no se puede mover."
            case 422:
                return code == "out_of_range"
                    ? "Solo puedes mover la sesión dentro de esta semana."
                    : "No se pudo mover la sesión. Revisa el día e inténtalo de nuevo."
            case 404: return "No encontramos esta sesión. Desliza para recargar tu plan."
            case 401: return "Tu sesión ha caducado. Vuelve a entrar para mover la sesión."
            default:  return mover
            }
        }
    }
}
