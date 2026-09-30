import SwiftUI

// «SIN SUBIR» — un entreno terminado que el servidor rechazó (4xx) y que solo existe en
// el móvil (DECISIONS 2026-09-25, «Qué ve el atleta»; el doble: `guardado-en-movil`,
// escenario «historial»).
//
// El historial es lo que devuelve el servidor, y el servidor NO lo tiene. El móvil sí:
// `RequestQueue.rejected`, con el cuerpo que se envió. El historial lo cose en local con
// ese cuerpo —mismo título y misma duración, porque salen del mismo envío— y lo marca
// «Sin subir» (el cosido, en HistoryModels.swift). Aquí: leer ese cuerpo y la ficha que
// se abre al tocar la fila.

// MARK: - El entreno guardado

/// Un entreno terminado que solo existe en el móvil. Solo lectura: lo que viajó en el
/// envío es lo que hay.
struct LocalUnsyncedWorkout: Identifiable, Equatable {
    /// El de la entrada rechazada (`RejectedRequest.id`).
    let id: UUID
    /// YYYY-MM-DD en la hora del box: la misma llave que usa el mes del servidor.
    let date: String
    let startedAt: Date?
    let title: String
    /// La sesión del coach. Nil = entreno libre (no tiene asignación hasta que el
    /// servidor lo crea, y el servidor no lo creó).
    let assignmentId: String?
    let totalDurationSeconds: Int?
    let scoreTimeS: Int?
    let scoreRounds: Int?
    let scoreReps: Int?
    let rpe: Int?
    let notes: String?
    let distanceMeters: Double?
    let avgHR: Int?
    let maxHR: Int?

    var isFree: Bool { assignmentId == nil }

    /// La fila pintada con las mismas piezas que una del servidor (título, RPE,
    /// duración). `withPartner` va a false: el enlace con la pareja es justo lo que no
    /// llegó a hacerse. `origin` nil para que nada lo tome por un libre borrable.
    var session: AthleteHistorySession {
        AthleteHistorySession(
            assignmentId: assignmentId,
            title: title,
            totalDurationSeconds: totalDurationSeconds,
            scoreTimeS: scoreTimeS,
            rpe: rpe.map { Double($0) },
            withPartner: false,
            hasRoute: false,
            origin: nil,
            scoreRounds: scoreRounds,
            scoreReps: scoreReps
        )
    }

    /// «Mié 15 jul» — la barra de la ficha local, como la cabecera de un día.
    var tituloDelDia: String {
        guard let p = HistoryCalendar.parseISO(date) else { return "Sin subir" }
        let dow = HistoryCalendar.dowAbbrev(date)
        let mes = HistoryCalendar.monthAbbrevEs[max(0, min(11, p.month - 1))]
        return "\(dow.prefix(1).uppercased())\(dow.dropFirst()) \(p.day) \(mes)"
    }

    /// «18:42 · Entreno libre» — la línea bajo el título de la ficha. Nil sin nada.
    var procedencia: String? {
        var partes: [String] = []
        if let startedAt { partes.append(Self.hora.string(from: startedAt)) }
        if isFree { partes.append("Entreno libre") }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    private static let hora: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_ES")
        f.timeZone = HistoryCalendar.boxCalendar.timeZone
        f.dateFormat = "HH:mm"
        return f
    }()

