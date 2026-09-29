import Foundation

// LA ACCIÓN PRIMARIA, LOS ENLACES Y LA HOJA DE TERMINAR — lo PURO del kit del
// iPhone (espejo de `kit-iphone-vivo/accion.tsx`, `enlace.ts` y
// `Vivo.tsx#clavePorDefecto`). Vive en Core porque no pinta nada y la muñeca
// puede heredarlo.

extension Vivo {

    // MARK: - El vocabulario de la acción primaria (cerrado)

    /// Lo que puede decir el botón primario, y nada más. `primaria` = naranja
    /// (la acción del momento); `secundaria` = superficie (cerrar antes de
    /// tiempo un paso que se cierra solo).
    enum ClavePrimaria: String, Equatable, CaseIterable {
        case empezarYa = "empezar ya"
        case empezar
        case serieHecha = "serie hecha"
        case estacionHecha = "estación hecha"
        case siguienteEstacion = "siguiente estación"
        case hecho
        case rondaHecha = "ronda hecha"
        case confirmar
        case guardar
        case empiezo
        case salgoACorrer = "salgo a correr"
        case vuelta
        case siguientePaso = "siguiente paso"
        case cerrarElTramo = "cerrar el tramo"
        case reanudar
        /// Dobles: tu pareja ha acabado su estación y entras tú.
        case relevo

        var texto: String {
            switch self {
            case .empezarYa: return "Empezar ya"
            case .empezar: return "Empezar"
            case .serieHecha: return "Serie hecha"
            case .estacionHecha: return "Estación hecha"
            case .siguienteEstacion: return "Siguiente estación"
            case .hecho: return "Hecho"
            case .rondaHecha: return "+1 ronda"
            case .confirmar: return "Confirmar"
            case .guardar: return "Guardar"
            case .empiezo: return "Empiezo"
            case .salgoACorrer: return "Salgo a correr"
            case .vuelta: return "Vuelta"
            case .siguientePaso: return "Siguiente paso"
            case .cerrarElTramo: return "Cerrar el tramo"
            case .reanudar: return "Reanudar"
            case .relevo: return "Relevo"
            }
        }

        var esPrimaria: Bool {
            switch self {
            case .vuelta, .siguientePaso, .cerrarElTramo: return false
            default: return true
            }
        }
    }

    /// De la etiqueta en minúscula del kit de la muñeca a una clave del vocabulario.
    static func claveDesdeEtiqueta(_ etiqueta: String) -> ClavePrimaria {
        let k = etiqueta.lowercased()
        if let c = ClavePrimaria(rawValue: k) { return c }
        if k.hasSuffix(" hecha") || k.hasSuffix(" hecho") { return .hecho }
        return .siguientePaso
    }

    /// LA ACCIÓN PRIMARIA POR DEFECTO de un paso (vocabulario cerrado). `nil` =
    /// no hay (manda el reloj: tabata; AMRAP sin rondas).
    static func clavePorDefecto(_ paso: Paso) -> ClavePrimaria? {
        if esRelevo(paso) { return .relevo }
        let f = familiaDe(paso)
        if f == .roxzone { return paso.roxzone == .salida ? .salgoACorrer : .empiezo }
        if case .puntuacion = paso.wod { return .guardar }
        if paso.rol != .trabajo { return .empezarYa }
        if f == .pared { return nil }
        if paso.cierre == .atleta {
            switch f {
            case .fuerza: return .serieHecha
            case .emom: return .hecho
            case .amrap: return .rondaHecha
            case .estacion, .fortime: return .estacionHecha
            case .remo, .ski, .bici: return paso.posicion?.serie != nil ? .serieHecha : .estacionHecha
            default: return .siguientePaso
            }
        }
        if paso.vueltaAutoM != nil { return .vuelta }
        return .siguientePaso
    }

    // MARK: - La hoja de terminar

    struct ResumenTerminar: Equatable {
        var titulo: String
        var lineas: [String]
    }

    /// Lo hecho hasta aquí, para la hoja: la posición, los km corridos y de
    /// máquina, y el tiempo. Puro: del estado.
    static func resumenParaTerminar(_ paso: Paso, sesionM: Double, sesionErgoM: Double, sesionT: Double) -> ResumenTerminar {
        let pos = contextoDe(paso).prefix(2).joined(separator: " · ")
        var lineas: [String] = []
        if sesionM > 0 { let d = fmtDistancia(sesionM); lineas.append("\(d.valor) \(d.unidad) corridos") }
        if sesionErgoM > 0 { let d = fmtDistancia(sesionErgoM); lineas.append("\(d.valor) \(d.unidad) de máquina") }
        lineas.append("\(fmtReloj(sesionT)) de sesión")
        return ResumenTerminar(titulo: pos, lineas: lineas)
    }

    // MARK: - Los enlaces (I10): derivados de las lecturas, nunca un segundo estado

    struct Dispositivos: Equatable {
        /// El reloj se lanza solo al empezar y NUNCA bloquea nada: lo que se dice de él es
        /// lo que Apple contesta. `conectando` = Apple aún no ha entregado el enlace;
        /// `sinConexion` = no respondió o se perdió (el entreno sigue igual).
        enum Reloj: String, Equatable { case motor, segundaPantalla = "segunda-pantalla", conectando, sinConexion = "sin-conexion", sin }
        enum Pulsometro: String, Equatable { case reloj, banda, sin }
        var reloj: Reloj = .sin
        var maquina: Maquina.Tipo? = nil
        var pulsometro: Pulsometro = .sin
    }

