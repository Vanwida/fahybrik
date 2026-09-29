import XCTest
import SwiftUI
@testable import FAHYBRIK

// LAS HOJAS Y LA ALTURA DE LA PESTAÑA, VISTAS DE VERDAD.
//
// `ImageRenderer` no dibuja `ScrollView`, y una hoja es un cuerpo con scroll y una acción anclada; y la
// regla de altura de la pestaña («el sobrante entra en el propio sujeto») solo se ve dentro de un
// `FillingScreen`. Así que aquí se monta la vista en una ventana de verdad (un `UIHostingController`
// dentro de un `UIWindow` del simulador, sin abrir ningún simulador con ventana) y se le hace una
// captura con `drawHierarchy` (ver `CapturaVentana`). Como la galería, es una herramienta de REVISIÓN:
// falla si la vista revienta, deja los PNG en `FAHYBRIK_CAPTURAS` y no compara píxeles.
final class HojasCarrerasRenderTests: XCTestCase {

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    @MainActor
    private func captura(_ vista: some View, nombre: String, oscuro: Bool = false, club: ClubTheme? = nil, alto: CGFloat = 780, tamano: DynamicTypeSize = .large, entera: Bool = false) {
        let png = CapturaVentana.png(vista, alto: alto, oscuro: oscuro, tamano: tamano, club: club, entera: entera)
        CapturaVentana.guarda(png, nombre: nombre, en: self)
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
        // El póster solo, con alto de sobra: se ve el alto que pide de verdad, botón incluido.
        captura(pestana("solo-objetivo"), nombre: "altura-solo-objetivo-entero-claro", alto: 700, entera: true)
        // Un teléfono más bajo (iPhone SE): el póster no se comprime, la pestaña scrollea.
        captura(pestana("vacio"), nombre: "altura-vacio-bajo-claro", alto: 520)
    }
}
