import SwiftUI

// EL CALENDARIO DEL HISTORIAL — el mes («Julio 2026 ‹ ›»), su rejilla de días y la leyenda.
//
// Es el instrumento de la pantalla (`HistoryView` lo pone en la posición `lead` de su
// `CenteredScreen`). Vive aparte por lo mismo que `HistorialDelMes`: dentro cuelga de un
// ScrollView, que `ImageRenderer` no dibuja, y así se puede mirar en una captura. Sin estado
// propio: recibe el mes y lo que tiene cada día, y devuelve los toques. Qué abre un día (una
// sesión, o enfocar la lista cuando hay varias) lo decide `HistoryView`.
struct CalendarioDelMes: View {
    let viewed: YearMonth
    let estados: [Int: CalendarDayState]
    /// El día de hoy si cae en este mes.
    let hoy: Int?
    /// El día enfocado (YYYY-MM-DD) cuando el atleta tocó uno con varias sesiones.
    let enfocado: String?
    let puedeAvanzar: Bool
    let alCambiarDeMes: (YearMonth) -> Void
    let alTocarDia: (Int) -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: Self.hueco), count: 7)
    /// El aire entre las casillas del calendario.
    private static let hueco: CGFloat = 4
    /// Alto de una casilla: el número, su marca y aire; por encima del área táctil del kit, porque
    /// cada día con entreno es un botón.
    private static let altoDeCasilla: CGFloat = Theme.Size.toque + 14
    /// Hasta dónde crece el texto del calendario. Siete columnas en 362 pt son 50 pt por día: a
    /// tamaños de accesibilidad un «28» ya no cabe en su casilla y la rejilla se rompe. Tope en el
    /// último tamaño estándar (lo que hace el calendario del sistema); el resto de la pantalla
    /// —cabecera, leyenda, lista— sigue creciendo sin tope.
    private static let topeDelCalendario: DynamicTypeSize = .xxxLarge

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            monthNav
            calendar
            legend
        }
    }

    // MARK: - El mes (Julio 2026 ‹ ›)
    //
    // Como la cabecera del Plan: el título a la izquierda y las flechas redondas a la derecha. La
    // flecha que no lleva a ninguna parte (el mes que viene: el historial no tiene futuro) no se
    // pinta, pero su hueco de 48 pt se reserva: el título no baila al cambiar de mes.

    private var monthNav: some View {
        HStack(spacing: 0) {
            Text(viewed.displayLabel.capitalizedFirst)
                .papel(.seccion)
                .foregroundStyle(Theme.Color.foreground)
                .contentTransition(.numericText())
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            BotonCromoDia(etiqueta: "Mes anterior", accion: {
                Haptics.light()
                alCambiarDeMes(viewed.previous())
            }) { flecha("chevron.left") }
            if puedeAvanzar {
                BotonCromoDia(etiqueta: "Mes siguiente", accion: {
                    Haptics.light()
                    alCambiarDeMes(viewed.next())
                }) { flecha("chevron.right") }
            } else {
                Color.clear.frame(width: Theme.Size.toque, height: Theme.Size.toque)
            }
        }
        // El círculo de 38 pt, y no su área táctil de 48, es lo que cae en el margen.
        .padding(.trailing, -(Theme.Size.toque - 38) / 2)
    }

    /// El glifo de una flecha de mes. `chevron.left` no está en `GlifoDia` (el kit solo avanza), así
    /// que se pide el símbolo del sistema con la misma medida que `IconoDia`.
    private func flecha(_ simbolo: String) -> some View {
        Image(systemName: simbolo)
            .font(.system(size: 18, weight: .bold))
            .accessibilityHidden(true)
    }

    // MARK: - El calendario
    //
    // La marca de un día hecho es el MISMO sello que pinta el Plan en su tira de la semana (✓ verde):
    // un entreno hecho se ve igual en las dos pantallas donde el atleta lo busca. «En pareja» lo
    // rodea el aro del color de la pareja; un descanso es la raya, también como en el Plan.

    private var calendar: some View {
        VStack(spacing: Theme.Spacing.s) {
            HStack(spacing: Self.hueco) {
                ForEach(Array(HistoryCalendar.weekdayHeadersEs.enumerated()), id: \.offset) { _, d in
                    Text(d)
                        .papel(.rotulo)
                        .foregroundStyle(Theme.Color.muted)
                        .frame(maxWidth: .infinity)
                        .accessibilityHidden(true)
                }
            }
            LazyVGrid(columns: columns, spacing: Self.hueco) {
                ForEach(Array(HistoryCalendar.grid(viewed).enumerated()), id: \.offset) { _, cell in
                    dayCell(cell)
                }
            }
        }
        .dynamicTypeSize(...Self.topeDelCalendario)
    }

    @ViewBuilder
    private func dayCell(_ cell: CalendarGridCell) -> some View {
        switch cell {
        case .blank:
            Color.clear.frame(height: Self.altoDeCasilla)
        case .day(let n):
            let state = estados[n] ?? .empty
            let isToday = hoy == n
            let isFocused = enfocado == HistoryCalendar.isoDate(n, en: viewed)
            let forma = RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
            Button(action: { alTocarDia(n) }) {
                VStack(spacing: 2) {
                    Text("\(n)")
                        .papel(isToday || isFocused ? .cuerpoFuerte : .cuerpo)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Color.foreground)
                    indicator(for: state)
                        .frame(height: 20)
                }
                .frame(maxWidth: .infinity)
                .frame(height: Self.altoDeCasilla)
                // Hoy lleva el tinte del club (y encima la tinta del tema, §11.2); el día enfocado,
                // la cara elevada. Si hoy es además el enfocado, manda el enfoque.
                .background(
                    isFocused ? Theme.Color.surfaceElevated : (isToday ? Theme.Color.accentTint : .clear),
                    in: forma
                )
                .overlay(
                    forma.strokeBorder(
                        isFocused ? Theme.Color.hairlineStrong : (isToday ? Theme.Color.accentTintBorde : .clear),
                        lineWidth: 1
                    )
                )
                .contentShape(forma)
            }
            .buttonStyle(PressScaleStyle(escala: 0.94))
            .disabled(!esTocable(state))
            .accessibilityLabel(cellAccessibility(n, state, isToday))
            .accessibilityAddTraits(isFocused ? .isSelected : [])
        }
    }

    @ViewBuilder
    private func indicator(for state: CalendarDayState) -> some View {
        switch state {
        case .empty:
            Color.clear.frame(width: 20, height: 20)
        case .rest:
            MarcaDeDescanso()
        case .trained(let withPartner):
            MarcaDeHecho(enPareja: withPartner)
        }
    }

    private func esTocable(_ state: CalendarDayState) -> Bool {
        if case .trained = state { return true }
        return false
    }

    // MARK: - La leyenda

    private var legend: some View {
        // Con texto grande las tres entradas no caben en una línea: pasan a columna, nunca cortadas.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.l) {
                entradasDeLeyenda
                Spacer(minLength: 0)
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                entradasDeLeyenda
            }
        }
    }

    @ViewBuilder
    private var entradasDeLeyenda: some View {
        legendItem(label: "hecho") { MarcaDeHecho(enPareja: false) }
        legendItem(label: "en pareja") { MarcaDeHecho(enPareja: true) }
        legendItem(label: "descanso") { MarcaDeDescanso() }
    }

    private func legendItem<Mark: View>(label: String, @ViewBuilder mark: () -> Mark) -> some View {
        HStack(spacing: Theme.Spacing.s) {
            mark().frame(width: 20)
            Text(label)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
        }
        .accessibilityElement(children: .combine)
    }

    private func cellAccessibility(_ n: Int, _ state: CalendarDayState, _ isToday: Bool) -> String {
        var s = "\(n)"
        if isToday { s += ", hoy" }
        switch state {
        case .empty: break
        case .rest: s += ", descanso"
        case .trained(let p): s += p ? ", entreno hecho en pareja" : ", entreno hecho"
        }
        return s
    }
}

// MARK: - Las marcas del calendario (también en la leyenda: una sola definición)

/// Un día con entreno: el sello de «hecha» del Plan y, si fue en pareja, el aro de la pareja.
private struct MarcaDeHecho: View {
    let enPareja: Bool

    var body: some View {
        ZStack {
            if enPareja {
                Circle().strokeBorder(Theme.Color.partner, lineWidth: 2).frame(width: 20, height: 20)
            }
            SelloEstadoDia(estado: .hecha, tam: enPareja ? 12 : 16)
        }
        .frame(width: 20, height: 20)
        .accessibilityHidden(true)
    }
}

/// Un descanso programado: la raya corta, como en la tira del Plan.
private struct MarcaDeDescanso: View {
    var body: some View {
        Capsule()
            .fill(Theme.Color.hairlineStrong)
            .frame(width: 14, height: 3)
            .accessibilityHidden(true)
    }
}

private extension String {
    /// "julio 2026" → "Julio 2026" (capitalize only the first letter, keep the rest).
    var capitalizedFirst: String {
        guard let first = first else { return self }
        return first.uppercased() + dropFirst()
    }
}