    /// Un rechazo guardado → su fila. Nil cuando no es un entreno terminado (otra
    /// ruta), cuando el cuerpo no se deja leer o cuando no dice de qué sesión es: se
    /// queda guardado igual, solo que no se pinta.
    ///
    /// `titulo` resuelve el nombre de una sesión del coach (el cuerpo solo lleva su
    /// id); se inyecta para que la prueba no dependa de lo que haya en caché.
    static func from(
        _ rechazo: RejectedRequest,
        titulo: (String) -> String? = { AssignmentDetailCache.load($0)?.workout?.name }
    ) -> LocalUnsyncedWorkout? {
        let path = rechazo.request.path
        guard let cuerpo = try? JSONDecoder().decode(CuerpoGuardado.self, from: rechazo.request.bodyJson)
        else { return nil }
        let inicio = instante(cuerpo.startedAt) ?? instante(cuerpo.endedAt)

        let asignacion: String?
        if path == FreeWorkoutAPI.path {
            guard cuerpo.title != nil || inicio != nil else { return nil }
            asignacion = nil
        } else if let id = cuerpo.assignmentId, !id.isEmpty,
                  path == WorkoutExecutionAPI.path || path == DoblesExecutionAPI.path(sessionId: id) {
            // El de dobles lleva la asignación en la ruta Y en el cuerpo (es la misma).
            asignacion = id
        } else {
            return nil
        }

        // Sin hora en el cuerpo, la de cuando se guardó: un GUARDAR se hace al terminar.
        let c = HistoryCalendar.boxComponents(inicio ?? rechazo.request.createdAt)
        guard let y = c.year, let m = c.month, let d = c.day else { return nil }
        let nombre = asignacion.flatMap(titulo) ?? (asignacion == nil ? cuerpo.title : nil)

        let tramos = cuerpo.segments ?? []
        let metros = tramos.compactMap(\.distanceMeters).filter { $0 > 0 }
        let medias = tramos.compactMap(\.avgHR)
        return LocalUnsyncedWorkout(
            id: rechazo.id,
            date: String(format: "%04d-%02d-%02d", y, m, d),
            startedAt: inicio,
            title: nombre.flatMap { $0.isEmpty ? nil : $0 } ?? "Entreno",
            assignmentId: asignacion,
            totalDurationSeconds: cuerpo.totalDurationSeconds,
            scoreTimeS: cuerpo.scoreTimeS,
            scoreRounds: cuerpo.scoreRounds,
            scoreReps: cuerpo.scoreReps,
            rpe: cuerpo.perceivedExertion,
            notes: cuerpo.notes,
            distanceMeters: metros.isEmpty ? nil : metros.reduce(0, +),
            // Media sin ponderar, como las casillas del resumen: la misma cifra que vio.
            avgHR: medias.isEmpty ? nil : medias.reduce(0, +) / medias.count,
            maxHR: tramos.compactMap(\.maxHR).max()
        )
    }

    /// Lo que el móvil guarda sin subir, listo para coser en el historial.
    static func guardados(queue: RequestQueue = .shared) async -> [LocalUnsyncedWorkout] {
        let rechazos = await queue.rejectedRequests()
        return unoPorEntreno(rechazos.compactMap { from($0) })
    }

    /// Una fila por entreno, con la MISMA identidad que usa el servidor para no
    /// duplicar un reenvío: una ejecución por sesión del coach; un libre, por su hora
    /// de inicio. Dos copias del mismo trabajo (un borrador B-02 rechazado además del
    /// GUARDAR, un sobre del reloj reenviado) son un entreno, no dos. Se queda la más
    /// reciente —la última en `rejected`, que va de la más vieja a la más nueva—; la
    /// otra sigue guardada, solo que no se pinta dos veces.
    static func unoPorEntreno(_ lista: [LocalUnsyncedWorkout]) -> [LocalUnsyncedWorkout] {
        var vistos = Set<String>()
        var out: [LocalUnsyncedWorkout] = []
        for entreno in lista.reversed() {
            let (nuevo, _) = vistos.insert(entreno.identidad)
            if nuevo { out.append(entreno) }
        }
        return Array(out.reversed())
    }

    private var identidad: String {
        if let assignmentId { return "sesion:\(assignmentId)" }
        if let startedAt { return "libre:\(Int(startedAt.timeIntervalSince1970))" }
        return "copia:\(id.uuidString)"
    }

    private static func instante(_ s: String?) -> Date? {
        guard let s else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s)
    }
}

