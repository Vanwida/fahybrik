import Foundation

// EL PLAN, LEÍDO — la proyección que pinta la pestaña Plan.
//
// POR QUÉ EXISTE
// --------------
// La pantalla del plan responde una pregunta ("¿qué toca hoy, y dónde estoy
// dentro del bloque?") con datos que llegan de DOS sitios: la semana publicada
// (`AthletePlanWeekResponse`) y el desglose de la sesión de hoy
// (`AssignmentDetail`). Todo lo que la vista enseña se deriva AQUÍ, una sola vez
// y sin SwiftUI de por medio, para que las reglas se puedan leer —y testear— sin
// abrir una vista. Es el espejo de `plan-bloque/data.ts` en el doble.
//
// LAS TRES REGLAS QUE GOBIERNAN ESTE FICHERO (docs/CONTRATO-UI.md §7)
// -------------------------------------------------------------------
//  1. Un día sin sesión no fabrica nada: es descanso y se dibuja como tal.
//  2. Los minutos de una sesión que aún no ha pasado son el reloj que ESCRIBE la
//     prescripción (un SUELO, «desde 45 min»); los de una hecha son la medida
//     real. No se mezclan, y cuando el plan no escribe reloj no hay número: se
//     dice por qué (`DuracionDesconocida`).
//  3. Ninguna cifra de la sesión se calcula aquí. Se leen las que el servidor ya
//     resolvió (`resolvedLoad`, `resolvedIntensity`) o las que el coach escribió,
//     renderizadas por el canónico `PrescriptionRenderer`. Sin cifras, no hay
//     cifras — nunca un número plausible.

// MARK: - El estado de un día

/// Los CINCO estados de un día del carril. `esHoy` va aparte: es otra dimensión.
///
/// El doble modela cuatro (`hecha | saltada | pendiente | descanso`) porque su
/// escenario no tiene sesiones a medias. El dato real sí: `SessionMarkState`
/// distingue `partial` — un entreno terminado antes de tiempo — y colapsarlo en
/// «hecha» afirmaría un trabajo completo que no ocurrió. Por eso son cinco.
enum EstadoDiaPlan: Equatable {
    /// Nada en el plan para ese día.
    case descanso
    /// Al menos una sesión completada. Con dos sesiones y una hecha el día ya
    /// cuenta como trabajado: el sello dice que hubo trabajo, no que se cerrara
    /// el día entero (misma regla que el doble).
    case hecha
    /// Se empezó y se terminó antes. Ni un ✓ ni un hueco.
    case parcial
    /// Tocaba y no se hizo — o el coach la marcó como no hecha, o el día ya pasó
    /// y no quedó registrado nada. Las dos son hechos, no un juicio.
    case saltada
    /// Todavía por hacer.
    case pendiente

    /// La palabra para la voz de accesibilidad.
    var etiqueta: String {
        switch self {
        case .descanso:  return "descanso"
        case .hecha:     return "hecha"
        case .parcial:   return "a medias"
        case .saltada:   return "sin hacer"
        case .pendiente: return "por hacer"
        }
    }

    /// True cuando el día ya no pide nada: se trabajó (entero o a medias).
    var trabajado: Bool { self == .hecha || self == .parcial }
}

// MARK: - Un día del carril

/// Un día de la semana, ya resuelto para pintarse: su inicial, su número, sus
/// sesiones reales, su estado y las modalidades que lo mandan.
struct DiaDelPlan: Identifiable, Equatable {
    var id: String { isoDate }
    let isoDate: String
    /// 1 = lunes … 7 = domingo (el `day_of_week` del cable).
    let diaSemana: Int
    /// «L» · «M» · «X» — la inicial que cabe en una ficha de 46 pt.
    let inicial: String
    /// «Lunes» — para la voz de accesibilidad y los menús.
    let nombre: String
    /// El día del mes.
    let numero: Int
    /// Solo las sesiones REALES (con asignación); las vacías no cuentan.
    let sesiones: [AthleteWeekDaySession]
    let estado: EstadoDiaPlan
    let esHoy: Bool

    /// Las modalidades que MANDAN en el día, como mucho dos: en una ficha de esa
    /// anchura un tercer punto ya no se distingue, y un resumen corto no es una
    /// medida falsa. Sin sesiones, ninguna.
    var modalidades: [String?] {
        var vistas: [Theme.Modality.Kind] = []
        var salida: [String?] = []
        for s in sesiones {
            let kind = Theme.Modality.kind(s.modality)
            guard !vistas.contains(kind) else { continue }
            vistas.append(kind)
            salida.append(s.modality)
            if salida.count == 2 { break }
        }
        return salida
    }

