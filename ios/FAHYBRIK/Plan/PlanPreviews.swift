#if DEBUG
import SwiftUI

// LAS PREVIEWS DE «PLAN» — una por caso del doble (los mismos ids que sus capturas), con el acento de fábrica y en
// claro y oscuro a la vez. La galería que pinta los PNG comparables con el doble es `PlanGaleriaRenderTests`; esto
// es lo que se abre en Xcode para ver una pantalla viva (aquí SÍ hay scroll).
//
// Los casos son personas inventadas (`EjemplosPlan`): ninguno sale de producción.

private struct PlanDeEjemplo: View {
    let caso: CasoPlan

    var body: some View {
        PlanPantalla(l: caso.lectura, v: caso.lectura.vista(caso.nav), acciones: AccionesDePlan())
            .frame(height: 780)
            .background(Theme.Color.background)
    }
}

private struct PlanLibreDeEjemplo: View {
    let caso: CasoLibre
    @State private var seleccion: String?

    var body: some View {
        PlanLibrePantalla(l: caso.lectura, acciones: AccionesDeLibre(), seleccion: $seleccion)
            .frame(height: 780)
            .background(Theme.Color.background)
    }
}

/// El caso en claro (arriba) y en oscuro (abajo), con el acento del club (`nil` = el de fábrica).
private func ambas(_ id: String, club: ClubTheme? = nil) -> some View {
    ClubThemeStore.update(club)
    return VStack(spacing: 0) {
        ForEach([ColorScheme.light, .dark], id: \.self) { esquema in
            PlanDeEjemplo(caso: EjemplosPlan.casoPlan(id)).environment(\.colorScheme, esquema)
        }
    }
}

private func ambasLibre(_ id: String, club: ClubTheme? = nil) -> some View {
    ClubThemeStore.update(club)
    return VStack(spacing: 0) {
        ForEach([ColorScheme.light, .dark], id: \.self) { esquema in
            PlanLibreDeEjemplo(caso: EjemplosPlan.casoLibre(id)).environment(\.colorScheme, esquema)
        }
    }
}

#Preview("① Lleno · jueves, semana 3 de 6") { ambas("lleno") }
#Preview("② Dos sesiones, la de la mañana hecha") { ambas("doble") }
#Preview("③ Hoy hecho, mañana toca") { ambas("hecho-manana") }
#Preview("④ Hoy a medias") { ambas("a-medias") }
#Preview("⑤ Hoy sin hacer, y el martes también") { ambas("sin-hacer") }
#Preview("⑥ Mirando el sábado, no es hoy") { ambas("otro-dia") }
#Preview("⑦ Hoy descansa") { ambas("descanso") }
#Preview("⑧ Hoy no hay reloj que escribir") { ambas("sin-reloj") }
#Preview("⑨ Su plan empieza el lunes") { ambas("empieza-despues") }
#Preview("⑩ Recién dada de alta, nada publicado") { ambas("alta") }
#Preview("⑪ Plan en pausa") { ambas("pausa") }
#Preview("⑫ Hoy es la simulación HYROX") { ambas("hyrox") }
#Preview("⑬ La semana que viene, bloqueada por su club") { ambas("horizonte") }
#Preview("⑭ La semana que viene no carga") { ambas("sin-red") }
#Preview("⑮ Plan directo, sin bloque ni línea del coach") { ambas("plan-directo") }
#Preview("⑯ Todo reclamando a la vez") { ambas("denso") }
#Preview("⑰ Arranque en frío") { ambas("cargando") }
#Preview("⑱ Primer arranque sin red") { ambas("error") }

#Preview("⑲ Sin coach · sin nada medido") { ambasLibre("libre-sin-nada") }
#Preview("⑳ Sin coach · con tres carreras") { ambasLibre("libre-con-carreras") }
#Preview("㉑ Sin coach · arranque en frío") { ambasLibre("libre-cargando") }
#Preview("㉒ Sin coach · sin nada y sin red") { ambasLibre("libre-sin-nada-y-sin-red") }

#Preview("Club azul · lleno") { ambas("lleno", club: .pruebaAzul) }
#Preview("Club amarillo · a medias") { ambas("a-medias", club: .pruebaAmarillo) }
#Preview("Club azul · sin coach con carreras") { ambasLibre("libre-con-carreras", club: .pruebaAzul) }
#endif