/// Lo que el historial lee de un cuerpo guardado. NO el payload entero, a propósito:
/// solo claves de primer nivel, que son snake_case literal en los dos tipos
/// (`WorkoutExecutionPayload`, `FreeWorkoutPayload`) y salen idénticas con el
/// `JSONEncoder()` pelado de la cola y con el snake_case del POST en vivo.
/// Decodificar el tipo entero ataría la fila a la forma de cada anidado
/// (`Prescription` sale en camelCase con un codificador y en snake_case con el otro),
/// y un cuerpo de cuando el payload tenía otra forma dejaría de salir. Cada campo se
/// lee por su cuenta: uno raro no tira la fila.
private struct CuerpoGuardado: Decodable {
    let assignmentId: String?
    let title: String?
    let perceivedExertion: Int?
    let totalDurationSeconds: Int?
    let notes: String?
    let scoreTimeS: Int?
    let scoreRounds: Int?
    let scoreReps: Int?
    let startedAt: String?
    let endedAt: String?
    let segments: [Tramo]?

    struct Tramo: Decodable {
        let distanceMeters: Double?
        let avgHR: Int?
        let maxHR: Int?

        private enum CodingKeys: String, CodingKey {
            case distanceMeters = "distance_meters", avgHR = "avg_hr", maxHR = "max_hr"
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            distanceMeters = try? c.decodeIfPresent(Double.self, forKey: .distanceMeters)
            avgHR = try? c.decodeIfPresent(Int.self, forKey: .avgHR)
            maxHR = try? c.decodeIfPresent(Int.self, forKey: .maxHR)
        }
    }

    private enum CodingKeys: String, CodingKey {
        case assignmentId = "assignment_id"
        case title
        case perceivedExertion = "perceived_exertion"
        case totalDurationSeconds = "total_duration_seconds"
        case notes
        case scoreTimeS = "score_time_s"
        case scoreRounds = "score_rounds"
        case scoreReps = "score_reps"
        case startedAt = "started_at"
        case endedAt = "ended_at"
        case segments
    }

    /// Lanza solo si el cuerpo no es un objeto JSON: eso sí es basura.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        assignmentId = try? c.decodeIfPresent(String.self, forKey: .assignmentId)
        title = try? c.decodeIfPresent(String.self, forKey: .title)
        perceivedExertion = try? c.decodeIfPresent(Int.self, forKey: .perceivedExertion)
        totalDurationSeconds = try? c.decodeIfPresent(Int.self, forKey: .totalDurationSeconds)
        notes = try? c.decodeIfPresent(String.self, forKey: .notes)
        scoreTimeS = try? c.decodeIfPresent(Int.self, forKey: .scoreTimeS)
        scoreRounds = try? c.decodeIfPresent(Int.self, forKey: .scoreRounds)
        scoreReps = try? c.decodeIfPresent(Int.self, forKey: .scoreReps)
        startedAt = try? c.decodeIfPresent(String.self, forKey: .startedAt)
        endedAt = try? c.decodeIfPresent(String.self, forKey: .endedAt)
        segments = try? c.decodeIfPresent([Tramo].self, forKey: .segments)
    }
}

// MARK: - La ficha que abre «Sin subir»

/// Tocar una fila «Sin subir» del historial abre ESTO, no `ExecutedWorkoutView`: esa
/// pide la ejecución al servidor, que no la tiene (sería un 404). Enseña el registro
/// tal y como quedó en el móvil, con el aviso arriba del todo —el atleta llega
/// preguntándose qué significa «Sin subir»—.
///
/// Es la única vía por la que se entera quien NUNCA vio el resumen rechazado: un
/// entreno guardado sin cobertura puede recibir su 4xx días después, al vaciarse la
/// cola, con el atleta ya lejos de esa pantalla.
///
/// Solo lectura: lo que viajó en el envío es lo que hay. Solo se pinta lo que el envío
/// trae; lo que no trae no deja hueco.
struct EntrenoSinSubirView: View {
    let entreno: LocalUnsyncedWorkout
    var onClose: () -> Void = {}

