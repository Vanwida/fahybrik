#if DEBUG
import Foundation

// EL CATÁLOGO DE SESIONES DE EJEMPLO — todas INVENTADAS (ninguna sale de la base de producción,
// CONTRATO-UI §7). Es el espejo de `web/components/design-twin/kit-plan/sesiones.ts`: cada plantilla
// lleva lo que la pestaña necesita para romper el modelo — una duración escrita o cada una de las
// cuatro razones por las que no la hay, sesiones de un bloque, de tres y de dieciséis ejercicios,
// partes estructurales (el marco) y una nota del coach cuando la hay.
//
// Solo existe en DEBUG: lo leen las `#Preview`, las pruebas del modelo y la galería que pinta cada
// caso (`PlanGaleriaRenderTests`). Las semanas se montan por el CABLE (`AthletePlanWeekResponse` →
// `SemanaDelPlan.desde`), no a mano: así una captura prueba también que lo que llega del servidor
// llega hasta el píxel, y los fixtures no pueden divergir de la forma real.

enum EjemplosPlan {

    /// «Hoy» de casi todos los casos: jueves 1 de octubre. La semana del 28 sep al 4 oct deja tres
    /// días detrás (para los sellos del pasado) y tres por delante.
    static let hoy = "2026-10-01"
    static let lunes = "2026-09-28"
    static let lunesQueViene = "2026-10-05"

    // MARK: - Plantillas

    enum Clave: String, CaseIterable {
        case series800 = "series-800", series400 = "series-400"
        case fuerzaInferior = "fuerza-inferior", fuerzaSuperior = "fuerza-superior"
        case remo5x1000 = "remo-5x1000"
        case rodaje8k = "rodaje-8k", rodaje45 = "rodaje-45", tiradaLarga = "tirada-larga"
        case hyroxSim = "hyrox-sim", chipper, muerteBurpees = "muerte-burpees"
        case circuitoPierna = "circuito-pierna", emom20 = "emom-20", movilidadCore = "movilidad-core"
        case test1k = "test-1k", libreRodaje = "libre-rodaje", importada
    }

    /// Cómo escribe el plan el reloj: minutos o la razón por la que no los hay.
    enum Duracion {
        case minutos(Int)
        case razon(String)
    }

    struct Plantilla {
        let titulo: String
        let modalidad: String
        let duracion: Duracion?
        let resumen: String?
        var libre = false
        var test = false
        /// Sin desglose = el servidor no lo sirve (`sinDetalle`).
        var partes: [Parte]?
        var formato: String?
        var nota: String?
        /// Lo que mide una ejecución típica, si se llegó a hacer.
        let medidoMin: Int
    }

    struct Parte {
        let titulo: String
        let ejercicios: [String]
        let modalidad: String
        var estructural = false
    }

    private static func calentamiento(_ modalidad: String) -> Parte {
        Parte(titulo: "Calentamiento", ejercicios: ["Trote suave 10 min", "Movilidad de cadera", "Skipping", "Progresivos 4×80 m"], modalidad: modalidad, estructural: true)
    }
    private static let vueltaALaCalma = Parte(titulo: "Vuelta a la calma", ejercicios: ["Trote 5 min", "Estiramientos"], modalidad: "mobility", estructural: true)

    private static let estacionesHyrox = [
        "1 km carrera", "SkiErg 1.000 m", "1 km carrera", "Sled Push 50 m", "1 km carrera", "Sled Pull 50 m",
        "1 km carrera", "Burpee broad jump 80 m", "1 km carrera", "Remo 1.000 m", "1 km carrera", "Farmers carry 200 m",
        "1 km carrera", "Sandbag lunges 100 m", "1 km carrera", "Wall balls 100",
    ]

