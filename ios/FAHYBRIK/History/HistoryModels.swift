import Foundation

// #27 — ATHLETE HISTORY by month: the wire models for GET /api/athlete/history plus
// the PURE month-grid derivation the calendar renders. The grid math (Monday-first
// offsets, days→cells, navigation bounds, day-state from the payload) is isolated here,
// with no SwiftUI/I/O, so it is unit-tested exhaustively — a calendar that misplaces a
// day is a silent, ugly bug.
//
// Wire is snake_case; APIClient's convertFromSnakeCase maps it to camelCase here
// (is_rest → isRest, assignment_id → assignmentId, score_time_s → scoreTimeS …). The
// server returns ONLY days with content (completed/partial sessions or scheduled rest);
// empty days are omitted and the calendar paints them blank.

// MARK: - Wire

struct AthleteHistoryMonth: Decodable, Equatable {
    let month: String            // echoes YYYY-MM
    let days: [AthleteHistoryDay]
}

struct AthleteHistoryDay: Decodable, Equatable {
    let date: String             // YYYY-MM-DD, box-local
    let isRest: Bool             // a scheduled rest day (no sessions)
    let sessions: [AthleteHistorySession]
}

struct AthleteHistorySession: Decodable, Equatable, Identifiable {
    /// Abre el entreno por su ejecución (`/api/athlete/executions/{id}/detail`).
    /// Siempre viene del servidor; nil solo en la proyección local de un «Sin subir».
    var executionId: String? = nil
    /// Abre el detalle de siempre. Nil = lo hecho SIN asignación (una importación de
    /// Salud que no casó con el plan, un entreno «fuera del plan»): solo llega con
    /// `include_unplanned=1` (DECISIONS 2026-09-28).
    let assignmentId: String?
    let title: String
    let totalDurationSeconds: Int?
    let scoreTimeS: Int?         // For Time / RFT / HYROX-sim final time; else null
    let rpe: Double?             // perceived exertion 1–10; null when not logged
    let withPartner: Bool        // logged as a JOINT dobles session
    let hasRoute: Bool           // an outdoor GPS route exists
    let origin: String?          // coach | self — only self may be deleted by athlete
    /// AMRAP: rondas completas y reps de la ronda a medias.
    var scoreRounds: Int? = nil
    var scoreReps: Int? = nil
    /// Metros de la sesión. Null si nada midió distancia o si la midieron dos
    /// modalidades (sumar correr y remar no significa nada).
    var distanceM: Int? = nil
    /// Lo que MÁS se hizo: run | row | ski | bike | strength | other.
    var modality: String? = nil
    /// live | manual | imported.
    var recordedVia: String? = nil
    /// assignment_gone | not_own_assignment | no_assignment.
    var offPlanReason: String? = nil

    /// Único y estable: la ejecución (siempre en el servidor); la asignación o el
    /// título solo en la proyección local, que el historial identifica aparte.
    var id: String { executionId.map { "e\($0)" } ?? assignmentId.map { "a\($0)" } ?? title }

    var isSelfOrigin: Bool { origin == "self" }

    /// Adónde abre esta fila: por su asignación si la tiene (el detalle de siempre,
    /// con técnica y captura), si no por su ejecución. Nil = no hay nada que abrir.
    var destino: DestinoDeEntrenoHecho? {
        if let a = assignmentId, !a.isEmpty { return .asignacion(a) }
        if let e = executionId, !e.isEmpty { return .ejecucion(e) }
        return nil
    }

    /// LO QUE PUNTÚA ESTA SESIÓN — la cifra de la fila, que no siempre es un reloj:
    /// un AMRAP son sus rondas, un for time su tiempo final, una carrera o un remo sus
    /// metros y su ritmo. Sin nada de eso, la duración; sin duración, nil (§7).
    var resultado: ResultadoDeFila? {
        if let rondas = scoreRounds, rondas > 0 || (scoreReps ?? 0) > 0 {
            return ResultadoDeFila(amrapRondas: rondas, reps: scoreReps)
        }
        if let s = scoreTimeS, s > 0 {
            return ResultadoDeFila(valor: Formato.clock(s), etiqueta: "resultado")
        }
        if let d = distanceM, d > 0, let unidad = Self.unidadDeRitmo(modality) {
            let metros = Double(d)
            let ritmo: String? = unidad.flatMap { u in
                guard let t = totalDurationSeconds, t > 0 else { return nil }
                let porUnidad = u == .porKm ? Double(t) / (metros / 1000) : Double(t) / (metros / 500)
                return Formato.ritmo(porUnidad, u)
            }
            return ResultadoDeFila(
                // Una distancia MEDIDA: los ceros son el dato («10,00 km», §2).
                valor: Formato.distanciaCubierta(metros) ?? "",
                etiqueta: ritmo ?? Vocab.distancia.lowercased()
            )
        }
        if let t = totalDurationSeconds, t > 0 {
            return ResultadoDeFila(valor: Formato.clock(t), etiqueta: "duración")
        }
        return nil
    }