    var body: some View {
        VStack(spacing: 0) {
            CabeceraDeLoHecho(etiqueta: "Sin subir", titulo: entreno.tituloDelDia, alCerrar: onClose)
            ScrollView {
                FichaSinSubir(entreno: entreno)
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.top, Theme.Spacing.s)
                    .padding(.bottom, Theme.Spacing.xxl)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .background(Theme.Color.background.ignoresSafeArea())
    }
}

/// El cuerpo de la ficha, fuera del `ScrollView` para poder mirarlo en una captura
/// (`ImageRenderer` no dibuja ScrollView).
///
/// El sujeto es el ENTRENO (su nombre, su hora y cuánto duró) en el tono neutro: nada de
/// esto es una alerta —el atleta no ha perdido nada ni tiene nada que hacer—, así que ni
/// ámbar ni rojo (la regla de tono de `AvisoGuardadoEnElMovil`). Debajo, lo medido en
/// teselas de dos en dos, como los números de Perfil, y las notas.
struct FichaSinSubir: View {
    let entreno: LocalUnsyncedWorkout

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            AvisoGuardadoEnElMovil()
            sujeto
            if !celdas.isEmpty {
                VStack(spacing: Theme.Spacing.m) {
                    ForEach(Array(paresDeCeldas.enumerated()), id: \.offset) { _, par in
                        TeselasDia {
                            ForEach(par) { tesela($0) }
                        }
                    }
                }
            }
            if let notas = entreno.notes, !notas.isEmpty {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    TituloSeccionDia("Notas")
                    Text(notas)
                        .papel(.cuerpo)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(Theme.Spacing.l)
                        .tarjetaDia()
                }
            }
        }
    }

    private var sujeto: some View {
        SujetoDia(tono: .neutro, etiqueta: entreno.title) {
            KickerDia(entreno.procedencia ?? "Entreno")
            TituloDia(entreno.title)
        } abajo: {
            if let segundos = entreno.totalDurationSeconds, segundos > 0 {
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(Vocab.tiempo)
                        .papel(.rotulo)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(Formato.clock(segundos))
                        .papel(.dato)
                        .foregroundStyle(Theme.Color.foreground)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func tesela(_ celda: Celda) -> some View {
        TeselaDia(rotulo: celda.label, etiqueta: "\(celda.label): \(celda.value) \(celda.unit)") {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.xs) {
                Text(celda.value)
                    .papel(.dato)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .fixedSize()
                if !celda.unit.isEmpty {
                    Text(celda.unit)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
    }

    private struct Celda: Identifiable {
        let label: String
        let value: String
        var unit: String = ""
        var id: String { label }
    }

    /// Las celdas de dos en dos: cada par es una fila de teselas de la misma altura; una impar
    /// ocupa la fila entera (como la de Fuerza en Perfil).
    private var paresDeCeldas: [[Celda]] {
        stride(from: 0, to: celdas.count, by: 2).map { Array(celdas[$0..<min($0 + 2, celdas.count)]) }
    }

    /// Lo medido y lo anotado que viajó en el envío, en el orden del resumen:
    /// resultado, esfuerzo, distancia, pulso.
    private var celdas: [Celda] {
        var out: [Celda] = []
        if let s = entreno.scoreTimeS, s > 0 {
            out.append(Celda(label: "Resultado", value: Formato.clock(s)))
        } else if let rondas = entreno.scoreRounds {
            let reps = entreno.scoreReps.map { " + \($0)" } ?? ""
            out.append(Celda(label: "Resultado", value: "\(rondas)\(reps)", unit: "rondas"))
        }
        if let rpe = entreno.rpe {
            out.append(Celda(label: "RPE", value: "\(rpe)", unit: "/10"))
        }
        if let metros = entreno.distanceMeters, let texto = Formato.distanciaCubierta(metros) {
            out.append(Celda(label: Vocab.distancia, value: texto))
        }
        if let fc = entreno.avgHR {
            out.append(Celda(label: Vocab.fcMedia, value: "\(fc)", unit: Vocab.ppm))
        }
        if let fc = entreno.maxHR {
            out.append(Celda(label: Vocab.fcMax, value: "\(fc)", unit: Vocab.ppm))
        }
        return out
    }
}
