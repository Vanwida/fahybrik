import SwiftUI

// 4–8 · INTENSIDAD, PROGRESO, RÉCORDS, CARRERA, RECUPERACIÓN — los bloques que
// el servidor todavía declara pendientes. Hoy pintan su «muy pronto»; en cuanto
// lleguen lecturas se pintan POR FORMA (la promesa de `Lecturas.swift`: una
// lectura nueva aparece sola, sin tocar Swift):
//
//   · varias series semanales      → columnas apiladas (zonas por el espectro
//                                     del coach si se llaman Z1…ZN; si no, por familia)
//   · un reparto proporcional      → la barra al 100 % con el objetivo del coach
//                                     (la referencia del dato)
//   · una lectura con familia      → una fila de progreso (cifra, delta, chispa)
//   · una cifra con fecha          → una fila de récord (antes X · Nuevo si lo dice
//                                     su veredicto)
//   · una cifra con referencia     → una barra de hueco (positivo = te falta)
//   · una cifra con serie diaria   → una celda con su chispa y su banda basal
//
// La segunda tanda afina cada uno cuando su contrato se cierre.

private typealias C = AnaliticasColor

// MARK: - 4 · Intensidad

struct AnaliticasBloqueIntensidad: View {
    let ctx: ContextoDeBloque

    var body: some View {
        let lecturas = ctx.lecturas(.intensidad)
        let n = lecturas.first { $0.serie?.paso == .semana }?.serie?.puntos.count ?? 0
        let cubos = AnaliticasDerivados.cubosApilados(lecturas, hoy: ctx.hoy, agrupar: AnaliticasEscala.agrupacion(puntos: n, ancho: ctx.ancho - 60))
        let reparto = lecturas.first { $0.reparto?.esProporcional == true }
        let zonasEstimadas = lecturas.contains { $0.estado == .medida && $0.procedencia.ancla == .estimada }

        AnaliticasSeccion(titulo: BloqueDelPanel.intensidad.titulo, pregunta: BloqueDelPanel.intensidad.pregunta, onAbrir: { ctx.onAbrir(.bloque(.intensidad)) }) {
            AnaliticasHuecoDeBloque(ctx: ctx, bloque: .intensidad)
            if !cubos.isEmpty {
                let unidad = lecturas.first { $0.serie?.paso == .semana }?.serie?.unidad ?? .horas
                AnaliticasSuperficie {
                    AnaliticasGraficoColumnas(cubos: cubos, leyenda: AnaliticasDerivados.leyenda(de: cubos),
                                              formatoY: { AnaliticasFormato.formatear($0, unidad) }, alto: 190)
                }
            }
            if let reparto, let r = reparto.reparto {
                VStack(alignment: .leading, spacing: 10) {
                    AnaliticasEtiqueta(texto: "Reparto · \(AnaliticasFormato.formatear(r.total, r.unidad)) con pulso")
                    let objetivo = reparto.dato?.referencia.map { (pct: $0.valor, etiqueta: "tu coach pide \(Int($0.valor.rounded())) % suave") }
                    AnaliticasBarraReparto(partes: AnaliticasDerivados.partesDeReparto(reparto), objetivo: objetivo)
                }
            }
            if zonasEstimadas {
                VStack(alignment: .leading, spacing: 10) {
                    AnaliticasNota(texto: "Zonas estimadas desde tu pulso máximo declarado: con el test de zonas pasan a medidas y la carga sube de fiabilidad.")
                    AnaliticasBoton(texto: "Hacer el test de zonas", secundario: true) { ctx.onSalida(.testsDeZonas) }
                }
            }
        }
    }
}

// MARK: - 5 · Progreso: una fila por familia

struct AnaliticasBloqueProgreso: View {
    let ctx: ContextoDeBloque

    var body: some View {
        let lecturas = ctx.lecturas(.progreso).filter { $0.familia != nil && $0.forma != .muda }
        AnaliticasSeccion(titulo: BloqueDelPanel.progreso.titulo, pregunta: BloqueDelPanel.progreso.pregunta) {
            if ctx.pendiente(.progreso) || ctx.estado(.progreso) == .vacio || ctx.estado(.progreso) == .viejo {
                AnaliticasHuecoDeBloque(ctx: ctx, bloque: .progreso)
            }
            if !lecturas.isEmpty {
                VStack(spacing: 0) {
                    ForEach(lecturas) { l in
                        let nota: String? = l.estado == .sinDato
                            ? "Todavía nada · con la primera sesión sale tu \(l.tituloEs.lowercased())"
                            : (ctx.metodo.muestrasMinimas.flatMap { l.cobertura.muestras < $0 ? "\(l.cobertura.muestras) de \($0) sesiones para la tendencia" : nil })
                        AnaliticasFilaProgreso(
                            familia: l.familia, metrica: l.tituloEs, valor: l.dato?.valor, unidad: l.dato?.unidad ?? .segundos,
                            delta: AnaliticasDerivados.delta(de: l), tendencia: l.serie?.puntos, nota: nota,
                            onAbrir: l.estado == .medida ? { if let f = l.familia { ctx.onAbrir(.familia(f)) } } : nil
                        )
                    }
                }
            }
        }
    }
}

// MARK: - 6 · Récords

struct AnaliticasBloqueRecords: View {
    let ctx: ContextoDeBloque
    var max: Int = 5

