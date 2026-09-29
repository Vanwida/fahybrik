import Foundation

// LAS LECTURAS DEL MOTOR — el contrato `Lectura` (`shared/domain/analytics/lectura.ts`) que sirven el panel, los detalles de familia
// y la sesión (`PanelAnaliticas`, `DetalleAnaliticas`, `DetalleDeSesion`).
//
// POR QUÉ ESTE FICHERO NO TIENE UN CASO POR LECTURA
// -------------------------------------------------
// El servidor devuelve una LISTA. Cada elemento trae su bloque, su dato, su cobertura y su procedencia, y el cliente dibuja por
// BLOQUE + FORMA DEL DATO — nunca por `id`. Esa es toda la arquitectura: una lectura nueva del servidor aparece sola, sin tocar
// Swift, y una que este binario no sepa dibujar se ignora sin romper la pantalla.
//
// LA CONSECUENCIA EN EL TIPADO: **NADA DE AQUÍ LANZA POR UN VALOR NUEVO.**
// Un grupo, una unidad, un estado o un paso que este binario no conozca decodifican a su caso `desconocid…`, y la vista se calla
// esa lectura. Si lanzaran, un enum ampliado en el servidor dejaría al atleta con la pantalla entera en blanco — que es el fallo
// opuesto y peor: el contrato existe para que el servidor pueda crecer sin desplegar la app.
//
// AQUÍ NO SE CALCULA NADA. Los motores (carga, capacidad, recuperación) viven en `shared/domain/analytics`, puros y probados.
// Este fichero sabe LEER.

// MARK: - La historia

/// Cuánta historia tiene el atleta. `semanas` nulo = no ha ejecutado nada: no hay
/// desde cuándo contar, que es distinto de llevar cero.
struct HistoriaDelAtleta: Codable, Equatable {
    let semanas: Int?
    let desde: String?
    /// El permiso para escribir «desde que empezaste». Sin él, lo único cierto es
    /// «en las últimas N semanas».
    let cubreTodo: Bool
}

/// EL MÉTODO DEL COACH, y solo los campos que esta pantalla LEE.
///
/// Solo lo que se lee: el resto de la fila viaja y no se nombra, porque un campo que
/// aparece sin usarse invita a que alguien lo use mañana creyendo que estaba pensado
/// para esto.
struct MetodoAnalitico: Codable, Equatable {
    /// Bandas del cociente reciente/fondo. El ÚNICO juicio que este cliente pinta
    /// por su cuenta, y solo porque el contrato manda estos dos números para eso.
    let acrLow: Double
    let acrHigh: Double
}

// MARK: - Los hechos — lo que la pantalla AFIRMA

/// Una afirmación en lenguaje de atleta, con los ids de las lecturas que la
/// sostienen. `tono` ordena: un aviso va antes que una nota. No es un color, es
/// cuánto apremia — el cliente decide cómo se pinta.
struct Hecho: Codable, Equatable, Identifiable {
    let id: String
    let fraseEs: String
    /// Lo que pide. Nulo cuando el hecho solo informa y no hay nada que hacer.
    let pideEs: String?
    /// Los ids de las lecturas de las que sale. La auditoría del atleta.
    let de: [String]
    let tono: TonoDeHecho

    enum TonoDeHecho: String, Codable, Equatable {
        case aviso, nota
        /// Un tono nuevo del servidor no puede tumbar la respuesta entera.
        case desconocido

        init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            self = TonoDeHecho(rawValue: raw) ?? .desconocido
        }
    }
}

// MARK: - La lectura

/// En qué familia vive. El cliente agrupa por esto; no es estética, es la
/// pregunta que responde el bloque entero.
enum GrupoLectura: String, Codable, Equatable, CaseIterable {
    /// Cuánto trabajo lleva encima y a qué ritmo sube.
    case carga
    /// De qué es capaz — velocidad crítica, depósito, umbral.
    case capacidad
    /// Cómo llega — variabilidad, pulso en reposo, sueño.
    case recuperacion
    /// Cómo se comportó el cuerpo DENTRO del entreno.
    case ejecucion
    /// Cuánto hizo, y de qué tipo.
    case volumen
    /// Dónde lo hizo — subida, llano, bajada.
    case terreno
    // Los ocho bloques del panel único (docs/analiticas/modelo.md §3, 29-09):
    // una lectura del panel lleva como grupo el bloque en el que vive. La
    // portada los pinta con su propio título-pregunta (`BloqueDelPanel`), así
    // que aquí no llevan etiqueta.
    case estado, forma, semanas, intensidad, progreso, records, carrera
    /// Un grupo que este binario no conoce. Se ignora, no se rompe.
    case desconocido

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = GrupoLectura(rawValue: raw) ?? .desconocido
    }
}

