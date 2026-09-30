import SwiftUI

// LAS PIEZAS DE LAS PANTALLAS QUE CUELGAN DE PERFIL — filas, notas, acciones y estados.
//
// El kit del día trae el sujeto, la tesela, la ficha y el título de sección; lo que una pantalla
// secundaria necesita además es una LISTA (filas con su ficha, su valor o su interruptor, separadas por
// un hairline dentro de una tarjeta plana) y unos estados de pantalla entera (cargando, vacío, error).
// Son genéricas: si otra pestaña las quiere, suben al kit tal cual. Viven aquí porque la consolidación
// del kit va en paralelo y dos manos sobre `Theme/Dia/` es como se pierde trabajo.
//
// LA REGLA DE LAS FILAS: el título es lo que ES (17 pt fuerte), el detalle lo que HACE o lo que VALE
// (15 pt de apoyo); el color de estado va en la marca (la ficha, un punto) y nunca en el texto; y la
// fila entera es el objetivo táctil, de 48 pt como mínimo.

// MARK: - El grupo de filas

/// Una tarjeta plana con sus filas, separadas por un hairline que el grupo pone solo (entre una fila y
/// la siguiente, nunca arriba ni abajo). `realce` la tiñe del acento del club.
struct GrupoPerfil<Contenido: View>: View {
    var realce = false
    @ViewBuilder let contenido: () -> Contenido

    var body: some View {
        VStack(spacing: 0) {
            Group(subviews: contenido()) { filas in
                ForEach(Array(filas.enumerated()), id: \.offset) { i, fila in
                    if i > 0 { Hairline() }
                    fila
                }
            }
        }
        .tarjetaPerfil(realce: realce)
    }
}

// MARK: - Una fila

/// El texto de una fila: título y, debajo, su detalle. Suelto porque lo comparten la fila de navegación,
/// la del interruptor y la del valor.
struct TextoDeFilaPerfil: View {
    let titulo: String
    var detalle: String?
    /// El detalle es el dato que importa (una fecha, un estado) y no un apoyo: pasa a la tinta del tema.
    var detalleFuerte = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(titulo)
                .papel(.cuerpoFuerte)
                .foregroundStyle(Theme.Color.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if let detalle {
                Text(detalle)
                    .papel(detalleFuerte ? .notaFuerte : .nota)
                    .foregroundStyle(detalleFuerte ? Theme.Color.foreground : Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Una fila de una lista: ficha de icono (si lleva), texto y, a la derecha, lo suyo (un chevron, un valor,
/// un interruptor). Es solo el dibujo: la envuelve un `Button` o un `NavigationLink`.
struct FilaPerfil<Final: View>: View {
    var glifo: GlifoPerfil?
    var tonoDeFicha: FichaDia<IconoPerfil>.Tono = .normal
    let titulo: String
    var detalle: String?
    var detalleFuerte = false
    @ViewBuilder let final: () -> Final

    var body: some View {
        HStack(spacing: 14) {
            if let glifo {
                FichaDia(tono: tonoDeFicha) { IconoPerfil(glifo) }
            }
            TextoDeFilaPerfil(titulo: titulo, detalle: detalle, detalleFuerte: detalleFuerte)
            final()
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque + Theme.Spacing.l, alignment: .leading)
        .contentShape(Rectangle())
    }
}

extension FilaPerfil where Final == ChevronDeFilaPerfil {
    /// La fila que lleva a otra pantalla o abre una hoja: su chevron.
    init(glifo: GlifoPerfil? = nil, tonoDeFicha: FichaDia<IconoPerfil>.Tono = .normal, titulo: String, detalle: String? = nil, detalleFuerte: Bool = false) {
        self.init(glifo: glifo, tonoDeFicha: tonoDeFicha, titulo: titulo, detalle: detalle, detalleFuerte: detalleFuerte) {
            ChevronDeFilaPerfil()
        }
    }
}

struct ChevronDeFilaPerfil: View {
    var body: some View {
        IconoDia(.chevron, tam: 18).foregroundStyle(Theme.Color.muted)
    }
}

/// La fila que se toca: `Button` (o el `label` de un `NavigationLink`) con la pulsación del día y el nombre
/// accesible de la fila entera, sin que VoiceOver lea el chevron como algo aparte.
struct EstiloFilaPerfil: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeInOut(duration: 0.18), value: configuration.isPressed)
    }
}

extension View {
    /// El estilo de una fila tocable de lista.
    func filaTocablePerfil() -> some View {
        buttonStyle(EstiloFilaPerfil())
    }
}

// MARK: - Fila con valor, fila con interruptor

/// «Etiqueta ......... valor»: lo que hay guardado (el objetivo, el idioma, la modalidad). El valor lleva el
/// peso; con `chevron` la fila lleva a otra pantalla. El COLOR del valor es el de estado solo cuando
/// significa un estado (activa, pago pendiente): por eso se le pasa una `marca`, no un color del texto.
struct FilaValorPerfil: View {
    let etiqueta: String
    let valor: String
    /// Un punto de color junto al valor cuando el valor ES un estado.
    var marca: SwiftUI.Color?
    var chevron = false
    /// El valor no está puesto todavía: se dice en apoyo, no con la tinta de un dato.
    var vacio = false

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Theme.Spacing.m) { etiquetaView; Spacer(minLength: Theme.Spacing.m); valorView }
            VStack(alignment: .leading, spacing: 2) { etiquetaView; valorView }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque + Theme.Spacing.s, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(etiqueta), \(valor)")
        .accessibilityAddTraits(chevron ? .isButton : [])
    }

