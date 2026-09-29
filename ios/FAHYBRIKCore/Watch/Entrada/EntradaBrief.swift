import Foundation

// EL BRIEF DE LA MUÑECA — la estructura REAL del plan en filas de dato (P13).
//
// Lo que se ve al abrir lo de hoy no es «N bloques» ni «1º · algo»: es lo que
// escribió el coach, en el orden en que se hace, cada parte con su dosis y su
// objetivo («6 × 800 m a Z5 · r 2′30″ suave», «4 × 8 · 65–70% 1RM · r 2′»).
//
// Es el espejo de `filasDePasos` + `lineaBrief` del kit del doble
// (`web/components/design-twin/kit-reloj/estructura.ts`), pero leyendo lo que la
// muñeca REALMENTE tiene: el `WorkoutPlan` que construye del detalle del coach
// (tramos por ejercicio, la gramática de correr con sus repeticiones anidadas y las
// tablas de series). Lo que ese plan no trae no se pinta:
//   · sin objetivo por paso en fuerza/erg, la fila dice lo que el plan escribe;
//   · el cue del coach solo llega donde el plan lo guarda por serie (`fichasPorSerie`);
//   · el entorno (calle/cinta) no viaja en el plan: no hay «calle» que decir.
//
// PURO: sin vistas ni WatchConnectivity. Compila en los dos targets y se prueba desde
// FAHYBRIKTests.

/// Una fila del brief: lo que se hace, su dosis, y si es el trabajo o lo de alrededor.
struct EntradaFila: Equatable {
    /// El titular: «6 × 800 m a Z5», «Back Squat», «Calentamiento 5′ a Z2».
    let linea: String
    /// El detalle, ya partido en datos («4 × 8», «65–70% 1RM», «r 2′»). La vista los
    /// une con « · » y la línea solo se parte entre ellos.
    let partes: [String]
    /// La nota del coach para este paso (M8), solo donde el plan la guarda.
    let cue: String?
    /// La parte principal: lleva la marca naranja. Calentar y enfriar, en gris.
    let esTrabajo: Bool

    init(linea: String, partes: [String] = [], cue: String? = nil, esTrabajo: Bool) {
        self.linea = linea
        self.partes = partes
        self.cue = cue
        self.esTrabajo = esTrabajo
    }
}

enum EntradaBrief {

    // MARK: - El contexto de arriba

    /// «Hoy · desde 55 min». El rato es el SUELO que escribe el plan (`desde`), nunca
    /// una estimación con «~»: lo que nadie escribe solo puede añadir (Formato).
    /// Sin duración escrita, solo «Hoy».
    static func contexto(minutos: Int?) -> [String] {
        ["Hoy", Formato.duracionPrevista(minutos)].compactMap { $0 }
    }

    // MARK: - Por qué no hay «Empezar»

    /// Por qué la muñeca no ofrece empezar, dicho llano. Nil cuando sí se puede.
    static func motivo(_ plan: WatchSessionPlan) -> String? {
        switch plan {
        case .run:                  return nil
        case .needsDetail:          return "Falta la sesión en el reloj. Abre \(Marca.nombre) en el iPhone."
        case .phoneOnly(.jumpTest): return "El test de salto se hace con la cámara del iPhone."
        case .phoneOnly(.noBody):   return "Esta sesión se hace desde el iPhone."
        }
    }

    // MARK: - Cómo llegas

    /// La tendencia de 7 días con su sentido en palabras: «▲ +4 en 7 días», «▼ -6 en 7
    /// días». Sin cambio o sin dato, «de 100»: la escala de la puntuación, no un número inventado.
    static func tendencia(delta7d: Int?) -> String {
        guard let d = delta7d, d != 0 else { return "de 100" }
        return d > 0 ? "▲ +\(d) en 7 días" : "▼ \(d) en 7 días"
    }

    // MARK: - El plan entero

