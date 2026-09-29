import Foundation

// DEL CABLE A LA LECTURA — lo que la app YA lee, traducido al contrato de «Carreras».
//
// Aquí, y solo aquí, se pelean el cable y el diseño: los modelos del servidor
// (`RacesHubResponse`, `CarrerasOverview`, `GoalGap`, `DoblesRaceGap`, `PredictionReview`) entran y
// sale una `LecturaCarreras` con segundos, enums y cuentas ya hechas. De ahí en adelante nadie lee
// un texto del servidor para sacarle un número. Cada decisión de traducción es una línea con su
// porqué, y `LecturaCarrerasDesdeCableTests` las clava una a una.

// MARK: - Lo que dice el predicho, antes de reducirlo

/// Lo que se sabe del predicho de la carrera principal: el resultado de pedirlo, sin interpretar.
enum LecturaDePredicho {
    /// Se está pidiendo.
    case pidiendo
    /// La lectura falló (red, servidor, forma que no se lee).
    case fallo
    /// `GET /api/athlete/goal-gap` — el predicho individual.
    case individual(GoalGap)
    /// `GET /api/athlete/dobles/race-gap` — el predicho conjunto de la pareja.
    case pareja(DoblesRaceGap)
}

// MARK: - La carga de cada rebanada del store

extension CargaCarreras {
    /// De una rebanada del store: con valor (aunque esté revalidando) es lista; sin valor y con un
    /// fallo es un error; sin nada todavía, en frío. Un fallo NO es un vacío: la pestaña lo dice.
    init<V>(_ slice: Slice<V>) {
        if slice.value != nil || slice.hasLoaded {
            self = .lista
        } else if slice.loadFailed {
            self = .error
        } else {
            self = .fria
        }
    }
}

// MARK: - Lo que el servidor manda como TEXTO

/// «4:12» · «1:02:10» · «+0:42» · «−2:34» a segundos. El servidor manda pre-formateados el tiempo de
/// cada estación, su delta y el ritmo de cada km; con eso no hay escala única ni cuenta posible, así
/// que se leen UNA vez aquí. Lo que no se lee es nil (un guion del servidor no es un tiempo).
enum DuracionDeCable {

    /// «M:SS» o «H:MM:SS» → segundos. nil si no tiene esa forma.
    static func segundos(_ texto: String?) -> Int? {
        guard let texto else { return nil }
        let partes = texto.trimmingCharacters(in: .whitespaces).split(separator: ":", omittingEmptySubsequences: false)
        guard partes.count == 2 || partes.count == 3 else { return nil }
        var total = 0
        for parte in partes {
            guard let n = Int(parte), n >= 0 else { return nil }
            total = total * 60 + n
        }
        return total
    }

    /// «+0:42» · «−2:34» (menos tipográfico, U+2212) · «-2:34» · «±0:00» → segundos con signo.
    static func segundosConSigno(_ texto: String?) -> Int? {
        guard let texto else { return nil }
        let limpio = texto.trimmingCharacters(in: .whitespaces)
        guard let primero = limpio.first else { return nil }
        let signo: Int
        switch primero {
        case "+": signo = 1
        case "\u{2212}", "-": signo = -1
        case "±": signo = 0
        default: return nil
        }
        guard let magnitud = segundos(String(limpio.dropFirst())) else { return nil }
        return signo * magnitud
    }
}

/// La caída de ritmo de la segunda mitad. El servidor la dice en una frase («Caída de ritmo en la
/// segunda mitad (+18s/km)»): el número se lee de ahí UNA vez y la frase la escribe la vista. La
/// solución limpia es que el servidor mande el número (pendiente, se dice en el informe); mientras
/// tanto, una frase que no se lee es nil: sin aviso, nunca uno inventado.
enum CaidaDeRitmoCable {
    static func segundos(nota: String?) -> Int? {
        guard let nota, let dentro = nota.range(of: "+") else { return nil }
        let resto = nota[dentro.upperBound...]
        let cifras = resto.prefix { $0.isNumber }
        guard !cifras.isEmpty, let n = Int(cifras), resto.dropFirst(cifras.count).trimmingCharacters(in: .whitespaces).hasPrefix("s/km")
        else { return nil }
        return n
    }
}

// MARK: - Las carreras: del hub a las próximas y las pasadas

extension ProximaCarrera {
    /// Una próxima del hub. La cuenta atrás se mide contra el `hoy` del atleta (no se fía del
    /// `daysUntil` guardado: una copia de ayer diría «39» el día 38). Nunca negativa.
    init(_ u: UpcomingRace, hoy: String) {
        let fecha = u.raceDate.flatMap { $0.isEmpty ? nil : $0 }
        self.init(
            raceId: u.raceId,
            nombre: u.name,
            tipoEvento: TipoEventoCarrera(wire: u.eventType),
            formato: FormatoCarrera(wire: u.format) ?? .individual,
            division: DivisionCarrera(wire: u.division),
            categoria: CategoriaCarrera(wire: u.genderCategory),
            fecha: fecha,
            lugar: u.location.flatMap { $0.isEmpty ? nil : $0 },
            metaS: (u.goalTimeSeconds ?? 0) > 0 ? u.goalTimeSeconds : nil,
            diasHasta: fecha.flatMap { DecideCarreras.diasEntre(hoy, $0) }.map { max(0, $0) },
            prioridad: PrioridadCarrera(wire: u.priority)
        )
    }
}

