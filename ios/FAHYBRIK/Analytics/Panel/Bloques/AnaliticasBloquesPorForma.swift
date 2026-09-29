import SwiftUI

// INTENSIDAD, PROGRESO, RÉCORDS, CARRERA Y RECUPERACIÓN — lo que el panel sirve
// hoy, pintado lectura a lectura por id (`IdsDelPanel`) y forma del dato. Una
// lectura o una falta que este binario no conoce no se pinta; nada se calcula aquí.

private typealias C = AnaliticasColor

/// Medidas de lienzo de los bloques de esta hoja.
private enum Lienzo {
    /// Lo que la superficie de una gráfica le quita al ancho útil (margen y aire).
    static let margenDeGrafico: CGFloat = 60
    /// Lo que una celda le quita al ancho útil para dibujar su chispa a lo ancho.
    static let margenDeCelda: CGFloat = 68
    /// Una chispa cuando la celda comparte fila con otra.
    static let chispaEnColumna: CGFloat = 120
    static let altoDeChispa: CGFloat = 40
    static let altoDeColumnas: CGFloat = 190
    /// Cuántos récords caben en la portada antes de mandar al detalle.
    static let recordsVisibles = 5
    /// Cuántos tramos se nombran en «donde más te falta».
    static let tramosVisibles = 3
    /// Lecturas mínimas con valor para que una serie sea una línea.
    static let puntosDeLinea = 2
}

private extension SerieDeLectura {
    var tieneLinea: Bool { puntos.compactMap(\.v).count >= Lienzo.puntosDeLinea }
}

// MARK: - 4 · Intensidad

struct AnaliticasBloqueIntensidad: View {
    let ctx: ContextoDeBloque

    var body: some View {
        let lecturas = ctx.lecturas(.intensidad)
        let zonas = lecturas.filter { IdsDelPanel.esZonaSemanal($0.id) }
        let semanal = zonas.first { $0.serie?.paso == .semana }?.serie
        let agrupar = AnaliticasEscala.agrupacion(puntos: semanal?.puntos.count ?? 0, ancho: ctx.ancho - Lienzo.margenDeGrafico)
        let cubos = AnaliticasDerivados.cubosApilados(zonas, hoy: ctx.hoy, agrupar: agrupar)
        let polarizacion = AnaliticasDerivados.lectura(lecturas, IdsDelPanel.polarizacion)
        let zonasEstimadas = lecturas.contains { $0.estado == .medida && $0.procedencia.ancla == .estimada }

        AnaliticasSeccion(titulo: BloqueDelPanel.intensidad.titulo, pregunta: BloqueDelPanel.intensidad.pregunta, onAbrir: { ctx.onAbrir(.bloque(.intensidad)) }) {
            AnaliticasHuecoDeBloque(ctx: ctx, bloque: .intensidad)
            if !cubos.isEmpty {
                AnaliticasSuperficie {
                    AnaliticasGraficoColumnas(cubos: cubos, leyenda: AnaliticasDerivados.leyenda(de: cubos),
                                              formatoY: { AnaliticasFormato.formatear($0, semanal?.unidad ?? .horas) }, alto: Lienzo.altoDeColumnas)
                }
            }
            if let polarizacion { polarizacionVista(polarizacion) }
            if zonasEstimadas {
                VStack(alignment: .leading, spacing: 10) {
                    AnaliticasNota(texto: "Zonas estimadas desde tu pulso máximo declarado: con el test de zonas pasan a medidas y la carga sube de fiabilidad.")
                    AnaliticasBoton(texto: "Hacer el test de zonas", secundario: true) { ctx.onSalida(.tests) }
                }
            }
        }
    }

    @ViewBuilder
    private func polarizacionVista(_ l: LecturaAnalitica) -> some View {
        if l.estado == .medida, let r = l.reparto, r.esProporcional {
            VStack(alignment: .leading, spacing: 10) {
                AnaliticasEtiqueta(texto: "Reparto · \(AnaliticasFormato.formatear(r.total, r.unidad)) con pulso")
                AnaliticasBarraReparto(partes: AnaliticasDerivados.partesDeReparto(l), objetivo: objetivoDelCoach(l))
                if let v = l.veredicto {
                    AnaliticasCuerpo(texto: v.etiquetaEs, fuerte: true)
                    if let frase = v.fraseEs { AnaliticasNota(texto: frase) }
                }
            }
        } else if !ctx.lecturas(.intensidad).conDato.isEmpty {
            AnaliticasNotaDeFalta(ctx: ctx, bloque: .intensidad, lectura: l)
        }
    }

