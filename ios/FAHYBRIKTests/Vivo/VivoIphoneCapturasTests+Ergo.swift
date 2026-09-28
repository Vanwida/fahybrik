import XCTest
@testable import FAHYBRIK

// LA FAMILIA ERGO, CAPTURADA — los escenarios del contrato
// `screens/iphone-vivo-ergo` (firmado el 28-09) sobre un motor REAL con los
// planes de `VivoPlanesErgo`. Cada captura lleva el nombre de la del contrato
// (`capturas-final/ergo-*-390.png`) para compararlas una a una. El monitor
// (PM5) entra como entra en la app: por `sampleErg`, la primera muestra ancla
// el tramo (0 m, 0 cal) y la segunda es lo hecho.
extension VivoIphoneCapturasTests {

    private typealias PE = VivoPlanesDePrueba

    /// La banda de pulso enlazada: el chip «Banda» del contrato.
    private static let banda: DeviceLink = .connected(name: "Banda")

    /// El motor en la serie `k` de un plan por series: sin la cuenta del bloque,
    /// cerrando cada serie y cada recuperación anteriores.
    @MainActor
    private func enSerie(_ s: WorkoutSession, _ k: Int) {
        s.primaryAdvance()
        for _ in 0..<(2 * (k - 1)) { s.intervalsBoutDone() }
    }

    /// El monitor enlazado y lo que manda: el ancla del tramo y lo hecho.
    @MainActor
    private func monitor(_ s: WorkoutSession, split: Double, w: Int, spm: Int, m: Double, cal: Int) {
        s.ergConnected = true
        s.sampleErg(paceSecPer500m: split, powerWatts: w, strokeRate: spm, distanceMeters: 0, caloriesKcal: 0)
        s.sampleErg(paceSecPer500m: split, powerWatts: w, strokeRate: spm, distanceMeters: m, caloriesKcal: cal)
    }

    /// El pulso bajando (la recuperación parada): seis muestras, la tendencia ↓.
    @MainActor
    private func pulsoBajando(_ s: WorkoutSession, hasta ppm: Int) {
        for d in stride(from: 10, through: 0, by: -2) { s.injectLiveHR(ppm + d, source: .strap) }
    }

    // MARK: - Remo 5 × 500 m a 1:52–1:56 /500, serie 3/5

    @MainActor
    func testErgoRemoSeriesDentro() throws {
        let s = PE.arranca(try PE.remoSeries())
        enSerie(s, 3)
        captura(s, "ergo-remo-series-dentro", hrLink: Self.banda) { s in
            self.monitor(s, split: 114, w: 238, spm: 28, m: 140, cal: 11)
            s.injectLiveHR(167, source: .strap)
            s.elapsedSeconds = 488
        }
    }

    @MainActor
    func testErgoRemoSeriesLento() throws {
        let s = PE.arranca(try PE.remoSeries())
        enSerie(s, 3)
        captura(s, "ergo-remo-series-lento", hrLink: Self.banda) { s in
            self.monitor(s, split: 120, w: 205, spm: 27, m: 200, cal: 14)
            s.injectLiveHR(169, source: .strap)
            s.elapsedSeconds = 502
        }
    }

    @MainActor
    func testErgoRemoHorizontal() throws {
        let s = PE.arranca(try PE.remoSeries())
        enSerie(s, 3)
        captura(s, "ergo-horizontal", horizontal: true, hrLink: Self.banda) { s in
            self.monitor(s, split: 114, w: 238, spm: 28, m: 140, cal: 11)
            s.injectLiveHR(167, source: .strap)
            s.elapsedSeconds = 482
        }
    }

    // MARK: - La recuperación parada: preaviso, 3-2-1 y GO

    /// Tras la serie 3: el motor en la recuperación con `quedan` segundos.
    @MainActor
    private func enRecuperacion(_ quedan: Double) throws -> WorkoutSession {
        let s = PE.arranca(try PE.remoSeries())
        enSerie(s, 3)
        s.ergConnected = true
        s.intervalsBoutDone()
        s.rotPhaseRemaining = quedan
        return s
    }

    @MainActor
    func testErgoRemoRecupera() throws {
        let s = try enRecuperacion(25)
        captura(s, "ergo-remo-recupera", hrLink: Self.banda) { s in self.pulsoBajando(s, hasta: 121); s.elapsedSeconds = 668 }
    }

    @MainActor
    func testErgoRemoRecuperaPreaviso() throws {
        let s = try enRecuperacion(10.4)
        captura(s, "ergo-remo-recupera-preaviso", hrLink: Self.banda) { s in self.pulsoBajando(s, hasta: 120); s.elapsedSeconds = 682 }
    }

    @MainActor
    func testErgoRemoRecuperaCuenta() throws {
        let s = try enRecuperacion(3.6)
        captura(s, "ergo-remo-recupera-cuenta", espera: 0.5, hrLink: Self.banda) { s in self.pulsoBajando(s, hasta: 119) }
    }

