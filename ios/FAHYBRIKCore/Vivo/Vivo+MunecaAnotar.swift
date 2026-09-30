import Foundation

// ANOTAR EN EL PROPIO DESCANSO — la serie recién hecha se declara sin salir de la
// fase común (P8/P11; espejo de `screens/reloj-fuerza/descanso.tsx` y del estado de
// `vivo.tsx`). Todo lo que decide qué se ve y qué pasa al tocar vive aquí, puro:
//
//   columnas  (una serie) reps · kg · RIR como tres datos que se tocan; el tocado se
//             enciende (naranja = control activo) y la corona lo gira. Gris = propuesto,
//             «sin confirmar»; blanco = declarado.
//   lista     (superserie) una píldora por serie de la ronda; tocarla abre sus columnas.
//   resumen   todo declarado: vuelve el descanso común con la serie en una línea que
//             se puede reabrir.
//
// La regla de honestidad es la de siempre (`Vivo.anotacionDe`): lo propuesto (lo
// prescrito, la carga de la serie anterior) NO cuenta como declarado hasta que el
// atleta lo confirma o lo gira. Quien lleva el motor (el reloj en solitario, el móvil
// en espejo) recibe cada `Declaracion` y la aplica: aquí no se toca ningún motor.

extension Vivo {

    // MARK: - Lo que la muñeca conserva

    /// Lo que el atleta tiene abierto en un descanso. Se olvida solo al cambiar de paso.
    struct UiAnotar: Equatable {
        var paso: String? = nil
        /// La serie abierta en columnas (índice en las series del descanso).
        var abierta: Int? = nil
        var foco: CampoAnotar? = nil
        /// Reabrir la lista de una ronda ya anotada.
        var lista = false
    }

    /// Lo declarado (lo único que se guarda), lo que midió el reloj y lo que está abierto.
    struct AnotarMuneca: Equatable {
        var registro: Registro = [:]
        var ui = UiAnotar()
        /// Lo que contó el sensor de cada serie cerrada (reps), por id de paso: `medido`, no propuesto.
        var medidas: [String: MedidaSerie] = [:]

        // MARK: - Resolver la vista

        private func uiDelPaso(_ id: String) -> UiAnotar { ui.paso == id ? ui : UiAnotar() }

        /// El descanso `e.i` como anotación, o `nil` si no hay serie de reps que anotar (una plancha, un
        /// descanso tras una estación): ahí el descanso es el común de siempre.
        func descansoQueAnota(_ e: EstadoVivo) -> DescansoQueAnota? {
            guard e.paso.rol == .descanso else { return nil }
            let series: [SerieAnotableMuneca] = Vivo.seriesDelDescanso(e.pasos, e.i).compactMap { j in
                Vivo.anotacionDe(e.pasos, j, registro, medida: medidas[e.pasos[j].id]).map { SerieAnotableMuneca(paso: e.pasos[j], anot: $0) }
            }
            guard !series.isEmpty else { return nil }
            let u = uiDelPaso(e.paso.id)
            let pendientes = series.filter { Vivo.pendiente($0.anot) }.count
            let vista: VistaAnotar = u.abierta != nil ? .columnas : u.lista ? .lista : pendientes == 0 ? .resumen : series.count == 1 ? .columnas : .lista
            let abierta = vista == .columnas ? Swift.min(u.abierta ?? 0, series.count - 1) : nil
            return DescansoQueAnota(vista: vista, series: series, abierta: abierta, foco: vista == .columnas ? u.foco : nil,
                                    pasoAbierto: abierta.flatMap { k in e.pasos.firstIndex { $0.id == series[k].paso.id } })
        }

        /// ¿Hay un dato encendido? Con él la corona es del dato y la pila se queda en una página.
        func coronaEnfocada(_ e: EstadoVivo) -> CampoAnotar? { descansoQueAnota(e)?.foco }

        // MARK: - Los gestos (cada uno devuelve el efecto, si lo hay)

        /// Tocar una serie de la lista la abre en columnas.
        mutating func abrir(_ k: Int, _ e: EstadoVivo) {
            guard descansoQueAnota(e)?.series.indices.contains(k) == true else { return }
            ui = UiAnotar(paso: e.paso.id, abierta: k, foco: nil, lista: false)
        }

        /// Tocar un dato lo enciende; tocarlo otra vez lo apaga.
        mutating func enfocar(_ campo: CampoAnotar, _ e: EstadoVivo) {
            guard let d = descansoQueAnota(e), d.vista == .columnas else { return }
            let nuevo: CampoAnotar? = d.foco == campo ? nil : campo
            ui = UiAnotar(paso: e.paso.id, abierta: d.abierta ?? 0, foco: nuevo, lista: false)
        }

