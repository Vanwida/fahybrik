import Foundation

// CÓMO SE LEE CADA MÁQUINA CONCEPT2 — la unidad del ritmo, la de la frecuencia y
// el verbo de quien la mueve.
//
// El hueco (28-sep): la BikeErg se pintaba como un remo. Split «/500m», «s/min» y
// «sin remar» sobre una bici. El estándar de Concept2 para la BikeErg es el ritmo
// por 1.000 m y la cadencia en RPM — es lo que enseña su propio monitor, y un
// ciclista que ve «1:05/500m» no reconoce su ritmo. El remo y el SkiErg sí van por
// 500 m y paladas (tirones) por minuto.
//
// El PM5 manda siempre el ritmo por 500 m en el mismo campo; aquí solo se decide
// cómo se DICE. El dato guardado no cambia (`avg_pace_s_per_500m` sigue siendo por
// 500 m en el cable): esto es la pantalla, no el registro.
struct LecturaErgo: Equatable {
    /// Metros de la unidad de ritmo que se pinta (500 o 1.000).
    let metrosDeRitmo: Double
    /// «/500m» · «/1000m».
    let unidadRitmo: String
    /// «s/min» · «rpm».
    let unidadFrecuencia: String
    /// Por qué no hay split en este momento: «sin remar» · «sin pedalear».
    let parado: String
    /// Antes de la primera lectura: «esperando la primera palada» · «…pedalada».
    let esperando: String
    /// El reloj retenido hasta que la máquina se mueve: «empieza al remar».
    let empiezaAl: String
    /// El empujón cuando el monitor está conectado y mudo: «Dale unas paladas.»
    let arranca: String

    /// El ritmo del monitor (siempre por 500 m) en la unidad de esta máquina.
    func ritmo(desdePor500 segundos: Double) -> Double {
        segundos * metrosDeRitmo / 500
    }

    static let remo = LecturaErgo(metrosDeRitmo: 500, unidadRitmo: "/500m", unidadFrecuencia: "s/min",
                                  parado: "sin remar", esperando: "esperando la primera palada",
                                  empiezaAl: "empieza al remar", arranca: "Dale unas paladas.")
    static let ski = LecturaErgo(metrosDeRitmo: 500, unidadRitmo: "/500m", unidadFrecuencia: "s/min",
                                 parado: "sin tirar", esperando: "esperando el primer tirón",
                                 empiezaAl: "empieza al tirar", arranca: "Dale unos tirones.")
    static let bici = LecturaErgo(metrosDeRitmo: 1000, unidadRitmo: "/1000m", unidadFrecuencia: "rpm",
                                  parado: "sin pedalear", esperando: "esperando la primera pedalada",
                                  empiezaAl: "empieza al pedalear", arranca: "Dale unas pedaladas.")

    /// La lectura de la máquina de esta modalidad. Sin máquina nombrada, la del remo
    /// (el monitor genérico): es la que el PM5 enseña por defecto.
    static func de(_ modality: PrescriptionModality?) -> LecturaErgo {
        switch modality {
        case .bike?: return .bici
        case .ski?:  return .ski
        default:     return .remo
        }
    }
}
