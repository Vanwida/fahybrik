import Foundation

// EL PASO Y EL ESTADO VIVO — el contrato de P1/P2 (docs/reloj-muneca/modelo.md),
// espejo tal cual de `web/components/design-twin/kit-reloj/paso.ts`.
//
// P1 · Un estado vivo, un pintor. Quien lleve el motor (el reloj o el móvil)
//      produce ESTE estado; la muñeca y el iPhone lo pintan con el mismo código.
// P2 · El paso es la unidad: medida × objetivo(s) × rol × fase, con su posición
//      anidada, quién lo mide, el paso siguiente y el cue del coach.
//
// Este fichero es PURO (solo tipos y valores por defecto). Compila en el iPhone
// y en el reloj (FAHYBRIKCore entra entera en los dos targets). Ningún campo es
// texto libre salvo el cue del coach (M8) y el nombre de catálogo.
//
// Lo que es MÉTODO (dónde cortan las zonas, cuánta holgura antes de avisar, cómo
// se llama cada clase de paso) va como DATO con valor por defecto — HARD RULE Nº0.
//
// TODO el vivo rehecho vive bajo el espacio de nombres `Vivo`, para no chocar con
// los tipos del motor de hoy (`Trabajo`, `Delta`, `Rol`, `Clase`…) mientras
// conviven.
enum Vivo {}

// MARK: - Medida — cómo se mide el trabajo y quién lo mide

extension Vivo {
    enum TipoMedida: String, Equatable, Codable {
        case distancia, tiempo, reps, cal, abierta
    }

    /// Quién mide el paso. `reloj` es el crono (todo paso por tiempo); `sensor` el
    /// acelerómetro; `atleta` = nadie lo mide, «lo dices tú».
    enum QuienMide: String, Equatable, Codable {
        case gps, cinta, ergo, sensor, atleta, reloj
    }

    struct Medida: Equatable {
        var tipo: TipoMedida
        /// En la unidad del tipo: m, s, reps, cal. `nil` en una medida abierta.
        var prescrito: Double?
        var mide: QuienMide
    }

    // MARK: - Objetivo — contra qué se mide (0–2 por paso, M1)

    enum EjeObjetivo: String, Equatable, Codable {
        case ritmo        // s/km
        case zona         // número de zona del coach (1..N)
        case ppm
        case rpe          // 1–10
        case potencia     // W
        case pctRM
        case kg
        case rir
        case split500     // s/500 m (ergo)
        case cadencia     // pasos/min o paladas/min
        case inclinacion  // % (cinta)
    }

    /// `principal` manda en el héroe (P3); `techo` solo avisa por encima;
    /// `secundario` acompaña sin mandar.
    enum PapelObjetivo: String, Equatable, Codable {
        case principal, techo, secundario
    }

    /// Qué dirección avisa, razonada en INTENSIDAD.
    enum SentidoAviso: String, Equatable, Codable {
        case ambos
        case soloArriba = "solo-arriba"
        case soloAbajo = "solo-abajo"
    }

    struct Objetivo: Equatable {
        var eje: EjeObjetivo
        /// En `ritmo` y `split500` `min` es el valor MÁS RÁPIDO (menos segundos).
        var min: Double?
        var max: Double?
        var papel: PapelObjetivo
        var avisa: SentidoAviso? = nil
        /// La palabra del coach para un RPE («fuerte»). Si falta, la del defecto.
        var palabra: String? = nil
    }

    // MARK: - Rol, fase, posición

    enum Rol: String, Equatable, Codable {
        case trabajo, recuperacion, descanso, transicion
    }

    enum Fase: String, Equatable, Codable {
        case calentamiento, principal, vuelta
    }

    struct Contador: Equatable {
        var n: Int
        var de: Int
    }

    /// La posición anidada, sin aplanar (M4).
    struct Posicion: Equatable {
        var tanda: Contador? = nil
        var serie: Contador? = nil
        var tramo: Contador? = nil
        var ronda: Contador? = nil
        var estacion: Contador? = nil
        /// Superserie: «A1», «A2».
        var slot: String? = nil
    }

    /// La clase del paso. El NOMBRE que se pinta es dato del coach
    /// (`nombreClaseDefecto` es solo el defecto).
    enum Clase: String, Equatable, Codable, CaseIterable {
        case calentamiento
        case vueltaCalma = "vuelta-calma"
        case rodaje, tirada, tempo, series, progresivo, fartlek, cuestas, strides, carrera, test
        case recuperacion, descanso
        case descansoTandas = "descanso-tandas"
        case estacion, roxzone, fuerza, ergo, emom, amrap, fortime, movilidad
    }

