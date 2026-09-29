import Foundation

// DEL CABLE A LA LECTURA — lo que la app YA lee, traducido al contrato de «Perfil».
//
// Aquí, y solo aquí, se pelean el cable y el diseño: las porciones del store (`identity`, `partner`,
// `subscription`, `strengthMaxes`), los servicios que Perfil pide por su cuenta (batería, marcas,
// VO₂, wearables) y lo que el propio móvil sabe (Apple Salud, el reloj, el permiso del movimiento)
// entran como un `LoLeidoPerfil`, y sale una `LecturaPerfil` con enums y cuentas ya hechas. De ahí
// en adelante nadie mira un `status` de Stripe ni un token de invitación para saber qué pintar.
// Cada decisión de traducción es una línea con su porqué, y `LecturaPerfilCableTests` las clava.
//
// GUARDA lo que ya lee la pantalla en vez de releerlo: los wearables que `refreshCorosBackground`
// ya pedía, el permiso del reloj y Apple Salud (locales, sin red) llegan aquí como valores.

// MARK: - Lo que la pestaña ha leído

/// Todo lo que `ProfileView` sabe en un momento dado, sin interpretar.
struct LoLeidoPerfil {
    var identidad = Slice<AthleteIdentity>()
    /// La división de la carrera objetivo (`AthleteNextRace.divisionLabel`), leída aparte.
    var division: String?
    var conCoach = true
    var coach: String?

    // Las tres fuentes que Perfil pide por su cuenta, cada una con su «ya contestó».
    var bateria: FuenteDelDato<BatteryStatus?> = .cargando
    var marcas: FuenteDelDato<[MarkView]> = .cargando
    var vo2: FuenteDelDato<AthleteVo2Max?> = .cargando

    // Porciones del store.
    var fuerza = Slice<[StrengthMaxProfile]>()
    var pareja = Slice<PartnerEnvelope>()
    var suscripcion = Slice<SubscriptionInfo>()

    // Lo que el móvil y los proveedores dicen que está conectado.
    var saludConectado = false
    /// «Carreras en el Apple Watch» activado (`AppleWatchWorkoutScheduler.isEnabled`).
    var relojActivo = false
    var polarConectado = false
    var corosConectado = false
    var corosPendiente: WearablePendingLink?

    var consentimiento = SensorConsentState()
    var version: String?
}

// MARK: - De lo leído a la lectura

extension LecturaPerfil {

    static func desde(
        _ leido: LoLeidoPerfil,
        ahora: Date = Date(),
        zona: TimeZone = .current,
        versionDelConsentimiento: String = SensorCaptureConsent.currentVersion
    ) -> LecturaPerfil {
        let hoy = FechaES.iso(ahora)
        let id = leido.identidad
        // Sin identidad ni caché: en frío (aún no ha contestado) o caída (falló y no hay nada guardado).
        // Con un valor, aunque esté revalidando, es una lectura normal.
        let sinIdentidad = id.value == nil && !id.hasLoaded
        let identidad = id.value.map { IdentidadPerfil($0, division: leido.division, ahora: ahora) } ?? .vacia

        return LecturaPerfil(
            cargando: sinIdentidad && !id.loadFailed,
            errorCarga: sinIdentidad && id.loadFailed,
            conCoach: leido.conCoach,
            coach: leido.conCoach ? leido.coach : nil,
            identidad: identidad,
            rendimiento: FuentesRendimiento(
                // Sin coach la batería ni se pide: no hay nada que preguntar.
                bateria: leido.conCoach ? leido.bateria.mapa(BateriaPerfil.init) : .contesto(nil),
                marcas: leido.marcas.mapa(MarcasPerfil.init),
                vo2: leido.vo2.mapa(Vo2Perfil.init),
                // Las zonas viajan DENTRO de la identidad: hasta que llega no se sabe si las hay.
                zonas: id.value.map { .contesto($0.hrZones.map(ZonasPerfil.init)) } ?? .cargando,
                fuerza: FuenteDelDato(leido.fuerza, vacio: []) { $0.map(LevantamientoPerfil.init) }
            ),
            suscripcion: leido.conCoach ? leido.suscripcion.value.flatMap { SuscripcionPerfil($0, hoy: hoy) } : nil,
            dobles: leido.pareja.value.flatMap { ParejaPerfil($0, suscripcion: leido.suscripcion.value, ahora: ahora) },
            dispositivos: DispositivoPerfil.allCases.filter { dispositivo in
                switch dispositivo {
                case .salud: return leido.saludConectado
                case .watch: return leido.relojActivo
                case .polar: return leido.polarConectado
                case .coros: return leido.corosConectado
                }
            },
            movimientoReloj: MovimientoReloj(leido.consentimiento, version: versionDelConsentimiento),
            corosPendiente: leido.corosPendiente.map { PreguntaCoros($0, zona: zona) },
            version: leido.version
        )
    }
}