        /// La corona con un dato encendido: `dir` = +1 sube el dato, −1 lo baja. El dato pasa a DECLARADO.
        mutating func girar(_ dir: Int, _ e: EstadoVivo) -> Declaracion? {
            guard let d = descansoQueAnota(e), let campo = d.foco, let k = d.abierta else { return nil }
            let s = d.series[k]
            let dato: Dato?
            switch campo {
            case .reps: dato = s.anot.reps
            case .kg: dato = s.anot.kg
            case .esfuerzo: dato = s.anot.esfuerzo
            }
            guard let dato else { return nil }
            let nuevo = Vivo.girar(s.paso, campo: campo, actual: dato.valor, dir: dir)
            var r = registro[s.paso.id] ?? Declarado()
            switch campo {
            case .reps: r.reps = nuevo
            case .kg: r.kg = nuevo
            case .esfuerzo: r.esfuerzo = nuevo
            }
            registro[s.paso.id] = r
            return Declaracion(paso: s.paso.id, campo: campo, valor: nuevo, cascada: campo == .kg)
        }

        /// Confirmar: lo que se ve pasa a declarado, en la serie abierta o en toda la ronda.
        mutating func confirmar(_ e: EstadoVivo) -> [Declaracion] {
            guard let d = descansoQueAnota(e) else { return [] }
            let alcance = d.vista == .columnas ? d.abierta.map { [d.series[$0]] } ?? d.series : d.series
            var out: [Declaracion] = []
            for s in alcance {
                registro = Vivo.confirmar(registro, s.paso.id, s.anot)
                if let v = s.anot.reps.valor { out.append(Declaracion(paso: s.paso.id, campo: .reps, valor: v)) }
                if let v = s.anot.kg?.valor { out.append(Declaracion(paso: s.paso.id, campo: .kg, valor: v)) }
                if let v = s.anot.esfuerzo?.valor { out.append(Declaracion(paso: s.paso.id, campo: .esfuerzo, valor: v)) }
            }
            let quedan = d.vista == .columnas && d.series.count > 1
                && d.series.enumerated().contains { $0.offset != d.abierta && Vivo.pendiente($0.element.anot) }
            ui = quedan ? UiAnotar(paso: e.paso.id, abierta: nil, foco: nil, lista: true) : UiAnotar()
            return out
        }

        /// Reabrir una ronda ya anotada: la lista si hay varias series, las columnas si es una.
        mutating func reabrir(_ e: EstadoVivo) {
            guard let d = descansoQueAnota(e) else { return }
            ui = d.series.count > 1 ? UiAnotar(paso: e.paso.id, abierta: nil, foco: nil, lista: true)
                : UiAnotar(paso: e.paso.id, abierta: 0, foco: nil, lista: false)
        }
    }

    /// UN dato declarado: el efecto que quien lleva el motor aplica (solo → `WorkoutSession`; espejo → cable).
    struct Declaracion: Equatable, Codable {
        var paso: String
        var campo: CampoAnotar
        var valor: Double
        /// La carga que se GIRA con la corona la heredan las series pendientes de detrás; la que se confirma, no.
        var cascada = false

        init(paso: String, campo: CampoAnotar, valor: Double, cascada: Bool = false) {
            self.paso = paso
            self.campo = campo
            self.valor = valor
            self.cascada = cascada
        }

        /// Un móvil o un reloj de otra versión puede no mandar `cascada`: se lee como «no».
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            paso = try c.decode(String.self, forKey: .paso)
            campo = try c.decode(CampoAnotar.self, forKey: .campo)
            valor = try c.decode(Double.self, forKey: .valor)
            cascada = try c.decodeIfPresent(Bool.self, forKey: .cascada) ?? false
        }
    }

    struct SerieAnotableMuneca: Equatable {
        var paso: Paso
        var anot: Anotacion
    }

    enum VistaAnotar: Equatable { case resumen, lista, columnas }

    /// El descanso que anota, resuelto: qué series, cuál vista, cuál abierta y con qué dato enfocado.
    struct DescansoQueAnota: Equatable {
        var vista: VistaAnotar
        var series: [SerieAnotableMuneca]
        var abierta: Int?
        var foco: CampoAnotar?
        /// Índice de la serie abierta en `e.pasos`, para la pista de la corona.
        var pasoAbierto: Int?
    }


}

extension Vivo {

    // MARK: - La acción del momento

