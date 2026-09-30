import Foundation

// DE LA APP A LA LECTURA — cada campo de `LecturaHoy` y de dónde sale.
//
// `FuentesHoy` es TODO lo que la portada lee, sin un solo `@Environment` ni servicio de por
// medio: las porciones del `AppDataStore`, lo que Hoy carga por su cuenta (`HoyModelo`) y el
// estado del dispositivo (check-in, Salud, el entreno guardado). Así la traducción
// `LecturaHoy.desde(_:)` es una función pura que se prueba con datos hechos a mano.
//
// NADA se inventa (CONTRATO-UI §7): un dato que no ha llegado es `cargando` (ni vacío ni
// invitación), uno que llegó vacío es un vacío honesto, y un texto del coach (la fase) se lee tal
// cual lo compuso el servidor.

struct FuentesHoy {
    var ahora: Date = Date()
    var conCoach: Bool

    // El AppDataStore
    var identidad: AthleteIdentity?
    var plan: AthletePlanWeekResponse?
    var planCargado: Bool
    /// El plan falló y no hay caché: un arranque sin red.
    var planFallo: Bool
    var macro: AthleteMacroProgressResponse?
    var disposicion: DailyReadinessPayload?
    var disposicionCargada: Bool
    var analisisDeCarrera: RunningAnalysis?
    var analisisCargado: Bool
    var noLeidosChat: Int = 0
    var comunicadosPendientes: Int = 0
    /// Las carreras del hub: la foto del póster se elige por la identidad de la carrera (raceId), la misma que Carreras.
    var carrerasProximas: [UpcomingRace] = []

    // El dispositivo
    var checkinPendiente: Bool
    var saludConectada: Bool
    /// Nil = Salud aún no ha contestado.
    var pasos: HealthKitStepsReader.Reading?
    /// El entreno guardado para luego, si es válido y no hay otro vivo.
    var guardado: (titulo: String, guardadoEn: Date)?

    // Lo que Hoy carga por su cuenta (`HoyModelo`). Nil = desconocido: se calla, no se inventa.
    var bateria: BatteryStatus?
    var revision: AthleteReviewState?
    /// La revisión que se acaba de reservar (gana al estado cargado hasta el próximo refresco).
    var revisionReservada: AthleteReviewAppointment?
    var parejaEnVivo: PartnerLiveStatus?
}

extension LecturaHoy {

    static func desde(_ f: FuentesHoy) -> LecturaHoy {
        let cargando = !f.planCargado && !f.planFallo
        let hoy = LeerHoy.entreno(f)
        return LecturaHoy(
            nombre: LeerHoy.primerNombre(f.identidad?.fullName),
            fecha: LeerHoy.fechaLarga(f.ahora),
            hora: LeerHoy.horaLocal(f.ahora),
            conCoach: f.conCoach,
            coach: f.conCoach ? LeerHoy.primerNombre(f.plan?.coachName) : nil,
            iniciales: f.identidad?.initials ?? "",
            fotoURL: f.identidad?.avatarURLResuelta,
            noLeidosChat: f.conCoach ? max(0, f.noLeidosChat) : 0,
            comunicados: f.conCoach ? max(0, f.comunicadosPendientes) : 0,
            checkinPendiente: f.checkinPendiente,
            cargando: cargando,
            disposicion: LeerHoy.disposicion(f),
            camino: LeerHoy.camino(f),
            simulacion: f.conCoach ? LeerHoy.simulacion(f) : nil,
            hoy: hoy,
            reclamos: LeerHoy.reclamos(f),
            marca: LeerHoy.marca(f.analisisDeCarrera, cargado: f.analisisCargado),
            pasos: LeerHoy.pasos(f.pasos, saludConectada: f.saludConectada)
        )
    }
}

// MARK: - Cada campo, leído de sus fuentes

/// Las lecturas de cada campo. Aparte de `LecturaHoy` para que ni un nombre coincida con el de un campo.
enum LeerHoy {

    // MARK: - Quién y cuándo

    /// La primera palabra del nombre; nil si no hay (el saludo cae a uno completo de la hora).
    static func primerNombre(_ completo: String?) -> String? {
        let primero = completo?.split(separator: " ").first.map(String.init)
        return (primero?.isEmpty == false) ? primero : nil
    }

