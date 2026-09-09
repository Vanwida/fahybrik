import SwiftUI

// MARK: - Conecta tu cinta — the ONE treadmill connect screen
//
// Shared between the treadmill HUD's not-connected state and mid-run reconnect.
// Same heading, how-to, "Buscar mi cinta" primary, "Correr sin conectar" escape.
// FH-95: no ▶ Empezar here — live starts only on PreWorkoutPrepareView.
struct TreadmillConnectGuide: View {
    let link: DeviceLink
    /// "Buscar mi cinta" — scan + the shared picker (or reopen it while busy).
    let onSearch: () -> Void
    /// "Correr sin conectar" — run anyway (HUD: back to the phone HUD).
    let onSkip: () -> Void
    /// HUD-only: share the FTMS dump for an unrecognized machine. Hidden when nil.
    var onShareDiagnostics: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.l) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                    Text("Conecta tu cinta")
                        .font(.system(size: 28, weight: .heavy, design: .default).italic())
                        .foregroundStyle(Theme.Color.foreground)

                    if link.isLive {
                        connectedCard
                    } else {
                        if link == .lost { lostCard }
                        howToCard
                        if isBusy { busyLine }
                    }

                    compatibilityNote

                    if let onShareDiagnostics, !link.isLive {
                        Button(action: onShareDiagnostics) {
                            Text("Compartir diagnóstico")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.Color.accentText)
                        }
                        .buttonStyle(PressScaleStyle())
                    }
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .frame(maxHeight: .infinity)

            if !link.isLive {
                ExpertPrimaryButton(title: "Buscar mi cinta", height: 56, action: onSearch)
            }
            SecondaryButton(title: "Correr sin conectar", action: onSkip)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var connectedCard: some View {
        CardSurface(padding: Theme.Spacing.m) {
            HStack(spacing: Theme.Spacing.m) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Theme.Color.ok)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Conectada · \(link.deviceName ?? "cinta")")
                        .font(Theme.Typography.bodyEmph)
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Text("Ritmo y distancia en vivo desde la cinta")
                        .font(Theme.Typography.caption)
                        .foregroundStyle(Theme.Color.muted)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var lostCard: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Theme.Color.warning)
            VStack(alignment: .leading, spacing: 2) {
                Text("Se perdió la conexión con la cinta")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Puedes seguir corriendo. Si quieres volver a conectarla, búscala y elígela otra vez.")
                    .font(Theme.Typography.caption)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.warningTint)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var howToCard: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            guideRow(1, "Enciende la cinta y ponla en su pantalla principal.")
            guideRow(2, "Si tiene ajuste de Bluetooth, actívalo.")
            guideRow(3, "Acércate; aparecerá con su nombre.")
        }
        .padding(Theme.Spacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    private func guideRow(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(n)")
                .font(.system(size: 13, weight: .heavy, design: .monospaced))
                .foregroundStyle(Theme.Color.accentText)
                .frame(width: 24, height: 24)
                .background(Theme.Color.surfaceSunken)
                .clipShape(Circle())
            Text(text)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var busyLine: some View {
        HStack(spacing: Theme.Spacing.s) {
            ProgressView().tint(Theme.Color.accent).scaleEffect(0.85)
            Text(busyWord)
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
        }
    }

    private var busyWord: String {
        switch link {
        case .connecting: return "Conectando…"
        default:          return "Buscando tu cinta…"
        }
    }

    private var isBusy: Bool {
        switch link {
        case .scanning, .connecting: return true
        default: return false
        }
    }

    private var compatibilityNote: some View {
        Text("Por ahora, cintas Titanium y compatibles Bluetooth FTMS. Si la tuya no aparece, corre sin conectar: cuenta el reloj en indoor.")
            .font(Theme.Typography.caption)
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
    }
}
