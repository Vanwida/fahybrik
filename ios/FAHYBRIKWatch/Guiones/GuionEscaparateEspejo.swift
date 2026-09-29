#if DEBUG
import SwiftUI

// EL ESCAPARATE DE LAS TRES PÁGINAS DE CORRER (Datos | Vivo | Controles).
//
// La lámina no es un guion de `WatchReloj`: es el cromo `RodajeCromo` con el
// cuerpo de cada página. Los casos pintan EXACTAMENTE los mismos cuerpos que el
// espejo y el solitario (`RodajeDatosCuerpo`, `RodajeVivoCuerpo`,
// `RodajeControles`), con datos de laboratorio, para poder mirarlos en un 46 mm
// y en un SE de 40 mm sin salir a correr:
//
//     xcrun simctl launch <sim> com.fahybrid.app.watchkitapp -guion espejo-datos

extension GuionEscaparate {

    static var espejoRodaje: [Caso] {
        [
            Caso(
                id: "espejo-datos",
                titulo: "Correr · Datos (espejo y solitario)",
                paginas: [],
                vista: {
                    cromo(zona: .z2) {
                        RodajeDatosCuerpo(lectura: RodajeDatos.lectura(.init(
                            segundos: 1_934, metros: 6_420, bpm: 148, zona: .z2)))
                    }
                }
            ),
            Caso(
                id: "espejo-datos-largo",
                titulo: "Correr · Datos, pasada la hora (el ancho peor)",
                paginas: [],
                vista: {
                    cromo(zona: .z4) {
                        RodajeDatosCuerpo(lectura: RodajeDatos.lectura(.init(
                            segundos: 4_360, metros: 14_250, bpm: 172, zona: .z4)))
                    }
                }
            ),
            Caso(
                id: "espejo-datos-sin-gps",
                titulo: "Correr · Datos, sin GPS y sin umbral",
                paginas: [],
                vista: {
                    cromo(zona: nil) {
                        RodajeDatosCuerpo(lectura: RodajeDatos.lectura(.init(
                            segundos: 47, metros: nil, bpm: 138, zona: nil)))
                    }
                }
            ),
            Caso(
                id: "espejo-vivo",
                titulo: "Correr · Vivo con los tres puntos",
                paginas: [],
                vista: {
                    cromo(zona: .z2) {
                        RodajeVivoCuerpo(
                            lectura: RodajeLamina.lectura(RodajeLamina.Ventana(
                                metros: 6_420, objetivoMetros: 10_000,
                                segundosPieza: 1_934, ritmoSecPorKm: 302)),
                            punto: RodajePagina.vivo.punto)
                    }
                }
            ),
            Caso(
                id: "espejo-controles",
                titulo: "Correr · Controles en espejo",
                paginas: [],
                vista: {
                    cromo(zona: .z2) {
                        RodajeControles(
                            encabezado: RodajeLamina.encabezadoControles(.init(), sesionS: 1_934),
                            pausado: false,
                            onPausa: {},
                            pie: "El entreno se controla desde el iPhone",
                            onTerminar: {}
                        )
                    }
                }
            ),
            Caso(
                id: "espejo-controles-sin-enlace",
                titulo: "Correr · Controles en espejo, sin conexión",
                paginas: [],
                vista: {
                    cromo(zona: .z2) {
                        RodajeControles(
                            encabezado: RodajeLamina.encabezadoControles(.init(), sesionS: 1_934),
                            pausado: false,
                            onPausa: {},
                            avisoSinEnlace: true,
                            pie: "El entreno se controla desde el iPhone",
                            onTerminar: {},
                            onDescartar: {}
                        )
                    }
                }
            ),
        ]
    }

    /// El cromo con un aro continuo a medias, como lo lleva un rodaje real.
    private static func cromo<C: View>(zona: HRZone?, @ViewBuilder _ contenido: @escaping () -> C) -> AnyView {
        AnyView(
            RodajeCromo(
                zona: zona,
                bisel: WatchAroContinuo(remaining: 0.36).watchBisel(),
                content: contenido
            )
        )
    }
}
#endif
