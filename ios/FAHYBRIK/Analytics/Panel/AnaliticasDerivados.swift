import SwiftUI

// LOS DERIVADOS DE VISTA — lo que un pintor necesita del panel y no viene listo
// en el contrato (espejo de `kit-analiticas/derivados.ts`): los cubos de una
// barra apilada, las series de una línea, el delta ya interpretado, las celdas
// del Estado. Viven aquí y no en los bloques para que el iPhone dibuje LO
// MISMO desde el mismo JSON que el panel del coach (A1). Puro: nada de aquí
// escribe prosa de hueco (eso es `AnaliticasEstados`) ni aplica un umbral.

enum AnaliticasDerivados {

    static func lectura(_ ls: [LecturaAnalitica], _ id: String) -> LecturaAnalitica? { ls.first { $0.id == id } }

    /// Las lecturas con un prefijo de id, en el orden en que llegan.
    static func lecturas(_ ls: [LecturaAnalitica], prefijo: String) -> [LecturaAnalitica] { ls.filter { $0.id.hasPrefix(prefijo) } }

    // MARK: - El delta ya interpretado (A3)

    /// Contra el periodo anterior si la lectura se compara; si no, contra su
    /// referencia (el basal, el objetivo, el aviso del coach). Nulo cuando no hay
    /// contra qué: un número suelto se pinta solo.
    static func delta(de l: LecturaAnalitica) -> DeltaVista? {
        guard let dato = l.dato else { return nil }
        if let c = l.comparacion, let delta = c.delta {
            return DeltaVista(delta: delta, unidad: c.unidad, significativo: c.significativo,
                              etiqueta: AnaliticasFormato.etiquetaPeriodo(c.periodo),
                              mejor: AnaliticasFormato.menosEsMejor(dato.unidad) ? delta < 0 : delta > 0)
        }
        if let r = dato.referencia {
            return DeltaVista(delta: r.delta, unidad: dato.unidad, significativo: nil,
                              etiqueta: AnaliticasFormato.etiquetaReferencia(r, dato.unidad),
                              mejor: AnaliticasFormato.menosEsMejor(dato.unidad) ? r.delta < 0 : r.delta > 0)
        }
        return nil
    }

    // MARK: - Forma y fatiga: las series de la línea y las marcas

    static func seriesForma(_ p: PanelAnaliticas) -> (series: [SerieDeLinea], marcas: [MarcaVertical]) {
        var series: [SerieDeLinea] = []
        if let forma = lectura(p.bloques.forma, "carga.fondo"), let s = forma.serie, s.paso == .dia {
            series.append(SerieDeLinea(id: "forma", etiqueta: forma.tituloEs, puntos: s.puntos, color: AnaliticasColor.tinta, proyeccion: s.plan, rotuloFinal: true))
        }
        if let fatiga = lectura(p.bloques.forma, "carga.reciente"), let s = fatiga.serie, s.paso == .dia {
            series.append(SerieDeLinea(id: "fatiga", etiqueta: fatiga.tituloEs, puntos: s.puntos, color: AnaliticasColor.tinta2, proyeccion: s.plan))
        }
        return (series, marcasDeProyeccion(p, series: series))
    }

    /// «hoy» separa lo hecho de lo previsto; la carrera cierra la proyección.
    static func marcasDeProyeccion(_ p: PanelAnaliticas, series: [SerieDeLinea]) -> [MarcaVertical] {
        let proyecciones = series.compactMap(\.proyeccion).filter { !$0.isEmpty }
        guard !proyecciones.isEmpty else { return [] }
        var marcas = [MarcaVertical(t: p.hoy, etiqueta: "hoy", tipo: .hoy)]
        if let ultimo = proyecciones.compactMap({ $0.last?.t }).max() {
            marcas.append(MarcaVertical(t: ultimo, etiqueta: nombreCarrera(p) ?? AnaliticasFechas.corta(ultimo), tipo: .evento))
        }
        return marcas
    }

    /// El nombre de la carrera objetivo, si el bloque de carrera lo trae (una
    /// lectura en DÍAS cuyo título es la carrera). Nulo hasta que se sirva.
    static func nombreCarrera(_ p: PanelAnaliticas) -> String? {
        p.bloques.carrera.first { $0.dato?.unidad == .dias }?.tituloEs
    }

