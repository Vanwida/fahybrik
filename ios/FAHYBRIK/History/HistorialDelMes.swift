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
///
/// Con el kit del día: la lista es una tarjeta con sus filas separadas por un filo
/// (como los ajustes de Perfil), y el vacío y el error son el sujeto de la pantalla
/// con su salida, como en el Plan.
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

    /// Cuántas filas dibuja el esqueleto: las de un mes con poco, para que al llegar
    /// una lista corta no se encoja todo de golpe.
    private static let filasDelEsqueleto = 3

    var body: some View {
        if loading {
            esqueleto
        } else if failed {
            SujetoEstadoDeLoHecho.error(
                kicker: viewed.displayLabel,
                titulo: "No pudimos cargar \(HistoryCalendar.monthNameEs(viewed.month))",
                apoyo: "Revisa tu conexión e inténtalo de nuevo.",
                alReintentar: onReintentar
            )
        } else if rows.isEmpty {
            mesVacio
        } else {
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                if selectedDay != nil { focusedDayHeader }
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                        if idx > 0 { filo }
                        listRow(row)
                    }
                }
                .tarjetaDia()
            }
        }
    }

    /// El filo entre dos filas: sangrado hasta el texto, como una lista del sistema.
    private var filo: some View {
        Rectangle()
            .fill(Theme.Color.hairline)
            .frame(height: 1)
            .padding(.leading, Theme.Spacing.l)
    }

    /// Un mes sin entrenos. Lleva salida SIEMPRE (§5), y la salida es el acto que
    /// el atleta viene a hacer aquí: **mirar hacia atrás**. «Ver junio» nombra su
    /// destino, cabe en un toque y no le deja adivinando si hay algo detrás.
    ///
    /// Un mes ya cerrado y otro en curso no dicen lo mismo: en el que corre todavía
    /// puede pasar algo, y eso es información; en el que pasó, ya no.
    private var mesVacio: some View {
        SujetoEstadoDeLoHecho(
            tono: .neutro,
            kicker: viewed.displayLabel,
            titulo: "Sin entrenos en \(HistoryCalendar.monthNameEs(viewed.month))",
            apoyo: HistoryCalendar.todayDay(in: viewed) != nil
                ? "Lo que entrenes este mes aparece aquí en cuanto lo cierres."
                : "No hay ninguna sesión registrada en este mes.",
            accion: "Ver \(HistoryCalendar.monthNameEs(viewed.previous().month))",
            alTocar: onVerMesAnterior
        )
    }

    /// Mientras llega el mes: la MISMA tarjeta con la silueta de sus filas (sello del
    /// día, título, chips y resultado), no una rueda en medio de la nada.
    private var esqueleto: some View {
        VStack(spacing: 0) {
            ForEach(0..<Self.filasDelEsqueleto, id: \.self) { i in
                if i > 0 { filo }
                HStack(spacing: Theme.Spacing.m) {
                    VStack(spacing: Theme.Spacing.xs) {
                        SkeletonBar(width: 30, height: 15, radius: 5)
                        SkeletonBar(width: 30, height: 24, radius: 6)
                    }
                    .frame(width: SelloDelDia.ancho)
                    VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                        SkeletonBar(height: 17, radius: 5).padding(.trailing, i == 1 ? 60 : 30)
                        SkeletonBar(width: 110, height: 15, radius: 5)
                    }
                    SkeletonBar(width: 56, height: 24, radius: 6)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.l)
            }
        }
        .tarjetaDia()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando \(HistoryCalendar.monthNameEs(viewed.month))")
    }

    /// Shown when a multi-session day is focused: says WHICH day is on screen and
    /// gives one obvious way back to the full month. Without it the filtered list
    /// would look like a month that lost most of its sessions.
    @ViewBuilder
    private var focusedDayHeader: some View {
        if let selectedDay {
            HStack(spacing: Theme.Spacing.s) {
                Text(focusedDayLabel(selectedDay))
                    .papel(.etiqueta)
                    .foregroundStyle(Theme.Color.accentText)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                // La misma pastilla de vuelta que «Volver a esta semana» del Plan.
                Button(action: onVerElMes) {
                    Text("Ver el mes")
                        .papel(.rotulo)
                        .foregroundStyle(Theme.Color.accentText)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 44)
                        .overlay(Capsule().strokeBorder(Theme.Color.accentTintBorde, lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(PressScaleStyle(escala: 0.96))
                .accessibilityLabel("Ver todo el mes")
            }
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
            HStack(alignment: .center, spacing: Theme.Spacing.m) {
                SelloDelDia(iso: row.date)

                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    HStack(spacing: Theme.Spacing.s) {
                        if s.modality != nil { ModalityDot(modality: s.modality, size: 10) }
                        Text(s.title)
                            .papel(.cuerpoFuerte)
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(2)
                    }
                    subChips(s, sinSubir: row.sinSubir != nil)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if let resultado = s.resultado {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(resultado.valor)
                            .papel(.seccion)
                            .monospacedDigit()
                            .foregroundStyle(Theme.Color.foreground)
                            .lineLimit(1)
                        Text(resultado.etiqueta)
                            .papel(.nota)
                            .foregroundStyle(Theme.Color.muted)
                            .lineLimit(1)
                    }
                    .layoutPriority(1)
                }
                IconoDia(.chevron, tam: 18)
                    .foregroundStyle(Theme.Color.muted)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m + 2)
            .frame(minHeight: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func subChips(_ s: AthleteHistorySession, sinSubir: Bool) -> some View {
        // Varias marcas a la vez (RPE, en pareja, ruta, «Sin subir») no caben en una línea con
        // el título a 17 pt: fluyen a la siguiente, nunca cortadas con «…». El flujo es el
        // compartido de la app (`FlowLayout`), no uno más.
        FlowLayout(spacing: Theme.Spacing.s + 2) {
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
        HStack(spacing: Theme.Spacing.xs) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .bold))
                    .accessibilityHidden(true)
            }
            Text(text).papel(.notaFuerte)
        }
        .foregroundStyle(tint)
        .fixedSize()
    }
}

// MARK: - El sello del día

/// «MIÉ / 28» a la izquierda de la fila: de un vistazo, qué día fue. La columna tiene ancho
/// fijo aunque la fecha no se pueda leer, para que la lista no se desalinee.
private struct SelloDelDia: View {
    let iso: String

    static let ancho: CGFloat = 44

    var body: some View {
        VStack(spacing: 0) {
            Text(HistoryCalendar.dowAbbrev(iso))
                .papel(.etiqueta)
                .foregroundStyle(Theme.Color.muted)
            if let dia = HistoryCalendar.parseISO(iso).map({ String($0.day) }) {
                Text(dia)
                    .papel(.seccion)
                    .monospacedDigit()
                    .foregroundStyle(Theme.Color.foreground)
            }
        }
        .frame(minWidth: Self.ancho)
    }
}
