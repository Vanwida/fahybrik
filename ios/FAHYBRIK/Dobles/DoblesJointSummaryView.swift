import SwiftUI

// #28 — el lado a lado CONJUNTO que sale DESPUÉS de cerrar una sesión de dobles (cuando la pareja ya ha
// registrado también la suya): los números del atleta (con el color de atleta) junto a los de su pareja (en
// azul), un botón para compartir la tarjeta de dos columnas y «Seguir». Un momento de celebración → oscuro
// forzado, como la celebración de un PR. Nada de esto se inventa: un lado esconde su RPE / tonelaje / la marca
// de PR cuando el dato falta.
//
// Piel de «El día»: papeles de la escala (nada por debajo de 15 pt), la acción de tinta invertida a todo el
// ancho y el aviso del acento del club como kicker. La firma pública (`data`, `onDone`) la usa el cierre del
// entreno: no cambia.

struct DoblesJointSummaryView: View {
    let data: JointShareData
    let onDone: () -> Void

    @State private var shareURL: URL? = nil
    @State private var appear = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            // El velo de detrás es el lienzo oscuro (la vista fuerza el modo oscuro), a casi toda opacidad.
            Theme.Color.background.opacity(0.94).ignoresSafeArea()
                .accessibilityHidden(true)

            GeometryReader { proxy in
                ScrollView {
                    tarjeta
                        .scaleEffect(appear || reduceMotion ? 1 : 0.92)
                        .opacity(appear || reduceMotion ? 1 : 0)
                        // Un toque en la tarjeta no cierra nada: solo el que cae fuera de ella.
                        .onTapGesture {}
                        // Centrada cuando cabe; con texto enorme crece y se desplaza.
                        .frame(maxWidth: .infinity, minHeight: proxy.size.height)
                        .contentShape(Rectangle())
                        .onTapGesture { onDone() }
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
        .environment(\.colorScheme, .dark)
        .onAppear {
            withAnimation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.8)) { appear = true }
            Haptics.success()
        }
        .task { shareURL = WorkoutShareRenderer.pngURL(for: data) }
    }

    var tarjeta: some View {
        VStack(spacing: Theme.Spacing.l) {
            VStack(spacing: Theme.Spacing.xs) {
                Text("Entreno en pareja")
                    .papel(.kicker)
                    .foregroundStyle(Theme.Color.accentText)
                Text(data.title)
                    .papel(.seccion)
                    .foregroundStyle(Theme.Color.foreground)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text(data.dateText)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }

            JointSideColumns(data: data)

            Text(data.footerText)
                .papel(.notaFuerte)
                .foregroundStyle(Theme.Color.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            actions
        }
        .padding(Theme.Spacing.xl)
        .frame(maxWidth: 420)
        .background(Theme.Color.surface, in: RoundedRectangle(cornerRadius: Theme.Radius.sujeto, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.sujeto, style: .continuous)
                .strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1)
        )
        .padding(.horizontal, Theme.Spacing.pantalla)
        .padding(.vertical, Theme.Spacing.xl)
    }

    private var actions: some View {
        VStack(spacing: Theme.Spacing.s) {
            if let shareURL {
                ShareLink(item: shareURL) {
                    HStack(spacing: Theme.Spacing.m - 2) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 18, weight: .bold))
                            .accessibilityHidden(true)
                        Text("Compartir").papel(.accion)
                    }
                    .foregroundStyle(Theme.Color.background)
                    .padding(.horizontal, 22)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(Theme.Color.foreground, in: Capsule())
                    .contentShape(Capsule())
                }
                .simultaneousGesture(TapGesture().onEnded { Haptics.light() })
            }
            Button(action: { Haptics.light(); onDone() }) {
                Text("Seguir")
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.muted)
                    .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
        }
    }
}

// MARK: - Las dos columnas