// MARK: - Fuentes

extension FuenteDelDato {
    /// Traduce el valor cuando ya contestó; lo demás pasa tal cual.
    func mapa<Otro>(_ traduce: (Valor) -> Otro) -> FuenteDelDato<Otro> {
        switch self {
        case .cargando: return .cargando
        case .sinRespuesta: return .sinRespuesta
        case let .contesto(v): return .contesto(traduce(v))
        }
    }

    /// Lo que queda tras VOLVER a pedir la fuente: la respuesta nueva, salvo que sea un fallo y ya
    /// hubiera una cifra buena. Un servidor que se cae al refrescar no puede borrar lo que el atleta ya
    /// veía (ni convertir «9 de 12» en «no pudimos cargarlo»): sin nada guardado, sí se declara.
    func trasPedir(_ nueva: FuenteDelDato<Valor>) -> FuenteDelDato<Valor> {
        if case .sinRespuesta = nueva, case .contesto = self { return self }
        return nueva
    }

    /// De una porción del store: con valor (aunque revalide) contestó; sin valor pero ya cargada
    /// contestó «no hay nada» (`vacio`); sin valor y fallida es un fallo, no un vacío; y si no ha
    /// pasado nada aún, sigue en frío.
    init<Origen: Codable>(_ porcion: Slice<Origen>, vacio: Valor, traduce: (Origen) -> Valor) {
        if let valor = porcion.value {
            self = .contesto(traduce(valor))
        } else if porcion.hasLoaded {
            self = .contesto(vacio)
        } else if porcion.loadFailed {
            self = .sinRespuesta
        } else {
            self = .cargando
        }
    }
}

// MARK: - Identidad

extension IdentidadPerfil {
    init(_ id: AthleteIdentity, division: String?, ahora: Date = Date()) {
        self.init(
            nombre: id.fullName,
            fotoURL: id.avatarURLResuelta,
            division: division,
            edad: AthleteIdentity.edad(dob: id.dob, ahora: ahora),
            // «6 años»: el servidor manda un decimal, y medio año no es un año entero que enseñar.
            anosEntrenando: id.trainingExperienceYears.map { Int($0) }.flatMap { $0 > 0 ? $0 : nil },
            alturaCm: id.heightCm,
            pesoKg: id.weightKg,
            fcMax: id.maxHrBpm,
            objetivo: id.goalType.flatMap(GoalTypeOption.init(rawValue:))
        )
    }
}

// MARK: - Rendimiento

extension BateriaPerfil {
    /// Sin batería programada no hay contador (`nil`): el servidor la manda con `total` 0.
    init?(_ b: BatteryStatus?) {
        guard let b, b.isScheduled else { return nil }
        self.init(total: b.total, completados: b.completed, aMedias: b.tests.filter(\.resultPending).count)
    }
}

extension MarcasPerfil {
    init(_ marcas: [MarkView]) {
        self.init(conRecord: marcas.filter { $0.best != nil }.count, catalogo: marcas.count)
    }
}

extension Vo2Perfil {
    /// Nil cuando nadie lo ha medido (`headline` nil): el estado vacío honesto.
    init?(_ vo2: AthleteVo2Max?) {
        guard let h = vo2?.headline else { return nil }
        self.init(valor: h.value, fuente: h.source == .watch ? .reloj : .cooper)
    }
}

extension ZonasPerfil {
    init(_ z: HRZoneProfile) {
        self.init(umbralPpm: z.lthrBpm, origen: z.sourceLabel)
    }
}

