import XCTest
import SwiftUI
@testable import FAHYBRIK

// LA PIEL DE LAS ANALÍTICAS — lo que se afirma sin mirar una captura. Es la traducción a XCTest de
// `kit-analiticas-piel.test.ts`, sobre los tokens de Swift en lugar de `twin.css`:
//   · el contraste está MEDIDO en las dos apariencias (texto 4,5:1; marcas que portan significado 3:1);
//   · la paleta de familias pasa las comprobaciones del validador de la skill dataviz en las dos
//     apariencias (ΔE en OKLab ×100: visión normal ≥ 15 y daltónica ≥ 8, todos los pares);
//   · las zonas son un espectro ordenado, y el acento del club no es un color de dato;
//   · ningún fichero de la pestaña clava un hex, fuerza el esquema o baja del suelo de 15 pt.
final class AnaliticasPielTests: XCTestCase {

    private static let apariencias: [UIUserInterfaceStyle] = [.dark, .light]

    override func setUp() { super.setUp(); ClubThemeStore.clear() }
    override func tearDown() { ClubThemeStore.clear(); super.tearDown() }

    private func razon(_ texto: Color, _ fondo: Color, _ e: UIUserInterfaceStyle) -> Double {
        Contraste.razon(texto: texto, fondo: fondo, en: e)
    }

    /// Donde se pone texto: el fondo, la tarjeta, la elevada y la banda/etiqueta de una gráfica.
    private var fondosDeTexto: [(String, Color)] {
        [("fondo", Theme.Color.background), ("tarjeta", Theme.Color.surface),
         ("elevada", Theme.Color.surfaceElevated), ("banda de gráfica", Theme.Color.superficieDeGrafico)]
    }

    private var familias: [(String, Color)] {
        [("correr", Theme.Color.familiaCorrer), ("ergo", Theme.Color.familiaErgo),
         ("fuerza", Theme.Color.familiaFuerza), ("estaciones", Theme.Color.familiaEstaciones)]
    }

    // MARK: - Contraste medido

    func testTextoLaTintaYElGrisDeApoyoA45SobreCadaFondoEnClaroYOscuro() {
        for e in Self.apariencias {
            for (nombre, fondo) in fondosDeTexto {
                XCTAssertGreaterThanOrEqual(razon(Theme.Color.foreground, fondo, e), Contraste.aaTexto, "tinta sobre \(nombre) en \(e.rawValue)")
                XCTAssertGreaterThanOrEqual(razon(Theme.Color.muted, fondo, e), Contraste.aaTexto, "apoyo sobre \(nombre) en \(e.rawValue)")
            }
        }
    }

    func testLasMarcasQuePortanSignificadoFamiliasYZonasA3SobreElFondoYLaTarjeta() {
        for e in Self.apariencias {
            for fondo in [Theme.Color.background, Theme.Color.surface] {
                for (nombre, c) in familias {
                    XCTAssertGreaterThanOrEqual(razon(c, fondo, e), Contraste.aaGrande, "familia \(nombre) en \(e.rawValue)")
                }
                for n in 3...9 {
                    for z in 1...n {
                        XCTAssertGreaterThanOrEqual(razon(Theme.Color.zona(z, de: n), fondo, e), Contraste.aaGrande, "Z\(z) de \(n) en \(e.rawValue)")
                    }
                }
            }
        }
    }

    func testLaChispaDeUnaFilaFamiliaUn12HaciaLaTintaConElTrazoAl90PorCientoPasaDe3() {
        for e in Self.apariencias {
            for (nombre, c) in familias {
                let trazo = Theme.Color.chispa(c).opacity(0.9)
                XCTAssertGreaterThanOrEqual(razon(trazo, Theme.Color.surface, e), Contraste.aaGrande, "chispa de \(nombre) en \(e.rawValue)")
            }
        }
    }

