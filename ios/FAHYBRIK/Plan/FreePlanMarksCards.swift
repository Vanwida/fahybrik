import SwiftUI

// Las marcas dentro del Plan free — las dos tarjetas que hacen de espejo del
// atleta, extraídas de FreePlanView para que cada pieza quepa de un vistazo:
//
//   · FreePlanStartersCard — las tres de arranque (1 km, remo 500, ski 1.000)
//     para quien todavía no ha medido nada. Cada paso abre «Probarme».
//   · FreePlanMarksCard    — lo que YA tiene medido (con su fecha) y lo que le
//     falta del catálogo. Nada se inventa: los rótulos, los tiempos y el
//     "~4 min" salen del catálogo del servidor (GET /api/athlete/marks).
//
// Ambas empujan a `MarkDetailView`, así que se renderizan dentro del
// NavigationStack de FreePlanView.

/// Las tres de arranque, numeradas como pasos. `steps` ya viene resuelto contra
/// el catálogo del servidor: un slug que el backend no ofrezca no llega aquí.
struct FreePlanStartersCard: View {
    let steps: [MarkView]
    let bearer: String?
    let hrMaxSource: HRMaxSource?

    var body: some View {
        CardSurface(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Si aún no has corrido ninguna, empieza por medirte")
                    .scaledFont(12.5, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                    .padding(.bottom, 10)
                ForEach(Array(steps.enumerated()), id: \.element.id) { index, mark in
                    row(index: index + 1, mark: mark)
                    if index < steps.count - 1 {
                        Hairline().padding(.leading, 49)
                    }
                }
            }
        }
    }

