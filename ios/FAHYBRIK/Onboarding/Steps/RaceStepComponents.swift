import SwiftUI

// Shared building blocks for the two race onboarding steps (ImportHistoryStep,
// ObjectiveStep). One source of truth for the "tap to open a flow" action card,
// the green "done" confirmation, and the small inline link — so both steps read
// identically and match the Carreras sheets' visual language (orange-as-text,
// surface cards, hairline borders). Light+dark off Theme tokens.

/// A tappable action card — icon + title + subtitle + chevron. Reads as "tap to
/// open the import / calendar flow" without competing with StepShell's footer
/// PrimaryButton (which is the full-width orange "Siguiente").
struct RaceActionCard: View {
    let icon: String
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            action()
        } label: {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .scaledFont(18, weight: .semibold, relativeTo: .body)
                    .foregroundStyle(Theme.Color.accentText)
                    .frame(minWidth: 40, minHeight: 40)
                    .background(Theme.Color.accent.opacity(0.10))
                    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .scaledFont(16, weight: .semibold, relativeTo: .body)
                        .foregroundStyle(Theme.Color.foreground)
                    Text(subtitle)
                        .scaledFont(12, relativeTo: .caption)
                        .foregroundStyle(Theme.Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: Theme.Spacing.s)
                Image(systemName: "chevron.right")
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.faint)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title). \(subtitle)")
        .accessibilityAddTraits(.isButton)
    }
}

/// The green "done" confirmation — reads as "already set", mirrors the
/// TargetBadge / okTint language used across the Carreras hub.
struct RaceDoneCard: View {
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: Theme.Spacing.m) {
            Image(systemName: "checkmark.seal.fill")
                .scaledFont(20, weight: .semibold, relativeTo: .title3)
                .foregroundStyle(Theme.Color.ok)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .scaledFont(16, weight: .semibold, relativeTo: .body)
                    .foregroundStyle(Theme.Color.foreground)
                Text(subtitle)
                    .scaledFont(12, relativeTo: .caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: Theme.Spacing.s)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.okTint)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.ok.opacity(0.30), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// Small secondary affordance ("Buscar de nuevo", "Cambiar", "Añádela a mano") —
/// orange-as-text, centered, with an optional leading SF Symbol.
struct RaceInlineLink: View {
    let icon: String?
    let title: String
    let action: () -> Void

    init(icon: String? = nil, title: String, action: @escaping () -> Void) {
        self.icon = icon
        self.title = title
        self.action = action
    }

    var body: some View {
        Button {
            Haptics.light()
            action()
        } label: {
            HStack(spacing: 6) {
                if let icon {
                    Image(systemName: icon)
                        .scaledFont(12, weight: .semibold, relativeTo: .caption)
                }
                Text(title)
                    .scaledFont(13, weight: .semibold, relativeTo: .footnote)
                    .multilineTextAlignment(.center)
            }
            .foregroundStyle(Theme.Color.accentText)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .buttonStyle(PressScaleStyle())
    }
}
