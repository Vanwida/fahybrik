import SwiftUI


// Vincular un Garmin — en dos pasos.
//
// EL MURO QUE RESUELVE
// --------------------
// El atleta instala nuestra app en el reloj y esta le pide identificarse. Pero en
// un reloj NO HAY TECLADO: eso se escribe en Garmin Connect, dentro de los ajustes
// de la app, tres niveles hacia dentro. Nadie encuentra ese menú por su cuenta.
//
// Y hasta ahora el camino era peor todavía: escribir el email allí → coger el
// reloj y tocar «pedir código» → esperar un correo → volver a Garmin Connect a
// escribirlo. Cuatro saltos entre móvil y reloj para vincular un reloj.
//
// Como el atleta YA está identificado aquí, nada de eso hace falta: le damos el
// código en pantalla. Quedan dos pasos.
//
// POR QUÉ TODO SE COPIA CON UN TOQUE
// ----------------------------------
// No es un adorno. El email de la cuenta puede ser el de «ocultar mi correo» de
// Apple, que es una cadena larga e ilegible; teclearlo a mano en otra aplicación
// es garantía de errata. Y una errata aquí no da un error claro: da un código que
// no valida, sin decir por qué.
//
// EL CÓDIGO SE PIDE, NO SE MUESTRA SOLO
// -------------------------------------
// Pedirlo invalida el anterior, así que si se emitiera al abrir la pantalla, un
// atleta que entra a mirar cómo iba se quedaría con el que ya tenía escrito muerto
// a medias. Se emite cuando dice que va a vincular.

struct GarminSetupView: View {
    let bearer: String?

