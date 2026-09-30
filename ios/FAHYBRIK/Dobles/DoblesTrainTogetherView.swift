import SwiftUI

// Dobles · entrenar a la vez / opcional. LA MISMA sesión con la carga de cada uno — cada columna resuelta sobre
// el 1RM de ese atleta — y las acciones «hacerla juntos» / «por mi cuenta». Los dos resultados quedan visibles
// para los dos atletas y para el coach.
//
// Piel de «El día»: cabecera fija con su ‹ (la pantalla se empuja desde la semana conectada), tarjetas de
// `caraDobles` y la acción anclada abajo, donde el pulgar la espera. El atleta es el acento del club y la
// pareja el azul de `Theme.Color.partner`; la acción principal es la pastilla de tinta invertida, no un naranja.
//
// Se compone con los átomos de Dobles (`DoblesPiezas`: avatar, cara, nota, acción).
//
// Datos: `DoblesService.fetchTrainTogether` llama a GET /api/athlete/dobles/session/{id}, que resuelve cada
// línea «% RM» sobre el 1RM de CADA atleta y devuelve las cargas de los dos. Sin id de sesión, sin pareja o sin
// asignación el servicio devuelve nil y se enseña un vacío honesto: JAMÁS se inventan las cargas. La tabla
// doble solo se pinta con datos resueltos por el servidor.
struct DoblesTrainTogetherView: View {
    /// La sesión a cargar (nil pinta el vacío).
    var sessionId: String? = nil
    var bearer: String? = nil

    @Environment(\.dismiss) private var dismiss

    @State private var session: DoblesTrainTogetherSession? = nil
    @State private var partner: PartnerInfo? = nil
    @State private var loading = true
    // Los dos lanzadores del registro recorren el MISMO flujo de entreno (resumen → en curso → cierre) con
    // `WorkoutContainer`, para la asignación de ESTE atleta (`sessionId`). «Hacerla juntos» registra contra el
    // endpoint conjunto (enlaza a la pareja y comparte); «Por mi cuenta», por el camino normal en solitario.
    // No hay una pantalla de registro paralela.
    @State private var showJointWorkout = false
    @State private var showSoloWorkout = false

    private var selfName: String { session?.selfName ?? "Yo" }
    private var partnerName: String { session?.partnerName ?? partner?.firstName ?? "Compañero" }

    var body: some View {
        VStack(spacing: 0) {
            CabeceraDobles(
                kicker: "Podéis hacerla juntos o cada uno",
                titulo: session?.title ?? "Entrenar a la vez",
                apoyo: session?.subtitle.flatMap { $0.isEmpty ? nil : $0 },
                salida: .volver,
                alSalir: { dismiss() }
            )
            contenido
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .fullScreenCover(isPresented: $showJointWorkout) {
            if let sessionId {
                WorkoutContainer(
                    assignmentId: sessionId,
                    fallbackTitle: session?.title,
                    bearer: bearer,
                    logTarget: .doublesJoint,
                    onClose: { showJointWorkout = false },
                    onCompleted: { _ in showJointWorkout = false }
                )
            }
        }
        .fullScreenCover(isPresented: $showSoloWorkout) {
            if let sessionId {
                WorkoutContainer(
                    assignmentId: sessionId,
                    fallbackTitle: session?.title,
                    bearer: bearer,
                    logTarget: .solo,
                    onClose: { showSoloWorkout = false },
                    onCompleted: { _ in showSoloWorkout = false }
                )
            }
        }
        .task(id: bearer) { await reload() }
    }

    // MARK: - Contenido por estado

    @ViewBuilder
    private var contenido: some View {
        if loading {
            ScrollView {
                DoblesTrainTogetherEsqueleto()
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.bottom, Theme.Spacing.xxl)
            }
            .scrollDisabled(true)
        } else if let session {
            ScrollView {
                DoblesTrainTogetherCuerpo(
                    session: session,
                    selfName: selfName,
                    partnerName: partnerName,
                    partnerInitials: partner?.initials ?? "·"
                )
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.top, Theme.Spacing.s)
                .padding(.bottom, Theme.Spacing.l)
            }
            .scrollBounceBehavior(.basedOnSize)
            // Las dos salidas son la puerta de la pantalla: siempre en el mismo sitio. Ambas lanzan el flujo
            // real de entreno de ESTA asignación y solo cambia el envío final. Sin sesión resoluble, apagadas.
            .anchoredAction {
                DoblesTrainTogetherAcciones(
                    puedeJuntos: !session.isSelfOnly,
                    habilitadas: sessionId != nil,
                    alJuntos: { showJointWorkout = true },
                    alSolo: { showSoloWorkout = true }
                )
            }
        } else {
            CenteredScreen {
                EmptyView()
            } lead: {
                EmptyView()
            } content: {
                sinSesion
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.vertical, Theme.Spacing.l)
            }
        }
    }

    @ViewBuilder
    private var sinSesion: some View {
        if partner == nil {
            DoblesNoPartnerState(
                message: "Con un compañero conectado veréis aquí la carga de cada uno en la misma sesión, resuelta sobre vuestro propio 1RM.",
                bearer: bearer,
                onInvited: { Task { await reload() } }
            )
        } else {
            RedesignEmptyState(
                symbol: "figure.strengthtraining.traditional",
                title: "Sin sesión conjunta",
                message: "Cuando tu coach programe una sesión que podéis hacer juntos verás aquí la carga de cada uno, resuelta sobre vuestro propio 1RM.",
                exit: .explained(note: "La programa tu coach. Aparece aquí en cuanto la publique.")
            )
        }
    }

    /// El vínculo de pareja + la sesión resuelta por atleta. Se repite tras una invitación para que una pareja
    /// recién emparejada deje de ver el estado sin pareja.
    private func reload() async {
        loading = true
        if let bearer {
            partner = try? await PartnerService.fetchPartner(bearer: bearer)
        }
        session = await DoblesService.fetchTrainTogether(sessionId: sessionId, bearer: bearer)
        loading = false
    }
}

