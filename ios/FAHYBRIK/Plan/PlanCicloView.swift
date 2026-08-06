import SwiftUI

// EL BLOQUE — de dónde vienes y qué viene después.
//
// POR QUÉ EXISTE (docs/DECISIONS.md, 6-ago-2026)
// ----------------------------------------------
// El pie de la pestaña Plan necesitaba un destino real: un botón que no lleva a
// ningún sitio es peor que no tener botón. Y el dato que hacía falta ya se pedía
// —`GET /api/athlete/macro-progress`— y no lo pintaba nadie.
//
// LO QUE ESTA PANTALLA NO HACE, Y ES DELIBERADO
// ---------------------------------------------
// No dibuja una rampa de volumen previsto. Lo planificado se pinta con seguridad
// (qué semanas hay, qué se cumplió); lo MEDIDO del futuro no existe todavía, y
// una curva de carga para dentro de tres semanas afirma cuánto va a entrenar
// alguien que aún no ha entrenado (contrato §7).
//
// Y no emite ningún VEREDICTO sobre el cumplimiento. Dónde está el listón de una
// semana buena es MÉTODO del coach, no mecanismo nuestro (HARD RULE Nº0): aquí se
// enseña el porcentaje real y una barra neutra, nunca un verde/rojo que fije un
// umbral que ningún coach ha elegido.
struct PlanCicloView: View {
    let bearer: String?
    /// El nombre que el coach le puso al bloque. Llega ya resuelto desde el Plan:
    /// es el mismo microciclo publicado, y pedirlo dos veces sería otra fuente.
    let nombreBloque: String?
    let posicion: PosicionEnBloque?
    /// True cuando existe una semana siguiente ya publicada.
    let hayProximaSemana: Bool
    let onClose: () -> Void

    @Environment(AppDataStore.self) private var store

    @State private var cargando = true
    @State private var falloDeCarga = false
    /// La semana que viene, pedida directamente: es una navegación hacia delante,
    /// no una porción compartida entre pestañas.
    @State private var proxima: AthleteWeekPayload? = nil
    @State private var proximaEnCurso = false
    @State private var proximaFallo = false