    private var etiquetaView: some View {
        Text(etiqueta).papel(.cuerpo).foregroundStyle(Theme.Color.muted)
    }

    private var valorView: some View {
        HStack(spacing: Theme.Spacing.s) {
            if let marca {
                Circle().fill(marca).frame(width: 10, height: 10).accessibilityHidden(true)
            }
            Text(valor)
                .papel(vacio ? .cuerpo : .cuerpoFuerte)
                .foregroundStyle(vacio ? Theme.Color.muted : Theme.Color.foreground)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
            if chevron { ChevronDeFilaPerfil() }
        }
    }
}

/// Una fila con su interruptor. Todo el bloque es el `Toggle`, así que VoiceOver lo lee como uno («Avisos de
/// voz, activado») y el objetivo táctil no es solo el interruptor.
struct FilaInterruptorPerfil: View {
    var glifo: GlifoPerfil?
    let titulo: String
    var detalle: String?
    /// Una pastilla junto al título («Alfa»): lo que avisa de que la función se está probando.
    var pastilla: String?
    @Binding var activo: Bool

    var body: some View {
        Toggle(isOn: $activo) {
            HStack(spacing: 14) {
                if let glifo { FichaDia { IconoPerfil(glifo) } }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.s) {
                        Text(titulo).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                        if let pastilla { InfoPill(text: pastilla, estilo: .acento) }
                    }
                    if let detalle {
                        Text(detalle).papel(.nota).foregroundStyle(Theme.Color.muted)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(Theme.Color.accent)
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, Theme.Spacing.m)
        .frame(minHeight: Theme.Size.toque + Theme.Spacing.l)
    }
}

// MARK: - Notas y acciones de texto

/// Una nota bajo un bloque: lo que el bloque no dice y hay que saber. Apoyo, 15 pt.
struct NotaPerfil: View {
    let texto: String

    init(_ texto: String) { self.texto = texto }

