import XCTest
import SwiftUI
@testable import FAHYBRIK

// LO QUE EL DISEÑO DE PERFIL PROHÍBE, VIGILADO — contraste medido y nada clavado en el código.
//
// Las mismas dos vigilancias que tiene el kit (`DiaKitTests`), aplicadas a lo que esta pestaña añade:
//  · el texto que cae sobre un tinte pasa AA con cualquier acento de club (CONTRATO-UI §11.2);
//  · ningún fichero de Perfil clava un naranja, un hex ni un texto por debajo del suelo de 15 pt, ni deja
//    un `accent.opacity(…)` suelto (se usa `accentTint`), ni un `print`.

final class PerfilDisenoTests: XCTestCase {

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    private static let esquemas: [(nombre: String, estilo: UIUserInterfaceStyle)] = [("claro", .light), ("oscuro", .dark)]

    private func afirma(
        _ texto: SwiftUI.Color, sobre fondo: SwiftUI.Color, minimo: Double = Contraste.aaTexto,
        _ que: String, club: String, file: StaticString = #filePath, line: UInt = #line
    ) {
        for (nombre, estilo) in Self.esquemas {
            let razon = Contraste.razon(texto: texto, fondo: fondo, en: estilo)
            XCTAssertGreaterThanOrEqual(razon, minimo, "\(que) · \(nombre) · \(club): \(String(format: "%.2f", razon)):1", file: file, line: line)
        }
    }

    // MARK: Contraste

    func testLaTintaDelTemaSobreElTinteDeLaFilaDeCorosPasaAAConCualquierClub() {
        let clubes: [(String, ClubTheme?)] = [("fábrica", nil)] + ClubTheme.acentosDePrueba.enumerated().map { ("club \($0.offset)", $0.element) }
        for (nombre, club) in clubes {
            ClubThemeStore.update(club)
            // La fila lleva el tinte del acento (translúcido) sobre la superficie de la tarjeta.
            afirma(Theme.Color.foreground, sobre: Theme.Color.accentTint(sobre: Theme.Color.surface), "pregunta de COROS", club: nombre)
            // La tesela que pide un acto: su apoyo también es la tinta del tema, no el gris.
            afirma(Theme.Color.foreground, sobre: Theme.Color.accentTint(sobre: Theme.Color.surface), "tesela con realce", club: nombre)
        }
    }

    func testLosGrisesDeApoyoPasanAASobreLasSuperficiesDeLaPestana() {
        afirma(Theme.Color.muted, sobre: Theme.Color.surface, "apoyo sobre tarjeta", club: "fábrica")
        afirma(Theme.Color.muted, sobre: Theme.Color.background, "apoyo sobre el lienzo", club: "fábrica")
        // El plegador de «Más ajustes» descansa sobre un velo de la tinta del tema.
        afirma(
            Theme.Color.muted,
            sobre: Theme.Color.tinte(Theme.Color.foreground, 0.03, sobre: Theme.Color.surface),
            "apoyo sobre el plegador", club: "fábrica"
        )
    }

    func testCerrarSesionEnPeligroSeLeeSobreElLienzo() {
        afirma(Theme.Color.danger, sobre: Theme.Color.background, "Cerrar sesión", club: "fábrica")
    }

    func testLaTintaDelTemaSobreLaFilaTenidaDeAvisoOPeligroPasaAA() {
        for tono in [TonoMarca.aviso, .peligro] {
            guard let color = tono.color else { return XCTFail("aviso y peligro tienen color") }
            afirma(Theme.Color.foreground, sobre: Theme.Color.tinte(color, 0.09, sobre: Theme.Color.surface), "fila con \(tono)", club: "fábrica")
        }
    }

    func testElAcentoComoTextoDeLasSalidasPasaAAConElAcentoDeFabrica() {
        // Solo la de fábrica: con un club claro el `accentText` del servidor no llega sobre lienzo claro (hallazgo
        // ya documentado por `DiaKitTests.testHallazgoElAccentTextDeUnClubClaroNoSeLeeSobreLienzoClaro`).
        ClubThemeStore.update(nil)
        afirma(Theme.Color.accentText, sobre: Theme.Color.surface, "«Cómo medirlo»", club: "fábrica")
        afirma(Theme.Color.accentText, sobre: Theme.Color.surface, "«Reintentar»", club: "fábrica")
    }

