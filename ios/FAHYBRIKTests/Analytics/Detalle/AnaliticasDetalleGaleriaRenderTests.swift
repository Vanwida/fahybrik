import XCTest
import SwiftUI
@testable import FAHYBRIK

// LOS DETALLES DE ANALÍTICAS, RENDERIZADOS DE VERDAD — la herramienta de REVISIÓN de las cuatro familias, los tres detalles de bloque
// y la sesión (`renderizaGaleria`, común con la portada). Cada estado del motor (los cinco atletas de prueba; las cinco sesiones) en
// claro y en oscuro, con el acento de fábrica y con el de un club azul; y los extremos: el amarillo (tinta oscura) y el texto del
// sistema al mínimo y al máximo de Dynamic Type.
//
// Se comparan con las capturas del doble (`analiticas-familia-*`, `analiticas-sesion-*`) y NO fallan por una diferencia de imagen:
// fallan si una pieza revienta al pintarse o sale vacía.
final class AnaliticasDetalleGaleriaRenderTests: XCTestCase {

    private static let cuatro = VarianteDeGaleria.cuatro

    // MARK: - Ayudantes

    @MainActor
    private func familia(_ familia: FamiliaDeDetalle, _ atleta: DetalleFixtures.Atleta, variantes: [VarianteDeGaleria] = VarianteDeGaleria.cuatro, nombre: String? = nil) throws {
        let detalle = try DetalleFixtures.detalle(familia, atleta)
        let cumplimiento = try DetalleFixtures.cumplimiento()
        let panel = try AnaliticasFixtures.panel(atleta)
        renderizaGaleria(nombre ?? "detalle-\(familia.rawValue)-\(atleta.rawValue)", variantes: variantes) {
            AnaliticasFamiliaGaleria(detalle: detalle, familia: familia, cumplimiento: atleta == .lleno ? cumplimiento : nil, panel: panel)
        }
    }

    @MainActor
    private func sesion(_ caso: DetalleFixtures.Caso, variantes: [VarianteDeGaleria] = VarianteDeGaleria.cuatro, tamanoDeTexto: DynamicTypeSize? = nil, sufijo: String = "") throws {
        let detalle = try DetalleFixtures.sesion(caso)
        let fila = DetalleFixtures.fila(de: detalle, en: try DetalleFixtures.cumplimiento())
        let lectura = LecturaDeSesion.desde(detalle, fila: fila, hoy: "2026-09-29")
        renderizaGaleria("sesion-\(caso.rawValue)\(sufijo)", variantes: variantes, tamanoDeTexto: tamanoDeTexto) { AnaliticasSesionGaleria(lectura: lectura) }
    }

    // MARK: - Correr: los cinco atletas

    @MainActor func testCorrerLleno() throws { try familia(.correr, .lleno) }
    @MainActor func testCorrerMixto() throws { try familia(.correr, .mixto) }
    @MainActor func testCorrerPoco() throws { try familia(.correr, .poco) }
    @MainActor func testCorrerViejo() throws { try familia(.correr, .viejo) }
    @MainActor func testCorrerVacio() throws { try familia(.correr, .vacio) }

    // MARK: - Ergo: cada máquina, medida, declarada y sin nada

    @MainActor func testRemoLleno() throws { try familia(.remo, .lleno) }
    @MainActor func testRemoMixto() throws { try familia(.remo, .mixto) }
    @MainActor func testRemoVacio() throws { try familia(.remo, .vacio) }
    @MainActor func testSkiLleno() throws { try familia(.ski, .lleno) }
    @MainActor func testBiciLleno() throws { try familia(.bici, .lleno) }
    @MainActor func testBiciViejo() throws { try familia(.bici, .viejo) }

    // MARK: - Fuerza y estaciones: los cinco atletas

    @MainActor func testFuerzaLleno() throws { try familia(.fuerza, .lleno) }
    @MainActor func testFuerzaMixto() throws { try familia(.fuerza, .mixto) }
    @MainActor func testFuerzaPoco() throws { try familia(.fuerza, .poco) }
    @MainActor func testFuerzaViejo() throws { try familia(.fuerza, .viejo) }
    @MainActor func testFuerzaVacio() throws { try familia(.fuerza, .vacio) }