    /// La frescura del bloque de forma: lo hecho y lo previsto.
    static func frescura(_ p: PanelAnaliticas) -> (puntos: [PuntoDeSerie], proyeccion: [PuntoDeSerie]?)? {
        guard let l = lectura(p.bloques.forma, "carga.frescura"), let s = l.serie, s.paso == .dia else { return nil }
        return (s.puntos, s.plan)
    }

    // MARK: - Semana a semana: cubos con plan (contorno) y hecho (apilado por familia)

    /// Los cubos de CARGA por familia grande, con el plan total en contorno.
    /// `agrupar` suma semanas de n en n cuando no caben legibles.
    static func cubosCarga(_ p: PanelAnaliticas, agrupar: Int) -> [CuboDeColumna] {
        let porFamilia = lecturas(p.bloques.semanas, prefijo: "semanas.carga.").filter { $0.familia != nil && $0.serie != nil }
        let total = lectura(p.bloques.semanas, "semanas.carga")
        let base = porFamilia.first?.serie ?? total?.serie
        guard let base, base.paso == .semana else { return [] }
        let semanas = AnaliticasEscala.agrupar(base.puntos, agrupar).map(\.t)
        let plan = total?.serie?.plan.map { AnaliticasEscala.agrupar($0, agrupar) }

        var porGrande: [FamiliaGrande: [Double?]] = [:]
        for l in porFamilia {
            guard let s = l.serie else { continue }
            let g = FamiliaGrande(l.familia)
            let puntos = AnaliticasEscala.agrupar(s.puntos, agrupar).map(\.v)
            let previo = porGrande[g] ?? Array(repeating: nil, count: puntos.count)
            porGrande[g] = zip(previo, puntos).map { a, b in (a == nil && b == nil) ? nil : (a ?? 0) + (b ?? 0) }
        }
        // Sin lecturas por familia (un servidor viejo), la carga total en una sola parte.
        if porGrande.isEmpty, let s = total?.serie {
            porGrande[.otro] = AnaliticasEscala.agrupar(s.puntos, agrupar).map(\.v)
        }
        let familias = FamiliaGrande.ordenApilado.filter { porGrande[$0] != nil }
        return semanas.enumerated().map { i, t in
            CuboDeColumna(
                t: t,
                plan: plan.flatMap { i < $0.count ? $0[i].v : nil },
                partes: familias.map { f in
                    ParteDeCubo(code: f.rawValue, etiqueta: porGrande.count == 1 && f == .otro ? "Hecho" : f.nombre,
                                valor: (porGrande[f].flatMap { i < $0.count ? $0[i] : nil }) ?? 0,
                                color: porGrande.count == 1 && f == .otro ? AnaliticasColor.hecho : AnaliticasColor.familia(f))
                },
                enCurso: i == semanas.count - 1 && t <= p.hoy
            )
        }
    }

    /// Los cubos de HORAS: el servidor sirve las horas por semana en total (no por
    /// familia), así que la barra es una sola parte con el plan en contorno.
    static func cubosHoras(_ p: PanelAnaliticas, agrupar: Int) -> [CuboDeColumna] {
        guard let l = lectura(p.bloques.semanas, "semanas.horas"), let s = l.serie, s.paso == .semana else { return [] }
        let puntos = AnaliticasEscala.agrupar(s.puntos, agrupar)
        let plan = s.plan.map { AnaliticasEscala.agrupar($0, agrupar) }
        return puntos.enumerated().map { i, q in
            CuboDeColumna(t: q.t, plan: plan.flatMap { i < $0.count ? $0[i].v : nil },
                          partes: [ParteDeCubo(code: "hecho", etiqueta: "Hecho", valor: q.v ?? 0, color: AnaliticasColor.hecho)],
                          enCurso: i == puntos.count - 1 && q.t <= p.hoy)
        }
    }

    static func leyenda(de cubos: [CuboDeColumna]) -> [ItemDeLeyenda] {
        guard let primero = cubos.first else { return [] }
        return primero.partes.map { ItemDeLeyenda(etiqueta: $0.etiqueta, muestra: .relleno, color: $0.color) }
    }

    // MARK: - Cubos por FORMA (zonas o cualquier bloque con varias series semanales)

