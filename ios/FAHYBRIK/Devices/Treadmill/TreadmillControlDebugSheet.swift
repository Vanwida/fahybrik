import SwiftUI

// "Modo de control" — the field-diagnosis screen for a belt that will not obey.
//
// WHY IT EXISTS: he tests alone in a gym, and every wrong guess about the control dialect
// used to cost a build, a TestFlight and another trip. This screen makes ONE visit
// conclusive: force each prelude rung by hand, fire a single test speed, and watch whether
// the belt moves. Same for the two possible meanings of the Inclination field — ask for
// one, read the machine's own raw number back, and see which interpretation it answered in.
//
// Everything here is COMMAND DIALECT ONLY. Nothing on this screen connects to anything:
// it drives the belt that is already connected, or it does nothing at all.
//
// The hex shown is byte-for-byte what he would type into nRF Connect on characteristic
// 0x2AD9, so if a manual write moves the belt and ours doesn't, the two traces are
// directly comparable and the difference IS the bug.
struct TreadmillControlDebugSheet: View {
    let model: TreadmillHUDModel
    @Environment(\.dismiss) private var dismiss
    @State private var showShare = false
    /// nil = the automatic ladder is driving; a value = he pinned that rung.
    @State private var pinnedStrategy: FTMSControlStrategy?
    @State private var pinnedDialect: FTMSInclineDialect?

