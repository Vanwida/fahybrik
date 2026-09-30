import SwiftUI

// Tests guiados — el momento «Récord del test». Sale sobre el paso final de la hoja de captura cuando el
// puente reporta al menos una marca que BATIÓ la anterior (`improved`, calculado en el servidor). A
// propósito con la misma voz nocturna y dorada que la superposición del récord de carrera
// (`PRCelebrationView` / `CelebrationGold`): un récord es un récord. El texto es propio del test y cada
// número es real — valor y cambio salen tal cual de la respuesta.
//
// LA EXCEPCIÓN AL TEMA ÚNICO (CONTRATO-UI §6.4). Es un momento nocturno: fuerza el oscuro para que el
// dorado se lea también con el tema claro, igual que el récord de carrera. Es un momento, no una pantalla,
// y el dorado es el color del logro, no el del club: no lo toca el tenant.
struct TestRecordCelebrationView: View {
    struct Item: Identifiable {
        let id: String        // slug del benchmark
        let label: String     // etiqueta del resultado que puso el coach («5K», «Sentadilla»)
        let valueText: String // «22:14» / «142,5 kg»
        let deltaText: String?
    }

    let items: [Item]
    let onDone: () -> Void

    @State private var appear = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// El velo que apaga lo de debajo para que el logro sea lo único que brilla.
    private static let opacidadDelVelo: Double = 0.94
    /// La tinta sobre el dorado: negro suave, que sobre el degradado mide más de 7:1.
    private static let opacidadDeLaTintaSobreOro: Double = 0.78

    /// Las marcas mejoradas de la respuesta, como elementos que se pueden pintar, a través del contrato del
    /// propio test (etiqueta y unidad por slug). Pura — con su prueba.
    static func items(
        from entries: [RecordBatteryResult.EntryDelta],
        specs: [StoreResultSpec]
    ) -> [Item] {
        entries.map { entry in
            let spec = specs.first { $0.slug == entry.slug }
            let unit = spec?.unit ?? ""
            let delta = entry.prevValue.map { prev in
                "\(BenchmarkDelta.deltaLabel(unit: unit, delta: entry.value - prev)) vs tu marca anterior"
            }
            return Item(
                id: entry.slug,
                label: spec?.label ?? entry.slug,
                valueText: BenchmarkDelta.valueLabel(unit: unit, value: entry.value),
                deltaText: delta
            )
        }
    }

    var body: some View {
        ZStack {
            SwiftUI.Color.black.opacity(Self.opacidadDelVelo)
                .ignoresSafeArea()
                .onTapGesture { onDone() }
                .accessibilityHidden(true)

            ScrollView {
                VStack(spacing: Theme.Spacing.l) {
                    medal
                    VStack(spacing: Theme.Spacing.xs) {
                        Text(items.count > 1 ? "¡Récords del test!" : "¡Récord del test!")
                            .papel(.seccion)
                            .foregroundStyle(Theme.Color.foreground)
                            .multilineTextAlignment(.center)
                            .accessibilityAddTraits(.isHeader)
                        Text("Marca personal")
                            .papel(.etiqueta)
                            .foregroundStyle(CelebrationGold.bright)
                    }

                    VStack(spacing: Theme.Spacing.m) {
                        ForEach(items) { item in
                            recordRow(item)
                        }
                    }

                    Button(action: { Haptics.light(); onDone() }) {
                        Text("Seguir")
                            .papel(.accion)
                            .foregroundStyle(SwiftUI.Color.black.opacity(Self.opacidadDeLaTintaSobreOro))
                            .frame(maxWidth: .infinity, minHeight: Theme.Size.accion)
                            .background(CelebrationGold.gradient, in: Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(PressScaleStyle(escala: 0.96))
                }
                .padding(Theme.Spacing.xl)
                .frame(maxWidth: 360)
                .background(
                    RoundedRectangle(cornerRadius: Theme.Radius.sujeto, style: .continuous)
                        .fill(Theme.Color.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sujeto, style: .continuous)
                                .strokeBorder(CelebrationGold.deep.opacity(0.5), lineWidth: 1)
                        )
                )
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.vertical, Theme.Spacing.xl)
                .frame(maxWidth: .infinity)
                .scaleEffect(appear || reduceMotion ? 1 : 0.92)
                .opacity(appear ? 1 : 0)
            }
            // Un récord con varias marcas o con texto grande scrollea en vez de recortarse; con una sola
            // se queda centrado, sin inercia sobre nada.
            .scrollBounceBehavior(.basedOnSize)
        }
        .environment(\.colorScheme, .dark)
        .onAppear {
            withAnimation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.8)) { appear = true }
            Haptics.success()
        }
        .accessibilityAddTraits(.isModal)
    }

    private var medal: some View {
        ZStack {
            Circle().fill(CelebrationGold.gradient)
                .frame(width: 76, height: 76)
                .shadow(color: CelebrationGold.deep.opacity(0.5), radius: 16, y: 6)
            IconoDia(.cronometro, tam: 32, peso: .bold)
                .foregroundStyle(SwiftUI.Color.black.opacity(Self.opacidadDeLaTintaSobreOro))
        }
        .accessibilityHidden(true)
    }

    private func recordRow(_ item: Item) -> some View {
        VStack(spacing: Theme.Spacing.xs) {
            Text(item.label)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
            Text(item.valueText)
                .papel(.sujeto)
                .foregroundStyle(Theme.Color.foreground)
                .multilineTextAlignment(.center)
            if let delta = item.deltaText {
                Text(delta)
                    .papel(.notaFuerte)
                    .foregroundStyle(CelebrationGold.bright)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}
