import Foundation

// LAS ANALÍTICAS DEL ATLETA — el payload de `GET /api/athlete/analytics/lecturas`.
//
// POR QUÉ ESTE FICHERO NO TIENE UN CASO POR LECTURA
// -------------------------------------------------
// El servidor devuelve una LISTA (ver la cabecera de
// `shared/domain/analytics/lectura.ts`). Cada elemento trae su grupo, su dato, su
// cobertura y su procedencia, y el cliente dibuja por GRUPO + FORMA DEL DATO —
// nunca por `id`. Esa es toda la arquitectura: una lectura nueva del servidor
// aparece sola, sin tocar Swift, y una que este binario no sepa dibujar se ignora
// sin romper la pantalla.
//
// Es exactamente lo contrario de lo que pasó con `running/progress`, donde cuatro
// campos que el servidor calculaba y enviaba (`umbral`, `zonas_ritmo`, `cadencia`,
// `por_tipo`) no se dibujaban porque sumar uno costaba tocar el tipo, el
// ensamblador y el modelo Codable a la vez.
//
// LA CONSECUENCIA EN EL TIPADO: **NADA DE AQUÍ LANZA POR UN VALOR NUEVO.**
// Un grupo, una unidad, un estado o un paso que este binario no conozca decodifican
// a su caso `desconocid…`, y la vista se calla esa lectura. Si lanzaran, un enum
// ampliado en el servidor dejaría al atleta con la pantalla entera en blanco —
// que es el fallo opuesto y peor: el contrato existe para que el servidor pueda
// crecer sin desplegar la app.
//
// AQUÍ NO SE CALCULA NADA. Los motores (carga, capacidad, recuperación) viven en
// `shared/domain/analytics`, puros y probados. Este fichero sabe LEER.

// MARK: - La raíz

struct AnaliticasAtleta: Codable, Equatable {
    let athleteId: String
    let generadoIso: String
    let ventana: VentanaDeLectura
    /// El método del coach REALMENTE usado. Viaja para que el cliente pueda
    /// colorear el cociente por SUS bandas sin volver a resolverlo ni, mucho
    /// peor, cablearlo — la Regla Nº0 lo prohíbe.
    let metodo: MetodoAnalitico
    /// Cuánta historia hay DE VERDAD. Sin esto, pedir 520 semanas a quien lleva
    /// diez le enseñaría sus diez bajo el rótulo «dos años».
    let historia: HistoriaDelAtleta
    let lecturas: [LecturaAnalitica]
    /// Lo que la pantalla puede AFIRMAR, con los ids de las lecturas de las que
    /// sale cada frase. Puede venir VACÍO: no siempre hay algo que decirle.
    let hechos: [Hecho]

    struct VentanaDeLectura: Codable, Equatable {
        let semanas: Int
        let dias: Int
        /// ISO `YYYY-MM-DD`, inclusive.
        let desde: String
        let hasta: String
    }
}

/// Cuánta historia tiene el atleta. `semanas` nulo = no ha ejecutado nada: no hay
/// desde cuándo contar, que es distinto de llevar cero.
struct HistoriaDelAtleta: Codable, Equatable {
    let semanas: Int?
    let desde: String?
    /// El permiso para escribir «desde que empezaste». Sin él, lo único cierto es
    /// «en las últimas N semanas».
    let cubreTodo: Bool
}

extension AnaliticasAtleta {
    /// SOBRE QUÉ VENTANA HABLA LA PANTALLA, en dos o tres palabras.
    ///
    /// Una curva sin su ventana miente por omisión: doce semanas de fondo y dos
    /// años de fondo se dibujan igual de largas. Y «desde que empezaste» solo se
    /// escribe cuando la ventana ABARCA su historia entera —para eso viaja
    /// `historia.cubre_todo`—; si no, lo único cierto es cuántas semanas se están
    /// mirando.
    var ventanaEs: String {
        if historia.cubreTodo, historia.semanas != nil { return "desde que empezaste" }
        return "\(ventana.semanas) semanas"
    }
}

/// EL MÉTODO DEL COACH, y solo los campos que esta pantalla LEE.
///
/// Mismo criterio que `CoachRunningThresholds`: el resto de la fila viaja y no se
/// nombra, porque un campo que aparece sin usarse invita a que alguien lo use
/// mañana creyendo que estaba pensado para esto.
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
    /// Un grupo que este binario no conoce. Se ignora, no se rompe.
    case desconocido

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = GrupoLectura(rawValue: raw) ?? .desconocido
    }

    /// LA PREGUNTA QUE CONTESTA EL BLOQUE, en palabras del atleta — nunca la clave
    /// del cable. Nula para un grupo que este binario no conoce: sin título no hay
    /// bloque, y un rótulo inventado sobre lecturas que no se entienden es peor
    /// que no enseñarlas.
    ///
    /// La carga no tiene etiqueta aquí porque su bloque es otra cosa: lleva la
    /// afirmación del servidor de sujeto (ver `BloqueDeCarga`).
    var etiqueta: String? {
        switch self {
        case .carga:         return BloqueDeCarga.etiqueta
        // No «Lo que sostienes»: la primera lectura del grupo se titula «Velocidad
        // que sostienes» y las dos juntas decían lo mismo dos veces seguidas.
        case .capacidad:     return "De qué eres capaz"
        case .recuperacion:  return "Tu cuerpo"
        case .ejecucion:     return "Dentro del entreno"
        case .volumen:       return "Cuánto haces"
        case .terreno:       return "Dónde corres"
        case .desconocido:   return nil
        }
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
    /// Una unidad que este binario no sabe escribir. La lectura no se pinta: un
    /// número sin unidad es un número que miente por omisión.
    case desconocida

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = UnidadLectura(rawValue: raw) ?? .desconocida
    }
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