/// `medida` — hay número. `sin_dato` — no lo hay, y `cobertura.falta` dice por qué.
/// No hay un tercer estado para «no aplica»: eso lo decide `seCalla` sobre la falta.
enum EstadoLectura: String, Codable, Equatable {
    case medida
    case sinDato = "sin_dato"
    case desconocido

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = EstadoLectura(rawValue: raw) ?? .desconocido
    }
}

/// La unidad del número, para que el cliente sepa ESCRIBIRLO sin adivinar. El
/// servidor no manda el número formateado a propósito: el mismo 270 se escribe
/// «4:30/km» en una tarjeta y «4:30» en un eje, y esa decisión es del que dibuja.
/// Cómo se escribe cada una vive en `GrafiaDeLectura`, no aquí.
enum UnidadLectura: String, Codable, Equatable, CaseIterable {
    case tss
    case tssSemana = "tss_semana"
    case ratio
    case ms
    case bpm
    case horas
    case pct
    case metros
    case mS = "m_s"
    case sKm = "s_km"
    case s500m = "s_500m"
    case segundos
    case kcal
    case kg
    case puntos
    case mlKgMin = "ml_kg_min"
    case sesiones
    case watts
    case reps
    case dias
    case pp
    case rpe
    case rir
    case tramos
    case s1000m = "s_1000m"
    case spm
    case rpm
    case series
    case cm
    case rondas
    /// Una unidad que este binario no sabe escribir. La lectura no se pinta: un
    /// número sin unidad es un número que miente por omisión.
    case desconocida

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = UnidadLectura(rawValue: raw) ?? .desconocida
    }
}

/// EN QUÉ FAMILIA DE ENTRENO VIVE la lectura (modelo §3, A9): cada una tiene su
/// métrica clave y su «¿mejoro?». Nula en la lectura = cruza todas (la forma, el
/// readiness). Remo, ski y bici son cada una la suya (el umbral es por máquina).
enum FamiliaLectura: String, Codable, Equatable, CaseIterable {
    case correr, remo, ski, bici, fuerza, estaciones, wod, otro
    /// Una familia que este binario no conoce: se pinta sin color de familia.
    case desconocida

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = FamiliaLectura(rawValue: raw) ?? .desconocida
    }
}

/// DE QUÉ PELDAÑO SALIÓ EL UMBRAL contra el que se calculó una cifra (modelo §4,
/// la escalera de zonas del 28/29-07): medida (un test) > declarada (un toque) >
/// estimada (de un dato suyo: 0,88 × FC máx) > poblacional (la edad). Nula en la
/// procedencia = el número no depende de ningún umbral del atleta.
enum AnclaDeLectura: String, Codable, Equatable, CaseIterable {
    case medida, declarada, estimada, poblacional
    case desconocida

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = AnclaDeLectura(rawValue: raw) ?? .desconocida
    }

    /// El chip: «medido», «declarado», «estimado», «por edad». Nulo si no se conoce.
    var etiqueta: String? {
        switch self {
        case .medida: return "medido"
        case .declarada: return "declarado"
        case .estimada: return "estimado"
        case .poblacional: return "por edad"
        case .desconocida: return nil
        }
    }

    /// Las dos anclas que NO son un dato del atleta: el chip va en trazo discontinuo.
    var esEstimada: Bool { self == .estimada || self == .poblacional }
}

/// EL MISMO NÚMERO EN EL PERIODO ANTERIOR de igual longitud (modelo A3/A4). El
/// delta va en `unidad`, que es la del UMBRAL del coach que lo juzga — no
/// necesariamente la del dato (una carga en TSS se compara en %). Es lo que
/// impide que un delta en puntos se juzgue contra un umbral en porcentaje.
struct ComparacionDeLectura: Codable, Equatable {
    /// El número en el periodo anterior. Nulo cuando no lo hubo.
    let anterior: Double?
    /// valor − anterior, en `unidad`. Nulo sin anterior (o anterior cero en pct).
    let delta: Double?
    let unidad: UnidadLectura
    let periodo: Periodo
    /// Cambio mínimo del coach para llamarlo cambio (misma `unidad`). Nulo sin umbral.
    let cambioMinimo: Double?
    /// |delta| ≥ cambio_minimo. Nulo cuando falta el delta o el umbral.
    let significativo: Bool?

