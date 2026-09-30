import SwiftUI
import WidgetKit

// LA COMPLICACIÓN DE HOY — el widget de la esfera y del Smart Stack (P13).
//
// Lee el registro que deja la app del reloj en el App Group (`ComplicacionAlmacen`) y lo
// enseña; no calcula nada. Dos entradas por línea de tiempo: ahora, y la medianoche, que
// vuelve a leer el registro PARA EL DÍA NUEVO (`paraElDia`): lo de ayer no se enseña como lo
// de hoy — sale «Sin plan» hasta que el iPhone empuje el día. La app además recarga todas
// las líneas de tiempo cada vez que guarda el día (`WatchPlanModel`), así que un plan que
// llega a media mañana se ve al momento, sin esperar a la medianoche.
//
// El toque abre la app del reloj en lo de hoy (`ComplicacionEnlace`). En el Smart Stack la
// sesión de hoy pide ir la primera (`relevance`); descansar, lo hecho y lo que falta no.

struct HoyEntrada: TimelineEntry {
    let date: Date
    let hoy: ComplicacionHoy
    var relevance: TimelineEntryRelevance?
}

struct HoyProveedor: TimelineProvider {

    /// Puntos con los que la sesión de hoy pide ir la primera de la pila. El resto no compite.
    private static let relevanciaDeLaSesion: Float = 100
    private static let relevanciaDeLoHecho: Float = 10

    func placeholder(in context: Context) -> HoyEntrada {
        HoyEntrada(date: .now, hoy: .sinPlan(dia: ComplicacionHoy.claveDeDia(.now)))
    }

    func getSnapshot(in context: Context, completion: @escaping (HoyEntrada) -> Void) {
        completion(entrada(en: .now, desde: ComplicacionAlmacen.leer()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HoyEntrada>) -> Void) {
        let ahora = Date.now
        let registro = ComplicacionAlmacen.leer()
        let calendario = Calendar.current
        let manana = calendario.nextDate(after: ahora, matching: DateComponents(hour: 0, minute: 0, second: 0),
                                         matchingPolicy: .nextTime) ?? ahora.addingTimeInterval(24 * 3600)
        let entradas = [
            entrada(en: ahora, desde: registro, hasta: manana),
            entrada(en: manana, desde: registro),
        ]
        completion(Timeline(entries: entradas, policy: .after(manana)))
    }

    /// La entrada de una fecha: el registro leído PARA ESE DÍA. `hasta` es cuánto dura lo que dice.
    private func entrada(en fecha: Date, desde registro: ComplicacionHoy?, hasta: Date? = nil) -> HoyEntrada {
        let hoy = (registro ?? .sinPlan(dia: ComplicacionHoy.claveDeDia(fecha))).paraElDia(fecha)
        let duracion = max(60, (hasta ?? fecha.addingTimeInterval(3600)).timeIntervalSince(fecha))
        switch hoy.estado {
        case .sesion:
            return HoyEntrada(date: fecha, hoy: hoy,
                              relevance: TimelineEntryRelevance(score: Self.relevanciaDeLaSesion, duration: duracion))
        case .hecha:
            return HoyEntrada(date: fecha, hoy: hoy,
                              relevance: TimelineEntryRelevance(score: Self.relevanciaDeLoHecho, duration: duracion))
        case .descanso, .sinPlan:
            return HoyEntrada(date: fecha, hoy: hoy)
        }
    }
}

struct HoyWidget: Widget {
    /// El identificador de la complicación. Cambiarlo la quita de las esferas donde ya esté.
    static let kind = "FAHYBRIKHoy"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: HoyProveedor()) { entrada in
            HoyVista(hoy: entrada.hoy)
                .widgetURL(ComplicacionEnlace.hoy)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Hoy")
        .description("Lo de hoy: la sesión, contra qué se hace y su forma.")
        .supportedFamilies([.accessoryRectangular, .accessoryCorner, .accessoryInline, .accessoryCircular])
    }
}
