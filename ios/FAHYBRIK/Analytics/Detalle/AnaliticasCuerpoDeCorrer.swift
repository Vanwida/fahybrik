import SwiftUI

// EL DETALLE DE CORRER, PINTADO — lo que `LecturaDeCorrer` decide, con el kit de la pestaña. El orden responde a la pregunta con que se
// abre la pantalla («¿mejoro corriendo?»): la marca clave y su tendencia, el umbral del que cuelga todo, los mejores esfuerzos con el
// periodo anterior detrás, el motor y la economía, la capacidad, el ritmo por tipo de sesión y lo que te piden.
//
// Cada sección resuelve sus estados: con dato, con la palabra retirada (el número se queda), sin dato con lo que falta y su salida, y
// callada cuando lo que falta no lo puede llenar el atleta con un acto (`AnaliticasFilaSinDato.dice`): un hueco se declara o se calla.

struct AnaliticasCuerpoDeCorrer: View {
    let lectura: LecturaDeCorrer
    let pedido: LoQueTePiden
    /// La holgura del coach para el ritmo, s/km: la nota de «lo que te piden».
    var holguraRitmo: Double? = nil
    let onSalida: (DestinoDeSalida) -> Void

    private var hoy: String { lectura.hoy }

    var body: some View {
        if lectura.estado != .vacio {
            AnaliticasTendenciaDelSujeto(sujeto: lectura.sujeto, fila: lectura.fila, familia: .correr)
            umbral
            mejores
            motor
            capacidad
            porTipo
            loQueTePiden
        }
    }

    // MARK: Ritmo umbral

    @ViewBuilder
    private var umbral: some View {
        if let u = lectura.umbral, u.estado == .medida || AnaliticasFilaSinDato.dice(u) {
            AnaliticasSeccion(titulo: "Ritmo umbral", pregunta: "Del que cuelgan tus zonas y tu carga") {
                if let d = u.dato {
                    AnaliticasRejilla {
                        AnaliticasCelda(etiqueta: "Ritmo umbral", valor: d.valor, unidad: d.unidad, ancla: u.procedencia.ancla)
                    }
                    AnaliticasNota(texto: u.procedencia.explicaEs)
                    if u.procedencia.ancla?.esEstimada == true {
                        AnaliticasNota(texto: "Con el test de zonas pasa a medido.")
                        AnaliticasBoton(texto: "Hacer el test de zonas", secundario: true) { onSalida(.tests) }
                    }
                } else {
                    AnaliticasFilaSinDato(lectura: u, onSalida: onSalida)
                }
            }
        }
    }

    // MARK: Mejores esfuerzos

    @ViewBuilder
    private var mejores: some View {
        if !lectura.mejores.isEmpty {
            AnaliticasSeccion(
                titulo: "Mejores esfuerzos",
                pregunta: lectura.curvaAntes.count > 1 ? "Esta ventana frente a la anterior · arriba es mejor" : "Esta ventana"
            ) {
                if lectura.hayCurva {
                    AnaliticasSuperficie {
                        AnaliticasCurvaMejores(
                            hoy: lectura.curvaHoy.map { PuntoDeCurva(metros: $0.metros, ritmo: $0.ritmoSKm) },
                            antes: lectura.curvaAntes.compactMap { e in e.anterior.map { PuntoDeCurva(metros: e.metros, ritmo: $0 / e.metros * 1000) } }
                        )
                    }
                }
                AnaliticasTabla(
                    etiqueta: "Mejores esfuerzos por distancia",
                    columnas: [
                        ColumnaDeTabla(cabecera: "Distancia", ancho: 74),
                        ColumnaDeTabla(cabecera: "Tiempo", alinear: .trailing),
                        ColumnaDeTabla(cabecera: "Ritmo", alinear: .trailing),
                        ColumnaDeTabla.cuando,
                    ],
                    filas: lectura.mejores
                ) { e, columna in
                    switch columna {
                    case 0: AnaliticasCeldaDoble(principal: e.nombre, apoyo: e.enCinta ? "en cinta" : nil)
                    case 1: Text(Formato.clock(e.segundos))
                    case 2: Text(AnaliticasFormato.formatear(e.ritmoSKm, .sKm))
                    default: if let d = e.cuando.texto(hoy: hoy) { AnaliticasEtiqueta(texto: d, tono: e.viejo ? Theme.Color.muted : Theme.Color.foreground) }
                    }
                }
            }
        }
    }

    // MARK: Motor y economía

    @ViewBuilder
    private var motor: some View {
        let motor = lectura.motor, desacople = lectura.desacople
        let visibles = [motor, desacople].compactMap { $0 }.filter { $0.estado == .medida || AnaliticasFilaSinDato.dice($0) }
        if !visibles.isEmpty {
            AnaliticasSeccion(titulo: "Motor y economía", pregunta: "Lo que corres por el mismo esfuerzo") {
                // Si el Motor ya es el sujeto (y su tendencia va justo debajo), no se repite como cifra.
                let conDato = visibles.filter { $0.estado == .medida && $0.dato != nil && !($0.id == LecturaDeCorrer.idMotor && lectura.filaEsMotor) }
                if !conDato.isEmpty {
                    AnaliticasRejilla {
                        ForEach(conDato) { l in
                            if let d = l.dato {
                                AnaliticasCelda(
                                    etiqueta: l.id == LecturaDeCorrer.idMotor ? "Motor" : "Desacople", valor: d.valor, unidad: d.unidad,
                                    delta: AnaliticasDerivados.delta(de: l, bajaEsMejor: l.id == LecturaDeCorrer.idDesacople ? true : nil), ancla: l.procedencia.ancla,
                                    nota: l.id == LecturaDeCorrer.idMotor ? "ritmo al mismo pulso" : "en tiradas largas"
                                )
                            }
                        }
                    }
                }
                ForEach(visibles.filter { $0.estado == .sinDato }) { AnaliticasFilaSinDato(lectura: $0, onSalida: onSalida) }
                if !lectura.filaEsMotor, let s = motor?.serie, s.seDibuja, let d = motor?.dato {
                    AnaliticasTendencia(serie: s, unidad: d.unidad, familia: .correr, etiqueta: "Tendencia del Motor", alto: 150)
                }
                if let e = desacople?.procedencia.explicaEs, desacople?.estado == .medida { AnaliticasNota(texto: e) }
            }
        }
    }