    static let plantillas: [Clave: Plantilla] = [
        .series800: Plantilla(
            titulo: "Series 6×800", modalidad: "run", duracion: .minutos(50), resumen: "Calentamiento · Series · Vuelta a la calma",
            partes: [calentamiento("run"), Parte(titulo: "Series", ejercicios: ["Series 800 m a ritmo de 5 km", "Trote de recuperación 400 m"], modalidad: "run"), vueltaALaCalma],
            nota: "Los dos primeros, controlados. Los cuatro últimos, a ritmo de 5 km.", medidoMin: 52),
        .series400: Plantilla(
            titulo: "Series 8×400", modalidad: "run", duracion: .minutos(45), resumen: "Calentamiento · Series · Vuelta a la calma",
            partes: [calentamiento("run"), Parte(titulo: "Series", ejercicios: ["Series 400 m a ritmo de 3 km", "Trote de recuperación 200 m"], modalidad: "run"), vueltaALaCalma],
            medidoMin: 47),
        .fuerzaInferior: Plantilla(
            titulo: "Fuerza tren inferior", modalidad: "strength", duracion: .razon("work_not_timed"), resumen: "Fuerza A · Accesorios",
            partes: [
                Parte(titulo: "Fuerza A", ejercicios: ["Sentadilla trasera", "Peso muerto rumano", "Zancada búlgara", "Hip thrust"], modalidad: "strength"),
                Parte(titulo: "Accesorios", ejercicios: ["Elevación de gemelos", "Plancha lateral"], modalidad: "strength"),
            ],
            nota: "Sube la carga solo si las cinco series salen limpias.", medidoMin: 58),
        .fuerzaSuperior: Plantilla(
            titulo: "Fuerza tren superior", modalidad: "strength", duracion: .razon("work_not_timed"), resumen: "Empuje · Tirón",
            partes: [
                Parte(titulo: "Empuje", ejercicios: ["Press banca", "Press militar", "Fondos"], modalidad: "strength"),
                Parte(titulo: "Tirón", ejercicios: ["Dominadas", "Remo con barra", "Face pull"], modalidad: "strength"),
            ],
            medidoMin: 55),
        .remo5x1000: Plantilla(
            titulo: "Remo 5×1000", modalidad: "row", duracion: .minutos(35), resumen: "Calentamiento · Remo",
            partes: [
                Parte(titulo: "Calentamiento", ejercicios: ["Remo suave 5 min", "Aperturas de cadera"], modalidad: "row", estructural: true),
                Parte(titulo: "Remo 5×1000", ejercicios: ["Remo 1.000 m a ritmo de 2 km"], modalidad: "row"),
            ],
            formato: "5 rondas · descanso 2:00", medidoMin: 36),
        // Un solo bloque: su título repetiría el de la sesión, así que no se encabeza con él.
        .rodaje8k: Plantilla(
            titulo: "Rodaje suave 8 km", modalidad: "run", duracion: .minutos(45), resumen: "Rodaje continuo",
            partes: [Parte(titulo: "Rodaje suave 8 km", ejercicios: ["Rodaje continuo a ritmo fácil"], modalidad: "run")], medidoMin: 47),
        .rodaje45: Plantilla(
            titulo: "Rodaje 45 min", modalidad: "run", duracion: .minutos(45), resumen: "Rodaje continuo",
            partes: [Parte(titulo: "Rodaje 45 min", ejercicios: ["Rodaje continuo a ritmo fácil"], modalidad: "run")], medidoMin: 45),
        .tiradaLarga: Plantilla(
            titulo: "Tirada larga 16 km", modalidad: "run", duracion: .minutos(90), resumen: "Tirada progresiva",
            partes: [Parte(titulo: "Tirada larga 16 km", ejercicios: ["Tirada progresiva: los últimos 4 km, más rápido"], modalidad: "run")],
            nota: "Sal con agua. Los primeros 10 km, sin mirar el reloj.", medidoMin: 92),
        .hyroxSim: Plantilla(
            titulo: "Simulación HYROX", modalidad: "hyrox", duracion: .razon("scored_by_time"), resumen: "Calentamiento · Simulación · Vuelta a la calma",
            partes: [
                Parte(titulo: "Calentamiento", ejercicios: ["Trote suave 10 min", "Movilidad de hombro", "Sentadilla con goma", "Progresivos 4×80 m"], modalidad: "run", estructural: true),
                Parte(titulo: "Simulación HYROX", ejercicios: estacionesHyrox, modalidad: "hyrox"),
                Parte(titulo: "Vuelta a la calma", ejercicios: ["Trote 5 min", "Estiramientos", "Respiración"], modalidad: "mobility", estructural: true),
            ],
            formato: "For Time · 16 estaciones",
            nota: "Sal a ritmo de carrera, no de entreno. Apunta el tiempo de cada estación en cuanto la termines.", medidoMin: 71),
        .chipper: Plantilla(
            titulo: "Chipper de piernas", modalidad: "functional", duracion: .razon("scored_by_time"), resumen: "Chipper",
            partes: [Parte(titulo: "Chipper", ejercicios: ["Wall balls 50", "Zancadas con salto 40", "Burpees 30", "Box jump 20", "Kettlebell swing 10"], modalidad: "functional")],
            formato: "For Time · 1 ronda", medidoMin: 24),
        .muerteBurpees: Plantilla(
            titulo: "Muerte por burpees", modalidad: "functional", duracion: .razon("until_failure"), resumen: "Cada minuto",
            partes: [Parte(titulo: "Muerte por burpees", ejercicios: ["Burpees, uno más cada minuto"], modalidad: "functional")],
            formato: "Cada minuto · hasta fallar", medidoMin: 18),
        // Tres de los cuatro ejercicios llegan sin dosis: el hueco es del coach y se dice en la duración.
        .circuitoPierna: Plantilla(
            titulo: "Circuito de pierna", modalidad: "strength", duracion: .razon("undosed"), resumen: nil,
            partes: [Parte(titulo: "Circuito", ejercicios: ["Zancada con mancuernas", "Puente de glúteo", "Sentadilla goblet", "Gemelos a una pierna"], modalidad: "strength")],
            medidoMin: 52),
        .emom20: Plantilla(
            titulo: "EMOM 20 min", modalidad: "functional", duracion: .minutos(20), resumen: "EMOM",
            partes: [Parte(titulo: "EMOM", ejercicios: ["Minuto impar: 12 cal en la bici", "Minuto par: 10 thrusters"], modalidad: "functional")],
            formato: "EMOM · 20:00", medidoMin: 20),
        .movilidadCore: Plantilla(
            titulo: "Movilidad y core", modalidad: "mobility", duracion: .minutos(25), resumen: "Movilidad · Core",
            partes: [
                Parte(titulo: "Movilidad", ejercicios: ["Cadera 90/90", "Columna torácica", "Tobillo"], modalidad: "mobility"),
                Parte(titulo: "Core", ejercicios: ["Dead bug", "Plancha", "Pallof press"], modalidad: "strength"),
            ],
            medidoMin: 25),
        .test1k: Plantilla(
            titulo: "Test 1 km", modalidad: "run", duracion: .minutos(15), resumen: "Calentamiento · Test", test: true,
            partes: [calentamiento("run"), Parte(titulo: "Test", ejercicios: ["1 km al máximo, en llano"], modalidad: "run")],
            nota: "Un solo intento. Descansa bien antes: este número fija tus ritmos.", medidoMin: 16),
        .libreRodaje: Plantilla(
            titulo: "Rodaje libre 40 min", modalidad: "run", duracion: .minutos(40), resumen: nil, libre: true,
            partes: [Parte(titulo: "Rodaje libre 40 min", ejercicios: ["Rodaje continuo"], modalidad: "run")], medidoMin: 41),
        .importada: Plantilla(
            titulo: "Trainingpeaks · Semana 1 · Entrenamiento de fuerza y rodaje progresivo", modalidad: "strength", duracion: .razon("undosed"), resumen: nil,
            partes: [
                Parte(titulo: "Fuerza", ejercicios: ["Sentadilla frontal", "Press de banca inclinado", "Remo con mancuerna", "Zancada caminando", "Face pull"], modalidad: "strength"),
                Parte(titulo: "Rodaje progresivo", ejercicios: ["Trote 20 min", "Ritmo medio 10 min", "Trote suave 5 min"], modalidad: "run"),
                Parte(titulo: "Core", ejercicios: ["Plancha", "Elevación de piernas", "Rotación rusa"], modalidad: "strength"),
                Parte(titulo: "Movilidad", ejercicios: ["Cadera", "Tobillo", "Hombro"], modalidad: "mobility"),
                Parte(titulo: "Respiración", ejercicios: ["Respiración diafragmática"], modalidad: "mobility"),
            ],
            nota: "Esta semana viene importada de tu plan anterior. La reviso contigo el viernes y la ajustamos a lo que ya llevas hecho.", medidoMin: 63),
    ]

