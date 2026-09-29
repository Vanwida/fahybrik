import Foundation

// EL COPY DEL PLAN SIN COACH — cada frase que se escribe a partir de un número, en UN sitio. El dominio manda
// enteros y enums; el castellano vive aquí, para que no haya dos frases para el mismo número (CONTRATO-UI §2).
// Espejo de `web/components/design-twin/kit-plan/libre.ts`.
//
// Las frases dicen lo que se sabe y lo que NO: un tiempo de pareja se llama de pareja, un ritmo de dobles es
// un suelo, y una comparación con otra categoría no se hace (los pesos cambian entre open y pro).
//
// También traduce lo que llega del servidor (`FreePlanPayload`, `MarkView`) a las piezas de `LecturaLibre`.

enum PlanLibreCopy {

    // MARK: - Constantes: cada slug y umbral del que depende la pantalla, nombrado UNA vez

    /// Las tres marcas de arranque del mockup aprobado, en orden: el 1 km, el remo 500 y el ski 1.000. Slugs del
    /// catálogo (shared/domain/athlete/marks.ts); un slug que el backend no ofrezca simplemente no se pinta.
    static let slugsDeArranque = ["run_1k", "row_500m", "ski_1k"]
    /// La serie biométrica del VO₂ máx (lib/athlete/biometric-trend.ts).
    static let claveVo2 = "vo2max"
    /// Como mucho se nombran estas marcas pendientes antes del «y N más».
    static let maxMarcasNombradas = 3
    /// A partir de estos días la cuenta atrás se lee en semanas y no en días.
    static let semanasDesdeDias = 14

    // MARK: - Las marcas

    /// Las pendientes en el orden de arranque: las tres de arranque primero (son las mismas tres puertas que la
    /// pantalla ofrece, así que el atleta lee UNA historia y no dos), y a igualdad, el orden del catálogo. Se
    /// compara el índice explícitamente: la ordenación de Swift no es estable.
    static func enOrdenDeArranque(_ marcas: [MarkView]) -> [MarkView] {
        func rango(_ slug: String) -> Int { slugsDeArranque.firstIndex(of: slug) ?? slugsDeArranque.count }
        return marcas.enumerated().sorted { a, b in
            let ra = rango(a.element.slug), rb = rango(b.element.slug)
            return ra == rb ? a.offset < b.offset : ra < rb
        }.map(\.element)
    }

    /// Cómo mide la app esa marca, en lenguaje de gimnasio — cero jerga.
    static func comoSeMide(_ mark: MarkView) -> String {
        let como: String
        switch mark.erg {
        case "row": como = "Con el remo conectado, la app lo mide sola"
        case "ski": como = "Con el ski conectado, la app lo mide sola"
        default:    como = "Calle o cinta, la app lo mide sola"
        }
        return "\(como) · \(duraAprox(mark))"
    }

    /// «te lleva ~4-5 min». El catálogo del servidor manda cuánto DURA el test (`approx_label`); suelto junto al
    /// nombre de la marca se leía como si fuera el tiempo del atleta. Una sola frase para los dos sitios que la usan.
    static func duraAprox(_ mark: MarkView) -> String {
        // Las distancias que se registran (10 km, media, maratón) no se miden en la app: su etiqueta ya es una
        // instrucción, no una duración.
        guard mark.measuredBy != "registered" else { return mark.approxLabel }
        return "te lleva \(mark.approxLabel)"
    }

    /// Qué gana el atleta midiéndola. Una marca pendiente NO es una tarea suelta: es la pieza que le falta al plan.
    static func desbloquea(_ mark: MarkView) -> String {
        switch mark.erg {
        case "row": return "Mídelo y tu semana gana la sesión de remo"
        case "ski": return "Mídelo y tu semana gana la sesión de ski"
        default: break
        }
        return mark.measuredBy == "registered"
            ? "Apúntala y afinamos los ritmos de tu semana"
            : "Mídelo y afinamos los ritmos de tu semana"
    }