    private func objetivoDelCoach(_ l: LecturaAnalitica) -> (pct: Double, etiqueta: String)? {
        guard let r = l.dato?.referencia, r.de == IdsDelPanel.referenciaObjetivoCoach else { return nil }
        return (r.valor, "tu coach pide \(Int(r.valor.rounded())) % suave")
    }
}

// MARK: - 5 · Progreso: una fila por familia

struct AnaliticasBloqueProgreso: View {
    let ctx: ContextoDeBloque

    var body: some View {
        let lecturas = ctx.lecturas(.progreso).filter { $0.forma != .muda }
        let hayHueco = ctx.pendiente(.progreso) || ctx.estado(.progreso) != .lleno
        let sinFilas = ctx.pendiente(.progreso) || ctx.estado(.progreso) == .vacio
        AnaliticasSeccion(titulo: BloqueDelPanel.progreso.titulo, pregunta: BloqueDelPanel.progreso.pregunta) {
            if hayHueco { AnaliticasHuecoDeBloque(ctx: ctx, bloque: .progreso) }
            if !sinFilas && !lecturas.isEmpty {
                VStack(spacing: 0) {
                    ForEach(lecturas) { fila($0) }
                }
            }
        }
    }

    private func fila(_ l: LecturaAnalitica) -> some View {
        let abrir: (() -> Void)? = {
            guard l.estado == .medida, let f = l.familia else { return nil }
            return { ctx.onAbrir(.familia(f)) }
        }()
        return AnaliticasFilaProgreso(
            familia: l.familia, metrica: AnaliticasDerivados.metricaDeProgreso(l), valor: l.dato?.valor, unidad: l.dato?.unidad ?? .segundos,
            delta: AnaliticasDerivados.delta(de: l), tendencia: l.serie?.puntos, nota: nota(l), onAbrir: abrir
        )
    }

    private func nota(_ l: LecturaAnalitica) -> String? {
        guard let falta = l.cobertura.falta else { return nil }
        if l.estado == .sinDato, case .historia(let llevas, _) = falta, llevas == 0 {
            return "Todavía nada · con tu primera sesión sale aquí"
        }
        return AnaliticasEstados.notaDeFalta(falta, bloque: .progreso, hoy: ctx.hoy)
    }
}

// MARK: - 6 · Récords

struct AnaliticasBloqueRecords: View {
    let ctx: ContextoDeBloque

    var body: some View {
        let lecturas = ctx.lecturas(.records).conDato
        let nuevos = lecturas.filter { $0.veredicto?.code == IdsDelPanel.veredictoRecordNuevo }.count
        let pregunta = lecturas.isEmpty
            ? BloqueDelPanel.records.pregunta
            : "\(lecturas.count) marcas" + (nuevos > 0 ? " · \(nuevos) nueva\(nuevos > 1 ? "s" : "") en esta ventana" : "")
        AnaliticasSeccion(titulo: BloqueDelPanel.records.titulo, pregunta: pregunta,
                          onAbrir: lecturas.count > Lienzo.recordsVisibles ? { ctx.onAbrir(.bloque(.records)) } : nil) {
            AnaliticasHuecoDeBloque(ctx: ctx, bloque: .records)
            if !lecturas.isEmpty {
                VStack(spacing: 0) {
                    ForEach(lecturas.prefix(Lienzo.recordsVisibles)) { fila($0) }
                }
            }
        }
    }