    /// Las filas del brief, en el orden del plan. Vacío solo para un plan sin tramos.
    static func filas(_ plan: WorkoutPlan) -> [EntradaFila] {
        var out: [EntradaFila] = []
        for region in plan.blockRegions {
            let tramos = plan.segments(in: region)
            // Un calentamiento o una vuelta a la calma de varios ejercicios sueltos son UNA
            // fila («Calentamiento · 9 ejercicios»), no nueve: no son lo que se juega la
            // sesión y en la muñeca no caben todos. Si alguno es una carrera con su
            // estructura, sí se cuenta por dentro.
            let suelto = !region.phase.isMainWork
                && tramos.count > 1
                && tramos.allSatisfy { $0.runStructureLegs == nil }
            if suelto {
                out.append(EntradaFila(linea: region.title,
                                       partes: ["\(tramos.count) ejercicios"],
                                       esTrabajo: false))
                continue
            }
            for tramo in tramos { out.append(contentsOf: filas(tramo)) }
        }
        return out
    }

    /// Las filas de UN tramo del plan.
    static func filas(_ tramo: WorkoutSegment) -> [EntradaFila] {
        let esTrabajo = tramo.blockPhase.isMainWork
        if let fases = fasesDeCorrer(tramo) {
            return filasDeCorrer(fases, tramo: tramo, esTrabajo: esTrabajo)
        }
        if tramo.isSuperset, let p = tramo.prescription, let porEjercicio = superserie(tramo, p, esTrabajo) {
            return porEjercicio
        }
        if tramo.usesMultiSetStrength, let p = tramo.prescription {
            return [fuerza(tramo, p, esTrabajo)]
        }
        if let p = tramo.prescription, let cabecera = PrescriptionRenderer.wodHeader(p), !esSerieDeUnMovimiento(tramo, p) {
            return [formato(tramo, cabecera, esTrabajo)]
        }
        return [simple(tramo, esTrabajo)]
    }

    // MARK: - Fuerza, superserie, formato, simple

    /// «Back Squat» y debajo «4 × 8 · 65–70% 1RM · 3-1-1 · r 2′».
    private static func fuerza(_ tramo: WorkoutSegment, _ p: Prescription, _ esTrabajo: Bool) -> EntradaFila {
        let dosis = PrescriptionRenderer.rotationDose(p)
        return EntradaFila(
            linea: tramo.title,
            partes: partesDeSeries(p.sets ?? [], dosis: dosis),
            cue: cue(tramo, series: nil),
            esTrabajo: esTrabajo
        )
    }

    /// El trabajo, la carga, el tempo y el descanso de un conjunto de series. El tempo
    /// y el descanso solo si son los mismos en todas: uno pintado sobre las demás sería falso.
    private static func partesDeSeries(_ sets: [PrescriptionSet],
                                       dosis: (work: String?, load: String?)) -> [String] {
        var partes: [String] = []
        if let w = dosis.work { partes.append(EntradaNotacion.pegado(w)) }
        if let l = dosis.load { partes.append(EntradaNotacion.pegado(l)) }
        let tempos = Set(sets.map { $0.tempo ?? "" })
        if tempos.count == 1, let t = tempos.first, !t.isEmpty { partes.append(t) }
        let descansos = Set(sets.compactMap(\.restS))
        if descansos.count == 1, let s = descansos.first, s > 0, sets.allSatisfy({ $0.restS == s }) {
            partes.append("r\(EntradaNotacion.duro)\(EntradaNotacion.duracion(s))")
        }
        return partes
    }

