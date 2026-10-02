import Foundation

// LA LECTURA DE LA SESIÓN PREVIA — qué enseña la ficha de la sesión antes de empezar, en qué orden y
// con qué acción. La vista (`PreWorkoutBriefView`) PINTA esto y no decide nada: así la decisión se
// prueba sin renderizar (`LecturaSesionPreviaTests`) y las reglas no pueden cambiar al cambiar la piel.
//
// Las reglas son las de siempre, solo que ahora viven aquí juntas:
//   · el cuerpo sale del DETALLE rico de la asignación (`GET /assignments/{id}/detail`), nunca del
//     `WorkoutPlan` (que solo lanza el motor). Sin detalle se dice «sin detalle», jamás una sesión inventada;
//   · lo PRINCIPAL encabeza y el calentamiento y la vuelta a la calma se pliegan en listas cortas debajo
//     (si nada es principal, todo va entero: no se esconde la sesión);
//   · primera pasada: «Continuar» (o «Continuar a preparación» si todo es fuerza) y los dos caminos a
//     mano —«Ya lo hice» y la captura—, que una MARCA no tiene (lo que la app no midió no existe);
//   · segunda pasada (después de Dispositivos): la ÚNICA puerta de empezar (FH-95) y la tarjeta del reloj.

struct LecturaSesionPrevia {

    /// En qué pasada del flujo está la ficha.
    enum Paso: Equatable {
        /// Primera vez: revisas la sesión y sigues a Dispositivos (o la registras a mano).
        case revisar
        /// Vuelves de Dispositivos: lo único que queda es empezar.
        case listoParaEmpezar
    }

    /// La acción anclada abajo. Una sola por pasada.
    enum Accion: Equatable {
        case continuar
        /// Una sesión solo de hierro: lo siguiente es preparar la barra, no conectar máquinas.
        case continuarAPreparacion
        /// La única puerta de empezar del camino previo al vivo (FH-95).
        case empezar

        var titulo: String {
            switch self {
            case .continuar:             return "Continuar"
            case .continuarAPreparacion: return "Continuar a preparación"
            case .empezar:               return "Empezar"
            }
        }
    }

    /// Los caminos para registrar sin el cronómetro, en el orden en que se pintan.
    enum Secundaria: Equatable {
        /// Entrenaste sin el cronómetro y lo apuntas a mano.
        case yaLoHice
        /// Entrenaste con otra app y traes el resultado por una captura.
        case conCaptura

        var titulo: String {
            switch self {
            case .yaLoHice:   return "Ya lo hice · registrar sin cronómetro"
            case .conCaptura: return "Registrar con captura de otra app"
            }
        }

        var etiquetaAccesible: String {
            switch self {
            case .yaLoHice:   return "Ya lo hice. Registrar sin cronómetro."
            case .conCaptura: return "Registrar con una captura de otra app."
            }
        }
    }

    /// Lo principal, y lo estructural plegado.
    struct Bloques: Equatable {
        /// Lo que encabeza, en su orden: el trabajo principal (o todo, si nada lo es).
        let principales: [WorkoutBlock]
        /// Vacíos cuando no hay trabajo principal (entonces ya van enteros en `principales`).
        let calentamiento: [WorkoutItem]
        let vueltaALaCalma: [WorkoutItem]
    }

    enum Cuerpo: Equatable {
        case bloques(Bloques)
        /// El detalle no llegó (primera apertura sin red, sesión sin ejercicios detallados).
        case sinDetalle
    }

    let paso: Paso
    let titulo: String
    /// La palabra de la modalidad del bloque principal: «Fuerza», «Carrera», «Ergómetro»…
    let modalidad: String
    /// Minutos aproximados que declara el plan. Nil si no los declara.
    let minutos: Int?
    /// La zona más intensa que pide la sesión.
    let zonaObjetivo: HRZone?
    /// La fase pedagógica del plan («Tapering · sem 2 · día 4»). Nil si no la hay.
    let contexto: String?
    let notaDelCoach: String?
    let cuerpo: Cuerpo
    let accion: Accion
    let secundarias: [Secundaria]
    /// Hay algo que compartir: una tarjeta de un título pelado no enseña nada.
    let compartible: Bool
    /// La tarjeta del reloj: solo en la segunda pasada.
    let muestraReloj: Bool
    /// La frase sobre la acción en la segunda pasada. Nil en la primera.
    let lineaDeArranque: String?
    /// La sesión tal como la enseña la ficha: cabecera y bloques con su forma (`LecturaFicha`).
    let ficha: LecturaFicha

