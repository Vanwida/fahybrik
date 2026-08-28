import SwiftUI
import UIKit
import XCTest
@testable import FAHYBRIK

// Card 175. EMPEZAR de la puerta de bloque vive ENCIMA del home indicator
// y FUERA del scroll. El Chipper de la foto es un ejemplo, no un default:
// el anclaje es del producto (cualquier coach, cualquier día, 2 tramos o 8).
//
// Se monta en una UIWindow con el inset inferior de un iPhone con home
// indicator (34 pt), y el mismo ZStack a pantalla completa que pone
// ActiveWorkoutView detrás de la puerta. Sin ventana de verdad el
// ScrollView no coloca y el área segura no existe.

final class BlockPreviewGateLayoutTests: XCTestCase {

    private let ancho: CGFloat = 402
    private let alto: CGFloat = 874
    private let homeIndicator: CGFloat = 34
    private let notch: CGFloat = 59

    @MainActor
    func testEmpezarQuedaEnteroSobreElHomeIndicator() {
        let host = monta(tramos: 2)
        defer { suelta(host.ventana) }

        XCTAssertEqual(host.controller.view.safeAreaInsets.bottom, homeIndicator,
                       "el arnés tiene que simular un iPhone con home indicator")

        let boton = botonEmpezar(en: host.controller.view)
        XCTAssertNotNil(boton, "EMPEZAR tiene que existir para poder pulsarlo")
        guard let boton else { return }

        let marco = boton.convert(boton.bounds, to: host.controller.view)
        let suelo = host.controller.view.bounds.height - host.controller.view.safeAreaInsets.bottom
        XCTAssertGreaterThanOrEqual(marco.height, 60,
                                    "el botón entero (64 pt) tiene que caber, no una franja")
        XCTAssertLessThanOrEqual(marco.maxY, suelo + 0.5,
                                 "EMPEZAR no puede entrar en el home indicator")
        XCTAssertGreaterThanOrEqual(marco.minY, 0)
        XCTAssertFalse(estaEnScroll(boton),
                       "el botón es barra fija: no viaja con el plan")
    }

    @MainActor
    func testConOchoTramosElPlanHaceScrollYEmpezarSigueFuera() {
        let host = monta(tramos: 8)
        defer { suelta(host.ventana) }

        let boton = botonEmpezar(en: host.controller.view)
        XCTAssertNotNil(boton, "con 8 tramos EMPEZAR sigue en pantalla")
        guard let boton else { return }

        let marco = boton.convert(boton.bounds, to: host.controller.view)
        let suelo = host.controller.view.bounds.height - host.controller.view.safeAreaInsets.bottom
        XCTAssertLessThanOrEqual(marco.maxY, suelo + 0.5)
        XCTAssertGreaterThanOrEqual(marco.height, 60)
        XCTAssertFalse(estaEnScroll(boton),
                       "con 8 tramos el plan scrollea; el botón no se esconde debajo")

        let scroll = primerScroll(en: host.controller.view)
        XCTAssertNotNil(scroll, "la lista de tramos vive en un scroll")
        if let scroll {
            XCTAssertFalse(boton.isDescendant(of: scroll))
        }
    }

    // MARK: - Andamio

    @MainActor
    private func monta(tramos: Int) -> (ventana: UIWindow, controller: UIHostingController<AnyView>) {
        let segmentos = (1...tramos).map { i in
            WorkoutSegment(order: i, title: "Tramo \(i)", kind: .reps, targetReps: 10)
        }
        let puerta = BlockPreviewGate(
            title: "Sesión",
            phaseTag: nil,
            blockNumber: 1,
            blockCount: 1,
            formatLabel: nil,
            segments: segmentos,
            canGoBack: false,
            onEmpezar: {},
            onBack: {},
            onExit: {}
        )
        let raiz = AnyView(
            ZStack {
                Theme.Color.background.ignoresSafeArea()
                puerta
            }
            .environment(\.colorScheme, .dark)
        )
        let host = UIHostingController(rootView: raiz)
        host.additionalSafeAreaInsets = UIEdgeInsets(top: notch, left: 0, bottom: homeIndicator, right: 0)
        let ventana = UIWindow(frame: CGRect(x: 0, y: 0, width: ancho, height: alto))
        ventana.overrideUserInterfaceStyle = .dark
        ventana.rootViewController = host
        ventana.makeKeyAndVisible()
        host.view.frame = ventana.bounds
        host.view.layoutIfNeeded()
        RunLoop.current.run(until: Date())
        host.view.layoutIfNeeded()
        return (ventana, host)
    }

    @MainActor
    private func suelta(_ ventana: UIWindow) {
        ventana.isHidden = true
        ventana.rootViewController = nil
    }

    private func botonEmpezar(en raiz: UIView) -> UIView? {
        if let porId = busca(en: raiz, id: "empezar-bloque") { return porId }
        if let porLabel = busca(en: raiz, etiqueta: "EMPEZAR") { return porLabel }
        // SwiftUI a veces no copia el identifier al UIView del host. El CTA
        // es el control de ~64 pt, casi a todo el ancho, más abajo.
        return todas(en: raiz)
            .filter { $0.bounds.height >= 60 && $0.bounds.height <= 72 && $0.bounds.width >= 280 }
            .max {
                $0.convert($0.bounds, to: raiz).maxY < $1.convert($1.bounds, to: raiz).maxY
            }
    }

    private func todas(en raiz: UIView) -> [UIView] {
        [raiz] + raiz.subviews.flatMap { todas(en: $0) }
    }

    private func busca(en raiz: UIView, etiqueta: String? = nil, id: String? = nil) -> UIView? {
        if let id, raiz.accessibilityIdentifier == id { return raiz }
        if let etiqueta, raiz.accessibilityLabel == etiqueta { return raiz }
        for hijo in raiz.subviews {
            if let hallado = busca(en: hijo, etiqueta: etiqueta, id: id) { return hallado }
        }
        return nil
    }

    private func estaEnScroll(_ vista: UIView) -> Bool {
        var actual: UIView? = vista.superview
        while let nodo = actual {
            if nodo is UIScrollView { return true }
            actual = nodo.superview
        }
        return false
    }

    private func primerScroll(en raiz: UIView) -> UIScrollView? {
        if let scroll = raiz as? UIScrollView { return scroll }
        for hijo in raiz.subviews {
            if let hallado = primerScroll(en: hijo) { return hallado }
        }
        return nil
    }
}