    /// Una superserie: una fila por ejercicio, con SU dosis (A1, A2…). El descanso es
    /// de la vuelta, no de cada ejercicio, así que cada uno lleva el suyo si lo tiene.
    private static func superserie(_ tramo: WorkoutSegment, _ p: Prescription, _ esTrabajo: Bool) -> [EntradaFila]? {
        guard let sets = p.sets, let slots = tramo.supersetSlots, slots.count == sets.count else { return nil }
        var orden: [String] = []
        for s in slots where !orden.contains(s.movement) { orden.append(s.movement) }
        return orden.map { movimiento in
            let indices = slots.indices.filter { slots[$0].movement == movimiento }
            let suyas = indices.map { sets[$0] }
            let sub = Prescription(scheme: p.scheme, modality: p.modality, sets: suyas, rounds: nil,
                                   workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
                                   start: nil, increment: nil)
            return EntradaFila(
                linea: movimiento,
                partes: partesDeSeries(suyas, dosis: PrescriptionRenderer.rotationDose(sub)),
                cue: cue(tramo, series: indices),
                esTrabajo: esTrabajo
            )
        }
    }

    /// Un bloque con reloj (AMRAP, EMOM, For Time, circuito…): su cabecera y sus
    /// movimientos, cada uno con su dosis y su carga («15 Wall Ball 9 kg»).
    private static func formato(_ tramo: WorkoutSegment, _ cabecera: String, _ esTrabajo: Bool) -> EntradaFila {
        let sets = tramo.prescription?.sets ?? []
        let esErg = tramo.kind.isErg
        let movimientos = tramo.declaredComponents.map { c -> String in
            let set = sets.indices.contains(c.id) ? sets[c.id] : nil
            let dosis = EntradaNotacion.medida(set?.measure, sinUnidad: true)
            let carga = EntradaNotacion.objetivo(set?.target, esErg: esErg)
            return EntradaNotacion.pegado([dosis, c.name, carga].compactMap { $0 }.joined(separator: " "))
        }
        return EntradaFila(linea: EntradaNotacion.pegado(cabecera),
                           partes: movimientos, cue: nil, esTrabajo: esTrabajo)
    }

    /// Una serie o un continuo de UN solo movimiento (un ski a 8 × 250 m, un remo a
    /// ritmo) no es un formato con reloj: se cuenta como un ejercicio, con su nombre.
    private static func esSerieDeUnMovimiento(_ tramo: WorkoutSegment, _ p: Prescription) -> Bool {
        (p.scheme == .intervals || p.scheme == .steady) && tramo.declaredComponents.count <= 1
    }

    /// Un ejercicio suelto (una estación, un ergómetro, un trote sin estructura, una
    /// serie repetida): su nombre y su dosis, en la grafía de la muñeca. Una sola vez,
    /// todo en la línea («SkiErg 500 m a 1:50/500m»); repetido, el nombre arriba y
    /// «6 × 15 m · r 1′30″» debajo. Un reparto de dobles se dice también.
    private static func simple(_ tramo: WorkoutSegment, _ esTrabajo: Bool) -> EntradaFila {
        let p = tramo.prescription
        let set = p?.sets?.first
        // «8 × 250 m»: las series salen de la tabla de sets, o de las rondas de un `intervals`.
        let veces = p.flatMap(PrescriptionRenderer.repetitionCount)
            ?? (p?.scheme == .intervals ? tramo.formatRounds : nil) ?? 1
        let repetido = veces > 1
        let medida = EntradaNotacion.medida(set?.measure, sinUnidad: repetido)
            ?? EntradaNotacion.medida(medidaEscalar(tramo), sinUnidad: repetido)
        let objetivos = objetivosDe(tramo, set: set)
        let aRitmo = objetivos.first(where: EntradaNotacion.esRitmoOZona)
        let otros = objetivos.filter { $0 != aRitmo }
        let dosis = medida.map { m in aRitmo.map { "\(m) \($0)" } ?? m }

        var linea = tramo.title
        var partes: [String] = []
        if repetido {
            if let dosis { partes.append("\(veces)\(EntradaNotacion.por)\(dosis)") }
            partes += otros
            if p?.scheme != .emom, let s = set?.restS ?? p?.restS, s > 0 {
                partes.append("r\(EntradaNotacion.duro)\(EntradaNotacion.duracion(s))")
            }
        } else {
            if let dosis { linea = "\(tramo.title) \(dosis)" } else { partes += aRitmo.map { [$0] } ?? [] }
            partes += otros
        }
        if let reparto = tramo.doblesSplit?.liveSplitLine { partes.append(reparto) }
        return EntradaFila(linea: linea, partes: partes, esTrabajo: esTrabajo)
    }

