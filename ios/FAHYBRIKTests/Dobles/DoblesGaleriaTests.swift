import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA GALERÍA DE DOBLES — la semana conectada, entrenar a la vez, las analíticas de los dos, la simulación
// conjunta, el editor del reparto, el predicho de carrera de la pareja y el resumen conjunto, cada una en claro y
// en oscuro, con el acento de fábrica y con el de un club azul (tinta clara): una pantalla con el acento clavado
// solo se ve mal cuando un coach elige otro. Y alguna a tamaño de texto de accesibilidad.
//
// `ImageRenderer` no pinta un `ScrollView` ni una hoja: por eso se dibuja lo que cada pantalla mete DENTRO de su
// scroll (`DoblesPlanCuerpo`, `DoblesTrainTogetherCuerpo`…) bajo su cabecera, sobre el lienzo del iPhone 17 Pro.
// Los PNG van a `FAHYBRIK_CAPTURAS` (con `TEST_RUNNER_FAHYBRIK_CAPTURAS` desde `xcodebuild`) y como adjuntos.
// Los datos de ejemplo se decodifican como llegan del servidor; no son datos de producción.

final class DoblesGaleriaTests: XCTestCase {

    private static let ancho: CGFloat = 402

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    private struct Variante {
        let nombre: String
        let esquema: ColorScheme
        let club: ClubTheme?
    }

    private static let variantes: [Variante] = [
        Variante(nombre: "claro-fabrica", esquema: .light, club: nil),
        Variante(nombre: "oscuro-fabrica", esquema: .dark, club: nil),
        Variante(nombre: "claro-azul", esquema: .light, club: .pruebaAzul),
        Variante(nombre: "oscuro-azul", esquema: .dark, club: .pruebaAzul),
    ]

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    // MARK: - La semana conectada

    @MainActor
    func testSemanaConectada() throws {
        let plan: DoblesConnectedPlan = try Self.decodifica(Self.planJSON)
        galeria("hub-datos", alto: 1240) { self.hub(plan: plan, verLaDeLaPareja: false) }
        galeria("hub-pareja", alto: 1240) { self.hub(plan: plan, verLaDeLaPareja: true) }
        galeria("hub-en-vivo", alto: 1420) { self.hub(plan: plan, verLaDeLaPareja: false, enVivo: true) }
        galeria("hub-accesible", alto: 2600, tamano: .accessibility2, soloClaroDeFabrica: true) {
            self.hub(plan: plan, verLaDeLaPareja: false)
        }
    }

    @MainActor
    func testSemanaConectadaSinDatos() {
        galeria("hub-cargando", alto: 720) {
            self.conCabecera(titulo: "Tu semana", apoyo: "Plan conectado", salida: .cerrar, pareja: true) {
                DoblesPlanEsqueleto().padding(.horizontal, Theme.Spacing.pantalla)
            }
        }
        galeria("hub-sin-pareja", alto: 620) {
            self.conCabecera(titulo: "Tu semana", apoyo: "Plan conectado", salida: .cerrar, pareja: false) {
                DoblesNoPartnerState(message: "Cuando conectes con tu compañero veréis cada uno vuestro plan, lo que es opcional juntos y la simulación conjunta del sábado.")
                    .padding(.horizontal, Theme.Spacing.pantalla)
                    .padding(.top, Theme.Spacing.xxl)
            }
        }
        galeria("hub-sin-publicar", alto: 620) {
            self.conCabecera(titulo: "Tu semana", apoyo: "Plan conectado", salida: .cerrar, pareja: true) {
                RedesignEmptyState(
                    symbol: "calendar",
                    title: "Semana conectada sin publicar",
                    message: "En cuanto haya semana publicada para los dos veréis aquí cada plan, lo que es opcional juntos y la simulación conjunta.",
                    exit: .explained(note: "La publica tu coach. No tienes que hacer nada: aparece sola.")
                )
                .padding(.horizontal, Theme.Spacing.pantalla)
                .padding(.top, Theme.Spacing.xxl)
            }
        }
    }

    // MARK: - Entrenar a la vez

