import Foundation

// MARK: - PrescriptionRenderer
//
// THE single source of truth for turning a structured `Prescription` into
// athlete-readable text, branching by MODALITY (not the old binary
// strength-vs-everything-else split). Both the pre-workout brief and the
// exercise-detail sheet consume this, so a squat pyramid, a Z1 bike, a 4×400m
// run interval and a cal-row all render correctly from ONE place.
//
// Design intent (mirrors the wire model in shared/domain/prescription):
//   · strength    → per-set rows (set#, reps, %RM|kg|RIR|RPE|BW, tempo, rest);
//                   uniform sets collapse to "N× …", pyramids expand one row/set.
//   · run         → distance|duration × pace(/km)|zone|RPE; intervals add rest.
//   · ergo        → distance|duration|calories × pace(/500m)|RPE|zone.
//   · functional  → reps|distance × load|bodyweight.
//   · core/mob    → reps|duration (+ optional RPE).
//
// Nothing is fabricated: a field absent from the prescription is simply omitted.

enum PrescriptionRenderer {

    // MARK: - Per-set table row (strength / any explicit-set modality)

    /// One displayable set row for a per-set table. `index` is 1-based.
    struct SetRow: Identifiable, Equatable {
        let id: Int
        let index: Int
        /// Work column, e.g. "5", "12", "1 km", "0:40", "15 cal". Nil cuando ese set
        /// no declara medida — nunca una raya: la celda decide (§7).
        let work: String?
        /// Intensity column, e.g. "75% 1RM", "120 kg", "RPE 8", "RIR 2", "BW".
        let load: String?
        /// Tempo column, e.g. "3-1-1-0".
        let tempo: String?
        /// Rest column, e.g. "2:00", "90s".
        let rest: String?
    }

    /// A modality-tagged, athlete-readable line (used for non-strength cards and
    /// the WOD component list). `headline` is the dominant measure; `detail` is
    /// the secondary intensity/rest line.
    struct Line: Equatable {
        let headline: String?
        let pace: String?
        let detail: String?
        let zone: HRZone?
    }

    // MARK: - Strength / explicit-set table

    /// Per-set rows for a strength (or any explicit-`sets`) prescription. Returns
    /// nil when there are no usable sets. When EVERY set is identical the caller
    /// can collapse to a single "N× …" header (see `collapsedSetsLabel`).
    static func setRows(_ p: Prescription) -> [SetRow]? {
        guard let sets = p.sets, !sets.isEmpty else { return nil }
        var rows: [SetRow] = []
        for (i, s) in sets.enumerated() {
            rows.append(
                SetRow(
                    id: i,
                    index: i + 1,
                    work: measureWork(s.measure),
                    load: targetLoad(s.target),
                    tempo: s.tempo,
                    rest: s.restS.map { Formato.clock($0, subMinuto: .segundos) }
                )
            )
        }
        return rows.isEmpty ? nil : rows
    }

    /// True when every set carries the SAME work / load / tempo / rest — the
    /// table collapses to one "N× …" line. A pyramid (sets differ) stays expanded.
    static func setsAreUniform(_ p: Prescription) -> Bool {
        guard let rows = setRows(p) else { return false }
        guard rows.count > 1 else { return true }
        let first = rows[0]
        return rows.allSatisfy {
            $0.work == first.work && $0.load == first.load
                && $0.tempo == first.tempo && $0.rest == first.rest
        }
    }

    /// Collapsed header for a uniform set table, e.g. "4 × 5 · 75% 1RM · 2:00".
    static func collapsedSetsLabel(_ p: Prescription) -> String? {
        guard let rows = setRows(p), let first = rows.first else { return nil }
        var parts: [String] = []
        // Sin medida declarada el encabezado es el CONTADOR de series, que sí se
        // sabe («4 series»). Antes salía «4 × —» (§7).
        parts.append(first.work.map { "\(rows.count) × \($0)" } ?? "\(rows.count) series")
        if let load = first.load { parts.append(load) }
        if let tempo = first.tempo { parts.append("tempo \(tempo)") }
        if let rest = first.rest { parts.append("descanso \(rest)") }
        return parts.joined(separator: " · ")
    }

