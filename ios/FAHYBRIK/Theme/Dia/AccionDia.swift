import SwiftUI

// LA ACCIÓN — una pastilla, sola: lo que TOCAS.
//
// El sujeto es lo que MIRAS y no compite en peso con su acción (CONTRATO-UI §10.5): por defecto,
// tinta invertida — fondo = la tinta del tema, texto = el fondo del tema (así se invierte sola en
// claro y en oscuro, y sobre el acento del club sea cual sea) —, 52 pt de alto, cursiva de marca.
//
//   · `AccionDia`       SOLO el dibujo. Dentro de un sujeto que es un botón entero es la pastilla que lo
//                       representa; suelta, se envuelve en un `Button` con `PressScaleStyle(escala: 0.96)`.
//   · `BotonAccionDia`  el botón entero: háptico, escala de pulsación, estados «en curso», «ocupado» e
//                       «inactivo» y el nombre que lee VoiceOver. Lo que ancla una pantalla de flujo o cierra
//                       una hoja, y la salida de un vacío.
//
// Tres variantes de relleno y dos anchuras, y nada más — cada una es una decisión del diseño, no un capricho:
//   · `.tinta`    la acción de un sujeto o de una pantalla: no compite con lo que se mira.
//   · `.acento`   «haz esto ahora» dentro de una hoja o de un vacío, donde no hay sujeto al que subordinarse.
//   · `.apagado`  lo que aún no se puede hacer (falta un dato): cambia de superficie y de tinta, no de opacidad.
//   · `completa`  a todo el ancho, con el texto centrado (la acción anclada y el botón de una hoja).
//
// No es un `ExpertPrimaryButton` (el botón de acento de las pantallas de siempre, rectangular y con sombra).

struct AccionDia: View {
    enum Relleno {
        case tinta, acento, apagado

        fileprivate var tintaDelTexto: SwiftUI.Color {
            switch self {
            case .tinta:   return Theme.Color.background
            case .acento:  return Theme.Color.accentOn
            case .apagado: return Theme.Color.muted
            }
        }

        fileprivate var fondo: SwiftUI.Color {
            switch self {
            case .tinta:   return Theme.Color.foreground
            case .acento:  return Theme.Color.accent
            case .apagado: return Theme.Color.surfaceElevated
            }
        }
    }

    let titulo: String
    var glifo: GlifoDia?
    /// La acción está en marcha (reintentar, guardar): el glifo gira. Con Reducir movimiento, quieto.
    var enCurso: Bool
    var relleno: Relleno
    /// A todo el ancho, con el texto centrado. Sin él, la pastilla mide lo que mida su texto.
    var completa: Bool
    var alto: CGFloat
    /// El glifo va detrás («Ver lo de mañana →») salvo el que pide ir delante («▶ Empezar»).
    var glifoAlFinal: Bool
    /// Un indicador de progreso en el sitio del glifo: «Importando…».
    var conProgreso: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(
        _ titulo: String,
        glifo: GlifoDia? = .flecha,
        enCurso: Bool = false,
        relleno: Relleno = .tinta,
        completa: Bool = false,
        alto: CGFloat = Theme.Size.accion,
        glifoAlFinal: Bool = true,
        conProgreso: Bool = false
    ) {
        self.titulo = titulo
        self.glifo = glifo
        self.enCurso = enCurso
        self.relleno = relleno
        self.completa = completa
        self.alto = alto
        self.glifoAlFinal = glifoAlFinal
        self.conProgreso = conProgreso
    }