    /// La acción primaria de la muñeca: «Confirmar» mientras el descanso anota (y «Listo» tras confirmar, que
    /// vuelve al resumen), y después la de siempre. El doble toque, el botón y la mano llaman a la misma.
    static func clavePrimariaMuneca(_ e: EstadoVivo, _ a: AnotarMuneca) -> ClavePrimaria? {
        if e.terminado { return nil }
        if let d = a.descansoQueAnota(e), d.vista != .resumen { return .confirmar }
        return clavePorDefecto(e.paso)
    }

    // MARK: - Lo que se pinta

    struct PildoraAnotar: Equatable {
        var slot: String?
        var texto: String
        var hecha: Bool
        /// Índice de la serie que abre al tocarla.
        var abre: Int
    }

    struct ColumnaAnotar: Equatable {
        var campo: CampoAnotar
        var valor: String
        var etiqueta: String
        var estado: EstadoDato
        var activa: Bool
        /// 30 pt si caben las tres, si no 22.
        var cuerpo: Double
        var ancho: Double
    }

    struct ColumnasAnotar: Equatable {
        /// «Serie 2 · sin confirmar», «A1 · serie 1 · kg sin confirmar».
        var titulo: NotaVista
        var columnas: [ColumnaAnotar]
        /// Con un dato encendido: «gira la corona · kg» o hasta dónde llega la cascada.
        var pista: NotaVista?
        /// Sin dato encendido: lo que viene.
        var viene: VieneMuneca?
    }

    struct ListaAnotar: Equatable {
        /// «Ronda 1 · 2 sin confirmar».
        var titulo: NotaVista
        var pildoras: [PildoraAnotar]
        var viene: VieneMuneca?
    }

    enum CuerpoAnotar: Equatable {
        case columnas(ColumnasAnotar)
        case lista(ListaAnotar)
    }

    /// El descanso mientras se anota (columnas o lista): «Descanso · 1:12» arriba y, abajo, «+30 s» y «Confirmar».
    struct CaraAnotar: Equatable {
        var contexto: LineaTexto
        var cuerpo: CuerpoAnotar
        var acciones: [AccionDeCara]
    }

    private static let anchoColumnaMinimo: Double = 48
    private static let aireColumna: Double = 5
    private static let huecoColumna: Double = 4
    /// Lo que se le resta al ancho útil para decidir si caben las tres columnas a 30 pt.
    private static let margenColumnas: Double = 6

    private static func etiquetaDeCampo(_ campo: CampoAnotar, _ s: SerieAnotableMuneca) -> String {
        let f = s.paso.fuerza
        switch campo {
        case .reps: return s.anot.reps.estado == .medido ? "reloj" : "reps"
        case .kg:
            if case let .tuya(_, lastre)? = f?.carga, lastre { return "kg lastre" }
            return "kg"
        case .esfuerzo: return f?.esfuerzo?.eje == .rir ? "RIR" : "RPE"
        }
    }

    private static func camposDe(_ s: SerieAnotableMuneca) -> [(campo: CampoAnotar, dato: Dato)] {
        var out: [(CampoAnotar, Dato)] = [(.reps, s.anot.reps)]
        if let kg = s.anot.kg { out.append((.kg, kg)) }
        if let e = s.anot.esfuerzo, s.paso.fuerza?.esfuerzo != nil { out.append((.esfuerzo, e)) }
        return out
    }

    /// «Serie 2», «A1 · serie 1», «Ronda 1» (`k == nil`: la ronda entera).
    private static func quienAnota(_ series: [SerieAnotableMuneca], _ k: Int?) -> String {
        guard let k else { return "Ronda \(series.first?.paso.posicion?.serie?.n.description ?? "")" }
        let p = series[k].paso
        let n = p.posicion?.serie?.n.description ?? ""
        if series.count > 1, let slot = p.posicion?.slot { return "\(slot) · serie \(n)" }
        return "Serie \(n)"
    }

    private static func estadoDeSerie(_ s: SerieAnotableMuneca) -> String {
        let faltan = camposPendientes(s.anot)
        let total = camposDe(s).count
        if faltan.isEmpty { return "anotada ✓" }
        if faltan.count == 1, total > 1 { return "\(etiquetaDeCampo(faltan[0], s)) sin confirmar" }
        return "sin confirmar"
    }

    private static func estadoDeRonda(_ pendientes: Int, _ total: Int) -> String {
        if pendientes == 0 { return "anotada ✓" }
        return pendientes == total ? "sin confirmar" : "\(pendientes) sin confirmar"
    }

