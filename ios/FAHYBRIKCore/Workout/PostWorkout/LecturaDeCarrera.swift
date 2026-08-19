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
// misma serie — y por eso aquí los veredictos son VOCABULARIO DE CABLE que se
// decodifica, nunca lógica que se reimplementa.
//
// ───────────────────────────────────────────────────────────────────────────────
// PARA QUIEN ESCRIBA EL DECODIFICADOR `AssignmentDetail → Carrera`
// ───────────────────────────────────────────────────────────────────────────────
//
// Está sin escribir a propósito, y esto es el mapa (verificado contra el servidor,
// no de memoria) para que no haya que redescubrirlo:
//
// 1. **ES UN JOIN POR `position`, y ahí está todo el trabajo.**
//    `run_compliance.tramos[]` **NO trae los valores medidos**: sólo `item_uid`,
//    `position`, `verdict`, `duration_verdict`, `rep_ordinal`, `band_axis` y `band`.
//    Los números del tramo —duración, distancia, ritmo, pulso, `started_at`,
//    `leg_role`, `leg_phase`, pendiente— viven en `execution.segments[]`. Una
//    `Repeticion` de aquí es la fusión de las dos por `position`.
//
// 2. **`Objetivo` SE DERIVA DE `band`, y no se resuelve nada en el cliente.**
//    `band.axis == "pace"` → `.ritmo(fast_s, slow_s)`; `"hr"` → `.zona(min_bpm,
//    max_bpm)`. La precedencia zona-resuelta-contra-objetivo-explícito ya la resolvió
//    el servidor una vez. Volver a resolverla aquí es crear el segundo motor.
//    `objetivoRecuperacion` sale igual de `recovery_tramos[].band`.
//
// 3. **Las recuperaciones NUNCA están en `tramos`.** Llegan en `recovery_tramos`, con
//    su propio vocabulario. Mezclarlas fue un bug real; el tipado de aquí ya no deja.
//
// 4. **Un porcentaje nulo NO es un cero.** `pct_dentro` / `pct_controlada` vienen
//    nulos cuando no había nada evaluable, y eso significa «no hay porcentaje que
//    enseñar», no «cero por ciento». Los opcionales de este fichero lo respetan: no
//    los colapses a 0 al decodificar.
//
// 5. **`duration_verdict` es una fila MÁS, no un reemplazo.** Un tramo puede estar en
//    banda de ritmo y haberse quedado corto de tiempo, y se enseñan las dos cosas.
//
// 6. **TRES PENDIENTES QUE SE PARECEN Y NO SON LO MISMO.** Elegir mal es fácil y no
//    da error, así que van las tres con su pregunta:
//      · `RunComplianceTramo.prescribed_incline_pct` → **lo que PIDIÓ el coach**.
//        Alimenta `pendientePrescritaPct` y es la rama 1 del corrector.
//      · `SegmentActual.avg_gradient_pct` (mig 0185) → **lo MEDIDO**: cambio NETO de
//        altitud sobre la distancia del tramo, jamás desnivel acumulado (que sumaría
//        subidas y bajadas y daría pendiente en un llano), con la cinta mandando
//        cuando la hay porque es medida directa. Alimenta `pendientePct`, rama 2.
//      · `SegmentActual.incline_pct` → **lo que DECLARÓ la cinta** al ejecutar. Es una
//        pregunta más estrecha, sigue siendo información real por sí misma, y **no
//        alimenta el corrector**: ya está dentro de `avg_gradient_pct` cuando toca.
//    En las tres, nulo es «no se sabe» y **nunca cero**. Cero es «llano», medido o
//    pedido según cuál sea — y el corrector distingue: sin medir y sin declarar, el
//    veredicto se MANTIENE (ver la rama 3 en `LecturaDeCarreraReglas.swift`).

// MARK: - El vocabulario del veredicto (servido, no calculado)

/// Cómo salió una repetición de TRABAJO contra la banda que le pidieron. Espeja
/// `RunComplianceVerdict` de `@fahybrid/shared/domain/adherence`, que es quien lo
/// decide. Aquí sólo se nombra para poder pintarlo.
enum RunComplianceVerdict: String, Codable, Equatable {
    case dentro
    case fueraLento = "fuera_lento"
    case fueraRapido = "fuera_rapido"
    case sinDato = "sin_dato"
}

/// Cómo salió una RECUPERACIÓN. **Vocabulario propio, y es deliberado.**
///
/// Recuperando, el fallo que importa es irse RÁPIDO —suele ser LA explicación de que
/// la quinta serie se caiga— e irse lento es casi siempre irrelevante. Por eso el
/// servidor colapsa `dentro` y `fuera_lento` en una sola respuesta: las dos dicen que
/// el atleta se guardó lo que tenía que guardarse.
///
/// Traducirlo al vocabulario del trabajo borraría exactamente esa asimetría, que es
/// de dominio y no de dibujo: un «fuera_lento» en el trabajo es un aviso y en la
/// recuperación es lo correcto. Son dos preguntas distintas y se nombran distinto.
enum RecoveryComplianceVerdict: String, Codable, Equatable {
    case controlada
    case demasiadoRapida = "demasiado_rapida"
    case sinDato = "sin_dato"
}