    @ViewBuilder
    private func fila(_ l: LecturaAnalitica) -> some View {
        if let dato = l.dato {
            AnaliticasFilaRecord(
                familia: l.familia, prueba: l.tituloEs, valor: dato.valor, unidad: dato.unidad,
                fecha: AnaliticasDerivados.ultimoDeLaSerie(l), anterior: AnaliticasDerivados.recordAnterior(l), ancla: l.procedencia.ancla,
                nuevo: l.veredicto?.code == IdsDelPanel.veredictoRecordNuevo, hoy: ctx.hoy
            )
        }
    }
}

// MARK: - 7 · Carrera

struct AnaliticasBloqueCarrera: View {
    let ctx: ContextoDeBloque

    var body: some View {
        let lecturas = ctx.lecturas(.carrera)
        let objetivo = AnaliticasDerivados.lectura(lecturas, IdsDelPanel.carreraObjetivo).flatMap { $0.estado == .medida ? $0 : nil }
        let disposicion = AnaliticasDerivados.lectura(lecturas, IdsDelPanel.carreraDisposicion)
        let prevision = AnaliticasDerivados.lectura(lecturas, IdsDelPanel.carreraPrevision).flatMap { $0.estado == .medida ? $0 : nil }
        let tramos = AnaliticasDerivados.lecturas(lecturas, prefijo: IdsDelPanel.prefijoTramo)

        AnaliticasSeccion(titulo: BloqueDelPanel.carrera.titulo, pregunta: pregunta(objetivo),
                          onAbrir: objetivo != nil ? { ctx.onAbrir(.bloque(.carrera)) } : nil) {
            AnaliticasHuecoDeBloque(ctx: ctx, bloque: .carrera)
            if let prevision { previsionVista(prevision) }
            if prevision != nil || !tramos.conDato.isEmpty { huecoPorTramo(tramos) }
            if let disposicion, objetivo != nil { disposicionVista(disposicion) }
        }
    }

    private func pregunta(_ objetivo: LecturaAnalitica?) -> String {
        guard let objetivo, let d = objetivo.dato else { return BloqueDelPanel.carrera.pregunta }
        let n = Int(d.valor.rounded())
        let fecha = AnaliticasFechas.sumarDias(ctx.hoy, n).map { AnaliticasFormato.fechaLegible($0, hoy: ctx.hoy) }
        return [objetivo.tituloEs, fecha, AnaliticasFormato.enDias(n)].compactMap { $0 }.joined(separator: " · ")
    }

