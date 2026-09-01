import XCTest
@testable import FAHYBRIK

// EL ON/OFF DEL BISEL — la forma de la parte que se corre.
//
// Lo que se prueba aquí no es que dibuje: es que el REPARTO de los arcos sólo
// use lo que de verdad se sabe. Un arco promete «esto es esta parte de lo que
// queda», así que estimar con un ritmo que nadie escribió sería exactamente la
// pantalla que se inventa los números.
final class FormaDelAroTests: XCTestCase {

    private func leg(_ measure: RunSegmentMeasure,
                     kind: RunLeg.Kind = .work,
                     target: RunSegmentTarget? = nil,
                     resolved: ResolvedIntensity? = nil,
                     fase: RunPhaseRole = .main) -> RunLeg {
        RunLeg(kind: kind, measure: measure, target: target, resolved: resolved,
               inclinePct: nil, cadenceSpm: nil,
               recoveryMode: kind == .recovery ? .trote : nil, phaseRole: fase)
    }

    private func banda(fast: Double, slow: Double?, unidad: String = "per_km") -> ResolvedIntensity {
        ResolvedIntensity(zoneLabel: "Z4", rangeLabel: "banda", fastS: fast, slowS: slow,
                          paceUnit: unidad, needsReview: false)
    }

    /// 5 × (800 m + trote 400 m), que es el plan por defecto del constructor.
    private func seriePorDistancia() -> [RunLeg] {
        (0..<5).flatMap { i -> [RunLeg] in
            let trabajo = leg(.distance(m: 800), target: .hrZone(4))
            let trote = leg(.distance(m: 400), kind: .recovery, target: .hrZone(1))
            return i < 4 ? [trabajo, trote] : [trabajo]
        }
    }

    // MARK: - El reparto, peldaño a peldaño

    func testPesaPorMetrosCuandoTodoVaPorDistancia() {
        let legs = seriePorDistancia()
        let forma = FormaDelAro.fase(legs: legs, indice: 0)
        XCTAssertEqual(forma?.arcos.count, 9)
        XCTAssertEqual(forma?.arcos.map(\.trabajo),
                       [true, false, true, false, true, false, true, false, true])
        // El 800 ocupa el doble que su trote: verdad, aunque nadie sepa los minutos.
        XCTAssertEqual(forma?.arcos.map(\.peso), [800, 400, 800, 400, 800, 400, 800, 400, 800])
    }

    func testPesaPorSegundosCuandoTodoVaPorTiempo() {
        // Fartlek 3 × (1' fuerte / 1' suave).
        let legs: [RunLeg] = [
            leg(.duration(s: 60), target: .hrZone(4)),
            leg(.duration(s: 60), kind: .recovery, target: .hrZone(1)),
            leg(.duration(s: 60), target: .hrZone(4)),
            leg(.duration(s: 60), kind: .recovery, target: .hrZone(1)),
            leg(.duration(s: 90), target: .hrZone(5)),
        ]
        XCTAssertEqual(FormaDelAro.fase(legs: legs, indice: 4)?.arcos.map(\.peso),
                       [60, 60, 60, 60, 90])
    }

    func testUnRitmoEscritoConvierteLosMetrosEnSegundos() {
        // 1000 m a 4:00/km = 240 s, con recuperación de 90 s: el reparto es de
        // tiempo, que es la respuesta honesta a «cuánto falta».
        let legs: [RunLeg] = [
            leg(.distance(m: 1000), target: .pace(valueS: 240, minS: nil, maxS: nil)),
            leg(.duration(s: 90), kind: .recovery),
            leg(.distance(m: 1000), target: .pace(valueS: 240, minS: nil, maxS: nil)),
        ]
        XCTAssertEqual(FormaDelAro.fase(legs: legs, indice: 0)?.arcos.map(\.peso), [240, 90, 240])
    }

    func testLaBandaResueltaCuentaComoRitmoEscrito() {
        // Una zona que el servidor resolvió contra el benchmark del atleta es la
        // MISMA banda que él lee en su ficha: no es un ritmo inventado.
        let legs: [RunLeg] = [
            leg(.distance(m: 1000), target: .hrZone(4), resolved: banda(fast: 230, slow: 250)),
            leg(.duration(s: 60), kind: .recovery),
        ]
        XCTAssertEqual(FormaDelAro.fase(legs: legs, indice: 0)?.arcos.map(\.peso), [240, 60])
    }