/// ¿Cuánto DURÓ el tramo de trabajo frente a lo prescrito? Pregunta INDEPENDIENTE del
/// veredicto de intensidad: un tramo puede estar en banda de ritmo y aun así haberse
/// quedado corto de tiempo. Es una fila más, nunca un reemplazo.
enum WorkDurationVerdict: String, Codable, Equatable {
    case completa = "duracion_completa"
    case incompleta = "duracion_incompleta"
    case sinDato = "sin_dato"
}

/// Lo mismo para la recuperación, con la asimetría INVERTIDA respecto al trabajo:
/// recuperando el fallo es PASARSE de tiempo; trabajando, quedarse corto.
enum RecoveryDurationVerdict: String, Codable, Equatable {
    case controlada = "duracion_controlada"
    case excedida = "duracion_excedida"
    case sinDato = "sin_dato"
}

/// La zona del atleta, 1..5.
typealias Zona = Int

// MARK: - El MÉTODO con el que se lee esta carrera (Regla Nº0)

/// Los números que **decide el entrenador**, no nosotros, y que por tanto llegan
/// con la sesión en vez de vivir en una constante de este binario.
///
/// POR QUÉ VIAJA CON LA CARRERA Y NO ES UN AJUSTE SUELTO: el servidor ya resuelve
/// el método una vez por sesión —la banda del veredicto llega resuelta, la
/// precedencia ya está aplicada—, y este umbral es la misma clase de dato. Que
/// llegue por el mismo camino es lo que impide que el móvil y el panel del coach
/// lean la misma cuesta con dos números distintos.
///
/// Nada que no sea método entra aquí: el corrector en sí —comparar contra el
/// umbral, cambiar el eje del troceado a tiempo, elegir el sujeto— es MECANISMO y
/// se queda en `Lectura.deCorrer`. El coach pone el número; qué se dibuja con él
/// es nuestro.
struct MetodoDeLectura: Equatable {
    /// A partir de qué pendiente media el ritmo bruto deja de ser comparable.
    /// Se compara contra las DOS pendientes —la prescrita y la medida—, que es lo
    /// que hace que una sesión de cuestas se sepa que lo es sin haber medido nada.
    var pendienteQueRetiraElRitmoPct: Double

    /// Lo que se usa cuando el servidor no mandó el número. No es «el valor
    /// correcto»: es el que había antes de que existiera un sitio donde el coach
    /// pudiera cambiarlo, y sirve para que una respuesta vieja siga leyéndose.
    static let porDefecto = MetodoDeLectura(
        pendienteQueRetiraElRitmoPct: ReglasDeLectura.pendienteQueRetiraElRitmoPct
    )
}

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
    /// Pendiente MEDIDA del tramo, en %. Sale de `SegmentActual.avg_gradient_pct`:
    /// cambio NETO de altitud sobre la distancia, con la cinta mandando cuando la hay.
    /// Nula = no se sabe, que **no es cero** — cero es «llano medido».
    var pendientePct: Double?
    /// Pendiente que el coach PRESCRIBIÓ para este tramo, en % (`Segment.incline_pct`
    /// de la gramática, 0..15). Es la INTENCIÓN, no la medida, y por eso decide antes
    /// que ella: una sesión de cuestas se sabe que lo es sin haber medido nada.
    ///
    /// Sale de **`RunComplianceTramo.prescribed_incline_pct`**, que viaja al lado de
    /// `band` y `rep_ordinal` y se resuelve sobre el MISMO segmento ya alineado que
    /// resuelve `rep_ordinal` — así que no hay una segunda alineación en ningún lado.
    /// Nula cuando no se prescribió inclinación o no hay segmento alineado, **nunca
    /// cero**: cero sería «llano PEDIDO», que es otra afirmación.
    var pendientePrescritaPct: Double? = nil
    // LOS CUATRO VEREDICTOS, SERVIDOS. Los juzga el servidor con el motor del coach;
    // aquí sólo se leen. Van en cuatro campos y no en dos porque el servidor los manda
    // en cuatro sitios con DOS VOCABULARIOS distintos, y mezclarlos borraría la
    // asimetría: en el trabajo el fallo de tiempo es quedarse corto, recuperando es
    // pasarse. Un tramo usa los de su papel y deja los otros a nil.

    /// Intensidad de un tramo de TRABAJO. Nulo = no se juzgó (sin banda, o no es trabajo).
    /// Los cuatro llevan defecto `nil` para que un tramo sólo tenga que declarar los
    /// de su papel: una recuperación no menciona los del trabajo y al revés.
    var veredicto: RunComplianceVerdict? = nil
    /// Duración de un tramo de TRABAJO. Nulo = no se prescribió por tiempo.
    var veredictoDuracion: WorkDurationVerdict? = nil
    /// Intensidad de una RECUPERACIÓN. Nulo = no se juzgó (sin objetivo, o no es recuperación).
    var veredictoRecuperacion: RecoveryComplianceVerdict? = nil
    /// Duración de una RECUPERACIÓN. Nulo = no se prescribió por tiempo.
    var veredictoDuracionRecuperacion: RecoveryDurationVerdict? = nil
}

