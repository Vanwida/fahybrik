import XCTest
@testable import FAHYBRIK

// MISMA CARA · DATOS (FH-30) — «la sesión» tiene que decir lo mismo con el móvil
// que sin él.
//
// El fallo que esto cierra: en espejo correr tenía DOS páginas (Vivo | Controles)
// y sin móvil TRES (Datos | Vivo | Controles); a Datos se le olvidó portarse. Aquí
// se comprueba lo que significa «misma cara» en dato: las dos proyecciones del
// MISMO entreno —el motor (`Entrada(sesion:)`) y la trama con el pulso y los
// metros de la muñeca (`Entrada(trama:)`), viaje de JSON incluido— dan
// exactamente la misma `RodajeDatos.Lectura`. Y que lo que no se sabe no se
// pinta como medida.
@MainActor
final class EspejoDatosMismaCaraTests: XCTestCase {

    private var mirror: PhoneLiveSession { PhoneLiveSession.shared }

    // MARK: - El entreno: un rodaje de calle, con bandas, a 5:00/km de media

    private func zonas() -> HRZoneProfile {
        HRZoneProfile(
            lthrBpm: 170, estimated: true, source: "from_age",
            sourceLabel: "Zonas estimadas por tu edad", confidence: "estimated",
            zones: [
                HRZoneBand(zone: 1, code: "Z1", label: "Recuperación", minBpm: nil, maxBpm: 138, rangeLabel: "< 138 ppm"),
                HRZoneBand(zone: 2, code: "Z2", label: "Aeróbico suave", minBpm: 139, maxBpm: 150, rangeLabel: "139–150 ppm"),
                HRZoneBand(zone: 3, code: "Z3", label: "Aeróbico intenso", minBpm: 151, maxBpm: 160, rangeLabel: "151–160 ppm"),
                HRZoneBand(zone: 4, code: "Z4", label: "Umbral", minBpm: 162, maxBpm: 173, rangeLabel: "162–173 ppm"),
                HRZoneBand(zone: 5, code: "Z5", label: "VO₂ máx", minBpm: 175, maxBpm: 196, rangeLabel: "> 175 ppm"),
            ]
        )
    }