    /// Lo que la app puede decir de un día sin fabricar nada.
    var resumen: String {
        guard !sesiones.isEmpty else { return "descanso, nada en el plan" }
        let titulos = sesiones.map(\.title).joined(separator: ", ")
        return "\(titulos), \(estado.etiqueta)"
    }

    /// «Hoy · Lunes 10» cuando de verdad es hoy; «Lunes 10» para cualquier otro
    /// día que se hojee. El prefijo «Hoy» es un HECHO, no una plantilla — un
    /// día que no es hoy no puede llevarlo (§7).
    var etiquetaDeFecha: String {
        esHoy ? "Hoy · \(nombre) \(numero)" : "\(nombre) \(numero)"
    }
}

// MARK: - La semana, resuelta

/// La semana publicada leída de punta a punta: siete días, cuál es hoy, la línea
/// del coach y el nombre del bloque. Nada aquí sale de una estimación.
struct SemanaDelPlan: Equatable {
    let dias: [DiaDelPlan]
    /// El índice de hoy dentro de `dias`; nil cuando hoy cae fuera de la semana
    /// servida (el atajo a la semana siguiente, un desfase de zona horaria).
    let indiceHoy: Int?
    /// Lo que el coach escribió para ESTA semana. El sistema no escribe aquí.
    let intencion: String?
    /// El nombre que el coach le puso al bloque/microciclo. El sistema no bautiza
    /// fases: si el cable no lo trae, no hay nombre.
    let nombreBloque: String?
    /// ISO del día en que empieza el trabajo YA programado, cuando cae después de
    /// esta semana. Nil = no hay nada más adelante. Deja que la semana vacía diga
    /// «empieza el lunes 10» en vez de «tu coach no ha publicado», que era falso
    /// (docs/DECISIONS.md, 7-ago).
    let planStartsOn: String?

    var hoy: DiaDelPlan? { indiceHoy.flatMap { dias.indices.contains($0) ? dias[$0] : nil } }

    /// True en cuanto un día lleva una asignación real. Una semana de puro
    /// descanso (atleta recién dado de alta) se lee como «todavía no hay plan».
    var tieneAlgunaSesion: Bool { dias.contains { !$0.sesiones.isEmpty } }

    /// La última sesión ANTES de hoy, si la semana la tiene.
    var sesionDeAyer: (dia: DiaDelPlan, sesion: AthleteWeekDaySession)? {
        guard let indiceHoy else { return nil }
        for i in stride(from: indiceHoy - 1, through: 0, by: -1) where !dias[i].sesiones.isEmpty {
            return (dias[i], dias[i].sesiones[dias[i].sesiones.count - 1])
        }
        return nil
    }

    /// La siguiente sesión de la semana. Nil = la semana ya está cerrada.
    var sesionDeManana: (dia: DiaDelPlan, sesion: AthleteWeekDaySession)? {
        guard let indiceHoy else { return nil }
        for i in (indiceHoy + 1)..<dias.count where !dias[i].sesiones.isEmpty {
            return (dias[i], dias[i].sesiones[0])
        }
        return nil
    }

    /// Lee la semana del cable. `hoy` entra por parámetro para poder fijarlo en
    /// un test: el estado «saltada» depende de qué día es, y un derivado que
    /// llama a `Date()` por dentro no se puede comprobar.
    static func desde(_ resp: AthletePlanWeekResponse) -> SemanaDelPlan {
        let todayIso = resp.week.todayIso
        let dias: [DiaDelPlan] = resp.week.days.map { day in
            let reales = day.sessions.filter { !$0.assignmentId.isEmpty }
            let esHoy = day.isoDate == todayIso
            return DiaDelPlan(
                isoDate: day.isoDate,
                diaSemana: day.dayOfWeek,
                inicial: Self.inicialDeDia(day.dayOfWeek),
                nombre: Self.nombreDeDia(day.dayOfWeek),
                numero: Self.diaDelMesDe(day.isoDate),
                sesiones: reales,
                estado: Self.estado(dia: day, sesiones: reales, todayIso: todayIso),
                esHoy: esHoy
            )
        }
        return SemanaDelPlan(
            dias: dias,
            indiceHoy: dias.firstIndex { $0.esHoy },
            intencion: Self.limpio(resp.week.focus),
            // El nombre del bloque es el del microciclo publicado: es el ÚNICO
            // nombre real que viaja. `macro_summary.block` llega siempre nulo del
            // servidor (`buildAthleteMacroSummary` lo fija a null), así que
            // leerlo de ahí pintaría un hueco permanente.
            nombreBloque: Self.limpio(resp.week.microcicloName),
            planStartsOn: resp.week.planStartsOn
        )
    }