/// Un kilómetro, DERIVADO de la traza — nunca persistido (DECISIONS 11-ago).
struct Kilometro: Equatable {
    var n: Int
    var parcial: Bool
    var distanciaM: Double
    /// Instante del cruce, en s desde el inicio. Es lo que sitúa la marca sobre la
    /// curva — repartirla por igual del ancho la pondría donde no fue.
    ///
    /// Nulo = **no se puede situar**. El cruce se acumula kilómetro a kilómetro, así
    /// que en cuanto uno se queda sin duración —hubo un hueco de señal ahí— los que
    /// vienen detrás dejan de tener sitio conocido en el eje del tiempo. Su marca no
    /// se dibuja; la fila de la tabla sí, diciendo qué le faltó.
    var cruceS: Double?
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
    /// Los umbrales del ENTRENADOR con los que se lee esta carrera. Por defecto los
    /// de siempre, para que una respuesta que todavía no los manda se lea igual que
    /// hoy — y para que el día que los mande, mande ella.
    var metodo: MetodoDeLectura = .porDefecto

    struct Derivado: Equatable {
        /// Cuánto se separaron ritmo y pulso entre las dos mitades, en %.
        ///
        /// EN PORCENTAJE Y NO EN s/km, y no es un detalle: el servidor mide y sirve
        /// **`decoupling_pct`**, que es un porcentaje. Guardarlo aquí como s/km
        /// obligaría a multiplicarlo por la media de la sesión para inventar una
        /// cifra que nadie ha medido — el modelo pedía una unidad que no existe en
        /// ninguna fuente, así que el arreglo va en el modelo y no en el caso.
        var derivaPct: Double?
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
    /// que esto es MÉTODO del coach.
    ///
    /// **ESTO ES EL SUELO, NO LA FUENTE.** El número que manda llega con la sesión,
    /// en `Carrera.metodo` — este valor solo se usa cuando el servidor no lo mandó
    /// (respuestas anteriores a que lo sirviera, o detalles cacheados entonces). Se
    /// lee por `MetodoDeLectura`, nunca directamente desde la regla: dos sitios
    /// donde vive el mismo umbral acaban separándose, y hasta que se separan
    /// coinciden por casualidad.
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
    /// Veredicto de INTENSIDAD por repetición de TRABAJO, en orden. Vacío si no hay banda.
    var veredictos: [RunComplianceVerdict]
    /// Veredicto de DURACIÓN de esos mismos tramos, en el mismo orden. Fila APARTE, no
    /// reemplazo: un tramo puede estar en banda de ritmo y haberse quedado corto de
    /// tiempo, y las dos cosas se enseñan.
    var veredictosDuracion: [WorkDurationVerdict]
    /// Lo mismo para las RECUPERACIONES, cuando el coach les puso objetivo, y **con su
    /// propio vocabulario** (ver `RecoveryComplianceVerdict`).
    ///
    /// LA ASIMETRÍA, que es de dominio y no de dibujo: en una recuperación **irse
    /// RÁPIDO es el fallo que importa** —es lo que explica que la quinta serie se
    /// caiga— e irse lento es casi siempre irrelevante. Quien pinte esto no puede
    /// tratarlos igual, y por eso el tipo no le deja.
    var veredictosRecuperacion: [RecoveryComplianceVerdict]
    /// Duración de esas recuperaciones, con la asimetría INVERTIDA: aquí el fallo es
    /// pasarse de tiempo.
    var veredictosDuracionRecuperacion: [RecoveryDurationVerdict]
    /// La franja del trote, dibujada en sus propias ventanas. Nunca solapa con la del
    /// trabajo: son tramos distintos del mismo eje de tiempo.
    var bandaRecuperacion: (rapidoSkm: Double, lentoSkm: Double)?

    static func == (a: Lectura, b: Lectura) -> Bool {
        a.sujeto == b.sujeto && a.troceado == b.troceado && a.eje == b.eje
            && a.banda == b.banda && a.veredictos == b.veredictos
            && a.veredictosDuracion == b.veredictosDuracion
            && a.veredictosRecuperacion == b.veredictosRecuperacion
            && a.veredictosDuracionRecuperacion == b.veredictosDuracionRecuperacion
            && a.bandaRecuperacion?.rapidoSkm == b.bandaRecuperacion?.rapidoSkm
            && a.bandaRecuperacion?.lentoSkm == b.bandaRecuperacion?.lentoSkm
    }
}