    func testUnaBandaDeErgoNoSirveDeRitmoDeCarrera() {
        // `per_500m` es la unidad del remo. Usarla como ritmo por km daría un
        // reparto absurdo, así que baja de peldaño y todos pesan igual.
        let legs: [RunLeg] = [
            leg(.distance(m: 1000), target: .hrZone(4),
                resolved: banda(fast: 110, slow: 115, unidad: "per_500m")),
            leg(.duration(s: 60), kind: .recovery),
        ]
        XCTAssertEqual(FormaDelAro.fase(legs: legs, indice: 0)?.arcos.map(\.peso), [1, 1])
    }

    func testMezclaSinRitmoEscritoRepartePorIgual() {
        // Metros contra segundos no se suman, y no hay ritmo con el que cruzarlos.
        // El aro sigue diciendo el on/off y por dónde vas, que es verdad; no
        // promete una proporción que nadie sabe.
        let legs: [RunLeg] = [
            leg(.distance(m: 1000), target: .hrZone(4)),
            leg(.duration(s: 90), kind: .recovery),
            leg(.distance(m: 1000), target: .hrZone(4)),
        ]
        XCTAssertEqual(FormaDelAro.fase(legs: legs, indice: 1)?.arcos.map(\.peso), [1, 1, 1])
    }

    func testUnTramoQueCierraElAtletaNoRompeElReparto() {
        // Cuestas: 45" arriba, la bajada la cierras tú (medida desconocida).
        let legs: [RunLeg] = [
            leg(.duration(s: 45), target: .rpe(value: 9, min: nil, max: nil)),
            leg(.unknown, kind: .recovery),
            leg(.duration(s: 45), target: .rpe(value: 9, min: nil, max: nil)),
        ]
        let forma = FormaDelAro.fase(legs: legs, indice: 1)
        XCTAssertEqual(forma?.arcos.map(\.peso), [1, 1, 1])
        XCTAssertEqual(forma?.enCurso, 1)
    }

    func testPiramideDibujaSuForma() {
        let distancias = [400, 800, 1200, 800, 400]
        var legs: [RunLeg] = []
        for (i, m) in distancias.enumerated() {
            legs.append(leg(.distance(m: m), target: .hrZone(4)))
            if i < distancias.count - 1 {
                legs.append(leg(.distance(m: 200), kind: .recovery, target: .hrZone(1)))
            }
        }
        XCTAssertEqual(FormaDelAro.fase(legs: legs, indice: 4)?.arcos.map(\.peso),
                       [400, 200, 800, 200, 1200, 200, 800, 200, 400])
    }

    // MARK: - La fase manda

    func testElAroSoloDibujaSuFase() {
        // 10' de calentamiento · 3 × (800 + trote) · 10' de vuelta a la calma.
        var legs: [RunLeg] = [leg(.duration(s: 600), target: .hrZone(2), fase: .warmup)]
        for i in 0..<3 {
            legs.append(leg(.distance(m: 800), target: .hrZone(4)))
            if i < 2 { legs.append(leg(.distance(m: 400), kind: .recovery, target: .hrZone(1))) }
        }
        legs.append(leg(.duration(s: 600), target: .hrZone(2), fase: .cooldown))

        // En el calentamiento no hay estructura que dibujar: es UNA cosa en marcha.
        XCTAssertNil(FormaDelAro.fase(legs: legs, indice: 0))
        XCTAssertNil(FormaDelAro.fase(legs: legs, indice: legs.count - 1))

        // En la principal, el aro son sus cinco tramos — y el índice es RELATIVO.
        let forma = FormaDelAro.fase(legs: legs, indice: 3)   // la segunda de las 800
        XCTAssertEqual(forma?.arcos.count, 5)
        XCTAssertEqual(forma?.enCurso, 2)
        XCTAssertEqual(forma?.arcos.map(\.trabajo), [true, false, true, false, true])
    }

    func testSinTramosNoHayForma() {
        XCTAssertNil(FormaDelAro.fase(legs: [], indice: 0))
        XCTAssertNil(FormaDelAro.fase(legs: seriePorDistancia(), indice: 99))
        XCTAssertNil(FormaDelAro.fase(legs: [leg(.distance(m: 5000))], indice: 0),
                     "un rodaje no es una estructura")
    }
}
