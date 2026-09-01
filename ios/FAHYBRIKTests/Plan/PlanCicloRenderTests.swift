import XCTest
import SwiftUI
@testable import FAHYBRIK

// EL CICLO, DIBUJADO — el camino y sus estados.
//
// Hermana de `ComunicadosRenderTests`, y por lo mismo: no es una prueba de píxeles,
// es la prueba de que la pantalla se SOSTIENE en sus estados y el sitio de donde
// salen las capturas para mirarla sin una sesión viva.
//
// OJO con el arnés: `ImageRenderer` no dibuja un `ScrollView`, así que se dibuja
// `CuerpoDelCiclo` —que es EXACTAMENTE lo que la pantalla mete dentro del scroll— y
// no la pantalla entera. Por eso el cuerpo vive en su propia pieza.
final class PlanCicloRenderTests: XCTestCase {

    private static let lienzo = CGSize(width: 402, height: 900)

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    // MARK: - El camino con datos

    /// EL CASO DE DISEÑO: cuatro etapas, hoy dentro de la segunda con sus marcas de
    /// semana y su calendario, la política al acabar y la carrera cerrando.
    @MainActor
    func testCicloCompletoConSuCarreraCerrando() {
        let ciclo = EscenariosCiclo.completo
        XCTAssertFalse(ciclo.hayHueco)
        let imagen = render(CuerpoDelCiclo(ciclo: ciclo), nombre: "plan-ciclo-completo")
        XCTAssertNotNil(imagen)
    }

    /// El mismo ciclo en CLARO. El doble sólo se ha mirado en oscuro, pero la app
    /// sigue la apariencia del sistema: el tono del primer tramo no puede ser el
    /// naranja de marca cuando se escribe, porque sobre lienzo blanco no llega a
    /// 4,5:1. Esta captura es la que enseña que sí se lee.
    @MainActor
    func testCicloCompletoEnClaro() {
        let imagen = render(
            CuerpoDelCiclo(ciclo: EscenariosCiclo.completo),
            nombre: "plan-ciclo-completo-claro",
            esquema: .light
        )
        XCTAssertNotNil(imagen)
    }

    /// Lo publicado se acaba y nadie ha dicho qué viene: el camino se dibuja ROTO
    /// (nodo y raíl discontinuos) y se declara de quién depende. Y entonces NO hay
    /// línea de «al acabar»: no hay regla, hay un agujero.
    @MainActor
    func testCicloConHuecoDeclaraDeQuienDepende() {
        let ciclo = EscenariosCiclo.conHueco
        XCTAssertTrue(ciclo.hayHueco)
        XCTAssertNil(ciclo.politica)
        let imagen = render(CuerpoDelCiclo(ciclo: ciclo), nombre: "plan-ciclo-hueco")
        XCTAssertNotNil(imagen)
    }

    /// La carrera SIN objetivo puesto: el rombo, el nombre y la cuenta atrás, y
    /// ningún tiempo. Un objetivo por defecto parecería del atleta.
    @MainActor
    func testCarreraSinObjetivoNoPintaNinguno() {
        let imagen = render(
            CuerpoDelCiclo(ciclo: EscenariosCiclo.sinObjetivo),
            nombre: "plan-ciclo-carrera-sin-objetivo"
        )
        XCTAssertNotNil(imagen)
    }

    /// Hoy no cae en ninguna etapa: el sujeto es el HECHO, sin contador puesto a
    /// cero, y ninguna parada se pinta como pasada.
    @MainActor
    func testSinEtapaActivaElSujetoEsElHecho() {
        let ciclo = EscenariosCiclo.sinEtapaActiva
        XCTAssertNil(ciclo.semanaEnTramo)
        let imagen = render(CuerpoDelCiclo(ciclo: ciclo), nombre: "plan-ciclo-sin-etapa")
        XCTAssertNotNil(imagen)
    }

    /// Una sola etapa publicada: el pie del sujeto no repite la cuenta del ciclo.
    @MainActor
    func testUnaSolaEtapaNoRepiteLaCuenta() {
        let imagen = render(
            CuerpoDelCiclo(ciclo: EscenariosCiclo.unaSolaEtapa),
            nombre: "plan-ciclo-una-etapa"
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - Los estados sin datos

    /// El atleta recién dado de alta: ni una etapa publicada. Sin sujeto que
    /// repartir, la pantalla se centra y declara su salida.
    @MainActor
    func testVacioTieneSujetoYSalida() {
        let imagen = render(
            centrado {
                RedesignEmptyState(
                    symbol: "square.stack.3d.up",
                    title: "Aún no tienes plan",
                    message: "Cuando tu coach publique tu primera etapa, aquí verás por dónde vas y cuánto queda.",
                    exit: .explained(note: LoPublicaElCoach.frase)
                )
            },
            nombre: "plan-ciclo-vacio"
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - Las piezas que cuelgan de una parada

    /// LAS MARCAS DE SEMANA: todas miden lo mismo y solo cambia la de hoy. Si
    /// alguna fuese más alta que otra sería una rampa de carga prevista, que es
    /// justo lo que esta pantalla viene a sustituir.
    @MainActor
    func testMarcasDeSemanaSonPosicionNoCantidad() {
        let imagen = render(
            VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                MarcasDeSemana(semanas: 4, cursor: 2, color: Theme.Color.info)
                MarcasDeSemana(semanas: 6, cursor: 6, color: Theme.Color.ok)
                MarcasDeSemana(semanas: 1, cursor: 1, color: Theme.Color.accent)
                Spacer(minLength: 0)
            }
            .padding(Theme.Spacing.l),
            nombre: "plan-ciclo-marcas-semana",
            alto: 320
        )
        XCTAssertNotNil(imagen)
    }

    /// LO QUE HAY EN EL CALENDARIO, con su cuándo: hoy, mañana, en días y en
    /// semanas conviven en la misma lista.
    @MainActor
    func testEnElCalendarioDiceCuandoCaeCadaMarca() {
        let imagen = render(
            VStack(alignment: .leading) {
                EnElCalendario(
                    hitos: [
                        HitoDelTramo(kind: "test", title: "Test de 5 km", date: "2026-08-19"),
                        HitoDelTramo(kind: "test", title: "Test de fuerza", date: "2026-08-20"),
                        HitoDelTramo(kind: "sim", title: "Simulación media", date: "2026-08-26"),
                        HitoDelTramo(kind: "sim", title: "Simulacro completo", date: "2026-09-10"),
                    ],
                    hoy: EscenariosCiclo.hoy,
                    color: Theme.Color.info
                )
                .padding(Theme.Spacing.l)
                Spacer(minLength: 0)
            },
            nombre: "plan-ciclo-calendario",
            alto: 320
        )
        XCTAssertNotNil(imagen)
    }

    // MARK: - Render

    @ViewBuilder
    private func centrado(@ViewBuilder _ vista: () -> some View) -> some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            vista()
            Spacer(minLength: 0)
        }
    }

    @MainActor
    private func render(
        _ vista: some View,
        nombre: String,
        alto: CGFloat? = nil,
        esquema: ColorScheme = .dark
    ) -> UIImage? {
        let renderer = ImageRenderer(
            content: ZStack {
                Theme.Color.background
                vista.padding(.horizontal, Theme.Spacing.l)
            }
            .frame(width: Self.lienzo.width, height: alto ?? Self.lienzo.height)
            .environment(\.colorScheme, esquema)
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