    /// El estado de un día a partir del estado REAL de sus sesiones.
    ///
    /// El orden importa: un día con dos sesiones, una hecha y otra sin tocar, se
    /// lee como trabajado. Y «saltada» no es un veredicto: o el servidor lo dice
    /// (`missed`/`skipped`), o el día ya pasó y no quedó nada registrado — que es
    /// un hecho que la app sí sabe. Ningún job del servidor caduca una sesión
    /// pasada a `missed`, así que sin esta segunda mitad una semana entera sin
    /// hacer se leería igual que una semana futura.
    private static func estado(
        dia: AthleteWeekDay,
        sesiones: [AthleteWeekDaySession],
        todayIso: String
    ) -> EstadoDiaPlan {
        guard !sesiones.isEmpty else { return .descanso }
        let marcas = sesiones.map { SessionMarkState.of(status: $0.status, assignmentId: $0.assignmentId) }
        if marcas.contains(.done) { return .hecha }
        if marcas.contains(.partial) { return .parcial }
        if marcas.contains(.missed) { return .saltada }
        return dia.isoDate < todayIso ? .saltada : .pendiente
    }

    private static func limpio(_ s: String?) -> String? {
        let t = s?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (t?.isEmpty == false) ? t : nil
    }

    /// La inicial de un día. «X» para el miércoles: es la que se usa en España
    /// para no chocar con el martes, y la misma que enseña el doble.
    static func inicialDeDia(_ dow: Int) -> String {
        switch dow {
        case 1: return "L"
        case 2: return "M"
        case 3: return "X"
        case 4: return "J"
        case 5: return "V"
        case 6: return "S"
        default: return "D"
        }
    }

    /// «Lunes». Compartido con el ciclo, que lista los días de la semana que viene.
    static func nombreDeDia(_ dow: Int) -> String {
        switch dow {
        case 1: return "Lunes"
        case 2: return "Martes"
        case 3: return "Miércoles"
        case 4: return "Jueves"
        case 5: return "Viernes"
        case 6: return "Sábado"
        default: return "Domingo"
        }
    }

    /// El día del mes de una fecha ISO «YYYY-MM-DD».
    static func diaDelMesDe(_ iso: String) -> Int {
        let parts = iso.split(separator: "-")
        guard parts.count == 3, let d = Int(parts[2]) else { return 0 }
        return d
    }
}

// MARK: - Dónde estás dentro del bloque

/// «Semana 3 de 6» — o «Semana 3» cuando el plan no declara total.
///
/// SALE DEL SERVIDOR, NO SE CALCULA AQUÍ, y conviene saber por qué: la posición
/// depende de la ventana de fechas del microciclo asignado
/// (`athlete_month_assignments`), que el móvil no recibe. Lo que sí recibe es la
/// etiqueta ya compuesta, `macro.week_label` (shared/domain/coach/
/// macro-progress.ts), que tiene DOS formas y las dos se extraen aquí:
///
///   · «<nombre> · semana N de M» — el atleta camina un microciclo con total.
///   · «semana N» — plan directo (semanas dictadas o montadas a mano): N son las
///     semanas seguidas con trabajo, y NO HAY «de M» porque el total de un plan
///     directo no es un hecho — crece a medida que el coach publica (§7).
///
/// Y por eso NO se usa `macro_progress.total_assigned_weeks` como «M»: ese número
/// cuenta TODAS las semanas con asignaciones del atleta desde siempre, no las del
/// bloque. Enseñarlo como «de M» convertiría el historial entero en la longitud
/// del bloque — un número que se lee como un dato y no lo es (§7).
struct PosicionEnBloque: Equatable {
    let semana: Int
    /// Nil = el plan no declara total (plan directo). No se inventa uno.
    let total: Int?

    /// «Semana 3 de 6» · «Semana 3».
    var texto: String {
        guard let total else { return "Semana \(semana)" }
        return "Semana \(semana) de \(total)"
    }