    static let nombreClaseDefecto: [Clase: String] = [
        .calentamiento: "Calentamiento",
        .vueltaCalma: "Vuelta a la calma",
        .rodaje: "Rodaje",
        .tirada: "Tirada",
        .tempo: "Tempo",
        .series: "Serie",
        .progresivo: "Progresivo",
        .fartlek: "Fartlek",
        .cuestas: "Cuesta",
        .strides: "Stride",
        .carrera: "Carrera",
        .test: "Test",
        .recuperacion: "Recupera",
        .descanso: "Descanso",
        .descansoTandas: "Descanso entre tandas",
        .estacion: "Estación",
        .roxzone: "Roxzone",
        .fuerza: "Serie",
        .ergo: "Ergo",
        .emom: "EMOM",
        .amrap: "AMRAP",
        .fortime: "For Time",
        .movilidad: "Movilidad",
    ]

    static func nombreClase(_ c: Clase) -> String { nombreClaseDefecto[c] ?? c.rawValue }

    /// Los nombres por defecto que son femeninos («Serie 2 cerrada»).
    static let femeninoDefecto: Set<Clase> = [
        .vueltaCalma, .tirada, .series, .cuestas, .carrera, .estacion, .roxzone, .fuerza, .movilidad,
    ]

    // MARK: - Lo propio de cada familia, como DATO del paso (P10, P11, P12)

    enum SentidoRoxzone: String, Equatable, Codable { case entrada, salida }

    /// La carga de un implemento (M7): 2 × 32 kg → kg 32, implementos 2.
    struct Carga: Equatable {
        var kg: Double
        var implementos: Int? = nil
    }

    /// P12 · Un movimiento dentro de una ventana (EMOM), de una ronda (AMRAP) o
    /// de un For Time. `dosis: nil` = todo el intervalo.
    struct Tarea: Equatable {
        var nombre: String
        var dosis: Medida?
        var carga: Carga? = nil
        /// «@ peso corporal»: un dato, no la ausencia de carga.
        var corporal: Bool? = nil
        var mide: QuienMide
        /// Una tarea de correr usa la cara de correr (P10).
        var corre: Bool? = nil
    }

    /// P12 · El formato que enmarca la tarea (M5).
    enum InfoWod: Equatable {
        case emom(tarea: Tarea, ciclo: [Tarea], ventanas: Int, ventanaS: Double)
        case amrap(tareas: [Tarea], duracionS: Double)
        case puntuacion(tareas: [Tarea], duracionS: Double)
        case fortime(tarea: Tarea?, capS: Double?)
        case pared(trabajoS: Double, descansoS: Double, rondas: Int)
        case deathby(tarea: Tarea, inicio: Int, incremento: Int, ventanaS: Double, tope: Int?)

        var formato: Formato {
            switch self {
            case .emom: return .emom
            case .amrap: return .amrap
            case .puntuacion: return .puntuacion
            case .fortime: return .fortime
            case .pared: return .pared
            case .deathby: return .deathby
            }
        }

        enum Formato: String, Equatable { case emom, amrap, puntuacion, fortime, pared, deathby }
    }

    /// P11 · El eje de la CARGA.
    enum CargaFuerza: Equatable {
        case kg(min: Double, max: Double)
        case rm(pctMin: Double, pctMax: Double, rmKg: Double?)
        case corporal
        case tuya(ultimaKg: Double?, lastre: Bool)
    }

    /// P11 · El eje del ESFUERZO: RIR o RPE, valor o rango.
    struct EsfuerzoFuerza: Equatable {
        enum Eje: String, Equatable { case rir, rpe }
        var eje: Eje
        var min: Double
        var max: Double
    }

    /// P11/M1 · LA FICHA DE LA SERIE DE FUERZA.
    struct FichaFuerza: Equatable {
        /// Clave del ejercicio en la sesión: agrupa sus series y aproximaciones.
        var ejercicio: String
        var carga: CargaFuerza
        var esfuerzo: EsfuerzoFuerza?
        enum PorLado: String, Equatable { case pierna, brazo, lado }
        var porLado: PorLado? = nil
        var aproximacion: Bool = false
        /// Lo que mueve la carga un clic, en kg. Del gimnasio.
        var pasoKg: Double = fichaFuerzaDefecto.pasoKg
        /// De dónde arranca si no hay carga propuesta: la barra vacía.
        var vaciaKg: Double? = nil
    }

