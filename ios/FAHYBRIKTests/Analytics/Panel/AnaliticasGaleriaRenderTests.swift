import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA PORTADA DE ANALÍTICAS, RENDERIZADA DE VERDAD — los cinco atletas del motor en claro y en oscuro, con el acento de fábrica y con el
// de un club azul y uno amarillo (`renderizaGaleria`, la herramienta común de `GaleriaRender.swift`), para COMPARAR con las capturas del
// doble (`analiticas-portada-*` en el doble vivo). `ImageRenderer` no ejecuta `onAppear` ni dibuja un `ScrollView`: por eso la galería
// es la pantalla en plano y el arco de la disposición se pide sin animar.
final class AnaliticasGaleriaRenderTests: XCTestCase {

    private static let ancho: CGFloat = 402

    @MainActor
    private func portada(_ atleta: AnaliticasFixtures.Atleta, _ ventana: VentanaClave = .doceSemanas, variantes: [VarianteDeGaleria] = VarianteDeGaleria.todas) throws {
        let panel = try AnaliticasFixtures.panel(atleta, ventana)
        renderizaGaleria("portada-\(atleta.rawValue)-\(ventana.rawValue)-a", variantes: variantes) { AnaliticasGaleria(panel: panel, tramo: .arriba, ancho: Self.ancho) }
        renderizaGaleria("portada-\(atleta.rawValue)-\(ventana.rawValue)-b", variantes: variantes) { AnaliticasGaleria(panel: panel, tramo: .abajo, ancho: Self.ancho) }
    }

    // MARK: - Los cinco atletas del motor, a 12 semanas

    @MainActor func testLleno() throws { try portada(.lleno) }
    @MainActor func testMixto() throws { try portada(.mixto) }
    @MainActor func testPoco() throws { try portada(.poco) }
    @MainActor func testVacio() throws { try portada(.vacio) }
    @MainActor func testViejo() throws { try portada(.viejo) }

    // MARK: - Las otras ventanas: todo obedece al selector (claro y oscuro de fábrica)

    @MainActor func testLlenoSieteDias() throws { try portada(.lleno, .sieteDias, variantes: VarianteDeGaleria.dos) }
    @MainActor func testLlenoUnAno() throws { try portada(.lleno, .unAno, variantes: VarianteDeGaleria.dos) }
    @MainActor func testLlenoTodo() throws { try portada(.lleno, .todo, variantes: VarianteDeGaleria.dos) }

    // MARK: - Cargando y error

    @MainActor func testCargando() {
        renderizaGaleria("portada-cargando", variantes: VarianteDeGaleria.dos) { AnaliticasPortadaEsqueleto().padding(Theme.Spacing.pantalla) }
    }

    @MainActor func testError() {
        renderizaGaleria("portada-error", variantes: VarianteDeGaleria.dos) { AnaliticasErrorDeCarga(onReintentar: {}).padding(Theme.Spacing.pantalla) }
    }

    // MARK: - La glosa, y el texto del sistema en sus dos extremos

    @MainActor func testGlosa() {
        renderizaGaleria("portada-glosa", variantes: VarianteDeGaleria.dos) { AnaliticasGlosa(metodo: .porDefecto, onCerrar: {}).frame(height: 700) }
    }

    @MainActor func testSujetoYSeccionConElTextoDelSistemaEnSusDosExtremos() throws {
        let panel = try AnaliticasFixtures.panel(.lleno)
        let sujeto = SujetoEstado.desde(panel, bloque: .lleno)
        for (sufijo, tamano) in [("xs", DynamicTypeSize.xSmall), ("ax3", .accessibility3)] {
            renderizaGaleria("portada-sujeto-\(sufijo)", variantes: Array(VarianteDeGaleria.dos.prefix(1)), tamanoDeTexto: tamano) {
                VStack(alignment: .leading, spacing: 30) {
                    AnaliticasSujeto(sujeto: sujeto, animado: false, onGlosa: {}, onSalida: { _ in })
                    AnaliticasSeccion(titulo: "Récords", pregunta: "7 marcas · 7 nuevas en esta ventana", onAbrir: {}) {
                        AnaliticasHueco(texto: AnaliticasEstados.pendiente, onSalida: { _ in })
                    }
                }
                .padding(Theme.Spacing.pantalla)
            }
        }
    }
}
