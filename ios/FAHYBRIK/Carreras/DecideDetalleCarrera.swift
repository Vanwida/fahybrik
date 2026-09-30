import Foundation

// QUÉ ENSEÑA EL DETALLE DE UNA CARRERA — la decisión, pura y probada, fuera de la vista.
//
// El detalle se abre tocando una próxima (o «Ver mi camino» en el póster) y responde a «¿dónde estoy
// contra ESTA carrera?». Hay cinco respuestas honestas, en el orden en que mandan:
//   1. dobles       → el predicho conjunto de la pareja (lo resuelve su sección, con su propia lectura);
//   2. secundaria   → el predicho se calcula para el principal: la salida es hacerla principal;
//   3. no es HYROX  → el desglose por estaciones es solo de HYROX: fecha, meta y cambiar la meta;
//   4. el principal HYROX, según lo que diga `GET /api/athlete/goal-gap`: pidiendo · fallo · sin meta ·
//      sin datos · parcial · cifra. Lo que se DICE sale de `TextosCarreras.textoPredicho`, el mismo que
//      usa el póster de la pestaña: el detalle y el póster no pueden contar dos cosas distintas.
//
// El camino tramo a tramo solo existe con el predicho resuelto (`availability == ok`) y algún tramo.

/// Lo que se sabe del goal-gap del principal: el resultado de pedirlo, sin interpretar.
enum EstadoGapDetalle: Equatable {
    case pidiendo
    case fallo
    case listo(GoalGap)
}

/// El sujeto del detalle de una carrera.
enum SujetoDetalleCarrera: Equatable {
    /// Pidiendo el predicho: esqueleto con la forma final.
    case cargando
    /// La lectura falló: se dice y se reintenta.
    case error
    /// HYROX principal sin tiempo objetivo: la salida es fijarlo.
    case sinMeta
    /// El predicho, en cualquiera de sus formas con dato (cifra, parcial, aún sin datos).
    case predicho(TextoPredicho)
    /// Una próxima que no es la principal: la salida es hacerla principal.
    case secundaria
    /// El principal no es HYROX: la meta (si la hay) y cambiarla.
    case noHyrox(metaS: Int?)
    /// Dobles: el predicho conjunto de la pareja (sección propia).
    case dobles
}

enum DecideDetalleCarrera {

    /// ¿Hay que pedir el goal-gap para esta carrera? Solo el principal HYROX individual lo tiene.
    static func pideGap(_ race: UpcomingRace, esPrincipal: Bool) -> Bool {
        !esDobles(race) && esPrincipal && race.supportsHyroxGoalGap
    }

    static func esDobles(_ race: UpcomingRace) -> Bool {
        FormatoCarrera(wire: race.format) == .dobles
    }

    static func sujeto(_ race: UpcomingRace, esPrincipal: Bool, gap: EstadoGapDetalle, hoy: String) -> SujetoDetalleCarrera {
        if esDobles(race) { return .dobles }
        if !esPrincipal { return .secundaria }
        if !race.supportsHyroxGoalGap { return .noHyrox(metaS: race.goalTimeSeconds.flatMap { $0 > 0 ? $0 : nil }) }
        switch gap {
        case .pidiendo: return .cargando
        case .fallo: return .error
        case .listo(let g):
            let prediccion = PrediccionCarrera.desde(principal: ProximaCarrera(race, hoy: hoy), lectura: .individual(g))
            switch prediccion {
            case .sinMeta: return .sinMeta
            case .cargando: return .cargando
            case .error: return .error
            // «no_target_race»: el servidor no reconoce esta carrera como el principal (una copia vieja
            // del hub). No hay predicho que dar y no es un fallo: se dice que se llena entrenando.
            case .noAplica:
                return .predicho(TextosCarreras.textoPredicho(.sinDatos(pareja: nil), contexto: contexto(race)))
            default:
                return .predicho(TextosCarreras.textoPredicho(prediccion, contexto: contexto(race)))
            }
        }
    }

