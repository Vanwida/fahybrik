import SwiftUI

// LAS PIEZAS PEQUEÑAS de «Carreras» — lo que el kit del día (`Theme/Dia`) todavía no trae y esta
// pestaña necesita más de una vez. Espejo de `screens/carreras-rehecho/piezas.tsx` y `resumen.tsx`.
//
// Son genéricas a propósito: el orquestador decide si suben al kit (tarjeta plana, pastilla con
// glifo, botón de texto, campo, botón primario de hoja). Hasta entonces viven aquí y NO se copian
// en otra pestaña. Nada baja de 15 pt ni de 44 pt de toque; todo color sale de `Theme.Color`.

// MARK: - Glifos que el kit del día aún no tiene

/// Los SF Symbols de esta pestaña que `GlifoDia` no cubre. Uno por idea, como allí; no se pueden
/// añadir casos a un enum desde fuera, y editar el kit no es de esta pestaña.
enum GlifoCarreras: String {
    case bandera = "flag"
    case equipo = "person.2"
    case sinPersona = "person.crop.circle.badge.xmark"
    case estrella = "star"
    case papelera = "trash"
    case enlace = "link"
    case alerta = "exclamationmark.triangle"
}

/// Un glifo de esta pestaña, a su tamaño y peso. Decorativo para VoiceOver: el nombre accesible lo
/// lleva el botón o la fila que lo contiene.
struct IconoCarreras: View {
    let glifo: GlifoCarreras
    var tam: CGFloat
    var peso: Font.Weight

    init(_ glifo: GlifoCarreras, tam: CGFloat = 20, peso: Font.Weight = .semibold) {
        self.glifo = glifo
        self.tam = tam
        self.peso = peso
    }

    var body: some View {
        Image(systemName: glifo.rawValue)
            .font(.system(size: tam, weight: peso))
            .accessibilityHidden(true)
    }
}

// MARK: - Texto que el kit no tiene como papel

extension View {
    /// El título de un bloque dentro de una sección («Estaciones», «Ritmo por km») y el de una
    /// pregunta de una hoja: un escalón por debajo del título de sección (24). El kit no trae un
    /// papel de 20 pt, así que sale del mismo `scaledFont` de siempre (escala con el texto del
    /// sistema y nunca baja del suelo de 15).
    func subtituloCarreras() -> some View {
        scaledFont(20, weight: .heavy, relativeTo: .title3, italic: true)
            .foregroundStyle(Theme.Color.foreground)
            .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - La tarjeta de la familia

extension View {
    /// La tarjeta PLANA de la familia: radio 22, superficie y un pelo (el `Tarjeta` del doble).
    /// `realce` la tiñe del acento del club — lo que pide un acto o ya está en marcha.
    ///
    /// No es `CardSurface`: aquélla lleva degradado y sombra (la del instrumento); las pantallas del
    /// día son planas y el sujeto es lo único que pesa.
    func tarjetaCarreras(realce: Bool = false) -> some View {
        modifier(TarjetaCarrerasModifier(realce: realce))
    }
}

private struct TarjetaCarrerasModifier: ViewModifier {
    let realce: Bool

    func body(content: Content) -> some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
        content
            .background(realce ? Theme.Color.accentTint(sobre: Theme.Color.surface) : Theme.Color.surface, in: forma)
            .overlay(forma.strokeBorder(realce ? Theme.Color.accentTintBorde : Theme.Color.hairline, lineWidth: 1))
            .clipShape(forma)
    }
}

// MARK: - Chips y cintas

/// Una pastilla de un dato con un glifo opcional delante: el rol de una carrera («Objetivo
/// principal»), «Dobles», el nivel de un perfil. El texto es SIEMPRE la tinta del tema (sobre un tinte del
/// acento, el `accentText` que deriva el servidor contra el lienzo no llega a 4,5:1: regla medida del kit).
struct ChipCarreras<Icono: View>: View {
    enum Estilo {
        /// Un hecho cualquiera: fondo hundido y texto de apoyo.
        case neutro
        /// El hecho CLAVE de la fila: tinte suave del acento.
        case acento
        /// Un velo de la tinta del tema: un contador, un rol sin peso.
        case velo
        /// Una etiqueta que se elige o se lee suelta (un grupo de entreno): cara elevada con contorno.
        case superficie
    }

    let texto: String
    var estilo: Estilo
    let icono: Icono