    struct Periodo: Codable, Equatable {
        let desde: String
        let hasta: String
    }
}

/// LA PALABRA que la lectura se atreve a decir. Se retira (nula) cuando la
/// cobertura no la sostiene; el número se queda (DECISIONS 2026-07-28).
struct VeredictoDeLectura: Codable, Equatable {
    /// Clave estable (`optimo`, `sobrecarga`, `fresco`…). El cliente NO colorea por ella:
    /// el veredicto cambia la marca y la palabra, no el color.
    let code: String
    let etiquetaEs: String
    /// Una frase, cuando hay algo que añadir («un 30 % de esta carga sale de un umbral estimado»).
    let fraseEs: String?
    let tono: Tono

    enum Tono: String, Codable, Equatable {
        case bien, neutro, atencion, aviso
        case desconocido

        init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            self = Tono(rawValue: raw) ?? .desconocido
        }
    }
}

/// Una línea de referencia EN UNIDADES REALES de la serie (una banda del coach,
/// un aviso). Fuera las series normalizadas 0..1 (P21).
struct ReferenciaDeSerie: Codable, Equatable {
    let code: String
    let etiquetaEs: String
    let valor: Double
}

/// Contra qué se lee el número. Un 48 de variabilidad no dice nada; un 48 contra
/// un basal de 55 dice que lleva tres noches peor.
struct ReferenciaDeLectura: Codable, Equatable {
    let valor: Double
    /// `dato.valor − referencia.valor`, precalculado para que nadie lo reste al revés.
    let delta: Double
    /// Clave estable de QUÉ es la referencia — `basal_60_14d`, `objetivo_sueno`.
    /// Su traducción a palabras vive en `GrafiaDeLectura`.
    let de: String
}

/// El intervalo de una ESTIMACIÓN con banda (la previsión de carrera): `bajo ≤ valor ≤ alto`,
/// en la unidad del dato. Una medida no lo lleva: nunca se inventa alrededor de un dato medido.
struct RangoDeLectura: Codable, Equatable {
    let bajo: Double
    let alto: Double
}

struct DatoDeLectura: Codable, Equatable {
    let valor: Double
    let unidad: UnidadLectura
    let referencia: ReferenciaDeLectura?
    var rango: RangoDeLectura? = nil
}

/// Un punto de una serie. `v` a nulo es un HUECO REAL — nunca se interpola ni se
/// rellena con cero, ni aquí ni al dibujarlo.
struct PuntoDeSerie: Codable, Equatable {
    /// ISO. Día (`YYYY-MM-DD`) o lunes de la semana, según `paso`.
    let t: String
    let v: Double?
}

struct SerieDeLectura: Codable, Equatable {
    let unidad: UnidadLectura
    let paso: PasoDeSerie
    /// Lo HECHO (o lo medido).
    let puntos: [PuntoDeSerie]
    /// Lo PLANIFICADO, sobre el MISMO eje y con el mismo `paso` (modelo A7). Nulo
    /// cuando la lectura no tiene plan. Puede extenderse más allá del último punto
    /// hecho (la proyección de forma hasta la carrera) y tener huecos.
    /// Opcional también en el cable: el contrato de agosto no lo mandaba.
    var plan: [PuntoDeSerie]? = nil
    /// Líneas de referencia en unidades reales (bandas de frescura, aviso de subida).
    var referencias: [ReferenciaDeSerie]? = nil

    /// Decide la FORMA del gráfico: un paso diario es una línea (denso y
    /// continuo), uno semanal son barras. Derivado del dato, no de un `id`.
    enum PasoDeSerie: String, Codable, Equatable {
        case dia, semana, desconocido

        init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            self = PasoDeSerie(rawValue: raw) ?? .desconocido
        }
    }
}

