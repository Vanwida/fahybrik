import SwiftUI

// EL DETALLE DE UN ERGO, PINTADO — remo, SkiErg y BikeErg con la misma forma y su unidad: el umbral de potencia de la máquina y
// su ancla, las ocho piezas estándar de Concept2 (con las que faltan como invitación), los vatios al mismo pulso con las
// paladas (o las rpm en la bici) y los metros de cada semana. La bici se lee por 1000 m, como su monitor.
//
// El ancho del lienzo decide cuántas semanas caben una a una en la gráfica de metros (12 sí; 26 van de dos en dos).

struct AnaliticasCuerpoDeErgo: View {
    let lectura: LecturaDeErgo
    /// Ancho útil del lienzo.
    let ancho: CGFloat
    let onSalida: (DestinoDeSalida) -> Void

    private var hoy: String { lectura.hoy }
    private var nombre: String { lectura.maquina.lectura.nombre }

    var body: some View {
        if lectura.estado != .vacio {
            umbral
            piezas
            vatios
            metros
        }
    }

    // MARK: Umbral de potencia

    @ViewBuilder
    private var umbral: some View {
        AnaliticasSeccion(titulo: "Umbral de potencia", pregunta: "El vigente hoy · del que cuelga la carga de cada pieza") {
            if let u = lectura.umbral {
                AnaliticasRejilla {
                    AnaliticasCelda(etiqueta: "Umbral", valor: u.vatios, unidad: .watts, ancla: u.ancla)
                }
                AnaliticasNota(texto: u.explicaEs)
                if u.ancla == .declarada || u.ancla.esEstimada {
                    AnaliticasNota(texto: "\(u.ancla == .declarada ? "Lo declaraste tú" : "Es una estimación"): \(Self.textoDelTest(lectura.maquina)) lo convierte en medido y afina la carga de cada pieza.")
                    AnaliticasBoton(texto: "Hacer el test", secundario: true) { onSalida(.tests) }
                }
            } else {
                AnaliticasHueco(
                    texto: TextoHueco(
                        titulo: "Todavía sin umbral de potencia",
                        cuerpo: "Con \(Self.textoDelTest(lectura.maquina)) queda fijado y cada pieza de \(nombre) carga por potencia.",
                        salida: .accion("Hacer el test", .tests),
                        plazo: nil
                    ),
                    onSalida: onSalida
                )
            }
        }
    }

    /// El test que convierte el umbral en medido: el 2000 m de remo, el 1000 m de ski, y en la bici un test de potencia.
    static func textoDelTest(_ m: FamiliaDeDetalle) -> String {
        switch m {
        case .remo: return "el test de 2000 m"
        case .ski: return "el test de 1000 m"
        default: return "un test"
        }
    }

    // MARK: Mejores por pieza

    private var textoDeLaPregunta: String { "Las ocho piezas estándar · \(lectura.piezasHechas) \(lectura.piezasHechas == 1 ? "hecha" : "hechas")" }

    @ViewBuilder
    private var piezas: some View {
        if !lectura.piezas.isEmpty {
            AnaliticasSeccion(titulo: "Mejores por pieza", pregunta: textoDeLaPregunta) {
                AnaliticasTabla(
                    etiqueta: "Mejores por pieza estándar",
                    columnas: [
                        ColumnaDeTabla(cabecera: "Pieza", ancho: 74),
                        ColumnaDeTabla(cabecera: "Marca", alinear: .trailing),
                        ColumnaDeTabla(cabecera: lectura.maquina == .bici ? "/1000 m" : "/500 m", alinear: .trailing),
                        ColumnaDeTabla(cabecera: "Cuándo", alinear: .trailing),
                    ],
                    filas: lectura.piezas
                ) { pieza, columna in
                    celda(pieza, columna)
                }
                AnaliticasNota(texto: "Las piezas sin hacer son las de la tabla de Concept2: hacer una es un récord seguro.")
            }
        }
    }

    @ViewBuilder
    private func celda(_ p: PiezaDeErgo, _ columna: Int) -> some View {
        switch columna {
        case 0: Text(p.nombre)
        case 1:
            if let m = p.marca { Text(p.medida == .tiempo ? AnaliticasFormato.formatear(m.valor, .metros) : Formato.clock(m.valor)) }
            else { Text("sin hacer").foregroundStyle(Theme.Color.muted) }
        case 2:
            if let r = p.ritmo(por: lectura.ritmoPor) { Text(Formato.clock(r)) }
        default:
            if let m = p.marca {
                VStack(alignment: .trailing, spacing: 4) {
                    if m.nuevo { AnaliticasSello(texto: "Nuevo") }
                    if let d = m.cuando.texto(hoy: hoy) { AnaliticasEtiqueta(texto: d, tono: m.viejo ? Theme.Color.muted : Theme.Color.foreground) }
                }
            }
        }
    }

    // MARK: Vatios al mismo pulso

    @ViewBuilder
    private var vatios: some View {
        if let motor = lectura.motor, motor.estado == .medida || AnaliticasFilaSinDato.dice(motor) {
            AnaliticasSeccion(titulo: "Vatios al mismo pulso", pregunta: "Lo que rindes por el mismo esfuerzo") {
                if motor.estado == .medida, let d = motor.dato {
                    AnaliticasRejilla {
                        AnaliticasCelda(etiqueta: "Vatios al mismo pulso", valor: d.valor, unidad: d.unidad, delta: AnaliticasDerivados.delta(de: motor), ancla: motor.procedencia.ancla)
                        if let c = lectura.cadencia, c.estado == .medida, let dc = c.dato {
                            AnaliticasCelda(etiqueta: lectura.maquina == .bici ? "Cadencia" : "Paladas", valor: dc.valor, unidad: dc.unidad, nota: "media en piezas de trabajo")
                        }
                    }
                    if !lectura.filaEsMotor, let s = motor.serie, s.seDibuja {
                        AnaliticasTendencia(serie: s, unidad: d.unidad, familia: lectura.maquina.lectura, etiqueta: "Vatios al mismo pulso", alto: 150)
                    }
                    AnaliticasNota(texto: motor.procedencia.explicaEs)
                } else {
                    AnaliticasFilaSinDato(lectura: motor, onSalida: onSalida)
                }
            }
        }
    }

    // MARK: Metros por semana

    @ViewBuilder
    private var metros: some View {
        if let v = lectura.volumen, v.estado == .medida, let s = v.serie {
            let agrupar = AnaliticasEscala.agrupacion(puntos: s.puntos.count, ancho: ancho - 60)
            let cubos = AnaliticasDerivados.cubosDeSerie(s, color: FamiliaGrande(lectura.maquina.lectura).color, hoy: hoy, agrupar: agrupar)
            if !cubos.isEmpty {
                AnaliticasSeccion(titulo: "Metros por semana", pregunta: "Lo que hizo la máquina, semana a semana") {
                    AnaliticasSuperficie {
                        VStack(alignment: .leading, spacing: 8) {
                            AnaliticasGraficoColumnas(
                                cubos: cubos,
                                leyenda: AnaliticasDerivados.leyenda(de: cubos),
                                formatoY: { "\(AnaliticasFormato.entero($0 / 1000)) km" },
                                divisor: 1000,
                                diasPorCubo: 7 * agrupar
                            )
                            if agrupar > 1 { AnaliticasNota(texto: "Cada columna suma \(agrupar) semanas: a este ancho una por semana no se lee.") }
                        }
                    }
                    AnaliticasNota(texto: v.procedencia.explicaEs)
                }
            }
        }
    }
}
