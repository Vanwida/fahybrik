import Foundation

// HOY, PARA EL RELOJ.
//
// Lo que queda de la portada de siempre que NO es pantalla: la app SIGUE empujando el entreno de
// hoy a la muñeca, y para eso necesita saber cuál es. Vivía dentro de `InicioView` con la vista
// (que no es su sitio: el reloj no navega a una pestaña); ahora es esto, con la misma lógica.
//
// Tres casos, sacados SOLO de las sesiones de hoy — nunca un día futuro:
//   1. una sesión pendiente hoy → se empuja, sin hacer.
//   2. todas las de hoy están terminadas → se empuja la principal, hecha y cómo.
//   3. un día de descanso de verdad (sin sesiones) → un descanso, solo con la disposición.
// Sin sesión iniciada ni plan cargado → se VACÍA la muñeca (un contexto vacío está reservado a eso).
//
// `atletaHrZones` lleva las bandas de pulso EXACTAMENTE como las resolvió el servidor, para que la
// muñeca clasifique un latido en la misma zona que el teléfono y el coach lea un solo número; nil
// cuando el atleta aún no tiene zonas (el reloj enseña el pulso sin zona en vez de inventar un techo).

@MainActor
struct HoyRelojPush {
    let store: AppDataStore
    let bearer: String?
    /// Sube cuando una sesión se acaba de marcar hecha en local: «Hecho hoy» se repinta desde
    /// `CompletedAssignmentsStore` sin esperar a `/plan/week`.
    var revisionDeMarcas = 0

    private var plan: AthletePlanWeekResponse? { store.planWeek.value }

    private func rango(_ slot: String) -> Int {
        switch slot.lowercased() {
        case "am": return 0
        case "pm": return 1
        default: return 2
        }
    }

    private var sesionesDeHoy: [AthleteWeekDaySession] {
        guard let plan, let hoy = plan.week.days.first(where: { $0.isoDate == plan.week.todayIso }) else { return [] }
        return hoy.sessions
    }

    /// Las sesiones de hoy que siguen por hacer, en el orden del día.
    private var activas: [AthleteWeekDaySession] {
        sesionesDeHoy
            .filter { !SessionMarkState.of(status: $0.status, assignmentId: $0.assignmentId).isFinished }
            .sorted { rango($0.slot) < rango($1.slot) }
    }

    /// Las que ya se hicieron (hechas o a medias), en el orden del día.
    private var terminadas: [AthleteWeekDaySession] {
        _ = revisionDeMarcas
        return sesionesDeHoy
            .filter { SessionMarkState.of(status: $0.status, assignmentId: $0.assignmentId).isFinished }
            .sorted { rango($0.slot) < rango($1.slot) }
    }

    /// La huella de todo lo que el empuje lee: cambia cuando lo que se mandaría es distinto (una sesión
    /// completada, movida o reseteada, una disposición nueva, una pareja que entra o sale). Es el ÚNICO
    /// cuello de botella del re-empuje: ninguna mutación del plan se escapa ni se manda dos veces.
    var firma: String {
        guard bearer != nil, plan != nil else { return "clear" }
        let r = store.readiness.value
        let lectura = "\(r?.score ?? -1)/\(r?.delta7d ?? -999)/\(WatchConnectivityiOSService.worstDriver(r?.breakdown) ?? "-")"
        if let h = activas.first {
            return "s|\(h.assignmentId)|\(h.title)|\(h.modality ?? "-")|\(h.estDurationMinutes ?? -1)|\(esDobles(h) ? "d" : "-")|pending|\(lectura)"
        }
        if let d = terminadas.first {
            let marca = SessionMarkState.of(status: d.status, assignmentId: d.assignmentId) == .partial ? "p" : "f"
            return "s|\(d.assignmentId)|\(d.title)|\(d.modality ?? "-")|\(d.estDurationMinutes ?? -1)|\(esDobles(d) ? "d" : "-")|done-\(marca)|\(lectura)"
        }
        return "rest|\(lectura)"
    }

    func empujar() {
        let lectura = store.readiness.value

        // Sin sesión o sin datos cargados → se limpia (nunca una tarjeta vieja en la muñeca).
        guard bearer != nil, plan != nil else {
            Task { await WatchConnectivityiOSService.shared.clearToday() }
            return
        }

        if let principal = activas.first {
            empujarSesion(principal, hecha: false, completitud: nil, lectura: lectura)
        } else if let hecha = terminadas.first {
            let estado = SessionMarkState.of(status: hecha.status, assignmentId: hecha.assignmentId)
            empujarSesion(hecha, hecha: true, completitud: estado == .partial ? "partial" : "full", lectura: lectura)
        } else {
            let zonas = store.identity.value?.hrZones
            let bearer = bearer
            Task {
                await WatchConnectivityiOSService.shared.pushToday(
                    dayKind: WatchDayKind.rest,
                    assignmentId: nil, title: nil, focus: nil,
                    estDurationMinutes: nil, intensityLabel: nil, modality: nil,
                    athleteHrZones: zonas, readiness: lectura,
                    isDone: false, doneCompleteness: nil, isDoubles: false,
                    partnerFirstName: nil, partnerVisibility: nil, bearer: bearer
                )
            }
        }
    }

    private func empujarSesion(
        _ sesion: AthleteWeekDaySession,
        hecha: Bool,
        completitud: String?,
        lectura: DailyReadinessPayload?
    ) {
        let foco = sesion.slot.isEmpty ? nil : sesion.slot.uppercased()
        let dobles = esDobles(sesion)
        // El nombre de la pareja (para la insignia «DOBLES · con {nombre}» de la muñeca) y la visibilidad
        // de la sesión viajan solo con una sesión de dobles compartida; una `self_only` es individual.
        let nombreDeLaPareja = dobles ? store.partner.value?.partner?.firstName : nil
        let visibilidad = dobles ? sesion.partnerVisibility : nil
        let zonas = store.identity.value?.hrZones
        let bearer = bearer
        Task {
            await WatchConnectivityiOSService.shared.pushToday(
                dayKind: WatchDayKind.session,
                assignmentId: sesion.assignmentId,
                title: sesion.title,
                focus: foco,
                estDurationMinutes: sesion.estDurationMinutes,
                intensityLabel: nil,
                modality: sesion.modality,
                athleteHrZones: zonas,
                readiness: lectura,
                isDone: hecha,
                doneCompleteness: completitud,
                isDoubles: dobles,
                partnerFirstName: nombreDeLaPareja,
                partnerVisibility: visibilidad,
                bearer: bearer
            )
        }
    }

    /// Si un final hecho desde la muñeca de esta sesión se registra EN CONJUNTO. La muñeca no tiene «por mi
    /// cuenta / juntos», así que una sesión de un par de dobles se registra siempre junta allí. Solo si el
    /// atleta está en un par Y la sesión no es privada (`self_only`); el endpoint conjunto exige pareja
    /// enlazada, así que un atleta solo nunca va por él.
    private func esDobles(_ sesion: AthleteWeekDaySession) -> Bool {
        guard store.partner.value?.isDoublesPair == true else { return false }
        return sesion.partnerVisibility?.lowercased() != "self_only"
    }
}