    /// LA DOSIS DE UN EJERCICIO QUE ENTRA EN UNA ROTACIÓN, en las dos líneas que
    /// caben en una fila: el TRABAJO arriba y la CARGA debajo.
    ///
    /// Existe para la superserie de la previa, donde el ejercicio no puede traerse
    /// su tabla de series entera (son tres ejercicios en una tarjeta) pero tampoco
    /// puede colapsarse a la primera serie: un 4×8 a 100 kg y una pirámide de 100 a
    /// 115 se leerían igual, y eso son tres series inventadas (§7). Así que:
    ///
    /// - Todas las series con la misma medida → «4 × 8». Distintas → la secuencia
    ///   tal y como la escribe el coach, «10/10/8/8/6», que ya dice cuántas son.
    ///   Alguna sin medida → solo el contador, «5 series», que sí se sabe.
    /// - Todas las series con la misma carga → esa carga. Cuando la carga SUBE (o
    ///   baja) serie a serie es una progresión y se pinta como tal, «100 → 115 kg»:
    ///   no como banda con guion, porque «100-115 kg» se leería como «elige lo que
    ///   quieras ahí dentro» y en una pirámide el orden importa. Y si sube y baja,
    ///   nada: ahí la flecha también mentiría, y el atleta tiene el peso de cada
    ///   serie delante, una a una, en el entreno en vivo.
    static func rotationDose(_ p: Prescription) -> (work: String?, load: String?) {
        guard let rows = setRows(p), !rows.isEmpty else { return (nil, nil) }

        let works = rows.map(\.work)
        let work: String?
        if let primera = works.first ?? nil, works.allSatisfy({ $0 == primera }) {
            work = rows.count > 1 ? "\(rows.count) \(Formato.signoPor) \(primera)" : primera
        } else if works.allSatisfy({ $0 != nil }) {
            work = works.compactMap { $0 }.joined(separator: "/")
        } else {
            work = "\(rows.count) series"
        }

        let loads = rows.map(\.load)
        let uniforme = (loads.first ?? nil).flatMap { primera in
            loads.allSatisfy { $0 == primera } ? primera : nil
        }
        return (work, uniforme ?? progressionLoad(p.sets ?? []))
    }

    /// CUÁNTAS VECES SE REPITE LA MISMA DOSIS — el «4 ×» de un 4×10, el «5 ×» de un
    /// 5×500 m. Nil cuando los sets NO son repeticiones: un solo set, o la ROTACIÓN
    /// de un bloque plegado, donde cada set es un movimiento distinto (`conditioningFold`
    /// y el builder funcional escriben siempre el nombre en `note`) y su cuenta no
    /// multiplica nada — «3 ×» delante de remo/ski/cinta sería mentira (§7).
    ///
    /// El conteo es DOSIS, no decoración: «4 × 10» y «10» son dos prescripciones
    /// distintas, y hasta hoy la previa solo lo decía cuando el esquema era
    /// literalmente `.intervals`, así que un 4×10 de fuerza llegaba a la pantalla de
    /// antes de empezar como «10 · Corporal · descanso 15s».
    static func repetitionCount(_ p: Prescription) -> Int? {
        guard let sets = p.sets, sets.count > 1 else { return nil }
        guard Set(sets.map { $0.note ?? "" }).count == 1 else { return nil }
        guard setsAreUniform(p) else { return nil }
        return sets.count
    }

    // MARK: - Single-line summary (run / ergo / functional / core / mobility)
    //
    // For a non-strength line the athlete reads one card, not a table. We pick the
    // dominant measure (from the block target + the single set, if present) and
    // attach pace / zone / load / RPE / rest as secondary detail.

    static func summaryLine(_ p: Prescription) -> Line {
        // UNA CARRERA CON ESTRUCTURA SE CUENTA POR SU ESTRUCTURA. El aplanado (un set,
        // un `rest_s`) es el SUELO para lo que no la trae; cuando la trae, decirlo con
        // el suelo miente dos veces: pierde el ×N (un 16×500 se leía «500 m») y llama
        // «descanso» a un minuto que se corre al trote en Z2 — el atleta lee eso y se
        // queda parado, que es justo lo contrario del entreno.
        if let estructurada = structuredRunLine(p) { return estructurada }
        let set = p.sets?.first
        let measure = set?.measure
        // Intensity precedence: a per-set target overrides the block-level one
        // (a steady ride carries the block target; an interval carries per-set).
        let target = set?.target ?? p.target

        let modality = p.modality ?? set?.modality ?? .other
        let work = measureWork(measure)
        // EL MULTIPLICADOR VA EN EL TITULAR, pegado a la medida, porque es parte de
        // la dosis y no un apunte: lo que el atleta lee en grande es «4 × 10», no
        // «10» con un «4×» colgando del detalle en gris. Sin medida escrita el
        // titular es el contador, que sí se sabe («4 series»), igual que hace
        // `collapsedSetsLabel` — un solo formateador para el mismo concepto (§2).
        let repeats = repetitionCount(p)
        let headline: String? = {
            guard let repeats else { return work }
            guard let work else { return "\(repeats) series" }
            return "\(repeats) × \(work)"
        }()
        let pace = paceString(target, isErg: modality.isErg)
        let zone = zoneFromTarget(target)

        // Detail line: everything that isn't the headline measure or pace/zone.
        var detail: [String] = []
        if let load = targetLoad(target), !isPaceOrZone(target) {
            detail.append(load)
        }
        // An EMOM's block-level `rest_s` is its TRANSITION, already spelled out by
        // `wodHeader` as part of the split ("45/15"). Repeating it here as
        // "descanso 0:15" would report the same 15 seconds twice; a per-SET rest
        // still shows, because that is a different number.
        let blockRest = p.scheme == .emom ? nil : p.restS
        if let restS = set?.restS ?? blockRest, restS > 0 {
            detail.append("descanso \(Formato.clock(restS, subMinuto: .segundos))")
        }
        return Line(
            headline: headline,
            pace: pace,
            detail: detail.isEmpty ? nil : detail.joined(separator: " · "),
            zone: zone
        )
    }