    /// Una marca del catálogo, ya escrita para pintarse (medida o pendiente).
    static func marca(_ mark: MarkView) -> MarcaLibre {
        MarcaLibre(
            slug: mark.slug, etiqueta: mark.label,
            valor: mark.best.map { MarkFormat.value(mark, $0.value) },
            cuando: mark.best.flatMap { MarkFormat.relative($0.recordedAt) },
            como: comoSeMide(mark), desbloquea: desbloquea(mark), dura: duraAprox(mark)
        )
    }

    /// «el 1 km» / «el remo 500 m»: el nombre de la marca tal y como se lee dentro del botón.
    static func nombreEnBoton(_ etiqueta: String) -> String { "el \(etiqueta.lowercased())" }

    /// «Para decirte cuánto tardarías aún nos faltan tus marcas: 1 km, Remo 500 m y Ski 1.000 m.» Nil sin marcas pendientes.
    static func marcasQueFaltan(_ etiquetas: [String]) -> String? {
        guard !etiquetas.isEmpty else { return nil }
        let mostradas = Array(etiquetas.prefix(maxMarcasNombradas))
        let resto = etiquetas.count - mostradas.count
        let texto = resto > 0 ? "\(mostradas.joined(separator: ", ")) y \(resto) más" : lista(mostradas)
        return "Para decirte cuánto tardarías aún nos faltan tus marcas: \(texto)."
    }

    /// «a, b y c».
    static func lista(_ items: [String]) -> String {
        guard let ultimo = items.last else { return "" }
        if items.count == 1 { return ultimo }
        return items.dropLast().joined(separator: ", ") + " y " + ultimo
    }

    // MARK: - La carrera

    /// «es hoy» · «mañana» · «en 5 días» · «en 9 semanas». Nil si el cable no trae cuenta atrás.
    static func cuentaAtras(_ dias: Int?) -> String? {
        guard let dias else { return nil }
        let n = max(0, dias)
        switch n {
        case 0: return "es hoy"
        case 1: return "mañana"
        case 2..<semanasDesdeDias: return "en \(n) días"
        default:
            let semanas = Int((Double(n) / 7).rounded())
            return "en \(semanas) \(semanas == 1 ? "semana" : "semanas")"
        }
    }

    static func recuentoDeCarreras(_ n: Int) -> String { n == 1 ? "1 carrera" : "\(n) carreras" }

    /// «Berlín · may 2025».
    static func dondeYCuando(_ f: FinalDeCarrera) -> String {
        f.cuando.map { "\(f.lugar) · \($0)" } ?? f.lugar
    }

    /// El tiempo de una carrera: «1:04:22» / «32:39».
    static func reloj(_ segundos: Int) -> String { Formato.clock(Double(segundos)) }

    static func ritmoKm(_ segundosPorKm: Double) -> String { Formato.ritmo(segundosPorKm, .porKm) }

    /// En dobles corren juntos: el ritmo lo marca el más lento, así que es un suelo.
    static func notaOchoKm(_ run: OchoKm) -> String {
        run.suelo
            ? "En \(run.lugar). Corristeis los 8 km los dos, así que este es tu suelo: más lento no vas."
            : "En \(run.lugar). Los 8 km de tu mejor carrera."
    }

    /// El último frente al mejor, cuando no hay tendencia que afirmar.
    static func ultimoFrenteAlMejor(ultimo: OchoKm, mejor: OchoKm) -> String {
        let ritmo = ritmoKm(ultimo.ritmoSKm)
        if ultimo.suelo || mejor.suelo {
            return "Tu último fue \(ritmo) en \(ultimo.lugar). En dobles el ritmo lo marca la pareja, así que restarle tu mejor no te diría cómo estás."
        }
        let hueco = abs(Int((ultimo.ritmoSKm - mejor.ritmoSKm).rounded()))
        if hueco == 0 { return "Tu último fue \(ritmo) en \(ultimo.lugar), clavado a tu mejor." }
        let sentido = ultimo.ritmoSKm > mejor.ritmoSKm ? "más lento" : "más rápido"
        return "Tu último fue \(ritmo) en \(ultimo.lugar): \(hueco) s por kilómetro \(sentido) que tu mejor."
    }

