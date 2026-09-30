import Foundation

// LISTO PARA SALIR — lo que el brief necesita saber de una sesión de correr antes de empezar (P9, P13).
//
//   entorno   dónde dice el plan que se corre (M3: calle, cinta o pista, dato del coach por tramo).
//   preguntar el plan no lo dice y es una sesión de correr: se pregunta UNA vez, en el brief, y se recuerda para la
//             sesión. Nunca a mitad de sesión, nunca dos veces.
//   usaGps    calle y pista salen a la calle: hace falta GPS y el brief dice cuándo está listo. La cinta no lo
//             necesita y no lo enseña.
//
// Puro: del plan a lo que el brief pinta.

extension Vivo {

    struct SalidaDeCorrer: Equatable {
        var entorno: Entorno?
        var preguntar: Bool
        var usaGps: Bool

        /// Sin nada de correr que preparar: una sesión de fuerza, un HYROX, un plan que aún no llegó.
        static let ninguna = SalidaDeCorrer(entorno: nil, preguntar: false, usaGps: false)
    }

    /// Dónde dice el plan que se corre: el entorno del primer tramo de correr que lo declara. Nil = no lo dice.
    static func entornoDelPlan(_ plan: WorkoutPlan) -> Entorno? {
        plan.segments.lazy.compactMap { $0.runStructureLegs?.compactMap(\.environment).first }.first
    }

    /// El entorno del motor para lo que el atleta o el plan dicen. La pista es calle (GPS); la cinta es una sin
    /// conexión (la conectada, con su monitor, es del móvil).
    static func runEnvironment(de entorno: Entorno) -> RunEnvironment {
        entorno == .cinta ? .indoor : .outdoor
    }

    /// Lo que el brief pinta de una sesión de correr; `ninguna` si la sesión no es de correr.
    static func salidaDe(_ plan: WorkoutPlan?) -> SalidaDeCorrer {
        guard let plan, esSesionDeCorrer(planDe(plan, zonas: nil, entorno: nil).pasos) else { return .ninguna }
        let entorno = entornoDelPlan(plan)
        return SalidaDeCorrer(entorno: entorno, preguntar: entorno == nil, usaGps: entorno.map { $0 != .cinta } ?? false)
    }
}
