import SwiftUI

// «Cómo se arregla» — la semana bloqueada.
//
// La demostración de competencia que sostiene el embudo: si son tan buenos
// midiendo, cómo serán sus planes. Por eso tiene que ser VERDAD.
//
// LAS TRES REGLAS:
//
//  1. Lo difuminado es REAL. Se pintan todas las sesiones y se desenfocan las de
//     abajo. Ni una línea de relleno: el día que alguien compare dos cuentas y
//     vea lo mismo, se acabó la credibilidad.
//  2. La estructura es NUESTRA (correr con calidad, fuerza, ergo, híbrido y
//     tirada larga: la anatomía de la prueba), los números son SUYOS. Aquí no
//     entra ni un bloque, plantilla ni microciclo del coach.
//  3. Si una sesión no se puede calcular con datos suyos, esa fila NO EXISTE. El
//     servidor ya la deja fuera, y si quedan menos de dos no manda semana: esta
//     vista entonces no se pinta.
//
// El candado dice de dónde salen los números, que es lo que separa esto de un
// anuncio.

struct FreePlanWeekCard: View {
    let week: FreePlannedWeek

    var body: some View {
        CardSurface(padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                header
                VStack(spacing: 0) {
                    ForEach(Array(week.sessions.enumerated()), id: \.element.id) { index, session in
                        row(session, locked: index >= week.visibleCount)
                        if index < week.sessions.count - 1 { Hairline() }
                    }
                }
                lockRow
            }
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Cómo se arregla")
                .scaledFont(16, weight: .heavy, relativeTo: .headline, italic: true)
                .foregroundStyle(Theme.Color.foreground)
            Spacer(minLength: 8)
            Text("tu semana")
                .scaledFont(11, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
        }
    }

    private func row(_ session: FreePlannedSession, locked: Bool) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(FreePlanWeekCopy.day(session.weekday))
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Theme.Color.faint)
                .frame(width: 32, alignment: .leading)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text(FreePlanWeekCopy.title(session))
                    .scaledFont(13, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(FreePlanWeekCopy.detail(session))
                    .font(.system(size: 11, weight: .bold).monospacedDigit())
                    .foregroundStyle(Theme.Color.accentText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 9)
        // El desenfoque es SOLO presentación: la sesión de debajo es la real.
        .blur(radius: locked ? 4.5 : 0)
        .opacity(locked ? 0.6 : 1)
        .allowsHitTesting(!locked)
        .accessibilityElement(children: locked ? .ignore : .combine)
        .accessibilityLabel(locked ? "Sesión bloqueada" : "")
        .accessibilityHidden(locked)
    }

    private var lockRow: some View {
        HStack(spacing: 6) {
            Image(systemName: "lock.fill")
                .font(.system(size: 10, weight: .bold))
            Text(FreePlanWeekCopy.basisLine(week))
                .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(Theme.Color.muted)
        .frame(maxWidth: .infinity)
        .padding(.top, 2)
    }
}

// MARK: - Copy de la semana
//
// Toda la prescripción se redacta AQUÍ, a partir de los números del servidor.
// El dominio manda enteros y enums; el castellano vive en el cliente, en un solo
// sitio, para que no haya dos frases distintas para el mismo número.

