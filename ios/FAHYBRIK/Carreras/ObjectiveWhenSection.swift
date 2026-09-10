import SwiftUI

/// Shared «Para cuándo es» block — same UX when the athlete creates a custom
/// objective or fixes one from the catalog. Every goal has a concrete when.
struct ObjectiveWhenSection: View {
    @Binding var date: Date
    /// Catalog rows without a confirmed date get an extra hint; custom/create omit it.
    var showUndatedCatalogHint: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            LabelText(text: "PARA CUÁNDO ES")
            if showUndatedCatalogHint {
                Text("Este evento aún no tiene fecha confirmada en el calendario. Elige cuándo lo tienes previsto.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            DatePicker("", selection: $date, in: Date()..., displayedComponents: .date)
                .datePickerStyle(.compact)
                .labelsHidden()
                .tint(Theme.Color.accent)
        }
    }
}

enum ObjectiveWhenDate {
    static let isoFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func fromEventStart(_ raw: String?) -> Date {
        guard let raw, let parsed = RaceDate.parse(raw) else { return Date() }
        var c = DateComponents()
        c.year = parsed.year
        c.month = parsed.month
        c.day = parsed.day
        return Calendar.current.date(from: c) ?? Date()
    }

    static func isoString(from date: Date) -> String {
        isoFormatter.string(from: date)
    }
}
