import Foundation

// EL ENTRENO DE CORRER QUE EL ATLETA SE MONTA — la gramática entera, no un bout.
//
// ── EL HUECO QUE ESTO CIERRA ───────────────────────────────────────────────
// El constructor libre sabía escribir exactamente una cosa: N veces la misma
// dosis con un descanso PARADO de X segundos (`FreeWorkoutDraft`, formato
// «Series»). Con eso no se puede escribir casi ningún entreno de correr real:
//
//   · una serie de verdad          5×800 @ Z4 con 400 m de TROTE @ Z1
//   · un fartlek                   5×(5' Z4 / 1' Z2)
//   · una pirámide                 400·800·1200·800·400
//   · un progresivo                3 km Z2 + 3 km Z3 + 3 km Z4
//   · un tempo con sus extremos    10' Z2 · 20' Z4 · 10' Z1
//   · cuestas                      8×45" al 6 % bajando trotando
//   · un rodaje largo con acelerones  60' Z2 + 6×(30" fuerte / 60" trote)
//
// Ninguno entra en «N × lo mismo + descanso». Y la gramática para expresarlos
// YA EXISTE y ya se ejecuta (`RunStructure`, #61): fases → elementos (tramo o
// repetir ×N) → tramo con su propia medida, su propio objetivo, su modo de
// recuperación y su cuesta. Lo que faltaba era que el constructor la hablara.
//
// ── LA FORMA, Y POR QUÉ ESTA Y NO EL ÁRBOL ENTERO ──────────────────────────
// Un plan es: calentamiento? · una lista de GRUPOS · vuelta a la calma?
// Un grupo es «repetir N veces estos pasos» (N = 1 → no se repite, es una
// secuencia suelta). Eso es exactamente la profundidad 2 que la gramática
// permite, sin pedirle al atleta que maneje un árbol: los siete casos de arriba
// entran, y el séptimo —el que obliga a más de un grupo— también.
//
// ── DÓNDE NO SE INVENTA NADA ───────────────────────────────────────────────
// Un paso SIN objetivo es legal y no es un hueco: hay entrenos que se corren
// por sensaciones. Lo que no se hace es rellenarlo por él con una zona por
// defecto y presentarlo luego como prescripción.

// MARK: - El paso

struct FreeRunPaso: Identifiable, Equatable {
    enum Rol: String, CaseIterable, Identifiable {
        case trabajo, recuperacion
        var id: String { rawValue }
        var labelES: String { self == .trabajo ? "Correr" : "Recuperar" }
    }

    /// Cómo se sabe que este paso ha terminado.
    enum Medida: String, CaseIterable, Identifiable {
        case distancia, tiempo, abierto
        var id: String { rawValue }
        var labelES: String {
            switch self {
            case .distancia: return "Distancia"
            case .tiempo:    return "Tiempo"
            case .abierto:   return "Lo dices tú"
            }
        }
    }

    /// Contra qué se corre. `ninguno` es una respuesta legítima, no un hueco.
    enum Objetivo: String, CaseIterable, Identifiable {
        case zona, ritmo, rpe, ninguno
        var id: String { rawValue }
        var labelES: String {
            switch self {
            case .zona:    return "Zona"
            case .ritmo:   return "Ritmo"
            case .rpe:     return "RPE"
            case .ninguno: return "Libre"
            }
        }
    }

    let id: UUID
    var rol: Rol
    var medida: Medida
    var metros: Int
    var segundos: Int
    var objetivo: Objetivo
    var zona: Int
    var ritmoSegPorKm: Int
    var rpe: Double
    /// Sólo para una recuperación: cómo se toma. `nil` = no lo dice, y entonces
    /// el motor MIDE lo que pase en vez de suponerlo (`RunLeg.recuperaEnMovimiento`).
    var modo: RunRecoveryMode?
    /// Cuesta, en %. `nil` = llano / lo que haya. Sirve para cinta y para calle.
    var cuestaPct: Double?

    init(id: UUID = UUID(),
         rol: Rol = .trabajo,
         medida: Medida = .distancia,
         metros: Int = FreeRunPlan.metrosPorDefecto,
         segundos: Int = FreeRunPlan.segundosPorDefecto,
         objetivo: Objetivo = .zona,
         zona: Int = 4,
         ritmoSegPorKm: Int = FreeRunPlan.ritmoPorDefecto,
         rpe: Double = 8,
         modo: RunRecoveryMode? = nil,
         cuestaPct: Double? = nil) {
        self.id = id
        self.rol = rol
        self.medida = medida
        self.metros = metros
        self.segundos = segundos
        self.objetivo = objetivo
        self.zona = zona
        self.ritmoSegPorKm = ritmoSegPorKm
        self.rpe = rpe
        self.modo = modo
        self.cuestaPct = cuestaPct
    }

