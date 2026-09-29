import XCTest
import SwiftUI
import UIKit
@testable import FAHYBRIK

// LA PORTADA, CAPTURADA EN EL SIMULADOR con el arnés de la pestaña (`ArnesDeCapturasDeAnaliticas`): la pantalla real dentro de la barra
// de pestañas real sobre un panel del contrato decodificado de JSON (sin red), a 390 × 844, página a página, como las capturas del doble
// (`analiticas-portada/*-390-pN.png`), en CLARO y en OSCURO: el tema lo elige el atleta y la pantalla no fuerza el suyo.
final class AnaliticasCapturasTests: XCTestCase {

    /// Monta la portada con `atleta` en `ventana` y toma la primera página y las `paginas` siguientes.
    @MainActor
    private func fotografiar(_ atleta: AnaliticasFixtures.Atleta, ventana: VentanaClave = .doceSemanas, nombre: String,
                             paginas: Int = 6, esquema: UIUserInterfaceStyle = .light) throws {
        let store = AppDataStore()
        store.activate(bearer: "capturas")
        store.setPanelAnaliticas(try AnaliticasFixtures.panel(atleta, ventana), ventana: ventana)
        // La pestaña pide también el cumplimiento de la ventana (las sesiones de Semana a semana): se siembra, y solo el atleta lleno tiene sesiones.
        let cumplimiento = try DetalleFixtures.cumplimiento()
        store.setCumplimientoAnalitico(
            atleta == .lleno && ventana == .doceSemanas ? cumplimiento : CumplimientoAnaliticas(ventana: cumplimiento.ventana, sesiones: [], sinPlan: cumplimiento.sinPlan),
            ventana
        )
        let portada = AnaliticasPortadaView(bearer: "capturas", hasCoach: true, onOpenTab: { _ in }, ventanaInicial: ventana)
        let r = try fotografiarAnaliticas(portada, store: store, nombre: nombre, paginas: paginas, esquema: esquema)
        XCTAssertTrue(r.barraDePestanasVisible, "la portada es la raíz de la pestaña: lleva su barra de pestañas")
    }

    // MARK: - Los cinco atletas del contrato, a 12 semanas, en claro y en oscuro

    @MainActor func testLlenoClaro() throws { try fotografiar(.lleno, nombre: "analiticas-portada-lleno", paginas: 7) }
    @MainActor func testLlenoOscuro() throws { try fotografiar(.lleno, nombre: "analiticas-portada-lleno", paginas: 7, esquema: .dark) }
    @MainActor func testMixtoClaro() throws { try fotografiar(.mixto, nombre: "analiticas-portada-mixto") }
    @MainActor func testMixtoOscuro() throws { try fotografiar(.mixto, nombre: "analiticas-portada-mixto", esquema: .dark) }
    @MainActor func testPocoClaro() throws { try fotografiar(.poco, nombre: "analiticas-portada-poco") }
    @MainActor func testPocoOscuro() throws { try fotografiar(.poco, nombre: "analiticas-portada-poco", esquema: .dark) }
    @MainActor func testVacioClaro() throws { try fotografiar(.vacio, nombre: "analiticas-portada-vacio", paginas: 4) }
    @MainActor func testVacioOscuro() throws { try fotografiar(.vacio, nombre: "analiticas-portada-vacio", paginas: 4, esquema: .dark) }
    @MainActor func testViejoClaro() throws { try fotografiar(.viejo, nombre: "analiticas-portada-viejo") }
    @MainActor func testViejoOscuro() throws { try fotografiar(.viejo, nombre: "analiticas-portada-viejo", esquema: .dark) }

    // MARK: - Las otras ventanas: todo obedece al selector

    @MainActor func testLlenoSieteDias() throws { try fotografiar(.lleno, ventana: .sieteDias, nombre: "analiticas-portada-lleno-7d", paginas: 2) }
    @MainActor func testLlenoUnAno() throws { try fotografiar(.lleno, ventana: .unAno, nombre: "analiticas-portada-lleno-1a", paginas: 2) }
    @MainActor func testLlenoTodo() throws { try fotografiar(.lleno, ventana: .todo, nombre: "analiticas-portada-lleno-todo", paginas: 2) }
}