/// Una parte de un reparto (zonas, terreno, modalidades, esfuerzos).
struct ParteDeReparto: Codable, Equatable {
    let code: String
    let etiquetaEs: String
    let valor: Double
    /// Porcentaje sobre el total. Nulo si el total es cero — o si el reparto NO es
    /// proporcional, y entonces son contribuciones sueltas y no una barra.
    let pct: Double?
}

struct RepartoDeLectura: Codable, Equatable {
    let unidad: UnidadLectura
    let total: Double
    let partes: [ParteDeReparto]

    /// LA FORMA SALE DEL DATO. Con porcentajes es una barra apilada (las partes
    /// suman un todo); sin ellos son contribuciones que no reparten nada — la
    /// curva de esfuerzos de la velocidad crítica es eso — y se leen en filas.
    var esProporcional: Bool {
        total > 0 && partes.contains { $0.pct != nil }
    }
}

/// Lo que impide que un número mienta: sobre cuánto lo dice.
struct CoberturaDeLectura: Codable, Equatable {
    /// Observaciones REALES detrás del número. Nunca inflado, nunca estimado.
    let muestras: Int
    let diasVentana: Int
    let diasConDato: Int
    /// Porcentaje 0-100 de días cubiertos. Nulo si la ventana es cero.
    let pct: Double?
    /// Por qué no alcanza, cuando no alcanza. Nulo cuando la lectura se sostiene.
    /// El vocabulario de faltas es común a todo el producto (`Falta`); qué se dice y qué se calla lo decide `AnaliticasEstados`.
    let falta: Falta?
}

/// De qué número sale el número. Sin esto, cualquier lectura es un índice
/// propietario: una cifra que el atleta no puede rastrear.
struct ProcedenciaDeLectura: Codable, Equatable {
    /// Clave estable del mecanismo — `banister_ewma`, `basal_hrv_60_14d`.
    let de: String
    /// Una frase: de qué sale. Prosa del SERVIDOR — esta pantalla no la reescribe.
    let explicaEs: String
    /// Falso cuando el ancla o la fuente es ESTIMADA. El número puede enseñarse;
    /// no puede presentarse como medido.
    let medida: Bool
    /// Quién lo midió, cuando hay un aparato detrás. `garmin`, `polar`, `healthkit`.
    let proveedor: String?
    /// El peldaño del umbral que sostiene la cifra, cuando depende de uno: la ancla
    /// MÁS DÉBIL de las que entran en el número. Nulo cuando no depende de ninguna.
    var ancla: AnclaDeLectura? = nil
}

struct LecturaAnalitica: Codable, Equatable, Identifiable {
    /// Estable y único. Sirve para RECONOCER una lectura concreta (el hecho cita
    /// ids), nunca para decidir cómo se dibuja.
    let id: String
    let grupo: GrupoLectura
    /// En qué familia de entreno vive; nula cuando cruza todas.
    var familia: FamiliaLectura? = nil
    let tituloEs: String
    let estado: EstadoLectura
    /// El número de portada. Nulo si `estado` es `sin_dato`.
    let dato: DatoDeLectura?
    /// Contra el periodo anterior de igual longitud. Nulo cuando no se compara.
    var comparacion: ComparacionDeLectura? = nil
    /// Para dibujar. Nulo cuando la lectura no tiene forma de serie.
    let serie: SerieDeLectura?
    /// Bandas o partes. Nulo cuando la lectura no reparte nada.
    let reparto: RepartoDeLectura?
    /// La palabra, cuando la cobertura la sostiene. Nula = retirada o no aplica.
    var veredicto: VeredictoDeLectura? = nil
    let cobertura: CoberturaDeLectura
    let procedencia: ProcedenciaDeLectura
}

// MARK: - ¿Se pinta?

extension LecturaAnalitica {

    /// ¿HAY ALGO QUE ENSEÑAR? Una lectura muda no es un hueco: no existe. Lo es el estado que este binario no conoce, el `sin_dato` sin
    /// falta declarada (un hueco mudo es justo lo que el contrato existe para no enseñar), el `sin_dato` con una falta de las que se
    /// callan (`Falta.seCalla`) y la cifra cuya unidad este binario no sabe escribir: un número sin unidad miente por omisión.
    var sePinta: Bool {
        switch estado {
        case .desconocido: return false
        case .sinDato:
            guard let falta = cobertura.falta else { return false }
            return !falta.seCalla
        case .medida:
            guard let dato else { return false }
            return dato.unidad != .desconocida
        }
    }
}
