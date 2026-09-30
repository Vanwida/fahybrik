import SwiftUI

// ExecutedWorkoutView — the READ-ONLY post-workout detail for a FINISHED session.
//
// Closes the athlete loop: tapping a done session (prescribed OR free) opens what
// they actually logged — tiempo / score / RPE / per-segment splits — instead of
// the active-workout brief. It is server-backed (the extended assignment-detail
// endpoint now ships `execution` + per-segment actuals), NOT rebuilt from the live
// in-memory WorkoutSession, so it works for ANY done day, including device-synced
// ones the athlete never ran through the timer.
//
// Deliberately SEPARATE from the live PostWorkoutSummaryView: that view is an
// input form (RPE picker, manual fields, GUARDAR) tied to the save path. Keeping
// the read-only display apart means the active-workout / timer / gate paths are
// untouched — zero regression risk to the prescribed and free-workout flows.
struct ExecutedWorkoutView: View {
    let assignmentId: String
    let fallbackTitle: String?
    let bearer: String?
    /// Las zonas de pulso del atleta. Solo las usa la lectura de una carrera, para
    /// teñir el lienzo con el pulso medio y para nombrar una banda de pulso. Nil =
    /// el atleta no tiene zonas medidas, y entonces no se pinta color ninguno: el
    /// color es dato y no se inventa.
    var hrZones: HRZoneProfile? = nil
    let onClose: () -> Void
    /// Fired when the detail fetch reports the assignment no longer resolves
    /// (HTTP 404): the id the app held is STALE — the plan changed server-side —
    /// so the presenter re-syncs to the authoritative plan (re-pulls /plan/week)
    /// and the day resolves to its current `wa.id` on the next open. Optional so
    /// existing call sites that don't yet re-sync compile unchanged.
    var onStale: (() -> Void)? = nil

    @State private var detail: AssignmentDetail?
    /// Índice de técnica de la sesión (el mismo que abre el plan): vídeo,
    /// consejos, descripción y nota del coach, ejercicio a ejercicio.
    @State private var showTechnique = false
    @State private var loadFailed = false
    /// The CONCRETE cause behind `loadFailed` (HTTP status / decode error / network),
    /// shown under the headline and logged — so a real failure is never anonymous.
    @State private var failureReason: String?
    @State private var showCapture = false

    // Retry budget for the detail fetch. A serverless cold start (the demo's known
    // cause) or a brief network blip produces a one-off failure on this screen, so
    // we retry a couple of times with a short, growing backoff BEFORE ever showing
    // the error state. Deterministic failures (4xx, decode) are NOT retried — a
    // re-fetch can't fix them and would only delay surfacing the real reason.
    private static let maxFetchAttempts = 3
    private static let retryBackoff: [Duration] = [.milliseconds(400), .milliseconds(900)]

    /// LA CARRERA QUE HAY EN ESTE DETALLE, si la hay.
    ///
    /// Una carrera terminada no se lee como se lee una sesión de hierro, y por eso
    /// tiene pantalla propia (`LecturaDeCarreraView`): la pregunta que trae el
    /// atleta no es «¿qué números salieron?» sino «¿hice lo que me pidieron?», y
    /// esa la contesta el veredicto que el servidor ya juzgó. Nil = esto no es una
    /// carrera, y entonces manda la lectura genérica de siempre.
    ///
    /// Se guarda en estado y no se recalcula en cada `body`: decodificarla recorre
    /// los tramos, los kilómetros y hasta 600 puntos de cada señal, y SwiftUI
    /// reevalúa el cuerpo muchas más veces de las que cambia el detalle.
    @State private var lecturaDeCarrera: Carrera?

