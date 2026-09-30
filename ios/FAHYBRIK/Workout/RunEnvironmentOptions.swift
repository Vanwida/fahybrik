import SwiftUI

// «¿Dónde corres?» — las tres opciones, UNA vez. La pantalla de dispositivos de antes del entreno (la elección
// queda en un borrador hasta «Continuar») y la hoja de conectividad en vivo (la elección cambia la sesión ya)
// las dibujan igual y solo difieren en qué pasa al tocar.

extension RunEnvironment {
    /// El glifo del kit de cada sitio donde se corre.
    var glifoDia: GlifoDia {
        switch self {
        case .outdoor:   return .ubicacion
        case .treadmill: return .correr
        case .indoor:    return .reloj
        }
    }

    /// Cómo se llama ante el atleta (más largo que `hudLabel`, que es el del cromo en vivo).
    var tituloDeOpcion: String {
        switch self {
        case .outdoor:   return "Calle"
        case .treadmill: return "Cinta con conexión"
        case .indoor:    return "Cinta sin conexión"
        }
    }
}

struct RunEnvironmentOptions: View {
    let elegido: RunEnvironment?
    let alElegir: (RunEnvironment) -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            ForEach(RunEnvironment.allCases, id: \.self) { entorno in
                OpcionDia(
                    entorno.glifoDia,
                    titulo: entorno.tituloDeOpcion,
                    detalle: SessionStartPolicy.meterAuthoritySubtitle(for: entorno),
                    elegida: elegido == entorno
                ) { alElegir(entorno) }
            }
        }
    }
}
