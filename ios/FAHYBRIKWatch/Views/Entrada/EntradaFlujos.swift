import SwiftUI

// LOS FLUJOS DE LA ENTRADA — cómo se agrupan las pantallas de reposo.
//
// Antes vivían dentro de `RootView`. Aquí: cómo llegas ▸ lo de hoy, y cómo llegas ▸
// hecho hoy. Los dos son el mismo paginador vertical de watchOS: la corona y el
// deslizamiento siempre se mueven, y sin puntuación real de cómo llegas la pantalla
// se queda sola (sin datos falsos).

// MARK: - Antes de empezar (cómo llegas ▸ lo de hoy)

struct EntradaAntesFlow: View {
    let payload: WatchTodayPayload
    let sessionPlan: WatchSessionPlan
    let onStart: () -> Void

    var body: some View {
        if let score = payload.readinessScore {
            TabView {
                EntradaComoLlegasView(
                    score: score,
                    delta7d: payload.readinessDelta7d,
                    worstDriver: payload.readinessWorstDriver
                )
                EntradaHoyView(payload: payload, sessionPlan: sessionPlan, onStart: onStart)
            }
            .tabViewStyle(.verticalPage)
        } else {
            EntradaHoyView(payload: payload, sessionPlan: sessionPlan, onStart: onStart)
        }
    }
}

// MARK: - Día hecho (cómo llegas ▸ hecho hoy)

/// El estado de un día completado. NO es un callejón sin salida: el atleta sigue
/// teniendo a mano cómo llega durante todo el día. Sin botón de «salir»: salir es la
/// corona del sistema.
struct EntradaHechoFlow: View {
    let payload: WatchTodayPayload

    var body: some View {
        if let score = payload.readinessScore {
            TabView {
                EntradaComoLlegasView(
                    score: score,
                    delta7d: payload.readinessDelta7d,
                    worstDriver: payload.readinessWorstDriver
                )
                hecho
            }
            .tabViewStyle(.verticalPage)
        } else {
            hecho
        }
    }

    private var hecho: some View {
        EntradaHechoView(
            title: payload.title ?? "Sesión",
            completeness: payload.doneCompleteness,
            doublesBadge: payload.doublesBadgeText
        )
    }
}
