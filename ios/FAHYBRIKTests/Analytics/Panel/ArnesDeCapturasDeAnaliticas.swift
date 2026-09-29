import XCTest
import SwiftUI
import UIKit
@testable import FAHYBRIK

// EL ARNÉS DE CAPTURAS DE LA PESTAÑA (el mismo que el vivo: `VivoArnesDeCapturas`). Monta `AnaliticasPortadaView` dentro de la barra de
// pestañas real, sobre un almacén sembrado con JSON del contrato (sin red), y vuelca la pantalla a 390 × 844 página a página, como las
// capturas del doble. Es lo que enseña lo que la galería plana no puede: el selector que se pega arriba, la barra de pestañas (que un
// detalle esconde) y la navegación empujada de verdad. Cada imagen va como adjunto del test (se queda en el .xcresult que sube el CI) y,
// si `FAHYBRIK_CAPTURAS` está en el entorno, a esa carpeta. Corre en CI y en simulador sin ventana, nunca en el Mac de Alex.

/// Lo que el arnés vio al montar la pantalla.
struct ResultadoDeCaptura {
    /// La barra de pestañas de la app se ve en la primera página.
    let barraDePestanasVisible: Bool
    /// Cuántas páginas se capturaron (la primera y las de scroll).
    let paginas: Int
}

extension XCTestCase {

    private static var lienzoDeCapturas: CGRect { CGRect(x: 0, y: 0, width: 390, height: 844) }

    /// Monta `portada` (con su almacén) y toma la primera página y las `paginas` siguientes (una por alto visible del scroll).
    @MainActor
    @discardableResult
    func fotografiarAnaliticas(_ portada: AnaliticasPortadaView, store: AppDataStore, nombre: String, paginas: Int = 6, esquema: UIUserInterfaceStyle = .light) throws -> ResultadoDeCaptura {
        let nombre = "\(nombre)-\(esquema == .dark ? "oscuro" : "claro")"
        // La barra de pestañas de la app, para comparar con el contrato: la pestaña activa es Analíticas; las demás, vacías.
        let vista = TabView(selection: .constant(AppTab.analiticas)) {
            ForEach(AppTab.allCases, id: \.rawValue) { tab in
                Group {
                    if tab == .analiticas { portada } else { Theme.Color.background }
                }
                .tag(tab)
                .tabItem { Label(tab.title, systemImage: tab.symbol) }
            }
        }
        .tint(Theme.Color.accentText)
        .environment(store)

        let host = UIHostingController(rootView: AnyView(vista))
        let bounds = Self.lienzoDeCapturas
        let escena = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = escena.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: bounds)
        window.frame = bounds
        window.overrideUserInterfaceStyle = esquema
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true; window.rootViewController = nil }
        host.view.frame = bounds
        host.view.layoutIfNeeded()
        RunLoop.current.run(until: Date().addingTimeInterval(0.8))

        let destino = carpetaDeCapturas
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
        let barraVisible = Self.buscar(UITabBar.self, en: host.view).map { barra in
            !barra.isHidden && barra.alpha > 0.01 && barra.convert(barra.bounds, to: window).intersects(window.bounds)
        } ?? false
        guard let scroll = Self.scroll(en: host.view) else { XCTFail("la pantalla no tiene scroll"); return ResultadoDeCaptura(barraDePestanasVisible: barraVisible, paginas: 1) }
        let alto = scroll.bounds.height - scroll.adjustedContentInset.top - scroll.adjustedContentInset.bottom
        var tomadas = 1
        for i in 1...max(1, paginas) {
            let maximo = max(0, scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom)
            let y = min(maximo, CGFloat(i) * alto)
            scroll.setContentOffset(CGPoint(x: 0, y: y), animated: false)
            foto("-p\(i)")
            tomadas += 1
            if y >= maximo { break }
        }
        return ResultadoDeCaptura(barraDePestanasVisible: barraVisible, paginas: tomadas)
    }

    private static func scroll(en vista: UIView) -> UIScrollView? {
        if let s = vista as? UIScrollView, s.bounds.height > 300 { return s }
        for sub in vista.subviews { if let s = scroll(en: sub) { return s } }
        return nil
    }

    private static func buscar<V: UIView>(_ tipo: V.Type, en vista: UIView) -> V? {
        if let v = vista as? V { return v }
        for sub in vista.subviews { if let v = buscar(tipo, en: sub) { return v } }
        return nil
    }
}
