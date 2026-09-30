import SwiftUI

// FH-102 — ONE day picker for scheduling free/planned workouts.
// Calendar Mon–Sun aligned with GET /plan/week, not a rolling 7-day window from today.

struct ProgramarDiaPicker: View {
    @Binding var selectedISO: String
    /// Anchor ISO (usually planWeek.todayIso). Defaults to today.
    var todayISO: String = RaceDate.todayISO()

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text("Programar en")
                .papel(.rotulo)
                .foregroundStyle(Theme.Color.muted)
            // Los siete días caben en una fila a tamaño normal; con texto grande la fila desliza en vez de
            // apretar los chips por debajo de su medida táctil.
            ViewThatFits(in: .horizontal) {
                dias
                ScrollView(.horizontal, showsIndicators: false) { dias }
            }
        }
    }

    private var dias: some View {
        HStack(spacing: Theme.Spacing.xs) {
            ForEach(dayOptions, id: \.iso) { day in
                let elegido = selectedISO == day.iso
                let forma = RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                Button {
                    Haptics.light()
                    selectedISO = day.iso
                } label: {
                    VStack(spacing: 2) {
                        Text(day.weekday).papel(.rotulo)
                        Text(day.dom).papel(.cuerpoFuerte)
                    }
                    .foregroundStyle(elegido ? Theme.Color.accentOn : Theme.Color.foreground)
                    .frame(minWidth: 46, minHeight: 56)
                    .padding(.horizontal, Theme.Spacing.xs)
                    .background(elegido ? Theme.Color.accent : Theme.Color.surface, in: forma)
                    .overlay(forma.strokeBorder(elegido ? SwiftUI.Color.clear : Theme.Color.hairlineStrong, lineWidth: 1))
                    .contentShape(forma)
                }
                .buttonStyle(PressScaleStyle(escala: 0.94))
                .accessibilityLabel(day.accessibilityLabel)
                .accessibilityAddTraits(elegido ? [.isButton, .isSelected] : .isButton)
            }
        }
    }

    private var dayOptions: [DayOption] {
        Self.monSunOptions(anchoredOn: todayISO)
    }
}

extension ProgramarDiaPicker {
    struct DayOption: Equatable {
        let iso: String
        let weekday: String
        let dom: String
        let accessibilityLabel: String
    }

    /// Mon–Sun week containing `anchorISO`.
    static func monSunOptions(anchoredOn anchorISO: String) -> [DayOption] {
        let parse = DateFormatter()
        parse.locale = Locale(identifier: "en_US_POSIX")
        parse.dateFormat = "yyyy-MM-dd"
        guard let anchor = parse.date(from: anchorISO) else { return [] }

        var cal = Calendar.current
        cal.firstWeekday = 2 // Monday
        guard let weekStart = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: anchor)) else {
            return []
        }

        let weekdayFmt = DateFormatter()
        weekdayFmt.locale = Locale(identifier: "es_ES")
        weekdayFmt.dateFormat = "EEE"
        let domFmt = DateFormatter()
        domFmt.dateFormat = "d"
        let longFmt = DateFormatter()
        longFmt.locale = Locale(identifier: "es_ES")
        longFmt.dateFormat = "EEEE d"

        return (0..<7).compactMap { offset in
            guard let date = cal.date(byAdding: .day, value: offset, to: weekStart) else { return nil }
            let c = cal.dateComponents([.year, .month, .day], from: date)
            let iso = String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
            let long = longFmt.string(from: date)
            let label = long.prefix(1).uppercased() + long.dropFirst()
            return DayOption(
                iso: iso,
                weekday: weekdayFmt.string(from: date).uppercased(),
                dom: domFmt.string(from: date),
                accessibilityLabel: label
            )
        }
    }
}