    static func textoTendencia(_ t: EvidenciaDeCarreras.Tendencia) -> String {
        let s = abs(Int(t.deltaSKm.rounded()))
        switch t.sentido {
        case .mejora:  return "Corriendo, vas a mejor: \(s) s por kilómetro más rápido en tus últimas \(t.carreras) carreras."
        case .empeora: return "Corriendo, vas a peor: \(s) s por kilómetro más lento en tus últimas \(t.carreras) carreras."
        case .estable: return "Tu ritmo de carrera lleva \(t.carreras) carreras estable."
        }
    }

    /// La línea que va bajo los 8 km: la tendencia, o los dos hechos y por qué no se restan. Nil si no hay nada que decir.
    static func lineaDeProgreso(_ e: EvidenciaDeCarreras) -> String? {
        if let t = e.tendencia { return textoTendencia(t) }
        if let ultimo = e.ultimo8km, let mejor = e.mejor8km { return ultimoFrenteAlMejor(ultimo: ultimo, mejor: mejor) }
        return nil
    }

    /// `deltaS = objetivo − mejor`. Positivo = el objetivo es MÁS LENTO de lo que ya corrió: mejor conversación que la de siempre.
    static func veredictoDelObjetivo(mejor: FinalDeCarrera, deltaS: Int) -> String {
        let hueco = reloj(abs(deltaS))
        let donde = dondeYCuando(mejor)
        if deltaS > 0 { return "Ya fuiste \(hueco) más rápido que eso en \(donde). Tu objetivo se te ha quedado corto." }
        if deltaS < 0 { return "Te faltan \(hueco) desde tu mejor marca en \(donde)." }
        return "Vas exactamente a tu objetivo, con lo que hiciste en \(donde)."
    }

    static func textoSinComparacion(motivo: Comparacion.Motivo, categoria: String?) -> String {
        switch motivo {
        case .formatoDistinto:
            return "No te comparamos con tus carreras porque ninguna fue en \(categoria ?? "esta categoría"), y ahí cambian los pesos. Un tiempo de otra categoría no te diría la verdad."
        case .sinCarreras:
            return "Cuando corras una en esta categoría te decimos cuánto te falta."
        }
    }

    // MARK: - La semana propia

    /// El rótulo del panel del día elegido: lo que tienes por delante o lo que hiciste. Hoy no lleva ninguno:
    /// «Hoy · Jueves 1» ya lo dice.
    static func rotuloDelPanel(iso: String, hoy: String) -> String {
        guard let d = FechasDelPlan.diasEntre(hoy, iso), d != 0 else { return "" }
        return d > 0 ? "lo que tienes" : "lo que hiciste"
    }

    /// Lo que se dice de un día sin sesiones, según sea hoy, futuro o pasado.
    static func textoDiaVacio(iso: String, hoy: String) -> String {
        let d = FechasDelPlan.diasEntre(hoy, iso) ?? 0
        return d == 0 ? "Aún no has entrenado hoy." : d > 0 ? "Nada programado ese día." : "Ese día no entrenaste."
    }

    /// «2 sesiones hechas · desde 1 h 20 · 1 sin tiempo previsto»: lo que llevas de la semana. El tiempo es un
    /// SUELO (lo que nadie escribe solo suma) y el hueco se declara al lado: cada mitad sola miente. Nil si no hay
    /// ninguna hecha.
    static func resumenDeSemana(_ semana: SemanaDelPlan) -> String? {
        let hechas = semana.dias.flatMap(\.sesiones).filter { $0.estado.trabajada }
        guard !hechas.isEmpty else { return nil }
        let cuenta = "\(hechas.count) \(hechas.count == 1 ? "sesión hecha" : "sesiones hechas")"
        let volumen = VolumenPrevisto.lee(hechas.map(\.estDurationMinutes)).linea
        return [cuenta, volumen].compactMap { $0 }.joined(separator: " · ")
    }

    // MARK: - Del cable a la lectura