    // MARK: - Sesiones y semanas, por el cable

    struct Extra {
        var franja: String?
        var libre: Bool?
        var test: Bool?
        var duracion: Duracion??
    }

    /// Una sesión de un día concreto: la clave de la plantilla, su estado y lo que la distingue.
    struct Spec {
        let clave: Clave
        var estado: EstadoSesion = .pendiente
        var extra = Extra()
    }

    static func d(_ clave: Clave, _ estado: EstadoSesion = .pendiente, franja: String? = nil, libre: Bool? = nil) -> Spec {
        Spec(clave: clave, estado: estado, extra: Extra(franja: franja, libre: libre))
    }

    /// El id lleva la clave de la plantilla y el día: único por sesión y legible en un fallo de prueba.
    static func id(_ clave: Clave, _ iso: String, franja: String? = nil) -> String {
        "\(clave.rawValue)@\(iso)\(franja.map { "-\($0)" } ?? "")"
    }

    static func clave(de id: String) -> Clave? { Clave(rawValue: String(id.split(separator: "@").first ?? "")) }

    private static func estadoDelCable(_ e: EstadoSesion) -> String {
        switch e {
        case .pendiente: return "scheduled"
        case .hecha:     return "completed"
        case .parcial:   return "partial"
        case .saltada:   return "missed"
        }
    }

