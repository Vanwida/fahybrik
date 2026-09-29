import Foundation

// EL ESTADO DE UNA SESIÓN Y LO QUE EL DÍA DICE DE ELLA.
//
// `SessionMarkState` es lo que dice el servidor unido a las marcas optimistas locales, y su
// «missed» es un veredicto del coach. El Plan habla con otra palabra: una sesión es
// `pendiente`, `hecha`, `parcial` o `saltada`, y «saltada» tiene dos orígenes que son HECHOS
// (el servidor lo dijo, o el día ya pasó y no quedó nada registrado) — nunca un juicio.
//
// Espejo de `EstadoSesion` en `web/components/design-twin/kit-hoy/contrato.ts` y de
// `estadoEfectivo` en `kit-plan/dias.ts`.

enum EstadoSesion: Equatable, CaseIterable {
    case pendiente
    case hecha
    case parcial
    case saltada

    init(_ marca: SessionMarkState) {
        switch marca {
        case .pending: self = .pendiente
        case .done:    self = .hecha
        case .partial: self = .parcial
        case .missed:  self = .saltada
        }
    }

    /// La palabra que lee el atleta: la pastilla del sujeto, la fila y la voz.
    var etiqueta: String {
        switch self {
        case .pendiente: return "Por hacer"
        case .hecha:     return "Completada"
        case .parcial:   return "A medias"
        case .saltada:   return "Sin hacer"
        }
    }

    /// Se trabajó (entera o a medias): ya no pide nada.
    var trabajada: Bool { self == .hecha || self == .parcial }

    /// Lo que el DÍA dice de una sesión: una pendiente de un día que ya pasó es «sin hacer», igual
    /// que su sello en el carril. Sin esto la card decía «por hacer» donde el carril decía «sin hacer».
    func efectivo(enDia iso: String, hoy: String) -> EstadoSesion {
        self == .pendiente && iso < hoy ? .saltada : self
    }

    /// El sello del kit que lo dibuja.
    var sello: SelloEstadoDia.Estado {
        switch self {
        case .pendiente: return .pendiente
        case .hecha:     return .hecha
        case .parcial:   return .parcial
        case .saltada:   return .saltada
        }
    }
}

extension AthleteWeekDaySession {
    /// El estado REAL: el servidor unido a la marca optimista local (ver `SessionMarkState.of`).
    var estado: EstadoSesion { EstadoSesion(SessionMarkState.of(status: status, assignmentId: assignmentId)) }

    /// «AM» / «PM». Solo se dice cuando el día trae más de una sesión.
    var franja: String { slot.lowercased().hasPrefix("pm") ? "PM" : "AM" }

    /// Una sesión se mueve mientras no esté completada: el servidor congela las hechas y devolvería 409.
    var puedeMoverse: Bool { !assignmentId.isEmpty && estado != .hecha }
}

extension DiaDelPlan {

    /// El SUJETO de un día con sesiones: la primera que aún toca hacer; si ninguna, la primera.
    ///
    /// Coincide con lo que Hoy nombra al llevar aquí: si el Plan enseñara otra, la portada mentiría
    /// sobre a dónde lleva. Antes era `sesiones.first`, y con la de la mañana hecha y la de la tarde
    /// por hacer la card enseñaba lo hecho y «Empezar» apuntaba a lo hecho.
    var sesionPrincipal: AthleteWeekDaySession? {
        sesiones.first { $0.estado == .pendiente } ?? sesiones.first
    }

    /// Las demás del día, compactas. Son una lista y no «la otra»: un libre montado sobre un día que ya
    /// lleva dos no puede quedar huérfano.
    func secundarias(de principal: AthleteWeekDaySession) -> [AthleteWeekDaySession] {
        sesiones.filter { $0.assignmentId != principal.assignmentId }
    }

    /// Lo que la app puede decir de un día sin fabricar nada (voz de accesibilidad): los títulos y, uno
    /// por uno, cómo está cada sesión CONTRA HOY — no cómo está «el día».
    func resumen(hoy: String) -> String {
        guard !sesiones.isEmpty else { return "descanso, nada en el plan" }
        var estados: [String] = []
        for s in sesiones {
            let e = s.estado.efectivo(enDia: isoDate, hoy: hoy).etiqueta.lowercased()
            if !estados.contains(e) { estados.append(e) }
        }
        return "\(sesiones.map(\.title).joined(separator: ", ")), \(estados.joined(separator: " y "))"
    }
}

extension SemanaDelPlan {

    /// El día que la card muestra: el que el atleta eligió a mano dentro de la semana visible; si no
    /// eligió, hoy (en esta semana) o el primero con algo (hojeando otra). Nunca se inventa un día (§7).
    func diaMostrado(seleccion: String?) -> DiaDelPlan? {
        if let seleccion, let elegido = dias.first(where: { $0.isoDate == seleccion }) { return elegido }
        return hoy ?? dias.first { !$0.sesiones.isEmpty }
    }

    /// Las sesiones que se mueven a otro día: los otros seis, con su carga.
    func diasDestino(de sesion: AthleteWeekDaySession) -> [DiaDelPlan] {
        let origen = dias.first { dia in dia.sesiones.contains { $0.assignmentId == sesion.assignmentId } }
        return dias.filter { $0.isoDate != origen?.isoDate }
    }

    /// «Lunes 21 · libre» / «Hoy · 1 sesión»: el día, su fecha y su carga, para elegir con contexto y no a ciegas.
    func etiquetaDeDiaDestino(_ dia: DiaDelPlan) -> String {
        let nombre = dia.esHoy ? "Hoy" : "\(dia.nombre) \(dia.numero)"
        let n = dia.sesiones.count
        let carga = n == 0 ? "libre" : (n == 1 ? "1 sesión" : "\(n) sesiones")
        return "\(nombre) · \(carga)"
    }
}