    /// Rodaje libre ya arrancado, con el reloj parado para que las dos lecturas
    /// que se comparan miren el mismo instante.
    private func rodaje(zonas: HRZoneProfile?) -> WorkoutSession {
        let seg = WorkoutSegment(order: 1, title: "Rodaje", kind: .running,
                                 blockTitle: "Rodaje", blockPosition: 1, prescription: nil)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Rodaje", format: .steady, estimatedDurationSeconds: 1_800,
            blockContext: "Libre", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, demoVideoUrl: nil, warmupChecklist: []), hrZones: zonas)
        s.start(); s.beginBlock(); s.stop()
        return s
    }

    /// El viaje entero del cable, bytes incluidos.
    private func tramaEnLaMuneca(_ s: WorkoutSession) throws -> MirrorStateFrame {
        let bytes = try MirrorWire.encoder.encode(mirror.buildFrame(from: s))
        return try MirrorWire.decoder.decode(MirrorStateFrame.self, from: bytes)
    }

    /// Lo que la muñeca sabe por SÍ MISMA: metros de Apple, pulso del sensor y su
    /// zona contra las bandas del atleta. En el mismo entreno son los mismos
    /// números que ve el motor; por el cable sólo viaja el reloj de la sesión.
    private func enEspejo(_ s: WorkoutSession, metros: Double?, desdeTrama: TimeInterval = 0) throws -> RodajeDatos.Lectura {
        RodajeDatos.lectura(.init(
            trama: try tramaEnLaMuneca(s),
            desdeTrama: desdeTrama,
            metrosApple: metros,
            bpm: s.liveHRBpm,
            zona: s.liveZone
        ))
    }

    private func enSolitario(_ s: WorkoutSession) -> RodajeDatos.Lectura {
        RodajeDatos.lectura(.init(sesion: s))
    }

    // MARK: - Las dos vías, la misma lectura

    func testElMismoRodajeEnEspejoEsLaMismaCaraQueSinMovil() throws {
        let s = rodaje(zonas: zonas())
        s.injectLiveHR(148, source: .healthkit)
        s.sampleRunDistance(deltaMeters: 2_500, source: .healthkit)
        s.elapsedSeconds = 750
        let solo = enSolitario(s)

        XCTAssertEqual(try enEspejo(s, metros: s.liveRunDistanceMeters), solo,
                       "el espejo pinta otra cosa que el solitario con el MISMO entreno")
        // Y es la sesión de verdad, no una lectura vacía que también coincide.
        XCTAssertEqual(solo.tiempo.cifra, WatchFormat.clock(750))
        XCTAssertEqual(solo.distancia.cifra, WatchDistancia.cifra(2_500))
        XCTAssertEqual(solo.distancia.unidad, "km")
        XCTAssertEqual(solo.ritmo.cifra, WatchFormat.pace(300))
        XCTAssertEqual(solo.ritmo.unidad, Formato.UnidadRitmo.porKm.rawValue)
        XCTAssertEqual(solo.pulso.cifra, "148")
        XCTAssertEqual(solo.pulso.chip, "Z2 suave")
        XCTAssertNil(solo.nota, "con zona no hay nada que explicar")
    }

    func testSinGPSLasDosViasCallanLaDistanciaYElRitmo() throws {
        let s = rodaje(zonas: zonas())
        s.injectLiveHR(140, source: .healthkit)
        s.elapsedSeconds = 95
        let solo = enSolitario(s)
        XCTAssertNil(s.liveRunDistanceMeters, "el motor no ha contado nada todavía")
        XCTAssertEqual(try enEspejo(s, metros: nil), solo)
        XCTAssertEqual(solo.distancia.cifra, RodajeDatos.sinDato)
        XCTAssertEqual(solo.ritmo.cifra, RodajeDatos.sinDato)
    }

    func testSinBandasLasDosViasDanLaMismaNotaYNingunChip() throws {
        let s = rodaje(zonas: nil)
        s.injectLiveHR(151, source: .healthkit)
        s.sampleRunDistance(deltaMeters: 800, source: .healthkit)
        s.elapsedSeconds = 240
        let solo = enSolitario(s)
        XCTAssertEqual(try enEspejo(s, metros: s.liveRunDistanceMeters), solo)
        XCTAssertEqual(solo.nota, WatchNota.sinAncla)
        XCTAssertEqual(solo.pulso.cifra, "151")
        XCTAssertNil(solo.pulso.chip)
    }

    /// El reloj de la trama se re-basa en local entre tramas: la lectura con 5 s de
    /// envejecimiento es la de la trama MÁS 5 s, y nada más cambia.
    func testElRelojDeLaTramaSeRebasaEnLocal() throws {
        let s = rodaje(zonas: zonas())
        s.elapsedSeconds = 100
        let fresca = try enEspejo(s, metros: nil)
        let envejecida = try enEspejo(s, metros: nil, desdeTrama: 5)
        XCTAssertEqual(fresca.tiempo.cifra, WatchFormat.clock(100))
        XCTAssertEqual(envejecida.tiempo.cifra, WatchFormat.clock(105))
        XCTAssertEqual(fresca.distancia, envejecida.distancia)
    }

    // MARK: - Lo que no se sabe no se pinta como medida

    private func lee(segundos: Double, metros: Double? = nil, bpm: Int? = nil, zona: HRZone? = nil) -> RodajeDatos.Lectura {
        RodajeDatos.lectura(.init(segundos: segundos, metros: metros, bpm: bpm, zona: zona))
    }

    /// El cable no distingue «cero metros contados» de «sin contar»: el cero de
    /// `owner.distanceMeters` no se pinta como «0 m».
    func testCeroMetrosNoSePintaComoMedida() {
        let l = lee(segundos: 30, metros: 0)
        XCTAssertEqual(l.distancia.cifra, RodajeDatos.sinDato)
        XCTAssertEqual(l.distancia.unidad, "")
        XCTAssertEqual(l.ritmo.cifra, RodajeDatos.sinDato)
    }

    func testUnRitmoAbsurdoNoSePinta() {
        // 50 m en una hora: 20 minutos por km no es correr, es un sensor parado.
        let l = lee(segundos: 3_600, metros: 50)
        XCTAssertEqual(l.distancia.cifra, "50", "la distancia sí es una medida")
        XCTAssertEqual(l.ritmo.cifra, RodajeDatos.sinDato)
        XCTAssertEqual(l.ritmo.unidad, "")
    }

    func testUnRitmoConMetrosDeSensorArrancandoNoSePinta() {
        // 4 m en 1 s saldrían a 4:10/km y parecerían una medida.
        XCTAssertEqual(lee(segundos: 1, metros: 4).ritmo.cifra, RodajeDatos.sinDato)
        XCTAssertNotEqual(lee(segundos: 3, metros: RunLegDisplay.minMetersForPace).ritmo.cifra,
                          RodajeDatos.sinDato)
    }

    func testUnTiempoNegativoNoSeAtraviesaComoNegativo() {
        XCTAssertEqual(lee(segundos: -3).tiempo.cifra, WatchFormat.clock(0))
    }

    func testSinPulsoNoHayChipAunqueHayaZona() {
        let l = lee(segundos: 60, bpm: nil, zona: .z3)
        XCTAssertEqual(l.pulso.cifra, RodajeDatos.sinDato)
        XCTAssertNil(l.pulso.chip)
    }

    func testLasCuatroFilasSonLasDeLaLamina() {
        XCTAssertEqual(lee(segundos: 60).filas.map(\.etiqueta),
                       ["tiempo", "distancia", "ritmo medio", "pulso"])
    }

    // MARK: - El pager

    func testCorriendoHayTresPaginasYElRestoDos() {
        XCTAssertEqual(RodajePagina.existentes(esLamina: true), [.datos, .vivo, .controles])
        XCTAssertEqual(RodajePagina.existentes(esLamina: false), [.vivo, .controles])
        XCTAssertEqual(RodajePagina.existentes(esLamina: true).map(\.punto), [0, 1, 2])
    }

    /// HYROX: pasas de un tramo de carrera (lámina) a una estación (no lo es)
    /// con Datos abierto → vuelves a Vivo en vez de quedarte en una página que ya
    /// no existe.
    func testSiLaModalidadCambiaConDatosAbiertoSeVuelveAVivo() {
        XCTAssertEqual(RodajePagina.valida(.datos, esLamina: false, atenuado: false), .vivo)
        XCTAssertEqual(RodajePagina.valida(.controles, esLamina: false, atenuado: false), .controles)
        XCTAssertEqual(RodajePagina.valida(.datos, esLamina: true, atenuado: false), .datos)
    }

    func testConLaMunecaBajadaCorriendoSeVuelveAVivo() {
        for actual in [RodajePagina.datos, .controles, .vivo] {
            XCTAssertEqual(RodajePagina.valida(actual, esLamina: true, atenuado: true), .vivo)
        }
        // Y sólo corriendo: el resto del espejo no cambia.
        XCTAssertEqual(RodajePagina.valida(.controles, esLamina: false, atenuado: true), .controles)
    }

    // MARK: - El encabezado de Controles

    func testElEncabezadoDeControlesDiceDondeEstasYElReloj() {
        var v = RodajeLamina.Ventana()
        XCTAssertEqual(RodajeLamina.encabezadoControles(v, sesionS: 754), "rodaje · \(WatchFormat.clock(754))")
        v.esSerie = true; v.serieN = 3; v.serieTotal = 6
        XCTAssertEqual(RodajeLamina.encabezadoControles(v, sesionS: 754), "serie 3 de 6 · \(WatchFormat.clock(754))")
        v.enPausa = true
        XCTAssertEqual(RodajeLamina.encabezadoControles(v, sesionS: 754), "en pausa · \(WatchFormat.clock(754))")
    }

    // MARK: - Las medidas de Controles

    private typealias Medidas = RodajeControlesMedidas

    /// Con sitio de sobra: las medidas ideales y el pie.
    func testConSitioDeSobraLosBotonesSonLosIdealesYHayPie() {
        let d = Medidas.distribuir(disponible: 220, extras: 0, pie: true)
        XCTAssertEqual(d, Medidas.ideal)
    }

    /// Un 46 mm: cabe el pie sin bajar de los suelos, y los botones se reparten
    /// lo que queda.
    func testEnUn46mmCabenLosDosBotonesYElPie() {
        let d = Medidas.distribuir(disponible: 130, extras: 0, pie: true)
        XCTAssertTrue(d.muestraPie)
        XCTAssertLessThanOrEqual(Medidas.suma(d, extras: 0) + Medidas.altoPie, 130.0001)
        XCTAssertGreaterThanOrEqual(d.pausar, Medidas.suelo.pausar)
        XCTAssertGreaterThanOrEqual(d.terminar, Medidas.suelo.terminar)
    }

    /// Un SE de 40 mm: el pie es información, no un mando — se cae antes que
    /// quitarle sitio a Terminar. Y los botones caben enteros, sin corte.
    func testEnUnSE40mmSeCaeElPieAntesQueUnBoton() {
        let d = Medidas.distribuir(disponible: 105, extras: 0, pie: true)
        XCTAssertFalse(d.muestraPie)
        XCTAssertLessThanOrEqual(Medidas.suma(d, extras: 0), 105.0001)
        XCTAssertGreaterThanOrEqual(d.terminar, Medidas.suelo.terminar)
    }

    /// Nunca por debajo del suelo táctil: si no caben, la página se recorre.
    func testNuncaPorDebajoDelSueloTactil() {
        let d = Medidas.distribuir(disponible: 30, extras: 2, pie: true)
        XCTAssertEqual(d.pausar, Medidas.suelo.pausar)
        XCTAssertEqual(d.extra, Medidas.suelo.extra)
        XCTAssertEqual(d.terminar, Medidas.suelo.terminar)
        XCTAssertFalse(d.muestraPie)
    }
}
