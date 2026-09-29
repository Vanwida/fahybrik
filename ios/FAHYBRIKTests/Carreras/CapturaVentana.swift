import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA FOTOGRAFÍA DE UNA VISTA EN UNA VENTANA DE VERDAD — la herramienta de REVISIÓN de las pruebas de
// Carreras (galería de la pestaña y de las hojas).
//
// `ImageRenderer` no es fiable para revisar el diseño: no dibuja `ScrollView`, no ejecuta `onAppear` y,
// sobre todo, propone a la vista su propio alto ideal, así que lo flexible (un `Spacer`, un
// `maxHeight: .infinity`) se comprime o se estira distinto de como lo haría un `ScrollView` en el
// teléfono. Aquí se monta un `UIHostingController` en un `UIWindow` del simulador (sin abrir ningún
// simulador con ventana) y se le hace `drawHierarchy`: el mismo motor de layout que en el teléfono.
//
// Para ver una pestaña ENTERA (`entera: true`) la ventana conserva el alto de un teléfono y se va
// bajando el `ScrollView` de pantalla en pantalla; las tiras se cosen en una sola imagen. (Una ventana
// tan alta como la pestaña no sirve: `drawHierarchy` devuelve negro pasados unos ~3000 pt.)
enum CapturaVentana {

    static let ancho: CGFloat = 402
    private static let escala: CGFloat = 2
    /// Un ciclo para que SwiftUI resuelva el layout, los `.task` y las imágenes antes de fotografiar.
    private static let esperaDeLayout: TimeInterval = 0.5
    /// Lo que se espera tras mover el scroll a la tira siguiente.
    private static let esperaDeScroll: TimeInterval = 0.2

    /// El PNG de la vista, o nil si no se pudo fotografiar.
    @MainActor
    static func png(
        _ vista: some View,
        alto: CGFloat = 780,
        oscuro: Bool = false,
        tamano: DynamicTypeSize = .large,
        club: ClubTheme? = nil,
        entera: Bool = false
    ) -> Data? {
        ClubThemeStore.update(club)
        let (ventana, host) = montar(vista, alto: alto, oscuro: oscuro, tamano: tamano)
        defer { desmontar(ventana) }
        let marco = CGRect(x: 0, y: 0, width: ancho, height: alto)
        guard entera, let scroll = scrollMasAlto(en: host.view), scroll.contentSize.height > scroll.bounds.height + 1 else {
            return foto(ventana, marco).pngData()
        }
        return cosida(ventana: ventana, scroll: scroll, marco: marco).pngData()
    }

    /// Guarda el PNG como adjunto de la prueba y, si `FAHYBRIK_CAPTURAS` está puesta, en esa carpeta.
    @MainActor
    static func guarda(_ png: Data?, nombre: String, en prueba: XCTestCase) {
        guard let png else { return XCTFail("\(nombre) no se pudo fotografiar") }
        let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        prueba.add(adjunto)
        if let carpeta = ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map({ URL(fileURLWithPath: $0) }) {
            try? FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
            try? png.write(to: carpeta.appendingPathComponent("\(nombre).png"))
        }
    }

    // MARK: Montaje

    @MainActor
    private static func montar(_ vista: some View, alto: CGFloat, oscuro: Bool, tamano: DynamicTypeSize) -> (UIWindow, UIHostingController<AnyView>) {
        let marco = CGRect(x: 0, y: 0, width: ancho, height: alto)
        let host = UIHostingController(rootView: AnyView(vista.environment(\.dynamicTypeSize, tamano)))
        host.view.frame = marco
        let escena = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let ventana = escena.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: marco)
        ventana.frame = marco
        ventana.overrideUserInterfaceStyle = oscuro ? .dark : .light
        ventana.rootViewController = host
        ventana.isHidden = false
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(esperaDeLayout))
        return (ventana, host)
    }

    @MainActor
    private static func desmontar(_ ventana: UIWindow) {
        ventana.isHidden = true
        ventana.rootViewController = nil
    }

    @MainActor
    private static func foto(_ ventana: UIWindow, _ marco: CGRect) -> UIImage {
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = escala
        return UIGraphicsImageRenderer(bounds: marco, format: formato).image { _ in
            ventana.drawHierarchy(in: marco, afterScreenUpdates: true)
        }
    }

    /// El `UIScrollView` más alto de la jerarquía: el de la pantalla.
    @MainActor
    private static func scrollMasAlto(en raiz: UIView) -> UIScrollView? {
        var mejor: UIScrollView?
        func recorre(_ v: UIView) {
            if let s = v as? UIScrollView, s.contentSize.height > (mejor?.contentSize.height ?? 0) { mejor = s }
            v.subviews.forEach(recorre)
        }
        recorre(raiz)
        return mejor
    }

    // MARK: Coser las tiras

    /// Una imagen con todo lo que scrollea: lo fijo de arriba (el cromo) una vez y, debajo, el contenido
    /// de punta a punta, cosido con una tira por pantalla.
    @MainActor
    private static func cosida(ventana: UIWindow, scroll: UIScrollView, marco: CGRect) -> UIImage {
        let zona = scroll.convert(scroll.bounds, to: ventana)
        let alto = zona.height
        let inicio = -scroll.adjustedContentInset.top
        let maximo = scroll.contentSize.height + scroll.adjustedContentInset.bottom - alto
        let contenidoTotal = maximo - inicio + alto
        let lienzo = CGSize(width: marco.width, height: zona.minY + contenidoTotal)

        var tiras: [(imagen: UIImage, saltar: CGFloat, visible: CGFloat, y: CGFloat)] = []
        let primera = foto(ventana, marco)
        var pintado = alto
        while pintado < contenidoTotal - 0.5 {
            let destino = min(inicio + pintado, maximo)
            scroll.setContentOffset(CGPoint(x: 0, y: destino), animated: false)
            RunLoop.main.run(until: Date().addingTimeInterval(esperaDeScroll))
            let saltar = (inicio + pintado) - destino
            let visible = alto - saltar
            tiras.append((foto(ventana, marco), saltar, visible, zona.minY + pintado))
            pintado += visible
        }

        let formato = UIGraphicsImageRendererFormat()
        formato.scale = escala
        return UIGraphicsImageRenderer(size: lienzo, format: formato).image { contexto in
            contexto.cgContext.saveGState()
            contexto.cgContext.clip(to: CGRect(x: 0, y: 0, width: lienzo.width, height: zona.minY + alto))
            primera.draw(at: .zero)
            contexto.cgContext.restoreGState()
            for t in tiras {
                contexto.cgContext.saveGState()
                contexto.cgContext.clip(to: CGRect(x: 0, y: t.y, width: lienzo.width, height: t.visible))
                t.imagen.draw(at: CGPoint(x: 0, y: t.y - (zona.minY + t.saltar)))
                contexto.cgContext.restoreGState()
            }
        }
    }
}