    init(_ texto: String, estilo: Estilo = .velo, @ViewBuilder icono: () -> Icono) {
        self.texto = texto
        self.estilo = estilo
        self.icono = icono()
    }

    private var fondo: SwiftUI.Color {
        switch estilo {
        case .neutro: return Theme.Color.surfaceSunken
        case .acento: return Theme.Color.accentTint
        case .velo: return Theme.Color.foreground.opacity(0.08)
        case .superficie: return Theme.Color.surfaceElevated
        }
    }

    private var borde: SwiftUI.Color {
        switch estilo {
        case .neutro, .superficie: return Theme.Color.hairlineStrong
        case .acento: return Theme.Color.accentTintBorde
        case .velo: return .clear
        }
    }

    var body: some View {
        HStack(spacing: Theme.Spacing.xs + 2) {
            icono
            Text(texto)
                .papel(.rotulo)
                // Una pastilla ENSEÑA un dato: cortada con «…» ya no lo enseña. Si no cabe, baja de línea.
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(estilo == .neutro ? Theme.Color.muted : Theme.Color.foreground)
        .padding(.horizontal, Theme.Spacing.m)
        .frame(minHeight: 32)
        .background(fondo, in: Capsule())
        .overlay(Capsule().strokeBorder(borde, lineWidth: 1))
    }
}

extension ChipCarreras where Icono == EmptyView {
    init(_ texto: String, estilo: Estilo = .velo) {
        self.init(texto, estilo: estilo, icono: { EmptyView() })
    }
}

/// Una cinta con un dato dentro. A diferencia de una pastilla (una sola línea), esta puede partirse
/// en dos: a 390 pt un «2:34 más rápido que tu anterior» no cabe en una línea sobre la foto y no se
/// recorta ni se sale.
struct CintaCarreras<Icono: View, Contenido: View>: View {
    var sobreFoto: Bool
    let icono: Icono
    let contenido: Contenido

