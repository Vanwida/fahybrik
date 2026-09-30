import XCTest
import SwiftUI
@testable import FAHYBRIK

// EL HUB DE TESTS Y EL CHAT — sus dos extremos, renderizados.
//
// Hermana de `VivoHUDRenderTests`, y por lo mismo: no es una prueba de píxeles,
// es la prueba de que las dos pantallas se SOSTIENEN en los dos estados que el
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

final class HubChatRenderTests: XCTestCase {

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
    func testElContadorSeSostieneEnLosDosExtremos() {
        XCTAssertNotNil(render(centrado { CalibrationCounter(done: 0, total: nil) },
                               nombre: "tests-contador-cero"))
        XCTAssertNotNil(render(centrado { CalibrationCounter(done: 2, total: 4) },
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
