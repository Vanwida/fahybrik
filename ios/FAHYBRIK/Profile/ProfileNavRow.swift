import SwiftUI

/// Fila estándar de Perfil: icono, título, subtítulo y chevron. Reutilizada en
/// las pantallas anidadas (Entreno, Cuenta, Ayuda) y en la puerta raíz.
struct ProfileNavRow: View {
    let icon: String
    let title: String
    let subtitle: String
    var showsChevron: Bool = true

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(subtitle)
                    .scaledFont(11, relativeTo: .caption2)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(subtitle)")
        .accessibilityAddTraits(showsChevron ? .isButton : [])
    }
}

/// Puerta raíz del Perfil: una fila dentro de tarjeta que abre una pantalla anidada.
struct ProfileDoorRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        ProfileNavRow(icon: icon, title: title, subtitle: subtitle)
    }
}

/// Fila label-left / value-right de la tarjeta de identidad (modalidad, suscripción…).
struct SettingValueRow: View {
    let label: String
    let value: String
    var valueColor: Color = Theme.Color.foreground
    var showsChevron: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            Text(label)
                .scaledFont(13, relativeTo: .footnote)
                .foregroundStyle(Theme.Color.muted)
            Spacer(minLength: 12)
            Text(value)
                .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                .foregroundStyle(valueColor)
                .multilineTextAlignment(.trailing)
                .lineLimit(2)
            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Color.faint)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(value)")
        .accessibilityAddTraits(showsChevron ? .isButton : [])
    }
}