    func testLaFrescuraElGrisFuerteDaBarrasPasadasAlCincuentaYCincoA3YEjesA45() {
        for e in Self.apariencias {
            XCTAssertGreaterThanOrEqual(razon(Theme.Color.apoyoFuerte.opacity(0.55), Theme.Color.surface, e), Contraste.aaGrande, "barras pasadas en \(e.rawValue)")
            XCTAssertGreaterThanOrEqual(razon(Theme.Color.apoyoFuerte, Theme.Color.surface, e), Contraste.aaTexto, "ejes en \(e.rawValue)")
        }
    }

    func testElSujetoLaTintaA45SobreCadaTinteYLaMarcaDeEstadoYElArcoA3() {
        let tonos: [TonoDia] = [.neutro, .ok, .info, .peligro]
        for e in Self.apariencias {
            for tono in tonos {
                let fondo = tono.papeles.fondo
                XCTAssertGreaterThanOrEqual(razon(Theme.Color.foreground, fondo, e), Contraste.aaTexto, "tinta sobre \(tono) en \(e.rawValue)")
            }
            // Cada marca de estado sobre SU tinte (el de `EstadoDeFrescura.tinte`).
            for estado in EstadoDeFrescura.allCases {
                let (tono, marca) = estado.tinte
                XCTAssertGreaterThanOrEqual(razon(marca.color, tono.papeles.fondo, e), Contraste.aaGrande, "marca de \(estado) en \(e.rawValue)")
            }
            // El arco de la disposición, sobre la superficie y los tintes donde puede caer.
            for arco in [NivelDeDisposicion.bajo, .medio, .alto] {
                for fondo in [Theme.Color.surface, TonoDia.neutro.papeles.fondo, TonoDia.ok.papeles.fondo, TonoDia.info.papeles.fondo] {
                    XCTAssertGreaterThanOrEqual(razon(arco.color, fondo, e), Contraste.aaGrande, "arco \(arco) en \(e.rawValue)")
                }
            }
        }
    }

    func testLaMarcaDelDeltaVerdeAmbarYGrisA3SobreLaTesela() {
        for e in Self.apariencias {
            for c in [Theme.Color.ok, Theme.Color.warning, Theme.Color.muted] {
                XCTAssertGreaterThanOrEqual(razon(c, Theme.Color.surface, e), Contraste.aaGrande)
            }
        }
    }

    // MARK: - El acento del club NO es un color de dato

    func testElAcentoDelClubNoEsColorDeFamiliaNiDeZonaConNingunClub() {
        func rgb(_ c: Color, _ e: UIUserInterfaceStyle) -> [Double] { let v = Contraste.rgba(c, en: e); return [v.r, v.g, v.b].map { ($0 * 255).rounded() } }
        for club in [nil] + ClubTheme.acentosDePrueba.map(Optional.some) {
            ClubThemeStore.update(club)
            for e in Self.apariencias {
                let acento = rgb(Theme.Color.accent, e)
                for (nombre, c) in familias { XCTAssertNotEqual(rgb(c, e), acento, "familia \(nombre) = acento") }
                for n in 3...9 { for z in 1...n { XCTAssertNotEqual(rgb(Theme.Color.zona(z, de: n), e), acento, "Z\(z) de \(n) = acento") } }
            }
        }
    }

    func testElAcentoCambiaConElClubYElColorDeUnaFamiliaNo() {
        ClubThemeStore.update(.pruebaAzul)
        let acentoAzul = Contraste.rgba(Theme.Color.accent, en: .light)
        let familiaConAzul = Contraste.rgba(Theme.Color.familiaCorrer, en: .light)
        ClubThemeStore.update(.pruebaAmarillo)
        let acentoAmarillo = Contraste.rgba(Theme.Color.accent, en: .light)
        let familiaConAmarillo = Contraste.rgba(Theme.Color.familiaCorrer, en: .light)
        XCTAssertNotEqual(acentoAzul.r, acentoAmarillo.r, "el acento es el del club")
        XCTAssertEqual(familiaConAzul.r, familiaConAmarillo.r)
        XCTAssertEqual(familiaConAzul.g, familiaConAmarillo.g)
        XCTAssertEqual(familiaConAzul.b, familiaConAmarillo.b)
    }

