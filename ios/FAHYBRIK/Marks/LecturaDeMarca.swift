import Foundation

// EL DETALLE DE UNA MARCA, RESUELTO SIN PINTAR NADA.
//
// El detalle es el arquetipo **Detalle** (CONTRATO-UI §6.2): el sujeto es el dato que trajo al atleta a
// abrirlo —su mejor marca— y el hueco se gana con lo que le da sentido: contra qué se compara (el récord
// del aire libre y el de la cinta, la misma distancia dentro de su última carrera) y de dónde sale (el
// historial, con lo que mejoró cada intento). La acción, la que llena el hueco, va anclada.
//
// Aquí se decide qué estado tiene la pantalla, qué dice el sujeto, qué se compara con qué y cuándo se
// celebra una marca nueva. La vista solo pinta.

// MARK: - El estado de la pantalla

enum EstadoDeMarca: Equatable {
    case cargando
    /// No pudimos preguntar y no hay marca que enseñar.
    case error
    /// Preguntamos y esa prueba ya no está en la biblioteca (la retiró el coach). Antes era una pantalla en
    /// blanco: no es un error del atleta ni un vacío que pueda llenar, así que se dice y se ofrece volver.
    case noExiste
    case datos

    /// Un fallo al revalidar NO borra una marca que ya se tiene: el aviso sale sobre ella. El error a
    /// pantalla completa solo sale cuando nunca hubo nada que enseñar.
    static func resolver(cargando: Bool, fallo: Bool, marca: MarkView?) -> EstadoDeMarca {
        if marca != nil { return .datos }
        if cargando { return .cargando }
        return fallo ? .error : .noExiste
    }
}

// MARK: - Lo que se lee de una marca

struct LecturaDeMarca: Equatable {

    /// El sujeto: su mejor marca, o la invitación a tener una.
    enum Sujeto: Equatable {
        /// `kicker` dice de qué prueba es («5K · Tu mejor marca»), la cifra manda y el apoyo la sitúa
        /// («4:13 /km · hace 3 semanas»).
        case conMarca(kicker: String, cifra: String, apoyo: String?)
        /// Sin marca no hay cifra que enseñar: el sitio del número lo ocupa lo que cuesta la prueba.
        case sinMarca(kicker: String, titulo: String, apoyo: String)
    }

    /// Calle y cinta llevan récords separados (la cinta te mueve el suelo: un 5K en cinta nunca gana a
    /// uno de calle): se enseñan los dos, nunca mezclados. La mitad que aún no se tiene se dice con
    /// palabras («Sin marca»), no con un guion.
    struct Contextos: Equatable {
        let aire: String?
        let cinta: String?
    }

    /// Tu marca fresca contra la MISMA distancia dentro de tu última carrera: el hueco es lo que entrena
    /// el plan.
    struct Gemelo: Equatable {
        let enElBox: String
        let enCarrera: String
        let nombreDeLaCarrera: String
        /// Solo cuando la carrera fue más lenta que la marca fresca.
        let hueco: String?
    }

    struct FilaDeHistorial: Equatable, Identifiable {
        let resultado: MarkResult
        let cuando: String
        let procedencia: String
        /// Lo que mejoró o empeoró contra el intento anterior, orientado para que verde = mejor.
        let delta: Delta?
        let cifra: String
        /// Lo que produjo el atleta lo puede retirar él; el test del coach no.
        let retirable: Bool

        var id: String { resultado.id }

        struct Delta: Equatable {
            let texto: String
            let mejora: Bool
        }

        var etiquetaAccesible: String {
            var partes = [cuando, procedencia, cifra]
            if let delta { partes.append("\(delta.texto), \(delta.mejora ? "mejora" : "empeora")") }
            return partes.joined(separator: ", ")
        }
    }

    let etiqueta: String
    let sujeto: Sujeto
    let contextos: Contextos?
    let gemelo: Gemelo?
    let historial: [FilaDeHistorial]
    /// Lo que dice el historial cuando no hay ninguno: la acción anclada es su salida.
    let historialVacio: String
    /// La marca es una carrera que se REGISTRA (no se mide en la app): la acción anclada abre la hoja de
    /// registrar en vez de un intento en vivo.
    let registra: Bool

    /// La acción anclada: registrar una carrera o probarse ahora.
    var accion: String { registra ? "Registrar carrera" : "Probarme ahora" }

    static func desde(_ mark: MarkView, ahora: Date = Date()) -> LecturaDeMarca {
        LecturaDeMarca(
            etiqueta: mark.label,
            sujeto: sujeto(mark, ahora: ahora),
            contextos: contextos(mark),
            gemelo: gemelo(mark),
            historial: historial(mark, ahora: ahora),
            historialVacio: mark.measuredBy == "registered"
                ? "Registra tu primera \(mark.label.lowercased()) y aquí verás la progresión."
                : "Pruébate y aquí verás la progresión.",
            registra: mark.measuredBy == "registered"
        )
    }

    // MARK: Cada pieza

    private static func sujeto(_ mark: MarkView, ahora: Date) -> Sujeto {
        guard let mejor = mark.best else {
            return .sinMarca(kicker: mark.label, titulo: "Sin marca todavía", apoyo: mark.approxLabel)
        }
        // Las partes que existen, unidas: sin ritmo (Cooper puntúa metros) la línea no empieza con un «·».
        let apoyo = [MarkFormat.paceLine(mark, mejor.value), MarkFormat.relative(mejor.recordedAt, ahora: ahora)]
            .compactMap { $0 }
        return .conMarca(
            kicker: "\(mark.label) · Tu mejor marca",
            cifra: MarkFormat.value(mark, mejor.value),
            apoyo: apoyo.isEmpty ? nil : apoyo.joined(separator: " · ")
        )
    }