    /// «Miércoles 14 ene»: la fecha del día en castellano, con mayúscula inicial.
    static func fechaLarga(_ ahora: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "EEEE d MMM"
        let crudo = f.string(from: ahora)
        return crudo.prefix(1).uppercased() + crudo.dropFirst()
    }

    /// «7:40»: la hora local sin cero delante, como la lee el saludo.
    static func horaLocal(_ ahora: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "H:mm"
        return f.string(from: ahora)
    }

    // MARK: - Cómo llegas hoy

    static func disposicion(_ f: FuentesHoy) -> Disposicion {
        if let p = f.disposicion {
            return .medida(score: p.score, delta7d: p.delta7d, senales: p.breakdown.map(senales) ?? [])
        }
        guard f.disposicionCargada else { return .cargando }
        // Cargó y no hay cifra: el camino más rápido a una es el check-in; si no, lo que falta es Salud.
        if f.checkinPendiente { return .sinDatos(.checkinPendiente) }
        return .sinDatos(f.saludConectada ? .saludConectada : .saludSinConectar)
    }

    /// Las cuatro señales que alimentan la cifra, con el valor real de cada una cuando el servidor lo trae.
    static func senales(_ b: ReadinessBreakdown) -> [Senal] {
        [
            Senal(clave: .checkin, etiqueta: "Check-in", activa: b.hasCheckin, valor: nil),
            Senal(clave: .hrv, etiqueta: "HRV", activa: b.hasHRV,
                  valor: b.hasHRV ? b.hrvMs.map { "\(Int($0.rounded())) ms" } : nil),
            Senal(clave: .sueno, etiqueta: "Sueño", activa: b.hasSleep,
                  valor: b.sleepHours.flatMap { $0 > 0 ? "\(Formato.esDecimal($0)) h" : nil }),
            Senal(clave: .fcReposo, etiqueta: Vocab.fcReposo, activa: b.hasRestingHR,
                  valor: b.hasRestingHR ? b.rhrBpm.map { "\(Int($0.rounded())) \(Vocab.ppm)" } : nil),
        ]
    }

    // MARK: - El entreno de hoy

    static func entreno(_ f: FuentesHoy) -> EntrenoHoy? {
        guard f.conCoach else { return nil }
        if f.planFallo, !f.planCargado { return .errorCarga }
        guard let plan = f.plan else { return nil }
        if plan.week.paused { return .pausado }

        let sesiones = sesionesReales(plan)
        if !sesiones.isEmpty { return .sesiones(sesiones) }

        let hayMas = (plan.week.hasNextWeek ?? false) || plan.week.planStartsOn != nil
        return .descanso(manana: manana(plan, ahora: f.ahora), hayMasPublicado: hayMas)
    }

    private static func rangoDeSlot(_ slot: String) -> Int {
        switch slot.lowercased() {
        case "am": return 0
        case "pm": return 1
        default: return 2
        }
    }

    /// Las sesiones REALES de hoy (con asignación), en el orden del día. Las marcas locales optimistas
    /// se unen al estado del servidor: una sesión recién marcada se lee cerrada antes del próximo refresco.
    static func sesionesReales(_ plan: AthletePlanWeekResponse) -> [SesionHoy] {
        guard let dia = plan.week.days.first(where: { $0.isoDate == plan.week.todayIso }) else { return [] }
        let reales = dia.sessions.enumerated()
            .filter { !$0.element.assignmentId.isEmpty }
            .sorted { a, b in
                let (ra, rb) = (rangoDeSlot(a.element.slot), rangoDeSlot(b.element.slot))
                return ra == rb ? a.offset < b.offset : ra < rb
            }
            .map(\.element)
        return reales.map { s in
            SesionHoy(
                franja: reales.count > 1 ? SesionHoy.Franja(rawValue: s.slot.uppercased()) : nil,
                titulo: s.title,
                modalidad: Theme.Modality.kind(s.modality),
                estado: s.estado,
                libre: s.isSelfOrigin
            )
        }
    }