    /// La etiqueta que abre el sujeto: la modalidad y, si la hay, la duración.
    var kicker: String {
        guard let minutos else { return modalidad }
        return "\(modalidad) · ≈ \(minutos) min"
    }

    static func desde(
        plan: WorkoutPlan,
        detalle: AssignmentDetail?,
        listo: Bool,
        esMarca: Bool,
        conCaptura: Bool,
        relojDisponible: Bool,
        contexto: ContextoFicha = ContextoFicha()
    ) -> LecturaSesionPrevia {
        let segmentos = plan.segments.sorted { $0.order < $1.order }
        let bloques = detalle?.workout?.blocks ?? []
        let paso: Paso = listo ? .listoParaEmpezar : .revisar

        let accion: Accion
        if listo {
            accion = .empezar
        } else {
            // Todo hierro: el paso siguiente es preparar la barra (la misma regla que el CTA de siempre).
            let todoFuerza = !segmentos.isEmpty && segmentos.allSatisfy { $0.kind == .strength }
            accion = todoFuerza ? .continuarAPreparacion : .continuar
        }

        var secundarias: [Secundaria] = []
        if !listo, !esMarca {
            secundarias.append(.yaLoHice)
            if conCaptura { secundarias.append(.conCaptura) }
        }

        let minutos = plan.estimatedDurationSeconds > 0
            ? Int((Double(plan.estimatedDurationSeconds) / 60).rounded())
            : nil

        return LecturaSesionPrevia(
            paso: paso,
            titulo: plan.name,
            modalidad: palabraDeModalidad(modalidadPrincipal(bloques: bloques, segmentos: segmentos)),
            minutos: minutos,
            zonaObjetivo: segmentos.compactMap(\.targetZone).max { $0.rawValue < $1.rawValue },
            contexto: plan.blockContext.isEmpty ? nil : plan.blockContext,
            notaDelCoach: plan.coachNote.flatMap { $0.isEmpty ? nil : $0 },
            cuerpo: bloques.isEmpty ? .sinDetalle : .bloques(reparte(bloques)),
            accion: accion,
            secundarias: secundarias,
            compartible: !plan.segments.isEmpty,
            muestraReloj: listo,
            lineaDeArranque: listo
                ? (relojDisponible ? "Empieza cuando estés listo. El reloj se abre solo." : "Empieza cuando estés listo.")
                : nil,
            ficha: LecturaFicha.desde(plan: plan, detalle: detalle, contexto: contexto)
        )
    }

    // MARK: - Reglas

    /// Lo principal encabeza; el calentamiento y la vuelta a la calma se pliegan. Si NADA es principal
    /// (todo es calentamiento o calma), se pinta todo entero en vez de esconder la sesión.
    static func reparte(_ bloques: [WorkoutBlock]) -> Bloques {
        let ordenados = bloques.sorted { $0.blockPosition < $1.blockPosition }
        let fase = { (b: WorkoutBlock) in BlockPhase.classify(title: b.title) }
        let principales = ordenados.filter { fase($0).isMainWork }
        guard !principales.isEmpty else {
            return Bloques(principales: ordenados, calentamiento: [], vueltaALaCalma: [])
        }
        return Bloques(
            principales: principales,
            calentamiento: ordenados.filter { fase($0) == .warmup }.flatMap(\.items),
            vueltaALaCalma: ordenados.filter { fase($0) == .cooldown }.flatMap(\.items)
        )
    }

    /// La modalidad de la sesión la dice el BLOQUE PRINCIPAL (el trabajo), no el primer ejercicio: si no, un
    /// BikeErg de calentamiento etiquetaría «Ergómetro» un día de pierna. Es la misma selección que usa el
    /// motor (`WorkoutPlan.principalBlock`), así que la ficha, el tinte y la tarjeta de la semana coinciden.
    /// Sin bloques (sesión suelta, solo título), la del primer segmento.
    static func modalidadPrincipal(bloques: [WorkoutBlock], segmentos: [WorkoutSegment]) -> String? {
        if let principal = WorkoutPlan.principalBlock(bloques) {
            return LecturaEjercicioPrevia.modalidad(de: principal)
        }
        return segmentos.first?.kind.modality
    }

    /// La palabra en español. Cubre los dos vocabularios que puede traer la modalidad: los de
    /// `PrescriptionModality` (del bloque principal) y los de `SegmentKind` (la reserva).
    static func palabraDeModalidad(_ modalidad: String?) -> String {
        switch modalidad {
        case "run":                return "Carrera"
        case "row", "ski", "bike": return "Ergómetro"
        case "strength":           return "Fuerza"
        case "functional":         return "Funcional"
        case "core", "mobility":   return "Movilidad"
        default:                   return "Sesión"
        }
    }
}