    /// El camino tramo a tramo: solo con el predicho resuelto y algún tramo que enseñar.
    static func camino(_ gap: EstadoGapDetalle) -> GoalGap? {
        guard case .listo(let g) = gap, g.isOK, !g.segments.isEmpty else { return nil }
        return g
    }

    private static func contexto(_ race: UpcomingRace) -> ContextoPredicho {
        ContextoPredicho(principal: true, tipoEvento: TipoEventoCarrera(wire: race.eventType), formato: FormatoCarrera(wire: race.format) ?? .individual)
    }

    // MARK: La cabecera

    /// «Objetivo principal · Faltan 39 días» — el papel de la carrera y su cuenta atrás. El papel sigue
    /// a `esPrincipal` (que es la única fuente de cuál es el principal), no a la prioridad del cable.
    /// La cuenta se mide contra el `hoy` del atleta, como en la pestaña (una copia de ayer del hub diría
    /// «39» el día 38).
    static func etiqueta(_ race: UpcomingRace, esPrincipal: Bool, hoy: String) -> String {
        // Un «target» antiguo que no es el más próximo NO es el principal: se lee como secundaria.
        let prioridad = PrioridadCarrera(wire: race.priority)
        let papel = esPrincipal
            ? PrioridadCarrera.principal.etiqueta
            : (prioridad == .principal ? PrioridadCarrera.secundaria : prioridad).etiqueta
        guard let dias = ProximaCarrera(race, hoy: hoy).diasHasta else { return papel }
        let cuenta = dias == 0 ? "Es hoy" : "Faltan \(dias) \(UpcomingRace.dayUnit(dias))"
        return "\(papel) · \(cuenta)"
    }

    /// «Sáb 7 nov · Fira de Barcelona» y «Individual · Open · Hombres»: las mismas líneas que la tarjeta.
    static func lineas(_ race: UpcomingRace, hoy: String) -> [String] {
        let carrera = ProximaCarrera(race, hoy: hoy)
        let cuando = carrera.fecha.flatMap { FechaES.corta($0, hoy: hoy, conDia: true) } ?? "Fecha por confirmar"
        let donde = [cuando, carrera.lugar].compactMap { $0 }.joined(separator: " · ")
        let categoria = [DecideCarreras.etiquetaEquipo(carrera.formato), DecideCarreras.lineaCategoria(carrera)]
            .compactMap { $0 }
            .joined(separator: " · ")
        return [donde, categoria].filter { !$0.isEmpty }
    }

    /// «Objetivo Sub-65»: la meta con la grafía de toda la app (`Formato.metaDeCarrera`). nil sin meta.
    static func meta(_ race: UpcomingRace) -> String? {
        race.goalTimeSeconds.flatMap(Formato.metaDeCarrera)
    }

    // MARK: De dónde sale el predicho

    /// «Presupuesto: cohorte de tu división · actualizado hoy 7:40». nil si no hay nada que decir.
    static func origen(_ gap: GoalGap, ahora: Date = Date(), calendario: Calendar = .current) -> String? {
        var partes: [String] = []
        switch gap.budgetSource?.lowercased() {
        case "cohorte": partes.append("Presupuesto: cohorte de tu división")
        case "tu_carrera": partes.append("Presupuesto: tu última carrera")
        default: break
        }
        if let cuando = actualizado(gap.updatedAt, ahora: ahora, calendario: calendario) {
            partes.append("actualizado \(cuando)")
        }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    /// «hoy 7:40» · «ayer 7:40» · «el 8 mar». nil si el cable no trae la hora o no se lee: nunca se
    /// inventa una hora.
    static func actualizado(_ iso: String?, ahora: Date, calendario: Calendar) -> String? {
        guard let iso, let d = StatsDateParser.parse(iso) else { return nil }
        let hora = horaCorta.string(from: d)
        if calendario.isDate(d, inSameDayAs: ahora) { return "hoy \(hora)" }
        if let ayer = calendario.date(byAdding: .day, value: -1, to: ahora), calendario.isDate(d, inSameDayAs: ayer) {
            return "ayer \(hora)"
        }
        return "el \(StatsDateParser.dayMonth(d))"
    }

    private static let horaCorta: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.dateFormat = "H:mm"
        return f
    }()
}