    // MARK: Nada clavado

    private func ficherosDePerfil() throws -> [URL] {
        // `#filePath` es la ruta de ESTE fichero al compilar: de ahí se llega a `FAHYBRIK/Profile`. Si el código
        // se ejecuta donde no está el árbol de fuentes, no hay nada que vigilar.
        let carpeta = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("FAHYBRIK/Profile")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: carpeta.path), "sin el árbol de fuentes")
        let nuevos = try FileManager.default.contentsOfDirectory(at: carpeta, includingPropertiesForKeys: nil).filter {
            $0.pathExtension == "swift" && (
                $0.lastPathComponent.hasPrefix("Perfil") || $0.lastPathComponent.hasPrefix("LecturaPerfil")
                    || ["DecidePerfil.swift", "RendimientoPerfil.swift", "CasosPerfil.swift", "GaleriaPerfil.swift", "ProfileView.swift"]
                    .contains($0.lastPathComponent)
            )
        }
        XCTAssertGreaterThanOrEqual(nuevos.count, 12, "faltan ficheros de Perfil que vigilar")
        return nuevos
    }

    func testLosFicherosDePerfilNoClavanColoresNiTextoPorDebajoDe15() throws {
        let prohibidos: [(patron: String, motivo: String)] = [
            (#"0x[0-9A-Fa-f]{6}"#, "hex literal"),
            (##"\"#[0-9A-Fa-f]{6}\""##, "hex en cadena"),
            (#"Color\(red:"#, "color por componentes"),
            (#"\.orange\b"#, "naranja del sistema"),
            (#"accent[A-Za-z]*\.opacity\("#, "acento con opacidad suelta (se usa accentTint)"),
            (#"\.system\(size:\s*(?:[0-9]|1[0-4])(?:\.\d+)?\s*[,)]"#, "texto por debajo del suelo de 15 pt"),
            (#"scaledFont\(\s*(?:[0-9]|1[0-4])(?:\.\d+)?\s*[,)]"#, "texto por debajo del suelo de 15 pt"),
            (#"\bprint\("#, "print en código commiteado"),
            (#"\bTODO\b"#, "TODO sin dueño"),
        ]
        for fichero in try ficherosDePerfil() {
            let texto = try String(contentsOf: fichero, encoding: .utf8)
            // Sin comentarios: en ellos se cita el hex de fábrica o el `print` a propósito.
            let codigo = texto.split(separator: "\n", omittingEmptySubsequences: false)
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .joined(separator: "\n")
            for (patron, motivo) in prohibidos {
                let regex = try NSRegularExpression(pattern: patron)
                let n = regex.numberOfMatches(in: codigo, range: NSRange(codigo.startIndex..., in: codigo))
                XCTAssertEqual(n, 0, "\(fichero.lastPathComponent): \(motivo) (\(patron))")
            }
        }
    }

    func testNingunNombreDeCoachNiDeMarcaHeredadaEnElCodigoDePerfil() throws {
        for fichero in try ficherosDePerfil() where fichero.lastPathComponent != "CasosPerfil.swift" {
            let texto = try String(contentsOf: fichero, encoding: .utf8)
            let codigo = texto.split(separator: "\n", omittingEmptySubsequences: false)
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .joined(separator: "\n")
            XCTAssertNil(codigo.range(of: "pablo|fabrik|fahybrik", options: [.regularExpression, .caseInsensitive]), fichero.lastPathComponent)
        }
    }

    func testTodoGlifoDePerfilEsUnSFSymbolQueExisteYNingunoSeRepite() {
        for g in GlifoPerfil.allCases { XCTAssertNotNil(UIImage(systemName: g.simbolo), "«\(g.simbolo)» no existe") }
        XCTAssertEqual(Set(GlifoPerfil.allCases.map(\.simbolo)).count, GlifoPerfil.allCases.count, "dos ideas con el mismo símbolo")
        // Ni uno de los del kit, para que la misma idea no tenga dos símbolos.
        XCTAssertTrue(Set(GlifoPerfil.allCases.map(\.simbolo)).isDisjoint(with: GlifoDia.allCases.map(\.simbolo)))
    }
}
