import SwiftUI

// MARK: - Horizontal container clamp
//
// A vertical `ScrollView` measures its content's WIDTH from the widest descendant.
// Pinning the content to the container's exact width caps horizontal contentSize.
// Applied OUTSIDE the content's own `.padding(...)` so the padded content measures
// exactly the viewport width (padding included), never wider.
//
// Internal (not fileprivate) — FH-88 split Profile across files; every Profile
// screen applies this clamp on its scroll content.
extension View {
    func clampedToContainerWidth() -> some View {
        containerRelativeFrame(.horizontal)
    }
}

// MARK: - Theme mode segmented control
//
// On-brand segmented control for the appearance override — a recessed track with
// the active segment lifted on the Fabrik-orange pill (accentOn text = the valid
// 4.57:1 brown-on-orange pairing), inactive segments muted.
struct ThemeModePicker: View {
    @Binding var selection: ThemeMode

    var body: some View {
        HStack(spacing: 4) {
            ForEach(ThemeMode.allCases) { mode in
                segment(mode)
            }
        }
        .padding(4)
        .background(Theme.Color.surfaceSunken)
        .clipShape(Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Apariencia")
    }

    private func segment(_ mode: ThemeMode) -> some View {
        let active = selection == mode
        return Button {
            guard !active else { return }
            Haptics.light()
            withAnimation(.easeInOut(duration: 0.18)) { selection = mode }
        } label: {
            Text(mode.label)
                .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                .foregroundStyle(active ? Theme.Color.accentOn : Theme.Color.muted)
                .frame(maxWidth: .infinity)
                .frame(height: 34)
                .background {
                    if active {
                        Capsule().fill(Theme.Color.accent)
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(mode.label)
        .accessibilityAddTraits(active ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - Sheet content

struct MethodologySheet: View {
    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Cómo se construye tu plan")
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Text("Tu coach diseña tu entrenamiento en microciclos: bloques de varias semanas, cada uno con un objetivo. El nombre y el foco de cada microciclo los decide tu coach según tu nivel y tu carrera.")
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                    principleCard(
                        title: "Microciclos",
                        text: "Bloques de varias semanas con un foco concreto. Avanzas de uno al siguiente conforme te acercas a tu carrera."
                    )
                    principleCard(
                        title: "Semana a semana",
                        text: "Cada semana se publica cuando le toca. Te centras en lo que tienes delante, no en el plan entero de golpe."
                    )
                    principleCard(
                        title: "Se adapta a ti",
                        text: "Tu coach revisa cómo respondes —carga, recuperación, resultados— y ajusta lo que viene."
                    )
                    Text("El nombre de tu microciclo actual y la semana en la que estás los fija tu coach, y los ves en la pestaña Plan.")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                }
                .padding(20)
                .clampedToContainerWidth()
            }
        }
        .dismissableSheet()
    }

    private func principleCard(title: String, text: String) -> some View {
        CardSurface(padding: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .scaledFont(14, weight: .heavy, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.accentText)
                Text(text)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
    }
}

struct CoachSheet: View {
    let coachName: String?

    private var displayName: String { coachName ?? "Tu coach" }

    private var initial: String? {
        guard let first = coachName?.first else { return nil }
        return String(first).uppercased()
    }

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle().fill(Theme.Color.surface).frame(width: 64, height: 64)
                            if let initial {
                                Text(initial)
                                    .font(.system(size: 20, weight: .heavy, design: .default).italic())
                                    .foregroundStyle(Theme.Color.foreground)
                            } else {
                                Image(systemName: "person.fill")
                                    .font(.system(size: 22, weight: .semibold))
                                    .foregroundStyle(Theme.Color.muted)
                            }
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(displayName)
                                .font(Theme.Typography.headlineS)
                                .foregroundStyle(Theme.Color.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                            Text("Coach")
                                .scaledFont(12, relativeTo: .caption)
                                .foregroundStyle(Theme.Color.muted)
                        }
                    }
                    Text("\(displayName) escribe la metodología detrás de tu plan. Cada workout que ves se basa en una plantilla validada por tu coach, ajustada a tu CTL/ATL/TSB y a tus weaknesses por estación.")
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.foreground)
                }
                .padding(20)
                .clampedToContainerWidth()
            }
        }
        .dismissableSheet()
    }
}

struct LegalSheet: View {
    let title: String
    let bodyText: String

    var body: some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(title)
                        .font(Theme.Typography.headlineS)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(bodyText)
                        .scaledFont(13, relativeTo: .footnote)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(20)
                .clampedToContainerWidth()
            }
        }
        .dismissableSheet()
    }
}

enum LegalCopy {
    static var privacy: String {
        "\(Marca.nombre) procesa datos biométricos (HR, HRV, sueño, peso) para construir tu plan. No los compartimos con terceros sin tu consentimiento explícito.\n\nLa versión completa está disponible en \(Marca.privacidadTexto). Si tienes dudas, escribe a \(Marca.soporteEmail)."
    }

    static func terms(hasCoach: Bool) -> String {
        if hasCoach {
            return "El uso de \(Marca.nombre) implica aceptar nuestros términos de servicio: la metodología es propiedad de tu coach. Tu suscripción se renueva mensualmente y puedes cancelarla desde la sección Suscripción.\n\nLa versión completa está disponible en \(Marca.terminosTexto)."
        }
        return "El uso de \(Marca.nombre) implica aceptar nuestros términos de servicio. Tu cuenta es gratuita y tus datos son tuyos: puedes exportarlos o eliminar tu cuenta cuando quieras desde Perfil.\n\nLa versión completa está disponible en \(Marca.terminosTexto)."
    }
}

// MARK: - Goal-type + language label helpers

enum GoalTypeOption: String, CaseIterable {
    case firstHyrox       = "first_hyrox"
    case improveHyroxMark = "improve_hyrox_mark"
    case improveRunning   = "improve_running"
    case completeFun      = "complete_fun"
    case other            = "other"

    var label: String {
        switch self {
        case .firstHyrox:       return "Mi primer HYROX"
        case .improveHyroxMark: return "Mejorar mi marca de HYROX"
        case .improveRunning:   return "Mejorar mi carrera"
        case .completeFun:      return "Completar y disfrutar"
        case .other:            return "Otro"
        }
    }
}

func goalTypeLabel(_ type: String?) -> String {
    guard let type else { return "Sin definir" }
    return GoalTypeOption(rawValue: type)?.label ?? "Sin definir"
}

func languageLabel(_ code: String?) -> String? {
    switch code {
    case "es": return "Español"
    case "en": return "English"
    default:   return nil
    }
}
