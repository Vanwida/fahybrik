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
    /// La página que se ve. La complicación abre la app en `.dia` (el brief).
    @Binding var pagina: EntradaHoja
    let onStart: (Vivo.Entorno?) -> Void

    init(payload: WatchTodayPayload, sessionPlan: WatchSessionPlan,
         pagina: Binding<EntradaHoja> = .constant(.comoLlegas), onStart: @escaping (Vivo.Entorno?) -> Void) {
        self.payload = payload
        self.sessionPlan = sessionPlan
        self._pagina = pagina
        self.onStart = onStart
    }

    var body: some View {
        if let score = payload.readinessScore {
            TabView(selection: $pagina) {
                EntradaComoLlegasView(
                    score: score,
                    delta7d: payload.readinessDelta7d,
                    worstDriver: payload.readinessWorstDriver
                )
                .tag(EntradaHoja.comoLlegas)
                EntradaHoyView(payload: payload, sessionPlan: sessionPlan, onStart: onStart)
                    .tag(EntradaHoja.dia)
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
    /// La página que se ve. La complicación abre la app en `.dia` (el «hecho hoy»).
    @Binding var pagina: EntradaHoja

    init(payload: WatchTodayPayload, pagina: Binding<EntradaHoja> = .constant(.comoLlegas)) {
        self.payload = payload
        self._pagina = pagina
    }

    var body: some View {
        if let score = payload.readinessScore {
            TabView(selection: $pagina) {
                EntradaComoLlegasView(
                    score: score,
                    delta7d: payload.readinessDelta7d,
                    worstDriver: payload.readinessWorstDriver
                )
                .tag(EntradaHoja.comoLlegas)
                hecho
                    .tag(EntradaHoja.dia)
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