    private var progreso: AthleteMacroProgressPayload? {
        store.macroProgress.value?.macroProgress
    }
    private var semanas: [AthleteMacroProgressWeek] { progreso?.weeks ?? [] }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                contenido
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cerrar") { Haptics.light(); onClose() }
                        .foregroundStyle(Theme.Color.accentText)
                        .accessibilityLabel("Cerrar")
                }
            }
        }
        .task { await cargar() }
    }

    // MARK: - Los cuatro estados (§5)

    @ViewBuilder
    private var contenido: some View {
        if cargando, semanas.isEmpty {
            esqueleto
        } else if falloDeCarga, semanas.isEmpty {
            CenteredScreen {
                RedesignEmptyState(
                    symbol: "wifi.exclamationmark",
                    title: "No pudimos cargar tu bloque",
                    message: "Revisa tu conexión e inténtalo de nuevo.",
                    exit: .action(title: "Reintentar") {
                        Haptics.light()
                        cargando = true
                        Task { await cargar(force: true) }
                    }
                )
            }
        } else if semanas.isEmpty {
            CenteredScreen {
                RedesignEmptyState(
                    symbol: "square.stack.3d.up",
                    title: "Tu bloque empieza cuando empieza tu plan",
                    message: "Aquí verás cada semana del bloque y qué cumpliste en ella.",
                    exit: .explained(note: "En cuanto tu coach publique la primera semana aparece aquí.")
                )
            }
        } else {
            lista
        }
    }

    private var lista: some View {
        FillingScreen {
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                cabecera
                seccionSemanas
                if hayProximaSemana { seccionProxima }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .refreshable { await cargar(force: true) }
    }

    // MARK: - Dónde estás

    private var cabecera: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            LabelText(text: "El bloque", color: Theme.Color.accentText, size: 11)
            if let nombreBloque {
                Text(nombreBloque)
                    .scaledFont(26, weight: .heavy, relativeTo: .title, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let posicion {
                Text(posicion.texto)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                barraDePosicion(posicion)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Dónde vas dentro del bloque. Es POSICIÓN, no carga: mide semanas, que es
    /// lo único que se sabe de un bloque sin haberlo entrenado.
    private func barraDePosicion(_ posicion: PosicionEnBloque) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Color.hairlineStrong)
                Capsule()
                    .fill(Theme.Color.accent)
                    .frame(width: max(4, geo.size.width * posicion.fraccion))
            }
        }
        .frame(height: 6)
        .padding(.top, 2)
        .accessibilityHidden(true)
    }

    // MARK: - Semana a semana

    private var seccionSemanas: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "Semana a semana")
            Text("Cada semana con entrenos asignados y qué parte cerraste.")
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.faint)
                .fixedSize(horizontal: false, vertical: true)
            VStack(spacing: 0) {
                ForEach(Array(semanas.enumerated()), id: \.element.id) { indice, semana in
                    FilaSemanaDelCiclo(semana: semana, numero: indice + 1)
                    if semana.id != semanas.last?.id { Hairline() }
                }
            }
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairline, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
    }

    // MARK: - Lo que viene

    private var seccionProxima: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SectionLabel(text: "La próxima semana")
            if proximaEnCurso {
                VStack(spacing: Theme.Spacing.s) {
                    SkeletonBar(height: 18)
                    SkeletonBar(height: 18)
                }
                .accessibilityLabel("Cargando la próxima semana")
            } else if proximaFallo {
                Text("No pudimos cargar la próxima semana. Desliza para reintentarlo.")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let dias = diasConSesionDeLaProxima, !dias.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(dias, id: \.isoDate) { dia in
                        FilaDiaProximo(dia: dia)
                    }
                }
            } else {
                Text("Tu coach aún no la ha publicado.")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.faint)
            }
        }
    }

    private var diasConSesionDeLaProxima: [DiaDelPlan]? {
        guard let proxima else { return nil }
        // Se reutiliza la MISMA lectura de la semana que pinta el Plan, pasando la
        // semana siguiente: así los dos sitios cuentan los días igual.
        let dias = proxima.days.map { day -> DiaDelPlan in
            let reales = day.sessions.filter { !$0.assignmentId.isEmpty }
            return DiaDelPlan(
                isoDate: day.isoDate,
                diaSemana: day.dayOfWeek,
                inicial: "",
                nombre: SemanaDelPlan.nombreDeDia(day.dayOfWeek),
                numero: SemanaDelPlan.diaDelMesDe(day.isoDate),
                sesiones: reales,
                estado: reales.isEmpty ? .descanso : .pendiente,
                esHoy: false
            )
        }
        return dias.filter { !$0.sesiones.isEmpty }
    }

    // MARK: - Cargando

    private var esqueleto: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            SkeletonBar(width: 90, height: 12)
            SkeletonBar(width: 200, height: 26)
            SkeletonBar(height: 6)
            ForEach(0..<4, id: \.self) { _ in
                SkeletonBar(height: 44, radius: Theme.Radius.m)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.l)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tu bloque")
    }

    // MARK: - Carga

    private func cargar(force: Bool = false) async {
        // El progreso vive en el store (cache-first): si el Plan ya lo calentó,
        // esta pantalla abre pintada.
        await store.refreshMacroProgress(force: force)
        falloDeCarga = store.macroProgress.value == nil && !store.macroProgress.hasLoaded
        cargando = false

        guard hayProximaSemana, let bearer else { return }
        proximaEnCurso = proxima == nil
        do {
            proxima = try await PlanService.fetchWeek(bearer: bearer, weekOffset: 1).week
            proximaFallo = false
        } catch {
            proximaFallo = true
        }
        proximaEnCurso = false
    }
}

// MARK: - Una semana del ciclo

/// Una fila del historial semana a semana: qué semana fue, sus fechas, en qué
/// estado está y —cuando se sabe— qué parte se cerró.
///
/// El cumplimiento llega del servidor como FRACCIÓN 0…1 pese a llamarse «pct»
/// (shared/domain/coach/macro-progress.ts); lo escribe `Formato.porcentaje`, que
/// es donde vive esa conversión y su trampa. Nil cuando esa semana no tiene nada
/// asignado: ahí no hay porcentaje que dar, y un 0 % sería una acusación inventada.
struct FilaSemanaDelCiclo: View {
    let semana: AthleteMacroProgressWeek
    let numero: Int