/// Las dos columnas lado a lado (el atleta y su pareja) con el filete en medio. Las comparten el resumen en
/// pantalla y la tarjeta que se exporta.
struct JointSideColumns: View {
    let data: JointShareData
    var big: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            JointSideColumn(side: data.selfSide, color: Theme.Color.accent, big: big)
            Rectangle().fill(Theme.Color.hairlineStrong).frame(width: 1)
            JointSideColumn(side: data.partnerSide, color: Theme.Color.partner, big: big)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - One athlete's column (shared by the overlay and the export card)

struct JointSideColumn: View {
    let side: JointShareData.Side
    let color: SwiftUI.Color
    var big: Bool = false

    var body: some View {
        VStack(spacing: Theme.Spacing.s) {
            // El color de quién es va en el punto; el nombre es la tinta del tema.
            HStack(spacing: Theme.Spacing.xs + 2) {
                Circle().fill(color).frame(width: 10, height: 10).accessibilityHidden(true)
                Text(side.name)
                    .papel(.etiqueta)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            // El lado que no registró tiempo lo dice, y en la voz de texto: una raya a 32 puntos se lee como una
            // marca (§7, §4).
            if let tiempo = side.timeText {
                Text(tiempo)
                    .papel(.dato)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            } else {
                Text("sin tiempo")
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(minHeight: big ? 44 : 38)
            }
            VStack(spacing: 2) {
                if let rpe = side.rpe { stat("RPE", "\(rpe)") }
                if let tonnage = side.tonnageText { stat("Movido", tonnage) }
            }
            if side.hasPR {
                HStack(spacing: Theme.Spacing.xs) {
                    Image(systemName: "trophy.fill").font(.system(size: 14, weight: .bold)).accessibilityHidden(true)
                    Text(side.prCount > 1 ? "\(side.prCount) PR" : "PR").papel(.notaPesada)
                }
                .foregroundStyle(Theme.Color.foreground)
                .padding(.horizontal, Theme.Spacing.m)
                .frame(minHeight: 32)
                .background(Theme.Color.tinte(color, 0.22, sobre: Theme.Color.surface), in: Capsule())
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    private func stat(_ label: String, _ value: String) -> some View {
        HStack(spacing: Theme.Spacing.xs + 1) {
            Text(label).papel(.nota).foregroundStyle(Theme.Color.muted)
            Text(value).papel(.notaPesada).foregroundStyle(Theme.Color.foreground)
        }
    }
}

// MARK: - Shareable two-column card (exported PNG)

/// La tarjeta oscura de dos columnas que se exporta al compartir una sesión conjunta. Sigue el idioma de
/// WorkoutShareCard (marca, filete de acento arriba, pie con el dominio) para que las tarjetas en solitario y
/// en pareja se lean como una familia.
struct DoblesJointShareCard: View {
    let data: JointShareData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Wordmark(size: 20)
                Spacer()
                Text("En pareja")
                    .papel(.kicker)
                    .foregroundStyle(Theme.Color.accentText)
            }

            Spacer(minLength: 0)

            Text(data.title)
                .papel(.seccion)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(2).minimumScaleFactor(0.7)
            Text(data.dateText)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .padding(.top, 2)

            Spacer(minLength: 0)

            JointSideColumns(data: data, big: true)

            Spacer(minLength: 0)

            HStack {
                Text(data.footerText)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                Spacer()
                Text(Marca.dominioWeb)
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
            }
        }
        .padding(28)
        .frame(width: 360, height: 450, alignment: .leading)
        .background(Theme.Color.background)
        .overlay(alignment: .top) {
            Rectangle().fill(Theme.Color.accent).frame(height: 4)
        }
    }
}

// #28 — reuse the shared ImageRenderer core (WorkoutShareRenderer.render) for the joint
// PNG; no second renderer.
extension WorkoutShareRenderer {
    @MainActor
    static func pngURL(for data: JointShareData) -> URL? {
        render(DoblesJointShareCard(data: data).environment(\.colorScheme, .dark),
               name: "fahybrid-pareja")
    }
}