    /// LA SESIÓN QUE HAY EN ESTE DETALLE, cuando NO es una carrera (card 124).
    ///
    /// Sustituye a `generico` en cuanto hay un detalle cargado: la cabecera con
    /// su icono de tipo, los totales, la gráfica de pulso, el mapa y el
    /// desglose bloque a bloque son justo lo que `generico` iba construyendo a
    /// mano, sección a sección — esto es la versión con contrato firmado
    /// (`docs/CONTRATO-UI.md`, card 124). Nil mientras no hay ejecución que leer
    /// (cargando, o falló): en esos dos casos `generico` sigue mostrando su
    /// estado de siempre.
    @State private var lecturaDeSesion: SesionEjecutada?

    var body: some View {
        Group {
            if let carrera = lecturaDeCarrera {
                // La lectura trae su propio cromo (título y día) y su propia
                // salida anclada, así que ocupa la pantalla entera: dos barras
                // superiores y dos formas de cerrar competirían entre ellas.
                LecturaDeCarreraView(carrera: carrera, zonas: hrZones, onCerrar: onClose)
            } else if let sesion = lecturaDeSesion {
                LecturaDeSesionView(sesion: sesion, zonas: hrZones, onCerrar: onClose)
            } else {
                generico
            }
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .onChange(of: detail, initial: true) { _, nuevo in
            lecturaDeCarrera = nuevo.flatMap {
                LecturaDeCarreraDesdeDetalle.carrera(
                    de: $0, zonas: hrZones, tituloAlternativo: fallbackTitle
                )
            }
            lecturaDeSesion = lecturaDeCarrera != nil ? nil : nuevo.flatMap {
                LecturaDeSesionDesdeDetalle.sesion(de: $0, tituloAlternativo: fallbackTitle)
            }
        }
        .task { await load() }
        .sheet(isPresented: $showTechnique) {
            SessionExercisesSheet(
                assignmentId: assignmentId,
                sessionTitle: detail?.workout?.name ?? fallbackTitle ?? "Entreno",
                bearer: bearer
            )
        }
        .fullScreenCover(isPresented: $showCapture) {
            WorkoutCaptureView(
                assignmentId: assignmentId,
                sessionTitle: detail?.workout?.name ?? fallbackTitle,
                bearer: bearer,
                onClose: { showCapture = false },
                onSaved: {
                    showCapture = false
                    // Re-pull the detail so the just-confirmed result replaces what
                    // was shown (new splits / time / source).
                    Task { await reload() }
                }
            )
        }
    }

    /// LO QUE HAY MIENTRAS NO HAY LECTURA QUE PINTAR: cargando, error, o un día marcado como hecho al que
    /// nunca llegó una ejecución (un hecho sin nada medido). Las lecturas traen su propio cromo y su propia
    /// salida, así que este marco solo existe en estos tres estados. Antes era un detalle entero de tarjetas
    /// (totales, zonas, mapa, desglose, registro) que, sin ejecución, no tenía nada que pintar: lo medido lo
    /// lee `LecturaDeSesionView`, que sustituye a este marco en cuanto hay ejecución.
    private var generico: some View {
        MarcoDeLoHecho(titulo: titulo, etiqueta: detail == nil ? nil : "Entreno · hecho", alCerrar: onClose,
                       centrado: detail == nil && loadFailed) {
            if detail != nil {
                sinEjecucion
            } else if loadFailed {
                SujetoEstadoDeLoHecho.error(
                    kicker: "Entreno hecho", titulo: "No pudimos cargar tu entreno",
                    apoyo: failureReason ?? "Revisa tu conexión e inténtalo de nuevo.",
                    alReintentar: {
                        loadFailed = false
                        failureReason = nil
                        Task { await load() }
                    })
            } else {
                EsqueletoDeLoHecho()
            }
        }
    }

    private var titulo: String { detail?.workout?.name ?? fallbackTitle ?? "Entreno" }

    // MARK: - Un hecho sin nada medido

    /// El sujeto es el hecho («Completado») y debajo lo que sí se puede hacer con él: repasar la técnica de
    /// los ejercicios y completar el resultado con una captura de otra app.
    private var sinEjecucion: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SujetoDia(tono: .ok, etiqueta: "Completado") {
                KickerDia("Hecho")
                TituloDia("Completado")
            }
            .fixedSize(horizontal: false, vertical: true)
            if hasExercises {
                entrada(
                    glifo: .video, titulo: "Ver la técnica de los ejercicios",
                    apoyo: "Vídeo, consejos y la nota de tu coach.",
                    pista: "Abre los ejercicios de la sesión para repasar cómo se hacen"
                ) { showTechnique = true }
            }
            entrada(
                glifo: .camara, titulo: "Subir captura de otra app",
                apoyo: "Garmin, Strava, Concept2… la leemos por ti.",
                pista: "Sube una captura y la IA rellena el resultado"
            ) { showCapture = true }
        }
    }

    /// ¿Tiene esta sesión ejercicios que enseñar? Sin ellos (día de descanso, sesión sin detalle) no se
    /// ofrece la entrada: llevaría a una ficha vacía. La técnica abre el MISMO índice que el plan
    /// (`SessionExercisesSheet`), no una pantalla nueva.
    private var hasExercises: Bool {
        (detail?.workout?.blocks ?? []).contains { !$0.items.isEmpty }
    }

    /// Una fila de acción: ficha con glifo, qué hace y qué se obtiene. La captura se ofrece aquí porque es
    /// donde se corrige o completa con los números reales del dispositivo un hecho ya registrado.
    private func entrada(
        glifo: GlifoDia, titulo: String, apoyo: String, pista: String, alTocar: @escaping () -> Void
    ) -> some View {
        Button {
            Haptics.light()
            alTocar()
        } label: {
            HStack(spacing: Theme.Spacing.m) {
                FichaDia(glifo)
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(titulo).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                    Text(apoyo).papel(.nota).foregroundStyle(Theme.Color.muted)
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                IconoDia(.chevron, tam: 15, peso: .bold).foregroundStyle(Theme.Color.muted)
            }
            .padding(Theme.Spacing.m)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque, alignment: .leading)
            .tarjetaDia()
            .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityHint(pista)
    }

    // MARK: - Data load (cache-first, then network)
    private func load() async {
        if detail != nil { return }
        // Accept ANY cached copy for an instant paint, then refresh from the
        // network below. The previous `cached.execution != nil` gate made this
        // view the ONLY surface that rejected a cache the brief/list accept — so
        // when the cache was written pre-completion (execution == nil) a transient
        // network failure dropped straight to "No pudimos cargar tu entreno" while
        // the SAME day still opened elsewhere. The view renders fine without an
        // execution (header shows "Completado"); the refresh fills the numbers.
        if let cached = AssignmentDetailCache.load(assignmentId) {
            detail = cached
        }
        guard let bearer else {
            if detail == nil { fail(reason: "Sin sesión.") }
            return
        }

        // Retry the fetch a couple of times on a TRANSIENT failure (network blip /
        // serverless cold start) before giving up — these blips are the known cause
        // of the spurious "No pudimos cargar" on a workout that loads fine on a
        // second tap. A deterministic failure (4xx, decode) breaks out immediately
        // so its real reason surfaces without delay.
        var lastError: Error?
        for attempt in 0..<Self.maxFetchAttempts {
            do {
                let fetched = try await PlanService.fetchAssignmentDetail(assignmentId, bearer: bearer)
                AssignmentDetailCache.save(fetched)
                detail = fetched
                loadFailed = false
                failureReason = nil
                return
            } catch {
                lastError = error
                guard Self.isTransient(error), attempt < Self.maxFetchAttempts - 1 else { break }
                try? await Task.sleep(for: Self.retryBackoff[min(attempt, Self.retryBackoff.count - 1)])
            }
        }

        // Exhausted the budget (or hit a deterministic failure). Keep any cached
        // detail painted — only drop to the error state when there's nothing to
        // show — and surface + log the concrete reason instead of a blank message.
        if let lastError {
            // AUDIT-B6 — the concrete reason surfaces in the UI (failureReason below);
            // no console print (was DEBUG-only, removed per the no-print rule).
            // STALE ID (404): the assignment no longer resolves — the plan moved
            // server-side, so the id carried from the week payload is dead. Drop
            // its cached body and ask the presenter to re-sync to the authoritative
            // plan (/plan/week) so the day resolves to its CURRENT wa.id on re-open.
            // This is the honest recovery for a shifted id — never a dead-end on a
            // raw "HTTP 404".
            if case APIError.http(404, _) = lastError {
                AssignmentDetailCache.remove(assignmentId)
                onStale?()
            }
            if detail == nil { fail(reason: Self.describe(lastError)) }
        }
    }

    /// Set the error state with its concrete reason in one place (DRY).
    private func fail(reason: String) {
        failureReason = reason
        loadFailed = true
    }

    // Force a refresh after a capture-confirm (the `load()` short-circuit on a
    // present detail would otherwise keep the stale copy). Best-effort: a network
    // failure leaves the prior detail on screen rather than wiping it.
    private func reload() async {
        guard let bearer else { return }
        if let fetched = try? await PlanService.fetchAssignmentDetail(assignmentId, bearer: bearer) {
            AssignmentDetailCache.save(fetched)
            detail = fetched
        }
    }

    // MARK: - Failure classification

    /// Is this a TRANSIENT blip worth retrying (network drop / serverless cold
    /// start → 5xx / unexpected non-HTTP response), versus a DETERMINISTIC failure
    /// (4xx, undecodable body) a re-fetch can't fix? Only the former is retried.
    private static func isTransient(_ error: Error) -> Bool {
        switch error {
        case let APIError.http(status, _): return status >= 500
        case APIError.invalidResponse:     return true
        case APIError.offline:             return true
        case is URLError:                  return true
        default:                           return false
        }
    }

    /// Compact, readable reason for the failure — shown under the headline and
    /// logged. Mirrors the APIError→copy mapping used at the auth surfaces so the
    /// concrete cause is never swallowed into an anonymous "No pudimos cargar".
    private static func describe(_ error: Error) -> String {
        switch error {
        // 404 = the assignment no longer resolves (the plan moved server-side and
        // the id is stale). Athlete-facing + actionable: we've re-synced the plan
        // (onStale), so closing and re-opening the day finds its current session.
        case APIError.http(404, _):         return "Esta sesión ya no está en tu plan. Lo hemos actualizado — cierra y vuelve a abrirla."
        case let APIError.http(status, _):  return "Error del servidor (\(status)). Inténtalo de nuevo."
        case let APIError.decoding(inner):  return "decode: \(decodeReason(inner))"
        case APIError.invalidResponse:      return "respuesta no válida del servidor"
        case APIError.offline:              return "sin conexión"
        case let urlError as URLError:      return "red: \(urlError.localizedDescription)"
        default:                            return error.localizedDescription
        }
    }

    /// Pull the diagnostic essence out of a `DecodingError` (the field + path that
    /// failed) instead of its near-useless `localizedDescription`, so a real schema
    /// mismatch is identifiable from the error state / log.
    private static func decodeReason(_ error: Error) -> String {
        guard let dec = error as? DecodingError else { return error.localizedDescription }
        let path: (DecodingError.Context) -> String = { ctx in
            ctx.codingPath.map(\.stringValue).joined(separator: ".")
        }
        switch dec {
        case let .keyNotFound(key, ctx):  return "falta '\(key.stringValue)' (\(path(ctx)))"
        case let .typeMismatch(_, ctx):   return "tipo en \(path(ctx)): \(ctx.debugDescription)"
        case let .valueNotFound(_, ctx):  return "nulo en \(path(ctx))"
        case let .dataCorrupted(ctx):     return ctx.debugDescription
        @unknown default:                 return dec.localizedDescription
        }
    }
}
