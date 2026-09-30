import Foundation

// LA LECTURA DEL RESUMEN AL TERMINAR — qué se enseña, en qué orden y con qué estado.
//
// El resumen era una pila de 1.280 líneas donde cada `if` decidía a la vez si una tarjeta
// existía y cómo se pintaba. Aquí la decisión vive SOLA y es pura: entra lo que la sesión
// dejó (formato, lo medido, lo que el atleta ya ha tocado, cómo fue el guardado) y sale
// la pantalla como datos. La vista (`PostWorkoutSummaryView`) solo la pinta, y las pruebas
// (`LecturaResumenTests`) fijan cada regla sin montar una vista.
//
// Las reglas son las de siempre; lo nuevo es sólo la jerarquía:
//   · el SUJETO es el registro que se va a guardar: la duración (o «Registrar entreno»
//     cuando no corrió reloj), en el tono de cómo acabó (hecha · a medias);
//   · debajo, tres grupos en el mismo orden que la pila de antes: lo que se midió, tu
//     resultado y cómo fue. Un grupo sin secciones no existe (no hay título colgando);
//   · lo que no se midió no se pinta (CONTRATO-UI §7) y lo que se puede declarar con un
//     toque se declara (§6.2 bis).

/// Las dos FC de una sesión. Una sola fuente para nombrarlas, leerlas y escribirlas: tenerlas
/// escritas tres veces es lo que dejó sin cubrir el caso de «el reloj dejó la máxima y no la media».
enum MetricaFCResumen: CaseIterable, Hashable {
    case media, maxima

    var etiqueta: String { self == .media ? Vocab.fcMedia : Vocab.fcMax }
}

struct LecturaResumen: Equatable {

    /// Lo que manda en la pantalla.
    enum Sujeto: Equatable {
        /// Corrió el reloj: la duración, ya formateada.
        case tiempo(String)
        /// «Ya lo hice»: no corrió reloj y no se inventa un 0:00.
        case registrar
    }

    /// Cómo puntúa el formato. Nil = no tiene una cifra de cabecera (series, EMOM, fuerza):
    /// su resultado vive en los tramos y no se pide un campo vacío.
    enum Puntuacion: Equatable {
        /// For Time, Chipper, Ladder, Rondas, simulacro HYROX: el tiempo final.
        case tiempo
        /// AMRAP, Tabata, Death By: rondas (y, en AMRAP y Tabata, las reps de la última).
        case rondas(etiqueta: String, reps: String?)
    }

    enum Seccion: Hashable {
        // Lo que se midió
        case recorrido
        case zonas
        /// Las FC que el reloj sí dejó.
        case fcMedida
        /// Las que no dejó y el atleta puede anotar. `sinPulsometro`: no midió ninguna.
        case fcDeclarable(sinPulsometro: Bool)
        case tramos
        // Tu resultado
        case duracionManual
        case resultado
        case rx
        // Cómo fue
        case queHiciste(pendiente: Bool)
        case esfuerzo
        case comoHaIdo
        case notas
    }

    struct Grupo: Equatable {
        let titulo: String
        let secciones: [Seccion]
    }

    /// La acción anclada abajo.
    enum Accion: Equatable {
        case guardar
        case guardando
        /// Sin cobertura: el envío espera en la cola y REINTENTAR la vacía.
        case reintentar
        /// El servidor lo rechazó y se quedó en el móvil: CERRAR, sin reintento posible.
        case guardadoEnMovil

        var titulo: String {
            switch self {
            case .guardar:         return "GUARDAR"
            case .guardando:       return "GUARDANDO…"
            case .reintentar:      return "REINTENTAR"
            case .guardadoEnMovil: return "CERRAR"
            }
        }
    }

    let sujeto: Sujeto
    /// La sesión se terminó antes de tiempo: el tono es «a medias», ni aplauso ni alarma.
    let aMedias: Bool
    /// La línea que abre el sujeto: dónde está este registro.
    let kicker: String
    let grupos: [Grupo]
    let accion: Accion
    let puntuacion: Puntuacion?
    /// Lo que el reloj midió (con casilla) y lo que falta (con campo para anotarlo).
    let fcMedidas: [MetricaFCResumen]
    let fcPorDeclarar: [MetricaFCResumen]
    /// Rechazado y guardado en el móvil: lo que se anotaba ya viajó en el envío que el móvil
    /// guarda, así que los campos que quedan a la vista se bloquean.
    let bloqueada: Bool

    /// Todas las secciones, en el orden en que se pintan.
    var secciones: [Seccion] { grupos.flatMap(\.secciones) }

