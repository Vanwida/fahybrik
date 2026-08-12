import Foundation

// EL MODELO DE LA LECTURA DE UNA CARRERA — qué número manda, y por qué.
//
// Port fiel del contrato firmado: `web/components/design-twin/screens/lectura-carrera/`
// (`modelo.ts`) y la entrada de `docs/DECISIONS.md` del 12-ago «Al terminar de correr
// manda el VEREDICTO, no el ritmo medio». No es inspiración: es contrato.
//
// EL MODELO ENTERO, no el caso de delante. Una lectura de carrera se decide con tres
// ejes y nada más:
//
//   INTENCIÓN   ninguna · banda de ritmo · zona · sensación (RPE, sin número)
//   ARCHIVO     sin traza · con traza (ritmo, pulso, distancia, altitud)
//   FORMA       continua · con repeticiones
//
// y un CORRECTOR que no es un caso especial sino una propiedad del eje: en pendiente
// el ritmo bruto no es comparable, así que el troceado se mide en TIEMPO.
//
// EL MECANISMO ES NUESTRO, EL MÉTODO ES DEL COACH (Regla Nº0). Y una consecuencia que
// manda sobre todo este fichero: **el veredicto por repetición NO se calcula aquí.**
// Llega SERVIDO desde el detalle del atleta, juzgado por el mismo motor
// (`evaluateRunSegment`) que juzga la sesión en el panel del coach. Dos motores para
// el mismo hecho es cómo coach y atleta acaban leyendo veredictos distintos de la
// misma serie — y por eso aquí `RunComplianceVerdict` es VOCABULARIO DE CABLE que se
// decodifica, nunca lógica que se reimplementa.

// MARK: - El vocabulario del veredicto (servido, no calculado)

/// Cómo salió una repetición contra la banda que le pidieron. Espeja
/// `RunComplianceVerdict` de `@fahybrid/shared/domain/adherence`, que es quien lo
/// decide. Aquí sólo se nombra para poder pintarlo.
enum RunComplianceVerdict: String, Codable, Equatable {
    case dentro
    case fueraLento = "fuera_lento"
    case fueraRapido = "fuera_rapido"
    case sinDato = "sin_dato"
}

/// La zona del atleta, 1..5.
typealias Zona = Int

// MARK: - Lo que se sabe de la carrera

/// Lo que pidió el coach. Cuatro clases, y ninguna más hace falta.
enum Objetivo: Equatable {
    /// Salió a correr y ya está. No hay intención que contrastar.
    case ninguno
    /// «a 3:30» o «entre 4:40 y 4:50» — ya resuelto a banda por el servidor.
    case ritmo(rapidoSkm: Double, lentoSkm: Double)
    /// «en Z2» — se mide por el PULSO, que es la señal que lo mide.
    case zona(Zona, minPpm: Double, maxPpm: Double)
    /// «fuerte / suave», «al 8 de esfuerzo»: hay intención, no hay número contra el
    /// que medir una repetición. El contraste es todo lo que se puede leer.
    case sensacion
}

/// Cómo se recuperó. Cambia lo que se puede enseñar — un parado no tiene ritmo y no
/// se le inventa uno.
enum ModoRecuperacion: String, Equatable {
    case trote, andando, parado
}

enum PapelDeTramo: String, Equatable {
    case trabajo, recuperacion
}

/// Un tramo tal y como lo cerró el entreno, o como lo detectó la señal.
struct Repeticion: Equatable {
    /// 1..N sobre las de TRABAJO. Las recuperaciones heredan el número de la que
    /// cierran, porque es como las cuenta el atleta («el trote de la tercera»).
    var n: Int
    var papel: PapelDeTramo
    var modo: ModoRecuperacion?
    var inicioS: Double
    var duracionS: Double
    var distanciaM: Double?
    var ritmoSkm: Double?
    var fcMediaPpm: Double?
    /// Pendiente media del tramo, en %. Nula sin altitud archivada.
    var pendientePct: Double?
    /// EL VEREDICTO, SERVIDO. Lo juzga el servidor con el motor del coach; aquí sólo
    /// se lee. Nulo = el servidor no lo mandó (sin banda, o sesión sin juicio).
    var veredicto: RunComplianceVerdict?
}