    func testLaTintaDelConmutadorElegidoEsLaDelClubMedidaContraSuRelleno() {
        for club in ClubTheme.acentosDePrueba {
            ClubThemeStore.update(club)
            for e in Self.apariencias {
                XCTAssertGreaterThanOrEqual(razon(Theme.Color.accentOn, Theme.Color.accent, e), Contraste.aaTexto, "\(club.accent?.fill ?? "?") en \(e.rawValue)")
            }
        }
    }

    // MARK: - El validador de la skill dataviz (OKLab ×100, Machado 2009 a severidad 1)

    private typealias Rgb = [Double]
    private static let protan: [[Double]] = [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]
    private static let deutan: [[Double]] = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]]

    private func lineal(_ c: Color, _ e: UIUserInterfaceStyle) -> Rgb {
        let v = Contraste.rgba(c, en: e)
        return [v.r, v.g, v.b].map { $0 <= 0.04045 ? $0 / 12.92 : pow(($0 + 0.055) / 1.055, 2.4) }
    }

    private func oklab(_ c: Rgb) -> Rgb {
        let l = cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2])
        let m = cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2])
        let s = cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2])
        return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
                1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
                0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
    }

    private func simular(_ c: Rgb, _ matriz: [[Double]]) -> Rgb {
        matriz.map { f in max(0, min(1, f[0] * c[0] + f[1] * c[1] + f[2] * c[2])) }
    }

    private func deltaE(_ a: Color, _ b: Color, _ e: UIUserInterfaceStyle, _ matriz: [[Double]]? = nil) -> Double {
        var x = lineal(a, e), y = lineal(b, e)
        if let matriz { x = simular(x, matriz); y = simular(y, matriz) }
        let p = oklab(x), q = oklab(y)
        return 100 * (zip(p, q).map { ($0 - $1) * ($0 - $1) }.reduce(0, +)).squareRoot()
    }

    private func parejas<T>(_ xs: [T]) -> [(T, T)] { xs.indices.flatMap { i in xs.indices.filter { $0 > i }.map { (xs[i], xs[$0]) } } }

    func testLaPaletaDeFamiliasSeparaAlosDaltonicosYALaVisionNormalEnLasDosApariencias() {
        for e in Self.apariencias {
            for ((na, a), (nb, b)) in parejas(familias) {
                XCTAssertGreaterThanOrEqual(deltaE(a, b, e), 15, "\(na) ↔ \(nb) visión normal en \(e.rawValue)")
                XCTAssertGreaterThanOrEqual(deltaE(a, b, e, Self.protan), 8, "\(na) ↔ \(nb) protanopia en \(e.rawValue)")
                XCTAssertGreaterThanOrEqual(deltaE(a, b, e, Self.deutan), 8, "\(na) ↔ \(nb) deuteranopia en \(e.rawValue)")
            }
        }
    }

    func testLosValoresDeLaPaletaSonLosValidadosEnElDoble() {
        func hex(_ c: Color, _ e: UIUserInterfaceStyle) -> String {
            let v = Contraste.rgba(c, en: e)
            return String(format: "#%02x%02x%02x", Int((v.r * 255).rounded()), Int((v.g * 255).rounded()), Int((v.b * 255).rounded()))
        }
        XCTAssertEqual(familias.map { hex($0.1, .light) }, ["#237dee", "#1d661b", "#7625a0", "#d1598c"])
        XCTAssertEqual(familias.map { hex($0.1, .dark) }, ["#3f9dda", "#41ab77", "#764ec7", "#9d466a"])
    }

    func testLasZonasSonUnEspectroOrdenadoCadaUnaSeSeparaDeSuVecina() {
        for e in Self.apariencias {
            for n in 3...9 {
                let zonas = (1...n).map { Theme.Color.zona($0, de: n) }
                let minimo: Double = n <= 5 ? 12 : 8
                for i in 1..<n { XCTAssertGreaterThanOrEqual(deltaE(zonas[i - 1], zonas[i], e), minimo, "Z\(i) ↔ Z\(i + 1) de \(n) en \(e.rawValue)") }
            }
            // Un coach con cinco zonas: cinco tonos distintos.
            let cinco = (1...5).map { Theme.Color.zona($0, de: 5) }
            for ((i, a), (j, b)) in parejas(Array(cinco.enumerated())) { XCTAssertGreaterThan(deltaE(a, b, e), 5, "Z\(i + 1) ≈ Z\(j + 1) en \(e.rawValue)") }
        }
    }

    func testUnaZonaFueraDeRangoCaeAlExtremoNuncaAlAcentoNiAUnGris() {
        XCTAssertEqual(rgbeq(Theme.Color.zona(0, de: 5), Theme.Color.zona(1, de: 5)), true)
        XCTAssertEqual(rgbeq(Theme.Color.zona(9, de: 5), Theme.Color.zona(5, de: 5)), true)
        XCTAssertEqual(rgbeq(Theme.Color.zona(2, de: 1), Theme.Color.zona(2, de: 3)), true, "menos de 3 zonas se acota a 3")
    }

    private func rgbeq(_ a: Color, _ b: Color) -> Bool {
        Self.apariencias.allSatisfy { e in
            let x = Contraste.rgba(a, en: e), y = Contraste.rgba(b, en: e)
            return x.r == y.r && x.g == y.g && x.b == y.b
        }
    }

    // MARK: - Nada clavado en los ficheros de la pestaña

    func testLosFicherosDeLaPestanaNoClavanColoresNiForzanElEsquemaNiBajanDe15() throws {
        // `#filePath` es la ruta de ESTE fichero al compilar: de ahí se llega a `Analytics/Panel`.
        let raiz = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("FAHYBRIK/Analytics/Panel")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: raiz.path), "sin el árbol de fuentes")
        let ficheros = try XCTUnwrap(FileManager.default.enumerator(at: raiz, includingPropertiesForKeys: nil))
            .compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(ficheros.count, 15)

        let prohibidos: [(patron: String, motivo: String)] = [
            (#"0x[0-9A-Fa-f]{6}"#, "hex literal"),
            (##"\"#[0-9A-Fa-f]{6}\""##, "hex en cadena"),
            (#"Color\(red:"#, "color por componentes"),
            (#"\.orange\b"#, "naranja del sistema"),
            (#"AnaliticasColor|AnaliticasTokens|VivoColor|VivoTokens|VivoPulsarStyle"#, "el sistema de piel paralelo del vivo"),
            (#"\.environment\(\\\.colorScheme,\s*\.dark\)|preferredColorScheme\(\.dark\)|overrideUserInterfaceStyle"#, "un esquema forzado"),
            (#"\.system\(size:\s*(?:[0-9]|1[0-4])(?:\.\d+)?\s*[,)]"#, "texto por debajo del suelo de 15 pt"),
        ]
        for fichero in ficheros {
            let texto = try String(contentsOf: fichero, encoding: .utf8)
            // Sin comentarios (en ellos se citan hex y nombres a propósito) y sin las previews y la galería de
            // Debug, que existen para ver la pantalla en un esquema concreto.
            var enDebug = false
            let codigo = texto.split(separator: "\n", omittingEmptySubsequences: false)
                .filter { linea in
                    let l = linea.trimmingCharacters(in: .whitespaces)
                    if l.hasPrefix("#if DEBUG") { enDebug = true }
                    defer { if l.hasPrefix("#endif") { enDebug = false } }
                    return !enDebug && !l.hasPrefix("//")
                }
                .joined(separator: "\n")
            for (patron, motivo) in prohibidos {
                let regex = try NSRegularExpression(pattern: patron)
                let n = regex.numberOfMatches(in: codigo, range: NSRange(codigo.startIndex..., in: codigo))
                XCTAssertEqual(n, 0, "\(fichero.lastPathComponent): \(motivo) (\(patron))")
            }
        }
    }
}
