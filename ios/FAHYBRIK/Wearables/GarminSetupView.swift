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
        PantallaPerfil(titulo: "Tu entreno, en el reloj") {
            Text("El plan te sale en el reloj y lo guía Garmin, con sus ritmos y sus avisos. Se configura una vez.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            stepOne
            stepTwo
            doneNote
            twoTapsNote
            notYetNote
        }
    }

    // EL NOMBRE, AQUÍ, ES EL DE LA APP DE CONNECT IQ, no el de esta app: son las
    // instrucciones para encontrarla en la tienda de Garmin y en el menú del
    // reloj. Hoy son el mismo (`Marca.nombre` ↔ `@Strings.AppName` de
    // garmin-ciq/resources/strings/), y tienen que seguir siéndolo: si un clon
    // renombra solo uno de los dos, estas instrucciones mandan al atleta a
    // buscar algo que no existe. Ver docs/ios-clonabilidad.md.
    private var stepOne: some View {
        SetupStep(number: 1, title: "Instala \(Marca.nombre) en tu reloj") {
            NotaPerfil("Se hace desde la app de Garmin en tu móvil, no desde el reloj.")
            TapPath(steps: [
                "Abre Garmin Connect",
                "Abajo a la derecha, Más",
                "Tienda Connect IQ",
                "Busca \(Marca.nombre) e instálala"
            ])
        }
    }

    private var stepTwo: some View {
        SetupStep(number: 2, title: "Copia esto en los ajustes de la app") {
            // La ruta LITERAL, toque a toque, tomada del artículo de soporte de
            // Garmin. Son siete pantallas: escribir "Connect IQ › Ajustes" daba
            // por hecho un menú que nadie encuentra solo.
            Text("Otra vez en Garmin Connect, esta vez a los ajustes de nuestra app:")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            TapPath(steps: [
                "Abajo a la derecha, Más",
                "Dispositivos Garmin",
                "Toca tu reloj",
                "Actividades y aplicaciones",
                Marca.nombre,
                "Ajustes"
            ])
            Text("Ahí pega tu email y el código. Dale a Guardar.")
                .papel(.cuerpo)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)

            if let p = pairing {
                GrupoPerfil {
                    CopyField(label: "Tu email", value: p.email, copied: justCopied == p.email) {
                        copy(p.email)
                    }
                    CopyField(label: "Código", value: p.code, destacado: true, copied: justCopied == p.code) {
                        copy(p.code)
                    }
                }
                NotaPerfil("El código caduca en 10 minutos. Si se te pasa, pide otro.")
            } else if failed {
                AvisoEnLineaPerfil(tono: .peligro, texto: "No se ha podido generar el código. Vuelve a intentarlo.")
            }

            Button {
                Haptics.light()
                Task { await loadCode() }
            } label: {
                AccionDia(pairing == nil ? "Ver mi email y mi código" : "Pedir un código nuevo", glifo: .flecha, enCurso: loading)
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
            .disabled(loading || bearer == nil)
        }
    }

    private var doneNote: some View {
        NotaConTitulo(
            titulo: "¿Cómo sé que ha funcionado?",
            texto: "Abre \(Marca.nombre) en el reloj. Si ya no te pide el email, estás dentro: verás el entreno de hoy. Los ajustes tardan unos segundos en llegarle al reloj, así que si aún te lo pide, espera un poco y vuelve a entrar."
        )
    }

    private var twoTapsNote: some View {
        NotaConTitulo(
            titulo: "Al empezar, el reloj te preguntará dos veces",
            texto: "Primero si quieres salir de \(Marca.nombre), y después con qué perfil correr. Elige Correr: a partir de ahí te guía Garmin. Es cosa suya, no un fallo."
        )
    }

    // Honestidad de estado: la app del reloj está construida y probada, pero aún no
    // publicada en la tienda de Garmin. Sin decirlo, el atleta la busca, no la
    // encuentra, y piensa que el fallo es suyo.
    private var notYetNote: some View {
        NotaConTitulo(
            titulo: "Todavía no está en la tienda",
            texto: "La app del reloj está lista y la estamos probando. Te avisamos en cuanto se pueda instalar.",
            realce: true
        )
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

/// Una nota con su título: lo que conviene saber antes o después de hacerlo.
private struct NotaConTitulo: View {
    let titulo: String
    let texto: String
    var realce = false

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(titulo).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
            Text(texto)
                .papel(.nota)
                .foregroundStyle(Theme.Color.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(Theme.Spacing.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaPerfil(realce: realce)
        .accessibilityElement(children: .combine)
    }
}

/// Una ruta de toques dentro de OTRA aplicación. Cada línea es una pantalla, en
/// orden, con el nombre literal del botón. Un atleta que no ha tocado Garmin
/// Connect en su vida no puede seguir un "Connect IQ › Ajustes": no sabe por dónde
/// se empieza. Esto sí se puede seguir con el móvil en la mano.
private struct TapPath: View {
    let steps: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            ForEach(Array(steps.enumerated()), id: \.offset) { i, step in
                HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                    IconoDia(.chevron, tam: 14, peso: .bold)
                        .foregroundStyle(Theme.Color.muted)
                    Text(step)
                        .papel(.cuerpo)
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
                .papel(.notaPesada)
                .foregroundStyle(Theme.Color.accentOn)
                .frame(width: 32, height: 32)
                .background(Theme.Color.accent, in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                Text(title)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                content()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// Un valor que se copia de un toque. Toda la fila es el objetivo, no un icono
/// diminuto: esto se usa con el móvil en una mano y el reloj en la otra.
private struct CopyField: View {
    let label: String
    let value: String
    /// El valor es lo que hay que teclear en el reloj (el código): pasa al papel de dato.
    var destacado: Bool = false
    let copied: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.s) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).papel(.rotulo).foregroundStyle(Theme.Color.muted)
                    Text(value)
                        .papel(destacado ? .dato : .cuerpoFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                }
                Spacer(minLength: Theme.Spacing.s)
                Image(systemName: copied ? "checkmark" : "doc.on.doc")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(copied ? Theme.Color.ok : Theme.Color.accentText)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, Theme.Spacing.l)
            .padding(.vertical, Theme.Spacing.m)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque + Theme.Spacing.m, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(EstiloFilaPerfil())
        .accessibilityLabel("\(label): \(value). Tocar para copiar.")
    }
}