    @MainActor func testEstacionesLleno() throws { try familia(.estaciones, .lleno) }
    @MainActor func testEstacionesMixto() throws { try familia(.estaciones, .mixto) }
    @MainActor func testEstacionesPoco() throws { try familia(.estaciones, .poco) }
    @MainActor func testEstacionesViejo() throws { try familia(.estaciones, .viejo) }
    @MainActor func testEstacionesVacio() throws { try familia(.estaciones, .vacio) }

    // MARK: - La sesión: las cinco del motor

    @MainActor func testSesionCinta() throws { try sesion(.cinta) }
    @MainActor func testSesionRemo() throws { try sesion(.remo) }
    @MainActor func testSesionSentadilla() throws { try sesion(.sentadilla) }
    @MainActor func testSesionTrineos() throws { try sesion(.trineos) }
    @MainActor func testSesionCarreraDeSalud() throws { try sesion(.carreraDeSalud) }

    // MARK: - Los detalles de bloque de la portada

    @MainActor
    private func bloque(_ bloque: BloqueDelPanel, _ atleta: DetalleFixtures.Atleta) throws {
        let panel = try AnaliticasFixtures.panel(atleta)
        let cumplimiento = atleta == .lleno ? try DetalleFixtures.cumplimiento() : nil
        renderizaGaleria("bloque-\(bloque.rawValue)-\(atleta.rawValue)", variantes: Self.cuatro) {
            AnaliticasBloqueGaleria(bloque: bloque, panel: panel, cumplimiento: cumplimiento)
        }
    }

    @MainActor func testBloqueSemanasLleno() throws { try bloque(.semanas, .lleno) }
    @MainActor func testBloqueSemanasVacio() throws { try bloque(.semanas, .vacio) }
    @MainActor func testBloqueRecordsLleno() throws { try bloque(.records, .lleno) }
    @MainActor func testBloqueRecordsVacio() throws { try bloque(.records, .vacio) }
    @MainActor func testBloqueCarreraLleno() throws { try bloque(.carrera, .lleno) }
    @MainActor func testBloqueCarreraVacio() throws { try bloque(.carrera, .vacio) }

    // MARK: - Cargando y error

    @MainActor func testCargando() {
        renderizaGaleria("detalle-cargando", variantes: VarianteDeGaleria.dos) { AnaliticasDetalleEsqueleto().padding(Theme.Spacing.pantalla) }
    }

    @MainActor func testCargandoErgoConSuSelectorDeMaquina() {
        renderizaGaleria("detalle-cargando-ergo", variantes: Array(VarianteDeGaleria.dos.prefix(1))) {
            AnaliticasDetalleEsqueleto(accesorio: AnyView(selectorDeMaquina(.constant(.remo)))).padding(Theme.Spacing.pantalla)
        }
    }

    @MainActor func testError() {
        renderizaGaleria("detalle-error", variantes: VarianteDeGaleria.dos) {
            AnaliticasErrorDeCarga(kicker: "Correr", titulo: AnaliticasFamiliaView.tituloDelError, onReintentar: {}).padding(Theme.Spacing.pantalla)
        }
    }

    // MARK: - Los extremos: el acento amarillo y el texto del sistema

    @MainActor func testExtremosDeAcentoEnCorrerYEnLaSesion() throws {
        try familia(.correr, .lleno, variantes: VarianteDeGaleria.extremos, nombre: "detalle-correr-lleno-extremo")
        try sesion(.cinta, variantes: VarianteDeGaleria.extremos, sufijo: "-extremo")
    }

    @MainActor func testTextoDelSistemaAlMinimoYAlMaximoEnFuerzaYEnLaSesion() throws {
        let detalle = try DetalleFixtures.detalle(.fuerza, .lleno)
        let cumplimiento = try DetalleFixtures.cumplimiento()
        for (sufijo, tamano) in [("xs", DynamicTypeSize.xSmall), ("ax3", .accessibility3)] {
            renderizaGaleria("detalle-fuerza-lleno-\(sufijo)", variantes: Array(VarianteDeGaleria.dos.prefix(1)), tamanoDeTexto: tamano) {
                AnaliticasFamiliaGaleria(detalle: detalle, familia: .fuerza, cumplimiento: cumplimiento)
            }
            try sesion(.sentadilla, variantes: Array(VarianteDeGaleria.dos.prefix(1)), tamanoDeTexto: tamano, sufijo: "-\(sufijo)")
        }
    }
}