    private static func columnasDe(_ s: SerieAnotableMuneca, foco: CampoAnotar?, _ m: MedidasMuneca) -> [ColumnaAnotar] {
        let campos = camposDe(s)
        func ancho(_ c: (campo: CampoAnotar, dato: Dato), _ cuerpo: Double) -> Double {
            Swift.max(anchoColumnaMinimo, Swift.max(anchoTexto(fmtValor(c.dato.valor), cuerpo),
                                                    anchoTexto(etiquetaDeCampo(c.campo, s), TipoMuneca.nota, peso: TipoMuneca.pesoNota)) + 2 * aireColumna)
        }
        func total(_ cuerpo: Double) -> Double { campos.reduce(0) { $0 + ancho($1, cuerpo) } + huecoColumna * Double(campos.count - 1) }
        let cuerpo = total(TipoMuneca.segundo) <= m.anchoUtil - margenColumnas ? TipoMuneca.segundo : TipoMuneca.tercero
        return campos.map {
            ColumnaAnotar(campo: $0.campo, valor: fmtValor($0.dato.valor), etiqueta: etiquetaDeCampo($0.campo, s), estado: $0.dato.estado,
                          activa: foco == $0.campo, cuerpo: cuerpo, ancho: ancho($0, cuerpo))
        }
    }

    /// Cuántas series se enseñan como píldora antes de plegar el resto en «+N series».
    private static let pildorasVisibles = 2

    /// El descanso que anota, o `nil` si no hay nada que anotar (el descanso común lo pinta el cuadro).
    static func caraDeAnotar(_ e: EstadoVivo, _ l: Lecturas, _ a: AnotarMuneca, _ m: MedidasMuneca) -> CaraMuneca? {
        guard let d = a.descansoQueAnota(e) else { return nil }
        let viene = vieneDe(e.pasos, e.i, a.registro, m)
        if d.vista == .resumen {
            let texto = d.series.count == 1 ? textoAnotacion(d.series[0].anot, d.series[0].paso.fuerza ?? fichaFuerzaVacia)
                : "\(quienAnota(d.series, nil)) anotada"
            return .descanso(caraDescanso(e, l, m, viene: viene, hueco: PildoraAnotar(slot: nil, texto: texto, hecha: true, abre: 0), conPulso: false))
        }
        let cuenta = fmtReloj((faltaDe(e.paso, l) ?? 0).rounded(.up))
        let contexto = contextoQueCabe(["Descanso", cuenta], m)
        let pendientes = d.series.filter { pendiente($0.anot) }.count
        let acciones: [AccionDeCara] = [.mas30s, pendientes > 0 ? .confirmar : .listo]

        if d.vista == .lista {
            let visibles = d.series.count <= pildorasVisibles ? d.series : Array(d.series.prefix(1))
            var pildoras = visibles.enumerated().map { k, s in
                PildoraAnotar(slot: s.paso.posicion?.slot, texto: textoAnotacion(s.anot, s.paso.fuerza ?? fichaFuerzaVacia), hecha: !pendiente(s.anot), abre: k)
            }
            let resto = d.series.count - visibles.count
            if resto > 0 { pildoras.append(PildoraAnotar(slot: nil, texto: "+\(resto) series", hecha: false, abre: 1)) }
            let titulo = notaVista("\(quienAnota(d.series, nil)) · \(estadoDeRonda(pendientes, d.series.count))", ancho: m.anchoUtil)
            return .anotar(CaraAnotar(contexto: contexto, cuerpo: .lista(ListaAnotar(titulo: titulo, pildoras: pildoras, viene: viene)), acciones: acciones))
        }

        guard let k = d.abierta else { return nil }
        let s = d.series[k]
        let titulo = notaVista("\(quienAnota(d.series, k)) · \(estadoDeSerie(s))", ancho: m.anchoUtil)
        let pista = d.foco.flatMap { campo in d.pasoAbierto.map { textoPistaCorona(e.pasos, $0, campo, a.registro) } }
        let cuerpo = ColumnasAnotar(titulo: titulo, columnas: columnasDe(s, foco: d.foco, m),
                                    pista: pista.map { notaVista($0, ancho: m.anchoUtil) }, viene: d.foco == nil ? viene : nil)
        return .anotar(CaraAnotar(contexto: contexto, cuerpo: .columnas(cuerpo), acciones: pendiente(s.anot) ? [.mas30s, .confirmar] : [.mas30s, .listo]))
    }

    /// Una ficha sin dosis, para dar texto a una serie sin ficha (no debería ocurrir: solo las de fuerza anotan).
    private static let fichaFuerzaVacia = FichaFuerza(ejercicio: "", carga: .corporal, esfuerzo: nil)
}