    var body: some View {
        HStack(spacing: Theme.Spacing.m - 2) {
            if !glifoAlFinal { simbolo }
            Text(titulo)
                .papel(.accion)
                .multilineTextAlignment(completa ? .center : .leading)
            if glifoAlFinal { simbolo }
        }
        .foregroundStyle(relleno.tintaDelTexto)
        .padding(.horizontal, 22)
        .frame(maxWidth: completa ? .infinity : nil, minHeight: alto)
        .background(relleno.fondo, in: Capsule())
        .overlay {
            if relleno == .apagado { Capsule().strokeBorder(Theme.Color.hairlineStrong, lineWidth: 1) }
        }
        .contentShape(Capsule())
        .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private var simbolo: some View {
        if conProgreso {
            ProgressView().tint(relleno.tintaDelTexto)
        } else if let glifo {
            IconoDia(glifo, tam: 20, peso: .bold)
                .rotationEffect(.degrees(enCurso ? 360 : 0))
                .animation(
                    enCurso && !reduceMotion ? .linear(duration: 0.78).repeatForever(autoreverses: false) : .default,
                    value: enCurso
                )
        }
    }
}

/// El botón entero de una acción. Ocupado NO se atenúa (se lee «Importando…» con su contraste entero) y a la
/// vez no admite otro toque; inactivo cambia de superficie y de tinta, no de opacidad (§4.2).
struct BotonAccionDia: View {
    /// Qué le pasa al botón.
    enum Estado: Equatable {
        case normal
        /// Falta algo para poder pulsarlo: no responde, y se ve.
        case inactivo
        /// En marcha: dice `texto` y `voz` es lo que lee VoiceOver.
        case ocupado(texto: String, voz: String)
    }

    /// Cuánto se nota la pulsación en el pulgar: una pastilla suelta pide poco; la que cierra una hoja, más.
    enum Impacto { case ligero, medio }

    let titulo: String
    var glifo: GlifoDia?
    var relleno: AccionDia.Relleno
    var completa: Bool
    var alto: CGFloat
    var glifoAlFinal: Bool
    var enCurso: Bool
    var estado: Estado
    var impacto: Impacto
    let accion: () -> Void

    init(
        _ titulo: String,
        glifo: GlifoDia? = nil,
        relleno: AccionDia.Relleno = .tinta,
        completa: Bool = false,
        alto: CGFloat = Theme.Size.accion,
        glifoAlFinal: Bool = true,
        enCurso: Bool = false,
        estado: Estado = .normal,
        impacto: Impacto = .ligero,
        accion: @escaping () -> Void
    ) {
        self.titulo = titulo
        self.glifo = glifo
        self.relleno = relleno
        self.completa = completa
        self.alto = alto
        self.glifoAlFinal = glifoAlFinal
        self.enCurso = enCurso
        self.estado = estado
        self.impacto = impacto
        self.accion = accion
    }

    /// El botón grande de una hoja (fijar, guardar, importar): acento porque es «haz esto ahora», a todo el ancho.
    init(hoja titulo: String, activo: Bool = true, ocupado: Bool, textoOcupado: String, voz: String, accion: @escaping () -> Void) {
        self.init(
            titulo, relleno: .acento, completa: true, alto: Theme.Size.accionAnclada,
            estado: ocupado ? .ocupado(texto: textoOcupado, voz: voz) : (activo ? .normal : .inactivo),
            impacto: .medio, accion: accion
        )
    }

    private var ocupado: (texto: String, voz: String)? {
        if case let .ocupado(texto, voz) = estado { return (texto, voz) }
        return nil
    }

    private var inactivo: Bool { estado == .inactivo }

    var body: some View {
        Button {
            guard !inactivo, ocupado == nil, !enCurso else { return }
            switch impacto {
            case .ligero: Haptics.light()
            case .medio: Haptics.medium()
            }
            accion()
        } label: {
            AccionDia(
                ocupado?.texto ?? titulo,
                glifo: ocupado == nil ? glifo : nil,
                enCurso: enCurso,
                relleno: inactivo ? .apagado : relleno,
                completa: completa,
                alto: alto,
                glifoAlFinal: glifoAlFinal,
                conProgreso: ocupado != nil
            )
        }
        .buttonStyle(PressScaleStyle(escala: completa ? 0.98 : 0.96))
        .disabled(inactivo || ocupado != nil || enCurso)
        .accessibilityLabel(ocupado?.voz ?? titulo)
        .accessibilityAddTraits(ocupado != nil ? .updatesFrequently : [])
    }
}

#if DEBUG
#Preview("Acción · fábrica") { EnAmbasDia { GaleriaDia.Acciones() } }
#Preview("Acción · club azul") { EnAmbasDia(club: .pruebaAzul) { GaleriaDia.Acciones() } }
#endif