    private static func contextos(_ mark: MarkView) -> Contextos? {
        guard mark.group == "run", mark.bestOutdoor != nil || mark.bestTreadmill != nil else { return nil }
        return Contextos(
            aire: mark.bestOutdoor.map { MarkFormat.value(mark, $0.value) },
            cinta: mark.bestTreadmill.map { MarkFormat.value(mark, $0.value) }
        )
    }

    private static func gemelo(_ mark: MarkView) -> Gemelo? {
        guard let twin = mark.raceTwin, let mejor = mark.best else { return nil }
        let segundos = Int((twin.seconds - mejor.value).rounded())
        return Gemelo(
            enElBox: Formato.clock(mejor.value),
            enCarrera: Formato.clock(twin.seconds),
            nombreDeLaCarrera: twin.raceName,
            hueco: segundos > 0
                ? "En carrera fuiste \(segundos) s más lento que fresco. Normal: llegas con kilómetros en las piernas. Ese hueco es lo que entrena tu plan."
                : nil
        )
    }

    private static func historial(_ mark: MarkView, ahora: Date) -> [FilaDeHistorial] {
        mark.history.enumerated().map { i, resultado in
            // El historial va del más reciente al más viejo: contra el de DEBAJO se mide lo que mejoró.
            let anterior = i + 1 < mark.history.count ? mark.history[i + 1] : nil
            return FilaDeHistorial(
                resultado: resultado,
                cuando: MarkFormat.relative(resultado.recordedAt, ahora: ahora) ?? "",
                procedencia: procedencia(resultado),
                delta: anterior
                    .flatMap { MarkFormat.delta(mark, from: $0.value, to: resultado.value) }
                    .map { .init(texto: $0.label, mejora: $0.improved) },
                cifra: MarkFormat.value(mark, resultado.value),
                retirable: resultado.isDeletableByAthlete
            )
        }
    }

    /// Sello de origen compartido con la biblioteca (`DataOrigin.label`): una sola grafía por concepto.
    /// Para una prueba propia manda el contexto de carrera, que es lo que de verdad distingue una fila de
    /// otra: un 5K en cinta no es el mismo bicho que uno en calle.
    static func procedencia(_ resultado: MarkResult) -> String {
        if resultado.source != DataOrigin.athleteTest,
           let origen = DataOrigin.label(resultado.source, eventName: resultado.eventName) {
            return origen
        }
        switch resultado.runContext {
        case "treadmill": return "en cinta"
        case "outdoor": return "aire libre"
        default: return "te probaste"
        }
    }
}

// MARK: - El aviso sobre la marca

/// Lo que ha salido mal con una marca que YA se enseña: se dice sobre ella, con su salida si la hay. (Con la
/// marca sin cargar es el estado `.error`, a pantalla completa.)
enum AvisoDeMarca: Equatable {
    /// Volver a pedir la marca falló (al tirar para refrescar o tras un intento): lo que se ve es lo de antes.
    case noSeCargo
    /// Retirar una fila del historial falló: la lista no se toca.
    case noSeRetiro

    var texto: String {
        switch self {
        case .noSeCargo: return "No pudimos cargar la marca."
        case .noSeRetiro: return "No pudimos retirar la marca."
        }
    }

    /// Reintentar tiene sentido al cargar; al retirar, el atleta vuelve a elegir la fila.
    var reintentable: Bool { self == .noSeCargo }
}

// MARK: - La celebración

/// Lo que se celebra tras un intento o una carrera registrada: el número y lo que batió. Sin confeti.
struct MarcaNueva: Equatable {
    let cifra: String
    /// «−5 s»: lo que mejoró (o empeoró) contra la mejor de antes. Nil = no hay con qué comparar.
    let delta: String?
    let esRecord: Bool

    var titulo: String { esRecord ? "Marca nueva · PR" : "Marca guardada" }

    /// Sin delta, una línea que es verdad con coach y sin él (esta pantalla sirve a los dos).
    var linea: String { delta.map { "\(cifra) · \($0)" } ?? "\(cifra) · guardada en tu ficha" }

    /// Lo que hay que celebrar tras recargar, y solo si de verdad ha llegado un resultado nuevo.
    ///
    /// `veredicto` es el `is_pr` + la mejor de antes que calcula el SERVIDOR sobre el historial comparable
    /// del atleta: cuando lo tenemos, decide él. `nil` es el camino de «Probarme», donde `mejorAntes` es una
    /// foto real tomada un segundo antes de empezar: ahí no tener mejor de antes significa, de verdad, que
    /// es la primera de la historia (y una primera marca es un récord por definición).
    static func resolver(
        marca: MarkView,
        ultimaDeAntes: MarkResult?,
        veredicto: MarkWriteResult?,
        mejorAntes: Double?
    ) -> MarcaNueva? {
        guard let ultima = marca.latest, ultima != ultimaDeAntes else { return nil }
        let previa = veredicto?.previousBest ?? mejorAntes
        let diferencia = previa.flatMap { MarkFormat.delta(marca, from: $0, to: ultima.value) }
        let esRecord: Bool
        if let veredicto {
            esRecord = veredicto.isPr
        } else {
            esRecord = diferencia?.improved ?? (previa == nil)
        }
        return MarcaNueva(cifra: MarkFormat.value(marca, ultima.value), delta: diferencia?.label, esRecord: esRecord)
    }
}