    @MainActor
    func testEntrenarALaVez() throws {
        let sesion: DoblesTrainTogetherSession = try Self.decodifica(Self.sesionJSON)
        galeria("entrenar-datos", alto: 1000) { self.entrenar(sesion) }
        galeria("entrenar-accesible", alto: 2400, tamano: .accessibility2, soloClaroDeFabrica: true) { self.entrenar(sesion) }
        galeria("entrenar-cargando", alto: 600) {
            self.conCabecera(kicker: "Podéis hacerla juntos o cada uno", titulo: "Entrenar a la vez", salida: .volver) {
                DoblesTrainTogetherEsqueleto().padding(.horizontal, Theme.Spacing.pantalla)
            }
        }
    }

    // MARK: - Analíticas

    @MainActor
    func testAnaliticasCompartidas() throws {
        let analiticas: DoblesSharedAnalytics = try Self.decodifica(Self.analiticasJSON)
        galeria("analiticas-datos", alto: 1400) {
            self.conCabecera(titulo: "Vosotros dos", salida: .volver) {
                DoblesAnaliticasCuerpo(analytics: analiticas, partnerName: "Biel", partnerInitials: "B")
                    .padding(.horizontal, Theme.Spacing.pantalla)
            }
        }
        galeria("analiticas-accesible", alto: 3000, tamano: .accessibility2, soloClaroDeFabrica: true) {
            self.conCabecera(titulo: "Vosotros dos", salida: .volver) {
                DoblesAnaliticasCuerpo(analytics: analiticas, partnerName: "Biel", partnerInitials: "B")
                    .padding(.horizontal, Theme.Spacing.pantalla)
            }
        }
        galeria("analiticas-cargando", alto: 640) {
            self.conCabecera(titulo: "Vosotros dos", salida: .volver) {
                DoblesAnaliticasEsqueleto().padding(.horizontal, Theme.Spacing.pantalla)
            }
        }
    }

    // MARK: - Simulación

    @MainActor
    func testSimulacionConjunta() throws {
        let simulacion: DoblesSimulation = try Self.decodifica(Self.simulacionJSON)
        let estaciones = simulacion.stationSplits.map {
            DoblesEstacionEditable(
                id: $0.id, stationIndex: $0.resolvedStationIndex, label: $0.station,
                carrier: $0.resolvedCarrier, selfShare: $0.selfShare, note: $0.splitNote ?? ""
            )
        }
        galeria("simulacion-datos", alto: 1500) {
            self.conCabecera(titulo: "Simulación Doubles", apoyo: "Sábado · la hacéis juntos. Biel lidera trineos, tú wall balls.", salida: .volver) {
                DoblesSimulacionCuerpo(
                    simulation: simulacion, selfName: "Tú", partnerName: "Biel",
                    coachLabel: "Coach", coachName: "Coach", provenance: "Propuesta de Coach",
                    estaciones: .constant(estaciones)
                )
                .padding(.horizontal, Theme.Spacing.pantalla)
            }
        }
        galeria("simulacion-cargando", alto: 720) {
            self.conCabecera(titulo: "Simulación Doubles", salida: .volver) {
                DoblesSimulacionEsqueleto().padding(.horizontal, Theme.Spacing.pantalla)
            }
        }
    }

    // MARK: - El editor del reparto

    @MainActor
    func testEditorDelReparto() throws {
        let gap: DoblesRaceGap = try Self.decodifica(Self.carreraJSON)
        let tramo = try XCTUnwrap(gap.segments.first { $0.isEditable })
        let hoja = DoblesRepartoEditorSheet(
            segment: tramo, partnerName: "Biel", predictedTotalS: gap.predictedTotalS,
            goalS: gap.goalS, gapS: gap.gapS, onSaved: {}
        )
        galeria("reparto-hoja", alto: 620) {
            self.conCabecera(kicker: "Ajusta el reparto", titulo: tramo.labelEs, salida: .cerrar) {
                hoja.cuerpo.padding(.horizontal, Theme.Spacing.pantalla)
            }
        }
        let sinDatos = DoblesRepartoEditorSheet(
            segment: try XCTUnwrap(gap.segments.last { $0.isEditable }), partnerName: "Biel",
            predictedTotalS: gap.predictedTotalS, goalS: gap.goalS, gapS: gap.gapS, onSaved: {}
        )
        galeria("reparto-sin-datos", alto: 520) {
            self.conCabecera(kicker: "Ajusta el reparto", titulo: "Wall balls", salida: .cerrar) {
                sinDatos.cuerpo.padding(.horizontal, Theme.Spacing.pantalla)
            }
        }
    }

    // MARK: - El predicho de carrera de la pareja