extension CarreraPasada {
    /// Una carrera con resultado (o al menos importada) del hub.
    init(_ r: ImportedRace) {
        func positivo(_ s: Int?) -> Int? { (s ?? 0) > 0 ? s : nil }
        // Un parcial en cero no es un parcial: la importación no lo trajo (el servidor guarda 0).
        let indicesEstacion = Set(DecideCarreras.indicesEstacion)
        self.init(
            raceId: r.race_id,
            nombre: r.name,
            fecha: r.race_date.flatMap { $0.isEmpty ? nil : $0 },
            tipoEvento: TipoEventoCarrera(wire: r.event_type),
            formato: FormatoCarrera(wire: r.format) ?? .individual,
            division: DivisionCarrera(wire: r.division) ?? .open,
            resultadoS: positivo(r.result_time_seconds),
            correrS: positivo(r.run_total_seconds),
            roxzoneS: positivo(r.roxzone_seconds),
            vueltas: r.run_splits.map { $0 > 0 ? $0 : nil },
            estaciones: r.station_splits
                .filter { indicesEstacion.contains($0.index) }
                .sorted { $0.index < $1.index }
                .map { ParcialEstacion(indice: $0.index, segundos: positivo($0.seconds)) },
            companeros: r.partners
                .sorted { $0.position < $1.position }
                .map { CompaneroDeEquipo(posicion: $0.position, nombre: $0.name) },
            puesto: positivo(r.overall_rank),
            campo: positivo(r.field_size)
        )
    }

    /// Un objetivo que ya pasó y sigue en la copia de las «próximas» (el servidor lo pasaría a
    /// pasadas): baja al historial sin resultado. Así una carrera nunca cae entre las dos listas.
    init(vencida u: UpcomingRace) {
        self.init(
            raceId: u.raceId,
            nombre: u.name,
            fecha: u.raceDate.flatMap { $0.isEmpty ? nil : $0 },
            tipoEvento: TipoEventoCarrera(wire: u.eventType),
            formato: FormatoCarrera(wire: u.format) ?? .individual,
            division: DivisionCarrera(wire: u.division) ?? .open,
            resultadoS: nil,
            correrS: nil,
            roxzoneS: nil,
            vueltas: [],
            estaciones: [],
            companeros: [],
            puesto: nil,
            campo: nil
        )
    }
}

// MARK: - El análisis

extension AnalisisCarrera {
    /// El análisis de la última carrera individual con resultado. nil si el servidor no tiene
    /// ninguna. Sin coach no hay informe de la IA del método (la lectura lo garantiza).
    init?(_ overview: CarrerasOverview, revision: PredictionReview?, conCoach: Bool) {
        guard let ultima = overview.last_race, let raceId = Int(ultima.id) else { return nil }
        let estaciones = overview.station_benchmarks.map { b in
            EstacionVsReferencia(
                estacion: b.station,
                tiempoS: DuracionDeCable.segundos(b.time),
                deltaS: DuracionDeCable.segundosConSigno(b.delta),
                fraccion: b.fraction,
                severidad: b.severity.map(SeveridadCarrera.init(wire:))
            )
        }
        let ritmo = overview.running_splits.enumerated().map { i, v in
            VueltaRitmo(
                km: Int(v.label.dropFirst()) ?? i + 1,
                ritmoS: DuracionDeCable.segundos(v.pace),
                altura: v.height,
                severidad: SeveridadCarrera(wire: v.severity)
            )
        }
        self.init(
            raceId: raceId,
            nombre: ultima.event_name,
            fecha: FechaES.fecha(ultima.date) == nil ? nil : ultima.date,
            estaciones: estaciones,
            caidaRitmoS: CaidaDeRitmoCable.segundos(nota: overview.pace_drop_note),
            ritmoPorKm: ritmo,
            informe: conCoach ? overview.ia_report.map { InformeIA(resumen: $0.summary, grupos: $0.recommended_groups) } : nil,
            predichoVsReal: revision.flatMap { $0.isOK ? PredichoVsReal($0) : nil }
        )
    }
}

extension PredichoVsReal {
    init(_ r: PredictionReview) {
        self.init(
            predijimosS: r.predictedTotalS,
            hicisteS: r.actualTotalS,
            precisionPct: r.accuracyPct,
            precisionPalabra: r.accuracyLabelEs
        )
    }
}

// MARK: - El predicho del objetivo principal

extension PrediccionCarrera {

