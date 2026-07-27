import XCTest
@testable import FAHYBRIK

// La regla del reparto de una estación existe en DOS sitios y no puede divergir:
//
//   · servidor — shared/domain/dobles-gap · splitStationPrediction()
//   · app      — DoblesRepartoMath.stationPairPredicted()
//
// El servidor manda y la app pinta, pero el slider del editor tiene que
// previsualizar el efecto mientras el atleta arrastra, así que la app necesita la
// cuenta en local. Para que "la misma regla" sea algo comprobable y no una
// promesa, las dos implementaciones se clavan contra la MISMA tabla de casos:
//
//   shared/domain/dobles-gap/station-split-cases.json
//
// La lee este test y la lee tests/analytics/dobles-gap.test.ts. Si una de las dos
// implementaciones se mueve, cae un test en uno de los dos lenguajes.
//
// La tabla se lee del repo (los tests corren en simulador, que ve el sistema de
// ficheros del Mac). Si no se puede leer, el test FALLA: un fichero ilegible no
// puede pasar por verde y dejar la equivalencia sin comprobar.
final class DoblesRepartoMathTests: XCTestCase {

    private struct SplitCase: Decodable {
        let name: String
        let share: Double
        let selfS: Int
        let partnerS: Int
        let expectedS: Int

        enum CodingKeys: String, CodingKey {
            case name
            case share
            case selfS = "self_s"
            case partnerS = "partner_s"
            case expectedS = "expected_s"
        }
    }

    /// shared/domain/dobles-gap/station-split-cases.json, relativo a ESTE fichero
    /// (…/ios/FAHYBRIKTests/Dobles/ → raíz del repo son cuatro niveles arriba).
    private func loadCases() throws -> [SplitCase] {
        let repoRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Dobles
            .deletingLastPathComponent()  // FAHYBRIKTests
            .deletingLastPathComponent()  // ios
            .deletingLastPathComponent()  // raíz
        let url = repoRoot.appendingPathComponent("shared/domain/dobles-gap/station-split-cases.json")
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode([SplitCase].self, from: data)
    }

    // MARK: - La tabla compartida

    func test_tablaCompartida_mismoResultadoQueElServidor() throws {
        let cases = try loadCases()
        XCTAssertGreaterThan(cases.count, 5, "la tabla compartida llegó vacía o truncada")

        for c in cases {
            let got = DoblesRepartoMath.stationPairPredicted(
                selfShare: c.share,
                selfSoloS: c.selfS,
                partnerSoloS: c.partnerS
            )
            XCTAssertEqual(
                got, c.expectedS,
                "\(c.name): share \(c.share) · \(c.selfS)/\(c.partnerS) → \(got), el servidor da \(c.expectedS)"
            )
        }
    }

    // MARK: - El clamp

    // Una parte es una fracción de UNA estación: fuera de 0…1 no significa nada.
    // El servidor lo acota al guardar el reparto y aquí se acota igual, así un
    // share corrupto da el mismo número en los dos lados en vez de dos distintos.
    func test_clamp_delShare() {
        // Por encima de 1 → el tramo entero lo llevas tú.
        XCTAssertEqual(DoblesRepartoMath.stationPairPredicted(selfShare: 1.4, selfSoloS: 220, partnerSoloS: 250), 220)
        XCTAssertEqual(DoblesRepartoMath.stationPairPredicted(selfShare: 99, selfSoloS: 220, partnerSoloS: 250), 220)
        // Por debajo de 0 → lo lleva entero tu pareja.
        XCTAssertEqual(DoblesRepartoMath.stationPairPredicted(selfShare: -0.3, selfSoloS: 220, partnerSoloS: 250), 250)
        XCTAssertEqual(DoblesRepartoMath.stationPairPredicted(selfShare: -99, selfSoloS: 220, partnerSoloS: 250), 250)
        // Los extremos válidos dan exactamente el tiempo individual.
        XCTAssertEqual(DoblesRepartoMath.stationPairPredicted(selfShare: 1, selfSoloS: 220, partnerSoloS: 250), 220)
        XCTAssertEqual(DoblesRepartoMath.stationPairPredicted(selfShare: 0, selfSoloS: 220, partnerSoloS: 250), 250)
    }

    // MARK: - Combinación por carrier

    // El reparto es un continuo: un share pleno equivale al carrier 'self' y un
    // share cero al 'partner'. Es lo que permite que el editor use SÓLO la regla
    // de split y siga cuadrando con lo que el servidor emite para esos carriers.
    func test_combinacionPorCarrier_losExtremosSonSelfYPartner() {
        let selfSolo = 174
        let partnerSolo = 190

        // carrier 'self' del servidor = share 1 aquí.
        XCTAssertEqual(
            DoblesRepartoMath.stationPairPredicted(selfShare: 1, selfSoloS: selfSolo, partnerSoloS: partnerSolo),
            selfSolo
        )
        // carrier 'partner' = share 0.
        XCTAssertEqual(
            DoblesRepartoMath.stationPairPredicted(selfShare: 0, selfSoloS: selfSolo, partnerSoloS: partnerSolo),
            partnerSolo
        )
        // Y en medio, la ponderación: 50/50 cae entre los dos.
        let half = DoblesRepartoMath.stationPairPredicted(selfShare: 0.5, selfSoloS: selfSolo, partnerSoloS: partnerSolo)
        XCTAssertGreaterThan(half, selfSolo)
        XCTAssertLessThan(half, partnerSolo)
        XCTAssertEqual(half, 182) // round(0.5·174 + 0.5·190)
    }

    // El carrier que la app manda de vuelta en el PUT, derivado del share — misma
    // regla que DoblesStationSplit.resolvedCarrier.
    func test_carrierForShare() {
        XCTAssertEqual(DoblesRepartoMath.carrier(forShare: 1.0), "self")
        XCTAssertEqual(DoblesRepartoMath.carrier(forShare: 0.0), "partner")
        XCTAssertEqual(DoblesRepartoMath.carrier(forShare: 0.5), "split")
        XCTAssertEqual(DoblesRepartoMath.carrier(forShare: 0.05), "split")
        XCTAssertEqual(DoblesRepartoMath.carrier(forShare: 0.95), "split")
    }
}
