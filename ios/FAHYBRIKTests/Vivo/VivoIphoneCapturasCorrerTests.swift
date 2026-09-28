import XCTest
import CoreLocation
@testable import FAHYBRIK

// LA FAMILIA «CORRER», CAPTURADA — un escenario del contrato
// (`screens/iphone-vivo-correr`, capturas `correr-*-390.png`) por test, con el
// plan real y el motor real (`EscenarioCorrer`). Mismo nombre que la captura del
// contrato, para compararlas una a una.
extension VivoIphoneCapturasTests {

    private static let banda: DeviceLink = .connected(name: "Banda")
    private static let cinta: DeviceLink = .connected(name: "Cinta")

    /// Monta el escenario con su reloj devuelto a su sitio al montar (el motor corre mientras tanto).
    @MainActor
    private func correr(_ e: EscenarioCorrer, _ nombre: String, horizontal: Bool = false, pagina: VivoIdPagina = .vivo,
                        espera: TimeInterval = 0.8, masT: Double = 0, trasMontar: @escaping (WorkoutSession) -> Void = { _ in }) {
        let f = e.fuera
        let lectura = VivoLecturaDePrueba(gps: f.gps, ruta: f.ruta.map { CLLocationCoordinate2D(latitude: $0.0, longitude: $0.1) }, ritmo: f.ritmoCinta)
        captura(e.sesion, nombre, horizontal: horizontal, espera: espera,
                hrLink: f.banda ? Self.banda : .idle, treadmillLink: f.cintaConectada ? Self.cinta : .idle,
                pagina: pagina, lectura: lectura) { s in
            e.ajustarReloj(masT: masT)
            trasMontar(s)
        }
    }

    @MainActor func testCorrerRodajeZ2() throws { correr(try EscenarioCorrer.rodajeZ2(), "correr-rodaje-z2") }
    @MainActor func testCorrerSerieDentro() throws { correr(try EscenarioCorrer.serieDentro(), "correr-serie-dentro") }
    @MainActor func testCorrerSerieRapida() throws { correr(try EscenarioCorrer.serieRapida(), "correr-serie-rapida") }
    @MainActor func testCorrerRecuperacionViene() throws { correr(try EscenarioCorrer.recuperacion(t: 77), "correr-recuperacion-viene") }
    /// A 2,5 s del final: la cuenta a pantalla completa con lo que viene («3»).
    @MainActor func testCorrerRecuperacion321() throws { correr(try EscenarioCorrer.recuperacion(t: 87.4), "correr-recuperacion-321", espera: 0.3) }
    /// El primer segundo de la serie 4: el GO.
    @MainActor func testCorrerRecuperacionGo() throws { correr(try EscenarioCorrer.serie4(t: 0.1), "correr-recuperacion-go", espera: 0.3) }
    @MainActor func testCorrerRecuperacionSerie4() throws { correr(try EscenarioCorrer.serie4(t: 3), "correr-recuperacion-serie4") }
    @MainActor func testCorrerCintaConectada() throws { correr(try EscenarioCorrer.cinta(conectada: true), "correr-cinta-conectada") }
    @MainActor func testCorrerCintaConectadaHorizontal() throws {
        correr(try EscenarioCorrer.cinta(conectada: true), "correr-cinta-conectada-horizontal", horizontal: true)
    }
    @MainActor func testCorrerCintaLoDicesTu() throws { correr(try EscenarioCorrer.cinta(conectada: false), "correr-cinta-lo-dices-tu") }
    @MainActor func testCorrerProgresivoTramo3() throws { correr(try EscenarioCorrer.progresivo(tramo: 3), "correr-progresivo-tramo3") }
    @MainActor func testCorrerProgresivoTramo4() throws { correr(try EscenarioCorrer.progresivo(tramo: 4), "correr-progresivo-tramo4") }
    @MainActor func testCorrerRpeStride() throws { correr(try EscenarioCorrer.strides(recupera: false), "correr-rpe-stride") }
    @MainActor func testCorrerRpeRecupera() throws { correr(try EscenarioCorrer.strides(recupera: true), "correr-rpe-recupera") }
    @MainActor func testCorrerMapa() throws { correr(try EscenarioCorrer.tirada(metros: 4970), "correr-mapa", pagina: .mapa) }
    /// Se cruza el km 5 con la página Mapa delante: la vuelta automática sale encima. Se empieza a
    /// mirar justo en el km 4 (antes, el km a medias no tendría un tiempo honesto) y se corre uno a 4:52.
    @MainActor func testCorrerMapaKm5() throws {
        correr(try EscenarioCorrer.tirada(metros: 4000), "correr-mapa-km5", pagina: .mapa, espera: 1.4, masT: 292) { s in
            s.sampleRunDistance(deltaMeters: 1000, source: .healthkit)
        }
    }
    @MainActor func testCorrerLibre() throws { correr(try EscenarioCorrer.serieDentro(libre: true), "correr-libre") }
}
