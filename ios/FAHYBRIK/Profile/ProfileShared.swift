import SwiftUI
import UIKit

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
// El selector de apariencia: un carril hundido con el segmento activo levantado en el acento del club
// (con su tinta encima) y los demás en apoyo. Cada segmento es un objetivo de 44 pt.
struct ThemeModePicker: View {
    @Binding var selection: ThemeMode

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            ForEach(ThemeMode.allCases) { mode in
                segment(mode)
            }
        }
        .padding(Theme.Spacing.xs)
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
                .papel(.notaFuerte)
                .foregroundStyle(active ? Theme.Color.accentOn : Theme.Color.muted)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 44)
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

// MARK: - Hojas de lectura

/// «Cómo se construye tu plan»: lo que hace el coach, en tres ideas.
struct MethodologySheet: View {
    var body: some View {
        PantallaPerfil(titulo: "Cómo se construye tu plan", cierre: .cerrar) {
            Text("Tu coach diseña tu entrenamiento en microciclos: bloques de varias semanas, cada uno con un objetivo. El nombre y el foco de cada microciclo los decide tu coach según tu nivel y tu carrera.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            GrupoPerfil {
                principio(
                    titulo: "Microciclos",
                    texto: "Bloques de varias semanas con un foco concreto. Avanzas de uno al siguiente conforme te acercas a tu carrera."
                )
                principio(
                    titulo: "Semana a semana",
                    texto: "Cada semana se publica cuando le toca. Te centras en lo que tienes delante, no en el plan entero de golpe."
                )
                principio(
                    titulo: "Se adapta a ti",
                    texto: "Tu coach revisa cómo respondes —carga, recuperación, resultados— y ajusta lo que viene."
                )
            }
            NotaPerfil("El nombre de tu microciclo actual y la semana en la que estás los fija tu coach, y los ves en la pestaña Plan.")
        }
    }

    private func principio(titulo: String, texto: String) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(titulo).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
            Text(texto)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.l)
    }
}

/// Quién es tu coach y qué hace por tu plan.
struct CoachSheet: View {
    let coachName: String?

    private var displayName: String { coachName ?? "Tu coach" }

    private var initial: String? {
        guard let first = coachName?.first else { return nil }
        return String(first).uppercased()
    }

    var body: some View {
        PantallaPerfil(titulo: displayName, sobretitulo: "Coach", cierre: .cerrar) {
            avatar
            Text("\(displayName) escribe la metodología detrás de tu plan. Cada entreno que ves se basa en una plantilla validada por tu coach, ajustada a tu carga de entrenamiento, a cómo llegas cada día y a tus puntos débiles en cada estación.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// La inicial de tu coach en un círculo (sin nombre, la silueta).
    private var avatar: some View {
        ChapitaDia(tam: 64) {
            if let initial {
                Text(initial).papel(.dato)
            } else {
                IconoDia(.silueta, tam: 26)
            }
        }
    }
}

/// Un texto legal a pantalla entera: términos, política.
struct LegalSheet: View {
    let title: String
    let bodyText: String

    var body: some View {
        PantallaPerfil(titulo: title, cierre: .cerrar) {
            Text(bodyText)
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
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

// MARK: - Export Share Sheet plumbing
//
// Identifiable wrapper so `.sheet(item:)` re-creates the Share Sheet for every
// new export instead of caching the previous fileURL.
struct ExportShareItem: Identifiable {
    let id = UUID()
    let fileURL: URL
}

// UIActivityViewController bridge for SwiftUI. Used by both the data-export
// flow (Files / AirDrop / Mail) and any future RGPD attachments.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