    /// El paso, dicho como lo diría el atleta: «800 m · Z4», «trote 2:00 · Z1».
    var linea: String {
        let partes = [prefijo, medidaTexto, objetivoTexto, cuestaTexto].compactMap { $0 }
        return partes.joined(separator: " · ")
    }

    private var prefijo: String? {
        guard rol == .recuperacion else { return nil }
        switch modo {
        case .trote:   return "trote"
        case .caminar: return "andando"
        case .parado:  return "parado"
        case nil:      return "recupera"
        }
    }

    var medidaTexto: String {
        switch medida {
        case .distancia: return Formato.distancia(Double(metros)) ?? "\(metros) m"
        case .tiempo:    return Formato.clock(segundos, subMinuto: .segundos)
        case .abierto:   return "abierto"
        }
    }

    var objetivoTexto: String? {
        switch objetivo {
        case .zona:    return HRZone(rawValue: zona)?.label
        case .ritmo:   return "\(Formato.ritmoCifras(Double(ritmoSegPorKm)))/km"
        case .rpe:     return "RPE \(Formato.esDecimal(rpe))"
        case .ninguno: return nil
        }
    }

    private var cuestaTexto: String? {
        guard let cuestaPct, cuestaPct > 0 else { return nil }
        return "\(Formato.esDecimal(cuestaPct))%"
    }

    /// El paso en la gramática que el motor ejecuta.
    var segmento: RunSegment {
        RunSegment(
            kind: rol == .trabajo ? .work : .recovery,
            measure: medidaGramatica,
            target: objetivoGramatica,
            resolved: nil,
            inclinePct: cuestaPct,
            cadenceSpm: nil,
            recoveryMode: rol == .recuperacion ? modo : nil
        )
    }

    private var medidaGramatica: RunSegmentMeasure {
        switch medida {
        case .distancia: return .distance(m: max(1, metros))
        case .tiempo:    return .duration(s: max(1, segundos))
        // Un paso ABIERTO lo cierra el atleta: no lleva medida, y la gramática ya
        // trata eso como una pierna manual. `unknown` es su forma, no un fallo.
        case .abierto:   return .unknown
        }
    }

    private var objetivoGramatica: RunSegmentTarget? {
        switch objetivo {
        case .zona:    return .hrZone(zona)
        case .ritmo:   return .pace(valueS: ritmoSegPorKm, minS: nil, maxS: nil)
        case .rpe:     return .rpe(value: rpe, min: nil, max: nil)
        case .ninguno: return nil
        }
    }

    /// Segundos que dura, para la duración prevista. Un paso por distancia sólo
    /// se puede estimar contra un ritmo escrito: sin él no se inventa uno.
    var segundosEstimados: Int {
        switch medida {
        case .tiempo:    return segundos
        case .abierto:   return 0
        case .distancia:
            guard objetivo == .ritmo, ritmoSegPorKm > 0 else { return 0 }
            return Int((Double(metros) / 1000.0 * Double(ritmoSegPorKm)).rounded())
        }
    }
}

// MARK: - El grupo

struct FreeRunGrupo: Identifiable, Equatable {
    let id: UUID
    /// 1 = no se repite, es una secuencia suelta.
    var repeticiones: Int
    var pasos: [FreeRunPaso]

    init(id: UUID = UUID(), repeticiones: Int = 1, pasos: [FreeRunPaso]) {
        self.id = id
        self.repeticiones = repeticiones
        self.pasos = pasos
    }

    var elemento: RunElement {
        let segmentos = pasos.map { RunElement.segment($0.segmento) }
        guard repeticiones > 1 else {
            // Un grupo de uno sin repetir no necesita envoltorio: metería un
            // «repetir ×1» en la gramática que nadie escribió.
            return segmentos.count == 1 ? segmentos[0] : .repeatBlock(times: 1, elements: segmentos)
        }
        return .repeatBlock(times: repeticiones, elements: segmentos)
    }

    var linea: String {
        let cuerpo = pasos.map(\.linea).joined(separator: " + ")
        return repeticiones > 1 ? "\(repeticiones) × (\(cuerpo))" : cuerpo
    }

    var segundosEstimados: Int {
        pasos.reduce(0) { $0 + $1.segundosEstimados } * max(1, repeticiones)
    }
}

// MARK: - El plan

struct FreeRunPlan: Equatable {
    /// Pasos por defecto — nombrados, sin números sueltos por el código.
    static let metrosPorDefecto = 800
    static let segundosPorDefecto = 180
    /// 5:00/km: un ritmo de rodaje corriente. Sólo es el punto de partida del
    /// contador, nunca una prescripción — el atleta lo mueve antes de guardar.
    static let ritmoPorDefecto = 300
    static let pasoMetros = 50
    static let pasoSegundos = 15
    static let pasoRitmo = 5
    static let maxGrupos = 12
    static let maxPasosPorGrupo = 12
    static let maxRepeticiones = 40

