import Foundation

enum SemanaCalendario {
    static var calendar: Calendar { HistoryCalendar.boxCalendar }

    static func iso(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static func date(iso: String) -> Date? {
        guard let p = HistoryCalendar.parseISO(iso) else { return nil }
        return calendar.date(from: DateComponents(year: p.year, month: p.month, day: p.day))
    }

    static func lunes(conteniendo date: Date) -> String {
        guard let interval = calendar.dateInterval(of: .weekOfYear, for: date) else {
            return iso(calendar.startOfDay(for: date))
        }
        return iso(interval.start)
    }

    static func lunes(isoDay: String) -> String? {
        date(iso: isoDay).map(lunes(conteniendo:))
    }

    static func adyacente(lunes: String, semanas: Int) -> String? {
        guard let start = date(iso: lunes),
              let moved = calendar.date(byAdding: .weekOfYear, value: semanas, to: start)
        else { return nil }
        return self.lunes(conteniendo: moved)
    }

    static func paginas(alrededor lunes: String) -> [String] {
        ventana(alrededor: lunes, radio: 1)
    }

    static func ventana(alrededor lunes: String, radio: Int) -> [String] {
        (-radio...radio).compactMap { adyacente(lunes: lunes, semanas: $0) }
    }

    static func hoyIso(ahora: Date = Date()) -> String {
        iso(calendar.startOfDay(for: ahora))
    }

    static func semanaVacia(lunes: String, hoyIso: String) -> SemanaDelPlan {
        guard let start = date(iso: lunes) else {
            return SemanaDelPlan(dias: [], indiceHoy: nil, intencion: nil, nombreBloque: nil, planStartsOn: nil)
        }
        let dias: [DiaDelPlan] = (0..<7).compactMap { offset in
            guard let day = calendar.date(byAdding: .day, value: offset, to: start) else { return nil }
            let isoDay = iso(day)
            let appleWeekday = calendar.component(.weekday, from: day)
            let diaSemana = appleWeekday == 1 ? 7 : appleWeekday - 1
            return DiaDelPlan(
                isoDate: isoDay,
                diaSemana: diaSemana,
                inicial: SemanaDelPlan.inicialDeDia(diaSemana),
                nombre: SemanaDelPlan.nombreDeDia(diaSemana),
                numero: calendar.component(.day, from: day),
                sesiones: [],
                estado: .descanso,
                esHoy: isoDay == hoyIso
            )
        }
        return SemanaDelPlan(
            dias: dias,
            indiceHoy: dias.firstIndex(where: \.esHoy),
            intencion: nil,
            nombreBloque: nil,
            planStartsOn: nil
        )
    }
}