    /// Qué modalidades puntúan por distancia y con qué ritmo se leen: correr /km, el
    /// remo y el SkiErg /500 m (la convención del monitor), la bici sin ritmo (su
    /// monitor no lo da). `.some(nil)` = distancia sin ritmo; nil = no puntúa así.
    private static func unidadDeRitmo(_ modality: String?) -> Formato.UnidadRitmo?? {
        switch modality {
        case "run": return .some(.porKm)
        case "row", "ski": return .some(.por500m)
        case "bike": return .some(nil)
        default: return nil
        }
    }

    /// Kept for the local «Sin subir» projection and its tests: the headline value.
    var headlineTime: String? { resultado?.valor }
    /// Label under the headline value.
    var headlineLabel: String? { resultado?.etiqueta }
    /// "RPE 7" when the athlete logged it.
    var rpeLabel: String? { DoblesLiveFormat.rpe(rpe).map { "RPE \($0)" } }

    enum CodingKeys: String, CodingKey {
        case executionId, assignmentId, title, totalDurationSeconds, scoreTimeS, rpe
        case withPartner, hasRoute, origin, scoreRounds, scoreReps
        case distanceM, modality, recordedVia, offPlanReason
    }
}

/// Adónde abre un entreno hecho.
enum DestinoDeEntrenoHecho: Equatable {
    case asignacion(String)
    case ejecucion(String)
}

/// La cifra de una fila del historial y lo que es.
struct ResultadoDeFila: Equatable {
    let valor: String
    let etiqueta: String

    init(valor: String, etiqueta: String) {
        self.valor = valor
        self.etiqueta = etiqueta
    }

    /// «5 + 8» sobre «rondas + reps»; «5» sobre «rondas» sin reps sueltas.
    init(amrapRondas rondas: Int, reps: Int?) {
        if let reps, reps > 0 {
            valor = "\(rondas) + \(reps)"
            etiqueta = "rondas + reps"
        } else {
            valor = "\(rondas)"
            etiqueta = rondas == 1 ? "ronda" : "rondas"
        }
    }
}

// MARK: - Year-month value

/// A calendar month, orderable so navigation bounds are a simple comparison.
struct YearMonth: Equatable, Comparable {
    let year: Int
    let month: Int               // 1…12

    static func < (a: YearMonth, b: YearMonth) -> Bool {
        (a.year, a.month) < (b.year, b.month)
    }

    func previous() -> YearMonth {
        month == 1 ? YearMonth(year: year - 1, month: 12) : YearMonth(year: year, month: month - 1)
    }
    func next() -> YearMonth {
        month == 12 ? YearMonth(year: year + 1, month: 1) : YearMonth(year: year, month: month + 1)
    }

    /// The `?month=YYYY-MM` query value.
    var iso: String { String(format: "%04d-%02d", year, month) }

    /// "julio 2026" — the header label (Spanish month names).
    var displayLabel: String { "\(HistoryCalendar.monthNameEs(month)) \(year)" }

    /// The month containing `reference` in the box timezone (Europe/Madrid), so the
    /// "today" marker and the forward-navigation cap match the server's day convention.
    static func current(reference: Date = Date()) -> YearMonth {
        let c = HistoryCalendar.boxComponents(reference)
        return YearMonth(year: c.year ?? 2026, month: c.month ?? 1)
    }
}

// MARK: - Calendar grid (pure)

/// One cell of the Monday-first month grid: a blank pad or a real day-of-month.
enum CalendarGridCell: Equatable {
    case blank
    case day(Int)
}