    /// Nil = este entreno no lleva. No se mete uno por defecto: hay rodajes que
    /// se salen a correr y ya.
    var calentamiento: FreeRunPaso?
    var grupos: [FreeRunGrupo]
    var vuelta: FreeRunPaso?

    /// El plan con el que se abre el editor: una serie, que es lo que el 90 % de
    /// la gente viene a montar aquí. Todo es editable y todo se puede borrar.
    static var porDefecto: FreeRunPlan {
        FreeRunPlan(
            calentamiento: nil,
            grupos: [
                FreeRunGrupo(repeticiones: 5, pasos: [
                    FreeRunPaso(rol: .trabajo, medida: .distancia, metros: 800, objetivo: .zona, zona: 4),
                    FreeRunPaso(rol: .recuperacion, medida: .distancia, metros: 400,
                                objetivo: .zona, zona: 1, modo: .trote),
                ]),
            ],
            vuelta: nil
        )
    }

    /// El calentamiento y la vuelta a la calma con los que nacen al añadirlos.
    static var calentamientoPorDefecto: FreeRunPaso {
        FreeRunPaso(rol: .trabajo, medida: .tiempo, segundos: 600, objetivo: .zona, zona: 2)
    }
    static var vueltaPorDefecto: FreeRunPaso {
        FreeRunPaso(rol: .trabajo, medida: .tiempo, segundos: 300, objetivo: .zona, zona: 1)
    }

    /// La gramática que el motor ejecuta. Las fases van en su orden y sólo
    /// existen las que el atleta puso.
    func estructura() -> RunStructure {
        var fases: [RunPhase] = []
        if let calentamiento {
            fases.append(RunPhase(role: .warmup, elements: [.segment(calentamiento.segmento)]))
        }
        let principal = grupos.filter { !$0.pasos.isEmpty }.map(\.elemento)
        if !principal.isEmpty {
            fases.append(RunPhase(role: .main, elements: principal))
        }
        if let vuelta {
            fases.append(RunPhase(role: .cooldown, elements: [.segment(vuelta.segmento)]))
        }
        return fases
    }

    /// LOS TRAMOS QUE SON EL ENTRENO — los de trabajo de la parte PRINCIPAL.
    ///
    /// Un calentamiento también es un tramo de «trabajo» por su rol (se corre,
    /// no se recupera), así que preguntar sólo por `isWork` daba por bueno un
    /// plan que era un calentamiento y nada más, y hacía que la card del plan
    /// anunciara «10 min · Z2» para una sesión de 4×1000 a Z4. Lo que define el
    /// entreno es la FASE, no el rol.
    func tramosDelEntreno() -> [RunLeg] {
        estructura().expandedLegs().filter { $0.isWork && $0.phaseRole == .main }
    }

    /// Un plan sirve cuando tiene al menos un tramo en la parte principal: sin
    /// eso no hay entreno, sólo calentamiento.
    var esEjecutable: Bool { !tramosDelEntreno().isEmpty }

    /// «10:00 Z2 · 5 × (800 m Z4 + trote 400 m Z1) · 5:00 Z1»
    var linea: String {
        var partes: [String] = []
        if let calentamiento { partes.append(calentamiento.linea) }
        partes.append(contentsOf: grupos.filter { !$0.pasos.isEmpty }.map(\.linea))
        if let vuelta { partes.append(vuelta.linea) }
        return partes.joined(separator: " · ")
    }

    /// Título corto para la card del plan: «5×800m» cuando hay una serie clara,
    /// y el número de tramos cuando el entreno es heterogéneo.
    var resumenCorto: String {
        let trabajo = grupos.flatMap { grupo in grupo.pasos.filter { $0.rol == .trabajo } }
        if grupos.count == 1, let grupo = grupos.first, trabajo.count == 1, let paso = trabajo.first {
            let n = max(1, grupo.repeticiones)
            return n > 1 ? "\(n)×\(paso.medidaTexto)" : paso.medidaTexto
        }
        return "\(tramosDelEntreno().count) tramos"
    }

    /// Duración prevista, en segundos. Best-effort y honesta: los pasos por
    /// distancia sólo suman cuando llevan un ritmo escrito contra el que
    /// estimarlos (ver `FreeRunPaso.segundosEstimados`).
    var segundosEstimados: Int {
        (calentamiento?.segundosEstimados ?? 0)
            + grupos.reduce(0) { $0 + $1.segundosEstimados }
            + (vuelta?.segundosEstimados ?? 0)
    }
}