    init(sobreFoto: Bool = false, @ViewBuilder icono: () -> Icono, @ViewBuilder contenido: () -> Contenido) {
        self.sobreFoto = sobreFoto
        self.icono = icono()
        self.contenido = contenido()
    }

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        HStack(alignment: .top, spacing: Theme.Spacing.s) {
            icono.padding(.top, 2)
            contenido
        }
        .papel(.rotulo)
        .foregroundStyle(Theme.Color.foreground)
        .multilineTextAlignment(.leading)
        .padding(.horizontal, Theme.Spacing.m)
        .padding(.vertical, 6)
        .frame(minHeight: 32, alignment: .leading)
        .background(sobreFoto ? Theme.Color.background.opacity(0.62) : Theme.Color.foreground.opacity(0.08), in: forma)
        .overlay {
            if sobreFoto { forma.strokeBorder(Theme.Color.foreground.opacity(0.26), lineWidth: 1) }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// «2:34 más rápido que tu anterior». El color va en la MARCA, la cifra en tinta. Sin delta no existe.
struct PildoraDelta: View {
    let deltaS: Int?
    var sobreFoto = false

    var body: some View {
        if let deltaS {
            if deltaS == 0 {
                CintaCarreras(sobreFoto: sobreFoto, icono: { EmptyView() }) { Text("Igual que tu anterior") }
            } else {
                let mejor = deltaS < 0
                CintaCarreras(sobreFoto: sobreFoto, icono: {
                    IconoDia(mejor ? .baja : .sube, tam: 16, peso: .bold)
                        .foregroundStyle(mejor ? Theme.Color.ok : Theme.Color.warning)
                }) {
                    Text("\(Formato.clock(abs(deltaS))) \(mejor ? "más rápido" : "más lento") que tu anterior")
                }
            }
        }
    }
}

/// «Puesto 412 de 1180 · top 35 %».
struct PildoraPuesto: View {
    let texto: String?
    var sobreFoto = false

    var body: some View {
        if let texto {
            CintaCarreras(sobreFoto: sobreFoto, icono: { IconoCarreras(.bandera, tam: 16) }) { Text(texto) }
        }
    }
}

/// Carrera · Estaciones · RoxZone. Solo los que existen; si no hay ninguno, la fila entera no existe
/// (no tres huecos). Con el texto del sistema muy grande pasa a una columna.
struct ParcialesCarrera: View {
    let resumen: ResumenCarrera
    var sobreFoto = false

    private var filas: [(etiqueta: String, segundos: Int)] {
        [("Carrera", resumen.correrS), ("Estaciones", resumen.estacionesS), ("RoxZone", resumen.roxzoneS)]
            .compactMap { e, s in s.map { (etiqueta: e, segundos: $0) } }
    }

    private func celda(_ etiqueta: String, _ s: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(etiqueta)
                .papel(.rotulo)
                .foregroundStyle(sobreFoto ? Theme.Color.foreground : Theme.Color.muted)
            Text(Formato.clock(s))
                .papel(.dato)
                .foregroundStyle(Theme.Color.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    var body: some View {
        if !filas.isEmpty {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: Theme.Spacing.m) {
                    ForEach(filas, id: \.etiqueta) { celda($0.etiqueta, $0.segundos) }
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                    ForEach(filas, id: \.etiqueta) { celda($0.etiqueta, $0.segundos) }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(filas.map { "\($0.etiqueta) \(Formato.clock($0.segundos))" }.joined(separator: ", "))
        }
    }
}

// MARK: - Botones

/// El color de una acción destructiva. El rojo de estado sobre la superficie elevada da 4,5:1, justo
/// por debajo de AA; mezclado un poco con la tinta del tema (un token sobre un token, nunca un hex)
/// pasa con holgura en los dos temas y sigue leyéndose rojo.
enum TintaCarreras {
    static var peligro: SwiftUI.Color {
        Theme.Color.tinte(Theme.Color.danger, 0.72, sobre: Theme.Color.foreground)
    }
}

/// Un botón de texto de 48 pt: la salida discreta («Ver 3 más», «No soy yo», «Cancelar»).
struct BotonTextoCarreras<Icono: View, Derecha: View>: View {
    enum Tono { case acento, tinta, suave, peligro }

    let titulo: String
    var tono: Tono
    var centrado: Bool
    var desactivado: Bool
    /// Cuando el botón despliega algo: lo lee VoiceOver.
    var expandido: Bool?
    let accion: () -> Void
    let icono: Icono
    let derecha: Derecha

    init(
        _ titulo: String,
        tono: Tono = .acento,
        centrado: Bool = false,
        desactivado: Bool = false,
        expandido: Bool? = nil,
        accion: @escaping () -> Void,
        @ViewBuilder icono: () -> Icono,
        @ViewBuilder derecha: () -> Derecha
    ) {
        self.titulo = titulo
        self.tono = tono
        self.centrado = centrado
        self.desactivado = desactivado
        self.expandido = expandido
        self.accion = accion
        self.icono = icono()
        self.derecha = derecha()
    }

    private var tinta: SwiftUI.Color {
        switch tono {
        // Un texto de botón NO va en el acento del club: sobre el lienzo no siempre llega a AA. El
        // acento se lo lleva el glifo; la palabra, la tinta del tema.
        case .acento, .tinta: return Theme.Color.foreground
        case .suave: return Theme.Color.muted
        case .peligro: return TintaCarreras.peligro
        }
    }

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.s) {
                if centrado { Spacer(minLength: 0) }
                icono.foregroundStyle(tono == .acento ? Theme.Color.accentText : tinta)
                Text(titulo)
                    .papel(.cuerpoFuerte)
                    .multilineTextAlignment(centrado ? .center : .leading)
                if centrado { Spacer(minLength: 0) } else { Spacer(minLength: Theme.Spacing.s) }
                derecha.foregroundStyle(Theme.Color.muted)
            }
            .foregroundStyle(tinta)
            .padding(.horizontal, Theme.Spacing.l)
            .frame(maxWidth: .infinity, minHeight: Theme.Size.toque)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
        .disabled(desactivado)
        .accessibilityValue(expandido.map { $0 ? "desplegado" : "plegado" } ?? "")
    }
}

extension BotonTextoCarreras where Icono == EmptyView, Derecha == EmptyView {
    init(_ titulo: String, tono: Tono = .acento, centrado: Bool = false, desactivado: Bool = false, accion: @escaping () -> Void) {
        self.init(titulo, tono: tono, centrado: centrado, desactivado: desactivado, accion: accion, icono: { EmptyView() }, derecha: { EmptyView() })
    }
}

extension BotonTextoCarreras where Derecha == EmptyView {
    init(_ titulo: String, tono: Tono = .acento, centrado: Bool = false, desactivado: Bool = false, accion: @escaping () -> Void, @ViewBuilder icono: () -> Icono) {
        self.init(titulo, tono: tono, centrado: centrado, desactivado: desactivado, accion: accion, icono: icono, derecha: { EmptyView() })
    }
}

/// La pastilla de una cabecera de sección («Buscar carrera», «Importar»): 44 pt, tinte del acento.
struct PastillaSeccion<Icono: View>: View {
    let titulo: String
    let accion: () -> Void
    let icono: Icono

    init(_ titulo: String, accion: @escaping () -> Void, @ViewBuilder icono: () -> Icono) {
        self.titulo = titulo
        self.accion = accion
        self.icono = icono()
    }

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.xs + 2) {
                icono.foregroundStyle(Theme.Color.foreground)
                Text(titulo).papel(.rotulo)
            }
            .foregroundStyle(Theme.Color.foreground)
            .padding(.horizontal, Theme.Spacing.l)
            .frame(minHeight: 44)
            .background(Theme.Color.accentTint, in: Capsule())
            .overlay(Capsule().strokeBorder(Theme.Color.accentTintBorde, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
    }
}

/// La salida principal de un vacío: pastilla del acento (es «haz esto ahora»), 52 pt.
struct SalidaAccionCarreras<Icono: View>: View {
    let titulo: String
    let accion: () -> Void
    let icono: Icono

    init(_ titulo: String, accion: @escaping () -> Void, @ViewBuilder icono: () -> Icono) {
        self.titulo = titulo
        self.accion = accion
        self.icono = icono()
    }

    var body: some View {
        Button {
            Haptics.light()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.m - 2) {
                icono
                Text(titulo).papel(.accion).multilineTextAlignment(.leading)
            }
            .foregroundStyle(Theme.Color.accentOn)
            .padding(.horizontal, 22)
            .frame(minHeight: Theme.Size.accion)
            .background(Theme.Color.accent, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.96))
    }
}

/// El botón grande de una hoja (fijar, guardar, importar): acento porque es «haz esto ahora».
/// Ocupado NO se atenúa (se lee «Importando…» con su contraste entero) y a la vez no admite otro
/// toque; inactivo cambia de superficie y de tinta, no de opacidad.
struct BotonPrimarioCarreras: View {
    let titulo: String
    var activo = true
    var ocupado = false
    let textoOcupado: String
    /// Lo que lee VoiceOver mientras está ocupado.
    let voz: String
    let accion: () -> Void