/// Un kilómetro, DERIVADO de la traza — nunca persistido (DECISIONS 11-ago).
struct Kilometro: Equatable {
    var n: Int
    var parcial: Bool
    var distanciaM: Double
    /// Instante del cruce, en s desde el inicio. Es lo que sitúa la marca sobre la
    /// curva — repartirla por igual del ancho la pondría donde no fue.
    var cruceS: Double
    var ritmoSkm: Double?
    var fcMediaPpm: Double?
    /// Por qué este kilómetro no tiene ritmo. Se escribe en lugar de la cifra; jamás
    /// un guion (§7 del contrato de UI).
    var sinCobertura: String?
}

/// Una señal archivada: eje explícito, cadencia variable, huecos SIN rellenar.
struct Muestra: Equatable {
    var t: Double
    var v: Double
}

struct Traza: Equatable {
    /// s/km. Derivado de la velocidad al leer — nunca se emite `pace` (DECISIONS).
    var ritmo: [Muestra]
    /// ppm.
    var pulso: [Muestra]
}

/// Un punto de la ruta, ya normalizado a 0..1 y con su zona de ritmo.
struct PuntoRuta: Equatable {
    var x: Double
    var y: Double
    var zona: Zona?
}

enum Superficie: String, Equatable {
    case calle, cinta
}

/// Acabas de terminar (hay algo que guardar) o la abres del historial.
enum MomentoDeLectura: String, Equatable {
    case alTerminar, revision
}

/// De dónde salen los tramos. Un tramo INFERIDO del ritmo no puede leerse igual que
/// uno que cerró el entreno, y se escribe bajo el troceado.
enum CertezaDeTramos: String, Equatable {
    case marcados, detectados
}

struct Carrera: Equatable {
    var titulo: String
    /// «Hoy» · «Martes 22 de julio». Va en el cromo, a la derecha.
    var cuando: String
    var momento: MomentoDeLectura
    /// La línea del coach, tal y como la escribió. Nula = entreno libre.
    var prescrito: String?
    var objetivo: Objetivo
    /// Lo que el coach pidió PARA LA RECUPERACIÓN. En carrera el «parado» rara vez se
    /// hace: lo habitual es un trote a otra intensidad, y ese trote se prescribe igual
    /// que el trabajo. Ausente = la recuperación no llevaba objetivo.
    var objetivoRecuperacion: Objetivo?
    var superficie: Superficie
    var distanciaM: Double
    var duracionS: Double
    var fcMediaPpm: Double?
    var fcMaxPpm: Double?
    var desnivelM: Double?
    /// Nula = sesión sin archivo. No es un error: es una carrera anterior a la tanda
    /// del archivo, y se dice.
    var traza: Traza?
    var repeticiones: [Repeticion]
    var certezaTramos: CertezaDeTramos?
    var kilometros: [Kilometro]
    var zonasS: [Zona: Double]
    /// Solo lo que tenga número. Un campo ausente no se pinta.
    var derivado: Derivado
    /// Vacía en cinta, y en calle sin GPS.
    var ruta: [PuntoRuta]
    /// Lo que el atleta ya contestó, cuando la sesión se abre del historial.
    var dicho: Dicho?

    struct Derivado: Equatable {
        /// Cuánto más lento fue el ritmo en la segunda mitad al MISMO pulso.
        var derivaSkm: Double?
        /// Cuánto bajó el pulso en el minuto siguiente a parar.
        var bajadaPulsoPpm: Double?
    }

    struct Dicho: Equatable {
        var rpe: Int?
        var dificultad: String?
    }
}

// MARK: - MÉTODO, no mecanismo (Regla Nº0) — defectos editables del coach

enum ReglasDeLectura {
    /// A partir de qué pendiente media el ritmo bruto deja de ser comparable y el
    /// troceado pasa a medirse en TIEMPO. Otro entrenador competente lo pondría en
    /// otro sitio (hay quien corrige el ritmo por pendiente en vez de retirarlo), así
    /// que esto es MÉTODO: valor por defecto, nunca una constante enterrada.
    static let pendienteQueRetiraElRitmoPct: Double = 3

    /// Cuántas repeticiones de trabajo hacen falta para que el veredicto sea el
    /// SUJETO. Con una sola, «1 de 1 dentro» no es una lectura: es la media con un
    /// sello encima, y así se pinta.
    static let minRepeticionesParaVeredicto = 2