    var body: some View {
        let lecturas = ctx.lecturas(.records).conDato
        let nuevos = lecturas.filter { $0.veredicto?.code == "nuevo" }.count
        let pregunta = lecturas.isEmpty
            ? BloqueDelPanel.records.pregunta
            : "\(lecturas.count) marcas" + (nuevos > 0 ? " · \(nuevos) nueva\(nuevos > 1 ? "s" : "") en esta ventana" : "")
        AnaliticasSeccion(titulo: BloqueDelPanel.records.titulo, pregunta: pregunta,
                          onAbrir: lecturas.count > max ? { ctx.onAbrir(.bloque(.records)) } : nil) {
            AnaliticasHuecoDeBloque(ctx: ctx, bloque: .records)
            if !lecturas.isEmpty {
                VStack(spacing: 0) {
                    ForEach(lecturas.prefix(max)) { l in
                        AnaliticasFilaRecord(
                            familia: l.familia, prueba: l.tituloEs, valor: l.dato!.valor, unidad: l.dato!.unidad,
                            fecha: l.cobertura.ultimoDato, anterior: l.comparacion?.anterior, ancla: l.procedencia.ancla,
                            nuevo: l.veredicto?.code == "nuevo", hoy: ctx.hoy
                        )
                    }
                }
            }
        }
    }
}

// MARK: - 7 · Carrera

struct AnaliticasBloqueCarrera: View {
    let ctx: ContextoDeBloque

    var body: some View {
        let lecturas = ctx.lecturas(.carrera).conDato
        let dias = lecturas.first { $0.dato?.unidad == .dias }
        let previsto = lecturas.first { $0.dato?.unidad == .segundos && $0.serie != nil && $0.familia == nil }
        let tramos = lecturas.filter { $0.dato?.unidad == .segundos && $0.serie == nil && $0.dato?.referencia != nil }
        let pregunta: String = {
            guard let dias, let d = dias.dato else { return BloqueDelPanel.carrera.pregunta }
            let n = Int(d.valor.rounded())
            let fecha = AnaliticasFechas.sumarDias(ctx.hoy, n).map { AnaliticasFormato.fechaLegible($0, hoy: ctx.hoy) }
            return [dias.tituloEs, fecha, AnaliticasFormato.enDias(n)].compactMap { $0 }.joined(separator: " · ")
        }()

        AnaliticasSeccion(titulo: BloqueDelPanel.carrera.titulo, pregunta: pregunta,
                          onAbrir: previsto != nil ? { ctx.onAbrir(.bloque(.carrera)) } : nil) {
            AnaliticasHuecoDeBloque(ctx: ctx, bloque: .carrera)
            if let previsto, let d = previsto.dato {
                AnaliticasCelda(etiqueta: previsto.tituloEs, valor: d.valor, unidad: d.unidad,
                                delta: AnaliticasDerivados.delta(de: previsto),
                                nota: d.referencia == nil ? "sin objetivo de tiempo" : nil) {
                    if let s = previsto.serie, s.puntos.compactMap(\.v).count >= 2 {
                        VStack(alignment: .leading, spacing: 4) {
                            AnaliticasEtiqueta(texto: "cómo se ha movido la previsión en la ventana (abajo es mejor)")
                            AnaliticasChispa(puntos: s.puntos, ancho: ctx.ancho - 68, alto: 40)
                        }
                    }
                }
            }
            if !tramos.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    AnaliticasEtiqueta(texto: "Donde más te falta · frente a tu objetivo por tramo")
                    let filas = tramos.compactMap { l -> FilaDeHueco? in
                        guard let r = l.dato?.referencia else { return nil }
                        return FilaDeHueco(id: l.id, etiqueta: l.tituloEs, valor: r.delta)
                    }
                    .sorted { ($0.valor ?? 0) > ($1.valor ?? 0) }
                    AnaliticasBarrasHueco(filas: Array(filas.prefix(3)), formato: { AnaliticasFormato.formatearDelta($0, .segundos) })
                }
            }
        }
    }
}

// MARK: - 8 · Recuperación

struct AnaliticasBloqueRecuperacion: View {
    let ctx: ContextoDeBloque

    var body: some View {
        let lecturas = ctx.lecturas(.recuperacion).conDato
        AnaliticasSeccion(titulo: BloqueDelPanel.recuperacion.titulo, pregunta: BloqueDelPanel.recuperacion.pregunta) {
            AnaliticasHuecoDeBloque(ctx: ctx, bloque: .recuperacion)
            if !lecturas.isEmpty {
                VStack(spacing: AnaliticasTokens.hueco - 2) {
                    ForEach(Array(stride(from: 0, to: lecturas.count, by: 2)), id: \.self) { i in
                        let fila = Array(lecturas[i..<min(i + 2, lecturas.count)])
                        AnaliticasFilaDeCeldas {
                            ForEach(fila) { l in
                                celda(l, ancho: fila.count == 1 ? ctx.ancho - 28 : 120)
                            }
                        }
                    }
                }
                let reciente = ctx.metodo.recienteDias, basal = ctx.metodo.ventanaBasalDias ?? ctx.metodo.basalDias
                AnaliticasNota(texto: [
                    reciente.map { "Media de las últimas \($0) noches" } ?? "Lo reciente",
                    basal.map { "contra tu basal de \($0) días." } ?? "contra tu basal.",
                    "La banda gris de cada gráfica es tu basal.",
                ].joined(separator: " "))
            }
        }
    }

    private func celda(_ l: LecturaAnalitica, ancho: CGFloat) -> some View {
        AnaliticasCelda(etiqueta: l.tituloEs, valor: l.dato!.valor, unidad: l.dato!.unidad, delta: AnaliticasDerivados.delta(de: l)) {
            if let s = l.serie, s.puntos.compactMap(\.v).count >= 2 {
                AnaliticasChispa(puntos: s.puntos, ancho: ancho, banda: AnaliticasDerivados.banda(de: s))
            }
        }
    }
}