extension LevantamientoPerfil {
    init(_ m: StrengthMaxProfile) {
        self.init(etiqueta: m.exerciseLabel, kg: m.oneRmKg)
    }
}

// MARK: - Suscripción

extension SuscripcionPerfil {
    /// Del estado de Stripe a lo que la puerta cuenta. Nil = nada que contar: el tier libre no tiene
    /// suscripción por diseño, y un estado que la app no conoce no se inventa.
    init?(_ info: SubscriptionInfo, hoy: String) {
        guard !info.isFreeTier else { return nil }
        let fecha = info.periodEndDate.flatMap { FechaES.corta(FechaES.iso($0), hoy: hoy) }
        switch info.status {
        case "active":
            // Cancelada al final del periodo: sigue con acceso hasta esa fecha. Sin fecha no se puede
            // decir cuándo termina, y se queda en «activa» como hasta ahora.
            if info.cancelAtPeriodEnd, let fecha { self = .termina(el: fecha) } else { self = .activa }
        case "trialing":
            self = .prueba(hasta: fecha)
        case "past_due", "unpaid", "incomplete":
            self = .pagoPendiente
        case "canceled", "incomplete_expired":
            self = .cancelada
        case "paused":
            self = .pausada
        default:
            return nil
        }
    }
}

// MARK: - Pareja de Dobles

extension ParejaPerfil {
    /// Nil = individual. Es de Dobles quien tiene pareja, plan de Dobles o lo declara el servidor;
    /// la invitación enviada cuenta según su estado y una cancelada es como no haber invitado.
    init?(_ sobre: PartnerEnvelope, suscripcion: SubscriptionInfo?, ahora: Date = Date()) {
        if let pareja = sobre.partner {
            self = .conPareja(nombre: pareja.firstName)
            return
        }
        let esDobles = suscripcion?.planType == "dobles" || (sobre.athleteModality ?? "").lowercased() == "dobles"
        guard esDobles else { return nil }
        guard let inv = sobre.sentInvitation else {
            self = .sinPareja
            return
        }
        switch inv.state {
        case .pending: self = .invitacion(.pendiente, email: inv.inviteeEmail, caduca: inv.caducaEn(ahora: ahora))
        case .expired: self = .invitacion(.caducada, email: inv.inviteeEmail, caduca: nil)
        case .declined: self = .invitacion(.rechazada, email: inv.inviteeEmail, caduca: nil)
        case .cancelled: self = .sinPareja
        }
    }
}

// MARK: - El permiso del movimiento del reloj

extension MovimientoReloj {
    /// `sinPreguntar` no es `retirado`: quien nunca ha entrenado con el reloj no ha decidido nada, y la
    /// puerta de Privacidad se calla; quien dijo «Ahora no» o apagó el interruptor SÍ ha decidido, y
    /// se le dice. Un sí a un texto anterior ya no cuenta: para el servidor es como no haberlo dado.
    init(_ estado: SensorConsentState, version: String) {
        if estado.isGranted(current: version) {
            self = .permitido
        } else if estado.hasDeclined {
            self = .retirado
        } else {
            self = .sinPreguntar
        }
    }
}

// MARK: - La pregunta de COROS

extension PreguntaCoros {
    /// La hora de la actividad, en la del atleta (la del móvil): el servidor manda un instante.
    init(_ enlace: WearablePendingLink, zona: TimeZone = .current) {
        self.init(inicio: HoraDeInicio.texto(iso: enlace.startedAt, zona: zona))
    }
}

enum HoraDeInicio {
    /// «7:12» · «19:05». Nil si no llega o no se lee: sin hora la pregunta se hace igual, sin decirla.
    static func texto(iso: String?, zona: TimeZone = .current) -> String? {
        guard let iso, !iso.isEmpty else { return nil }
        let conFracciones = ISO8601DateFormatter()
        conFracciones.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let instante = conFracciones.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return nil }
        let salida = DateFormatter()
        salida.locale = Locale(identifier: "es_ES")
        salida.timeZone = zona
        salida.dateFormat = "H:mm"
        return salida.string(from: instante)
    }
}