    @MainActor
    func testPredichoDeCarrera() throws {
        let gap: DoblesRaceGap = try Self.decodifica(Self.carreraJSON)
        let seccion = DoblesRaceGapSection(raceId: "1", bearer: nil)
        galeria("carrera-datos", alto: 1500) {
            seccion.content(gap).padding(.horizontal, Theme.Spacing.pantalla).padding(.top, Theme.Spacing.l)
        }
        galeria("carrera-cargando", alto: 560) {
            DoblesRaceGapEsqueleto().padding(.horizontal, Theme.Spacing.pantalla).padding(.top, Theme.Spacing.l)
        }
    }

    // MARK: - El resumen conjunto y el aviso en vivo

    @MainActor
    func testResumenConjunto() {
        let datos = JointShareData(
            title: "Fuerza · tren inferior",
            dateText: "26 sep 2026",
            selfSide: .init(name: "Tú", timeText: "45:12", rpe: 8, tonnageText: "5400 kg", prCount: 1),
            partnerSide: .init(name: "Biel", timeText: nil, rpe: nil, tonnageText: "4900 kg", prCount: 0),
            footerText: "3ª sesión juntos este mes"
        )
        galeria("resumen-conjunto", alto: 720, oscuroSiempre: true) {
            DoblesJointSummaryView(data: datos, onDone: {}).tarjeta
        }
        galeria("resumen-tarjeta-compartida", alto: 450, oscuroSiempre: true) {
            DoblesJointShareCard(data: datos)
        }
    }

    @MainActor
    func testAvisoEnVivo() {
        galeria("aviso-en-vivo", alto: 360) {
            VStack(spacing: Theme.Spacing.l) {
                DoblesLiveBanner(state: .visible(name: "Biel", subtitle: "Metcon 20' · RONDA 3/5", canJoin: true), onJoin: {})
                DoblesLiveBanner(state: .visible(name: "Biel", subtitle: "Metcon 20' · RONDA 3/5", canJoin: false))
            }
            .padding(Theme.Spacing.pantalla)
        }
    }

    // MARK: - Composición de las pantallas

    /// La semana conectada como la apila la pantalla: cabecera fija con el par de avatares y, debajo, el aviso en
    /// vivo (si lo hay) y el cuerpo.
    private func hub(plan: DoblesConnectedPlan, verLaDeLaPareja: Bool, enVivo: Bool = false) -> some View {
        conCabecera(titulo: "Tu semana", apoyo: "Sem 2/4 · conectada con Biel", salida: .cerrar, pareja: true) {
            VStack(alignment: .leading, spacing: Theme.Spacing.l) {
                if enVivo {
                    DoblesLiveBanner(state: .visible(name: "Biel", subtitle: "Metcon 20' · RONDA 3/5", canJoin: false))
                }
                DoblesPlanCuerpo(plan: plan, partnerName: "Biel", showingPartner: .constant(verLaDeLaPareja), bearer: nil)
            }
            .padding(.horizontal, Theme.Spacing.pantalla)
        }
    }

    /// Entrenar a la vez: cabecera, cuerpo y, debajo, las dos salidas en su pie anclado.
    private func entrenar(_ sesion: DoblesTrainTogetherSession) -> some View {
        VStack(spacing: 0) {
            conCabecera(
                kicker: "Podéis hacerla juntos o cada uno",
                titulo: sesion.title ?? "Entrenar a la vez",
                apoyo: sesion.subtitle,
                salida: .volver
            ) {
                DoblesTrainTogetherCuerpo(session: sesion, selfName: "Yo", partnerName: "Biel", partnerInitials: "B")
                    .padding(.horizontal, Theme.Spacing.pantalla)
            }
            Hairline()
            DoblesTrainTogetherAcciones(puedeJuntos: !sesion.isSelfOnly, habilitadas: true, alJuntos: {}, alSolo: {})
                .padding(.horizontal, Theme.Spacing.l)
                .padding(.top, Theme.Spacing.m)
                .padding(.bottom, Theme.Spacing.s)
        }
    }