    /// La primera sesión de un día POSTERIOR de la semana que se ve. Nil si no hay ninguna: nunca se
    /// fabrica una (y el descanso dice si algo más está publicado, ver `EntrenoHoy.descanso`).
    static func manana(_ plan: AthletePlanWeekResponse, ahora: Date) -> Manana? {
        let hoyIso = plan.week.todayIso
        let siguientes = plan.week.days
            .filter { $0.isoDate > hoyIso && $0.sessions.contains { !$0.assignmentId.isEmpty } }
            .sorted { $0.isoDate < $1.isoDate }
        guard let dia = siguientes.first,
              let sesion = dia.sessions.enumerated()
                  .filter({ !$0.element.assignmentId.isEmpty })
                  .min(by: { a, b in
                      let (ra, rb) = (rangoDeSlot(a.element.slot), rangoDeSlot(b.element.slot))
                      return ra == rb ? a.offset < b.offset : ra < rb
                  })?.element
        else { return nil }
        return Manana(
            titulo: sesion.title,
            modalidad: Theme.Modality.kind(sesion.modality),
            dia: nombreDelDia(dia.isoDate, hoyIso: hoyIso)
        )
    }

    /// «mañana» · «el jueves»: cómo se nombra un día de esta semana, anclado al «hoy» del servidor.
    static func nombreDelDia(_ iso: String, hoyIso: String) -> String {
        guard let fecha = FechaES.fecha(iso) else { return "más adelante" }
        if let hoy = FechaES.fecha(hoyIso),
           let dias = Calendar(identifier: .gregorian).dateComponents([.day], from: hoy, to: fecha).day,
           dias == 1 {
            return "mañana"
        }
        return "el \(FechaES.diaSemana(fecha))"
    }

    // MARK: - Camino a la carrera

    static func camino(_ f: FuentesHoy) -> CaminoEstado? {
        guard let plan = f.plan else { return nil }
        if let carrera = plan.targetRace, let dias = carrera.daysUntil {
            let fase = fase(f.macro)
            return .fijada(CarreraDelCamino(
                nombre: carrera.name,
                dias: max(0, dias),
                meta: meta(carrera),
                fase: fase,
                semana: fase.flatMap(posicion(enFase:)),
                foto: BrandImagery.raceCardBackground(
                    nombre: carrera.name,
                    fecha: carrera.raceDate,
                    entre: f.carrerasProximas
                )
            ))
        }
        // La carrera objetivo es del atleta, con o sin coach. La invitación a elegirla, en cambio, es del
        // plan del coach: sin coach no hay «plan cargado» que la deje huérfana.
        return f.planCargado && f.conCoach ? .sinObjetivo : nil
    }

    /// El objetivo de tiempo como techo, con la MISMA grafía que Carreras (`Formato.metaDeCarrera`):
    /// «Sub-59» para minutos enteros, «64:30» si no. Nil sin objetivo. Nunca inventado.
    static func meta(_ carrera: AthleteNextRace) -> String? {
        carrera.goalTimeSeconds.flatMap(Formato.metaDeCarrera)
    }

    /// «{fase} · semana N de M», ya compuesta por el servidor con el nombre que le puso el coach.
    static func fase(_ macro: AthleteMacroProgressResponse?) -> String? {
        let t = macro?.macro.weekLabel?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (t?.isEmpty == false) ? t : nil
    }

    /// (N, M) de «… semana N de M»: los dos primeros enteros tras «semana». Robusto al nombre de la
    /// fase; nil cuando no se lee (entonces el texto dice la posición y no hay regleta).
    static func posicion(enFase etiqueta: String) -> PosicionEnPlan? {
        let bajo = etiqueta.lowercased()
        guard let r = bajo.range(of: "semana") else { return nil }
        let numeros = bajo[r.upperBound...]
            .split(whereSeparator: { !$0.isNumber })
            .compactMap { Int($0) }
        guard numeros.count >= 2, numeros[1] > 0 else { return nil }
        let m = numeros[1]
        return PosicionEnPlan(n: min(max(numeros[0], 1), m), m: m)
    }