    private func row(index: Int, mark: MarkView) -> some View {
        NavigationLink {
            MarkDetailView(slug: mark.slug, bearer: bearer, hrMaxSource: hrMaxSource)
        } label: {
            HStack(alignment: .top, spacing: 11) {
                Text("\(index)")
                    .font(.system(size: 11, weight: .heavy).monospacedDigit())
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(width: 22, height: 22)
                    .background(Theme.Color.accent.opacity(0.14))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.s, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(mark.label)
                        .scaledFont(13.5, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(FreePlanCopy.howItsMeasured(mark))
                        .scaledFont(11.5, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 6)
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Paso \(index). \(mark.label). \(FreePlanCopy.howItsMeasured(mark))")
    }
}

/// El retrato de marcas: lo medido arriba (valor + cuándo), lo pendiente debajo.
/// Cualquiera de las dos listas puede venir vacía y la tarjeta sigue leyéndose.
struct FreePlanMarksCard: View {
    let measured: [MarkView]
    let missing: [MarkView]
    let bearer: String?
    let hrMaxSource: HRMaxSource?

    var body: some View {
        CardSurface(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                header
                ForEach(measured) { mark in
                    measuredRow(mark)
                    if mark.id != measured.last?.id { Hairline().padding(.leading, 16) }
                }
                if !missing.isEmpty {
                    // NO es una lista de deberes: cada fila dice qué DESBLOQUEA.
                    // Pedir por pedir, después de que el atleta ya nos haya dado
                    // sus carreras, es exactamente lo que hacía sorda la pantalla.
                    Text("Lo que aún no hemos medido")
                        .scaledFont(11, weight: .semibold, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.faint)
                        .padding(.horizontal, 16)
                        .padding(.top, measured.isEmpty ? 0 : 12)
                        .padding(.bottom, 4)
                    ForEach(missing) { mark in
                        missingRow(mark)
                    }
                }
                Color.clear.frame(height: 8)
            }
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            LabelText(text: "Tus marcas")
            Spacer(minLength: 8)
            NavigationLink {
                MarksLibraryView(bearer: bearer, hrMaxSource: hrMaxSource)
            } label: {
                HStack(spacing: 3) {
                    Text("Todas")
                        .font(.system(size: 11, weight: .bold))
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                }
                .foregroundStyle(Theme.Color.accentText)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Ver todas tus marcas")
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 10)
    }

    private func measuredRow(_ mark: MarkView) -> some View {
        NavigationLink {
            MarkDetailView(slug: mark.slug, bearer: bearer, hrMaxSource: hrMaxSource)
        } label: {
            HStack(spacing: Theme.Spacing.s) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(mark.label)
                        .scaledFont(13.5, weight: .semibold, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1)
                    if let when = mark.best.flatMap({ MarkFormat.relative($0.recordedAt) }) {
                        Text(when)
                            .scaledFont(11, relativeTo: .caption2)
                            .foregroundStyle(Theme.Color.faint)
                    }
                }
                Spacer(minLength: 8)
                if let best = mark.best {
                    Text(MarkFormat.value(mark, best.value))
                        .font(.system(size: 15, weight: .bold, design: .monospaced))
                        .foregroundStyle(Theme.Color.foreground)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel(mark))
    }

    private func missingRow(_ mark: MarkView) -> some View {
        NavigationLink {
            MarkDetailView(slug: mark.slug, bearer: bearer, hrMaxSource: hrMaxSource)
        } label: {
            HStack(alignment: .top, spacing: Theme.Spacing.s) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(mark.label)
                        .scaledFont(13, relativeTo: .subheadline)
                        .foregroundStyle(Theme.Color.foreground.opacity(0.9))
                        .lineLimit(1)
                    Text(FreePlanCopy.unlocks(mark))
                        .scaledFont(11, relativeTo: .caption2)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                // "te lleva ~4-5 min": el catálogo manda la DURACIÓN del test, y
                // suelta al lado del nombre se leía como si fuera SU marca.
                Text(FreePlanCopy.takesAbout(mark))
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.faint)
                    .lineLimit(1)
                    .padding(.top, 1)
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
                    .padding(.top, 2)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(mark.label), aún sin medir. \(FreePlanCopy.unlocks(mark)). \(FreePlanCopy.takesAbout(mark)).")
    }

    private func accessibilityLabel(_ mark: MarkView) -> String {
        var parts = [mark.label]
        if let best = mark.best {
            parts.append(MarkFormat.value(mark, best.value))
            if let when = MarkFormat.relative(best.recordedAt) { parts.append(when) }
        }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Copy + constants del Plan free
//
// Cada slug / umbral del que depende la pantalla, nombrado UNA vez. Los rótulos
// de las marcas NUNCA se repiten aquí: vienen del catálogo del servidor.
enum FreePlanCopy {
    /// Las tres marcas de arranque del mockup aprobado, en orden: el 1 km, el
    /// remo 500 y el ski 1.000. Slugs del catálogo (shared/domain/athlete/marks.ts);
    /// un slug que el backend no ofrezca simplemente no se pinta.
    static let starterSlugs = ["run_1k", "row_500m", "ski_1k"]
    /// La serie biométrica del VO₂ máx (lib/athlete/biometric-trend.ts).
    static let vo2Key = "vo2max"
    /// Como mucho se nombran estas marcas pendientes antes del "y N más".
    static let maxMissingListed = 3
    /// A partir de estos días, la cuenta atrás se lee en semanas y no en días.
    static let weeksFromDays = 14

    /// Posición de un slug en el orden de arranque; el resto va después.
    static func starterRank(_ slug: String) -> Int {
        starterSlugs.firstIndex(of: slug) ?? starterSlugs.count
    }

    /// Cómo mide la app esa marca, en lenguaje de gimnasio — cero jerga.
    static func howItsMeasured(_ mark: MarkView) -> String {
        let how: String
        switch mark.erg {
        case "row": how = "Con el remo conectado, la app lo mide sola"
        case "ski": how = "Con el ski conectado, la app lo mide sola"
        default:    how = "Calle o cinta, la app lo mide sola"
        }
        return "\(how) · \(takesAbout(mark))"
    }

    /// "te lleva ~4-5 min". El catálogo del servidor manda cuánto DURA el test
    /// (`approx_label`); suelto junto al nombre de la marca se leía como si fuera
    /// el tiempo del atleta. Una sola frase, aquí, para los dos sitios que lo usan.
    static func takesAbout(_ mark: MarkView) -> String {
        // Las distancias que se registran (10 km, media, maratón) no se miden en
        // la app: su etiqueta ya es una instrucción, no una duración.
        guard mark.measuredBy != "registered" else { return mark.approxLabel }
        return "te lleva \(mark.approxLabel)"
    }

    /// Qué gana el atleta midiéndola. Una marca pendiente NO es una tarea suelta:
    /// es la pieza que le falta al plan, y se dice cuál.
    static func unlocks(_ mark: MarkView) -> String {
        switch mark.erg {
        case "row": return "Mídelo y tu semana gana la sesión de remo"
        case "ski": return "Mídelo y tu semana gana la sesión de ski"
        default: break
        }
        return mark.measuredBy == "registered"
            ? "Apúntala y afinamos los ritmos de tu semana"
            : "Mídelo y afinamos los ritmos de tu semana"
    }

    /// El nombre de la marca tal y como se lee dentro del botón ("Empezar por el 1 km").
    static func ctaName(_ mark: MarkView) -> String {
        "el \(mark.label.lowercased())"
    }

    /// Iniciales para el avatar del coach; vacías (→ glifo de persona) sin nombre.
    static func initials(_ name: String?) -> String {
        guard let name else { return "" }
        return name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }

    static func firstName(_ name: String) -> String {
        name.split(separator: " ").first.map(String.init) ?? name
    }

    /// Una lectura biométrica tal y como se imprime (decimal solo si lo tiene).
    static func number(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }
}
