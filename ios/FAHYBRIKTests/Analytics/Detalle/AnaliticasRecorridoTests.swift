import XCTest
import SwiftUI
import UIKit
@testable import FAHYBRIK

// EL RECORRIDO, NO LAS PIEZAS. Las pruebas de las lecturas y las galerías en plano prueban cada pieza; esto monta la pantalla REAL —la
// portada dentro de la barra de pestañas, con la navegación empujada de verdad sobre el almacén sembrado de JSON del contrato— y
// la fotografía a 390 × 844 en claro y en oscuro, como la vería el atleta: el cascarón con su «‹ Analíticas», el selector de ventana
// pegado, el scroll de verdad y SIN la barra de pestañas (un detalle no la lleva; la raíz sí).
//
// Lo que ninguna galería en plano puede decir y esto sí: que la ruta lleva a su pantalla con lo que el almacén tiene, que el detalle se
// pinta sin pedir nada a la red (todo está sembrado) y que la barra de pestañas se va al entrar y no antes.
final class AnaliticasRecorridoTests: XCTestCase {

    /// La portada en `ventana` con el almacén sembrado y `camino` ya empujado; la fotografía y las comprobaciones comunes.
    @MainActor
    private func recorre(
        _ atleta: AnaliticasFixtures.Atleta, camino: [AnaliticasDestino], nombre: String, paginas: Int = 6,
        familias: [FamiliaDeDetalle] = [], sesiones: [DetalleFixtures.Caso] = [], esquema: UIUserInterfaceStyle = .light
    ) throws {
        let ventana = VentanaClave.doceSemanas
        let store = AppDataStore()
        store.activate(bearer: "capturas")
        store.setPanelAnaliticas(try AnaliticasFixtures.panel(atleta, ventana), ventana: ventana)
        store.setCumplimientoAnalitico(try DetalleFixtures.cumplimiento(), ventana)
        for f in familias { store.setDetalleAnaliticas(try DetalleFixtures.detalle(f, atleta), f, ventana) }
        for s in sesiones { store.setSesionAnalitica(try DetalleFixtures.sesion(s)) }

        let portada = AnaliticasPortadaView(bearer: "capturas", hasCoach: true, onOpenTab: { _ in }, ventanaInicial: ventana, caminoInicial: camino)
        let r = try fotografiarAnaliticas(portada, store: store, nombre: nombre, paginas: paginas, esquema: esquema)
        XCTAssertGreaterThanOrEqual(r.paginas, 2, "\(nombre): el detalle es más largo que una pantalla y se recorrió")
        XCTAssertEqual(r.barraDePestanasVisible, camino.isEmpty, "\(nombre): un detalle esconde la barra de pestañas; la raíz la lleva")
    }

    private func sesionDe(_ caso: DetalleFixtures.Caso, atras: String = "Semana a semana") throws -> AnaliticasDestino {
        let s = try DetalleFixtures.sesion(caso)
        return .sesion(SesionDeDestino(executionId: s.executionId, assignmentId: s.assignmentId ?? "", atras: atras, hoy: "2026-09-29"))
    }

    // MARK: - Las cuatro familias, desde una fila del Progreso

    @MainActor func testCorrerClaro() throws { try recorre(.lleno, camino: [.familia(.correr)], nombre: "recorrido-correr-lleno", familias: [.correr]) }
    @MainActor func testCorrerOscuro() throws { try recorre(.lleno, camino: [.familia(.correr)], nombre: "recorrido-correr-lleno", familias: [.correr], esquema: .dark) }
    @MainActor func testErgoClaro() throws { try recorre(.lleno, camino: [.familia(.remo)], nombre: "recorrido-ergo-lleno", familias: [.remo]) }
    @MainActor func testFuerzaClaro() throws { try recorre(.lleno, camino: [.familia(.fuerza)], nombre: "recorrido-fuerza-lleno", familias: [.fuerza]) }
    @MainActor func testFuerzaOscuro() throws { try recorre(.lleno, camino: [.familia(.fuerza)], nombre: "recorrido-fuerza-lleno", familias: [.fuerza], esquema: .dark) }
    @MainActor func testEstacionesClaro() throws { try recorre(.lleno, camino: [.familia(.estaciones)], nombre: "recorrido-estaciones-lleno", familias: [.estaciones]) }

    // MARK: - Los detalles de bloque y la sesión

    @MainActor func testSemanaASemanaClaro() throws { try recorre(.lleno, camino: [.bloque(.semanas)], nombre: "recorrido-bloque-semanas") }
    @MainActor func testRecordsClaro() throws { try recorre(.lleno, camino: [.bloque(.records)], nombre: "recorrido-bloque-records") }
    @MainActor func testCarreraClaro() throws { try recorre(.lleno, camino: [.bloque(.carrera)], nombre: "recorrido-bloque-carrera") }

    @MainActor func testSesionClaro() throws { try recorre(.lleno, camino: [try sesionDe(.cinta)], nombre: "recorrido-sesion-cinta", sesiones: [.cinta]) }
    @MainActor func testSesionOscuro() throws { try recorre(.lleno, camino: [try sesionDe(.cinta)], nombre: "recorrido-sesion-cinta", sesiones: [.cinta], esquema: .dark) }

    /// Dos niveles: Semana a semana → una sesión. La vuelta de la sesión dice de dónde viene.
    @MainActor func testDeSemanaASemanaALaSesion() throws {
        try recorre(.lleno, camino: [.bloque(.semanas), try sesionDe(.remo)], nombre: "recorrido-semanas-sesion-remo", sesiones: [.remo])
    }
}
