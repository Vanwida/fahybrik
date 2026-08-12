import SwiftUI

// LAS ANALÍTICAS DE CARRERA — ¿estoy mejorando?
//
// LA REGLA QUE GOBIERNA LA PANTALLA: **el dato es el dibujo.** El texto es pie,
// de una línea, y casi siempre sobra. Una versión anterior razonaba bien y se
// leía como un informe; se rechazó por eso mismo. Una pantalla de analíticas que
// hay que LEER ha fallado antes de empezar.
//
// EL ACABADO SE MIDE CONTRA `LecturaDeCarreraView`, que Alex aprobó:
//
//   · FONDO TINTADO. Allí el lienzo lo tiñe la zona de pulso de la sesión, y es
//     lo que más hace que una pantalla parezca esta app. Aquí no hay una zona que
//     valga para toda la pantalla, así que tiñe EL VEREDICTO, que es su sujeto.
//     Sin veredicto el tono es el apagado y el lienzo queda neutro.
//   · CERO CAJAS Y CERO LÍNEAS DIVISORIAS. Los bloques se agrupan por DISTANCIA
//     (24 dentro de un grupo, 48 entre grupos), no por rayas.
//   · TRAZOS FINOS SOBRE EL TINTE, sin rellenos planos.
//   · EL NARANJA, UNA VEZ: la acción.
//
// COLOR SOLO DONDE ES DATO. El VO₂máx no lleva color — un VO₂máx no es una zona.
// La línea del ritmo tampoco: lo que se dibuja es el ritmo, y la zona es la
// condición, no la magnitud. El color de zona se queda donde se mide una zona (el
// reparto) y el verde donde hay veredicto.
//
// AQUÍ NO SE CALCULA NADA. El veredicto, su frase, el plazo, las coberturas, el
// reparto plegado y los cuatro deltas llegan servidos. Esta vista los coloca.

struct AnaliticasCorrerView: View {
    let progreso: RunningProgressPayload
    var onSalida: (() -> Void)?

    /// Dentro de un grupo. Entre grupos, el doble: se agrupa sin dibujar una raya.
    private static let dentro: CGFloat = 24
    private static let entre: CGFloat = 48

    private var h: RunningHistory { progreso.history }
    private var cobertura: Cobertura { progreso.coverage }

    private func modo(_ l: ProgresoDeCarrera.Lectura) -> ProgresoDeCarrera.Modo {
        ProgresoDeCarrera.modo(cobertura, l)
    }

    /// El veredicto que se PINTA. Si no queda ningún gráfico al que colgarle la
    /// marca, baja a «aún no»: afirmar sin nada que enseñar es pedirle al atleta
    /// que se fíe, y esta pantalla existe para no hacer eso.
    private var veredicto: Veredicto { ProgresoDeCarrera.veredictoEfectivo(progreso) }

    private var soporte: ProgresoDeCarrera.Soporte? {
        ProgresoDeCarrera.soporte(veredicto, cobertura: cobertura, history: h)
    }

