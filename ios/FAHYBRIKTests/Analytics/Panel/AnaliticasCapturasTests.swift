import XCTest
import SwiftUI
import UIKit
@testable import FAHYBRIK

// LA PORTADA, CAPTURADA EN EL SIMULADOR (el mismo arnés que el vivo:
// `VivoArnesDeCapturas`). Monta `AnaliticasPortadaView` dentro de la barra de
// pestañas real sobre un panel del contrato decodificado de JSON (sin red) y
// vuelca la pantalla a 390 × 844 página a página, como las capturas del doble
// (`analiticas-portada/*-390-pN.png`). Cada imagen va como adjunto del test (se
// queda en el .xcresult que sube el CI) y, si `FAHYBRIK_CAPTURAS` está en el
// entorno, a esa carpeta. Corre en CI (GitHub Actions), nunca en el Mac de Alex.
final class AnaliticasCapturasTests: XCTestCase {

    private static let lienzo = CGRect(x: 0, y: 0, width: 390, height: 844)

    /// Monta la portada con `atleta` en `ventana` y toma la primera página y las
    /// `paginas` siguientes (una por alto visible del scroll).
    @MainActor
    private func fotografiar(_ atleta: AnaliticasFixtures.Atleta, ventana: VentanaClave = .doceSemanas, nombre: String,
                             paginas: Int = 6, glosa: Bool = false, trasMontar: (AnaliticasPortadaView) -> Void = { _ in }) throws {
        let panel = try AnaliticasFixtures.panel(atleta, ventana)
        let store = AppDataStore()
        store.activate(bearer: "capturas")
        store.setPanelAnaliticas(panel, ventana: ventana)

        let portada = AnaliticasPortadaView(bearer: "capturas", hasCoach: true, onOpenTab: { _ in }, ventanaInicial: ventana)
        trasMontar(portada)
        // La barra de pestañas de la app, para comparar con el contrato: la
        // pestaña activa es Analíticas; las demás, vacías.
        let vista = TabView(selection: .constant(AppTab.analiticas)) {
            ForEach(AppTab.allCases, id: \.rawValue) { tab in
                Group {
                    if tab == .analiticas { portada } else { Color.black }
                }
                .tag(tab)
                .tabItem { Label(tab.title, systemImage: tab.symbol) }
            }
        }
        .tint(Theme.Color.accentText)
        .environment(store)
        .environment(\.colorScheme, .dark)

        let host = UIHostingController(rootView: AnyView(vista))
        let bounds = Self.lienzo
        let escena = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = escena.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: bounds)
        window.frame = bounds
        window.overrideUserInterfaceStyle = .dark
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        host.view.frame = bounds
        host.view.layoutIfNeeded()
        RunLoop.current.run(until: Date().addingTimeInterval(0.8))

        let destino = ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
        func foto(_ sufijo: String) {
            host.view.layoutIfNeeded()
            RunLoop.current.run(until: Date().addingTimeInterval(0.35))
            let fmt = UIGraphicsImageRendererFormat(); fmt.scale = 2
            let img = UIGraphicsImageRenderer(bounds: bounds, format: fmt).image { _ in
                if !host.view.drawHierarchy(in: bounds, afterScreenUpdates: true) {
                    host.view.layer.render(in: UIGraphicsGetCurrentContext()!)
                }
            }
            guard let png = img.pngData() else { XCTFail("sin png \(nombre)\(sufijo)"); return }
            let a = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
            a.name = "\(nombre)\(sufijo)"; a.lifetime = .keepAlways; add(a)
            if let destino {
                try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
                try? png.write(to: destino.appendingPathComponent("\(nombre)\(sufijo).png"))
            }
        }

        foto("")
        guard let scroll = Self.scroll(en: host.view) else { XCTFail("la portada no tiene scroll"); return }
        let alto = scroll.bounds.height - scroll.adjustedContentInset.top - scroll.adjustedContentInset.bottom
        for i in 1...max(1, paginas) {
            let maximo = max(0, scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom)
            let y = min(maximo, CGFloat(i) * alto)
            scroll.setContentOffset(CGPoint(x: 0, y: y), animated: false)
            foto("-p\(i)")
            if y >= maximo { break }
        }
        if glosa {
            scroll.setContentOffset(.zero, animated: false)
            // La glosa se abre tocando una celda del Estado: el mismo camino que el dedo.
            if let boton = Self.botonDeEstado(en: host.view) {
                boton.sendActions(for: .touchUpInside)
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.9))
            foto("-glosa")
        }
    }

    private static func scroll(en vista: UIView) -> UIScrollView? {
        if let s = vista as? UIScrollView, s.bounds.height > 300 { return s }
        for sub in vista.subviews { if let s = scroll(en: sub) { return s } }
        return nil
    }

    private static func botonDeEstado(en vista: UIView) -> UIControl? {
        if let c = vista as? UIControl, c.accessibilityLabel?.hasPrefix("Forma:") == true || c.accessibilityLabel?.hasPrefix("Fatiga:") == true { return c }
        for sub in vista.subviews { if let c = botonDeEstado(en: sub) { return c } }
        return nil
    }

    // MARK: - Los cinco atletas del contrato, a 12 semanas

    @MainActor
    func testLlenoMartaUnAnoDentroCarreraEn39Dias() throws {
        try fotografiar(.lleno, nombre: "analiticas-portada-lleno", paginas: 7, glosa: true)
    }

    @MainActor
    func testMixtoPauCorrerMedidoErgoDeclaradoSinReloj() throws {
        try fotografiar(.mixto, nombre: "analiticas-portada-mixto")
    }

    @MainActor
    func testPocoJordiTresSemanas() throws {
        try fotografiar(.poco, nombre: "analiticas-portada-poco")
    }

    @MainActor
    func testVacioRecienDadoDeAlta() throws {
        try fotografiar(.vacio, nombre: "analiticas-portada-vacio", paginas: 4)
    }

    @MainActor
    func testViejoLuciaParada25Dias() throws {
        try fotografiar(.viejo, nombre: "analiticas-portada-viejo")
    }

    // MARK: - Las otras ventanas: todo obedece al selector

    @MainActor
    func testLlenoSieteDias() throws {
        try fotografiar(.lleno, ventana: .sieteDias, nombre: "analiticas-portada-lleno-7d", paginas: 2)
    }

    @MainActor
    func testLlenoUnAno() throws {
        try fotografiar(.lleno, ventana: .unAno, nombre: "analiticas-portada-lleno-1a", paginas: 2)
    }

    @MainActor
    func testLlenoTodo() throws {
        try fotografiar(.lleno, ventana: .todo, nombre: "analiticas-portada-lleno-todo", paginas: 2)
    }
}