    private var esActual: Bool { semana.status == "current" }
    private var esFutura: Bool { semana.status == "upcoming" }

    private var cumplimiento: String? { Formato.porcentaje(fraccion: semana.compliancePct) }

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text("Semana \(numero)")
                        .scaledFont(14, weight: esActual ? .heavy : .semibold, relativeTo: .subheadline)
                        .foregroundStyle(esActual ? Theme.Color.accentText : Theme.Color.foreground)
                    if esActual {
                        InfoPill(text: "En curso", acento: true)
                    } else if esFutura {
                        InfoPill(text: "Por venir")
                    }
                }
                if let rango = RangoDeSemana.texto(desde: semana.weekStart) {
                    MonoText(text: rango, size: 11, color: Theme.Color.faint, escala: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // El dato pesa más que su etiqueta (§4). Y una semana por venir no
            // tiene cumplimiento: no se pinta un cero que aún no ha pasado.
            if let cumplimiento, let fraccion = semana.compliancePct, !esFutura {
                VStack(alignment: .trailing, spacing: 3) {
                    MonoText(text: cumplimiento, size: 17, weight: .bold, escala: true)
                    barra(fraccion)
                }
                .frame(width: 78)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: 58)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(vozAccesible)
    }

    /// Barra NEUTRA a propósito: dónde está el listón de una semana buena lo
    /// decide el coach, no el software (HARD RULE Nº0).
    private func barra(_ fraccion: Double) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Color.hairlineStrong)
                Capsule()
                    .fill(Theme.Color.accent)
                    .frame(width: max(2, geo.size.width * min(1, max(0, fraccion))))
            }
        }
        .frame(height: 4)
    }

    private var vozAccesible: String {
        var partes = ["Semana \(numero)"]
        if let rango = RangoDeSemana.texto(desde: semana.weekStart) { partes.append(rango) }
        if esActual { partes.append("en curso") }
        if esFutura { partes.append("por venir") }
        if let f = semana.compliancePct, !esFutura {
            partes.append("\(Int((f * 100).rounded())) por ciento cumplido")
        }
        return partes.joined(separator: ", ")
    }
}

// MARK: - Un día de la semana que viene

struct FilaDiaProximo: View {
    let dia: DiaDelPlan

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Text("\(dia.nombre) \(dia.numero)")
                .scaledFont(12, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .frame(width: 96, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                ForEach(dia.sesiones) { session in
                    HStack(spacing: 7) {
                        ModalityDot(modality: session.modality, size: 6)
                        Text(session.title)
                            .scaledFont(13, weight: .medium, relativeTo: .footnote)
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(dia.nombre) \(dia.numero), \(dia.sesiones.map(\.title).joined(separator: ", "))")
    }
}

// MARK: - Las fechas de una semana

/// «21–27 jul» · «28 jul – 3 ago» — el tramo de una semana desde su lunes. Vive
/// aparte porque lo escriben el ciclo y cualquier otra superficie que liste
/// semanas: una segunda grafía del mismo rango es como nacen los duplicados (§2).
enum RangoDeSemana {
    static func texto(desde weekStartIso: String) -> String? {
        guard let inicio = FechaES.fecha(weekStartIso),
              let fin = Calendar(identifier: .gregorian).date(byAdding: .day, value: 6, to: inicio),
              let inicioCorto = FechaES.corta(weekStartIso)
        else { return nil }
        let cal = Calendar(identifier: .gregorian)
        let mesIgual = cal.component(.month, from: inicio) == cal.component(.month, from: fin)
        let diaFin = cal.component(.day, from: fin)
        if mesIgual {
            // «21–27 jul»: el mes se escribe una vez.
            let mes = inicioCorto.split(separator: " ").last.map(String.init) ?? ""
            let diaInicio = cal.component(.day, from: inicio)
            return "\(diaInicio)–\(diaFin) \(mes)"
        }
        let finCorto = FechaES.corta(FechaES.iso(fin)) ?? "\(diaFin)"
        return "\(inicioCorto) – \(finCorto)"
    }
}
