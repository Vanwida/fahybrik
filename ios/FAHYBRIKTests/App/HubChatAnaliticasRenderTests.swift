import XCTest
import SwiftUI
@testable import FAHYBRIK

// EL HUB DE TESTS, EL CHAT Y LAS ANALÍTICAS — sus dos extremos, renderizados.
//
// Hermana de `VivoHUDRenderTests`, y por lo mismo: no es una prueba de píxeles,
// es la prueba de que las tres pantallas se SOSTIENEN en los dos estados que el
// §6.3 llama «el caso de diseño» — el atleta recién dado de alta y el que lleva
// tiempo —, y de paso el sitio de donde salen las capturas.
//
//   recién dado de alta — sin batería, sin conversación, sin una sola cifra. Es
//                         donde estas tres pantallas estaban peor: apiladas
//                         arriba, el resto negro y NI UNA acción.
//   con datos           — la batería a medias, el veredicto con su juicio.
//
// El segundo NO es la versión buena del primero: el vacío es un estado de pleno
// derecho, con su sujeto y su salida.
//
// OJO con el arnés: `ImageRenderer` no dibuja `ScrollView` ni `sheet`. Por eso
// se renderizan los ESTADOS (que son piezas propias) y no las pantallas enteras,
// cuyo cuerpo vive dentro de un `CenteredScreen` — y por eso cada captura se
// monta en el lienzo entero, centrada, que es la geometría que ese scaffold da.

final class HubChatAnaliticasRenderTests: XCTestCase {

    private static let lienzo = CGSize(width: 402, height: 781)

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    // MARK: - El hub de tests

    @MainActor
    func testHubSinBateriaTieneSujetoYSalida() {
        // El peor caso mínimo de la app. Lo que NO puede volver a pasar: que el
        // atleta aterrice aquí y no tenga nada que tocar.
        let imagen = render(centrado { TestsSinBateriaState(onProbarme: {}) },
                            nombre: "tests-hub-atleta-nuevo")
        XCTAssertNotNil(imagen, "El vacío del hub tiene que renderizar")
    }

    @MainActor
    func testTarjetaDeInicioPintaElContadorEnCeroSinInventarDenominador() {
        // §6.2 bis — un contador se pinta EN CERO, que es cuando más falta hace.
        // Y sin batería publicada no hay «de cuántos»: el denominador no se
        // inventa, así que no aparece.
        let imagen = render(centrado { TestBatteryCard(status: .empty) },
                            nombre: "tests-tarjeta-atleta-nuevo")
        XCTAssertNotNil(imagen)
        XCTAssertFalse(BatteryStatus.empty.isScheduled)
    }

    @MainActor
    func testTarjetaDeInicioConBateriaAMedias() {
        let imagen = render(centrado { TestBatteryCard(status: Self.bateriaAMedias) },
                            nombre: "tests-tarjeta-con-datos")
        XCTAssertNotNil(imagen)
        XCTAssertEqual(Self.bateriaAMedias.completed, 2)
        XCTAssertEqual(Self.bateriaAMedias.total, 4)
    }

    @MainActor
    func testElContadorSeSostieneEnLosDosExtremos() {
        XCTAssertNotNil(render(centrado { CalibrationCounter(done: 0, total: nil, hero: true) },
                               nombre: "tests-contador-cero"))
        XCTAssertNotNil(render(centrado { CalibrationCounter(done: 2, total: 4, hero: true) },
                               nombre: "tests-contador-con-datos"))
    }

    // MARK: - El chat

    @MainActor
    func testChatSinConversacionCentraYOfreceArranque() {
        // El vacío deja de colgar de un `.padding(.top, 72)` fijo: se centra en
        // su banda y gana una salida que RELLENA el compositor (no lo envía).
        let imagen = render(
            centrado { ChatVacioState(coachInitials: "PA", prompt: "Escribe a Pablo para empezar", onArranque: {}) },
            nombre: "chat-atleta-nuevo"
        )
        XCTAssertNotNil(imagen)
        XCTAssertEqual(ChatVacioState.conversationStarter, "Hoy me he encontrado…")
    }

    @MainActor
    func testChatConErrorTieneReintento() {
        // Antes esta rama reutilizaba el bloque del vacío cambiando el copy, así
        // que decía «revisa tu conexión» y no había nada que tocar.
        let imagen = render(centrado { ChatErrorState(onReintentar: {}) },
                            nombre: "chat-error-con-reintento")
        XCTAssertNotNil(imagen)
    }

