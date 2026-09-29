import SwiftUI

// LA SESIÓN, PINTADA — «¿qué pasó en esa sesión?»: el sujeto es su CARGA (lo que pesó, contra lo planificado, y de qué peldaño sale),
// y debajo, tramo a tramo, lo pedido frente a lo hecho con la carga de cada uno; después las curvas de la sesión, los parciales, las
// zonas y lo que el atleta dijo al cerrar. `LecturaDeSesion` decide; esto pinta, con el kit de la pestaña.

struct AnaliticasCuerpoDeSesion: View {
    let lectura: LecturaDeSesion
    /// Ancho útil del lienzo.
    let ancho: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: AnaliticasPortadaCuerpo.entreSecciones) {
            sujeto
            tramos
            ritmo
            pulso
            parciales
            zonas
            loQueDijiste
        }
    }

    // MARK: El sujeto: la carga

    private var sujeto: some View {
        let s = lectura.sujeto
        return SujetoDia(tono: .neutro, etiqueta: etiquetaDelSujeto) {
            HStack(alignment: .center, spacing: Theme.Spacing.m) {
                HStack(spacing: 10) {
                    AnaliticasPuntoFamilia(familia: s.familia, talla: 12)
                    Text("Carga de la sesión").papel(.notaPesada).foregroundStyle(TonoDia.neutro.papeles.tinta)
                }
                Spacer(minLength: Theme.Spacing.s)
                if let a = s.ancla { AnaliticasChipAncla(ancla: a) }
            }
            .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
            HStack(alignment: .lastTextBaseline, spacing: 10) {
                if let tss = s.tss {
                    Text(AnaliticasFormato.entero(tss)).papel(.sujeto).foregroundStyle(TonoDia.neutro.papeles.tinta)
                } else {
                    Text("No se sabe").papel(.sujeto).foregroundStyle(TonoDia.neutro.papeles.tinta).lineLimit(2).minimumScaleFactor(0.6)
                }
                Text(subtitulo(s)).papel(.cuerpoFuerte).foregroundStyle(TonoDia.neutro.papeles.tinta).fixedSize(horizontal: false, vertical: true)
            }
        } abajo: {
            if let r = s.resumen { ApoyoDia(r) }
            if let aviso = s.avisoSinSaber { ApoyoDia(aviso) }
        }
    }

    /// «de 68 planificados · por ritmo» · «sin plan · por pulso».
    private func subtitulo(_ s: SujetoDeSesion) -> String {
        let plan = s.plan.map { "de \(AnaliticasFormato.entero($0)) planificados" } ?? "sin plan"
        guard let p = s.peldano?.nombre, s.tss != nil else { return plan }
        return "\(plan) · por \(p)"
    }

    private var etiquetaDelSujeto: String {
        let s = lectura.sujeto
        guard let tss = s.tss else { return "Carga de la sesión: no se sabe" }
        return "Carga de la sesión: \(AnaliticasFormato.entero(tss)), \(subtitulo(s))"
    }

    // MARK: Tramo a tramo

    @ViewBuilder
    private var tramos: some View {
        if !lectura.tramos.isEmpty {
            AnaliticasSeccion(titulo: "Tramo a tramo", pregunta: lectura.preguntaDeTramos) {
                AnaliticasSuperficie(padding: 0) {
                    VStack(spacing: 0) {
                        ForEach(Array(lectura.tramos.enumerated()), id: \.element.id) { i, t in
                            if i > 0 { Rectangle().fill(Theme.Color.hairline).frame(height: 1) }
                            AnaliticasFilaDeTramo(tramo: t)
                        }
                    }
                }
                AnaliticasNota(texto: "A la derecha, la carga de cada tramo y de dónde sale (potencia › ritmo › pulso › esfuerzo: gana el primer peldaño con dato). «?» = ese tramo no tiene peldaño y cuenta contra la cobertura, nunca como cero.")
                if let resto = lectura.notaDelResto { AnaliticasNota(texto: resto) }
            }
        }
    }

    // MARK: Curvas

    @ViewBuilder
    private var ritmo: some View {
        if lectura.ritmo.count >= 2 {
            AnaliticasSeccion(titulo: "Ritmo", pregunta: "A lo largo de la sesión · arriba es más rápido") {
                AnaliticasSuperficie {
                    AnaliticasLineaTiempo(
                        etiqueta: "Ritmo a lo largo de la sesión", puntos: lectura.ritmo, duracion: lectura.duracionDeLasCurvas,
                        formato: { AnaliticasFormato.formatear($0, .sKm) }, invertido: true
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var pulso: some View {
        if lectura.pulso.count >= 2 {
            AnaliticasSeccion(titulo: "Pulso", pregunta: "A lo largo de la sesión") {
                AnaliticasSuperficie {
                    AnaliticasLineaTiempo(
                        etiqueta: "Pulso a lo largo de la sesión", puntos: lectura.pulso, duracion: lectura.duracionDeLasCurvas,
                        formato: { AnaliticasFormato.formatear($0, .bpm) }
                    )
                }
            }
        }
    }

    // MARK: Parciales y zonas

    @ViewBuilder
    private var parciales: some View {
        if !lectura.parciales.isEmpty {
            AnaliticasSeccion(titulo: "Parciales", pregunta: "Por kilómetro") {
                AnaliticasSuperficie {
                    AnaliticasBarrasSimples(
                        filas: lectura.parciales.map { FilaDeBarra(id: "\($0.id)", etiqueta: $0.etiqueta, valor: $0.segundos, destacada: $0.destacado) },
                        formato: { Formato.clock($0) }
                    )
                }
                AnaliticasNota(texto: "El más rápido y el más lento van en tinta; los demás, atenuados.")
            }
        }
    }

    @ViewBuilder
    private var zonas: some View {
        if !lectura.zonas.isEmpty {
            AnaliticasSeccion(titulo: "Zonas", pregunta: "Dónde estuvo tu pulso") {
                AnaliticasSuperficie {
                    AnaliticasBarraReparto(partes: lectura.zonas.map {
                        TramoDeBarra(code: "z\($0.zona)", etiqueta: $0.etiqueta, pct: $0.pct, color: Theme.Color.zona($0.zona, de: 5))
                    })
                }
            }
        }
    }

    // MARK: Lo que dijiste

    @ViewBuilder
    private var loQueDijiste: some View {
        if lectura.rpe != nil || lectura.duracionS != nil {
            AnaliticasSeccion(titulo: "Lo que dijiste", pregunta: lectura.rpe != nil ? "Tu esfuerzo al cerrar" : "Sin esfuerzo declarado") {
                AnaliticasRejilla {
                    if let rpe = lectura.rpe { AnaliticasCelda(etiqueta: "Esfuerzo (RPE)", valor: rpe, unidad: .rpe, nota: "de 10") }
                    if let d = lectura.duracionS { AnaliticasCelda(etiqueta: "Duración", valor: d, unidad: .segundos) }
                }
                if lectura.rpe == nil {
                    AnaliticasNota(texto: "Sin RPE al cerrar: si un tramo no tiene ritmo, vatios ni pulso, su carga no se sabe.")
                }
            }
        }
    }
}

// MARK: - Una fila de «Tramo a tramo»

/// La marca, el nombre, lo pedido y lo hecho, y a la derecha la carga del tramo con su peldaño. Un tramo sin peldaño enseña «?».
struct AnaliticasFilaDeTramo: View {
    let tramo: FilaDeTramoVista

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AnaliticasMarcaCumplimiento(marca: tramo.marca).padding(.top, 2)
            VStack(alignment: .leading, spacing: 3) {
                AnaliticasCuerpo(texto: tramo.nombre, fuerte: true)
                if let p = tramo.pedido { AnaliticasEtiqueta(texto: "Pedido: \(p)") }
                if let h = tramo.hecho { AnaliticasCuerpo(texto: h) }
                if tramo.marca == .masDeLoPedido || tramo.marca == .menosDeLoPedido { AnaliticasEtiqueta(texto: tramo.marca.palabra) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 2) {
                if let tss = tramo.carga.tss {
                    AnaliticasNumeral(texto: AnaliticasFormato.entero(tss), talla: .fila)
                    if let p = tramo.carga.peldano { AnaliticasEtiqueta(texto: p) }
                } else {
                    AnaliticasNumeral(texto: "?", talla: .fila, tono: Theme.Color.muted)
                    AnaliticasEtiqueta(texto: "no se sabe")
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(etiquetaAccesible)
    }

    private var etiquetaAccesible: String {
        var partes = [tramo.nombre]
        if let p = tramo.pedido { partes.append("pedido \(p)") }
        if let h = tramo.hecho { partes.append("hecho \(h)") }
        if tramo.marca != .sinPlan && tramo.marca != .sinComprobar { partes.append(tramo.marca.palabra) }
        if let tss = tramo.carga.tss { partes.append("carga \(AnaliticasFormato.entero(tss))\(tramo.carga.peldano.map { " por \($0)" } ?? "")") } else { partes.append("carga: no se sabe") }
        return partes.joined(separator: ", ")
    }
}
