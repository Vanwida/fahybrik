import SwiftUI

// LAS FAMILIAS DE ENTRENO EN LAS ANALÍTICAS — cómo se agrupan y cómo se llaman.
//
// El COLOR de cada una no vive aquí: es un token del tema con su variante clara y oscura
// (`Theme.Color.familiaCorrer`…, `Theme+Datos.swift`), validado por medida. Esta pieza solo
// decide qué familias caben en una barra y cómo se nombran delante del atleta.

/// Las cuatro familias GRANDES: las que caben en una barra apilada (≤ 4 series), más `otro`
/// (calentamiento, core, movilidad: cuenta el tiempo, no tiene «¿mejoro?»).
enum FamiliaGrande: String, CaseIterable, Equatable {
    case correr, ergo, fuerza, estacionesWod, otro

    init(_ f: FamiliaLectura?) {
        switch f {
        case .correr: self = .correr
        case .remo, .ski, .bici: self = .ergo
        case .fuerza: self = .fuerza
        case .estaciones, .wod: self = .estacionesWod
        case .otro, .desconocida, nil: self = .otro
        }
    }

    var nombre: String {
        switch self {
        case .correr: return "Correr"
        case .ergo: return "Ergo"
        case .fuerza: return "Fuerza"
        case .estacionesWod: return "Estaciones y WOD"
        case .otro: return "Otro"
        }
    }

    /// El color de la serie. `otro` es el gris neutro del tema: no compite con las cuatro.
    var color: Color {
        switch self {
        case .correr: return Theme.Color.familiaCorrer
        case .ergo: return Theme.Color.familiaErgo
        case .fuerza: return Theme.Color.familiaFuerza
        case .estacionesWod: return Theme.Color.familiaEstaciones
        case .otro: return Theme.Color.neutral
        }
    }

    /// El orden de apilado: correr abajo (la espina del HYROX), luego ergo, fuerza, estaciones y otro.
    static let ordenApilado: [FamiliaGrande] = [.correr, .ergo, .fuerza, .estacionesWod, .otro]
}

extension FamiliaLectura {
    /// Cómo se llama delante del atleta. Un solo sitio.
    var nombre: String {
        switch self {
        case .correr: return "Correr"
        case .remo: return "Remo"
        case .ski: return "SkiErg"
        case .bici: return "BikeErg"
        case .fuerza: return "Fuerza"
        case .estaciones: return "Estaciones"
        case .wod: return "WOD"
        case .otro: return "Otro"
        case .desconocida: return ""
        }
    }

    /// El color de una familia fina es el de su familia grande.
    var color: Color { FamiliaGrande(self).color }
}