    @MainActor
    func testChatSinNombreDeCoachNoInventaIniciales() {
        // Sin nombre no hay iniciales que fabricar: `CoachAvatar` cae al glifo.
        let imagen = render(
            centrado { ChatVacioState(coachInitials: "", prompt: "Escríbele a tu coach para empezar", onArranque: {}) },
            nombre: "chat-atleta-nuevo-sin-nombre-de-coach"
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - Las analíticas

    @MainActor
    func testSeccionVaciaEsUNEstadoConSalida() {
        // Antes: N tarjetas grises diciendo cada una que no había nada, ninguna
        // con salida. Ahora: UNO, centrado, con el porqué que escribe el
        // servidor y un acto que lo llena.
        let imagen = render(
            centrado {
                AnalyticsSeccionVaciaState(
                    seccion: "Carrera",
                    porque: "Haz un test de carrera para fijar tu umbral.",
                    necesitaDispositivo: false,
                    onVerTests: {}
                )
            },
            nombre: "analiticas-atleta-nuevo"
        )
        XCTAssertNotNil(imagen)
    }

    @MainActor
    func testSeccionQueNecesitaDispositivoExplicaEnVezDeFingirUnBoton() {
        let imagen = render(
            centrado {
                AnalyticsSeccionVaciaState(
                    seccion: "Recup.",
                    porque: "Necesitamos noches con pulso registrado para leer tu recuperación.",
                    necesitaDispositivo: true,
                    onVerTests: {}
                )
            },
            nombre: "analiticas-necesita-dispositivo"
        )
        XCTAssertNotNil(imagen)
    }

    @MainActor
    func testVeredictoConCoberturaLlevaSuJuicio() {
        let v = AnalyticsVerdict.of(Self.seccionConUmbral)
        XCTAssertNotNil(v)
        let imagen = render(
            centrado { AnalyticsVerdictBlock(verdict: v!, periodLabel: "últimos 30 días") },
            nombre: "analiticas-veredicto-con-datos"
        )
        XCTAssertNotNil(imagen)
    }

    @MainActor
    func testSinCoberturaLaCifraSeQuedaYElJuicioSeRetira() {
        let v = AnalyticsVerdict.of(Self.seccionSinCobertura)
        XCTAssertNotNil(v)
        let imagen = render(
            centrado { AnalyticsVerdictBlock(verdict: v!, periodLabel: "últimos 30 días") },
            nombre: "analiticas-veredicto-sin-cobertura"
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - El veredicto, como dato (lo que sostiene todo lo de arriba)

    func testElVeredictoEsLaPrimeraTarjetaQueTRAECIFRA() {
        // No la primera tarjeta a secas: una sin cifra no es portada de nada.
        let v = AnalyticsVerdict.of(Self.seccionConUmbral)
        XCTAssertEqual(v?.figure, "4:15")
        XCTAssertEqual(v?.unit, "/km · Z4")
        XCTAssertEqual(v?.label, "Ritmo umbral · tu motor")
    }

    func testConCoberturaHayJuicioYNoHayHueco() {
        let v = AnalyticsVerdict.of(Self.seccionConUmbral)
        XCTAssertEqual(v?.judgement, "¿A qué ritmo correr cada km? Umbral entrenado del plan.")
        XCTAssertNil(v?.coverageGap, "con cobertura no hay hueco que declarar")
    }

    func testSinCoberturaSeRetiraElJuicioYSeDeclaraElHueco() {
        // La regla del 28-jul: «sin cobertura no hay veredicto». La CIFRA se
        // queda —es real— y lo que se retira es el juicio.
        let v = AnalyticsVerdict.of(Self.seccionSinCobertura)
        XCTAssertEqual(v?.figure, "4:15", "la cifra medida no desaparece")
        XCTAssertNil(v?.judgement, "sin cobertura el juicio se retira")
        XCTAssertEqual(v?.coverageGap, "Registra más sesiones para que esto signifique algo.")
    }

    func testUnaSeccionSinUnaSolaCifraEsUnVacio() {
        // El caso del atleta recién dado de alta: el servidor SIEMPRE emite sus
        // tarjetas, y todas llegan sin dato. Eso no es una lista corta.
        XCTAssertTrue(AnalyticsVerdict.isBlank(Self.seccionVacia))
        XCTAssertNil(AnalyticsVerdict.of(Self.seccionVacia), "sin cifras no hay veredicto")
    }

    func testUnaSeccionConUnaSolaCifraNoEsUnVacio() {
        XCTAssertFalse(AnalyticsVerdict.isBlank(Self.seccionConUmbral))
    }

    func testElPorqueDelVacioLoEscribeElServidor() {
        // Nunca una frase nuestra cuando el servidor ya dice qué falta.
        XCTAssertEqual(AnalyticsVerdict.blankReason(Self.seccionVacia),
                       "Haz un test de carrera para fijar tu umbral.")
    }

    // MARK: - Datos de prueba

    private static let bateriaAMedias = BatteryStatus(
        total: 4,
        completed: 2,
        tests: [
            test(slug: "control_5k", label: "Test de 5K", captured: true),
            test(slug: "remo_2k", label: "Remo 2K", captured: true),
            test(slug: "sentadilla_1rm", label: "Sentadilla 1RM", captured: false, pending: true),
            test(slug: "cooper", label: "Cooper 12'", captured: false),
        ],
        athleteWeightKg: nil
    )

    private static func test(slug: String, label: String,
                             captured: Bool, pending: Bool = false) -> CalibrationTestStatus {
        CalibrationTestStatus(
            calibrationSlug: slug,
            label: label,
            assignmentId: "assign-\(slug)",
            scheduledFor: "2026-07-30",
            sessionStatus: captured ? "completed" : "scheduled",
            resultCaptured: captured,
            resultPending: pending,
            resultLabel: captured ? "22:14" : nil,
            capture: nil,
            brief: nil
        )
    }

    private static let periodo = ResolvedPeriod(
        key: "month", start_iso: "2026-06-30", end_iso: "2026-07-30",
        label_es: "últimos 30 días", days: 30
    )

    private static func card(id: String, title: String, value: String?,
                             unit: String?, availability: Availability,
                             note: String?, meaning: String?) -> AnalyticsCard {
        AnalyticsCard(
            id: id, title_es: title, availability: availability, availability_note: note,
            primary: value.map { CardPrimary(value: $0, unit: unit, side: nil) },
            rows: [], series: [], series_kind: nil, series_axis: nil, zones: [],
            meaning_es: meaning, drill: nil
        )
    }

    private static let seccionConUmbral = AnalyticsSection(
        section: .running, title_es: "Carrera", availability: .real, period: periodo,
        cards: [
            // La primera NO trae cifra: la portada tiene que saltársela.
            card(id: "volumen", title: "Volumen", value: nil, unit: nil,
                 availability: .needs_logging, note: "Registra más carreras.", meaning: nil),
            card(id: "threshold", title: "Ritmo umbral · tu motor", value: "4:15", unit: "/km · Z4",
                 availability: .real, note: nil,
                 meaning: "¿A qué ritmo correr cada km? Umbral entrenado del plan."),
        ]
    )

    private static let seccionSinCobertura = AnalyticsSection(
        section: .running, title_es: "Carrera", availability: .needs_logging, period: periodo,
        cards: [
            card(id: "threshold", title: "Ritmo umbral · tu motor", value: "4:15", unit: "/km · Z4",
                 availability: .needs_logging,
                 note: "Registra más sesiones para que esto signifique algo.",
                 meaning: "Umbral entrenado del plan."),
        ]
    )

    private static let seccionVacia = AnalyticsSection(
        section: .running, title_es: "Carrera", availability: .needs_logging, period: periodo,
        cards: [
            card(id: "threshold", title: "Ritmo umbral · tu motor", value: nil, unit: "/km · Z4",
                 availability: .needs_logging, note: "Haz un test de carrera para fijar tu umbral.",
                 meaning: nil),
            card(id: "volumen", title: "Volumen semanal", value: nil, unit: "km",
                 availability: .needs_logging, note: "Registra carreras para ver tu volumen.",
                 meaning: nil),
            card(id: "cadencia", title: "Cadencia", value: nil, unit: nil,
                 availability: .needs_wearable, note: "Necesitamos un reloj para leer tu cadencia.",
                 meaning: nil),
        ]
    )

    // MARK: - Render

    /// El lienzo entero con el estado centrado — la geometría que da
    /// `CenteredScreen`, montada a mano porque `ImageRenderer` no dibuja su
    /// `ScrollView`. Lo que se ve aquí es lo que ve el atleta.
    @ViewBuilder
    private func centrado(@ViewBuilder _ vista: () -> some View) -> some View {
        ZStack {
            Theme.Color.background.ignoresSafeArea()
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                vista()
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Theme.Spacing.xl)
        }
    }

    @MainActor
    private func render(_ vista: some View, nombre: String) -> UIImage? {
        let renderer = ImageRenderer(
            content: vista
                .frame(width: Self.lienzo.width, height: Self.lienzo.height)
                .environment(\.colorScheme, .dark)
        )
        renderer.scale = 3
        guard let imagen = renderer.uiImage else { return nil }

        if let png = imagen.pngData() {
            let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            adjunto.name = nombre
            adjunto.lifetime = .keepAlways
            add(adjunto)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
            }
        }
        return imagen
    }
}