    var body: some View {
        let vivo = activo || ocupado
        Button {
            guard activo, !ocupado else { return }
            Haptics.medium()
            accion()
        } label: {
            HStack(spacing: Theme.Spacing.m - 2) {
                if ocupado {
                    ProgressView().tint(Theme.Color.accentOn)
                    Text(textoOcupado)
                } else {
                    Text(titulo)
                }
            }
            .papel(.accion)
            .foregroundStyle(vivo ? Theme.Color.accentOn : Theme.Color.muted)
            .frame(maxWidth: .infinity, minHeight: 56)
            .padding(.horizontal, Theme.Spacing.l)
            .background(vivo ? Theme.Color.accent : Theme.Color.surfaceElevated, in: Capsule())
            .overlay(Capsule().strokeBorder(vivo ? SwiftUI.Color.clear : Theme.Color.hairlineStrong, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(PressScaleStyle(escala: 0.98))
        .disabled(ocupado || !activo)
        .accessibilityLabel(ocupado ? voz : titulo)
        .accessibilityAddTraits(ocupado ? .updatesFrequently : [])
    }
}

// MARK: - Estados: vacío con salida, error en línea

/// El estado vacío con salida (§5): qué falta, por qué, y el acto que lo llena. Compacto (una tarjeta
/// de sección), no de pantalla: el vacío de pantalla es el sujeto, no esto.
struct VacioCarreras<Icono: View, Salida: View>: View {
    let titulo: String
    let mensaje: String
    let icono: Icono
    let salida: Salida

    init(titulo: String, mensaje: String, @ViewBuilder icono: () -> Icono, @ViewBuilder salida: () -> Salida) {
        self.titulo = titulo
        self.mensaje = mensaje
        self.icono = icono()
        self.salida = salida()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            FichaDia(tono: .normal) { icono }
            VStack(alignment: .leading, spacing: 6) {
                Text(titulo).subtituloCarreras()
                Text(mensaje)
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            salida
        }
        .padding(EdgeInsets(top: 20, leading: 18, bottom: 18, trailing: 18))
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaCarreras()
    }
}

/// Aviso de error EN LÍNEA (dentro de una hoja o de una sección): tinte del peligro, marca con forma,
/// texto en tinta del tema, y su salida si la hay. El que se ve sobre la barra de pestañas es `AvisoDia`.
struct AvisoEnLinea<Salida: View>: View {
    let texto: String
    let salida: Salida

    init(_ texto: String, @ViewBuilder salida: () -> Salida) {
        self.texto = texto
        self.salida = salida()
    }

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            HStack(alignment: .top, spacing: Theme.Spacing.m - 2) {
                IconoCarreras(.alerta, tam: 20)
                    .foregroundStyle(Theme.Color.danger)
                    .padding(.top, 1)
                Text(texto)
                    .papel(.cuerpoFuerte)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            salida
        }
        .padding(EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Color.dangerTint, in: forma)
        .overlay(forma.strokeBorder(Theme.Color.danger.opacity(0.34), lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isStaticText)
    }
}

extension AvisoEnLinea where Salida == EmptyView {
    init(_ texto: String) { self.init(texto, salida: { EmptyView() }) }
}

// MARK: - El campo

/// Un campo de la familia: etiqueta arriba, 52 pt, foco visible, y lo que haga falta a los lados.
/// El foco lo lleva quien pone el `TextField` (`@FocusState`) y lo pasa en `enFoco`.
struct CampoCarreras<Izquierda: View, Derecha: View, Contenido: View>: View {
    let etiqueta: String
    var enFoco: Bool
    /// Borde de aviso (algo del texto no cuadra, sin ser un error).
    var aviso: Bool
    let izquierda: Izquierda
    let derecha: Derecha
    let contenido: Contenido

    init(
        _ etiqueta: String,
        enFoco: Bool = false,
        aviso: Bool = false,
        @ViewBuilder izquierda: () -> Izquierda,
        @ViewBuilder derecha: () -> Derecha,
        @ViewBuilder contenido: () -> Contenido
    ) {
        self.etiqueta = etiqueta
        self.enFoco = enFoco
        self.aviso = aviso
        self.izquierda = izquierda()
        self.derecha = derecha()
        self.contenido = contenido()
    }

    var body: some View {
        let forma = RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous)
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            Text(etiqueta)
                .papel(.etiqueta)
                .foregroundStyle(Theme.Color.muted)
            HStack(spacing: Theme.Spacing.m - 2) {
                izquierda.foregroundStyle(Theme.Color.muted)
                contenido
                    .papel(.cuerpo)
                    .foregroundStyle(Theme.Color.foreground)
                derecha
            }
            .padding(.leading, 14)
            .padding(.trailing, 6)
            .frame(minHeight: 52)
            .background(Theme.Color.surface, in: forma)
            .overlay {
                forma.strokeBorder(
                    enFoco ? Theme.Color.accentText : (aviso ? Theme.Color.warning.opacity(0.6) : Theme.Color.hairlineStrong),
                    lineWidth: enFoco ? 2 : 1
                )
            }
        }
    }
}

extension CampoCarreras where Izquierda == EmptyView, Derecha == EmptyView {
    init(_ etiqueta: String, enFoco: Bool = false, aviso: Bool = false, @ViewBuilder contenido: () -> Contenido) {
        self.init(etiqueta, enFoco: enFoco, aviso: aviso, izquierda: { EmptyView() }, derecha: { EmptyView() }, contenido: contenido)
    }
}

// MARK: - Regleta neutra

/// La regleta de tramos medidos del póster: N de M en NEUTRO (el acento se guarda para la cuenta
/// atrás). Es la hermana de `RegletaDia`, que rellena con el acento y cabe en una tarjeta; sobre la
/// foto del póster dos acentos juntos pelean.
struct RegletaNeutraCarreras: View {
    let n: Int
    let de: Int

    var body: some View {
        HStack(spacing: Theme.Spacing.xs) {
            ForEach(0..<max(0, de), id: \.self) { i in
                Capsule()
                    .fill(i < RegletaDia.llenos(n: n, de: de) ? Theme.Color.foreground : Theme.Color.foreground.opacity(0.30))
                    .frame(height: 6)
                    .frame(maxWidth: .infinity)
            }
        }
        .accessibilityHidden(true)
    }
}