    /// Varias lecturas con serie semanal → una parte por lectura, apiladas en el
    /// orden en que llegan. El color: el espectro de zonas del coach si el título
    /// es «Z1…ZN»; si no, el de la familia de la lectura.
    static func cubosApilados(_ lecturas: [LecturaAnalitica], hoy: String, agrupar: Int) -> [CuboDeColumna] {
        let series = lecturas.filter { $0.serie?.paso == .semana && $0.estado == .medida }
        guard let base = series.first?.serie else { return [] }
        let semanas = AnaliticasEscala.agrupar(base.puntos, agrupar).map(\.t)
        let sonZonas = series.allSatisfy { $0.tituloEs.hasPrefix("Z") }
        let agrupadas = series.map { AnaliticasEscala.agrupar($0.serie!.puntos, agrupar) }
        return semanas.enumerated().map { i, t in
            CuboDeColumna(
                t: t,
                plan: nil,
                partes: series.enumerated().map { k, l in
                    ParteDeCubo(code: l.id, etiqueta: l.tituloEs, valor: i < agrupadas[k].count ? (agrupadas[k][i].v ?? 0) : 0,
                                color: sonZonas ? AnaliticasColor.zona(k + 1, de: series.count) : AnaliticasColor.familia(l.familia))
                },
                enCurso: i == semanas.count - 1 && t <= hoy
            )
        }
    }

    /// Un reparto proporcional → las partes de la barra al 100 %. Tres partes se
    /// leen como suave · media · dura (Z1, Z3, Z5 del espectro, plegado).
    static func partesDeReparto(_ l: LecturaAnalitica) -> [TramoDeBarra] {
        guard let r = l.reparto, r.esProporcional else { return [] }
        let n = r.partes.count
        return r.partes.enumerated().map { i, p in
            let zona = n == 3 ? [1, 3, 5][i] : i + 1
            return TramoDeBarra(code: p.code, etiqueta: p.etiquetaEs, pct: p.pct ?? 0, color: AnaliticasColor.zona(zona, de: n == 3 ? 5 : n))
        }
    }

    /// La métrica de una fila de Progreso: el título servido sin el nombre de la
    /// familia que ya encabeza la fila («Fuerza · Sentadilla» → «Sentadilla»).
    static func metricaDeProgreso(_ l: LecturaAnalitica) -> String {
        guard let nombre = l.familia?.nombre, !nombre.isEmpty else { return l.tituloEs }
        let prefijo = "\(nombre) · "
        if l.tituloEs.hasPrefix(prefijo) { return String(l.tituloEs.dropFirst(prefijo.count)) }
        return l.tituloEs == nombre ? "marca clave" : l.tituloEs
    }

    /// La marca anterior de un récord: la referencia que el servidor llama `record_anterior`.
    static func recordAnterior(_ l: LecturaAnalitica) -> Double? {
        guard let r = l.dato?.referencia, r.de == IdsDelPanel.referenciaRecordAnterior else { return nil }
        return r.valor
    }

    /// El día del último punto con valor de la serie de una lectura: de cuándo es
    /// un número que ya no es de hoy.
    static func ultimoDeLaSerie(_ l: LecturaAnalitica?) -> String? {
        l?.serie?.puntos.last(where: { $0.v != nil })?.t
    }

    /// La banda del basal de una serie: dos referencias (mínimo y máximo) en unidades reales.
    static func banda(de s: SerieDeLectura) -> (lo: Double, hi: Double)? {
        guard let refs = s.referencias, refs.count >= 2 else { return nil }
        let vals = refs.map(\.valor)
        return (vals.min()!, vals.max()!)
    }

    // MARK: - El Estado fijo

    struct Estado: Equatable {
        let palabra: String?
        let sinPalabra: String
        let celdas: [CeldaDeEstado]
        let nota: String?
    }