    /// Lo que escribe el ejercicio cuando el plan no trae `prescription` (o la trae sin
    /// medida): los escalares del tramo.
    private static func medidaEscalar(_ t: WorkoutSegment) -> Measure? {
        if let r = t.targetReps, r > 0 { return .reps(r) }
        if let m = t.targetDistanceMeters, m > 0 { return .distance(meters: m) }
        if let c = t.targetCalories, c > 0 { return .calories(c) }
        if let s = t.targetDurationSeconds, s > 0 { return .duration(seconds: s) }
        return nil
    }

    /// Los objetivos del ejercicio en la grafía de la muñeca: el de la serie manda sobre
    /// el del bloque; sin `prescription`, los escalares (ritmo, zona, RPE, carga).
    private static func objetivosDe(_ t: WorkoutSegment, set: PrescriptionSet?) -> [String] {
        let esErg = t.kind.isErg
        if let target = set?.target ?? t.prescription?.target, let o = EntradaNotacion.objetivo(target, esErg: esErg) {
            return [o]
        }
        var escalares: [Target] = []
        if let p = t.targetPaceSecondsPerKm, p > 0 { escalares.append(.pace(unit: .perKm, valueS: p, minS: nil, maxS: nil)) }
        if let z = t.targetZone { escalares.append(.hrZone(value: Double(z.rawValue), min: nil, max: nil)) }
        if let r = t.targetRpe, r > 0 { escalares.append(.rpe(value: r, min: nil, max: nil)) }
        if let kg = t.loadKg, kg > 0 { escalares.append(.kg(value: kg, min: nil, max: nil)) }
        return escalares.compactMap { EntradaNotacion.objetivo($0, esErg: esErg) }
    }

    /// El cue del coach: la nota del ejercicio, solo si el plan la guarda y es la misma
    /// en las series que cuentan (si difiere, ninguna se pinta sobre las demás).
    private static func cue(_ tramo: WorkoutSegment, series: [Int]?) -> String? {
        guard let fichas = tramo.fichasPorSerie else { return nil }
        let quienes = series.map { $0.compactMap { fichas.indices.contains($0) ? fichas[$0] : nil } } ?? fichas
        let notas = Set(quienes.compactMap(\.nota))
        return notas.count == 1 ? notas.first : nil
    }

    // MARK: - Correr: la gramática con sus repeticiones

    /// Las fases de la carrera del tramo: su estructura tal cual la escribió el coach
    /// (con los ×N anidados), o —si solo trae el plano— las piernas que se derivan de él.
    private static func fasesDeCorrer(_ tramo: WorkoutSegment) -> [RunPhase]? {
        if let s = tramo.prescription?.structure, !s.isEmpty { return s }
        guard let piernas = tramo.runStructureLegs, !piernas.isEmpty else { return nil }
        var fases: [RunPhase] = []
        for leg in piernas {
            let el = RunElement.segment(RunSegment(
                kind: leg.kind == .recovery ? .recovery : .work,
                measure: leg.measure, target: leg.target, resolved: leg.resolved,
                inclinePct: leg.inclinePct, cadenceSpm: leg.cadenceSpm, recoveryMode: leg.recoveryMode))
            if let ultima = fases.last, ultima.role == leg.phaseRole {
                fases[fases.count - 1] = RunPhase(role: ultima.role, elements: ultima.elements + [el])
            } else {
                fases.append(RunPhase(role: leg.phaseRole, elements: [el]))
            }
        }
        return fases
    }