    /// Lo que es del implemento y del gimnasio: dato con defecto (HARD RULE Nº0).
    static let fichaFuerzaDefecto = (pasoKg: 2.5, vaciaKg: 20.0)

    // MARK: - El paso

    enum ModoRecupera: String, Equatable, Codable { case trote, andar, parado }
    enum Entorno: String, Equatable, Codable { case calle, cinta, pista }

    struct Maquina: Equatable {
        enum Tipo: String, Equatable, Codable { case remo, ski, bici, cinta }
        var tipo: Tipo
        var damper: Int? = nil
    }

    struct Tempo: Equatable {
        var excentrica: Int
        var pausaAbajo: Int
        var concentrica: Int
        var pausaArriba: Int
    }

    enum Cierre: String, Equatable, Codable { case medida, atleta }

    /// EL PASO — `PasoBase` del kit. El `siguiente` viaja aparte en `EstadoVivo`.
    struct Paso: Equatable, Identifiable {
        var id: String
        var clase: Clase
        var rol: Rol
        var fase: Fase = .principal
        var medida: Medida
        /// 0–2 (M1). El `principal` manda en el héroe.
        var objetivos: [Objetivo] = []
        var posicion: Posicion? = nil
        /// Nombre de catálogo del ejercicio, estación o máquina («Back Squat», «Sled Push»).
        var nombre: String? = nil
        var modoRecupera: ModoRecupera? = nil
        var entorno: Entorno? = nil
        var carga: Carga? = nil
        var maquina: Maquina? = nil
        var tempo: Tempo? = nil
        /// M8 · El cue del coach: coaching corto, no prescripción.
        var cue: String? = nil
        var cierre: Cierre = .medida
        /// Vuelta automática cada N metros (dato del coach, P9).
        var vueltaAutoM: Double? = nil
        /// Índice del bloque del coach: cambiar de bloque es el evento «bloque hecho».
        var bloque: Int? = nil
        var roxzone: SentidoRoxzone? = nil
        var wod: InfoWod? = nil
        var fuerza: FichaFuerza? = nil
        /// De dónde sale este paso en el motor de hoy (el adaptador lo rellena; el
        /// pintor no lo mira). `nil` en un paso construido a mano o en el doble.
        var origen: Origen? = nil
    }

    /// El cursor del motor de hoy que produjo el paso: segmento + ventana + si es
    /// el descanso que sigue a esa ventana. Es lo que deja al adaptador decir
    /// «el paso vivo es este» sin un segundo estado.
    struct Origen: Equatable {
        enum Ventana: Equatable {
            case segmento
            case emom(Int)
            case ronda(Int)
            case pierna(Int)
            case estacion(Int)
            case serie(Int)
        }
        var segmento: Int
        var ventana: Ventana
        var descanso: Bool = false
        /// La puntuación que sigue a la ventana (la campana del AMRAP): el motor
        /// ha acabado el trabajo y espera; el vivo la pide antes de cerrar.
        var puntuacion: Bool = false
    }

    // MARK: - Lecturas — lo que miden los sensores AHORA

    enum CampoVivo: String, Equatable { case hecho, ritmo, ppm, split500, vatios, cadencia, cal }

    enum EstadoGps: String, Equatable {
        case buscando, listo
        case noAplica = "no-aplica"
    }

    enum Tendencia: String, Equatable { case sube, baja, estable }

    struct Lecturas: Equatable {
        /// Segundos en el paso.
        var t: Double
        /// Lo hecho del paso en la unidad de su medida. `nil` = nadie lo ha medido.
        var hecho: Double?
        /// Ritmo ACTUAL suavizado (~10 s), s/km. Nunca la media rotulada «ritmo».
        var ritmo: Double?
        var ppm: Double?
        var ppmTendencia: Tendencia? = nil
        var split500: Double? = nil
        var vatios: Double? = nil
        var cadencia: Double? = nil
        var cal: Double? = nil
        var gps: EstadoGps = .noAplica
        /// Campos que dependen del móvil y no llegan en 5 s: se pintan «—».
        var viejos: [CampoVivo] = []

        func viejo(_ c: CampoVivo) -> Bool { viejos.contains(c) }
    }

    // MARK: - Zonas del coach y reglas de aviso — MÉTODO, dato con defecto