enum FreePlanWeekCopy {
    private static let days = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]

    static func day(_ weekday: Int) -> String {
        days.indices.contains(weekday) ? days[weekday] : ""
    }

    /// "4:15 /km" a partir de segundos por kilómetro.
    private static func pace(_ secondsPerKm: Int) -> String {
        MarkFormat.clock(Double(secondsPerKm)) + " /km"
    }

    /// "1:30" de recuperación.
    private static func rest(_ seconds: Int) -> String {
        MarkFormat.clock(Double(seconds))
    }

    static func title(_ session: FreePlannedSession) -> String {
        switch session.kind {
        case "run_quality": return "Series de 1 km"
        case "hybrid": return "Correr con estaciones"
        case "long_run": return "Rodaje largo"
        case "erg": return ergTitle(session.erg?.erg)
        case "strength": return strengthTitle(session.strength?.exerciseSlug)
        default: return "Sesión"
        }
    }

    private static func ergTitle(_ erg: String?) -> String {
        switch erg {
        case "ski": return "Ski por series"
        case "row": return "Remo por series"
        default: return "Ergo por series"
        }
    }

    private static func strengthTitle(_ slug: String?) -> String {
        guard let slug, let lift = StrengthService.STRENGTH_LIFTS.first(where: { $0.slug == slug }) else {
            return "Fuerza"
        }
        return "Fuerza: \(lift.label.lowercased())"
    }

    /// La línea de prescripción, ya personalizada. Completa por modalidad: qué se
    /// mide, contra qué objetivo y cuánto se descansa.
    static func detail(_ session: FreePlannedSession) -> String {
        if let run = session.run { return runDetail(run) }
        if let erg = session.erg { return ergDetail(erg) }
        if let strength = session.strength { return strengthDetail(strength) }
        return ""
    }

    private static func runDetail(_ run: FreeRunPrescription) -> String {
        switch run.shape {
        case "intervals":
            let distance = run.distanceM.map(distanceLabel) ?? ""
            var line = "\(run.reps) x \(distance) a \(pace(run.targetPaceSPerKm))"
            if let restS = run.restS { line += ", \(rest(restS)) de recuperación" }
            return line
        case "continuous":
            let minutes = (run.durationS ?? 0) / 60
            return "\(minutes) min a \(pace(run.targetPaceSPerKm))"
        default:
            let distance = run.distanceM.map(distanceLabel) ?? ""
            let work = run.stations.map { "\($0.reps) \(stationName($0.station))" }.joined(separator: " + ")
            let base = "\(run.reps) rondas: \(distance) a \(pace(run.targetPaceSPerKm))"
            return work.isEmpty ? base : "\(base) + \(work)"
        }
    }

    private static func ergDetail(_ erg: FreeErgPrescription) -> String {
        let pace500 = MarkFormat.clock(Double(erg.targetPaceSPer500)) + " /500"
        return "\(erg.reps) x \(distanceLabel(erg.distanceM)) a \(pace500), \(rest(erg.restS)) de recuperación"
    }

    private static func strengthDetail(_ strength: FreeStrengthPrescription) -> String {
        let percent = Int((strength.percentOfOneRm * 100).rounded())
        let load = weight(strength.loadKg)
        return "\(strength.sets) x \(strength.reps) con \(load) (\(percent)% de tu máximo), RIR \(strength.rir)"
    }

    /// "1 km" / "500 m" — como se dice en el gimnasio.
    private static func distanceLabel(_ meters: Int) -> String {
        if meters >= 1000, meters % 1000 == 0 { return "\(meters / 1000) km" }
        return "\(meters) m"
    }

    /// "105 kg", sin decimal cuando es redondo.
    private static func weight(_ kg: Double) -> String {
        kg == kg.rounded() ? "\(Int(kg)) kg" : String(format: "%.1f kg", kg)
    }

    private static func stationName(_ station: String) -> String {
        switch station {
        case "wall_balls": return "wall balls"
        case "burpee_broad_jump": return "burpees con salto"
        default: return station
        }
    }

    /// De dónde salen los números. Es la línea que separa esto de un anuncio, así
    /// que nombra la fuente real y no promete nada más.
    static func basisLine(_ week: FreePlannedWeek) -> String {
        guard let basis = week.sessions.first?.basis else { return "Calculado con tus datos" }
        switch basis.source {
        case "carrera":
            if let race = basis.race {
                let place = race.location ?? race.name
                return "Calculado con tus 8 km de \(place)"
            }
            return "Calculado con tus carreras"
        case "vo2max":
            return "Calculado con el VO₂ máx de tu reloj"
        default:
            return "Calculado con tus marcas"
        }
    }
}