    private static func filasDeCorrer(_ fases: [RunPhase], tramo: WorkoutSegment, esTrabajo: Bool) -> [EntradaFila] {
        var out: [EntradaFila] = []
        for fase in fases {
            let nombre = RunLegDisplay.nombreDeParte(fase.role)
            let principal = esTrabajo && fase.role == .main
            var yaNombrada = false
            for b in bloques(fase.elements) {
                // Un tramo único se nombra («Calentamiento 10′ a Z2», «Carrera 20′ a Z4»). Una
                // serie repetida o una escalera, no: «6 × 800 m a Z5» ya dice qué es.
                // Solo la primera de la fase: un progresivo no repite «Carrera» en cada paso.
                let prefijo = b.esSerie || !b.esTrabajo || yaNombrada ? nil : (nombre ?? nombreDelTramo(tramo))
                yaNombrada = yaNombrada || b.esTrabajo
                let linea = prefijo.map { "\($0) \(b.texto)" } ?? b.texto
                out.append(EntradaFila(linea: linea, partes: b.detalles, esTrabajo: principal))
            }
        }
        return out
    }

    private static func nombreDelTramo(_ tramo: WorkoutSegment) -> String? {
        let t = tramo.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    /// Un renglón de la estructura ya escrito.
    private struct Bloque {
        var texto: String
        var detalles: [String]
        /// Trabajo de verdad (no una recuperación suelta): decide si se nombra.
        var esTrabajo = true
        /// Una serie repetida o una escalera: ya dice qué es y un nombre delante sobra.
        var esSerie = false
    }

    private enum Elemento {
        case grupo(trabajo: RunSegment, veces: Int, rec: RunSegment?)
        case bloque(Bloque)
    }

    private static func mismoTrabajo(_ a: RunSegment, _ b: RunSegment) -> Bool {
        a.measure == b.measure && a.target == b.target
            && a.inclinePct == b.inclinePct && a.cadenceSpm == b.cadenceSpm
    }

    private static func mismaRecuperacion(_ a: RunSegment?, _ b: RunSegment?) -> Bool {
        switch (a, b) {
        case (nil, nil): return true
        case let (x?, y?): return x.measure == y.measure && x.target == y.target && x.recoveryMode == y.recoveryMode
        default: return false
        }
    }

    /// Recorre una secuencia de elementos y la cuenta como la diría el coach: los
    /// tramos iguales seguidos («6 × 800 m»), la recuperación como detalle de su
    /// trabajo, las repeticiones anidadas («2 × (4 × 2′)») y la recuperación que sigue
    /// a una repetición como «entre tandas».
    private static func bloques(_ els: [RunElement]) -> [Bloque] {
        var items: [Elemento] = []
        var i = 0
        while i < els.count {
            switch els[i] {
            case let .repeatBlock(veces, dentro):
                let hijos = bloques(dentro)
                i += 1
                guard veces > 0, !hijos.isEmpty else { continue }
                let cuerpo: String
                if hijos.count == 1, !hijos[0].texto.contains(Formato.signoPor) {
                    cuerpo = hijos[0].texto
                } else {
                    cuerpo = "(" + hijos.map(\.texto).joined(separator: " + ") + ")"
                }
                items.append(.bloque(Bloque(texto: "\(veces)\(EntradaNotacion.por)\(cuerpo)",
                                            detalles: hijos.flatMap(\.detalles), esSerie: true)))
            case let .segment(s) where s.kind == .recovery:
                i += 1
                if case .bloque(var previo)? = items.last, previo.esTrabajo, previo.esSerie,
                   let entre = EntradaNotacion.recuperacion(s, conR: false) {
                    // Tras una repetición, la recuperación separa las tandas.
                    previo.detalles.append("\(entre) entre tandas")
                    items[items.count - 1] = .bloque(previo)
                } else if let frase = EntradaNotacion.recuperacion(s, conR: false) {
                    items.append(.bloque(Bloque(texto: "Recupera \(frase)", detalles: [], esTrabajo: false)))
                }
            case let .segment(s):
                var veces = 1
                var j = i + 1
                var rec: RunSegment?
                if j < els.count, case let .segment(r) = els[j], r.kind == .recovery { rec = r; j += 1 }
                // Los trabajos idénticos que siguen son la misma serie repetida. El último
                // puede no llevar recuperación detrás: sigue siendo la misma serie.
                while j < els.count, case let .segment(w) = els[j], w.kind == .work, mismoTrabajo(w, s) {
                    var k = j + 1
                    var r2: RunSegment?
                    if k < els.count, case let .segment(r) = els[k], r.kind == .recovery { r2 = r; k += 1 }
                    guard r2 == nil ? k >= els.count : mismaRecuperacion(r2, rec) else { break }
                    veces += 1
                    j = k
                }
                items.append(.grupo(trabajo: s, veces: veces, rec: rec))
                i = j
            }
        }
        return juntarEscalera(items).compactMap { item in
            switch item {
            case let .bloque(b): return b
            case let .grupo(t, veces, rec): return bloque(trabajo: t, veces: veces, rec: rec)
            }
        }
    }

    /// Una escalera (1200/1000/800) no se cuenta como tres filas ni se colapsa a su
    /// primer tramo: se escribe la secuencia, si comparten objetivo y recuperación.
    private static func juntarEscalera(_ items: [Elemento]) -> [Elemento] {
        var out: [Elemento] = []
        var i = 0
        while i < items.count {
            guard case let .grupo(t0, 1, r0) = items[i] else { out.append(items[i]); i += 1; continue }
            var medidas = [t0.measure]
            var j = i + 1
            while j < items.count, case let .grupo(t, 1, r) = items[j],
                  t.target == t0.target, t.inclinePct == t0.inclinePct, t.cadenceSpm == t0.cadenceSpm,
                  mismaRecuperacion(r, r0) || (r == nil && j == items.count - 1) {
                medidas.append(t.measure)
                j += 1
            }
            if medidas.count > 1, let secuencia = EntradaNotacion.secuencia(medidas) {
                let objetivo = EntradaNotacion.objetivo(t0.target).map { " \($0)" } ?? ""
                out.append(.bloque(Bloque(texto: secuencia + objetivo, detalles: detalles(t0, rec: r0), esSerie: true)))
                i = j
            } else {
                out.append(items[i])
                i += 1
            }
        }
        return out
    }

    private static func bloque(trabajo: RunSegment, veces: Int, rec: RunSegment?) -> Bloque {
        // Un tramo sin medida que decir se nombra por lo que sí trae, nunca por una raya.
        let dosis = EntradaNotacion.dosis(trabajo) ?? EntradaNotacion.objetivo(trabajo.target) ?? "Tramo"
        let texto = veces > 1 ? "\(veces)\(EntradaNotacion.por)\(dosis)" : dosis
        return Bloque(texto: texto, detalles: detalles(trabajo, rec: rec), esSerie: veces > 1)
    }

    /// Lo que acompaña a un tramo: su inclinación, su cadencia y su recuperación.
    private static func detalles(_ trabajo: RunSegment, rec: RunSegment?) -> [String] {
        var d: [String] = []
        if let pct = trabajo.inclinePct, pct > 0 { d.append("al\(EntradaNotacion.duro)\(Formato.esDecimal(pct))\(EntradaNotacion.duro)%") }
        if let spm = trabajo.cadenceSpm, spm > 0 { d.append("\(spm)\(EntradaNotacion.duro)pasos/min") }
        if let r = rec.flatMap({ EntradaNotacion.recuperacion($0) }) { d.append(EntradaNotacion.pegado(r)) }
        return d
    }
}