    var body: some View {
        Text(texto)
            .papel(.nota)
            .foregroundStyle(Theme.Color.muted)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Una acción que pesa lo mínimo: solo texto, de 48 pt de alto. `peligro` la tiñe de rojo (el peligro va en
/// el texto de una acción que destruye, y en nada más). Centrada por defecto, como el pie de la pestaña.
struct AccionTextoPerfil: View {
    let titulo: String
    var peligro = false
    var alineada: Alignment = .center
    var enCurso = false
    let accion: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            Text(titulo)
                .papel(.cuerpoFuerte)
                .foregroundStyle(peligro ? Theme.Color.danger : Theme.Color.accentText)
                .padding(.horizontal, Theme.Spacing.s)
                .frame(maxWidth: alineada == .center ? .infinity : nil, minHeight: Theme.Size.toque, alignment: alineada)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
        .disabled(enCurso)
    }
}

/// La acción de un formulario, anclada abajo (`PantallaPerfil(pie:)`): la pastilla de tinta invertida del día
/// a todo el ancho. Es la receta de `AccionDia` con el ancho de una pantalla de flujo; deshabilitada baja al
/// 40 % y sigue siendo legible (el motivo lo dice la propia pantalla, no un botón mudo).
struct AccionAncladaPerfil: View {
    let titulo: String
    var enCurso = false
    var habilitada = true
    let accion: () -> Void

    var body: some View {
        Button {
            Haptics.medium()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.s) {
                if enCurso { ProgressView().tint(Theme.Color.background) }
                Text(titulo).papel(.accion).lineLimit(2).multilineTextAlignment(.center)
            }
            .foregroundStyle(Theme.Color.background)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.accion)
            .padding(.horizontal, 22)
            .background(Theme.Color.foreground, in: Capsule())
            .opacity(habilitada ? 1 : 0.4)
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
        .disabled(!habilitada || enCurso)
    }
}

// MARK: - Estados de pantalla entera

/// La pantalla no pudo cargar y NO hay nada guardado que enseñar: un sujeto de peligro con su «Reintentar».
/// Un fallo no se disfraza de vacío (§7): esto no dice «aún no hay», dice «no pudimos».
struct ErrorDePantallaPerfil: View {
    let kicker: String
    let titulo: String
    var apoyo = "Revisa tu conexión e inténtalo de nuevo."
    var reintentando = false
    let alReintentar: () -> Void

    var body: some View {
        SujetoDia(tono: .peligro, etiqueta: titulo, anuncia: true) {
            KickerDia(kicker)
            TituloDia(titulo)
            ApoyoDia(apoyo)
        } abajo: {
            Button(action: alReintentar) {
                AccionDia("Reintentar", glifo: .reintentar, enCurso: reintentando)
            }
            .buttonStyle(PressScaleStyle(escala: 0.96))
            .disabled(reintentando)
        }
    }
}

/// Todavía no hay nada, y SIEMPRE con su salida (§5): el vacío de una pantalla es la invitación a hacer lo que
/// la llena. Sin acción posible (el dato llega solo), no hay salida que ofrecer y se dice cuándo llegará.
struct VacioDePantallaPerfil: View {
    let kicker: String
    let titulo: String
    let apoyo: String
    var accion: (titulo: String, glifo: GlifoDia, hace: () -> Void)?

    var body: some View {
        SujetoDia(tono: .neutro, etiqueta: "\(titulo). \(apoyo)") {
            KickerDia(kicker)
            TituloDia(titulo)
            ApoyoDia(apoyo)
        } abajo: {
            if let accion {
                Button(action: accion.hace) { AccionDia(accion.titulo, glifo: accion.glifo) }
                    .buttonStyle(PressScaleStyle(escala: 0.96))
            }
        }
    }
}

/// El esqueleto de una lista: tantas filas como se esperan, con la MISMA forma que tendrán (ficha de 44 pt y
/// dos líneas de texto), para que nada salte al llegar el dato.
struct EsqueletoDeFilasPerfil: View {
    var filas = 3
    var conFicha = true

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<filas, id: \.self) { i in
                if i > 0 { Hairline() }
                HStack(spacing: 14) {
                    if conFicha { SkeletonBar(width: FichaDia<EmptyView>.lado, height: FichaDia<EmptyView>.lado, radius: Theme.Radius.l) }
                    VStack(alignment: .leading, spacing: 6) {
                        SkeletonBar(width: 168, height: 17, radius: 5)
                        SkeletonBar(width: 232, height: 15, radius: 5)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.vertical, Theme.Spacing.m)
                .frame(minHeight: Theme.Size.toque + Theme.Spacing.l, alignment: .leading)
            }
        }
        .tarjetaPerfil()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando")
    }
}