/// A day's rendered state, derived from the month payload.
enum CalendarDayState: Equatable {
    case empty                          // no content that day → blank
    case rest                           // a scheduled rest day → dash
    case trained(withPartner: Bool)     // ≥1 completed session → dot (+ ring if joint)
}

enum HistoryCalendar {
    /// A Gregorian calendar pinned to the box timezone — deterministic, so the grid math
    /// and the "today" resolution never drift with the device zone.
    static let boxCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Madrid") ?? .current
        c.firstWeekday = 2   // Monday (documentary; the grid math is explicit below)
        return c
    }()

    static func boxComponents(_ date: Date) -> DateComponents {
        boxCalendar.dateComponents([.year, .month, .day], from: date)
    }

    /// Today's day-of-month IF today falls inside `ym`, else nil (drives the marker).
    static func todayDay(in ym: YearMonth, reference: Date = Date()) -> Int? {
        let c = boxComponents(reference)
        guard c.year == ym.year, c.month == ym.month else { return nil }
        return c.day
    }

    /// "YYYY-MM-DD" de un día del mes: la llave con que el servidor manda cada día (y la que
    /// usan el calendario y la lista para saber qué día está enfocado).
    static func isoDate(_ day: Int, en ym: YearMonth) -> String {
        String(format: "%04d-%02d-%02d", ym.year, ym.month, day)
    }

    /// The month grid, Monday-first: leading blanks to the weekday of day 1, then days
    /// 1…N, then trailing blanks so the count is a whole number of weeks (rows × 7).
    static func grid(_ ym: YearMonth) -> [CalendarGridCell] {
        guard let first = boxCalendar.date(from: DateComponents(year: ym.year, month: ym.month, day: 1)),
              let range = boxCalendar.range(of: .day, in: .month, for: first)
        else { return [] }
        let n = range.count
        // weekday: 1=Sun … 7=Sat → Monday-first index 0=Mon … 6=Sun.
        let weekday = boxCalendar.component(.weekday, from: first)
        let leading = (weekday + 5) % 7

        var cells = [CalendarGridCell](repeating: .blank, count: leading)
        cells.append(contentsOf: (1...n).map { .day($0) })
        while cells.count % 7 != 0 { cells.append(.blank) }
        return cells
    }

    /// Map the month's payload to a day-of-month → state dictionary. Days outside `ym`
    /// (a straddling week edge) are ignored; a day not present stays `.empty` implicitly.
    static func dayStates(_ days: [AthleteHistoryDay], in ym: YearMonth) -> [Int: CalendarDayState] {
        var out: [Int: CalendarDayState] = [:]
        for d in days {
            guard let parsed = parseISO(d.date), parsed.year == ym.year, parsed.month == ym.month else { continue }
            if d.isRest {
                out[parsed.day] = .rest
            } else if !d.sessions.isEmpty {
                out[parsed.day] = .trained(withPartner: d.sessions.contains { $0.withPartner })
            }
        }
        return out
    }

    /// Forward navigation is capped at the current month (no future); back is free.
    static func canGoForward(from viewed: YearMonth, today: YearMonth = .current()) -> Bool {
        viewed < today
    }

    /// Parse "YYYY-MM-DD" → components. Nil for a malformed string (never crashes).
    static func parseISO(_ s: String) -> (year: Int, month: Int, day: Int)? {
        let parts = s.split(separator: "-")
        guard parts.count == 3,
              let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]),
              (1...12).contains(m), (1...31).contains(d) else { return nil }
        return (y, m, d)
    }

    static let weekdayHeadersEs = ["L", "M", "X", "J", "V", "S", "D"]

    private static let monthNamesEs = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ]
    static func monthNameEs(_ month: Int) -> String {
        guard (1...12).contains(month) else { return "" }
        return monthNamesEs[month - 1]
    }

    static let monthAbbrevEs = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    static let dowAbbrevEs = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]

    /// DOW abbreviation for a YYYY-MM-DD ("lun".."dom"), Monday-first. "" when malformed.
    static func dowAbbrev(_ iso: String) -> String {
        guard let p = parseISO(iso),
              let date = boxCalendar.date(from: DateComponents(year: p.year, month: p.month, day: p.day))
        else { return "" }
        let weekday = boxCalendar.component(.weekday, from: date)
        return dowAbbrevEs[(weekday + 5) % 7]
    }
}

// MARK: - Month list (flattened, newest-first)

