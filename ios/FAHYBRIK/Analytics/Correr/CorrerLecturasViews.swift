import SwiftUI

// LAS TRES VISTAS QUE HEREDAN LA TIRA (mapa v2): Forma, Lo que te piden y
// Correr cansado. No inventan nada — MUDAN los bloques ya shipeados de la
// pastilla a su propia vista, con la puerta a sesiones donde ya existía.
// La tira muere con esta obra; sus bloques viven aquí, uno por pregunta.

// MARK: - FORMA — ¿el motor responde mejor?

struct CorrerFormaView: View {
    let progreso: RunningProgressPayload
    /// Las lecturas del grupo de ejecución (deriva aeróbica, bajada de pulso):
    /// running puro que la tira colgaba al final. Nulas si aún no llegaron.
    let analiticas: AnaliticasAtleta?
    var onDrill: ((DrillRef) -> Void)?

    private static let entre: CGFloat = 48

    private var h: RunningHistory { progreso.history }

    private func modo(_ l: ProgresoDeCarrera.Lectura) -> ProgresoDeCarrera.Modo {
        ProgresoDeCarrera.modo(progreso.coverage, l)
    }

    var body: some View {
        FillingScreen {
            VStack(alignment: .leading, spacing: Self.entre) {
                forma
                repartoSuaveFuerte
                if let a = analiticas {
                    GrupoDeLecturas(
                        etiqueta: GrupoLectura.ejecucion.etiqueta ?? "Ejecución",
                        lecturas: a.lecturas.deGrupo(.ejecucion),
                        ventana: a.ventanaEs,
                        onSalida: nil
                    )
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .background(Theme.Color.background)
        .navigationTitle("Forma")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private var forma: some View {
        BloqueDeLectura(etiqueta: "Forma") {
            if modo(.forma) == .da {
                if let vo2 = h.vo2 {
                    CifraDeBloque(valor: Formato.esDecimal(vo2.valor, decimals: 0),
                                  unidad: "VO₂máx", tam: 54) {
                        if let delta = vo2.delta, delta != 0 {
                            DeltaDeBloque(mejor: delta > 0,
                                          valor: Formato.esDecimal(abs(delta), decimals: 0),
                                          ventana: "\(vo2.ventanaSemanas) sem")
                        }
                    }
                } else if let ultimo = h.alPulso.last {
                    CifraDeBloque(valor: Formato.ritmo(ultimo.valor, .porKm),
                                  unidad: "mismo pulso", tam: 54) {
                        if let d = progreso.deltas.forma {
                            DeltaDeBloque(mejor: d.ganaSKm > 0,
                                          valor: "\(Int(abs(d.ganaSKm).rounded())) s",
                                          ventana: "\(d.semanas) sem")
                        }
                    }
                }
                LineaDeProgreso(puntos: h.alPulso, formato: { Formato.clock($0) })
                Text("Ritmo a \(h.ppmReferencia) \(Vocab.ppm)")
                    .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
            } else if modo(.forma) == .apagada {
                LecturaApagada(alto: 124)
            }
        }
    }

    @ViewBuilder
    private var repartoSuaveFuerte: some View {
        if modo(.reparto) == .da, let pct = progreso.polarization.pct {
            BloqueDeLectura(etiqueta: "Suave y fuerte") {
                CifraDeBloque(valor: "\(pct.low)", unidad: "% suave", tam: 44)
                BarraDeReparto(segmentos: segmentosDeZona,
                               objetivoSuave: Double(progreso.polarization.target.low))
            }
        } else if modo(.reparto) == .apagada {
            BloqueDeLectura(etiqueta: "Suave y fuerte") {
                LecturaApagada(alto: 72)
            }
        }
    }

    /// El reparto crudo que la barra necesita — el plegado a bandas ya lo hizo
    /// el servidor. (La copia de la tira muere con ella; esta queda.)
    private var segmentosDeZona: [(zona: Int?, pct: Double)] {
        let total = h.segundosCorriendo
        guard total > 0 else { return [] }
        var salida: [(zona: Int?, pct: Double)] = []
        var clasificado: Double = 0
        for z in 1...5 {
            let s = h.zonasS["z\(z)"] ?? 0
            guard s > 0 else { continue }
            clasificado += s
            salida.append((zona: z, pct: s / total * 100))
        }
        let sinPulso = total - clasificado
        if sinPulso > 0 { salida.append((zona: nil, pct: sinPulso / total * 100)) }
        return salida
    }
}

// MARK: - LO QUE TE PIDEN — la adherencia a las bandas del coach

struct CorrerAdherenciaView: View {
    let progreso: RunningProgressPayload
    var onDrill: ((DrillRef) -> Void)?

    private var h: RunningHistory { progreso.history }

    var body: some View {
        FillingScreen {
            VStack(alignment: .leading, spacing: 48) {
                if let p = h.pedido, let pct = p.pctEnBanda {
                    BloqueDeLectura(etiqueta: "Lo que te piden", sello: true) {
                        CifraDeBloque(valor: "\(Int(pct.rounded()))", unidad: "% en banda", tam: 54,
                                      tono: p.juzgable
                                        ? (pct >= progreso.method.goodInBandPct
                                           ? Theme.Color.ok : Theme.Color.warning)
                                        : Theme.Color.foreground)
                        PuntosDePedido(dentro: p.dentro, lento: p.fueraLento, rapido: p.fueraRapido)
                        // EL PORCENTAJE SOLO NO SIRVE: el mismo 74 % significa lo
                        // contrario según hacia dónde se falle. El sesgo lo
                        // cuentan los puntos; esta línea lo nombra.
                        if p.fueraRapido > p.fueraLento {
                            Text("Cuando te sales, te sales RÁPIDO — el fallo clásico de las series.")
                                .scaledFont(11, weight: .medium, relativeTo: .caption)
                                .foregroundStyle(Theme.Color.faint)
                                .fixedSize(horizontal: false, vertical: true)
                        } else if p.fueraLento > p.fueraRapido {
                            Text("Cuando te sales, te quedas corto: llega cansancio o falta ritmo objetivo.")
                                .scaledFont(11, weight: .medium, relativeTo: .caption)
                                .foregroundStyle(Theme.Color.faint)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if onDrill != nil {
                            PuertaASesiones(etiqueta: "Ver esos entrenos") {
                                onDrill?(DrillRef(kind: "running.volume", params: [:],
                                                  count: p.evaluadas,
                                                  label_es: "Tus entrenos con banda"))
                            }
                        }
                    }
                } else {
                    RedesignEmptyState(
                        symbol: "target",
                        title: "Sin bandas que juzgar",
                        message: "Cuando tu coach te pida un ritmo, aquí se lee si lo clavas.",
                        exit: .explained(note: "Se calcula solo, entreno a entreno.")
                    )
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .background(Theme.Color.background)
        .navigationTitle("Lo que te piden")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - CORRER CANSADO — lo nuestro (Garmin no puede)

struct CorrerCansadoView: View {
    let progreso: RunningProgressPayload

    private var h: RunningHistory { progreso.history }

    var body: some View {
        FillingScreen {
            VStack(alignment: .leading, spacing: 48) {
                if let ultimo = h.cansado.last {
                    BloqueDeLectura(etiqueta: "Correr cansado", sello: true) {
                        let mejora = progreso.deltas.cansado?.mejoraSKm
                        CifraDeBloque(valor: Formato.esDecimal(ultimo.costeSKm),
                                      unidad: "s/km de más", tam: 54,
                                      tono: (mejora ?? 0) > 0 ? Theme.Color.ok : Theme.Color.warning) {
                            if let d = progreso.deltas.cansado {
                                DeltaDeBloque(mejor: d.mejoraSKm > 0,
                                              valor: Formato.esDecimal(abs(d.mejoraSKm)),
                                              ventana: "\(d.semanas) sem")
                            }
                        }
                        LineaDeProgreso(
                            puntos: h.cansado.map { PuntoSemana(semana: $0.semana, valor: $0.costeSKm) },
                            alto: 150,
                            formato: { Formato.esDecimal($0) }
                        )
                        Text("Cuánto ritmo pierdes corriendo con trabajo previo encima. Tu reloj no puede saberlo: no sabe qué hiciste antes.")
                            .scaledFont(11, weight: .medium, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.faint)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    BloqueDeLectura(etiqueta: "Correr cansado", sello: true) {
                        LecturaApagada(alto: 88)
                        Text("Necesita parejas del mismo esfuerzo en fresco y con trabajo previo — salen solas de tus entrenos.")
                            .scaledFont(11, weight: .medium, relativeTo: .caption)
                            .foregroundStyle(Theme.Color.faint)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.xl)
            .padding(.bottom, Theme.Spacing.xxl)
        }
        .background(Theme.Color.background)
        .navigationTitle("Correr cansado")
        .navigationBarTitleDisplayMode(.inline)
    }
}
