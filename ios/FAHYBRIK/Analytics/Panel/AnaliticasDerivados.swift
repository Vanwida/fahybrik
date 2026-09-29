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
            series.append(SerieDeLinea(id: "forma", etiqueta: forma.tituloEs, puntos: s.puntos, color: Theme.Color.foreground, proyeccion: s.plan, rotuloFinal: true))
        }
        if let fatiga = lectura(p.bloques.forma, "carga.reciente"), let s = fatiga.serie, s.paso == .dia {
            series.append(SerieDeLinea(id: "fatiga", etiqueta: fatiga.tituloEs, puntos: s.puntos, color: Theme.Color.muted, proyeccion: s.plan))
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
                                color: porGrande.count == 1 && f == .otro ? Theme.Color.foreground : f.color)
                },
                enCurso: i == semanas.count - 1 && t <= p.hoy
            )
        }
    }

    /// Los cubos de HORAS: el servidor sirve las horas por semana en total (no por
    /// familia), así que la barra es una sola parte con el plan en contorno.
    static func cubosHoras(_ p: PanelAnaliticas, agrupar: Int) -> [CuboDeColumna] {
        guard let l = lectura(p.bloques.semanas, "semanas.horas"), let s = l.serie else { return [] }
        return cubosDeSerie(s, color: Theme.Color.foreground, hoy: p.hoy, agrupar: agrupar)
    }

    /// Los cubos de UNA serie semanal (las horas de la semana, los metros de un ergo, el tonelaje de fuerza): una sola parte
    /// «Hecho» y, si la serie trae plan, su contorno. Una semana sin dato es un hueco (no se pinta barra), nunca un cero.
    static func cubosDeSerie(_ s: SerieDeLectura, color: Color, hoy: String, agrupar: Int) -> [CuboDeColumna] {
        guard s.paso == .semana else { return [] }
        let puntos = AnaliticasEscala.agrupar(s.puntos, agrupar)
        let plan = s.plan.map { AnaliticasEscala.agrupar($0, agrupar) }
        return puntos.enumerated().map { i, q in
            CuboDeColumna(t: q.t, plan: plan.flatMap { i < $0.count ? $0[i].v : nil },
                          partes: [ParteDeCubo(code: "hecho", etiqueta: "Hecho", valor: q.v ?? 0, color: color)],
                          enCurso: i == puntos.count - 1 && q.t <= hoy)
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
                                color: sonZonas ? Theme.Color.zona(k + 1, de: series.count) : FamiliaGrande(l.familia).color)
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
            return TramoDeBarra(code: p.code, etiqueta: p.etiquetaEs, pct: p.pct ?? 0, color: Theme.Color.zona(zona, de: n == 3 ? 5 : n))
        }
    }

    /// El cumplimiento por sesión (`semanas.cumplimiento`): cuántas de cada color,
    /// en la barra, sin las partes vacías. Verde cumplida, ámbar desviada, rojo
    /// fuera de banda o sin hacer, y en gris lo hecho sin medida y lo hecho sin plan.
    static func partesDeCumplimiento(_ l: LecturaAnalitica) -> [TramoDeBarra] {
        guard let r = l.reparto, r.esProporcional else { return [] }
        typealias S = IdsDelPanel.SesionCumplida
        return r.partes.compactMap { p in
            guard let pct = p.pct, pct > 0 else { return nil }
            let color: Color
            switch p.code {
            case S.cumplida: color = Theme.Color.ok
            case S.desviada: color = Theme.Color.warning
            case S.fuera, S.noHecha: color = Theme.Color.danger
            case S.hechaSinMedida: color = Theme.Color.muted
            default: color = Theme.Color.neutral
            }
            return TramoDeBarra(code: p.code, etiqueta: p.etiquetaEs, pct: pct, color: color)
        }
    }

    struct ResumenDeSesiones: Equatable {
        /// Sesiones del plan que ya tocaban.
        let total: Int
        let hechas: Int
        /// Las que quedaron dentro de lo pedido.
        let dentro: Int
        let sinPlan: Int

        /// «3 de 4 sesiones hechas · 2 dentro de lo pedido · 1 sin plan».
        var texto: String {
            var t = "\(hechas) de \(total) \(total == 1 ? "sesión hecha" : "sesiones hechas") · \(dentro) dentro de lo pedido"
            if sinPlan > 0 { t += " · \(sinPlan) sin plan" }
            return t
        }
    }

    /// «3 de 4 hechas · 2 dentro de lo pedido · 1 sin plan», del reparto servido.
    static func resumenDeSesiones(_ l: LecturaAnalitica) -> ResumenDeSesiones? {
        guard let r = l.reparto, !r.partes.isEmpty else { return nil }
        typealias S = IdsDelPanel.SesionCumplida
        func n(_ code: String) -> Int { Int((r.partes.first { $0.code == code }?.valor ?? 0).rounded()) }
        let sinPlan = n(S.sinPlan)
        let hechas = n(S.cumplida) + n(S.desviada) + n(S.fuera) + n(S.hechaSinMedida)
        let total = hechas + n(S.noHecha)
        guard total > 0 || sinPlan > 0 else { return nil }
        return ResumenDeSesiones(total: total, hechas: hechas, dentro: n(S.cumplida), sinPlan: sinPlan)
    }

    /// El nombre con que se pinta una lectura: el título servido, salvo la disposición.
    static func etiqueta(de l: LecturaAnalitica) -> String {
        l.id == IdsDelPanel.readiness ? IdsDelPanel.etiquetaDeReadiness : l.tituloEs
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

    // MARK: - El veredicto de forma, en una frase (solo palabras del servidor)

    /// Lo que el servidor dice de la forma, listo para escribirse. La palabra de la frescura y la subida
    /// con su veredicto las dice el servidor con las bandas del coach; aquí se enlazan, no se juzgan.
    enum VeredictoDeForma: Equatable {
        /// Hay palabra: la subida de forma en una frase («La forma sube 2,1 por semana · subida sostenible»)
        /// y, si el servidor la trae, la razón añadida («un 12 % de esta carga sale de un umbral estimado»).
        case dicho(detalle: String?, extra: String?)
        /// La palabra se ha retirado: por qué no se dice (poca carga calculada, o falta el dato).
        case retirado(motivo: String)

        /// Una sola frase, con el punto final: el apoyo bajo la palabra de hoy.
        var frase: String? {
            switch self {
            case .dicho(let detalle, let extra):
                let partes = [detalle.map { $0.hasSuffix(".") ? $0 : $0 + "." }, extra].compactMap { $0 }
                return partes.isEmpty ? nil : partes.joined(separator: " ")
            case .retirado(let motivo):
                return motivo
            }
        }
    }

    /// El veredicto de forma del panel. Nulo mientras la forma arranca en frío (`historia`): entonces manda
    /// el plazo del hueco, no una frase sobre una curva que aún no dice nada.
    static func veredictoDeForma(_ p: PanelAnaliticas) -> VeredictoDeForma? {
        let frescura = lectura(p.bloques.forma, "carga.frescura")
        let subida = lectura(p.bloques.forma, "carga.subida")
        let cobertura = lectura(p.bloques.forma, "carga.cobertura")
        guard let frescura, frescura.estado == .medida else { return nil }
        guard let v = frescura.veredicto else {
            if case .historia? = frescura.cobertura.falta { return nil }
            if let pct = cobertura?.dato?.valor, let minimo = p.metodo.coberturaVeredictoMinPct {
                return .retirado(motivo: "Solo el \(Int(pct.rounded())) % de tu carga se ha podido calcular; la palabra de hoy necesita el \(Int(minimo.rounded())) %.")
            }
            return .retirado(motivo: "Falta carga calculada para decir cómo estás.")
        }
        var detalle: String? = nil
        if let s = subida?.dato?.valor {
            let n = Formato.esDecimal(abs(s))
            let verbo = s >= 0.05 ? "sube \(n)" : s <= -0.05 ? "baja \(n)" : "no se mueve"
            var frase = "La forma \(verbo) por semana"
            if let sv = subida?.veredicto?.etiquetaEs { frase += " · \(sv.lowercased())" }
            detalle = frase
        }
        return .dicho(detalle: detalle, extra: v.fraseEs)
    }
}