    static let sinDispositivos = Dispositivos()

    enum ClaveEnlace: String, Equatable { case reloj, gps, maquina, pulso }
    enum EstadoChip: String, Equatable { case ok, buscando, perdido, apagado }

    struct ChipEnlace: Equatable, Identifiable {
        var clave: ClaveEnlace
        var texto: String
        var estado: EstadoChip
        /// La nota de honestidad bajo el sujeto cuando algo no llega; nil si todo va.
        var nota: String?
        var id: String { clave.rawValue }
    }

    /// Un dato de la máquina que dependía del enlace y no llega (5 s).
    private static func maquinaVieja(_ l: Lecturas, _ tipo: Maquina.Tipo) -> Bool {
        tipo == .cinta ? (l.viejo(.ritmo) || l.viejo(.hecho)) : (l.viejo(.split500) || l.viejo(.hecho) || l.viejo(.vatios))
    }

    /// La máquina que este paso lleva: la declarada o, si se corre en cinta, la cinta.
    private static func maquinaDelPaso(_ p: Paso) -> Maquina.Tipo? {
        p.maquina?.tipo ?? (familiaDe(p) == .cinta ? .cinta : nil)
    }

    /// ¿Este paso corre con GPS? Solo si SE CORRE: calle o pista, nunca cinta.
    static func usaGps(_ p: Paso) -> Bool { familiaDe(p) == .correr && p.entorno != .cinta }

    /// LOS CHIPS DE LA CABECERA, derivados.
    static func enlacesDe(_ d: Dispositivos, _ p: Paso, _ l: Lecturas) -> [ChipEnlace] {
        var chips: [ChipEnlace] = []
        switch d.reloj {
        case .conectando:
            chips.append(ChipEnlace(clave: .reloj, texto: "Reloj", estado: .buscando, nota: "conectando con el reloj"))
        case .sinConexion:
            // `.apagado`, no `.perdido`: es informativo, no impide entrenar y no debe tapar
            // la nota de una máquina o un pulso que SÍ se han perdido.
            chips.append(ChipEnlace(clave: .reloj, texto: "Reloj · sin conexión", estado: .apagado,
                                    nota: "sin conexión con el reloj · puedes seguir"))
        case .motor, .segundaPantalla:
            chips.append(ChipEnlace(clave: .reloj, texto: "Reloj", estado: .ok,
                                    nota: d.reloj == .motor ? "el reloj lleva el entreno · el móvil es su segunda pantalla" : nil))
        case .sin:
            break
        }
        if usaGps(p) {
            let buscando = l.gps == .buscando
            chips.append(ChipEnlace(clave: .gps, texto: "GPS", estado: buscando ? .buscando : .ok, nota: buscando ? "GPS · buscando señal" : nil))
        }
        if let tipo = maquinaDelPaso(p) {
            let m = Maquina(tipo: tipo)
            let nombre = nombreMaquina(m) ?? "la máquina"
            let corto = nombreMaquinaCorto(m) ?? "Máquina"
            if d.maquina != tipo {
                chips.append(ChipEnlace(clave: .maquina, texto: "Conectar \(nombre)", estado: .apagado, nota: "sin \(nombre) · lo dices tú"))
            } else if maquinaVieja(l, tipo) {
                chips.append(ChipEnlace(clave: .maquina, texto: "\(corto) · sin señal", estado: .perdido, nota: "sin señal \(deMaquina(m) ?? "") · toca para reconectar"))
            } else {
                chips.append(ChipEnlace(clave: .maquina, texto: corto, estado: .ok, nota: nil))
            }
        }
        if d.pulsometro == .sin {
            chips.append(ChipEnlace(clave: .pulso, texto: "Sin pulso", estado: .apagado, nota: nil))
        } else {
            let viejo = l.viejo(.ppm)
            let sin = l.ppm == nil || viejo
            chips.append(ChipEnlace(clave: .pulso, texto: d.pulsometro == .banda ? "Banda" : "Pulso",
                                    estado: viejo ? .perdido : sin ? .buscando : .ok,
                                    nota: viejo ? "sin señal del pulso" : sin ? "pulso · buscando" : nil))
        }
        return chips
    }

    /// La primera nota de honestidad que toque enseñar bajo el sujeto (una, no una lista).
    static func notaEnlace(_ chips: [ChipEnlace]) -> String? {
        for e in [EstadoChip.perdido, .buscando, .apagado, .ok] {
            if let c = chips.first(where: { $0.estado == e && $0.nota != nil }) { return c.nota }
        }
        return nil
    }

    // MARK: - La pausa que se reanuda sola

    /// La pausa que pide el atleta se reanuda sola a los 10 s si no la confirma (el
    /// valor de la vista vieja, `ActiveWorkoutView.pauseAutoResume`). Es mecanismo del
    /// aparato, no método: cuánto aguanta el móvil una pausa sin respuesta no lo
    /// decide un entrenador, así que es constante y no dato del coach.
    static let reanudaSolaS: Double = 10

    /// Los segundos enteros que se enseñan hasta que la pausa se reanude sola
    /// (10, 9 … 1); 0 = ya toca reanudar. nil = la pausa no está armada (no la pidió
    /// el atleta en este vivo, o eligió otra salida: la hoja de terminar la desarma).
    static func quedaParaReanudar(desde: Date?, ahora: Date, tras: Double = reanudaSolaS) -> Int? {
        guard let desde else { return nil }
        let pasado = Swift.max(0, ahora.timeIntervalSince(desde))
        return Swift.max(0, Int((tras - pasado).rounded(.up)))
    }
}

