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

    var body: some View {
        ZStack {
            WatchTheme.bg.ignoresSafeArea()
            if let fondo = fondoSolido, !atenuado {
                fondo.ignoresSafeArea()
            } else if let tinte = tinteZona, !atenuado {
                tinte.opacity(WatchTinte.maxOpacity)
                    .ignoresSafeArea()
                    .animation(.easeInOut(duration: 0.7), value: session.liveZone)
            }
            WatchViñeta().ignoresSafeArea()
            if let bisel { bisel.ignoresSafeArea() }
            content()
                .opacity(apagado)
                .padding(.horizontal, 10)
                .padding(.bottom, 6)
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

// MARK: - Versales / numeral / segundo (medidas de la lámina)

enum RodajeTipo {
    static let dim = Color.white.opacity(0.76)
    static let contexto = Color.white.opacity(0.85)
    static let versales: CGFloat = 10
    static let tracking: CGFloat = 1.1
    static let segundo: CGFloat = 22
    static let capEm: CGFloat = 0.70
    static let avanceMono: CGFloat = 0.60
    static let unidadEm: CGFloat = 0.30
    static let decimalEm: CGFloat = 0.42
    static let anchoUtil: CGFloat = 188
    static let altoUtil: CGFloat = 212
    static let techo: CGFloat = 150
    static let suelo: CGFloat = 43
    static let aire: CGFloat = 10
    static let filaContexto: CGFloat = 14
    static let filaSegundo: CGFloat = 26
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
                           segundo: Bool, nota: Bool) -> CGFloat {
        let ocupado = RodajeTipo.filaContexto
            + (segundo ? RodajeTipo.filaSegundo : 0)
            + (nota ? RodajeTipo.filaNota : 0)
            + RodajeTipo.filaPuntos
        let porPresupuesto = min(
            RodajeTipo.techo,
            RodajeTipo.altoUtil - ocupado - 2 * RodajeTipo.aire
        )
        let glifos = max(1, anchoEnGlifos(texto, unidad: unidad))
        let porAncho = (RodajeTipo.anchoUtil / (glifos * RodajeTipo.avanceMono)) * RodajeTipo.capEm
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
struct RodajeVivoPage: View {
    let session: WorkoutSession
    var driver: WatchRunLegDriver? = nil
    var destello: WatchDestello = WatchDestello()

    var body: some View {
        let lectura = Self.lectura(session: session, driver: driver)
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
                        nota: lectura.nota != nil
                    ),
                    color: lectura.tonoSujeto
                )
                Spacer(minLength: 4)
                if let ritmo = lectura.ritmo {
                    RodajeSegundo(
                        valor: ritmo,
                        etiqueta: lectura.juicio ?? "ritmo",
                        etiquetaTinta: lectura.juicio == nil ? RodajeTipo.dim : WatchTheme.ink
                    )
                }
                if let nota = lectura.nota {
                    RodajeVersales(
                        texto: nota,
                        tono: lectura.notaTinta,
                        arriba: 3
                    )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .multilineTextAlignment(.center)
            .contentShape(Rectangle())
            .onTapGesture {
                if let toca = lectura.onToca {
                    WatchHaptics.tap()
                    toca()
                }
            }
        }
    }

    struct Lectura {
        var contexto: String
        var sujeto: String
        var unidad: String = ""
        var tonoSujeto: Color = WatchTheme.ink
        var ritmo: String? = nil
        var juicio: String? = nil
        var nota: String? = nil
        var notaTinta: Color = RodajeTipo.dim
        var onToca: (() -> Void)? = nil
    }

    static func lectura(session: WorkoutSession, driver: WatchRunLegDriver?) -> Lectura {
        if session.isRunStructureActive {
            return lecturaSerie(session: session, driver: driver)
        }
        return lecturaRodaje(session: session)
    }

    private static func lecturaRodaje(session: WorkoutSession) -> Lectura {
        let sinGPS = session.liveRunDistanceMeters == nil && session.liveCoveredPaceSecPerKm == nil
        let ritmo: String? = session.liveCoveredPaceSecPerKm.map {
            "\(WatchFormat.pace($0)) \(Formato.UnidadRitmo.porKm.rawValue)"
        }
        if session.isPaused {
            let (sujeto, unidad) = sujetoRodaje(session, sinGPS: sinGPS)
            return Lectura(
                contexto: "en pausa · te quedan",
                sujeto: sujeto,
                unidad: unidad,
                ritmo: ritmo
            )
        }
        if sinGPS {
            return Lectura(
                contexto: "rodaje · llevas",
                sujeto: WatchFormat.clock(session.condElapsed),
                nota: WatchNota.sinSenal
            )
        }
        let (sujeto, unidad, quedan) = sujetoYQuedan(session)
        return Lectura(
            contexto: quedan ? "rodaje · te quedan" : "rodaje · llevas",
            sujeto: sujeto,
            unidad: unidad,
            ritmo: ritmo
        )
    }

    private static func sujetoRodaje(_ session: WorkoutSession, sinGPS: Bool) -> (String, String) {
        if sinGPS { return (WatchFormat.clock(session.condElapsed), "") }
        let (s, u, _) = sujetoYQuedan(session)
        return (s, u)
    }

    /// Restante de la pieza en su unidad, o el reloj de la pieza si no falta nada medible.
    private static func sujetoYQuedan(_ session: WorkoutSession) -> (String, String, Bool) {
        if let targetM = session.currentSegment?.targetDistanceMeters, targetM > 0 {
            let cubiertos = session.liveRunDistanceMeters ?? 0
            let faltan = max(0, Double(targetM) - cubiertos)
            return (WatchDistancia.cifra(faltan), WatchDistancia.unidad(faltan), true)
        }
        if let total = session.currentSegment?.targetDurationSeconds, total > 0 {
            let queda = max(0, Double(total) - session.condElapsed)
            return (WatchFormat.countdown(queda), "", true)
        }
        return (WatchFormat.clock(session.condElapsed), "", false)
    }

    private static func lecturaSerie(session: WorkoutSession, driver: WatchRunLegDriver?) -> Lectura {
        let isRecovery = !(session.currentRunLeg?.isWork ?? true)
        let serie = RunLegDisplay.serie(
            legs: session.currentRunLegs ?? [],
            indice: session.runLegIndex
        )
        let ritmoSec = RunLegDisplay.legPaceSecPerKm(
            coveredMeters: driver?.legCoveredMeters ?? session.runLegCoveredMeters,
            elapsedS: session.runLegElapsed
        )
        let ritmo: String? = ritmoSec.map {
            "\(WatchFormat.pace($0)) \(Formato.UnidadRitmo.porKm.rawValue)"
        }
        let objetivo = session.currentRunLeg.flatMap {
            RunLegDisplay.objetivo(for: $0, livePaceSecPerKm: ritmoSec)
        }
        let juicio: String? = (objetivo?.status == .inTarget) ? "en objetivo" : nil

        if isRecovery {
            let (sujeto, unidad, tono) = sujetoRecupera(session, driver: driver)
            let next: RunLeg? = {
                guard let legs = session.currentRunLegs else { return nil }
                let i = session.runLegIndex + 1
                return i < legs.count ? legs[i] : nil
            }()
            let viene = RunLegDisplay.nextLegPreview(next)
            let nViene = min(serie.total, serie.n + (isRecovery ? 1 : 0))
            return Lectura(
                contexto: "recupera · viene la \(max(1, nViene))",
                sujeto: sujeto,
                unidad: unidad,
                tonoSujeto: tono,
                ritmo: viene,
                juicio: viene == nil ? nil : "luego",
                nota: "toca · empezar ya",
                notaTinta: WatchTheme.ink,
                onToca: { session.primaryAdvance() }
            )
        }

        if session.isPaused {
            let (sujeto, unidad, quedan) = sujetoSerie(session, driver: driver)
            return Lectura(
                contexto: quedan ? "en pausa · te quedan" : "en pausa · llevas",
                sujeto: sujeto,
                unidad: unidad,
                ritmo: ritmo,
                juicio: juicio
            )
        }

        let parte = RunLegDisplay.nombreDeParte(session.currentRunLeg?.phaseRole ?? .main)
        let (sujeto, unidad, quedan) = sujetoSerie(session, driver: driver)
        let base = parte ?? "serie \(serie.n) de \(serie.total)"
        return Lectura(
            contexto: quedan ? "\(base) · te quedan" : base,
            sujeto: sujeto,
            unidad: unidad,
            ritmo: ritmo,
            juicio: juicio
        )
    }

    private static func sujetoSerie(_ session: WorkoutSession, driver: WatchRunLegDriver?) -> (String, String, Bool) {
        let cubiertos = driver?.legCoveredMeters ?? session.runLegCoveredMeters
        if let m = session.currentRunLeg?.distanceMeters, m > 0 {
            let faltan = max(0, Double(m) - cubiertos)
            return (String(Int(faltan.rounded(.up))), "m", true)
        }
        if let total = session.currentRunLeg?.durationSeconds, total > 0 {
            return (WatchFormat.countdown(session.runLegRemaining), "", true)
        }
        return (WatchFormat.clock(session.runLegElapsed), "", false)
    }

    private static func sujetoRecupera(_ session: WorkoutSession, driver: WatchRunLegDriver?) -> (String, String, Color) {
        let cubiertos = driver?.legCoveredMeters ?? session.runLegCoveredMeters
        if let m = session.currentRunLeg?.distanceMeters, m > 0 {
            let faltan = max(0, Double(m) - cubiertos)
            return (String(Int(faltan.rounded(.up))), "m", WatchTheme.ink)
        }
        if (session.currentRunLeg?.durationSeconds ?? 0) > 0 {
            return (WatchFormat.countdown(session.runLegRemaining), "", WatchTheme.zoneGreen)
        }
        return (WatchFormat.clock(session.runLegElapsed), "", WatchTheme.zoneGreen)
    }
}