    @State private var pairing: GarminPairCode?
    @State private var loading = false
    @State private var failed = false
    @State private var justCopied: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                header
                stepOne
                stepTwo
                doneNote
                twoTapsNote
                notYetNote
            }
            .padding(Theme.Spacing.l)
        }
        .background(Theme.Color.background.ignoresSafeArea())
        .navigationTitle("Garmin")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text("Tu entreno, en el reloj")
                .font(Theme.Typography.headlineM)
                .foregroundStyle(Theme.Color.foreground)
            Text("El plan te sale en el reloj y lo guía Garmin, con sus ritmos y sus avisos. Se configura una vez.")
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var stepOne: some View {
        SetupStep(number: 1, title: "Instala FAHYBRID en tu reloj") {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text("Se hace desde la app de Garmin en tu móvil, no desde el reloj.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
                TapPath(steps: [
                    "Abre Garmin Connect",
                    "Abajo a la derecha, Más",
                    "Tienda Connect IQ",
                    "Busca FAHYBRID e instálala"
                ])
            }
        }
    }

    private var stepTwo: some View {
        SetupStep(number: 2, title: "Copia esto en los ajustes de la app") {
            VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                // La ruta LITERAL, toque a toque, tomada del artículo de soporte de
                // Garmin. Son siete pantallas: escribir "Connect IQ › Ajustes" daba
                // por hecho un menú que nadie encuentra solo.
                Text("Otra vez en Garmin Connect, esta vez a los ajustes de nuestra app:")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                TapPath(steps: [
                    "Abajo a la derecha, Más",
                    "Dispositivos Garmin",
                    "Toca tu reloj",
                    "Actividades y aplicaciones",
                    "FAHYBRID",
                    "Ajustes"
                ])
                Text("Ahí pega tu email y el código. Dale a Guardar.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)

                if let p = pairing {
                    CopyField(label: "Tu email", value: p.email, copied: justCopied == p.email) {
                        copy(p.email)
                    }
                    CopyField(label: "Código", value: p.code, mono: true, copied: justCopied == p.code) {
                        copy(p.code)
                    }
                    Text("El código caduca en 10 minutos. Si se te pasa, pide otro.")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.muted)
                } else if failed {
                    Text("No se ha podido generar el código. Vuelve a intentarlo.")
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.danger)
                }

                Button {
                    Haptics.light()
                    Task { await loadCode() }
                } label: {
                    HStack(spacing: 8) {
                        if loading { ProgressView().tint(Theme.Color.accentOn) }
                        Text(pairing == nil ? "Ver mi email y mi código" : "Pedir un código nuevo")
                            .font(.system(size: 14, weight: .heavy)).italic()
                    }
                    .foregroundStyle(Theme.Color.accentOn)
                    .padding(.horizontal, Theme.Spacing.l)
                    .padding(.vertical, 10)
                    .background(Theme.Color.accent)
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(loading || bearer == nil)
            }
        }
    }

    private var doneNote: some View {
        CardSurface(padding: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text("¿Cómo sé que ha funcionado?")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Abre FAHYBRID en el reloj. Si ya no te pide el email, estás dentro: verás el entreno de hoy. Los ajustes tardan unos segundos en llegarle al reloj, así que si aún te lo pide, espera un poco y vuelve a entrar.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var twoTapsNote: some View {
        CardSurface(padding: Theme.Spacing.l) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text("Al empezar, el reloj te preguntará dos veces")
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                Text("Primero si quieres salir de FAHYBRID, y después con qué perfil correr. Elige Correr: a partir de ahí te guía Garmin. Es cosa suya, no un fallo.")
                    .font(Theme.Typography.small)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // Honestidad de estado: la app del reloj está construida y probada, pero aún no
    // publicada en la tienda de Garmin. Sin decirlo, el atleta la busca, no la
    // encuentra, y piensa que el fallo es suyo.
    private var notYetNote: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text("Todavía no está en la tienda")
                .font(Theme.Typography.dataLabel)
                .uppercaseTracked()
                .foregroundStyle(Theme.Color.muted)
            Text("La app del reloj está lista y la estamos probando. Te avisamos en cuanto se pueda instalar.")
                .font(Theme.Typography.small)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func copy(_ value: String) {
        UIPasteboard.general.string = value
        Haptics.light()
        justCopied = value
    }

    @MainActor
    private func loadCode() async {
        guard let bearer, !loading else { return }
        loading = true
        failed = false
        defer { loading = false }
        do {
            pairing = try await WearablesService.garminPairCode(bearer: bearer)
            justCopied = nil
        } catch {
            failed = true
        }
    }
}

/// Una ruta de toques dentro de OTRA aplicación. Cada línea es una pantalla, en
/// orden, con el nombre literal del botón. Un atleta que no ha tocado Garmin
/// Connect en su vida no puede seguir un "Connect IQ › Ajustes": no sabe por dónde
/// se empieza. Esto sí se puede seguir con el móvil en la mano.
private struct TapPath: View {
    let steps: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(Theme.Color.accentText)
                        .padding(.top, 3)
                    Text(step)
                        .font(Theme.Typography.small)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Paso \(i + 1): \(step)")
            }
        }
        .padding(.leading, 2)
    }
}

/// Un paso numerado. El número va en su columna para que el contenido pueda crecer
/// sin desalinearse.
private struct SetupStep<Content: View>: View {
    let number: Int
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            Text("\(number)")
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(Theme.Color.accentOn)
                .frame(width: 22, height: 22)
                .background(Theme.Color.accent)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(title)
                    .font(Theme.Typography.bodyEmph)
                    .foregroundStyle(Theme.Color.foreground)
                content()
            }
        }
    }
}

/// Un valor que se copia de un toque. Toda la fila es el objetivo, no un icono
/// diminuto: esto se usa con el móvil en una mano y el reloj en la otra.
private struct CopyField: View {
    let label: String
    let value: String
    var mono: Bool = false
    let copied: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.s) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(Theme.Typography.dataLabel)
                        .uppercaseTracked()
                        .foregroundStyle(Theme.Color.muted)
                    Text(value)
                        .font(mono
                              ? .system(size: 20, weight: .bold, design: .monospaced)
                              : .system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Color.foreground)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                        .textSelection(.enabled)
                }
                Spacer(minLength: Theme.Spacing.s)
                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(copied ? Theme.Color.ok : Theme.Color.accentText)
            }
            .padding(Theme.Spacing.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Color.surfaceSunken)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label): \(value). Tocar para copiar.")
    }
}
