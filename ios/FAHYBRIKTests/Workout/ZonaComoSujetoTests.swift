import XCTest
@testable import FAHYBRIK

// DÓNDE DE LA BANDA ESTÁS — y lo que «Z3» no dice.
//
// A 152 y a 160 el reloj ponía «Z3» en los dos casos, y uno de los dos está a un
// latido de Z4. Lo que hace falta para distinguirlos es un dato que no existía:
// DÓNDE de la banda estás.
//
// Mecanismo, no método: las bandas las pone el coach. Estos tests usan bandas
// de servidor de verdad (umbral 170) y comprueban la posición DENTRO de ellas,
// así que cambiar las bandas no rompe nada de esto.
final class ZonaComoSujetoTests: XCTestCase {

    private func zonas() -> HRZoneProfile {
        HRZoneProfile(
            lthrBpm: 170,
            estimated: false,
            source: "lthr_measured",
            sourceLabel: "Medido en tu test de umbral",
            confidence: "measured",
            zones: [
                HRZoneBand(zone: 1, code: "Z1", label: "Recuperación", minBpm: nil, maxBpm: 138, rangeLabel: "< 138 ppm"),
                HRZoneBand(zone: 2, code: "Z2", label: "Aeróbico suave", minBpm: 139, maxBpm: 150, rangeLabel: "139–150 ppm"),
                HRZoneBand(zone: 3, code: "Z3", label: "Aeróbico intenso", minBpm: 151, maxBpm: 160, rangeLabel: "151–160 ppm"),
                HRZoneBand(zone: 4, code: "Z4", label: "Umbral", minBpm: 162, maxBpm: 173, rangeLabel: "162–173 ppm"),
                HRZoneBand(zone: 5, code: "Z5", label: "VO₂ máx", minBpm: 175, maxBpm: 196, rangeLabel: "> 175 ppm"),
            ]
        )
    }

    // MARK: - La posición dentro de la banda

    func testJustoAlEntrarPorAbajoLaFraccionEsCero() throws {
        let p = try XCTUnwrap(zonas().posicion(forBpm: 151))
        XCTAssertEqual(p.zona, .z3)
        XCTAssertEqual(p.fraccion, 0, accuracy: 0.001)
        XCTAssertEqual(p.siguiente, .z4)
    }

    func testAUnLatidoDeLaSiguienteLaFraccionEsUno() throws {
        let p = try XCTUnwrap(zonas().posicion(forBpm: 160))
        XCTAssertEqual(p.zona, .z3)
        XCTAssertEqual(p.fraccion, 1, accuracy: 0.001)
    }

    /// EL DATO QUE FALTABA: los dos son «Z3» y no son lo mismo.
    func testDosPulsosDeLaMismaZonaNoPintanLoMismo() throws {
        let bajo = try XCTUnwrap(zonas().posicion(forBpm: 152))
        let alto = try XCTUnwrap(zonas().posicion(forBpm: 159))
        XCTAssertEqual(bajo.zona, alto.zona)
        XCTAssertLessThan(bajo.fraccion, alto.fraccion)
    }

    /// Z1 no tiene suelo en el modelo («no hay suelo para ir suave»): se mide
    /// desde 0, así que un pulso de rodaje suave sale alto dentro de su banda y
    /// uno de reposo, bajo. Las dos cosas son ciertas.
    func testZ1SeMideDesdeCeroPorqueNoTieneSuelo() throws {
        let reposo = try XCTUnwrap(zonas().posicion(forBpm: 60))
        let suave = try XCTUnwrap(zonas().posicion(forBpm: 130))
        XCTAssertEqual(reposo.zona, .z1)
        XCTAssertEqual(suave.zona, .z1)
        XCTAssertLessThan(reposo.fraccion, suave.fraccion)
    }

    /// En la última zona no hay hacia dónde derivar. El lienzo se queda en su
    /// propio color en vez de prometer una sexta zona.
    func testLaUltimaZonaNoTieneSiguiente() throws {
        let p = try XCTUnwrap(zonas().posicion(forBpm: 190))
        XCTAssertEqual(p.zona, .z5)
        XCTAssertNil(p.siguiente)
    }

    /// Por encima del techo fisiológico sigues en Z5 — y saturado, no por
    /// encima de 1: una fracción mayor que uno pintaría un relleno desbordado.
    func testPorEncimaDelTechoSigueSiendoZ5Saturada() throws {
        let p = try XCTUnwrap(zonas().posicion(forBpm: 210))
        XCTAssertEqual(p.zona, .z5)
        XCTAssertEqual(p.fraccion, 1, accuracy: 0.001)
    }

    func testSinPulsoNoHayPosicion() {
        XCTAssertNil(zonas().posicion(forBpm: 0))
    }

    /// Los hues de la tabla y los del color de zona son LA MISMA tabla: dos copias
    /// acabarían discrepando y el lienzo pintaría un verde distinto del punto del pulso.
    func testElHueDeCadaZonaEsElMismoQueSuColor() {
        for zona in HRZone.allCases {
            XCTAssertEqual(WatchTheme.hex(WatchTheme.zoneHex(zona)).description,
                           WatchTheme.zoneColor(zona).description)
        }
    }
}
