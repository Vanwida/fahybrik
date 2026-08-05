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
            // ejercicios rotan, y cuántas vueltas. Sin esta línea la superserie se
            // lee como una tabla de series rectas, que es justo lo que no es.
            guard let n = rounds(), n > 0 else { return Vocab.superserie }
            return "\(Vocab.superserie) · \(n) \(n == 1 ? "vuelta" : "vueltas")"
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
        case .unknown:
            return nil
        }
    }

    /// The unit suffix for a measure's headline readout ("km" / "m" / "reps" / …).
    static func measureUnit(_ m: Measure?) -> String {
        guard let m else { return "" }
        switch m {
        case .reps:                return "reps"
        case .distance(let meters, _): return meters >= 1000 ? "km" : "m"
        case .duration:            return ""
        case .calories:            return ""
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
        case let .kg(v, mn, mx):
            return range(v, mn, mx, suffix: " kg")
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
