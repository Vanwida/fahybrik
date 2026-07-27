import SwiftUI

// Lo que sus carreras dicen de él, y su objetivo contra su realidad.
//
// Estas dos tarjetas existen porque la pantalla le estaba pidiendo deberes
// ("aún nos faltan tus marcas") a un atleta que acababa de importar seis
// carreras con sus tiempos dentro. Primero se le devuelve lo que ya nos ha
// dado; pedirle algo va después, y solo lo que de verdad falte.
//
// LA REGLA QUE NO SE CRUZA: en dobles los dos corren los 8 km y los dos hacen
// las transiciones, así que correr y roxzone SÍ son suyos. Las estaciones se
// reparten entre los dos, así que NO se le atribuyen nunca. El servidor ya
// decide esto (shared/domain/free-plan); aquí solo se pinta lo que llega.

// MARK: - Formato y copy

enum FreePlanEvidenceCopy {
    /// "4:05 /km" a partir de segundos por kilómetro.
    static func pace(_ secondsPerKm: Double) -> String {
        MarkFormat.clock(secondsPerKm) + " /km"
    }

    /// "1:02:02" / "32:39".
    static func time(_ seconds: Int) -> String {
        MarkFormat.clock(Double(seconds))
    }

    /// "Berlín · may 2025" — dónde y cuándo, en corto.
    static func whereWhen(_ race: FreeRaceRef) -> String {
        let place = race.location ?? race.name
        guard let month = monthYear(race.raceDate) else { return place }
        return "\(place) · \(month)"
    }

    /// "dobles pro" / "dobles" / nil para individual sin división.
    static func categoryLabel(_ race: FreeRaceRef) -> String? {
        var parts: [String] = []
        switch race.format {
        case "doubles": parts.append("dobles")
        case "relay": parts.append("relevos")
        default: break
        }
        switch race.division {
        case "pro": parts.append("pro")
        case "elite": parts.append("élite")
        case "open": parts.append("open")
        default: break
        }
        if race.genderCategory == "mixed" { parts.append("mixto") }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }

    /// "may 2025" a partir de "2025-05-16".
    static func monthYear(_ iso: String?) -> String? {
        guard let iso, iso.count >= 7 else { return nil }
        let parts = iso.split(separator: "-")
        guard parts.count >= 2, let month = Int(parts[1]), (1 ... 12).contains(month) else { return nil }
        return "\(months[month - 1]) \(parts[0])"
    }

    private static let months = [
        "ene", "feb", "mar", "abr", "may", "jun",
        "jul", "ago", "sep", "oct", "nov", "dic",
    ]

    /// "6 carreras" / "1 carrera".
    static func raceCount(_ n: Int) -> String {
        n == 1 ? "1 carrera" : "\(n) carreras"
    }
}

// MARK: - Lo que dicen sus carreras

/// El retrato que sale de su historial importado. Solo se pinta lo que existe:
/// un apartado sin dato no aparece, nunca se rellena.
struct FreeRaceEvidenceCard: View {
    let evidence: FreeRaceEvidence

    var body: some View {
        CardSurface(padding: 16, topAccent: true, elevated: true) {
            VStack(alignment: .leading, spacing: 12) {
                header
                if let finish = evidence.bestFinish { bestFinishBlock(finish) }
                if evidence.bestRun != nil || evidence.bestRoxzone != nil {
                    Hairline().opacity(0.6)
                    VStack(alignment: .leading, spacing: 10) {
                        if let run = evidence.bestRun { runRow(run) }
                        if let rox = evidence.bestRoxzone { roxzoneRow(rox) }
                    }
                }
                progressLine
            }
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            LabelText(text: "Lo que dicen tus carreras")
            Spacer(minLength: 8)
            Text(FreePlanEvidenceCopy.raceCount(evidence.racesCounted))
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundStyle(Theme.Color.faint)
        }
    }