    /// La palabra la pone el servidor con las bandas del coach (el veredicto de
    /// la frescura); iOS pinta, no calcula. Las celdas que EXISTEN, y solo esas.
    static func estado(_ p: PanelAnaliticas, estadoBloque: EstadoBloque) -> Estado {
        let ls = p.bloques.estado
        let forma = lectura(ls, "estado.forma"), fatiga = lectura(ls, "estado.fatiga")
        let frescura = lectura(ls, "estado.frescura"), readiness = lectura(ls, "estado.readiness")
        let palabra = frescura?.veredicto?.etiquetaEs

        var celdas: [CeldaDeEstado] = []
        var nota: String? = nil
        var sinPalabra = "Sin carga todavía"
        let plazo = AnaliticasEstados.plazoDeHistoria(.estado, [forma].compactMap { $0 })

        if estadoBloque == .vacio {
            nota = "Con tu primer entreno aparecen aquí tu forma, tu fatiga y tu frescura."
        } else if let plazo, plazo.llevas > 0 {
            // Arranque en frío: la forma y la frescura suben por pura aritmética;
            // solo la fatiga (la ventana corta) dice algo. Se dibuja el plazo.
            sinPalabra = "Todavía es pronto"
            nota = "Forma y frescura a partir de la semana \(plazo.hacen) · llevas \(plazo.llevas)"
            if let v = fatiga?.dato?.valor { celdas.append(CeldaDeEstado(etiqueta: fatiga!.tituloEs, valor: v)) }
        } else {
            if palabra == nil { sinPalabra = "Sin veredicto" }
            if let v = forma?.dato?.valor { celdas.append(CeldaDeEstado(etiqueta: forma!.tituloEs, valor: v)) }
            if let v = fatiga?.dato?.valor { celdas.append(CeldaDeEstado(etiqueta: fatiga!.tituloEs, valor: v)) }
            if let v = frescura?.dato?.valor { celdas.append(CeldaDeEstado(etiqueta: frescura!.tituloEs, valor: v, signo: true)) }
            if estadoBloque == .viejo, let ultimo = AnaliticasEstados.ultimoDato([forma, fatiga, frescura].compactMap { $0 }) {
                nota = "Sin entrenar desde el \(AnaliticasFormato.fechaLegible(ultimo, hoy: p.hoy)) · la fatiga ya cayó y la forma baja un poco cada día"
            }
        }
        if let r = readiness, let v = r.dato?.valor {
            // La palabra de la disposición la pone el servidor (su veredicto); si el
            // dato no es de hoy, se dice de cuándo es.
            var palabraR = r.veredicto?.etiquetaEs
            if palabraR == nil, r.cobertura.diasConDato == 0 {
                palabraR = ultimoDeLaSerie(lectura(p.bloques.recuperacion, IdsDelPanel.readiness)).map { "del \(AnaliticasFechas.corta($0))" } ?? "no es de hoy"
            }
            celdas.append(CeldaDeEstado(etiqueta: r.tituloEs, valor: v, palabra: palabraR))
        }
        return Estado(palabra: palabra, sinPalabra: sinPalabra, celdas: celdas, nota: nota)
    }

    // MARK: - El veredicto de forma, en una frase (solo palabras del servidor)

    /// La palabra de la frescura, la subida con su veredicto y la frase de la
    /// procedencia estimada: todo lo dice el servidor; aquí se enlaza.
    static func fraseDeForma(_ p: PanelAnaliticas) -> (texto: String, fuerte: Bool)? {
        let frescura = lectura(p.bloques.forma, "carga.frescura")
        let subida = lectura(p.bloques.forma, "carga.subida")
        let cobertura = lectura(p.bloques.forma, "carga.cobertura")
        guard let frescura, frescura.estado == .medida else { return nil }
        guard let v = frescura.veredicto else {
            if case .historia? = frescura.cobertura.falta { return nil }
            var texto = "Sin veredicto"
            if let pct = cobertura?.dato?.valor, let minimo = p.metodo.coberturaVeredictoMinPct {
                texto += ": solo el \(Int(pct.rounded())) % de tu carga se ha podido calcular; el veredicto necesita el \(Int(minimo.rounded())) %."
            } else {
                texto += ": falta carga calculada para decir si vas a más."
            }
            return (texto, false)
        }
        var partes = [v.etiquetaEs]
        if let s = subida?.dato?.valor {
            let n = Formato.esDecimal(abs(s))
            let verbo = s >= 0.05 ? "sube \(n)" : s <= -0.05 ? "baja \(n)" : "no se mueve"
            var frase = "la forma \(verbo) por semana"
            if let sv = subida?.veredicto?.etiquetaEs { frase += " · \(sv.lowercased())" }
            partes.append(frase)
        }
        var texto = partes.joined(separator: ": ") + "."
        if let extra = v.fraseEs { texto += " " + extra }
        return (texto, true)
    }
}