    private static func sumaDias(_ iso: String, _ n: Int) -> String {
        let fecha = FechaES.fecha(iso) ?? Date()
        return FechaES.iso(Calendar(identifier: .gregorian).date(byAdding: .day, value: n, to: fecha) ?? fecha)
    }

    private static func cable(_ spec: Spec, iso: String) -> [String: Any] {
        let p = plantillas[spec.clave]!
        var s: [String: Any] = [
            "assignment_id": id(spec.clave, iso, franja: spec.extra.franja),
            "slot": (spec.extra.franja ?? "AM").lowercased(),
            "title": p.titulo,
            "modality": p.modalidad,
            "status": estadoDelCable(spec.estado),
            "is_test": spec.extra.test ?? p.test,
            "origin": (spec.extra.libre ?? p.libre) ? "self" : "coach",
        ]
        let duracion = spec.extra.duracion ?? p.duracion
        switch duracion {
        case let .minutos(m)?: s["est_duration_minutes"] = m
        case let .razon(r)?:   s["duration_unknown_reason"] = r
        case nil: break
        }
        if let r = p.resumen { s["short_prescription"] = r }
        return s
    }

    private static func nulo(_ s: String?) -> Any { s ?? NSNull() }

    struct DatosSemana {
        var nombreBloque: String?
        var posicion: (semana: Int, total: Int?)?
        var intencion: String?
        var planStartsOn: String?
        var hayMasAdelante = false
        var bloqueadaPorHorizonte = false
    }

    /// La respuesta del cable de una semana de lunes a domingo. `dias` son las sesiones de cada día, EN ORDEN.
    static func respuesta(lunes: String, hoy: String, dias: [[Spec]], datos: DatosSemana = DatosSemana()) -> AthletePlanWeekResponse {
        let semana: [[String: Any]] = (0..<7).map { i in
            let iso = sumaDias(lunes, i)
            let sesiones = (i < dias.count ? dias[i] : []).map { cable($0, iso: iso) }
            return ["day_of_week": i + 1, "iso_date": iso, "is_rest": sesiones.isEmpty, "sessions": sesiones]
        }
        var etiqueta: Any = NSNull()
        if let p = datos.posicion {
            let cola = p.total.map { "semana \(p.semana) de \($0)" } ?? "semana \(p.semana)"
            etiqueta = datos.nombreBloque.map { "\($0) · \(cola)" } ?? cola
        }
        let week: [String: Any] = [
            "week_start": lunes,
            "week_end": sumaDias(lunes, 6),
            "today_iso": hoy,
            "microciclo_name": nulo(datos.nombreBloque),
            "focus": nulo(datos.intencion),
            "has_next_week": datos.hayMasAdelante,
            "peek_blocked_by_horizon": datos.bloqueadaPorHorizonte,
            "paused": false,
            "plan_starts_on": nulo(datos.planStartsOn),
            "days": semana,
        ]
        let raiz: [String: Any] = ["week": week, "macro_summary": ["block": NSNull(), "week_label": etiqueta, "a_event_days": NSNull()]]
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        // swiftlint:disable:next force_try
        return try! decoder.decode(AthletePlanWeekResponse.self, from: JSONSerialization.data(withJSONObject: raiz))
    }

    static func semana(lunes: String, hoy: String, dias: [[Spec]], datos: DatosSemana = DatosSemana()) -> SemanaDelPlan {
        SemanaDelPlan.desde(respuesta(lunes: lunes, hoy: hoy, dias: dias, datos: datos))
    }

    // MARK: - Desgloses

    /// El desglose de cada sesión de las semanas dadas. Una sesión terminada trae los minutos MEDIDOS de su
    /// ejecución (una a medias, la mitad); una pendiente no tiene medida.
    static func desgloses(de semanas: [SemanaDelPlan?]) -> [String: Desglose] {
        var salida: [String: Desglose] = [:]
        for semana in semanas.compactMap({ $0 }) {
            for dia in semana.dias {
                for sesion in dia.sesiones {
                    guard let clave = clave(de: sesion.assignmentId), let p = plantillas[clave], let partes = p.partes else { continue }
                    let medido: Int? = switch sesion.estado {
                    case .hecha: p.medidoMin
                    case .parcial: p.medidoMin / 2
                    case .pendiente, .saltada: nil
                    }
                    salida[sesion.assignmentId] = .listo(DesgloseSesion(
                        partes: partes.enumerated().map { i, parte in
                            ParteDeSesion(id: "\(sesion.assignmentId)#\(i)", titulo: parte.titulo, nombresEjercicios: parte.ejercicios,
                                          estructural: parte.estructural, modalidad: parte.modalidad)
                        },
                        formato: p.formato, notaDelDia: p.nota, medidoMin: medido))
                }
            }
        }
        return salida
    }
}
#endif
