import SwiftUI

// LA SEMANA QUE VIENE — vista previa de solo lectura.
//
// POR QUÉ EXISTE (Alex, 7-ago-2026)
// ----------------------------------
// El héroe de Plan vive centrado en HOY, y el Historial mira hacia ATRÁS. Entre
// los dos no había ningún sitio para ojear una semana que el coach YA publicó
// pero todavía no ha llegado — justo lo que Alex echó en falta al probar la
// fusión. Esta pantalla es esa vista: de solo lectura (no se mueve ni se marca
// nada de una semana que no ha empezado), pero con sus títulos reales, no un
// resumen de una frase.
//
// Solo aparece cuando `AthleteWeekPayload.hasNextWeek` es cierto — el botón que
// la abre vive en `PlanView.cabeceraDeNavegacion` y se oculta sin eso (§7: no se
// ofrece una salida a un sitio que no existe).
struct PlanProximaSemanaView: View {
    let bearer: String?
    let onClose: () -> Void
    /// Tocar una sesión cierra esta vista y abre esa sesión — el mismo destino
    /// que cualquier sesión de hoy. `PlanView` decide qué pantalla es (previa o
    /// detalle hecho); esta vista no navega por sí misma.
    let onAbrir: (AthleteWeekDaySession) -> Void

    @State private var semana: SemanaDelPlan? = nil
    @State private var cargando = true
    @State private var falloDeCarga = false

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
        if cargando, semana == nil {
            esqueleto
        } else if falloDeCarga, semana == nil {
            CenteredScreen {
                RedesignEmptyState(
                    symbol: "wifi.exclamationmark",
                    title: "No pudimos cargar la semana que viene",
                    message: "Revisa tu conexión e inténtalo de nuevo.",
                    exit: .action(title: "Reintentar") {
                        Haptics.light()
                        cargando = true
                        Task { await cargar() }
                    }
                )
            }
        } else if let semana, semana.tieneAlgunaSesion {
            lista(semana)
        } else {
            // Llegar aquí con el botón oculto por `hasNextWeek == false` no
            // debería pasar, pero un `false` que el servidor cambió entre la
            // carga de Plan y este toque es un hecho real, no un bug — se dice.
            CenteredScreen {
                RedesignEmptyState(
                    symbol: "calendar.badge.clock",
                    title: "Tu coach aún no ha publicado la semana que viene",
                    message: "En cuanto la publique la verás aquí.",
                    exit: .explained(note: "Las semanas se publican solas al cerrar la anterior.")
                )
            }
        }
    }

    // MARK: - La lista, semana entera

    private func lista(_ semana: SemanaDelPlan) -> some View {
        FillingScreen {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                cabecera(semana)
                VStack(spacing: 0) {
                    ForEach(semana.dias) { dia in
                        FilaDiaDeLaSemana(dia: dia, onAbrir: onAbrir)
                        if dia.id != semana.dias.last?.id { Hairline() }
                    }
                }
                .background(Theme.Color.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                        .stroke(Theme.Color.hairline, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.top, Theme.Spacing.s)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .refreshable { await cargar(force: true) }
    }

    private func cabecera(_ semana: SemanaDelPlan) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            LabelText(text: "La semana que viene", color: Theme.Color.accentText, size: 11)
            if let nombre = semana.nombreBloque {
                Text(nombre)
                    .scaledFont(22, weight: .heavy, relativeTo: .title2, italic: true)
                    .foregroundStyle(Theme.Color.foreground)
            }
            // La voz del coach, cuando la escribió para esa semana. El sistema
            // no la rellena si no existe.
            if let intencion = semana.intencion {
                Text(intencion)
                    .scaledFont(13, weight: .medium, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Cargando

    private var esqueleto: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            SkeletonBar(width: 170, height: 14)
            ForEach(0..<6, id: \.self) { _ in
                SkeletonBar(height: 46, radius: Theme.Radius.m)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.top, Theme.Spacing.l)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando la semana que viene")
    }

    // MARK: - Carga

    private func cargar(force: Bool = false) async {
        guard let bearer else {
            falloDeCarga = true
            cargando = false
            return
        }
        do {
            let resp = try await PlanService.fetchWeek(bearer: bearer, weekOffset: 1)
            semana = SemanaDelPlan.desde(resp)
            falloDeCarga = false
        } catch {
            if semana == nil { falloDeCarga = true }
        }
        cargando = false
    }
}

// MARK: - Un día de la semana que viene

/// Un día completo: su nombre, sus sesiones reales o «Descanso» cuando no hay
/// ninguna. A diferencia de `FilaDiaProximo` (que en `PlanCicloView` solo lista
/// los días CON sesión, para el hueco corto del pie de El bloque), aquí se ve la
/// semana ENTERA — es la pregunta que trae a esta pantalla.
struct FilaDiaDeLaSemana: View {
    let dia: DiaDelPlan
    let onAbrir: (AthleteWeekDaySession) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Text(String(dia.nombre.prefix(3)).uppercased())
                .scaledFont(11, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .frame(width: 36, alignment: .leading)
                .padding(.top, 13)

            if dia.sesiones.isEmpty {
                Text("Descanso")
                    .scaledFont(13, weight: .medium, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.faint)
                    .padding(.vertical, 13)
                Spacer(minLength: 0)
            } else {
                VStack(spacing: Theme.Spacing.xs) {
                    ForEach(dia.sesiones) { session in
                        SessionCompactRow(
                            slot: session.slot.lowercased().hasPrefix("pm") ? .pm : .am,
                            title: session.title,
                            meta: DuracionDeSesion.texto(session) ?? "Sin tiempo previsto",
                            modality: session.modality,
                            isFree: session.isSelfOrigin,
                            onTap: { onAbrir(session) }
                        )
                    }
                }
                .padding(.vertical, 6)
            }
        }
        .padding(.horizontal, 14)
        .accessibilityElement(children: dia.sesiones.isEmpty ? .combine : .contain)
        .accessibilityLabel(dia.sesiones.isEmpty ? "\(dia.nombre), descanso" : dia.nombre)
    }
}