    // MARK: - La dosis de una carrera ESTRUCTURADA
    //
    // La gramática de correr (#61) es un árbol de fases con su repetición, y cada tramo
    // lleva SU medida, SU objetivo y —la recuperación— SU modo. Todo eso cabe en la
    // línea de una tarjeta si se dice lo que define la sesión:
    //
    //     titular   → el trabajo de la fase PRINCIPAL: «16 × 500 m», y si los tramos
    //                 son desiguales la secuencia, «1200/1000/800 m» (una pirámide no
    //                 se colapsa a su primer tramo).
    //     objetivo  → la zona / el ritmo / el RPE del trabajo, cuando TODOS los tramos
    //                 llevan el mismo. Si difieren no se resume: uno de ellos pintado
    //                 sobre los demás sería falso (§7).
    //     detalle   → LA RECUPERACIÓN, dicha como se hace (ver `fraseDeRecuperacion`).
    //
    // Se cuenta la fase principal, no el árbol entero: un calentamiento también es
    // trabajo, y contándolo un «10' + 5×800» anunciaría «6 × …». Misma regla que
    // `RunLegDisplay.serie` y el bisel.
    //
    // Nil cuando no hay estructura o cuando no queda nada honesto que decir de ella —
    // y entonces manda el aplanado, que es el suelo de siempre.

    static func structuredRunLine(_ p: Prescription) -> Line? {
        guard let structure = p.structure, !structure.isEmpty else { return nil }
        let legs = structure.expandedLegs()
        let principales = legs.filter { $0.phaseRole == .main }
        // Una estructura que sólo calienta no tiene fase principal: se cuenta lo que
        // hay, igual que hace el contador de series.
        let cuentan = principales.isEmpty ? legs : principales
        let trabajos = cuentan.filter(\.isWork)
        guard !trabajos.isEmpty else { return nil }

        // El titular. Sin medida en algún tramo no hay dosis que sumar (§7): manda el
        // aplanado.
        guard let headline = tituloDeTrabajos(trabajos) else { return nil }

        // El objetivo del trabajo, sólo si es el MISMO en todos los tramos.
        let objetivo: RunSegmentTarget? = {
            let primero = trabajos[0].target
            return trabajos.allSatisfy { $0.target == primero } ? primero : nil
        }()
        var pace: String? = nil
        var zone: HRZone? = nil
        var detalle: [String] = []
        switch objetivo {
        case let .pace(valueS, minS, maxS):
            // El mismo «@ 4:00–4:14/km» del resto de la app: un solo formateador (§2).
            pace = paceString(.pace(unit: .perKm, valueS: valueS, minS: minS, maxS: maxS), isErg: false)
        case let .paceZone(z), let .hrZone(z):
            zone = HRZone(rawValue: z)
        case .rpe:
            if let rpe = trabajos[0].rpeLabel { detalle.append(rpe) }
        case .unknown, .none:
            break
        }

        // La recuperación. Todas iguales o no se resume — una distinta por serie no
        // cabe en una línea, y decir sólo la primera sería inventarse las demás.
        let recuperaciones = cuentan.filter(\.isRecovery)
        if let primeraRec = recuperaciones.first {
            let iguales = recuperaciones.allSatisfy {
                $0.measure == primeraRec.measure
                    && $0.recoveryMode == primeraRec.recoveryMode
                    && $0.target == primeraRec.target
            }
            if iguales, let frase = fraseDeRecuperacion(primeraRec) { detalle.append(frase) }
        } else if let restS = p.restS, restS > 0 {
            // La estructura no declara recuperaciones pero el plano sí trae un descanso
            // entre tramos: es un dato real del coach y no se tira.
            detalle.append("descanso \(Formato.clock(restS, subMinuto: .segundos))")
        }

        return Line(headline: headline,
                    pace: pace,
                    detail: detalle.isEmpty ? nil : detalle.joined(separator: " · "),
                    zone: zone)
    }