    // MARK: Velocidad crítica y VDOT

    @ViewBuilder
    private var capacidad: some View {
        let vc = lectura.velocidadCritica, deposito = lectura.deposito, vdot = lectura.vdot
        let vcMedida = vc?.estado == .medida && vc?.dato != nil
        let vcDice = vc.map { AnaliticasFilaSinDato.dice($0) } ?? false
        let vdotMedido = vdot?.estado == .medida && vdot?.dato != nil
        if vcMedida || vcDice || vdotMedido {
            AnaliticasSeccion(
                titulo: vcMedida || vcDice ? "Velocidad crítica" : "VDOT",
                pregunta: vcMedida || vcDice ? "El ritmo que aguantas sin reventar, y cuánto puedes pasarte" : "Lo que dice tu mejor esfuerzo de 1500 m en adelante"
            ) {
                if vcDice, let vc { AnaliticasFilaSinDato(lectura: vc, unidadDelPlazo: "esfuerzos", onSalida: onSalida) }
                if vcMedida || vdotMedido {
                    AnaliticasRejilla {
                        if vcMedida, let vc, let d = vc.dato {
                            AnaliticasCelda(etiqueta: "Velocidad crítica", valor: d.valor, unidad: d.unidad, delta: AnaliticasDerivados.delta(de: vc),
                                            nota: d.valor > 0 ? "≈ \(AnaliticasFormato.formatear(1000 / d.valor, .sKm))" : nil)
                        }
                        if vcMedida, let deposito, let d = deposito.dato {
                            AnaliticasCelda(etiqueta: "Depósito", valor: d.valor, unidad: d.unidad, nota: "por encima de la crítica")
                        }
                        if vdotMedido, let vdot, let d = vdot.dato {
                            AnaliticasCelda(etiqueta: "VDOT", valor: d.valor, unidad: d.unidad, delta: AnaliticasDerivados.delta(de: vdot), ancla: vdot.procedencia.ancla)
                        }
                    }
                }
                if let e = (vcMedida ? vc : vdot)?.procedencia.explicaEs { AnaliticasNota(texto: e) }
            }
        }
    }

    // MARK: Por tipo de sesión

    @ViewBuilder
    private var porTipo: some View {
        if !lectura.porTipo.isEmpty {
            AnaliticasSeccion(titulo: "Por tipo de sesión", pregunta: "Tu ritmo medio en cada tipo, contra sí mismo") {
                AnaliticasLista {
                    ForEach(lectura.porTipo) { l in
                        AnaliticasFilaProgreso(
                            familia: .correr, metrica: "ritmo medio", valor: l.dato?.valor, unidad: l.dato?.unidad ?? .sKm,
                            delta: AnaliticasDerivados.delta(de: l), tendencia: l.serie?.puntos,
                            nota: l.estado == .sinDato ? "Todavía sin marca" : nil,
                            nombre: LecturaDeCorrer.nombreDeTipo(l).capitalizadoEs
                        )
                    }
                }
                AnaliticasNota(texto: "Cada tipo se compara contra sí mismo, nunca contra otro.")
            }
        }
    }

    // MARK: Lo que te piden

    @ViewBuilder
    private var loQueTePiden: some View {
        switch pedido {
        case .sinCargar:
            EmptyView()
        case .sinSeries:
            AnaliticasSeccion(titulo: "Lo que te piden", pregunta: "Cada serie con objetivo de ritmo, un punto") {
                AnaliticasNota(texto: "Todavía sin series con objetivo de ritmo en esta ventana. Cuando tu coach te pida un ritmo, aquí sale si lo clavas.")
            }
        case .series(let p):
            AnaliticasSeccion(titulo: "Lo que te piden", pregunta: "Cada serie con objetivo de ritmo, un punto") {
                AnaliticasPuntosCumplimiento(pedido: p)
                AnaliticasNota(texto: notaDelPedido(p))
            }
        }
    }

    private func notaDelPedido(_ p: PedidoDeSeries) -> String {
        let base = "\(p.series) \(p.series == 1 ? "serie" : "series") en \(p.sesiones) \(p.sesiones == 1 ? "sesión" : "sesiones")"
        let franja = holguraRitmo.map { "en la franja que pidió tu coach (±\(Formato.esDecimal($0)) s/km)" } ?? "en la franja que pidió tu coach"
        return "\(base) · dentro = \(franja)"
    }
}

extension String {
    /// La primera letra en mayúscula («rodajes» → «Rodajes»), sin tocar el resto.
    var capitalizadoEs: String { prefix(1).uppercased() + dropFirst() }
}