    var body: some View {
        // EL TINTE ES EL VEREDICTO. En la pantalla hermana el lienzo lo tiñe la
        // zona de pulso de la sesión, y es lo que más hace que una pantalla
        // parezca esta app; aquí no hay una zona que valga para doce semanas, así
        // que tiñe el sujeto de ESTA pantalla. Sin veredicto el tono es el apagado
        // y el lienzo queda casi neutro — el color es dato también cuando falta.
        VStack(alignment: .leading, spacing: Self.entre) {
            sujeto
            loQueSale
            loQueMetes
            pedido
            carreraYCansado
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - El sujeto: el veredicto, y el plazo cuando aún no se puede dar

    private var sujeto: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: 6) {
                Text(veredicto.frase)
                    .scaledFont(44, weight: .heavy, relativeTo: .largeTitle, italic: true)
                    .foregroundStyle(Self.tono(veredicto.clase))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let plazo = veredicto.plazo {
                    PlazoDeSemanas(llevas: plazo.llevas, hacen: plazo.hacen)
                        .frame(maxWidth: 180)
                }
            }
            if let salida = ProgresoDeCarrera.salidaDeLaPantalla(cobertura) {
                Button {
                    Haptics.light()
                    onSalida?()
                } label: {
                    Text(salida)
                        .scaledFont(14, weight: .heavy, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.accentOn)
                        .padding(.horizontal, Theme.Spacing.l)
                        .padding(.vertical, 10)
                        .background(Theme.Color.accent)
                        .clipShape(Capsule())
                }
                .buttonStyle(PressScaleStyle())
            }
        }
    }

    /// EL TINTE ES EL VEREDICTO, como en la referencia lo es la zona de pulso.
    /// «Cargando de más» es aviso, no alarma: el rojo se reserva para lo que hay
    /// que atender hoy.
    static func tono(_ c: ClaseVeredicto) -> Color {
        switch c {
        case .mejor: return Theme.Color.ok
        case .igual: return Theme.Color.foreground
        case .cargando, .peor: return Theme.Color.warning
        case .aunNo: return Theme.Color.muted
        }
    }

    // MARK: - LO QUE SALE · el efecto

    private var loQueSale: some View {
        VStack(alignment: .leading, spacing: Self.dentro) {
            BloqueDeLectura(etiqueta: "Forma") {
                if modo(.forma) == .da {
                    if let vo2 = h.vo2 {
                        CifraDeBloque(valor: Formato.esDecimal(vo2.valor, decimals: 0),
                                      unidad: "VO₂máx", tam: 54) {
                            if let delta = vo2.delta {
                                DeltaDeBloque(mejor: delta == 0 ? nil : delta > 0,
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
                    marca(.forma, pie: "Ritmo a \(h.ppmReferencia) \(Vocab.ppm)")
                } else if modo(.forma) == .apagada {
                    LecturaApagada(alto: 124)
                }
            }

            BloqueDeLectura(etiqueta: "Mejores esfuerzos") {
                if let cinco = h.esfuerzos.first(where: { $0.metros == 5000 }) {
                    // Menor que los demás titulares: a 44 pt la mono abre tanto los
                    // dos puntos que «19:12» se lee «19 : 12», y aquí el sujeto del
                    // bloque es la CURVA — la cifra la acompaña.
                    CifraDeBloque(valor: Formato.clock(cinco.segundos), unidad: "5 km", tam: 36) {
                        if let d = progreso.deltas.esfuerzos {
                            DeltaDeBloque(mejor: d.ganaS > 0,
                                          valor: "\(Int(abs(d.ganaS).rounded())) s",
                                          ventana: "1 mes")
                        }
                    }
                }
                CurvaDeEsfuerzos(hoy: h.esfuerzos, antes: h.esfuerzosAntes)
                marca(.esfuerzos, pie: nil)
            }
        }
    }

    // MARK: - LO QUE METES · el trabajo

    private var loQueMetes: some View {
        VStack(alignment: .leading, spacing: Self.dentro) {
            BloqueDeLectura(etiqueta: "Cuánto corres") {
                if let ultima = h.semanasKm.last {
                    CifraDeBloque(valor: Formato.esDecimal(ultima.valor, decimals: 0),
                                  unidad: "km", tam: 44) {
                        if let d = progreso.deltas.volumen {
                            // NO JUZGA: subir kilómetros no es bueno ni malo por sí
                            // mismo, así que la flecha va neutra. De cruzarlo con el
                            // ritmo ya se encarga el veredicto de arriba.
                            let pct = Int((d.subidaRatio * 100).rounded())
                            DeltaDeBloque(mejor: nil,
                                          valor: "\(pct > 0 ? "+" : "")\(pct) %",
                                          ventana: "\(d.semanas) sem")
                        }
                    }
                }
                BarrasSemanales(puntos: h.semanasKm)
                marca(.volumen, pie: nil)
            }

            BloqueDeLectura(etiqueta: "Suave y fuerte") {
                if modo(.reparto) == .da, let pct = progreso.polarization.pct {
                    CifraDeBloque(valor: "\(pct.low)", unidad: "% suave", tam: 44)
                    BarraDeReparto(segmentos: segmentosDeZona,
                                   objetivoSuave: Double(progreso.polarization.target.low))
                } else if modo(.reparto) == .apagada {
                    LecturaApagada(alto: 72)
                }
            }
        }
    }

    /// Las cinco zonas más el hueco sin pulso, en porcentaje del tiempo corriendo.
    /// Sale de los segundos servidos: el plegado a bandas ya lo hizo el servidor y
    /// esto es solo el reparto crudo que la barra necesita dibujar.
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

    // MARK: - LO QUE TE PIDEN · un punto por repetición

    @ViewBuilder
    private var pedido: some View {
        if modo(.pedido) == .da, let p = h.pedido, let pct = p.pctEnBanda {
            BloqueDeLectura(etiqueta: "Lo que te piden", sello: true) {
                // EL JUICIO ES EL COLOR, y quién puede juzgarlo lo decide el
                // servidor: con pocas repeticiones la cifra existe y no concluye,
                // así que sale en tinta normal.
                CifraDeBloque(valor: "\(Int(pct.rounded()))", unidad: "% en banda", tam: 44,
                              tono: p.juzgable
                                ? (pct >= progreso.method.goodInBandPct
                                   ? Theme.Color.ok : Theme.Color.warning)
                                : Theme.Color.foreground)
                PuntosDePedido(dentro: p.dentro, lento: p.fueraLento, rapido: p.fueraRapido)
            }
        }
    }

    // MARK: - TU CARRERA — existe si hay carrera, o si hay algo que decir de
    // correr cansado. Si no hay ninguna de las dos, no hay bloque: la app se calla.

    @ViewBuilder
    private var carreraYCansado: some View {
        if h.carrera != nil || modo(.cansado) != .nada {
            VStack(alignment: .leading, spacing: Self.dentro) {
                if let c = h.carrera {
                    BloqueDeLectura(etiqueta: c.nombre) {
                        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.xl) {
                            CifraDeBloque(valor: "\(c.dias)", unidad: "días", tam: 44)
                            if let previsto = c.predichoS {
                                CifraDeBloque(valor: Formato.clock(previsto), unidad: "previsto",
                                              tam: 30, tono: Self.tono(veredicto.clase))
                            }
                        }
                    }
                }
                if modo(.cansado) == .da, let ultimo = h.cansado.last {
                    BloqueDeLectura(etiqueta: "Correr cansado", sello: true) {
                        let mejora = progreso.deltas.cansado?.mejoraSKm
                        CifraDeBloque(valor: Formato.esDecimal(ultimo.costeSKm),
                                      unidad: "s/km de más", tam: 44,
                                      tono: (mejora ?? 0) > 0 ? Theme.Color.ok : Theme.Color.warning) {
                            if let d = progreso.deltas.cansado {
                                DeltaDeBloque(mejor: d.mejoraSKm > 0,
                                              valor: Formato.esDecimal(abs(d.mejoraSKm)),
                                              ventana: "\(d.semanas) sem")
                            }
                        }
                        LineaDeProgreso(
                            puntos: h.cansado.map { PuntoSemana(semana: $0.semana, valor: $0.costeSKm) },
                            alto: 128,
                            formato: { Formato.esDecimal($0) }
                        )
                    }
                } else if modo(.cansado) == .apagada {
                    BloqueDeLectura(etiqueta: "Correr cansado", sello: true) {
                        LecturaApagada(alto: 88)
                    }
                }
            }
        }
    }

    // MARK: - La marca: en qué se apoya el veredicto

    /// EL NÚMERO QUE SOSTIENE EL VEREDICTO SE DIBUJA DEBAJO. La marca cuelga del
    /// gráfico en el que se apoya —y solo de ese—, para que el atleta pueda
    /// COMPROBAR la afirmación en vez de fiarse de ella.
    ///
    /// EL PIE DEL BLOQUE GANA CUANDO EXISTE, y no es un orden arbitrario: el único
    /// bloque con pie propio es Forma, y su pie («Ritmo a 148 ppm») ya nombra
    /// exactamente la misma evidencia que nombraría la marca de ese peldaño.
    /// Escribir las dos sería decir dos veces lo mismo en una pantalla cuyo
    /// presupuesto de palabras es contable. Donde no hay pie —los esfuerzos, las
    /// barras— la marca sale, que es justo donde hacía falta.
    @ViewBuilder
    private func marca(_ soporteDelBloque: ProgresoDeCarrera.Soporte, pie: String?) -> some View {
        let propia = soporte == soporteDelBloque
            ? veredicto.peldano.map(ProgresoDeCarrera.textoDeMarca) : nil
        if let texto = pie ?? propia {
            Text(texto)
                .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
        }
    }
}

// MARK: - Las piezas — etiqueta, cifra, delta. Ninguna dibuja una caja.

/// Un bloque: su etiqueta en versalita diminuta y lo que venga debajo. Sin caja,
/// sin raya y sin fondo — lo que separa un bloque del siguiente es el aire.
struct BloqueDeLectura<Contenido: View>: View {
    let etiqueta: String
    var sello: Bool = false
    @ViewBuilder var contenido: Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                Text(etiqueta)
                    .font(Theme.Typography.readoutLabel)
                    .uppercaseTracked(1.98)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
                if sello {
                    // Sin acento: lo único naranja de la pantalla es la acción.
                    Text("Solo aquí")
                        .scaledFont(9.5, weight: .semibold, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
            contenido
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// El titular de un bloque: cifra grande, unidad pequeña al lado, y el delta
/// colgando debajo. La cifra es mono y tabular; la unidad, sans.
struct CifraDeBloque<Delta: View>: View {
    let valor: String
    let unidad: String
    var tam: CGFloat = 44
    var tono: Color = Theme.Color.foreground
    @ViewBuilder var delta: Delta

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                Text(valor)
                    .font(.system(size: tam, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(tono)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(unidad)
                    .scaledFont(12, weight: .semibold, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            }
            delta
        }
    }
}

extension CifraDeBloque where Delta == EmptyView {
    init(valor: String, unidad: String, tam: CGFloat = 44, tono: Color = Theme.Color.foreground) {
        self.init(valor: valor, unidad: unidad, tam: tam, tono: tono) { EmptyView() }
    }
}

/// La variación y su ventana. Nunca una oración: una flecha, un número y cuánto
/// abarca. `mejor` nulo = no juzga (el volumen no es bueno ni malo por subir).
struct DeltaDeBloque: View {
    let mejor: Bool?
    let valor: String
    let ventana: String

    var body: some View {
        HStack(spacing: 4) {
            if let mejor {
                Image(systemName: mejor ? "arrow.up" : "arrow.down")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(mejor ? Theme.Color.ok : Theme.Color.warning)
            }
            Text(valor)
                .font(.system(size: 12, weight: .bold, design: .monospaced).monospacedDigit())
                .foregroundStyle(mejor == nil ? Theme.Color.muted
                                 : (mejor! ? Theme.Color.ok : Theme.Color.warning))
            // La ventana SIEMPRE apagada, aunque la cifra vaya teñida: es el
            // contexto del dato, no el dato.
            Text(ventana)
                .scaledFont(10.5, weight: .medium, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
        }
    }
}