/// One row of the month list: a session with its date, for the browse list under the
/// calendar. Newest-first (market standard for an activity feed).
struct HistoryListRow: Identifiable, Equatable {
    let date: String                 // YYYY-MM-DD
    let session: AthleteHistorySession
    /// Solo existe en el móvil: el servidor lo rechazó y la cola lo guarda
    /// (`LocalUnsyncedWorkout`). `session` es entonces su proyección para pintar la
    /// fila igual que las demás; tocarla NO va al servidor (no lo tiene).
    var sinSubir: LocalUnsyncedWorkout? = nil
    var id: String {
        if let local = sinSubir { return "\(date)#local-\(local.id.uuidString)" }
        return "\(date)#\(session.executionId ?? session.assignmentId ?? session.title)"
    }

    /// Flatten a month's days into rows, most recent DAY first; within a two-a-day the
    /// server's session order is preserved (a stable tiebreak, since Swift's sort is not
    /// itself stable). Rest days contribute no rows.
    static func rows(from month: AthleteHistoryMonth) -> [HistoryListRow] {
        let flat = month.days.flatMap { day in
            day.sessions.map { HistoryListRow(date: day.date, session: $0) }
        }
        return flat.enumerated()
            .sorted { a, b in
                a.element.date != b.element.date ? a.element.date > b.element.date : a.offset < b.offset
            }
            .map(\.element)
    }
}

// MARK: - Sin subir: cosido con el mes del servidor
//
// Lo que el móvil guarda sin subir (`LocalUnsyncedWorkout`, EntrenoSinSubir.swift) entra
// en la lista y en el calendario del mes como lo que es: trabajo hecho.

extension HistoryListRow {
    /// El mes del servidor con lo que el móvil guarda sin subir, cosido por fecha.
    ///
    /// - Solo los del mes que se mira.
    /// - Si el servidor YA tiene esa sesión del coach en el mes (llegó por otro
    ///   camino, p. ej. el reloj), manda la del servidor: es la confirmada, y dos
    ///   filas del mismo entreno mentirían sobre la semana.
    /// - Dentro de su día, el local va PRIMERO (el más reciente antes): el mes del
    ///   servidor no trae hora, y lo rechazado es casi siempre lo último que se hizo
    ///   —el atleta acaba de cerrar su resumen—; al final de la lista no lo encontraría.
    static func rows(
        from month: AthleteHistoryMonth,
        sinSubir: [LocalUnsyncedWorkout],
        in ym: YearMonth
    ) -> [HistoryListRow] {
        let servidor = rows(from: month)
        let yaEnElServidor = Set(servidor.compactMap(\.session.assignmentId))
        let locales = sinSubir
            .filter { HistoryCalendar.isIn($0.date, ym) }
            .filter { local in local.assignmentId.map { !yaEnElServidor.contains($0) } ?? true }
            .sorted { ($0.startedAt ?? .distantPast) > ($1.startedAt ?? .distantPast) }
            .map { HistoryListRow(date: $0.date, session: $0.session, sinSubir: $0) }
        return (locales + servidor).enumerated()
            .sorted { a, b in
                a.element.date != b.element.date ? a.element.date > b.element.date : a.offset < b.offset
            }
            .map(\.element)
    }
}

extension HistoryCalendar {
    /// Los estados del mes con lo que el móvil guarda sin subir. Un día cuyo ÚNICO
    /// entreno esté «Sin subir» también lleva el punto: el trabajo se hizo, y el
    /// calendario pinta lo hecho, no lo que el servidor confirmó.
    static func dayStates(
        _ days: [AthleteHistoryDay],
        in ym: YearMonth,
        sinSubir: [LocalUnsyncedWorkout]
    ) -> [Int: CalendarDayState] {
        var out = dayStates(days, in: ym)
        for local in sinSubir {
            guard let p = parseISO(local.date), p.year == ym.year, p.month == ym.month else { continue }
            if let actual = out[p.day], case .trained = actual { continue }
            out[p.day] = .trained(withPartner: false)
        }
        return out
    }

    /// Si un YYYY-MM-DD cae en el mes `ym`.
    static func isIn(_ iso: String, _ ym: YearMonth) -> Bool {
        guard let p = parseISO(iso) else { return false }
        return p.year == ym.year && p.month == ym.month
    }
}