    /// Extrae la posición de la etiqueta del servidor. Nil cuando la etiqueta no
    /// llega o no lleva ninguna de las dos formas — ahí no hay posición que
    /// enseñar, y una inventada sería peor que ninguna.
    static func desde(etiqueta: String?) -> PosicionEnBloque? {
        guard let etiqueta else { return nil }
        // Primero la forma completa: «… · semana 3 de 6». Tolerante a mayúsculas
        // y a que el nombre del coach lleve dígitos («Bloque 2 · …»).
        if let m = primerMatch(#"semana\s+(\d+)\s+de\s+(\d+)"#, en: etiqueta),
           m.count == 2, let n = m[0], let total = m[1],
           n > 0, total > 0, n <= total {
            return PosicionEnBloque(semana: n, total: total)
        }
        // Después la corta: «semana 3» a secas (el plan directo). El lookahead
        // negativo evita dos trampas: casar a medias sobre la forma completa
        // (perdería el total) y «rescatar» el N de una etiqueta contradictoria
        // tipo «semana 7 de 4», que no es una posición y no debe volverse una.
        if let m = primerMatch(#"semana\s+(\d+)(?!\s+de\s+\d)"#, en: etiqueta),
           m.count == 1, let n = m[0], n > 0 {
            return PosicionEnBloque(semana: n, total: nil)
        }
        return nil
    }

    /// Los grupos numéricos del primer match del patrón, o nil si no casa.
    private static func primerMatch(_ patron: String, en texto: String) -> [Int?]? {
        guard let regex = try? NSRegularExpression(pattern: patron, options: [.caseInsensitive]) else { return nil }
        let rango = NSRange(texto.startIndex..<texto.endIndex, in: texto)
        guard let m = regex.firstMatch(in: texto, options: [], range: rango) else { return nil }
        return (1..<m.numberOfRanges).map { i in
            Range(m.range(at: i), in: texto).flatMap { Int(texto[$0]) }
        }
    }
}

// MARK: - De qué está hecha la sesión de hoy

/// Una PARTE de la sesión: un bloque del entreno, con QUÉ ejercicios lleva.
///
/// Antes esto enseñaba un recuento («3 ejercicios») en vez de qué son — el
/// atleta no sabe qué le toca hasta que entra en la sesión. Los nombres son
/// lo que de verdad responde «qué voy a hacer hoy» de un vistazo (Alex, 7-ago).
struct ParteDeSesion: Identifiable, Equatable {
    let id: String
    let titulo: String
    /// Los nombres reales, en el orden del bloque. Nunca un recuento inventado:
    /// si el bloque no trae ejercicios, la lista sale vacía.
    let nombresEjercicios: [String]
    var ejercicios: Int { nombresEjercicios.count }
    /// Calentamiento o vuelta a la calma: no son el trabajo, son el marco, y por
    /// eso van atenuados.
    ///
    /// NO es un campo del cable — se deriva del `format` del bloque, que sí viaja
    /// (`{warmup, cooldown}`). En producción casi nunca es cierto (0 bloques
    /// `warmup` y 8 `cooldown`), y eso es honesto: no hay bloque estructural que
    /// atenuar en casi ninguna sesión. El calentamiento real del coach vive como
    /// prosa en `templates.warmup`, que el endpoint todavía no sirve.
    let estructural: Bool
    /// La modalidad que abre la parte — la de su PRIMER ejercicio. No se inventa
    /// una modalidad para el conjunto.
    let modalidad: String?

    /// Cuántos nombres caben como filas antes de resumir el resto en una cifra.
    static let maxNombresEnFila = 3

    /// Los nombres que se pintan como filas propias — nunca como una frase.
    /// «Puente de glúteo, Marcha desde puente de glúteo» leído de corrido no se
    /// distingue de una nota; cada ejercicio es SU fila (Alex, 7-ago: «¿está en
    /// una lista? no tiene sentido» — no lo era, era un párrafo).
    var nombresVisibles: [String] { Array(nombresEjercicios.prefix(Self.maxNombresEnFila)) }
    var nombresDeMas: Int { max(0, nombresEjercicios.count - nombresVisibles.count) }

    /// Solo para VoiceOver, donde una frase sí es la forma correcta de leerlo.
    var resumenDeNombres: String {
        guard !nombresEjercicios.isEmpty else { return "" }
        let base = nombresVisibles.joined(separator: ", ")
        return nombresDeMas > 0 ? "\(base) + \(nombresDeMas) más" : base
    }
}

/// EL DESGLOSE DE UNA SESIÓN — lo que el héroe necesita y el resumen de fila no
/// da: sus partes, su cabecera de formato y la nota de hoy.
///
/// Todo sale de `AssignmentDetail` (el desglose real que el servidor sirve) y se
/// escribe con los formateadores canónicos. Cuando la sesión no trae ninguna
/// parte, la lista sale vacía y el héroe no pinta nada: no se rellena por
/// simetría (§7).
struct DesgloseSesion: Equatable {
    let partes: [ParteDeSesion]
    /// La cabecera de formato del bloque principal, en castellano y con sus
    /// números («5 rondas · descanso 1:00», «AMRAP · 12:00»). Nil para la fuerza
    /// y las partes estructurales, que no llevan reloj: ahí el título ya lo dice
    /// todo, y `PrescriptionScheme.displayName` está en inglés (§3).
    let formato: String?
    /// Lo que el coach escribió para ESTA sesión concreta — no la ficha
    /// permanente del ejercicio. Es lo ÚNICO que ocupa el sitio bajo las
    /// partes: la dosis (series/carga/descanso) NUNCA vive aquí — el atleta ya
    /// la ve en cuanto toca la card y entra en el ejercicio; repetirla en el
    /// héroe es ruido, no información (Alex, 7-ago, tras ver la dosis de un
    /// bloque de un único trabajo confundida con la de la sesión entera). Sin
    /// nota, ese sitio se calla — nunca cae a números.
    let notaDelDia: String?

    static let vacio = DesgloseSesion(partes: [], formato: nil, notaDelDia: nil)

    /// Cuántas partes caben en el héroe sin desbordar la tarjeta.
    static let maxPartes = 4

    static func desde(_ detalle: AssignmentDetail) -> DesgloseSesion {
        guard let workout = detalle.workout, !workout.blocks.isEmpty else { return .vacio }

        let bloques = workout.blocks.sorted { $0.blockPosition < $1.blockPosition }
        let partes = bloques.map { bloque in
            ParteDeSesion(
                id: bloque.uid,
                titulo: bloque.title,
                nombresEjercicios: bloque.items.map(\.exerciseName),
                estructural: Self.esEstructural(bloque.format),
                modalidad: bloque.items.first.flatMap(Self.modalidad)
            )
        }

        // El bloque PRINCIPAL es el primero que no es marco — de ahí sale la
        // cabecera de formato, que describe la SESIÓN entera (AMRAP, rondas…).
        let noEstructurales = bloques.filter { !Self.esEstructural($0.format) }
        let principal = noEstructurales.first ?? bloques[0]
        let prescripcion = principal.items.first?.prescription

        let notaLimpia = workout.coachNote?.trimmingCharacters(in: .whitespacesAndNewlines)

        return DesgloseSesion(
            partes: partes,
            formato: prescripcion.flatMap(PrescriptionRenderer.wodHeader),
            notaDelDia: (notaLimpia?.isEmpty == false) ? notaLimpia : nil
        )
    }

    /// `estructural` derivado del formato del bloque — ver `ParteDeSesion`.
    static func esEstructural(_ format: String) -> Bool {
        switch PrescriptionScheme(canonicalizing: format) {
        case .warmup, .cooldown: return true
        default: return false
        }
    }

    /// La modalidad de un ejercicio: la que declara su prescripción y, si no la
    /// declara, la CATEGORÍA del ejercicio (running / rowing / strength …), que
    /// `Theme.Modality` ya sabe leer. Sin ninguna de las dos, nil → punto neutro.
    private static func modalidad(_ item: WorkoutItem) -> String? {
        item.prescription?.modality?.rawValue ?? item.exerciseCategory
    }
}

// MARK: - Cuánto dura, en una frase

/// Lo que se lee donde va la duración de una sesión: o el reloj que el plan deja
/// ESCRITO —un suelo, «desde 45 min»— o la razón por la que no lo deja. Nunca un
/// hueco y nunca un guion.
///
/// Es la misma pareja que ya usaba Inicio, extraída para que el plan y el héroe
/// no puedan escribirla de dos maneras (§2). El `acento` va con el número: una
/// razón no es un dato y no se destaca como si lo fuera.
enum DuracionDeSesion {
    static func texto(_ session: AthleteWeekDaySession) -> String? {
        if let suelo = Formato.duracionPrevista(session.estDurationMinutes) { return suelo }
        return session.durationUnknownReason?.frase
    }

    /// True cuando el texto lleva cifra — lo único que se puede acentuar.
    static func llevaNumero(_ session: AthleteWeekDaySession) -> Bool {
        Formato.duracionPrevista(session.estDurationMinutes) != nil
    }
}