    /// The speed used by the one-tap test. Low enough to be safe to stand next to, high
    /// enough that a belt moving to it is unmistakable.
    private static let testSpeedKmh: Double = 6
    /// The incline the units test asks for, in each interpretation's own unit.
    private static let testInclineValue: Double = 3

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    intro
                    liveReadback
                    strategySection
                    inclineSection
                    shareSection
                }
                .padding(Theme.Spacing.m)
            }
            .background(Theme.Color.background.ignoresSafeArea())
            .navigationTitle("Modo de control")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                        .foregroundStyle(Theme.Color.accentText)
                }
            }
        }
        .sheet(isPresented: $showShare) {
            if let text = model.diagnosticsText { ShareSheet(items: [text]) }
        }
    }

    // MARK: - What the app is doing right now

    private var intro: some View {
        card {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Qué está haciendo la app", size: 10)
                factRow("Modo en uso", model.controlStrategy.label)
                factRow("Inclinación leída como", model.controlInclineDialect.label)
                factRow("Bytes a 0x2AD9", model.controlStrategy.wireHint)
                Text("Prueba un modo, dale a «Probar \(Int(Self.testSpeedKmh)) km/h» y mira la cinta. "
                     + "El que la mueva es el bueno.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
            }
        }
    }

    /// The belt's OWN numbers. This is the verdict on every test below: if these move,
    /// the machine heard us.
    private var liveReadback: some View {
        card {
            VStack(alignment: .leading, spacing: 8) {
                LabelText(text: "Lo que dice la cinta", size: 10)
                HStack(spacing: 10) {
                    readback("Velocidad real",
                             model.latest.speedKmh.map { String(format: "%.1f", $0) } ?? "—", "km/h")
                    readback("Inclinación cruda",
                             model.liveInclineRaw.map { String(Int($0.rounded())) } ?? "—", "")
                }
                Text(inclineHint)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var inclineHint: String {
        guard let raw = model.liveInclineRaw else {
            return "La cinta todavía no ha mandado inclinación."
        }
        return String(format: "Cruda %d → si fuera %% sería %.1f %%; si fuera nivel sería %.1f.",
                      Int(raw.rounded()), raw / 10, FTMSInclineLevels.level(forRaw: raw))
    }

    // MARK: - The prelude ladder

    private var strategySection: some View {
        card {
            VStack(alignment: .leading, spacing: 10) {
                LabelText(text: "Forzar un modo (S1…S5)", size: 10)
                ForEach(FTMSControlStrategy.allCases, id: \.self) { strategy in
                    strategyRow(strategy)
                }
                Button {
                    pinnedStrategy = nil
                    model.forceControlStrategy(nil)
                } label: {
                    Text("Volver a automático")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                .buttonStyle(PressScaleStyle())
                .padding(.top, 2)

                Button {
                    model.sendTestSpeed(Self.testSpeedKmh)
                } label: {
                    Text("PROBAR \(Int(Self.testSpeedKmh)) KM/H")
                        .font(.system(size: 16, weight: .heavy, design: .default).italic())
                        .tracking(0.6)
                        .foregroundStyle(Theme.Color.accentOn)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Theme.Color.accent)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
                }
                .buttonStyle(PressScaleStyle())
                .padding(.top, 4)
                Text("Agárrate antes: si el modo es el correcto, la banda arranca.")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Color.warning)
            }
        }
    }

    private func strategyRow(_ strategy: FTMSControlStrategy) -> some View {
        let isPinned = pinnedStrategy == strategy
        let isLive = model.controlStrategy == strategy
        return Button {
            pinnedStrategy = strategy
            model.forceControlStrategy(strategy)
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Text(strategy.rung)
                    .font(.system(size: 13, weight: .heavy, design: .monospaced))
                    .foregroundStyle(isPinned ? Theme.Color.accentOn : Theme.Color.accentText)
                    .frame(width: 30, height: 24)
                    .background(isPinned ? Theme.Color.accent : Theme.Color.surfaceSunken)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(strategy.label)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                        .multilineTextAlignment(.leading)
                    Text(strategy.wireHint)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Theme.Color.muted)
                }
                Spacer(minLength: 0)
                if isLive {
                    Image(systemName: "dot.radiowaves.left.and.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Theme.Color.accentText)
                        .accessibilityLabel("En uso ahora")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
            .background(isPinned ? Theme.Color.accent.opacity(0.10) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
    }

    // MARK: - The units question

    private var inclineSection: some View {
        card {
            VStack(alignment: .leading, spacing: 10) {
                LabelText(text: "Inclinación: ¿% o nivel?", size: 10)
                Text("Pide una y mira arriba qué número CRUDO devuelve la cinta. "
                     + "Si pides «% 3» y responde ~30, habla en %. Si responde ~200, habla en niveles.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 8) {
                    inclineTestButton(.grade, caption: "Pedir 3 %", hint: "03 1E 00")
                    inclineTestButton(.level, caption: "Pedir nivel 3", hint: "03 C8 00")
                }
                HStack(spacing: 8) {
                    dialectPinButton(.grade)
                    dialectPinButton(.level)
                }
                Button {
                    pinnedDialect = nil
                    model.forceInclineDialect(nil)
                } label: {
                    Text("Volver a automático")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.Color.accentText)
                }
                .buttonStyle(PressScaleStyle())
            }
        }
    }

    private func inclineTestButton(_ dialect: FTMSInclineDialect,
                                   caption: String, hint: String) -> some View {
        Button {
            model.sendTestIncline(Self.testInclineValue, dialect: dialect)
        } label: {
            VStack(spacing: 3) {
                Text(caption)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.Color.foreground)
                Text(hint)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Theme.Color.muted)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(Theme.Color.surfaceElevated)
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                .stroke(Theme.Color.hairlineStrong, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
    }

    private func dialectPinButton(_ dialect: FTMSInclineDialect) -> some View {
        let isPinned = pinnedDialect == dialect
        return Button {
            pinnedDialect = dialect
            model.forceInclineDialect(dialect)
        } label: {
            Text(dialect == .grade ? "Fijar en %" : "Fijar en niveles")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(isPinned ? Theme.Color.accentOn : Theme.Color.foreground)
                .frame(maxWidth: .infinity)
                .frame(height: 38)
                .background(isPinned ? Theme.Color.accent : Theme.Color.surfaceSunken)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
        }
        .buttonStyle(PressScaleStyle())
    }

    // MARK: - Share

    private var shareSection: some View {
        Button { showShare = true } label: {
            Text("Compartir diagnóstico completo")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Color.accentText)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous)
                    .stroke(Theme.Color.hairlineStrong, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(model.diagnosticsText == nil)
        .opacity(model.diagnosticsText == nil ? 0.4 : 1)
    }

    // MARK: - Bits

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(Theme.Spacing.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous))
    }

    private func factRow(_ key: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(key)
                .font(.system(size: 11))
                .foregroundStyle(Theme.Color.muted)
            Text(value)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func readback(_ label: String, _ value: String, _ unit: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            LabelText(text: label, size: 9)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .font(.system(size: 30, weight: .heavy, design: .monospaced).monospacedDigit())
                    .foregroundStyle(Theme.Color.foreground)
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Color.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Theme.Color.surfaceSunken)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.m, style: .continuous))
    }
}