    /// Hueco máximo (s) entre dos muestras para seguir dibujando línea entre ellas.
    /// MECANISMO, no método: espeja `MAX_INTERPOLATION_GAP_S` de `km-splits.ts` — un
    /// hueco es un hueco y tiene que verse, jamás se rellena.
    static let huecoQueParteLaCurvaS: Double = 30

    /// Margen del eje de la curva, como fracción del rango. Mecanismo de dibujo.
    static let margenDelEje: Double = 0.12
}

// MARK: - El sujeto — uno por lectura, y solo uno

/// Hacia dónde se fue lo que se salió. Es lo que de verdad informa al coach.
enum Sesgo: String, Equatable {
    case lento, rapido, mixto
}

enum Sujeto: Equatable {
    /// 1 · Hubo objetivo medible y varias repeticiones: ¿las hizo?
    case veredicto(
        dentro: Int,
        evaluables: Int,
        sesgo: Sesgo?,
        peorDesvioS: Double?,
        mediaTrabajoSkm: Double
    )
    /// 2 · Hubo contraste sin objetivo: manda el contraste.
    case contraste(
        nFuertes: Int,
        fuerteSkm: Double,
        suaveSkm: Double?,
        contrasteSkm: Double?,
        recuperacion: ModoRecuperacion?
    )
    /// 3 · Uniforme con objetivo de zona: el tiempo dentro de la zona pedida.
    case tiempoEnZona(zona: Zona, segundos: Double, pct: Int)
    /// 4 · Uniforme sin objetivo (o con banda, que baja a apoyo): el ritmo medio.
    case ritmoMedio(skm: Double, veredicto: RunComplianceVerdict?)
    /// 5 · El ritmo no se compara en cuesta: el tiempo por repetición y la caída.
    case tiempoPorRepeticion(
        nRepeticiones: Int,
        mediaS: Double,
        primeraS: Double,
        ultimaS: Double,
        pendientePct: Double
    )
    /// 6 · Sin cobertura: lo que sí se midió, declarando por qué no hay más.
    case kilometros(km: Double, porque: String)
}

/// El troceado que corresponde. NUNCA los dos a la vez: los kilómetros de un 6×800 no
/// dicen nada y las repeticiones de un rodaje no existen.
enum Troceado: String, Equatable {
    case repeticiones, kilometros, ninguno
}

/// El eje en el que se lee cada repetición. En cuesta, el tiempo.
enum EjeDeLectura: String, Equatable {
    case ritmo, tiempo
}

/// La franja objetivo, dibujada sobre el eje donde de verdad vive.
enum Banda: Equatable {
    case ritmo(rapidoSkm: Double, lentoSkm: Double)
    case pulso(minPpm: Double, maxPpm: Double, zona: Zona)
}

struct Lectura: Equatable {
    var sujeto: Sujeto
    var troceado: Troceado
    var eje: EjeDeLectura
    var banda: Banda?
    /// Veredicto por repetición de TRABAJO, en orden. Vacío si no hay banda.
    var veredictos: [RunComplianceVerdict]
    /// Lo mismo para las RECUPERACIONES, cuando el coach les puso objetivo.
    ///
    /// LA ASIMETRÍA, que es de dominio y no de dibujo: en una recuperación **irse
    /// RÁPIDO es el fallo que importa** —es lo que explica que la quinta serie se
    /// caiga— e irse lento es casi siempre irrelevante. Quien pinte esto no puede
    /// tratarlos igual.
    var veredictosRecuperacion: [RunComplianceVerdict]
    /// La franja del trote, dibujada en sus propias ventanas. Nunca solapa con la del
    /// trabajo: son tramos distintos del mismo eje de tiempo.
    var bandaRecuperacion: (rapidoSkm: Double, lentoSkm: Double)?

    static func == (a: Lectura, b: Lectura) -> Bool {
        a.sujeto == b.sujeto && a.troceado == b.troceado && a.eje == b.eje
            && a.banda == b.banda && a.veredictos == b.veredictos
            && a.veredictosRecuperacion == b.veredictosRecuperacion
            && a.bandaRecuperacion?.rapidoSkm == b.bandaRecuperacion?.rapidoSkm
            && a.bandaRecuperacion?.lentoSkm == b.bandaRecuperacion?.lentoSkm
    }
}
