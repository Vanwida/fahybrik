import XCTest
import SwiftUI
@testable import FAHYBRIK

// LAS HOJAS Y LA ALTURA DE LA PESTAÑA, VISTAS DE VERDAD.
//
// `ImageRenderer` no dibuja `ScrollView`, y una hoja es un cuerpo con scroll y una acción anclada; y la
// regla de altura de la pestaña («el sobrante entra en el propio sujeto») solo se ve dentro de un
// `FillingScreen`. Así que aquí se monta la vista en una ventana de verdad (un `UIHostingController`
// dentro de un `UIWindow` del simulador, sin abrir ningún simulador con ventana) y se le hace una
// captura con `drawHierarchy`. Como la galería, es una herramienta de REVISIÓN: falla si la vista
// revienta, deja los PNG en `FAHYBRIK_CAPTURAS` y no compara píxeles.
final class HojasCarrerasRenderTests: XCTestCase {

    private var destino: URL? {
        ProcessInfo.processInfo.environment["FAHYBRIK_CAPTURAS"].map { URL(fileURLWithPath: $0) }
    }

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    @MainActor
    private func captura(_ vista: some View, nombre: String, oscuro: Bool = false, club: ClubTheme? = nil, alto: CGFloat = 780, tamano: DynamicTypeSize = .large) {
        ClubThemeStore.update(club)
        let marco = CGRect(x: 0, y: 0, width: 402, height: alto)
        let host = UIHostingController(rootView: vista.environment(\.dynamicTypeSize, tamano))
        host.view.frame = marco
        let escena = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let ventana = escena.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: marco)
        ventana.frame = marco
        ventana.overrideUserInterfaceStyle = oscuro ? .dark : .light
        ventana.rootViewController = host
        ventana.isHidden = false
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        // Un ciclo para que SwiftUI resuelva el layout, los `.task` y las imágenes antes de fotografiar.
        RunLoop.main.run(until: Date().addingTimeInterval(0.5))
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 2
        let imagen = UIGraphicsImageRenderer(bounds: marco, format: formato).image { _ in
            ventana.drawHierarchy(in: marco, afterScreenUpdates: true)
        }
        ventana.isHidden = true
        guard let png = imagen.pngData() else { return XCTFail("\(nombre) no se pudo fotografiar") }
        let adjunto = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        adjunto.name = nombre
        adjunto.lifetime = .keepAlways
        add(adjunto)
        if let destino {
            try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
            try? png.write(to: destino.appendingPathComponent("\(nombre).png"))
        }
    }

    // MARK: Importar

    @MainActor
    func testImportar() {
        let vistas: [(String, ImportRaceSheet.VistaDePrueba)] = [
            ("reposo", .reposo), ("buscando", .buscando), ("candidatos", .candidatos), ("sin-resultados", .sinResultados),
            ("error-busqueda", .errorDeBusqueda), ("confirmar", .confirmar), ("importando", .importando),
            ("error-importar", .errorAlImportar), ("enlace", .enlaceVacio), ("enlace-malo", .enlaceMalo),
            ("enlace-error", .enlaceConError),
        ]
        for (nombre, vista) in vistas {
            captura(ImportRaceSheet(vista: vista), nombre: "hoja-importar-\(nombre)-claro")
        }
        captura(ImportRaceSheet(vista: .candidatos), nombre: "hoja-importar-candidatos-oscuro", oscuro: true)
        captura(ImportRaceSheet(vista: .confirmar), nombre: "hoja-importar-confirmar-oscuro-azul", oscuro: true, club: .pruebaAzul)
    }

    // MARK: Buscar y fijar

    @MainActor
    func testBuscarYFijar() {
        for (nombre, vista) in [("lista", BuscarCarreraSheet.VistaDePrueba.lista), ("cargando", .cargando), ("error", .error), ("sin-carreras", .sinCarreras)] {
            captura(BuscarCarreraSheet(vista: vista), nombre: "hoja-buscar-\(nombre)-claro")
        }
        captura(BuscarCarreraSheet(vista: .lista), nombre: "hoja-buscar-lista-oscuro", oscuro: true, club: .pruebaAmarillo)
        let aviso = "«HYROX Barcelona» pasará a ser secundaria. Un solo objetivo principal a la vez."
        captura(FijarObjetivoView(event: CasosCarreras.evento("HYROX Girona"), bearer: nil, pasaASecundaria: aviso, onTargetSet: {}), nombre: "hoja-fijar-hibrida-claro")
        captura(FijarObjetivoView(event: CasosCarreras.evento("HYROX Girona"), bearer: nil, pasaASecundaria: aviso, onTargetSet: {}), nombre: "hoja-fijar-hibrida-oscuro", oscuro: true, club: .pruebaAzul)
        captura(FijarObjetivoView(event: CasosCarreras.evento("HYROX Valencia"), bearer: nil, onTargetSet: {}), nombre: "hoja-fijar-sin-fecha-claro")
        captura(FijarObjetivoView(event: CasosCarreras.evento("Mitja Marató de Barcelona"), bearer: nil, onTargetSet: {}), nombre: "hoja-fijar-running-claro")
        captura(FijarObjetivoView(event: CasosCarreras.evento("CrossFit Open Iberia"), bearer: nil, onTargetSet: {}), nombre: "hoja-fijar-crossfit-claro")
    }

    @MainActor
    func testElTiempoObjetivo() {
        captura(FijarTiempoObjetivoSheet(race: CasosCarreras.carreraFijada(201, "HYROX Barcelona", dias: 39, meta: 3600), bearer: nil, onSaved: {}), nombre: "hoja-meta-peldano-claro")
        captura(FijarTiempoObjetivoSheet(race: CasosCarreras.carreraFijada(201, "HYROX Barcelona", dias: 39, meta: 4080), bearer: nil, onSaved: {}), nombre: "hoja-meta-exacto-claro")
        captura(FijarTiempoObjetivoSheet(race: CasosCarreras.carreraFijada(201, "HYROX Barcelona", dias: 39), bearer: nil, onSaved: {}), nombre: "hoja-meta-sin-meta-oscuro", oscuro: true)
        captura(FijarTiempoObjetivoSheet(race: CasosCarreras.carreraFijada(341, "Mitja Marató de Barcelona", dias: 141, tipo: "other", meta: 5940), bearer: nil, onSaved: {}), nombre: "hoja-meta-no-hyrox-claro")
    }

    // MARK: La altura de la pestaña

    private func pestana(_ id: String) -> some View {
        let l = CasosCarreras.caso(id).lectura
        return VStack(spacing: 0) {
            CromoCarreras(conCoach: l.conCoach, noLeidos: l.noLeidosChat, alChat: {})
            FillingScreen { CarrerasContenido(lectura: l) }
        }
        .background(Theme.Color.background)
    }

    /// El sobrante entra en el propio sujeto: en el vacío, el esqueleto y el error el póster llena el alto,
    /// sin cola muerta debajo; en el lleno, el contenido desborda y scrollea.
    @MainActor
    func testLaAlturaDeLaPestana() {
        for id in ["vacio", "cargando", "error", "solo-objetivo", "lleno"] {
            captura(pestana(id), nombre: "altura-\(id)-claro", alto: 700)
            captura(pestana(id), nombre: "altura-\(id)-oscuro", oscuro: true, alto: 700)
        }
        // Un teléfono más bajo (iPhone SE): el póster no se comprime, la pestaña scrollea.
        captura(pestana("vacio"), nombre: "altura-vacio-bajo-claro", alto: 520)
    }
}