    /// LA RECUPERACIÓN, DICHA COMO SE HACE — «recuperación 1:00 suave en Z2».
    ///
    /// Un minuto al trote en Z2 NO es un descanso, y llamarlo así hace que el atleta lo
    /// haga mal: se queda parado, y el fartlek entero pierde el sentido (el OFF también
    /// se corre). Sólo se dice «descanso» cuando de verdad se para —modo `parado`— y
    /// cuando el modo NO SE SABE, que es lo que llega de una prescripción plana: allí el
    /// número nació de un `rest_s`, así que «descanso» es exactamente lo que el coach
    /// escribió y no se le cambia la palabra.
    ///
    /// La palabra del modo sale de `RunLegDisplay.recoveryModeWord`, la misma que dicen
    /// el entreno en vivo y la muñeca: la previa no puede llamarlo de otra manera.
    static func fraseDeRecuperacion(_ leg: RunLeg) -> String? {
        guard leg.isRecovery, let medida = measureWork(leg.measure.asMeasure) else { return nil }
        switch leg.recoveryMode {
        case .parado, .none:
            return "descanso \(medida)"
        case .trote, .caminar:
            let modo = RunLegDisplay.recoveryModeWord(leg.recoveryMode)
            let zona = leg.zoneLabel.map { "en \($0)" }
            return ["recuperación", medida, modo, zona]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " ")
        }
    }

    /// EL TITULAR DEL TRABAJO: «16 × 500 m» cuando los tramos son iguales,
    /// «1200/1000/800 m» cuando no.
    ///
    /// La secuencia se escribe desde los METROS, no juntando lo que diría el
    /// formateador de cada tramo por separado: `Formato.distancia` pasa a kilómetros a
    /// partir de 1.000 —lo correcto para UNA dosis, «1 km»— y una pirámide salía
    /// «1,2 km/1 km/800 m», que no se lee ni se compara. Una serie de pista se escribe
    /// en metros y con la unidad UNA vez, como la escribe el coach en la pizarra.
    /// Nil cuando algún tramo no declara medida: sin dosis completa manda el aplanado.
    private static func tituloDeTrabajos(_ trabajos: [RunLeg]) -> String? {
        func repetido(_ dosis: String) -> String {
            trabajos.count > 1 ? "\(trabajos.count) \(Formato.signoPor) \(dosis)" : dosis
        }
        let metros = trabajos.compactMap(\.distanceMeters)
        if metros.count == trabajos.count, let primero = metros.first {
            guard !metros.allSatisfy({ $0 == primero }) else {
                return Formato.distancia(Double(primero)).map(repetido)
            }
            return "\(metros.map(String.init).joined(separator: "/")) m"
        }
        let segundos = trabajos.compactMap(\.durationSeconds)
        if segundos.count == trabajos.count, let primero = segundos.first {
            func reloj(_ s: Int) -> String { Formato.clock(s, subMinuto: .segundos) }
            guard !segundos.allSatisfy({ $0 == primero }) else { return repetido(reloj(primero)) }
            return segundos.map(reloj).joined(separator: "/")
        }
        // Tramos de distinta NATURALEZA en la misma serie (unos por metros, otros por
        // tiempo): no hay unidad que compartir, así que cada uno se dice entero.
        let dosis = trabajos.compactMap { measureWork($0.measure.asMeasure) }
        guard dosis.count == trabajos.count, let primera = dosis.first else { return nil }
        return dosis.allSatisfy({ $0 == primera }) ? repetido(primera) : dosis.joined(separator: "/")
    }

    // MARK: - Cabecera de formato (todo esquema con reloj)

    /// LA CABECERA DE FORMATO de un bloque: el esquema y los números que lo definen
    /// — "AMRAP · 12:00", "EMOM · 45/15 · cada 1:00 · 10 rondas", "5 rondas ·
    /// descanso 1:00", "Tabata · 20/10 · 8 rondas", "Death By · desde 1 · +1 por ronda".
    ///
    /// UN SOLO FORMATEADOR (§2 del contrato). Había DOS: este, que solo conocía
    /// amrap/emom/for_time, y `conditioningFormatLabel`, escondido dentro de la vista
    /// del entreno activo, que cubría el resto. La previa leía el primero, así que un
    /// circuito, un Tabata, un Death By o una sim de HYROX llegaban a la pantalla de
    /// antes de empezar SIN cabecera, mientras que dentro del entreno sí la tenían.
    ///
    /// Nil solo para lo que NO es un formato con reloj (fuerza, calentamiento, vuelta
    /// a la calma) y para el esquema al que no le queda ningún número que decir: ahí
    /// el título del bloque ya lo dice todo, y una cabecera vacía sería ruido.
    static func wodHeader(_ p: Prescription) -> String? {
        /// El nº de rondas de un esquema. `.intervals` no siempre lo escribe: sus
        /// bouts SON los sets, así que la lista los cuenta (mismo criterio que
        /// `WorkoutSegment.formatRounds`, del que esta función es ahora la única
        /// fuente para la cabecera).
        func rounds() -> Int? {
            if let r = p.rounds, r > 0 { return r }
            if p.scheme == .intervals, let n = p.sets?.count, n > 0 { return n }
            return nil
        }
        func rondas(_ n: Int) -> String { "\(n) ronda\(n == 1 ? "" : "s")" }
        /// El reparto trabajo/transición de un ciclo, cuando está escrito.
        func split() -> String? {
            guard let w = p.workS, w > 0 else { return nil }
            guard let r = p.restS, r > 0 else { return "\(w)s" }
            return "\(w)/\(r)"
        }

        switch p.scheme {
        case .amrap:
            if let cap = p.totalS, cap > 0 { return "AMRAP · \(Formato.clock(cap, subMinuto: .segundos))" }
            return "AMRAP"
        case .emom:
            // `work_s` is the WORK WINDOW, not the cadence (the server's shape — see
            // EmomPlan). A plain EMOM has no transition, so the window IS the cycle
            // and this still reads "cada 1:00"; an INTERVAL EMOM leads with its
            // split, because printing "cada 0:45" for a 45/15 would name a cadence
            // the timer never runs.
            var parts = ["EMOM"]
            let work = p.workS ?? 0
            let transition = p.restS ?? 0
            if work > 0 {
                parts.append(transition > 0
                    ? "\(work)/\(transition) · cada \(Formato.clock(work + transition, subMinuto: .segundos))"
                    : "cada \(Formato.clock(work, subMinuto: .segundos))")
            }
            if let rounds = p.rounds, rounds > 0 { parts.append("\(rounds) rondas") }
            return parts.joined(separator: " · ")
        case .forTime:
            var parts = ["For Time"]
            if let rounds = p.rounds, rounds > 0 { parts.insert("\(rounds) rondas", at: 1) }
            if let cap = p.totalS, cap > 0 { parts.append("cap \(Formato.clock(cap, subMinuto: .segundos))") }
            return parts.joined(separator: " · ")
        case .tabata:
            // Un Tabata ES la forma del EMOM con otros números (20/10 × 8), y por eso
            // se rotula igual: reparto primero, rondas después.
            var parts = ["Tabata"]
            if let s = split() { parts.append(s) }
            if let n = rounds() { parts.append(rondas(n)) }
            return parts.joined(separator: " · ")
        case .intervals:
            // "Series" es la palabra que se usa en el gimnasio; `displayName` es el
            // vocabulario canónico del cable, en inglés, y no se enseña (§3).
            var parts = ["Series"]
            if let s = split() { parts.append(s) }
            if let n = rounds() { parts.append("\(n) series") }
            return parts.count > 1 ? parts.joined(separator: " · ") : nil
        case .deathBy:
            // El arranque y el incremento SON el protocolo: sin ellos no hay nada que
            // decir que el nombre no diga ya.
            var parts = ["Death By"]
            if let start = p.start, start > 0 { parts.append("desde \(start)") }
            if let inc = p.increment, inc > 0 { parts.append("+\(inc) por ronda") }
            return parts.count > 1 ? parts.joined(separator: " · ") : "Death By"
        case .rounds:
            // Un circuito se nombra por sus rondas y su descanso — no lleva la palabra
            // "Rounds" delante, que en castellano sobra («5 rondas · descanso 1:00»).
            var parts: [String] = []
            if let n = rounds() { parts.append(rondas(n)) }
            if let rest = p.restS, rest > 0 { parts.append("descanso \(Formato.clock(rest, subMinuto: .segundos))") }
            return parts.isEmpty ? nil : parts.joined(separator: " · ")
        case .chipper, .ladder, .hyroxSim:
            var parts = [p.scheme.displayName]
            if let n = rounds(), n > 1 { parts.append(rondas(n)) }
            if let cap = p.totalS, cap > 0 { parts.append("cap \(Formato.clock(cap, subMinuto: .segundos))") }
            return parts.joined(separator: " · ")
        case .steady:
            guard let t = p.totalS, t > 0 else { return nil }
            return "Continuo · \(Formato.clock(t, subMinuto: .segundos))"
        case .superset:
            // Tampoco lleva reloj, pero SÍ tiene algo que el título no dice: que los
            // ejercicios rotan, y cuántas rondas. Sin esta línea la superserie se
            // lee como una tabla de series rectas, que es justo lo que no es.
            //
            // «Rondas», no «vueltas»: es la palabra que ya usan el EMOM y el circuito
            // (`Vocab.ronda`), y la que el atleta lee en vivo sobre el sujeto. Dos
            // palabras para lo mismo en dos pantallas del mismo entreno son dos
            // conceptos para quien las lee.
            guard let n = rounds(), n > 0 else { return Vocab.superserie }
            return "\(Vocab.superserie) · \(rondas(n))"
        case .sets, .warmup, .cooldown:
            // No son formatos con reloj: el título del bloque y la tabla de series ya
            // los cuentan enteros.
            return nil
        }
    }

    // MARK: - Measure → work string

    /// La dosis de una medida en texto, con su BANDA cuando el coach prescribió una
    /// («12-15», «0:40-1:00», «800-1000 m»). Nil cuando no hay medida, es cero o es
    /// desconocida — nunca un guion (§7).
    ///
    /// UN solo formateador (§2): antes esto estaba escrito dos veces —aquí y en
    /// `WorkoutSegment.emomWorkString`— con la única diferencia de que el EMOM
    /// deletrea la unidad de las repeticiones. Esa diferencia es ahora el
    /// parámetro, y así una banda no puede aparecer en una pantalla y perderse en
    /// la de al lado.
    static func measureWork(_ m: Measure?, deletreandoReps: Bool = false) -> String? {
        guard let m else { return nil }
        // El techo se pinta con el MISMO formateador que el suelo, para que una
        // banda no mezcle dos grafías del mismo número.
        func banda(_ suelo: String, _ formatear: (Double) -> String?) -> String {
            guard let techo = m.techo, let alto = formatear(techo) else { return suelo }
            return "\(suelo)-\(alto)"
        }
        switch m {
        case let .reps(v, _):
            guard v > 0 else { return nil }
            let cifra = banda("\(v)") { "\(Int($0))" }
            return deletreandoReps ? "\(cifra) \(Vocab.reps)" : cifra
        case let .distance(meters, _):
            // La unidad se escribe UNA vez, al final: «800-1000 m», no «800 m-1000 m».
            guard let suelo = Formato.distancia(meters) else { return nil }
            guard let techo = m.techo, let alto = Formato.distancia(techo) else { return suelo }
            let unidadCompartida = suelo.split(separator: " ").last == alto.split(separator: " ").last
            guard unidadCompartida,
                  let cifraSuelo = suelo.split(separator: " ").first else { return "\(suelo)-\(alto)" }
            return "\(cifraSuelo)-\(alto)"
        case let .duration(seconds, _):
            guard seconds > 0 else { return nil }
            return banda(Formato.clock(seconds, subMinuto: .segundos)) {
                Formato.clock(Int($0), subMinuto: .segundos)
            }
        case let .calories(v, _):
            guard v > 0 else { return nil }
            return "\(banda("\(v)") { "\(Int($0))" }) cal"
        case .repsToFailure:
            // Sin cifra A PROPÓSITO: la dosis es «las que salgan». Antes esto
            // caía en `.unknown` y la medida se pintaba EN BLANCO — el atleta
            // veía el ejercicio y ninguna dosis. El literal no lleva unidad
            // detrás («4× al fallo», no «4× al fallo reps»), así que
            // `deletreandoReps` no cambia nada aquí.
            return Vocab.alFallo
        case .unknown:
            return nil
        }
    }

    /// The unit suffix for a measure's headline readout ("km" / "m" / "reps" / …).
    static func measureUnit(_ m: Measure?) -> String {
        guard let m else { return "" }
        switch m {
        case .reps:                return Vocab.reps
        case .distance(let meters, _): return meters >= 1000 ? "km" : "m"
        case .duration:            return ""
        case .calories:            return ""
        // El literal «al fallo» YA dice que son repeticiones; repetir la unidad
        // detrás sobra. Se comporta como el reloj y las calorías: sin sufijo.
        case .repsToFailure:       return ""
        case .unknown:             return ""
        }
    }

    // MARK: - Target → load / pace / zone strings

    /// The intensity column for a per-set table or the load chip on a card.
    /// Covers every Target kind that reads as a scalar chip: %RM, kg, RPE, RIR,
    /// bodyweight, hr_bpm, calories-as-goal, watts — plus `time_cap`, which isn't
    /// an intensity (it's a clock to beat) but has no dedicated chip of its own,
    /// so it rides here too. Pace and hr_zone are surfaced separately (pace chip
    /// / zone badge) so they're excluded.
    static func targetLoad(_ t: Target?) -> String? {
        guard let t else { return nil }
        switch t {
        case let .percentRM(v, mn, mx):
            return range(v, mn, mx, suffix: "% 1RM")
        case let .kg(v, mn, mx, implementos):
            // «2×32 kg»: DOS implementos de 32, que es como se escribe y como se
            // carga. Sin el ×2 el atleta lee 32 kg y coge una sola pesa.
            let porImplemento = implementos.map { $0 > 1 ? "\($0)×" : "" } ?? ""
            return range(v, mn, mx, prefix: porImplemento, suffix: " kg")
        case let .rpe(v, mn, mx):
            return range(v, mn, mx, prefix: "RPE ")
        case let .rir(v, mn, mx):
            return range(v, mn, mx, prefix: "RIR ")
        case .bodyweight:
            return "BW"
        case let .hrBpm(v, mn, mx):
            return range(v, mn, mx, suffix: " ppm")
        case let .calories(v, mn, mx):
            return range(v, mn, mx, suffix: " cal")
        case let .watts(v, mn, mx):
            return range(v, mn, mx, suffix: " W")
        case let .timeCap(v, mn, mx):
            return timeCapString(valueS: v, minS: mn, maxS: mx)
        case .hrZone, .pace, .unknown:
            return nil
        }
    }

    /// The pace chip for a card, e.g. "@ 3:40/km" (run) or "@ 1:55/500m" (erg).
    /// `isErg` selects the /500m convention when the unit is generic.
    ///
    /// Cifras y unidad van PEGADAS. Esta función escribía «@ 3:40 /km» con espacio y
    /// era una de las tres grafías del ritmo que convivían — dos de ellas llegaban a
    /// verse en el mismo scroll.
    static func paceString(_ t: Target?, isErg: Bool) -> String? {
        guard case let .pace(unit, valueS, minS, maxS) = t else { return nil }
        let unidad: Formato.UnidadRitmo
        switch unit {
        case .per500m: unidad = .por500m
        case .perMile: unidad = .porMilla
        case .perKm:   unidad = isErg ? .por500m : .porKm
        }
        // When the stored unit is per_km but this is an erg, convert to /500m.
        let scale: Double = (unit == .perKm && isErg) ? 0.5 : 1.0
        func fmt(_ s: Int) -> String { Formato.ritmoCifras((Double(s) * scale).rounded()) }
        let label = unidad.rawValue
        if let v = valueS, v > 0 { return "@ \(fmt(v))\(label)" }
        if let lo = minS, let hi = maxS, lo > 0, hi > 0 {
            return "@ \(fmt(lo))–\(fmt(hi))\(label)"
        }
        if let lo = minS, lo > 0 { return "@ \(fmt(lo))+\(label)" }
        if let hi = maxS, hi > 0 { return "@ \(fmt(hi))\(label)" }
        return nil
    }

    /// A time_cap reads as a CLOCK TO BEAT, never as a duration to fill — the
    /// ceiling case ("≤ 0:08") is the entire reason this kind exists (a roxzone
    /// transition prescribes "under 8s", not "spend 8s"; a plain duration measure
    /// would say the opposite). Mirrors the semantics in
    /// shared/domain/prescription/to-text.ts's `time_cap` case: `maxS` alone is a
    /// ceiling, `minS` alone a floor, both together a tightening band, `valueS` a
    /// flat clock.
    private static func timeCapString(valueS: Int?, minS: Int?, maxS: Int?) -> String? {
        if let v = valueS { return Formato.ritmoCifras(Double(v)) }
        if minS == nil, let mx = maxS { return "≤ \(Formato.ritmoCifras(Double(mx)))" }
        if maxS == nil, let mn = minS { return "≥ \(Formato.ritmoCifras(Double(mn)))" }
        guard let mn = minS, let mx = maxS else { return nil }
        return mn == mx
            ? Formato.ritmoCifras(Double(mn))
            : "\(Formato.ritmoCifras(Double(mn)))–\(Formato.ritmoCifras(Double(mx)))"
    }

    /// The HR-zone badge value for a card (uses the range midpoint when a band).
    static func zoneFromTarget(_ t: Target?) -> HRZone? {
        guard case let .hrZone(v, mn, mx) = t else { return nil }
        let raw: Int?
        if let v { raw = Int(v.rounded()) }
        else if let mn, let mx { raw = Int(((mn + mx) / 2).rounded()) }
        else if let mn { raw = Int(mn.rounded()) }
        else if let mx { raw = Int(mx.rounded()) }
        else { raw = nil }
        return raw.flatMap { HRZone(rawValue: $0) }
    }

    private static func isPaceOrZone(_ t: Target?) -> Bool {
        switch t {
        case .pace, .hrZone: return true
        default: return false
        }
    }

    // MARK: - Formatters (mono, athlete-facing)

    // Las cuatro primitivas que vivían aquí (`formatDistance`, `formatClock`,
    // `formatRest`, `formatPace`) se han ido a `Theme/Formato.swift`. `formatClock` y
    // `formatRest` eran además la MISMA regla escrita dos veces — «45s» por debajo del
    // minuto, «1:30» por encima —, así que las dos colapsan en
    // `Formato.clock(_:subMinuto:.segundos)`.
    //
    // Lo que sigue aquí es lo propio de una PRESCRIPCIÓN: rangos, el «@» del ritmo, la
    // conversión a /500m del ergómetro. Eso no es grafía, es semántica del plan.

    /// Un objetivo de carga descompuesto en LA GRAFÍA CON LA QUE SE ESCRIBE (su
    /// afijo) y su valor de PUNTO. Es lo que permite escribir una progresión con la
    /// misma cara que `targetLoad` en vez de recomponer strings a mano.
    ///
    /// Nil para lo que no es una carga con número (peso corporal, ritmo, zona, un
    /// reloj que batir) y —a propósito— para un objetivo que YA es una banda por sí
    /// mismo («70-80 %»): una serie que se autorregula dentro de un margen no es un
    /// peldaño de una escalera, así que no puede ser el extremo de una flecha.
    private static func loadPoint(_ t: Target?) -> (prefix: String, suffix: String, value: Double)? {
        guard let t else { return nil }
        switch t {
        case let .percentRM(v, _, _): return v.map { ("", "% 1RM", $0) }
        case let .kg(v, _, _, _):     return v.map { ("", " kg", $0) }
        case let .rpe(v, _, _):       return v.map { ("RPE ", "", $0) }
        case let .rir(v, _, _):       return v.map { ("RIR ", "", $0) }
        case let .watts(v, _, _):     return v.map { ("", " W", $0) }
        case .bodyweight, .hrBpm, .calories, .timeCap, .hrZone, .pace, .unknown:
            return nil
        }
    }

    /// LA CARGA DE UNA PROGRESIÓN — «100 → 115 kg», «60 → 75% 1RM».
    ///
    /// Para una pirámide, donde colapsar a la primera serie mentiría y enseñar las
    /// cuatro no se lee de un vistazo. Dice de dónde sale y dónde acaba, que es lo
    /// que el atleta necesita antes de empezar; el peso exacto de cada serie lo
    /// tiene delante, serie a serie, en el entreno en vivo.
    ///
    /// SOLO cuando la escalera es de verdad: todas las series con el mismo tipo de
    /// objetivo, todas con un valor de punto, y la secuencia MONÓTONA (sube siempre
    /// o baja siempre; una bajada al final también es una progresión, las series
    /// descendentes existen). Si sube y baja no se pinta nada: la flecha prometería
    /// que se va de la primera a la última cuando por el camino pasó otra cosa (§7).
    static func progressionLoad(_ sets: [PrescriptionSet]) -> String? {
        guard sets.count > 1 else { return nil }
        let puntos = sets.map { loadPoint($0.target) }
        // Una sola serie sin carga escrita y no hay escalera que contar.
        guard let primero = puntos.first ?? nil, let ultimo = puntos.last ?? nil,
              puntos.allSatisfy({ $0 != nil }) else { return nil }
        // Mezclar kg con %RM no es una progresión, son dos formas de decir la carga.
        guard puntos.allSatisfy({ $0?.prefix == primero.prefix && $0?.suffix == primero.suffix })
        else { return nil }

        let valores = puntos.compactMap { $0?.value }
        let pares = Array(zip(valores, valores.dropFirst()))
        let sube = pares.allSatisfy { $0 <= $1 }
        let baja = pares.allSatisfy { $0 >= $1 }
        // Ni monótona, ni una escalera de un solo escalón (esa ya la colapsa quien
        // detecta que todas las series llevan la misma carga).
        guard sube || baja, primero.value != ultimo.value else { return nil }

        func n(_ d: Double) -> String { Formato.esDecimal(d) }
        return "\(primero.prefix)\(n(primero.value)) \(Formato.signoProgresion) \(n(ultimo.value))\(primero.suffix)"
    }

    private static func range(
        _ value: Double?, _ min: Double?, _ max: Double?,
        prefix: String = "", suffix: String = ""
    ) -> String? {
        func n(_ d: Double) -> String { Formato.esDecimal(d) }
        if let v = value { return "\(prefix)\(n(v))\(suffix)" }
        if let lo = min, let hi = max { return "\(prefix)\(n(lo))–\(n(hi))\(suffix)" }
        if let lo = min { return "\(prefix)\(n(lo))+\(suffix)" }
        if let hi = max { return "\(prefix)≤\(n(hi))\(suffix)" }
        return nil
    }
}