struct DatoDeLectura: Codable, Equatable {
    let valor: Double
    let unidad: UnidadLectura
    let referencia: ReferenciaDeLectura?
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
    let puntos: [PuntoDeSerie]

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
    /// Mismo vocabulario que `running/progress` a propósito: ya está probado y ya
    /// sabe decidir con `seCalla` cuándo la app debe callarse.
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
}

struct LecturaAnalitica: Codable, Equatable, Identifiable {
    /// Estable y único. Sirve para RECONOCER una lectura concreta (el hecho cita
    /// ids), nunca para decidir cómo se dibuja.
    let id: String
    let grupo: GrupoLectura
    let tituloEs: String
    let estado: EstadoLectura
    /// El número de portada. Nulo si `estado` es `sin_dato`.
    let dato: DatoDeLectura?
    /// Para dibujar. Nulo cuando la lectura no tiene forma de serie.
    let serie: SerieDeLectura?
    /// Bandas o partes. Nulo cuando la lectura no reparte nada.
    let reparto: RepartoDeLectura?
    let cobertura: CoberturaDeLectura
    let procedencia: ProcedenciaDeLectura
}

// MARK: - La forma: cómo se dibuja una lectura, deducido del dato

extension LecturaAnalitica {

    /// LAS CUATRO FORMAS, y ninguna más. Salen del DATO —hay serie, hay reparto,
    /// hay cifra—, nunca del `id`: por eso una lectura nueva del servidor entra
    /// dibujada sin tocar este binario.
    enum Forma: Equatable {
        /// Cifra y su curva. La serie manda: es lo que hace el bloque.
        case cifraYSerie
        /// Cifra y el reparto proporcional que la compone, en barra.
        case cifraYBarra
        /// Cifra y las contribuciones que la sostienen, en filas.
        case cifraYFilas
        /// Solo la cifra. Legítimo: un cociente no es una curva.
        case cifra
        /// No hay número, y la falta dice por qué. Se enseña apagada con su salida.
        case apagada
        /// Ni número ni motivo que enseñar: **la app se calla**.
        case muda
    }

    /// Una serie solo dibuja con DOS puntos con valor: uno no es una tendencia, y
    /// un hueco (`v` nulo) no cuenta como punto — no se interpola.
    private var serieDibujable: Bool {
        guard let serie, serie.paso != .desconocido else { return false }
        return serie.puntos.filter { $0.v != nil }.count >= 2
    }

    var forma: Forma {
        switch estado {
        case .desconocido:
            return .muda
        case .sinDato:
            // Sin falta declarada no hay nada que decirle, y un hueco mudo es
            // justo lo que este contrato existe para no enseñar.
            guard let falta = cobertura.falta, !ProgresoDeCarrera.seCalla(falta) else { return .muda }
            return .apagada
        case .medida:
            // Sin dato o sin unidad escribible no hay cifra: el servidor promete
            // que `medida` trae número, pero un binario viejo puede no saber
            // escribir su unidad, y entonces callarse es lo honesto.
            guard let dato, dato.unidad != .desconocida else { return .muda }
            _ = dato
            if serieDibujable { return .cifraYSerie }
            if let reparto, !reparto.partes.isEmpty {
                return reparto.esProporcional ? .cifraYBarra : .cifraYFilas
            }
            return .cifra
        }
    }
}

// MARK: - La lista

extension Array where Element == LecturaAnalitica {

    /// Las lecturas de un grupo, EN EL ORDEN EN QUE LLEGAN. El orden lo manda el
    /// servidor (de más completa a más corta de muestras); reordenar aquí haría
    /// que app y servidor discreparan sobre cuál es la primera.
    func deGrupo(_ grupo: GrupoLectura) -> [LecturaAnalitica] {
        filter { $0.grupo == grupo }
    }

    /// La lectura de un id concreto, para que un hecho pueda citar su evidencia.
    func porId(_ id: String) -> LecturaAnalitica? {
        first { $0.id == id }
    }

    /// LO QUE DE VERDAD SE VA A PINTAR. Un grupo entero de lecturas mudas no es un
    /// bloque vacío: es un bloque que no existe, y llamarlo con su etiqueta sería
    /// escribir un título sobre nada.
    func pintables() -> [LecturaAnalitica] {
        filter { $0.forma != .muda }
    }
}
