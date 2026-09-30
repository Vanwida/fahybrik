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
    /// vuelve al resumen), después la del WOD y la del circuito (su vocabulario) y por último la de siempre. El doble
    /// toque, el botón y la mano llaman a la misma.
    static func clavePrimariaMuneca(_ e: EstadoVivo, _ a: AnotarMuneca, _ w: EstadoWod = EstadoWod()) -> ClavePrimaria? {
        if e.terminado { return nil }
        if let d = a.descansoQueAnota(e), d.vista != .resumen { return .confirmar }
        let p = e.paso
        if p.wod != nil { return clavePrimariaWod(p, w) }
        if p.circuito != nil, let c = claveCircuito(p) { return c }
        return clavePorDefecto(p)
    }

    /// ¿La acción solo MARCA algo y no cierra el paso? «Hecho» de una ventana que se marca (EMOM, death by) y «+1 ronda»:
    /// no piden «¿Terminar y guardar?» aunque sea el último paso. «Vuelta», «Confirmar» y «Guardar» (la campana, que ya es
    /// el cierre y se dice con su propia acción) tampoco.
    static func marcaSinCerrar(_ clave: ClavePrimaria?, _ p: Paso) -> Bool {
        clave == .rondaHecha || (clave == .hecho && seMarca(p))
    }

    static func noCierraNada(_ clave: ClavePrimaria?, _ p: Paso) -> Bool {
        clave == .vuelta || clave == .confirmar || clave == .guardar || marcaSinCerrar(clave, p)
    }

    // MARK: - Lo que se pinta

    struct PildoraAnotar: Equatable {
        var slot: String?
        var texto: String
        var hecha: Bool
        /// Índice de la serie que abre al tocarla.
        var abre: Int
        /// Su alto: el de siempre, o el apretado en un reloj bajo.
        var alto: Double = Vivo.alturaDeHueco
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
        /// «Serie 2 · sin confirmar», «A1 · serie 1 · kg sin confirmar»; `nil` si en un reloj bajo no cabe con lo demás.
        var titulo: NotaVista?
        var columnas: [ColumnaAnotar]
        /// El alto de una columna: el de siempre, o el apretado en un reloj bajo.
        var altoColumna: Double
        /// Con un dato encendido: «gira la corona · kg» o hasta dónde llega la cascada.
        var pista: NotaVista?
        /// Sin dato encendido: lo que viene.
        var viene: VieneMuneca?
    }

    struct ListaAnotar: Equatable {
        /// «Ronda 1 · 2 sin confirmar»; `nil` si en un reloj bajo no cabe con lo demás.
        var titulo: NotaVista?
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
        var altoBotones: Double = Fila.boton.alto
    }

    /// Lo que mide una columna de dato: su alto y el apretado de un reloj bajo (con el cuerpo de 22 pt o menos cabe).
    static let altoColumna: Double = 58
    static let altoColumnaApretada: Double = 52

    /// La píldora de una serie: el aire a los lados, entre sus piezas, la marca y el cuerpo del texto (el del botón).
    enum MedidaPildora {
        static let aire: Double = 12
        static let hueco: Double = 8
        static let marca: Double = 15
        static let cuerpo: Double = 17
    }

    private static let anchoColumnaMinimo: Double = 48
    private static let aireColumna: Double = 5
    /// El aire entre columnas de dato (el mismo que pinta la muñeca).
    static let huecoColumna: Double = 4
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

    /// Los cuerpos a los que baja el valor de una columna, del mayor al menor: el de 30 y el de 22 de la escala y el suelo.
    private static let cuerposColumna: [Double] = [TipoMuneca.segundo, TipoMuneca.tercero, suelo]

    private static func columnasDe(_ s: SerieAnotableMuneca, foco: CampoAnotar?, _ m: MedidasMuneca) -> [ColumnaAnotar] {
        let campos = camposDe(s)
        let disponible = m.anchoUtil - margenColumnas
        let huecos = huecoColumna * Double(campos.count - 1)
        // Cada columna mide lo que su texto pide, y a un reloj estrecho el mínimo se le achica para que quepan las tres.
        let minimo = Swift.min(anchoColumnaMinimo, (disponible - huecos) / Double(campos.count))
        func anchos(_ cuerpo: Double) -> [Double] {
            campos.map {
                Swift.max(minimo, Swift.max(anchoTexto(fmtValor($0.dato.valor), cuerpo),
                                            anchoTexto(etiquetaDeCampo($0.campo, s), TipoMuneca.nota, peso: TipoMuneca.pesoNota)) + 2 * aireColumna)
            }
        }
        let cuerpo = cuerposColumna.first { anchos($0).reduce(0, +) + huecos <= disponible } ?? suelo
        return zip(campos, anchos(cuerpo)).map { c, ancho in
            ColumnaAnotar(campo: c.campo, valor: fmtValor(c.dato.valor), etiqueta: etiquetaDeCampo(c.campo, s), estado: c.dato.estado,
                          activa: foco == c.campo, cuerpo: cuerpo, ancho: ancho)
        }
    }

    /// El texto de una píldora, la variante más completa que cabe a su ancho. Se mide a un punto sobre el suelo: el estimador
    /// se queda corto con las letras anchas y una píldora cortada con «…» no dice qué anotaste.
    private static let cuerpoPildoraHolgura: Double = 1

    private static func textoQueCabeEnPildora(_ variantes: [String], slot: String?, _ m: MedidasMuneca) -> String {
        let fijo = 2 * MedidaPildora.aire + MedidaPildora.marca + MedidaPildora.hueco
            + (slot.map { anchoTexto($0, TipoMuneca.nota) + MedidaPildora.hueco } ?? 0)
        return variantes.first { anchoTexto($0, suelo + cuerpoPildoraHolgura) <= m.anchoUtil - fijo } ?? variantes[variantes.count - 1]
    }

    /// La serie con su esfuerzo; sin él si no cabe y, si aun así no cabe, sin la unidad («8 × 127,5»).
    private static func textoDePildora(_ a: Anotacion, _ f: FichaFuerza, slot: String?, _ m: MedidasMuneca) -> String {
        textoQueCabeEnPildora([textoAnotacion(a, f), textoAnotacion(a, f, conEsfuerzo: false), textoAnotacion(a, f, conEsfuerzo: false, conUnidad: false)],
                              slot: slot, m)
    }

    private static func pildoraDe(_ s: SerieAnotableMuneca, abre: Int, _ m: MedidasMuneca) -> PildoraAnotar {
        let slot = s.paso.posicion?.slot
        return PildoraAnotar(slot: slot, texto: textoDePildora(s.anot, s.paso.fuerza ?? fichaFuerzaVacia, slot: slot, m), hecha: !pendiente(s.anot), abre: abre)
    }

    /// Lo que cabe de un cuerpo de anotación: lo que ocupa cada fila con el contexto y los botones, con el aire entre filas.
    private static func ajustarAnotar(_ filas: [FilaAjustable], _ m: MedidasMuneca) -> Ajuste {
        ajustarFilas(filas) { $0.reduce(0, +) + huecoFila * Double($0.count - 1) <= m.altoUtil }
    }

    private static func filaBotones() -> FilaAjustable { FilaAjustable(papel: .botones, alto: Fila.boton.alto, apretada: Fila.botonReal) }

    /// Cuántas series se enseñan como píldora antes de plegar el resto en «+N series».
    private static let pildorasVisibles = 2

    /// El descanso que anota, o `nil` si no hay nada que anotar (el descanso común lo pinta el cuadro). Cada fila que
    /// lleva se declara con su alto y lo que cede; en un reloj bajo se aprietan las píldoras, las columnas, «Viene» y los
    /// botones y, si aun así no cabe, caen el título y «Viene» (lo que menos dice de lo que tienes delante).
    static func caraDeAnotar(_ e: EstadoVivo, _ l: Lecturas, _ a: AnotarMuneca, _ m: MedidasMuneca) -> CaraMuneca? {
        guard let d = a.descansoQueAnota(e) else { return nil }
        let viene = vieneDe(e.pasos, e.i, a.registro, m)
        if d.vista == .resumen {
            let ficha = d.series[0].paso.fuerza ?? fichaFuerzaVacia
            let texto = d.series.count == 1 ? textoDePildora(d.series[0].anot, ficha, slot: nil, m)
                : textoQueCabeEnPildora(["\(quienAnota(d.series, nil)) anotada", quienAnota(d.series, nil)], slot: nil, m)
            return .descanso(caraDescanso(e, l, m, viene: viene, hueco: PildoraAnotar(slot: nil, texto: texto, hecha: true, abre: 0), conPulso: false))
        }
        let cuenta = fmtReloj((faltaDe(e.paso, l) ?? 0).rounded(.up))
        let contexto = contextoQueCabe(["Descanso", cuenta], m)
        let pendientes = d.series.filter { pendiente($0.anot) }.count
        let acciones: [AccionDeCara] = [.mas30s, pendientes > 0 ? .confirmar : .listo]
        let contextoFila = FilaAjustable(papel: .contexto, alto: Fila.contexto.alto)
        func vieneApretable(_ cede: Int) -> FilaAjustable? {
            viene.map { FilaAjustable(papel: .viene, alto: $0.alto, cede: cede, apretada: apretarViene($0, m).alto) }
        }
        func vieneFinal(_ ajuste: Ajuste) -> VieneMuneca? {
            ajuste.queda(.viene) ? viene.map { ajuste.apretadas.contains(.viene) ? apretarViene($0, m) : $0 } : nil
        }

        if d.vista == .lista {
            let visibles = d.series.count <= pildorasVisibles ? d.series : Array(d.series.prefix(1))
            var pildoras = visibles.enumerated().map { k, s in pildoraDe(s, abre: k, m) }
            let resto = d.series.count - visibles.count
            if resto > 0 { pildoras.append(PildoraAnotar(slot: nil, texto: "+\(resto) series", hecha: false, abre: 1)) }
            let titulo = notaVista("\(quienAnota(d.series, nil)) · \(estadoDeRonda(pendientes, d.series.count))", ancho: m.anchoUtil)
            let n = Double(pildoras.count)
            var filas = [
                contextoFila,
                FilaAjustable(papel: .tituloAnotar, alto: filaDeNota(titulo).alto, cede: 3),
                FilaAjustable(papel: .pildoras, alto: n * alturaDeHueco + huecoFila * (n - 1), apretada: n * alturaDeHuecoApretada + huecoFila * (n - 1)),
            ]
            if let v = vieneApretable(2) { filas.append(v) }
            filas.append(filaBotones())
            let ajuste = ajustarAnotar(filas, m)
            let alto = ajuste.apretadas.contains(.pildoras) ? alturaDeHuecoApretada : alturaDeHueco
            let lista = ListaAnotar(titulo: ajuste.queda(.tituloAnotar) ? titulo : nil, pildoras: pildoras.map { var p = $0; p.alto = alto; return p },
                                    viene: vieneFinal(ajuste))
            return .anotar(CaraAnotar(contexto: contexto, cuerpo: .lista(lista), acciones: acciones, altoBotones: altoDeBotones(ajuste)))
        }

        guard let k = d.abierta else { return nil }
        let s = d.series[k]
        let titulo = notaVista("\(quienAnota(d.series, k)) · \(estadoDeSerie(s))", ancho: m.anchoUtil)
        // Apretado, el título dice solo qué serie es.
        let tituloCorto = notaVista(quienAnota(d.series, k), ancho: m.anchoUtil)
        let pista = d.foco.flatMap { campo in d.pasoAbierto.map { textoPistaCorona(e.pasos, $0, campo, a.registro) } }.map { notaVista($0, ancho: m.anchoUtil) }
        let columnas = columnasDe(s, foco: d.foco, m)
        let apretable = (columnas.first?.cuerpo ?? 0) < TipoMuneca.segundo
        var filas = [
            contextoFila,
            FilaAjustable(papel: .tituloAnotar, alto: filaDeNota(titulo).alto, cede: 2, apretada: titulo.lineas > 1 ? filaDeNota(tituloCorto).alto : nil),
            FilaAjustable(papel: .columnas, alto: altoColumna, apretada: apretable ? altoColumnaApretada : nil),
        ]
        if let p = pista { filas.append(FilaAjustable(papel: .pistaCorona, alto: filaDeNota(p).alto)) }
        if d.foco == nil, let v = vieneApretable(3) { filas.append(v) }
        filas.append(filaBotones())
        let ajuste = ajustarAnotar(filas, m)
        let cuerpo = ColumnasAnotar(
            titulo: ajuste.queda(.tituloAnotar) ? (ajuste.apretadas.contains(.tituloAnotar) ? tituloCorto : titulo) : nil,
            columnas: columnas,
            altoColumna: ajuste.apretadas.contains(.columnas) ? altoColumnaApretada : altoColumna,
            pista: pista,
            viene: d.foco == nil ? vieneFinal(ajuste) : nil
        )
        return .anotar(CaraAnotar(contexto: contexto, cuerpo: .columnas(cuerpo),
                                  acciones: pendiente(s.anot) ? [.mas30s, .confirmar] : [.mas30s, .listo], altoBotones: altoDeBotones(ajuste)))
    }

    private static func altoDeBotones(_ a: Ajuste) -> Double { a.apretadas.contains(.botones) ? Fila.botonReal : Fila.boton.alto }

    /// Una ficha sin dosis, para dar texto a una serie sin ficha (no debería ocurrir: solo las de fuerza anotan).
    private static let fichaFuerzaVacia = FichaFuerza(ejercicio: "", carga: .corporal, esfuerzo: nil)
}