    /// El predicho de `principal` con lo que se sabe. Las reglas, en el orden en que mandan:
    ///  1. sin principal, o una carrera que no es HYROX con meta → no aplica (el desglose por
    ///     estaciones es solo de HYROX);
    ///  2. sin tiempo objetivo → sin meta (no hay contra qué medir; el servidor tampoco lo da) — ni se
    ///     pide: es una lectura menos y la salida es fijarlo;
    ///  3. pidiéndolo → cargando; falló → error;
    ///  4. del servidor: cifra si el total es completo, parcial (SIN cifra, con los tramos que faltan
    ///     por su nombre) si faltan tramos, y lo que diga `availability` en el resto.
    static func desde(principal: ProximaCarrera?, lectura: LecturaDePredicho?) -> PrediccionCarrera {
        guard let principal else { return .noAplica }
        guard principal.tipoEvento == .hyrox else { return principal.metaS == nil ? .sinMeta : .noAplica }
        guard principal.metaS != nil else { return .sinMeta }
        switch lectura {
        case nil, .pidiendo?: return .cargando
        case .fallo?: return .error
        case .individual(let gap)?: return desde(gap)
        case .pareja(let gap)?: return desde(gap)
        }
    }

    private static func desde(_ gap: GoalGap) -> PrediccionCarrera {
        switch gap.availability.lowercased() {
        case "no_goal": return .sinMeta
        case "no_target_race": return .noAplica
        case "no_data": return .sinDatos(pareja: nil)
        default:
            if let total = gap.predictedTotalS { return .cifra(totalS: total, huecoS: gap.gapS, pareja: nil) }
            let faltan = gap.segments.filter(\.isSinDatos).map(\.labelEs)
            guard !gap.segments.isEmpty, !faltan.isEmpty else { return .sinDatos(pareja: nil) }
            return .parcial(medidos: gap.segments.count - faltan.count, de: gap.segments.count, faltan: faltan, pareja: nil)
        }
    }

    private static func desde(_ gap: DoblesRaceGap) -> PrediccionCarrera {
        let pareja = gap.partnerName.flatMap { $0.isEmpty ? nil : $0 }
        switch gap.availability.lowercased() {
        case "no_pair": return .sinPareja
        case "no_data": return .sinDatos(pareja: pareja)
        default:
            if let total = gap.predictedTotalS { return .cifra(totalS: total, huecoS: gap.gapS, pareja: pareja) }
            let faltan = gap.segments.filter { $0.tier.lowercased() == "sin_datos" }.map(\.labelEs)
            guard !gap.segments.isEmpty, !faltan.isEmpty else { return .sinDatos(pareja: pareja) }
            return .parcial(medidos: gap.segments.count - faltan.count, de: gap.segments.count, faltan: faltan, pareja: pareja)
        }
    }
}

// MARK: - La lectura entera

extension LecturaCarreras {

    /// Traduce lo que la pestaña lee del store y de sus dos peticiones propias (el predicho y su
    /// revisión) al contrato. Determinista: recibe `hoy` en vez de mirar el reloj.
    static func desde(
        hub: RacesHubResponse?,
        cargaHub: CargaCarreras,
        overview: CarrerasOverview?,
        cargaAnalisis: CargaCarreras,
        predicho: LecturaDePredicho?,
        revision: PredictionReview?,
        conCoach: Bool,
        noLeidosChat: Int,
        hoy: String
    ) -> LecturaCarreras {
        // Un objetivo con fecha anterior a `hoy` ya es historia, aunque la copia local aún lo tenga
        // en «próximas»: baja a «pasadas» sin resultado.
        let (vigentes, vencidas) = partition(hub?.upcoming ?? []) { u in
            guard let fecha = u.raceDate, !fecha.isEmpty else { return true }
            return fecha >= hoy
        }
        let proximas = DecideCarreras.ordenarProximas(vigentes.map { ProximaCarrera($0, hoy: hoy) })
        let pasadas = DecideCarreras.ordenarPasadas(
            (hub?.past ?? []).map(CarreraPasada.init) + vencidas.map(CarreraPasada.init(vencida:))
        )
        let listo = cargaHub == .lista
        return LecturaCarreras(
            hoy: hoy,
            conCoach: conCoach,
            // Sin coach no hay chat: el globito no existe aunque el store guarde un número.
            noLeidosChat: conCoach ? max(0, noLeidosChat) : 0,
            cargaHub: cargaHub,
            cargaAnalisis: cargaAnalisis,
            proximas: proximas,
            pasadas: pasadas,
            prediccion: listo
                ? PrediccionCarrera.desde(principal: DecideCarreras.principalDe(proximas), lectura: predicho)
                : .noAplica,
            analisis: cargaAnalisis == .lista
                ? overview.flatMap { AnalisisCarrera($0, revision: revision, conCoach: conCoach) }
                : nil
        )
    }

    private static func partition<T>(_ lista: [T], _ predicado: (T) -> Bool) -> ([T], [T]) {
        var si: [T] = [], no: [T] = []
        for x in lista { if predicado(x) { si.append(x) } else { no.append(x) } }
        return (si, no)
    }
}