    /// La PRIMERA simulación HYROX aún por hacer, hoy o en un día posterior de la semana; abierta si no
    /// hay ninguna. Solo `.pending`: una hecha, a medias o perdida ya pasó (o no pasará) y nunca debe
    /// leerse «programada».
    static func simulacion(_ f: FuentesHoy) -> Simulacion? {
        guard let plan = f.plan else { return nil }
        let hoyIso = plan.week.todayIso
        let proximos = plan.week.days
            .filter { $0.isoDate >= hoyIso }
            .sorted { $0.isoDate < $1.isoDate }
        for dia in proximos {
            let hay = dia.sessions.contains {
                $0.isHyroxSim && SessionMarkState.of(status: $0.status, assignmentId: $0.assignmentId) == .pending
            }
            if hay {
                let esHoy = dia.isoDate == hoyIso
                let nombre = FechaES.fecha(dia.isoDate).map { "el \(FechaES.diaSemana($0))" } ?? "un día de esta semana"
                return .programada(dia: nombre, hoy: esHoy)
            }
        }
        return .abierta
    }

    // MARK: - Lo que reclama

    static func reclamos(_ f: FuentesHoy) -> [Reclamo] {
        var r: [Reclamo] = []
        if let b = f.bateria {
            // Sin batería publicada no hay «de cuántos»: se pinta el contador en cero, sin denominador.
            r.append(.tests(hechos: b.completed, total: b.isScheduled ? b.total : nil))
        }
        if let cita = f.revisionReservada ?? f.revision?.nextReview {
            r.append(.revision(
                .reservada,
                cuando: ReviewDateFormat.longDateTime(fromISO: cita.requestedStart),
                minutos: cita.durationMinutes,
                enlace: cita.meetLink.flatMap { $0.isEmpty ? nil : URL(string: $0) }
            ))
        } else if f.revision?.proposalPending == true {
            r.append(.revision(.propuesta, cuando: nil, minutos: nil, enlace: nil))
        }
        if case .visible(let nombre, let detalle, _) = DoblesLiveBannerState.from(f.parejaEnVivo, hasOwnSessionToday: false) {
            r.append(.parejaEnVivo(nombre: nombre, detalle: detalle))
        }
        if let g = f.guardado {
            r.append(.aMedias(titulo: g.titulo, desde: horaLocal(g.guardadoEn)))
        }
        return r
    }

    // MARK: - Una marca y los pasos

    /// La marca reciente: el 5 km de prueba, que es lo que el análisis de carrera trae fechado. Con más
    /// de un test, contra el primero; con uno solo no hay tendencia que afirmar.
    static func marca(_ analisis: RunningAnalysis?, cargado: Bool) -> MarcaHoy {
        guard cargado || analisis != nil else { return .cargando }
        let serie = analisis?.five_k_trend ?? []
        guard let ultimo = serie.last else { return .ninguna }

        let tendencia: MarcaReciente.Tendencia
        if serie.count >= 2, let primero = serie.first {
            let delta = ultimo.seconds - primero.seconds
            if delta == 0 {
                tendencia = .igual
            } else {
                let texto = "\(delta < 0 ? "\u{2212}" : "+")\(Formato.clock(abs(delta))) desde la primera"
                tendencia = delta < 0 ? .mejora(texto) : .empeora(texto)
            }
        } else {
            tendencia = .primeraPrueba
        }
        return .reciente(MarcaReciente(titulo: "5 km · prueba", valor: ultimo.time, tendencia: tendencia))
    }

    private static let formatoDePasos: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "es_ES")
        return f
    }()

    /// Los pasos de hoy. Una lectura sin muestras NO es un cero medido: con Salud conectada se dice que
    /// aún no hay, sin conectar la salida es conectarla, y mientras Salud no contesta es «leyendo».
    static func pasos(_ lectura: HealthKitStepsReader.Reading?, saludConectada: Bool) -> Pasos {
        switch lectura {
        case .steps(let n): return .cifra(formatoDePasos.string(from: NSNumber(value: n)) ?? "\(n)")
        case .noData: return saludConectada ? .sinDatos : .conectar
        case .unavailable: return .conectar
        case nil: return .leyendo
        }
    }
}
