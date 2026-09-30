import XCTest
import SwiftUI
@testable import FAHYBRIK

// LO QUE EL DISEÑO PROHÍBE EN LAS PANTALLAS QUE CUELGAN DE PERFIL, VIGILADO.
//
// Las mismas vigilancias que `PerfilDisenoTests` aplica a la pestaña, sobre las pantallas secundarias ya rehechas:
// ni un naranja, un hex, un texto por debajo del suelo de 15 pt, un `accent.opacity(…)` suelto ni una pieza de la piel
// vieja (`SectionLabel`, `LabelText`, `CardSurface`, `ExpertPrimaryButton`, `RedesignEmptyState`, `ToastBanner`…).
// Si un fichero de esta lista vuelve a llevar una, salta aquí y no en la pantalla de un atleta.

final class SecundariasPerfilDisenoTests: XCTestCase {

    override func tearDown() {
        ClubThemeStore.clear()
        super.tearDown()
    }

    /// Las pantallas rehechas, por carpeta bajo `ios/FAHYBRIK`. Una carpeta entera (`Secundarias`, `Dispositivos`) o un fichero.
    private static let ficheros: [String] = [
        "Profile/Secundarias", "Profile/Dispositivos",
        "Profile/ProfileGroupViews.swift", "Profile/ProfilePrivacidadView.swift", "Profile/EditProfileView.swift",
        "Profile/ProfileShared.swift", "Profile/MyStrengthView.swift", "Profile/RegisterStrengthTestView.swift",
        "Profile/MyZonesView.swift", "Profile/RegisterTestView.swift", "Profile/Vo2MaxView.swift",
        "Profile/TrainingDays/TrainingDaysView.swift", "Profile/FotoPerfilSheet.swift",
        "Profile/PartnerInviteSheet.swift", "Profile/PartnerRedeemView.swift", "Profile/LifecycleSheets.swift",
        "Profile/DeleteAccountConfirmView.swift", "Profile/AppFeedbackSheet.swift",
        "Profile/DeviceConnectionsView.swift", "Profile/DeviceConnectionsView+Acciones.swift",
        "Profile/DeviceConnectionsPresentation.swift", "Profile/CorosConnectionDetailView.swift",
        "Profile/PM5SettingsView.swift", "Profile/HealthHistoryImportPanel.swift",
        "Subscription/SubscriptionView.swift", "Wearables/GarminSetupView.swift",
        "Diagnostics/DiagnosticoRelojView.swift", "Watch/SensorConsentSheet.swift",
        "Health/InjuriesView.swift", "Health/InjuryDetailView.swift", "Health/ReportInjurySheet.swift",
        "Health/InjuryPiezas.swift",
    ]

    private func rutasDeFuentes() throws -> [URL] {
        // `#filePath` es la ruta de ESTE fichero al compilar: de ahí se llega a `ios/FAHYBRIK`. Si el código se
        // ejecuta donde no está el árbol de fuentes, no hay nada que vigilar.
        let raiz = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("FAHYBRIK")
        try XCTSkipUnless(FileManager.default.fileExists(atPath: raiz.path), "sin el árbol de fuentes")
        var urls: [URL] = []
        for ruta in Self.ficheros {
            let url = raiz.appendingPathComponent(ruta)
            var esCarpeta: ObjCBool = false
            XCTAssertTrue(FileManager.default.fileExists(atPath: url.path, isDirectory: &esCarpeta), "\(ruta) ya no existe: quítalo de la lista")
            if esCarpeta.boolValue {
                let dentro = try FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)
                urls += dentro.filter { $0.pathExtension == "swift" }
            } else {
                urls.append(url)
            }
        }
        return urls
    }

    private func codigoSinComentarios(_ url: URL) throws -> String {
        try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    func testNingunaPantallaRehechaClavaColoresTextoPequenoNiPielVieja() throws {
        let prohibidos: [(patron: String, motivo: String)] = [
            (#"0x[0-9A-Fa-f]{6}"#, "hex literal"),
            (##"\"#[0-9A-Fa-f]{6}\""##, "hex en cadena"),
            (#"Color\(red:"#, "color por componentes"),
            (#"\.orange\b"#, "naranja del sistema"),
            (#"accent[A-Za-z]*\.opacity\("#, "acento con opacidad suelta (se usa accentTint)"),
            (#"\.system\(size:\s*(?:[0-9]|1[0-4])(?:\.\d+)?\s*[,)]"#, "texto por debajo del suelo de 15 pt"),
            (#"scaledFont\(\s*(?:[0-9]|1[0-4])(?:\.\d+)?\s*[,)]"#, "texto por debajo del suelo de 15 pt"),
            (#"Typography\.(?:small|caption|dataLabel)\b"#, "escala antigua por debajo del suelo"),
            (#"\b(?:SectionLabel|SectionHeader|LabelText|CardSurface|ExpertPrimaryButton|RedesignEmptyState|ToastBanner)\b"#, "pieza de la piel vieja"),
            (#"\bprint\("#, "print en código commiteado"),
            (#"\bTODO\b"#, "TODO sin dueño"),
        ]
        for url in try rutasDeFuentes() {
            let codigo = try codigoSinComentarios(url)
            for (patron, motivo) in prohibidos {
                let regex = try NSRegularExpression(pattern: patron)
                let n = regex.numberOfMatches(in: codigo, range: NSRange(codigo.startIndex..., in: codigo))
                XCTAssertEqual(n, 0, "\(url.lastPathComponent): \(motivo) (\(patron))")
            }
        }
    }

    func testNingunNombreDeCoachNiDeMarcaHeredadaEnLasPantallasRehechas() throws {
        for url in try rutasDeFuentes() {
            let codigo = try codigoSinComentarios(url)
            XCTAssertNil(codigo.range(of: "pablo|fabrik|fahybrik", options: [.regularExpression, .caseInsensitive]), url.lastPathComponent)
        }
    }

    /// Un símbolo por idea: ninguno de Perfil se repite ni choca con los del kit, y todos existen.
    func testTodoGlifoDePerfilEsUnSFSymbolQueExisteYNingunoSeRepite() {
        for g in GlifoPerfil.allCases { XCTAssertNotNil(UIImage(systemName: g.simbolo), "«\(g.simbolo)» no existe") }
        XCTAssertEqual(Set(GlifoPerfil.allCases.map(\.simbolo)).count, GlifoPerfil.allCases.count, "dos ideas con el mismo símbolo")
        XCTAssertTrue(Set(GlifoPerfil.allCases.map(\.simbolo)).isDisjoint(with: GlifoDia.allCases.map(\.simbolo)))
    }
}