    private func bestFinishBlock(_ finish: FreeFinishEvidence) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Tu mejor tiempo")
                .scaledFont(11.5, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
            HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text(FreePlanEvidenceCopy.time(finish.totalSeconds))
                    .font(.system(size: 30, weight: .heavy).italic().monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 1) {
                    Text(FreePlanEvidenceCopy.whereWhen(finish.race))
                        .scaledFont(12, weight: .semibold, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                    if let category = FreePlanEvidenceCopy.categoryLabel(finish.race) {
                        Text(category)
                            .scaledFont(11, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.faint)
                    }
                }
            }
            // El tiempo de una pareja es suyo, pero no es una medida de él solo.
            // Decirlo aquí es lo que permite enseñar el número grande sin mentir.
            if finish.teamResult {
                Text("Es el tiempo de la pareja. Lo que sí es tuyo solo, debajo.")
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func runRow(_ run: FreeRunEvidence) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Tus 8 km")
                    .scaledFont(13, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 4)
                Text(FreePlanEvidenceCopy.pace(run.paceSPerKm))
                    .font(.system(size: 17, weight: .heavy).italic().monospacedDigit())
                    .foregroundStyle(Theme.Color.accentText)
                Text(FreePlanEvidenceCopy.time(run.totalSeconds))
                    .font(.system(size: 12, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Theme.Color.faint)
            }
            Text(runNote(run))
                .scaledFont(11.5, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    /// En dobles corren juntos: el ritmo lo marca el más lento de los dos, así
    /// que es un suelo. Decirlo es lo que hace creíble el número.
    private func runNote(_ run: FreeRunEvidence) -> String {
        let place = run.race.location ?? run.race.name
        return run.partnerBounded
            ? "En \(place). Corristeis los 8 km los dos, así que este es tu suelo: más lento no vas."
            : "En \(place). Los 8 km de tu mejor carrera."
    }

    private func roxzoneRow(_ rox: FreeRoxzoneEvidence) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Tus transiciones")
                    .scaledFont(13, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                Spacer(minLength: 4)
                Text(FreePlanEvidenceCopy.time(rox.seconds))
                    .font(.system(size: 17, weight: .heavy).italic().monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
            }
            Text("Lo que pierdes yendo de una estación a otra. Tu mejor registro, en \(rox.race.location ?? rox.race.name).")
                .scaledFont(11.5, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    /// Cómo va su carrera con el tiempo.
    ///
    /// El servidor solo manda tendencia cuando hay 3+ carreras INDIVIDUALES: en
    /// dobles el ritmo lo marca la pareja y una «evolución» mediría con quién se
    /// apuntó. Sin tendencia se enseñan los dos hechos (su mejor y su último) y
    /// se dice por qué no los restamos.
    @ViewBuilder
    private var progressLine: some View {
        if let trend = evidence.runTrend {
            trendLine(trend)
        } else if let latest = evidence.latestRun,
                  let best = evidence.bestRun,
                  latest.race.raceId != best.race.raceId {
            Text(latestVsBest(latest: latest, best: best))
                .scaledFont(12, relativeTo: .caption)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func latestVsBest(latest: FreeRunEvidence, best: FreeRunEvidence) -> String {
        let place = latest.race.location ?? latest.race.name
        let pace = FreePlanEvidenceCopy.pace(latest.paceSPerKm)
        if latest.partnerBounded || best.partnerBounded {
            return "Tu último fue \(pace) en \(place). En dobles el ritmo lo marca la pareja, así que restarle tu mejor no te diría cómo estás."
        }
        let gap = abs(Int((latest.paceSPerKm - best.paceSPerKm).rounded()))
        if gap == 0 { return "Tu último fue \(pace) en \(place), clavado a tu mejor." }
        let sense = latest.paceSPerKm > best.paceSPerKm ? "más lento" : "más rápido"
        return "Tu último fue \(pace) en \(place): \(gap) s por kilómetro \(sense) que tu mejor."
    }

    private func trendLine(_ trend: FreeRunTrend) -> some View {
        let seconds = abs(Int(trend.deltaSPerKm.rounded()))
        let text: String
        switch trend.direction {
        case "mejora": text = "Corriendo, vas a mejor: \(seconds) s por kilómetro más rápido en tus últimas \(trend.racesCounted) carreras."
        case "empeora": text = "Corriendo, vas a peor: \(seconds) s por kilómetro más lento en tus últimas \(trend.racesCounted) carreras."
        default: text = "Tu ritmo de carrera lleva \(trend.racesCounted) carreras estable."
        }
        return Text(text)
            .scaledFont(12, relativeTo: .caption)
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Su objetivo contra su realidad

/// Compara el objetivo con la mejor carrera COMPARABLE (mismo formato, división
/// y categoría). Si no hay ninguna comparable lo dice en vez de callarse: los
/// pesos cambian entre open y pro, y un tiempo de una no vale para la otra.
///
/// Es un fragmento, no una tarjeta: vive DENTRO de «Tu carrera», que ya enseña
/// el objetivo. Repetirlo en una tarjeta aparte sería decir dos veces lo mismo.
struct FreeGoalComparison: View {
    let check: FreeGoalCheck

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let best = check.comparableBest, let delta = check.deltaSeconds {
                comparison(best: best, delta: delta)
            } else {
                Text(noComparisonCopy)
                    .scaledFont(12.5, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func comparison(best: FreeFinishEvidence, delta: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Tu mejor en la misma categoría")
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                Spacer(minLength: 4)
                Text(FreePlanEvidenceCopy.time(best.totalSeconds))
                    .font(.system(size: 16, weight: .heavy).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
            }
            Text(verdict(best: best, delta: delta))
                .scaledFont(12.5, weight: .semibold, relativeTo: .caption)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// `delta = objetivo − mejor`. Positivo quiere decir que el objetivo es MÁS
    /// LENTO de lo que ya ha corrido, que es una conversación bastante mejor que
    /// la de siempre.
    private func verdict(best: FreeFinishEvidence, delta: Int) -> String {
        let gap = FreePlanEvidenceCopy.time(abs(delta))
        let when = FreePlanEvidenceCopy.whereWhen(best.race)
        if delta > 0 {
            return "Ya fuiste \(gap) más rápido que eso en \(when). Tu objetivo se te ha quedado corto."
        }
        if delta < 0 {
            return "Te faltan \(gap) desde tu mejor marca en \(when)."
        }
        return "Vas exactamente a tu objetivo, con lo que hiciste en \(when)."
    }

    private var noComparisonCopy: String {
        switch check.notComparableReason {
        case "formato_distinto":
            let category = FreePlanEvidenceCopy.categoryLabel(check.target) ?? "esta categoría"
            return "No te comparamos con tus carreras porque ninguna fue en \(category), y ahí cambian los pesos. Un tiempo de otra categoría no te diría la verdad."
        default:
            return "Cuando corras una en esta categoría te decimos cuánto te falta."
        }
    }
}
