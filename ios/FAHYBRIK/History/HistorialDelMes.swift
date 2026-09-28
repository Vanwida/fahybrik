import SwiftUI

// MARK: - La lista del mes, con sus cuatro estados
//
// Vivía al final de HistoryView.swift; se separó al coser las filas «Sin subir»
// (EntrenoSinSubir.swift) para que ninguno de los dos pase de 500 líneas.

/// Lo que va debajo del calendario: la lista de sesiones del mes, su cargando, su
/// vacío y su error. Sin estado propio — lo recibe todo y devuelve toques.
///
/// Vive fuera de `HistoryView` para poder renderizarse en una captura (dentro
/// cuelga del `CenteredScreen`, que es un `ScrollView`, e `ImageRenderer` no dibuja
/// ScrollView) y porque es la parte de la pantalla que tiene estados: separarla
/// hace que los cuatro se puedan mirar uno a uno.
struct HistorialDelMes: View {
    let viewed: YearMonth
    let rows: [HistoryListRow]
    let loading: Bool
    let failed: Bool
    /// El día enfocado cuando el atleta tocó uno con varias sesiones.
    let selectedDay: String?
    let onReintentar: () -> Void
    let onVerMesAnterior: () -> Void
    let onVerElMes: () -> Void
    let onAbrir: (AthleteHistorySession) -> Void
    /// Preguntarle al coach por esta sesión. Nil = sin coach, y entonces la fila
    /// del menú no existe. Con defecto para no obligar a las pruebas de render
    /// —ni a ningún futuro llamador— a declarar algo que no les importa.
    var onPreguntar: ((AthleteHistorySession, String) -> Void)? = nil
    var onRequestDeleteFree: ((AthleteHistorySession) -> Void)? = nil
    /// Tocar una fila «Sin subir»: abre lo que guarda el móvil, nunca la ficha del
    /// servidor (no la tiene). Con defecto por lo mismo que `onPreguntar`.
    var onAbrirSinSubir: ((LocalUnsyncedWorkout) -> Void)? = nil