    @ViewBuilder
    private func previsionVista(_ l: LecturaAnalitica) -> some View {
        if let d = l.dato {
            let rango = d.rango.map { "entre \(AnaliticasFormato.formatear($0.bajo, d.unidad)) y \(AnaliticasFormato.formatear($0.alto, d.unidad))" }
            let nota = [rango, d.referencia == nil ? "sin objetivo de tiempo" : nil].compactMap { $0 }.joined(separator: " · ")
            AnaliticasCelda(etiqueta: l.tituloEs, valor: d.valor, unidad: d.unidad, delta: AnaliticasDerivados.delta(de: l),
                            nota: nota.isEmpty ? nil : nota) {
                if let s = l.serie, s.tieneLinea {
                    VStack(alignment: .leading, spacing: 4) {
                        AnaliticasEtiqueta(texto: "cómo se ha movido la previsión en la ventana (abajo es mejor)")
                        AnaliticasChispa(puntos: s.puntos, ancho: ctx.ancho - Lienzo.margenDeCelda, alto: Lienzo.altoDeChispa)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func huecoPorTramo(_ tramos: [LecturaAnalitica]) -> some View {
        let conObjetivo = tramos.conDato.filter { $0.dato?.referencia?.de == IdsDelPanel.referenciaPresupuestoTramo }
        let filas = conObjetivo.compactMap { l -> FilaDeHueco? in
            l.dato?.referencia.map { FilaDeHueco(id: l.id, etiqueta: l.tituloEs, valor: $0.delta) }
        }
        .sorted { ($0.valor ?? 0) > ($1.valor ?? 0) }
        VStack(alignment: .leading, spacing: 8) {
            if filas.isEmpty {
                AnaliticasNota(texto: "Pon un objetivo de tiempo a tu carrera y verás cuánto te falta en cada tramo.")
            } else {
                AnaliticasEtiqueta(texto: "Donde más te falta · frente a tu objetivo por tramo")
                AnaliticasBarrasHueco(filas: Array(filas.prefix(Lienzo.tramosVisibles)), formato: { AnaliticasFormato.formatearDelta($0, .segundos) })
            }
            if let cobertura = coberturaDeMarcas(tramos) { AnaliticasNota(texto: cobertura) }
        }
    }

    private func coberturaDeMarcas(_ tramos: [LecturaAnalitica]) -> String? {
        let conDato = tramos.conDato
        guard !conDato.isEmpty else { return nil }
        let propias = conDato.filter(\.procedencia.medida).count
        let base = "\(propias) de \(conDato.count) \(conDato.count == 1 ? "tramo" : "tramos") con marca propia"
        return propias < conDato.count ? base + " · el resto se estima con lo que ya tienes" : base
    }

    @ViewBuilder
    private func disposicionVista(_ l: LecturaAnalitica) -> some View {
        if l.estado == .medida, let d = l.dato {
            AnaliticasCelda(etiqueta: l.tituloEs, valor: d.valor, unidad: d.unidad, delta: AnaliticasDerivados.delta(de: l)) {
                if let s = l.serie, s.tieneLinea {
                    AnaliticasChispa(puntos: s.puntos, ancho: ctx.ancho - Lienzo.margenDeCelda, alto: Lienzo.altoDeChispa,
                                     banda: AnaliticasDerivados.banda(de: s))
                }
            }
        } else if !ctx.lecturas(.carrera).conDato.isEmpty {
            AnaliticasNotaDeFalta(ctx: ctx, bloque: .carrera, lectura: l)
        }
    }
}

// MARK: - 8 · Recuperación

struct AnaliticasBloqueRecuperacion: View {
    let ctx: ContextoDeBloque
    private let porFila = 2

    var body: some View {
        let lecturas = ctx.lecturas(.recuperacion)
        let conDato = lecturas.conDato
        AnaliticasSeccion(titulo: BloqueDelPanel.recuperacion.titulo, pregunta: BloqueDelPanel.recuperacion.pregunta) {
            AnaliticasHuecoDeBloque(ctx: ctx, bloque: .recuperacion)
            if !conDato.isEmpty {
                VStack(spacing: AnaliticasTokens.hueco - 2) {
                    ForEach(Array(stride(from: 0, to: conDato.count, by: porFila)), id: \.self) { i in
                        let fila = Array(conDato[i..<min(i + porFila, conDato.count)])
                        AnaliticasFilaDeCeldas {
                            ForEach(fila) { celda($0, enColumna: fila.count > 1) }
                        }
                    }
                }
                ForEach(lecturas.filter { $0.estado == .sinDato }) { AnaliticasNotaDeFalta(ctx: ctx, bloque: .recuperacion, lectura: $0) }
                AnaliticasNota(texto: notaDeBasal)
            }
        }
    }

    private var notaDeBasal: String {
        let dias = ctx.metodo.basalDias.map { " de los últimos \($0) días" } ?? ""
        return "Cada cifra contra tu basal\(dias). La banda gris de cada gráfica es tu basal."
    }

    @ViewBuilder
    private func celda(_ l: LecturaAnalitica, enColumna: Bool) -> some View {
        if let d = l.dato {
            let atrasado = AnaliticasEstados.esDatoAtrasado(l)
            let nota = atrasado
                ? AnaliticasDerivados.ultimoDeLaSerie(l).map { "Último dato del \(AnaliticasFormato.fechaLegible($0, hoy: ctx.hoy))" }
                : nil
            AnaliticasCelda(etiqueta: AnaliticasDerivados.etiqueta(de: l), valor: d.valor, unidad: d.unidad,
                            delta: atrasado ? nil : AnaliticasDerivados.delta(de: l), nota: nota) {
                if let s = l.serie, s.tieneLinea {
                    AnaliticasChispa(puntos: s.puntos, ancho: enColumna ? Lienzo.chispaEnColumna : ctx.ancho - Lienzo.margenDeCelda,
                                     banda: AnaliticasDerivados.banda(de: s))
                }
            }
        }
    }
}