// MARK: - El cuerpo con la sesión

/// Lo que hay bajo la cabecera con la sesión resuelta: el 1RM de cada uno, la tabla de cargas y la nota de que
/// los resultados se comparten. Solo dibuja.
struct DoblesTrainTogetherCuerpo: View {
    let session: DoblesTrainTogetherSession
    let selfName: String
    let partnerName: String
    let partnerInitials: String

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            // La referencia 1RM de cada atleta.
            if session.selfOneRm != nil || session.partnerOneRm != nil {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: Theme.Spacing.m) { chips }
                    VStack(spacing: Theme.Spacing.m) { chips }
                }
            }

            if session.exercises.isEmpty {
                RedesignEmptyState(
                    symbol: "list.bullet.rectangle",
                    title: "Sin ejercicios",
                    message: "Esta sesión aún no tiene ejercicios prescritos.",
                    exit: .explained(note: "Los añade tu coach al detallar la sesión.")
                )
                .padding(.vertical, Theme.Spacing.l)
            } else {
                DoblesCargaTabla(rows: session.exercises, selfName: selfName, partnerName: partnerName)
            }

            DoblesNota(
                simbolo: "chart.bar.xaxis",
                texto: "Cuando termináis, los dos resultados quedan visibles para ambos y para el coach"
            )
        }
    }

    @ViewBuilder
    private var chips: some View {
        chip(nombre: selfName, ref: session.selfOneRm, color: Theme.Color.accent, cara: .acento, iniciales: "Yo")
        chip(nombre: partnerName, ref: session.partnerOneRm, color: Theme.Color.partner, cara: .pareja, iniciales: partnerInitials)
    }

    private func chip(nombre: String, ref: String?, color: SwiftUI.Color, cara: CaraDobles, iniciales: String) -> some View {
        HStack(spacing: Theme.Spacing.m) {
            DoblesAthleteAvatar(initials: iniciales, color: color, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(nombre)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                // Sin 1RM registrado se dice, y así el chip explica por qué la columna de ese atleta viene sin
                // carga.
                if let ref {
                    Text(ref)
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text("sin 1RM")
                        .papel(.nota)
                        .foregroundStyle(Theme.Color.foreground)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .caraDobles(cara, radio: Theme.Radius.fila)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(nombre), \(ref ?? "sin 1RM registrado")")
    }
}

// MARK: - La tabla de cargas

/// La tabla de dos cargas: cada ejercicio con su S×R y, en dos columnas, la carga de cada atleta resuelta sobre
/// SU 1RM. Con el texto del sistema en tamaños de accesibilidad las columnas no caben: cada ejercicio pasa a una
/// tarjeta con las dos cargas debajo, una por línea.
struct DoblesCargaTabla: View {
    let rows: [DoblesExerciseRow]
    let selfName: String
    let partnerName: String

    @Environment(\.dynamicTypeSize) private var tamanoDeTexto

    /// Ancho de cada columna de carga: cabe «80% · 100kg» sin partirlo en dos líneas a tamaño normal.
    private static var columna: CGFloat { 92 }

    var body: some View {
        if tamanoDeTexto.isAccessibilitySize {
            VStack(spacing: Theme.Spacing.m) {
                ForEach(rows) { row in filaApilada(row) }
            }
        } else {
            tabla
        }
    }

    private var tabla: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                Text("Ejercicio · S×R")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .foregroundStyle(Theme.Color.muted)
                Text(selfName)
                    .frame(width: Self.columna, alignment: .leading)
                    .foregroundStyle(Theme.Color.accentText)
                Text(partnerName)
                    .frame(width: Self.columna, alignment: .leading)
                    .foregroundStyle(Theme.Color.partner)
            }
            .papel(.rotulo)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .background(Theme.Color.surfaceSunken)

            ForEach(rows) { row in
                Hairline()
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.exercise)
                            .papel(.cuerpoFuerte)
                            .foregroundStyle(Theme.Color.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                        if let sr = row.setsReps, !sr.isEmpty {
                            Text(sr)
                                .papel(.nota)
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // La carga se resuelve sobre el 1RM de cada uno: quien no lo tiene registrado no tiene
                    // carga, y eso se DICE — nombra la causa y con ella el acto que la arregla (§6.2 bis).
                    celdaDeCarga(row.selfLoad).frame(width: Self.columna, alignment: .leading)
                    celdaDeCarga(row.partnerLoad).frame(width: Self.columna, alignment: .leading)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.m)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(filaAccesible(row))
            }
        }
        .caraDobles(.neutra, radio: Theme.Radius.fila)
    }

    /// Un ejercicio como tarjeta: su nombre y S×R y debajo la carga de cada uno con su nombre delante.
    private func filaApilada(_ row: DoblesExerciseRow) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(row.exercise)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
            if let sr = row.setsReps, !sr.isEmpty {
                Text(sr).papel(.nota).foregroundStyle(Theme.Color.muted)
            }
            cargaConNombre(selfName, row.selfLoad, color: Theme.Color.accentText)
            cargaConNombre(partnerName, row.partnerLoad, color: Theme.Color.partner)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.l)
        .caraDobles(.neutra, radio: Theme.Radius.fila)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(filaAccesible(row))
    }

    private func cargaConNombre(_ nombre: String, _ carga: String?, color: SwiftUI.Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
            Text(nombre).papel(.rotulo).foregroundStyle(color)
            celdaDeCarga(carga)
        }
    }

    /// Una celda de carga. Con carga, la cifra; sin ella, la razón en voz de texto — una nota de ausencia no es
    /// una medida.
    @ViewBuilder
    private func celdaDeCarga(_ carga: String?) -> some View {
        if let carga {
            Text(carga)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            Text("sin 1RM")
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    /// VoiceOver lee la fila entera, y donde falta la carga dice por qué falta.
    private func filaAccesible(_ row: DoblesExerciseRow) -> String {
        var parts = [row.exercise]
        if let sr = row.setsReps, !sr.isEmpty { parts.append(sr) }
        parts.append("\(selfName) \(row.selfLoad ?? "sin 1RM")")
        parts.append("\(partnerName) \(row.partnerLoad ?? "sin 1RM")")
        return parts.joined(separator: ", ")
    }
}

// MARK: - Las dos salidas

/// «Hacerla juntos» (principal) y «Por mi cuenta» (secundaria). «Hacerla juntos» solo existe cuando la sesión se
/// puede compartir: una sesión `self_only` es privada, así que no se ofrece (y el servidor rechazaría un registro
/// conjunto con 409: es la red de seguridad).
struct DoblesTrainTogetherAcciones: View {
    let puedeJuntos: Bool
    let habilitadas: Bool
    let alJuntos: () -> Void
    let alSolo: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            if puedeJuntos {
                AccionDobles(titulo: "Hacerla juntos", simbolo: "play.fill", habilitada: habilitadas, alTocar: alJuntos)
            }
            AccionDobles(
                titulo: "Por mi cuenta",
                estilo: puedeJuntos ? .secundaria : .principal,
                habilitada: habilitadas,
                alTocar: alSolo
            )
        }
    }
}

// MARK: - El esqueleto

/// La sesión conjunta mientras llega: la misma silueta que lo que la sustituye (los dos 1RM, la tabla y la nota).
struct DoblesTrainTogetherEsqueleto: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            HStack(spacing: Theme.Spacing.m) {
                SkeletonBar(height: 64, radius: Theme.Radius.fila)
                SkeletonBar(height: 64, radius: Theme.Radius.fila)
            }
            VStack(spacing: Theme.Spacing.s) {
                SkeletonBar(height: 40, radius: Theme.Radius.fila)
                ForEach(0..<4, id: \.self) { _ in
                    SkeletonBar(height: 56, radius: Theme.Radius.fila)
                }
            }
            SkeletonBar(height: 64, radius: Theme.Radius.fila)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando la sesión conjunta")
    }
}