    var body: some View {
        if loading {
            HStack { Spacer(); ProgressView().tint(Theme.Color.accent); Spacer() }
        } else if failed {
            RedesignEmptyState(
                symbol: "arrow.clockwise",
                title: "No pudimos cargar \(HistoryCalendar.monthNameEs(viewed.month))",
                message: "Revisa tu conexión e inténtalo de nuevo.",
                exit: .action(title: "Reintentar", perform: onReintentar)
            )
        } else if rows.isEmpty {
            mesVacio
        } else {
            VStack(spacing: 0) {
                if selectedDay != nil { focusedDayHeader }
                ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                    if idx > 0 { Divider().overlay(Theme.Color.hairline) }
                    listRow(row)
                }
            }
        }
    }

    /// Un mes sin entrenos. Lleva salida SIEMPRE (§5), y la salida es el acto que
    /// el atleta viene a hacer aquí: **mirar hacia atrás**. «Ver junio» nombra su
    /// destino, cabe en un toque y no le deja adivinando si hay algo detrás.
    ///
    /// Un mes ya cerrado y otro en curso no dicen lo mismo: en el que corre todavía
    /// puede pasar algo, y eso es información; en el que pasó, ya no.
    private var mesVacio: some View {
        RedesignEmptyState(
            symbol: "calendar",
            title: "Sin entrenos en \(HistoryCalendar.monthNameEs(viewed.month))",
            message: HistoryCalendar.todayDay(in: viewed) != nil
                ? "Lo que entrenes este mes aparece aquí en cuanto lo cierres."
                : "No hay ninguna sesión registrada en este mes.",
            exit: .action(
                title: "Ver \(HistoryCalendar.monthNameEs(viewed.previous().month))",
                perform: onVerMesAnterior
            )
        )
    }

    /// Shown when a multi-session day is focused: says WHICH day is on screen and
    /// gives one obvious way back to the full month. Without it the filtered list
    /// would look like a month that lost most of its sessions.
    @ViewBuilder
    private var focusedDayHeader: some View {
        if let selectedDay {
            HStack(spacing: 8) {
                LabelText(text: focusedDayLabel(selectedDay), color: Theme.Color.accentText, size: 15)
                Spacer(minLength: 0)
                Button(action: onVerElMes) {
                    Text("Ver el mes")
                        .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ver todo el mes")
            }
            .padding(.vertical, Theme.Spacing.s)
        }
    }

    /// "MIÉ 28 JUL · 4 SESIONES" — the focused day and how many it holds.
    private func focusedDayLabel(_ iso: String) -> String {
        let count = rows.count
        let unit = count == 1 ? "sesión" : "sesiones"
        guard let p = HistoryCalendar.parseISO(iso) else { return "\(count) \(unit)" }
        let dow = HistoryCalendar.dowAbbrev(iso)
        let mon = HistoryCalendar.monthAbbrevEs[max(0, min(11, p.month - 1))]
        return "\(dow) \(p.day) \(mon) · \(count) \(unit)"
    }

    /// Una fila «Sin subir» se toca como las demás, pero abre lo que guarda el móvil y
    /// no lleva menú: preguntar al coach o borrar hablan de una sesión que el servidor
    /// no tiene.
    @ViewBuilder
    private func listRow(_ row: HistoryListRow) -> some View {
        if let local = row.sinSubir {
            rowButton(row) { onAbrirSinSubir?(local) }
        } else {
            serverRow(row)
        }
    }

    private func serverRow(_ row: HistoryListRow) -> some View {
        let s = row.session
        return rowButton(row) { onAbrir(s) }
        // Pulsación larga sobre la fila. VA SOBRE EL BOTÓN, nunca dentro de su
        // `label:`: ahí dentro el botón se queda el gesto y el menú no se abre.
        .contextMenu {
            Button {
                onAbrir(s)
            } label: {
                Label("Ver el entreno", systemImage: "list.bullet.rectangle")
            }
            // Preguntar y borrar hablan de una SESIÓN del plan: lo hecho fuera del
            // plan no tiene asignación a la que señalar.
            if let onPreguntar, s.assignmentId != nil {
                Button {
                    onPreguntar(s, row.date)
                } label: {
                    Label("Preguntar al coach", systemImage: "message")
                }
            }
            if s.isSelfOrigin, s.assignmentId != nil, let onRequestDeleteFree {
                Button(role: .destructive) {
                    onRequestDeleteFree(s)
                } label: {
                    Label("Borrar entreno libre", systemImage: "trash")
                }
            }
        }
    }

    // La fila, al suelo del contrato (§4.1): nada por debajo de 15 pt. A la derecha
    // va LO QUE PUNTÚA la sesión (`resultado`): rondas de un AMRAP, el tiempo de un
    // for time, los metros y el ritmo de una carrera o un remo, o la duración.
    private func rowButton(_ row: HistoryListRow, action: @escaping () -> Void) -> some View {
        let s = row.session
        return Button(action: action) {
            HStack(alignment: .center, spacing: 12) {
                // Date stamp — DOW + day number.
                VStack(spacing: 1) {
                    Text(HistoryCalendar.dowAbbrev(row.date))
                        .scaledFont(15, weight: .bold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.muted)
                    if let day = dayNumber(row.date) {
                        Text(day)
                            .scaledFont(20, weight: .heavy, relativeTo: .title3, monospaced: true)
                            .foregroundStyle(Theme.Color.foreground)
                    }
                }
                .frame(minWidth: 40)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 8) {
                        if s.modality != nil { ModalityDot(modality: s.modality, size: 10) }
                        Text(s.title)
                            .scaledFont(17, weight: .semibold, relativeTo: .body)
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                    }
                    subChips(s, sinSubir: row.sinSubir != nil)
                }
                Spacer(minLength: 8)

                if let resultado = s.resultado {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(resultado.valor)
                            .scaledFont(20, weight: .heavy, relativeTo: .title3, italic: true, monospaced: true)
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                        Text(resultado.etiqueta)
                            .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                            .foregroundStyle(Theme.Color.muted)
                            .lineLimit(1)
                    }
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.Color.muted)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func subChips(_ s: AthleteHistorySession, sinSubir: Bool) -> some View {
        HStack(spacing: 10) {
            if let rpe = s.rpeLabel {
                chip(text: rpe, tint: Theme.Color.muted)
            }
            if s.withPartner {
                chip(icon: "person.2.fill", text: "en pareja", tint: Theme.Color.partner)
            }
            if s.hasRoute {
                chip(icon: "map", text: "ruta", tint: Theme.Color.muted)
            }
            // Lo que no salió del plan se dice: el atleta lo reconoce como suyo, y
            // el coach no lo cuenta en la adherencia (DECISIONS 2026-09-28).
            if s.assignmentId == nil, !sinSubir {
                chip(text: s.recordedVia == "imported" ? "importado" : "fuera del plan",
                     tint: Theme.Color.muted)
            }
            // «Sin subir» es un chip MÁS del vocabulario de la fila, no una insignia
            // nueva: pesa lo mismo que decir que corriste con ruta. El triángulo dice
            // que algo es distinto; el gris, que no es urgente (el atleta no tiene
            // nada que hacer). Ni ámbar ni rojo.
            if sinSubir {
                chip(icon: "exclamationmark.triangle.fill", text: "Sin subir", tint: Theme.Color.muted)
            }
        }
    }

    private func chip(icon: String? = nil, text: String, tint: Color) -> some View {
        HStack(spacing: 4) {
            if let icon {
                Image(systemName: icon)
                    .scaledFont(13, weight: .bold, relativeTo: .footnote)
            }
            Text(text).scaledFont(15, weight: .semibold, relativeTo: .subheadline)
        }
        .foregroundStyle(tint)
        .lineLimit(1)
    }

    /// El día del mes del sello. Nil cuando la fecha no se puede leer: entonces no
    /// hay sello que pintar, igual que `dowAbbrev` ya devuelve vacío. La columna
    /// sigue reservada para que la lista no se desalinee.
    private func dayNumber(_ iso: String) -> String? {
        HistoryCalendar.parseISO(iso).map { String($0.day) }
    }
}
