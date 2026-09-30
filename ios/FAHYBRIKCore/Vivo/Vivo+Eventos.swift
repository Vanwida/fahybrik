import Foundation

// LOS EVENTOS — un evento, un háptico (P5, tabla del §4; espejo de
// `kit-reloj/eventos.ts`). Una pantalla nunca llama a un háptico: emite el
// evento, y este fichero decide qué vibra y qué se dice. Lo que coincide en un
// instante sale como UNA vibración (la de más prioridad) y las frases se
// encadenan.

extension Vivo {

    enum EventoVivo: String, Equatable, CaseIterable {
        case cuenta, go, recupera, preaviso, afloja, aprieta, vuelta
        case finSerie = "fin-serie"
        case bloque, sesion, accion, enlace, gps
        /// El enlace con el móvil vuelve (§4). Solo lo tiene Swift: el kit web aún no lo lleva.
        case enlaceRecuperado = "enlace-recuperado"
    }

    enum HapticoWK: String, Equatable {
        case click, start, stop, notification, directionUp, directionDown, success, failure
    }

    struct Vocablo: Equatable {
        var nombre: String
        var haptico: HapticoWK?
        var veces: Int
        var voz: Bool
        var prioridad: Int
    }

    /// La tabla del §4, literal.
    static let vocabulario: [EventoVivo: Vocablo] = [
        .cuenta: Vocablo(nombre: "3-2-1", haptico: .click, veces: 1, voz: false, prioridad: 3),
        .go: Vocablo(nombre: "Empieza trabajo", haptico: .start, veces: 2, voz: true, prioridad: 9),
        .recupera: Vocablo(nombre: "Empieza recuperación", haptico: .stop, veces: 1, voz: true, prioridad: 8),
        .preaviso: Vocablo(nombre: "Preaviso", haptico: .notification, veces: 1, voz: true, prioridad: 6),
        .afloja: Vocablo(nombre: "Afloja", haptico: .directionDown, veces: 2, voz: false, prioridad: 5),
        .aprieta: Vocablo(nombre: "Aprieta", haptico: .directionUp, veces: 2, voz: false, prioridad: 5),
        .vuelta: Vocablo(nombre: "Vuelta automática", haptico: .click, veces: 2, voz: true, prioridad: 4),
        .finSerie: Vocablo(nombre: "Fin de serie", haptico: nil, veces: 0, voz: true, prioridad: 0),
        .bloque: Vocablo(nombre: "Bloque hecho", haptico: .success, veces: 1, voz: false, prioridad: 10),
        .sesion: Vocablo(nombre: "Sesión hecha", haptico: .success, veces: 2, voz: true, prioridad: 11),
        .accion: Vocablo(nombre: "Acción del atleta", haptico: .click, veces: 1, voz: false, prioridad: 2),
        .enlace: Vocablo(nombre: "Enlace perdido", haptico: .failure, veces: 1, voz: false, prioridad: 7),
        .enlaceRecuperado: Vocablo(nombre: "Enlace recuperado", haptico: .click, veces: 1, voz: false, prioridad: 2),
        .gps: Vocablo(nombre: "GPS listo", haptico: .success, veces: 1, voz: false, prioridad: 1),
    ]

    /// Los eventos que destellan la pantalla (un cambio de paso).
    static let destella: Set<EventoVivo> = [.go, .recupera, .bloque, .sesion]

    static func fmtHaptico(_ v: Vocablo) -> String {
        guard let h = v.haptico else { return "sin háptico" }
        return ".\(h.rawValue)\(v.veces > 1 ? "×\(v.veces)" : "")"
    }

    struct Emitido: Equatable {
        var evento: EventoVivo
        var voz: String? = nil
    }

    struct Emision: Equatable {
        var n: Int
        var eventos: [EventoVivo]
        var vibra: EventoVivo?
        var haptico: String
        var voz: String?
        var linea: String
    }

    /// Junta lo que coincide en un instante: un háptico, las voces encadenadas.
    static func componer(_ n: Int, _ cola: [Emitido]) -> Emision {
        let conHaptico = cola.filter { vocabulario[$0.evento]?.haptico != nil }
        var vibra: EventoVivo? = nil
        for c in conHaptico {
            if let v = vibra, let pv = vocabulario[v]?.prioridad, let pc = vocabulario[c.evento]?.prioridad, pc <= pv { continue }
            vibra = c.evento
        }
        let voces = cola.compactMap { $0.voz }.filter { !$0.isEmpty }
        let voz = voces.isEmpty ? nil : voces.joined(separator: " ")
        var nombres: [String] = []
        for c in cola { if let nm = vocabulario[c.evento]?.nombre, !nombres.contains(nm) { nombres.append(nm) } }
        let haptico = vibra.flatMap { vocabulario[$0] }.map(fmtHaptico) ?? "sin háptico"
        let linea = "\(nombres.joined(separator: " + ")) — \(vibra != nil ? "háptico \(haptico)" : haptico)\(voz.map { " · voz: «\($0)»" } ?? "")"
        return Emision(n: n, eventos: cola.map { $0.evento }, vibra: vibra, haptico: haptico, voz: voz, linea: linea)
    }

    // MARK: - El aviso fuera de objetivo — histéresis y cadencia como DATO del coach

    struct EstadoAviso: Equatable {
        var fuera: Veredicto
        var desde: Double
        var ultimo: Double?
    }

    static let avisoInicial = EstadoAviso(fuera: .dentro, desde: 0, ultimo: nil)

    /// ¿Toca vibrar «afloja» o «aprieta»? Reglas del §4.
    static func decidirAviso(_ prev: EstadoAviso, _ v: Veredicto?, t: Double, _ p: Paso, eje: EjeObjetivo?, _ reglas: ReglasAviso) -> (estado: EstadoAviso, evento: EventoVivo?) {
        let callar = (p.fase == .calentamiento && !reglas.avisarEnCalentamiento) || (p.rol != .trabajo && !reglas.avisarEnRecuperacion)
        guard !callar, let v, v != .dentro else {
            return (EstadoAviso(fuera: .dentro, desde: t, ultimo: prev.ultimo), nil)
        }
        if v != prev.fuera { return (EstadoAviso(fuera: v, desde: t, ultimo: prev.ultimo), nil) }
        let confirmado = t - prev.desde >= reglas.confirmacionS
        let libre = prev.ultimo == nil || t - prev.ultimo! >= reglas.cadenciaS
        let gracia = (eje == .zona || eje == .ppm) && v == .porDebajo && t < reglas.graciaZonaS
        if !confirmado || !libre || gracia { return (prev, nil) }
        var e = prev
        e.ultimo = t
        return (e, v == .porEncima ? .afloja : .aprieta)
    }
}