    static func evidencia(_ e: FreeRaceEvidence) -> EvidenciaDeCarreras {
        func ochoKm(_ r: FreeRunEvidence) -> OchoKm {
            OchoKm(ritmoSKm: r.paceSPerKm, totalS: r.totalSeconds, lugar: r.race.location ?? r.race.name, suelo: r.partnerBounded)
        }
        // El último solo se enseña si no es el mismo que el mejor: dos veces la misma carrera no es un progreso.
        var ultimo: OchoKm?
        if let l = e.latestRun, let b = e.bestRun, l.race.raceId != b.race.raceId { ultimo = ochoKm(l) }
        return EvidenciaDeCarreras(
            carreras: e.racesCounted,
            mejorTiempo: e.bestFinish.map(final),
            mejor8km: e.bestRun.map(ochoKm),
            ultimo8km: ultimo,
            transiciones: e.bestRoxzone.map { .init(segundos: $0.seconds, lugar: $0.race.location ?? $0.race.name) },
            tendencia: e.runTrend.map {
                .init(
                    sentido: $0.direction == "mejora" ? .mejora : $0.direction == "empeora" ? .empeora : .estable,
                    deltaSKm: $0.deltaSPerKm, carreras: $0.racesCounted)
            }
        )
    }

    static func final(_ f: FreeFinishEvidence) -> FinalDeCarrera {
        FinalDeCarrera(
            tiempoS: f.totalSeconds, lugar: f.race.location ?? f.race.name, cuando: mesYAno(f.race.raceDate),
            categoria: categoria(de: f.race), equipo: f.teamResult
        )
    }

    static func comparacion(_ c: FreeGoalCheck) -> Comparacion {
        if let mejor = c.comparableBest, let delta = c.deltaSeconds { return .mejor(final(mejor), deltaS: delta) }
        return .sin(
            motivo: c.notComparableReason == "formato_distinto" ? .formatoDistinto : .sinCarreras,
            categoria: categoria(de: c.target)
        )
    }

    static func semanaBloqueada(_ w: FreePlannedWeek) -> SemanaBloqueada {
        SemanaBloqueada(
            sesiones: w.sessions.map {
                SesionBloqueada(dia: FreePlanWeekCopy.day($0.weekday), titulo: FreePlanWeekCopy.title($0), detalle: FreePlanWeekCopy.detail($0))
            },
            visibles: w.visibleCount,
            base: FreePlanWeekCopy.basisLine(w)
        )
    }

    /// «dobles pro» / «dobles» / nil para individual sin división.
    static func categoria(de race: FreeRaceRef) -> String? {
        var partes: [String] = []
        switch race.format {
        case "doubles": partes.append("dobles")
        case "relay": partes.append("relevos")
        default: break
        }
        switch race.division {
        case "pro": partes.append("pro")
        case "elite": partes.append("élite")
        case "open": partes.append("open")
        default: break
        }
        if race.genderCategory == "mixed" { partes.append("mixto") }
        return partes.isEmpty ? nil : partes.joined(separator: " ")
    }

    private static let meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

    /// «may 2025» a partir de «2025-05-16».
    static func mesYAno(_ iso: String?) -> String? {
        guard let iso, iso.count >= 7 else { return nil }
        let partes = iso.split(separator: "-")
        guard partes.count >= 2, let mes = Int(partes[1]), (1...12).contains(mes) else { return nil }
        return "\(meses[mes - 1]) \(partes[0])"
    }
}

// MARK: - La semana bloqueada: la prescripción, redactada