    @MainActor
    func testErgoRemoRecuperaGo() throws {
        let s = try enRecuperacion(1.2)
        captura(s, "ergo-remo-recupera-go", espera: 0.7, hrLink: Self.banda) { s in self.pulsoBajando(s, hasta: 119) }
    }

    // MARK: - SkiErg por calorías, BikeErg por /1000, remo a zona

    @MainActor
    func testErgoSkiCalorias() throws {
        let s = PE.arranca(try PE.skiCalorias())
        enSerie(s, 2)
        captura(s, "ergo-ski-calorias", hrLink: Self.banda) { s in
            self.monitor(s, split: 118, w: 215, spm: 39, m: 190, cal: 15)
            s.injectLiveHR(166, source: .strap)
            s.elapsedSeconds = 180
        }
    }

    @MainActor
    private func continuo(_ s: WorkoutSession, en t: Double) {
        s.primaryAdvance()
        s.lapElapsedSeconds = s.condStartElapsed + t
        s.elapsedSeconds = t
    }

    @MainActor
    func testErgoBiciDentro() throws {
        let s = PE.arranca(try PE.biciContinuo())
        continuo(s, en: 442)
        captura(s, "ergo-bici-continuo-dentro", hrLink: Self.banda) { s in
            self.monitor(s, split: 64, w: 249, spm: 87, m: 3480, cal: 161)
            s.injectLiveHR(157, source: .strap)
        }
    }

    @MainActor
    func testErgoBiciLento() throws {
        let s = PE.arranca(try PE.biciContinuo())
        continuo(s, en: 454)
        captura(s, "ergo-bici-continuo-lento", hrLink: Self.banda) { s in
            self.monitor(s, split: 67.5, w: 211, spm: 85, m: 3570, cal: 142)
            s.injectLiveHR(156, source: .strap)
        }
    }

    @MainActor
    func testErgoRemoZonaDentro() throws {
        let s = PE.arranca(try PE.remoZona())
        continuo(s, en: 614)
        captura(s, "ergo-remo-zona-dentro", hrLink: Self.banda) { s in
            self.monitor(s, split: 129, w: 165, spm: 23, m: 2400, cal: 165)
            s.injectLiveHR(146, source: .strap)
        }
    }

    @MainActor
    func testErgoRemoZonaAlto() throws {
        let s = PE.arranca(try PE.remoZona())
        continuo(s, en: 628)
        captura(s, "ergo-remo-zona-alto", hrLink: Self.banda) { s in
            self.monitor(s, split: 128, w: 169, spm: 22, m: 2450, cal: 169)
            s.injectLiveHR(153, source: .strap)
        }
    }

    // MARK: - El test de 2 km

    @MainActor
    func testErgoTest() throws {
        let s = PE.arranca(try PE.testRemo())
        continuo(s, en: 293)
        captura(s, "ergo-test", test: true, hrLink: Self.banda) { s in
            self.monitor(s, split: 112, w: 250, spm: 30, m: 1308, cal: 105)
            s.injectLiveHR(186, source: .strap)
        }
    }

    // MARK: - La honestidad del dato: máquina perdida, sin máquina

    @MainActor
    func testErgoMaquinaPerdida() throws {
        let s = PE.arranca(try PE.remoSeries())
        enSerie(s, 3)
        let pm5 = PM5ConnectionStore.shared
        defer { pm5.connectionLost = false }
        captura(s, "ergo-maquina-perdida", hrLink: Self.banda) { s in
            self.monitor(s, split: 114, w: 238, spm: 28, m: 170, cal: 12)
            s.lapElapsedSeconds = s.tramoStartElapsed + 35
            s.injectLiveHR(166, source: .strap)
            s.elapsedSeconds = 491
            pm5.connectionLost = true
        }
    }

    @MainActor
    func testErgoRemoSinMaquina() throws {
        let s = PE.arranca(try PE.remoSeries())
        enSerie(s, 3)
        captura(s, "ergo-sin-maquina", hrLink: Self.banda) { s in
            s.ergConnected = false
            s.lapElapsedSeconds = s.tramoStartElapsed + 43
            s.injectLiveHR(168, source: .strap)
            s.elapsedSeconds = 499
        }
    }

    // MARK: - El libre: el mismo remo, la misma pantalla

    @MainActor
    func testErgoLibre() throws {
        let s = PE.arranca(try PE.remoSeriesLibre())
        enSerie(s, 2)
        captura(s, "ergo-libre", hrLink: Self.banda) { s in
            self.monitor(s, split: 113, w: 242, spm: 27, m: 265, cal: 21)
            s.injectLiveHR(166, source: .strap)
            s.elapsedSeconds = 293
        }
    }
}