    /// `techos[i]` es el ppm más alto de la zona i+1; el último es la FC máxima.
    struct ZonasCoach: Equatable {
        var techos: [Double]
        var nombres: [String]? = nil
    }

    struct ReglasAviso: Equatable {
        struct Holgura: Equatable {
            var ritmo: Double
            var ppm: Double
            var split500: Double
            var vatios: Double
            var cadencia: Double
        }
        var holgura: Holgura
        var cadenciaS: Double
        var confirmacionS: Double
        var graciaZonaS: Double
        var preavisoS: Double
        var preavisoM: Double
        var preavisoMinimoS: Double
        var avisarEnCalentamiento: Bool
        var avisarEnRecuperacion: Bool
    }

    static let reglasAvisoDefecto = ReglasAviso(
        holgura: .init(ritmo: 3, ppm: 2, split500: 2, vatios: 10, cadencia: 3),
        cadenciaS: 20,
        confirmacionS: 4,
        graciaZonaS: 45,
        preavisoS: 10,
        preavisoM: 100,
        preavisoMinimoS: 30,
        avisarEnCalentamiento: false,
        avisarEnRecuperacion: false
    )

    // MARK: - Vueltas, parciales y estructura

    enum Veredicto: String, Equatable {
        case dentro
        case porEncima = "por-encima"
        case porDebajo = "por-debajo"
    }

    struct Vuelta: Equatable {
        enum Clase: String, Equatable { case serie, km, tramo, estacion }
        var n: Int
        var tanda: Int? = nil
        var clase: Clase
        var segundos: Double
        var metros: Double?
        /// Ritmo medio de la vuelta, s/km.
        var ritmo: Double?
        var ppm: Double?
        var veredicto: Veredicto?
        var eje: EjeObjetivo? = nil
    }

    /// EL PARCIAL DE UN PASO — cada paso cerrado deja el suyo (P10).
    struct Parcial: Equatable {
        var i: Int
        var segundos: Double
        var metros: Double?
        var ppm: Double?
        var hecho: Double?
    }

    struct FilaEstructura: Equatable {
        enum Estado: String, Equatable { case hecho, ahora, pendiente }
        var fase: Fase
        var veces: Int? = nil
        var trabajo: Paso
        var recupera: Paso? = nil
        var tandas: (veces: Int, descanso: Paso)? = nil
        var estado: Estado

        static func == (a: FilaEstructura, b: FilaEstructura) -> Bool {
            a.fase == b.fase && a.veces == b.veces && a.trabajo == b.trabajo && a.recupera == b.recupera
                && a.estado == b.estado && a.tandas?.veces == b.tandas?.veces && a.tandas?.descanso == b.tandas?.descanso
        }
    }

    // MARK: - El estado vivo entero

    enum Enlace: String, Equatable {
        case solo, espejo
        case sinEnlace = "sin-enlace"
    }

    struct Sesion: Equatable {
        var t: Double
        var metros: Double?
        var ritmoMedio: Double?
        var ppmMedio: Double?
    }

    /// EL ESTADO VIVO — lo que un pintor necesita y nada más. El adaptador lo
    /// produce desde el motor (`Vivo.EstadoVivo(sesion:)`); el doble lo produce
    /// desde su simulador. Los dos pintan lo mismo.
    struct EstadoVivo: Equatable {
        var pasos: [Paso]
        /// Índice del paso vivo en `pasos`.
        var i: Int
        var lecturas: Lecturas
        var sesion: Sesion
        var zonas: ZonasCoach?
        var reglas: ReglasAviso = Vivo.reglasAvisoDefecto
        var pausado: Bool
        var enlace: Enlace = .solo
        var vueltas: [Vuelta] = []
        var parciales: [Parcial] = []
        /// Metros medidos de ESTE paso (GPS, cinta o máquina); nil si nadie los midió.
        var metrosPaso: Double? = nil
        /// Metros de ergómetro de la sesión (PM5): cuentan aparte de los corridos.
        var sesionErgoM: Double = 0
        /// 3, 2, 1 durante la cuenta atrás; nil si no.
        var cuenta: Int? = nil
        /// El GO del primer segundo de un paso de trabajo.
        var go: Bool = false
        var terminado: Bool = false

        var paso: Paso { pasos[Swift.min(Swift.max(0, i), pasos.count - 1)] }
        var siguiente: Paso? { i + 1 < pasos.count ? pasos[i + 1] : nil }
    }
}