    /// Lo que la sesión dejó, en valores planos (así la regla se prueba sin una sesión).
    struct Entrada: Equatable {
        var manual = false
        var formato: PrescriptionScheme
        var completa = true
        var segundos: Double = 0
        var hayRecorrido = false
        var hayZonas = false
        var fcMedia: Int?
        var fcMax: Int?
        var hayTramos = false
        var hayBloquesRx = false
        /// Un cronómetro de box que corrió sin movimientos declarados.
        var pideMovimientos = false
        var movimientosDeclarados = false
        var guardadoEnMovil = false
        var guardando = false
        var falloDeEnvio = false
    }

    static func desde(_ e: Entrada) -> LecturaResumen {
        let puntuacion = Self.puntuacion(e.formato)
        let medidas = MetricaFCResumen.allCases.filter { valor($0, e) != nil }
        let faltan = MetricaFCResumen.allCases.filter { valor($0, e) == nil }

        var medido: [Seccion] = []
        if e.hayRecorrido { medido.append(.recorrido) }
        var resultado: [Seccion] = []
        if e.manual {
            // A mano no hay tramos medidos: se anota el resultado de la sesión. Un formato que
            // puntúa por tiempo ya lo pide en «Tiempo final», que ES la duración.
            if !puntuaPorTiempo(e.formato) { resultado.append(.duracionManual) }
        } else {
            if e.hayZonas { medido.append(.zonas) }
            if !medidas.isEmpty { medido.append(.fcMedida) }
            // Rechazado: anotar la FC ya no va a ningún sitio.
            if !faltan.isEmpty && !e.guardadoEnMovil {
                medido.append(.fcDeclarable(sinPulsometro: medidas.isEmpty))
            }
            if e.hayTramos { medido.append(.tramos) }
        }
        if puntuacion != nil { resultado.append(.resultado) }
        // RX / Escalado va con la puntuación: un bloque puntuado con tramos medidos.
        if !e.manual && e.hayBloquesRx { resultado.append(.rx) }

        var comoFue: [Seccion] = []
        if !e.guardadoEnMovil {
            if e.pideMovimientos { comoFue.append(.queHiciste(pendiente: !e.movimientosDeclarados)) }
            comoFue += [.esfuerzo, .comoHaIdo, .notas]
        }

        let grupos = [
            Grupo(titulo: "Lo que se midió", secciones: medido),
            Grupo(titulo: "Tu resultado", secciones: resultado),
            Grupo(titulo: "Cómo fue", secciones: comoFue),
        ].filter { !$0.secciones.isEmpty }

        return LecturaResumen(
            sujeto: e.manual ? .registrar : .tiempo(Formato.clock(e.segundos)),
            aMedias: !e.completa,
            kicker: e.guardadoEnMovil ? "Sin subir" : "Se va a guardar",
            grupos: grupos,
            accion: accion(e),
            puntuacion: puntuacion,
            fcMedidas: e.manual ? [] : medidas,
            fcPorDeclarar: e.manual || e.guardadoEnMovil ? [] : faltan,
            bloqueada: e.guardadoEnMovil
        )
    }

    // MARK: - Reglas sueltas (las usa también el envío)

    /// For Time / RFT / Chipper / Ladder / Rondas / simulacro HYROX puntúan por tiempo final.
    static func puntuaPorTiempo(_ formato: PrescriptionScheme) -> Bool {
        switch formato {
        case .forTime, .chipper, .ladder, .rounds, .hyroxSim: return true
        default: return false
        }
    }

    /// AMRAP / Tabata / Death By puntúan por rondas.
    static func puntuaPorRondas(_ formato: PrescriptionScheme) -> Bool {
        switch formato {
        case .amrap, .tabata, .deathBy: return true
        default: return false
        }
    }

    static func puntuacion(_ formato: PrescriptionScheme) -> Puntuacion? {
        if puntuaPorTiempo(formato) { return .tiempo }
        guard puntuaPorRondas(formato) else { return nil }
        // Las reps extra solo en AMRAP (la ronda a medias) y Tabata (el mínimo de reps);
        // en Death By la puntuación son las rondas superadas, sin más.
        let reps: String? = switch formato {
        case .amrap: "Reps extra"
        case .tabata: "Reps (mín.)"
        default: nil
        }
        return .rondas(etiqueta: formato == .deathBy ? "Rondas superadas" : "Rondas", reps: reps)
    }

    private static func valor(_ m: MetricaFCResumen, _ e: Entrada) -> Int? {
        m == .media ? e.fcMedia : e.fcMax
    }

    private static func accion(_ e: Entrada) -> Accion {
        if e.guardadoEnMovil { return .guardadoEnMovil }
        if e.guardando { return .guardando }
        return e.falloDeEnvio ? .reintentar : .guardar
    }
}
