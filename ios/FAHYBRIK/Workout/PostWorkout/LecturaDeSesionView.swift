import SwiftUI

// LA LECTURA DE UNA SESIÓN — al terminar algo que NO es una carrera sola (card
// 118, rehecha en la card 124). `LecturaDeCarreraView` contesta «¿hice lo que me
// pidieron?» cuando la sesión fue correr; esta contesta la pregunta de antes —
// qué hiciste — cuando mezcla fuerza, ergómetro, correr y trabajo funcional en
// cualquier orden, o es puramente una de esas cosas.
//
// Port de `web/components/design-twin/screens/lectura-sesion/index.tsx`, sobre
// el mismo cromo que ya usa `LecturaDeCarreraView` (Ambiente + acción anclada):
// las dos son hermanas y comparten la misma banda viva, aunque esta no tenga
// veredicto que anclar en un número grande.
//
// LAS SIETE CAPAS, EN ESTE ORDEN: cabecera · totales · gráfica de pulso · mapa ·
// desglose · zonas · lo que dijo el atleta. Cada una es independientemente
// opcional — una sesión de fuerza pura sin pulsómetro no tiene ni gráfica ni
// zonas, y no se pinta un hueco en su lugar (§7 CONTRATO-UI).
struct LecturaDeSesionView: View {
    let sesion: SesionEjecutada
    /// Las zonas del atleta, para teñir el ambiente con el pulso medio. Sin ellas
    /// el lienzo se queda neutro: el color es dato y no se inventa.
    var zonas: HRZoneProfile?
    let onCerrar: () -> Void

    private var zonaAmbiente: HRZone? {
        guard let ppm = sesion.fcMediaPpm else { return nil }
        return zonas?.zone(forBpm: Int(ppm.rounded()))
    }

    private var grupos: [GrupoDesglose] { agruparPorRonda(sesion.bloques) }
    private var totalRondas: Int { sesion.bloques.compactMap(\.ronda).max() ?? 0 }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            Ambiente(zona: zonaAmbiente)
            VStack(spacing: BandaViva.hueco) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        CabeceraDeSesion(sesion: sesion)

                        TarjetaDeSeccion(titulo: "Los totales") {
                            RejillaTotalesDeSesion(sesion: sesion)
                        }

                        // La gráfica del pulso de TODA la sesión — lo que más
                        // pidió Alex. Sin traza real (fuerza pura sin
                        // pulsómetro, o una sesión anterior al archivo), no hay
                        // gráfica: ninguna, no una vacía.
                        if sesion.pulso.count > 1, let media = sesion.fcMediaPpm, let max = sesion.fcMaxPpm {
                            TarjetaDeSeccion(titulo: "Tu pulso") {
                                GraficaDePulso(
                                    muestras: sesion.pulso, mediaPpm: media, maxPpm: max,
                                    duracionS: sesion.duracionTotalS
                                )
                            }
                        }

                        // El mapa, solo con GPS — mismo dibujo que la lectura de
                        // carrera: no se redibuja un segundo mapa para esta
                        // pantalla.
                        if !sesion.ruta.isEmpty {
                            TarjetaDeSeccion(titulo: "El recorrido") {
                                MapaDeLaCarrera(ruta: sesion.ruta)
                            }
                        }

                        TarjetaDeSeccion(titulo: "Bloque a bloque", nota: "\(sesion.bloques.count) en orden") {
                            VStack(spacing: 10) {
                                if !sesion.bloques.isEmpty { CabeceraDelDesglose() }
                                ForEach(Array(grupos.enumerated()), id: \.offset) { _, grupo in
                                    GrupoDeRonda(grupo: grupo, rondas: totalRondas)
                                }
                            }
                        }

                        // Las zonas de pulso, si las hay — nunca una barra vacía.
                        if let cobertura = sesion.zonas {
                            TarjetaDeSeccion(titulo: "Dónde estuvo tu pulso") {
                                BarraDeZonasDeSesion(cobertura: cobertura)
                            }
                        }

                        LoQueDijoElAtletaDeLaSesion(sesion: sesion)
                    }
                    .padding(.bottom, Theme.Spacing.l)
                }
                .scrollIndicators(.hidden)

                FranjaAccion(titulo: "Cerrar", accion: onCerrar)
                    .frame(height: BandaViva.accion)
            }
            .padding(BandaViva.hueco)
        }
    }
}

/// La tarjeta de sección — título grande (24 pt, fuerte, cursiva) y debajo el
/// contenido en una `CardSurface`. Es el «tarjeta por sección» del doble: o
/// todas las capas son secciones, o ninguna lo es.
private struct TarjetaDeSeccion<Content: View>: View {
    let titulo: String
    var nota: String? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text(titulo)
                    .font(.system(size: 24, weight: .heavy, design: .default).italic())
                    .foregroundStyle(Theme.Color.foreground)
                if let nota {
                    Text(nota)
                        .scaledFont(15, weight: .medium, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            CardSurface(padding: 14) { content() }
        }
    }
}
