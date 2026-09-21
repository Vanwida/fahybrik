import SwiftUI

// RODAJE — el marco de las tres páginas de la lámina (card 105 / FH-30).
//
// El TabView de LiveFlowView pagina Datos | Vivo | Controles. Aquí se pinta el
// LIENZO que esas tres páginas comparten: relleno plano al 45 % de la zona
// (TINTE_MAX), viñeta, aro del bisel, versales y numeral. No es un pager.

// MARK: - Viñeta (espejo de docs/mocks/tools/reloj-correr.py)

/// Negro en las esquinas y en las bandas de versales. El cuerpo queda PLANO:
/// el degradado de antes apagaba el único sitio donde el color existía.
struct WatchViñeta: View {
    var body: some View {
        GeometryReader { geo in
            let r = max(geo.size.width, geo.size.height) * 0.72
            ZStack {
                RadialGradient(
                    stops: [
                        .init(color: .clear, location: 0.54),
                        .init(color: Color.black.opacity(0.34), location: 1),
                    ],
                    center: UnitPoint(x: 0.5, y: 0.46),
                    startRadius: 0,
                    endRadius: r
                )
                LinearGradient(
                    stops: [
                        .init(color: Color.black.opacity(0.34), location: 0),
                        .init(color: .clear, location: 0.13),
                        .init(color: .clear, location: 0.86),
                        .init(color: Color.black.opacity(0.30), location: 1),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Marco

/// Fondo + tinte 45 % + viñeta + aro. El contenido lo pone cada página.
struct RodajeMarco<Content: View>: View {
    let session: WorkoutSession
    var driver: WatchRunLegDriver? = nil
    var destello: WatchDestello = WatchDestello()
    /// 0.42 en pausa en el vivo: el dato no desaparece, se apaga.
    var apagado: Double = 1
    @ViewBuilder var content: () -> Content

    @Environment(\.isLuminanceReduced) private var atenuado
    @State private var destelloOpacity: Double = 0
    @State private var medidaLienzo = RodajeLienzoSize()

    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            if let fondo = fondoSolido, !atenuado {
                fondo.ignoresSafeArea()
            } else if let tinte = tinteZona, !atenuado {
                tinte.opacity(RodajeTipo.tinteMax)
                    .ignoresSafeArea()
                    .animation(.easeInOut(duration: 0.7), value: session.liveZone)
            }
            WatchViñeta().ignoresSafeArea()
            if let bisel { bisel.ignoresSafeArea() }
            content()
                .environment(\.rodajeLienzo, medidaLienzo)
                .opacity(apagado)
                .padding(.horizontal, 10)
                .padding(.bottom, 6)
                .mideElLienzo($medidaLienzo)
            destello.color
                .opacity(destelloOpacity)
                .ignoresSafeArea()
                .allowsHitTesting(false)
        }
        .onChange(of: destello.n) { _, _ in
            guard destello.n > 0, !atenuado else { return }
            destelloOpacity = 0.55
            withAnimation(.easeOut(duration: 0.45)) { destelloOpacity = 0 }
            WatchHaptics.transition()
        }
    }

    /// Recuperación de serie: restBg, no un tinte de zona.
    private var enRecupera: Bool {
        session.isRunStructureActive && !(session.currentRunLeg?.isWork ?? true)
    }

    private var fondoSolido: Color? {
        enRecupera ? WatchTheme.restBg : nil
    }

    private var tinteZona: Color? {
        guard !enRecupera else { return nil }
        return WatchTinte.color(for: session.liveZone)
    }

    private var bisel: AnyView? {
        if session.isRunStructureActive {
            if let forma = FormaDelAro.fase(
                legs: session.currentRunLegs ?? [],
                indice: session.runLegIndex
            ) {
                return WatchAroEstructura(
                    arcos: forma.arcos,
                    enCurso: forma.enCurso,
                    fraccion: fraccionDelTramo
                ).watchBisel()
            }
            if let total = session.currentRunLeg?.durationSeconds, total > 0 {
                return WatchAroContinuo(remaining: session.runLegRemaining / Double(total)).watchBisel()
            }
            if let metros = session.currentRunLeg?.distanceMeters, metros > 0 {
                let cubiertos = driver?.legCoveredMeters ?? session.runLegCoveredMeters
                return WatchAroContinuo(
                    remaining: max(0, 1 - cubiertos / Double(metros))
                ).watchBisel()
            }
            return WatchAroContinuo(remaining: 0).watchBisel()
        }
        if let targetM = session.currentSegment?.targetDistanceMeters,
           targetM > 0,
           let dist = session.liveRunDistanceMeters {
            let rem = max(0, 1 - dist / Double(targetM))
            return WatchAroContinuo(remaining: rem).watchBisel()
        }
        if let total = session.currentSegment?.targetDurationSeconds, total > 0 {
            let rem = max(0, 1 - session.condElapsed / Double(total))
            return WatchAroContinuo(remaining: rem).watchBisel()
        }
        // Carril vacío: no se sabe cuánto queda y no se insinúa un progreso.
        return WatchAroContinuo(remaining: 0).watchBisel()
    }

    private var fraccionDelTramo: Double {
        guard let leg = session.currentRunLeg else { return 0 }
        if let target = leg.distanceMeters, target > 0 {
            let cubiertos = driver?.legCoveredMeters ?? session.runLegCoveredMeters
            return min(1, max(0, cubiertos / Double(target)))
        }
        if let total = leg.durationSeconds, total > 0 {
            return min(1, max(0, session.runLegElapsed / Double(total)))
        }
        return 0
    }
}

// MARK: - Adaptive canvas (FH-30: all Watch sizes incl. SE)

struct RodajeLienzoSize: Equatable {
    var ancho: CGFloat = 188
    var alto: CGFloat = 212
}

extension View {
    /// MIDE EL LIENZO DE VERDAD, y lo vuelve a medir si cambia de tamaño.
    ///
    /// Con la medida sólo en `onAppear` bastaba un primer layout a cero —una
    /// pantalla que se compone antes de tener tamaño, un 41 mm entrando por el
    /// espejo— para que el numeral se quedara toda la sesión con el 188×212 por
    /// defecto: en un SE eso desborda por ancho y el sujeto encoge con
    /// `minimumScaleFactor` en vez de calcularse. `onChange` cierra ese agujero
    /// sin tocar el caso bueno (misma medida ⇒ no reescribe el estado).
    func mideElLienzo(_ medida: Binding<RodajeLienzoSize>) -> some View {
        background(
            GeometryReader { geo in
                Color.clear
                    .onAppear { anotaElLienzo(geo.size, en: medida) }
                    .onChange(of: geo.size) { _, nueva in anotaElLienzo(nueva, en: medida) }
            }
        )
    }
}

/// El relleno de la lámina (10 pt a cada lado, 6 abajo) se descuenta aquí: lo
/// que el numeral puede ocupar es el hueco de dentro, no el de fuera.
private func anotaElLienzo(_ size: CGSize, en medida: Binding<RodajeLienzoSize>) {
    let w = size.width - 20
    let h = size.height - 6
    guard w > 0, h > 0 else { return }
    let nueva = RodajeLienzoSize(ancho: w, alto: h)
    if medida.wrappedValue != nueva { medida.wrappedValue = nueva }
}

private struct RodajeLienzoKey: EnvironmentKey {
    static let defaultValue = RodajeLienzoSize()
}

extension EnvironmentValues {
    var rodajeLienzo: RodajeLienzoSize {
        get { self[RodajeLienzoKey.self] }
        set { self[RodajeLienzoKey.self] = newValue }
    }
}

// MARK: - Versales / numeral / segundo (medidas de la lámina)

enum RodajeTipo {
    static let dim = Color.white.opacity(0.76)
    static let contexto = Color.white.opacity(0.85)
    /// TINTE_MAX de `docs/mocks/tools/reloj-correr.py`. No vive en `WatchTinte`:
    /// el 38 % del resto de modalidades no es esta lámina.
    static let tinteMax: Double = 0.45
    static let versales: CGFloat = 10
    static let tracking: CGFloat = 1.1
    static let segundo: CGFloat = 22
    static let capEm: CGFloat = 0.70
    static let avanceMono: CGFloat = 0.60
    static let unidadEm: CGFloat = 0.30
    static let decimalEm: CGFloat = 0.42
    static let techo: CGFloat = 150
    static let suelo: CGFloat = 43
    static let aire: CGFloat = 10
    static let filaContexto: CGFloat = 14
    static let filaSegundo: CGFloat = 26
    static let filaAccion: CGFloat = 15
    static let filaNota: CGFloat = 13
    static let filaPuntos: CGFloat = 14
    static let filaDatos: CGFloat = 24
}

struct RodajeVersales: View {
    let texto: String
    var tono: Color = RodajeTipo.dim
    var arriba: CGFloat = 0

    var body: some View {
        Text(texto.uppercased())
            .font(.system(size: RodajeTipo.versales, weight: .heavy))
            .tracking(RodajeTipo.tracking)
            .foregroundStyle(tono)
            .lineLimit(1)
            .minimumScaleFactor(0.82)
            .padding(.top, arriba)
    }
}

struct RodajeNumeral: View {
    let texto: String
    var unidad: String = ""
    var alto: CGFloat
    var color: Color = WatchTheme.ink

    var body: some View {
        let partes = Self.partir(texto)
        let cuerpo = alto / RodajeTipo.capEm
        let hueco = unidad.isEmpty ? 0 : max(2, 0.07 * cuerpo)
        HStack(alignment: .lastTextBaseline, spacing: 0) {
            Text(partes.entero)
                .font(.custom("Menlo-Bold", size: cuerpo))
                .foregroundStyle(color)
            if !partes.decimal.isEmpty {
                Text(partes.decimal)
                    .font(.custom("Menlo-Bold", size: cuerpo * RodajeTipo.decimalEm))
                    .foregroundStyle(color)
            }
            if !unidad.isEmpty {
                Text(unidad)
                    .font(.custom("Menlo-Bold", size: cuerpo * RodajeTipo.unidadEm))
                    .foregroundStyle(RodajeTipo.dim)
                    .padding(.leading, hueco)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }

    static func partir(_ texto: String) -> (entero: String, decimal: String) {
        if let i = texto.firstIndex(of: ",") {
            return (String(texto[..<i]), String(texto[i...]))
        }
        return (texto, "")
    }

    static func anchoEnGlifos(_ texto: String, unidad: String) -> CGFloat {
        let p = partir(texto)
        return CGFloat(p.entero.count)
            + CGFloat(p.decimal.count) * RodajeTipo.decimalEm
            + CGFloat(unidad.count) * RodajeTipo.unidadEm
    }

    static func altoSujeto(_ texto: String, unidad: String = "",
                           segundo: Bool, nota: Bool, accion: Bool = false,
                           anchoUtil: CGFloat = 188,
                           altoUtil: CGFloat = 212) -> CGFloat {
        let ocupado = RodajeTipo.filaContexto
            + (segundo ? RodajeTipo.filaSegundo : 0)
            + (accion ? RodajeTipo.filaAccion : 0)
            + (nota ? RodajeTipo.filaNota : 0)
            + RodajeTipo.filaPuntos
        let porPresupuesto = min(
            RodajeTipo.techo,
            altoUtil - ocupado - 2 * RodajeTipo.aire
        )
        let glifos = max(1, anchoEnGlifos(texto, unidad: unidad))
        let porAncho = (anchoUtil / (glifos * RodajeTipo.avanceMono)) * RodajeTipo.capEm
        return max(RodajeTipo.suelo, min(porPresupuesto, porAncho))
    }
}

struct RodajeSegundo: View {
    let valor: String
    var etiqueta: String = ""
    var etiquetaTinta: Color = RodajeTipo.dim

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            if !etiqueta.isEmpty {
                RodajeVersales(texto: etiqueta, tono: etiquetaTinta)
            }
            Text(valor)
                .font(.system(size: RodajeTipo.segundo, weight: .heavy))
                .monospacedDigit()
                .foregroundStyle(WatchTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
    }
}

// MARK: - Vivo (centro: cero botones)

/// Lo que FALTA de la pieza. No reutiliza GuionRodaje: aquel ponía la zona
/// como sujeto. Aquí el sujeto es el restante (o el reloj de la pieza).
///
/// QUÉ se pinta lo decide `RodajeLamina` con el motor proyectado a dato; esta
/// vista sólo PINTA y cuelga el gesto. La misma decisión sirve al espejo
/// (`MirrorRodajeFace`), que es lo que hace que sea la misma cara y no una
/// parecida.
struct RodajeVivoPage: View {
    let session: WorkoutSession
    var driver: WatchRunLegDriver? = nil
    var destello: WatchDestello = WatchDestello()

    @Environment(\.rodajeLienzo) private var lienzo

    var body: some View {
        let lectura = RodajeLamina.lectura(RodajeLamina.Ventana(sesion: session))
        RodajeMarco(session: session, driver: driver, destello: destello,
                    apagado: session.isPaused ? 0.42 : 1) {
            VStack(spacing: 0) {
                RodajeVersales(texto: lectura.contexto, tono: RodajeTipo.contexto)
                Spacer(minLength: 4)
                RodajeNumeral(
                    texto: lectura.sujeto,
                    unidad: lectura.unidad,
                    alto: RodajeNumeral.altoSujeto(
                        lectura.sujeto,
                        unidad: lectura.unidad,
                        segundo: lectura.ritmo != nil,
                        nota: lectura.nota != nil,
                        accion: lectura.accion,
                        anchoUtil: lienzo.ancho,
                        altoUtil: lienzo.alto
                    ),
                    color: lectura.tonoSujeto
                )
                Spacer(minLength: 4)
                if let ritmo = lectura.ritmo {
                    RodajeSegundo(
                        valor: ritmo,
                        etiqueta: lectura.etiquetaSegundo,
                        etiquetaTinta: lectura.veredicto != nil ? WatchTheme.ink : RodajeTipo.dim
                    )
                }
                if let nota = lectura.nota {
                    RodajeVersales(
                        texto: nota,
                        tono: lectura.notaEnTinta ? WatchTheme.ink : RodajeTipo.dim,
                        arriba: 4
                    )
                }
                RodajePuntos(activa: 1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .multilineTextAlignment(.center)
            .contentShape(Rectangle())
            .highPriorityGesture(
                TapGesture().onEnded {
                    guard lectura.toca else { return }
                    WatchHaptics.tap()
                    session.applyCommand(MirrorWire.CommandKind.advance)
                }
            )
            .accessibilityAddTraits(lectura.toca ? .isButton : [])
        }
    }
}