/// Toda la prescripción de la semana bloqueada se redacta AQUÍ, a partir de los números del servidor. El dominio
/// manda enteros y enums; el castellano vive en el cliente, en un solo sitio, para que no haya dos frases
/// distintas para el mismo número.
enum FreePlanWeekCopy {
    private static let dias = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]

    static func day(_ weekday: Int) -> String {
        dias.indices.contains(weekday) ? dias[weekday] : ""
    }

    /// «4:15/km» a partir de segundos por kilómetro.
    private static func pace(_ secondsPerKm: Int) -> String {
        Formato.ritmo(Double(secondsPerKm), .porKm)
    }

    /// «1:30» de recuperación.
    private static func rest(_ seconds: Int) -> String {
        Formato.clock(Double(seconds))
    }

    static func title(_ session: FreePlannedSession) -> String {
        switch session.kind {
        case "run_quality": return "Series de 1 km"
        case "hybrid": return "Correr con estaciones"
        case "long_run": return "Rodaje largo"
        case "erg": return ergTitle(session.erg?.erg)
        case "strength": return strengthTitle(session.strength?.exerciseSlug)
        default: return "Sesión"
        }
    }

    private static func ergTitle(_ erg: String?) -> String {
        switch erg {
        case "ski": return "Ski por series"
        case "row": return "Remo por series"
        default: return "Ergo por series"
        }
    }

    private static func strengthTitle(_ slug: String?) -> String {
        guard let slug, let lift = StrengthService.STRENGTH_LIFTS.first(where: { $0.slug == slug }) else {
            return "Fuerza"
        }
        return "Fuerza: \(lift.label.lowercased())"
    }

    /// La línea de prescripción, ya personalizada. Completa por modalidad: qué se mide, contra qué objetivo y
    /// cuánto se descansa.
    static func detail(_ session: FreePlannedSession) -> String {
        if let run = session.run { return runDetail(run) }
        if let erg = session.erg { return ergDetail(erg) }
        if let strength = session.strength { return strengthDetail(strength) }
        return ""
    }

    private static func runDetail(_ run: FreeRunPrescription) -> String {
        switch run.shape {
        case "intervals":
            let distance = run.distanceM.map(distanceLabel) ?? ""
            var line = "\(run.reps) x \(distance) a \(pace(run.targetPaceSPerKm))"
            if let restS = run.restS { line += ", \(rest(restS)) de recuperación" }
            return line
        case "continuous":
            let minutes = (run.durationS ?? 0) / 60
            return "\(minutes) min a \(pace(run.targetPaceSPerKm))"
        default:
            let distance = run.distanceM.map(distanceLabel) ?? ""
            let work = run.stations.map { "\($0.reps) \(stationName($0.station))" }.joined(separator: " + ")
            let base = "\(run.reps) rondas: \(distance) a \(pace(run.targetPaceSPerKm))"
            return work.isEmpty ? base : "\(base) + \(work)"
        }
    }

    private static func ergDetail(_ erg: FreeErgPrescription) -> String {
        let pace500 = Formato.ritmo(Double(erg.targetPaceSPer500), .por500m)
        return "\(erg.reps) x \(distanceLabel(erg.distanceM)) a \(pace500), \(rest(erg.restS)) de recuperación"
    }

    private static func strengthDetail(_ strength: FreeStrengthPrescription) -> String {
        let percent = Int((strength.percentOfOneRm * 100).rounded())
        return "\(strength.sets) x \(strength.reps) con \(Formato.kg(strength.loadKg)) (\(percent)% de tu máximo), RIR \(strength.rir)"
    }

    /// «1 km» / «500 m» — como se dice en el gimnasio.
    private static func distanceLabel(_ meters: Int) -> String {
        if meters >= 1000, meters % 1000 == 0 { return "\(meters / 1000) km" }
        return "\(meters) m"
    }

    private static func stationName(_ station: String) -> String {
        switch station {
        case "wall_balls": return "wall balls"
        case "burpee_broad_jump": return "burpees con salto"
        default: return station
        }
    }

    /// De dónde salen los números. Es la línea que separa esto de un anuncio, así que nombra la fuente real y no
    /// promete nada más.
    static func basisLine(_ week: FreePlannedWeek) -> String {
        guard let basis = week.sessions.first?.basis else { return "Calculado con tus datos" }
        switch basis.source {
        case "carrera":
            if let race = basis.race {
                return "Calculado con tus 8 km de \(race.location ?? race.name)"
            }
            return "Calculado con tus carreras"
        case "vo2max":
            return "Calculado con el VO₂ máx de tu reloj"
        default:
            return "Calculado con tus marcas"
        }
    }
}