    private func conCabecera<Contenido: View>(
        kicker: String? = nil,
        titulo: String,
        apoyo: String? = nil,
        salida: SalidaDobles,
        pareja: Bool? = nil,
        @ViewBuilder _ contenido: () -> Contenido
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.s) {
            if let pareja {
                CabeceraDobles(kicker: kicker, titulo: titulo, apoyo: apoyo, salida: salida, alSalir: {}) {
                    DoblesAvatarPair(selfInitials: "Yo", partnerInitials: pareja ? "B" : "·")
                }
            } else {
                CabeceraDobles(kicker: kicker, titulo: titulo, apoyo: apoyo, salida: salida, alSalir: {})
            }
            contenido()
        }
    }

    // MARK: - Render

    @MainActor
    private func galeria(
        _ nombre: String,
        alto: CGFloat,
        tamano: DynamicTypeSize? = nil,
        soloClaroDeFabrica: Bool = false,
        oscuroSiempre: Bool = false,
        @ViewBuilder _ vista: () -> some View
    ) {
        let variantes = soloClaroDeFabrica ? [Self.variantes[0]] : Self.variantes
        for v in variantes {
            ClubThemeStore.update(v.club)
            let esquema: ColorScheme = oscuroSiempre ? .dark : v.esquema
            var contenido = AnyView(
                ZStack(alignment: .top) {
                    Theme.Color.background
                    vista().fixedSize(horizontal: false, vertical: true)
                }
                .frame(width: Self.ancho, height: alto, alignment: .top)
                .environment(\.colorScheme, esquema)
            )
            if let tamano { contenido = AnyView(contenido.environment(\.dynamicTypeSize, tamano)) }
            let renderer = ImageRenderer(content: contenido)
            renderer.scale = 2
            guard let imagen = renderer.uiImage, let png = imagen.pngData() else {
                XCTFail("No se pudo pintar \(nombre) · \(v.nombre)")
                continue
            }
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = "\(nombre)-\(v.nombre)"
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(nombre)-\(v.nombre).png"))
            }
            if oscuroSiempre { break }
        }
        ClubThemeStore.clear()
    }

    // MARK: - Fixtures (como llegan del servidor)

    private static func decodifica<T: Decodable>(_ json: String) throws -> T {
        try APIClient.makeJSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private static let planJSON = """
    {
      "partner_name": "Biel", "partner_plan_visible": true, "week_label": "Sem 2/4", "notes": [],
      "train_together_session_id": "42",
      "self_days": [
        { "id": "d1", "day_label": "LUN", "session_title": "Intervalos · 5×1000", "detail": "Biel hace 6×1000", "togetherness": "each_own", "modality": "run" },
        { "id": "d2", "day_label": "MAR", "session_title": "Fuerza · tren inferior", "detail": "opcional juntos · en el box", "togetherness": "optional_together", "modality": "strength" },
        { "id": "d3", "day_label": "MIÉ", "session_title": "Rodaje suave", "detail": null, "togetherness": "both_done", "modality": "run" },
        { "id": "d4", "day_label": "JUE", "session_title": null, "detail": null, "togetherness": "rest", "modality": null },
        { "id": "d5", "day_label": "VIE", "session_title": "Remo + SkiErg", "detail": null, "togetherness": "each_own", "modality": "row" },
        { "id": "d6", "day_label": "SÁB", "session_title": "Simulación conjunta", "detail": "la hacéis juntos · 8 estaciones", "togetherness": "joint_mandatory", "modality": "hyrox" },
        { "id": "d7", "day_label": "DOM", "session_title": null, "detail": null, "togetherness": "rest", "modality": null }
      ],
      "partner_days": [
        { "id": "p1", "day_label": "LUN", "session_title": "Intervalos · 6×1000", "detail": null, "togetherness": "each_own", "modality": "run" },
        { "id": "p2", "day_label": "SÁB", "session_title": "Simulación conjunta", "detail": null, "togetherness": "joint_mandatory", "modality": "hyrox" }
      ],
      "streak": { "joint_this_month": 3, "weeks_streak": 2,
        "last_joint": { "date": "2026-09-26", "title": "Fuerza · tren inferior", "self_time_s": 2712, "partner_time_s": 2790 } }
    }
    """

    private static let sesionJSON = """
    {
      "title": "Fuerza · tren inferior", "subtitle": "≈ 40 min · si la hacéis juntos, en el box",
      "self_name": "Yo", "partner_name": "Biel", "self_one_rm": "SQ 1RM 110", "partner_one_rm": "SQ 1RM 95",
      "partner_visibility": "shared",
      "exercises": [
        { "id": "e1", "exercise": "Sentadilla trasera", "sets_reps": "5×5", "self_load": "88 kg", "partner_load": "76 kg" },
        { "id": "e2", "exercise": "Peso muerto rumano", "sets_reps": "4×8", "self_load": "80% · 105 kg", "partner_load": null },
        { "id": "e3", "exercise": "Zancadas caminando", "sets_reps": "3×12", "self_load": "24 kg", "partner_load": "20 kg" }
      ]
    }
    """

    private static let analiticasJSON = """
    {
      "partner_name": "Biel", "best_self": "1:08:42", "best_partner": "1:11:05",
      "doubles_mark": "58:30", "doubles_delta": "−3:10 objetivo",
      "contribution_summary": "Tú aportas más en fuerza; Biel, en carrera.",
      "contributions": [
        { "id": "c1", "group": "Trineos / fuerza", "self_share": 0.62 },
        { "id": "c2", "group": "Wall balls / burpees", "self_share": 0.48 },
        { "id": "c3", "group": "Running", "self_share": 0.35 }
      ],
      "weekly": [
        { "id": "w1", "metric": "Adherencia", "self_value": "96%", "partner_value": "88%" },
        { "id": "w2", "metric": "Remo 2k test", "self_value": "7:18", "partner_value": null }
      ],
      "head_to_head": [
        { "id": "h1", "metric": "SkiErg 1000 m", "self_value": "4:12", "partner_value": "4:30" },
        { "id": "h2", "metric": "Sled Push", "self_value": "2:05", "partner_value": "1:58" },
        { "id": "h3", "metric": "Remo 1000 m", "self_value": null, "partner_value": "4:20" }
      ]
    }
    """

    private static let simulacionJSON = """
    {
      "title": "Simulación Doubles", "day_label": "Sábado", "intro": "Biel lidera trineos, tú wall balls.",
      "self_name": "Tú", "partner_name": "Biel",
      "coach_note": "Salid controlando el primer kilómetro; el trineo es vuestro punto fuerte.",
      "last_edited_by_kind": "coach", "last_edited_by_name": "Coach",
      "coach_tips": ["Hidratad en la RoxZone.", "Acordad el relevo con una sola palabra."],
      "station_splits": [
        { "id": "station-2", "station_index": 2, "station": "SkiErg", "carrier": "self", "self_share": 1, "detail": "1000 m", "flagged": false },
        { "id": "station-4", "station_index": 4, "station": "Sled Push", "carrier": "partner", "self_share": 0, "detail": "50 m", "flagged": false },
        { "id": "station-6", "station_index": 6, "station": "Burpee broad jumps", "carrier": "split", "self_share": 0.6, "split_note": "alterna 20 saltos", "flagged": true }
      ]
    }
    """

    private static let carreraJSON = """
    {
      "availability": "partial", "race_name": "HYROX Barcelona Dobles", "race_date": "2026-10-12",
      "partner_name": "Biel", "goal_s": 3900, "goal_label": "Sub-65", "predicted_total_s": 4020, "gap_s": 120,
      "coach_tips": ["Salid a ritmo cómodo en la primera carrera.", "Repartid los wall balls en series de 10."],
      "strategy_last_edited_by": "Biel",
      "segments": [
        { "key": "run-1", "label_es": "Carrera 1", "kind": "run", "carrier": "together", "budget_s": 300, "pair_predicted_s": 296, "delta_s": -4, "tier": "observado" },
        { "key": "st-2", "label_es": "SkiErg", "kind": "station", "station_index": 2, "carrier": "split", "self_share": 0.6, "budget_s": 240, "pair_predicted_s": 252, "delta_s": 12, "self_solo_s": 230, "partner_solo_s": 270, "tier": "observado" },
        { "key": "rox-1", "label_es": "RoxZone 1", "kind": "roxzone", "carrier": "together", "budget_s": 30, "pair_predicted_s": 34, "delta_s": 4, "tier": "estimado" },
        { "key": "st-4", "label_es": "Sled Push", "kind": "station", "station_index": 4, "carrier": "partner", "self_share": 0, "budget_s": 150, "pair_predicted_s": 141, "delta_s": -9, "self_solo_s": 160, "partner_solo_s": 141, "tier": "estimado" },
        { "key": "st-16", "label_es": "Wall balls", "kind": "station", "station_index": 16, "carrier": "self", "self_share": 1, "budget_s": 240, "pair_predicted_s": 250, "delta_s": 10, "tier": "estimado" }
      ]
    }
    """
}
