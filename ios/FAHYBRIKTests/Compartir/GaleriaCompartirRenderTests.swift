import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA HOJA DE COMPARTIR Y SU TARJETA, VISTAS DE VERDAD — herramienta de revisión.
//
// La hoja lleva una `GeometryReader`; se monta en una ventana (`CapturaVentana`) y se guarda en
// `FAHYBRIK_CAPTURAS`, en claro y en oscuro, con el acento de fábrica y con un club azul. La TARJETA es
// una imagen de marca que vive sobre fondo oscuro sea cual sea el tema: sus cuatro capturas han de salir
// igual de legibles (antes, con la app en claro, el acento llegaba en su variante para lienzo claro).
final class GaleriaCompartirRenderTests: XCTestCase {

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    private static let variantes: [(nombre: String, oscuro: Bool, club: ClubTheme?)] = [
        ("claro-fabrica", false, nil),
        ("oscuro-fabrica", true, nil),
        ("claro-azul", false, .pruebaAzul),
        ("oscuro-azul", true, .pruebaAzul),
    ]

    // Datos de ejemplo: sólo para ver la pantalla, no son de nadie.
    private static let entreno = TarjetaCompartible.entreno(TarjetaEntrenoDatos(
        chip: "MARTES",
        titulo: "Series de umbral",
        resultado: [("Tiempo", "58:12"), ("Distancia", "10,4 km")],
        bloques: [
            BloqueCartelCompartir(titulo: "Calentamiento", pauta: nil, cuerpo: .lista([
                LineaCartel(nombre: "Rodaje suave", dato: "15 min", esHecho: true),
            ])),
            BloqueCartelCompartir(titulo: "Series", pauta: "6 × 800 m", cuerpo: .serie([
                RepeticionCartel(etiqueta: nil, valor: "2:58", segundos: 178, ritmo: "3:42 /km", mejor: false),
                RepeticionCartel(etiqueta: nil, valor: "2:55", segundos: 175, ritmo: "3:39 /km", mejor: false),
                RepeticionCartel(etiqueta: nil, valor: "2:52", segundos: 172, ritmo: "3:35 /km", mejor: true),
                RepeticionCartel(etiqueta: nil, valor: "2:56", segundos: 176, ritmo: "3:40 /km", mejor: false),
            ])),
        ]
    ))

    private static let semana = TarjetaCompartible.semana(TarjetaSemanaDatos(
        chip: "SEMANA 34",
        titulo: "Base aeróbica",
        dias: [
            DiaCartelSemana(letra: "L", estado: .hecha),
            DiaCartelSemana(letra: "M", estado: .hecha),
            DiaCartelSemana(letra: "X", estado: .descanso),
            DiaCartelSemana(letra: "J", estado: .parcial),
            DiaCartelSemana(letra: "V", estado: .descanso),
        ],
        totales: "3/4 sesiones",
        sesiones: [
            SesionCartelSemana(dia: "Lunes", titulo: "Rodaje suave"),
            SesionCartelSemana(dia: "Martes", titulo: "Series de umbral"),
            SesionCartelSemana(dia: "Jueves", titulo: "Fuerza tren inferior"),
        ]
    ))

    @MainActor
    private func captura(_ nombre: String, entera: Bool = false, @ViewBuilder _ vista: () -> some View) {
        for v in Self.variantes {
            let png = CapturaVentana.png(vista(), oscuro: v.oscuro, club: v.club, entera: entera)
            CapturaVentana.guarda(png, nombre: "compartir-\(nombre)-\(v.nombre)", en: self)
        }
    }

    @MainActor
    func testHojaEntreno() {
        captura("hoja-entreno") { CompartirSheet(tarjeta: Self.entreno) }
    }

    @MainActor
    func testHojaSemana() {
        captura("hoja-semana") { CompartirSheet(tarjeta: Self.semana) }
    }

    /// La tarjeta sola, tal como sale en el PNG: en claro y en oscuro ha de leerse igual.
    @MainActor
    func testTarjetas() {
        for (nombre, tarjeta) in [("entreno", Self.entreno), ("semana", Self.semana)] {
            captura("tarjeta-\(nombre)", entera: true) {
                TarjetaCompartibleView(tarjeta: tarjeta, marca: MarcaCartel.actual(conClub: true))
                    .padding(40)
                    .background(Color.gray.opacity(0.5))
            }
        }
    }

    @MainActor
    func testHojaConTextoGrande() {
        let png = CapturaVentana.png(CompartirSheet(tarjeta: Self.entreno), tamano: .accessibility3, entera: false)
        CapturaVentana.guarda(png, nombre: "compartir-hoja-entreno-ax3", en: self)
    }
}
