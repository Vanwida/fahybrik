import XCTest
@testable import FAHYBRIK

// MISMA CARA (FH-30) — la serie de calle en espejo tiene que ser la MISMA
// pantalla que sin móvil, no una parecida.
//
// El fallo que esto cierra: `esRodajeLamina` cortaba por `rondaTotal <= 1`, así
// que la lámina sólo la veía un rodaje de corrido. Toda serie de calle —la del
// coach («3x1000m», `sets`) y la del constructor libre («5 × 500 m», `intervals`)—
// caía al reparto viejo y el atleta veía DOS pantallas distintas del mismo
// entreno según llevara el móvil encima. Y el móvil lo lleva el 90 % de los días.
//
// Lo que se comprueba aquí y no en un test de la trama: que las DOS proyecciones
// —el motor (`Ventana(sesion:)`) y el cable (`Ventana(trama:)`)— dan la misma
// `RodajeLamina.Lectura` para el mismo entreno, viaje de JSON incluido. Es la
// única afirmación que significa «misma cara»: comparar campo a campo dos
// pantallas pintadas no lo caza, porque las dos compilan.
@MainActor
final class EspejoLaminaMismaCaraTests: XCTestCase {

    private var mirror: PhoneLiveSession { PhoneLiveSession.shared }

    // MARK: - El entreno: 5 × 500 m a 4:50-5:10/km con 90 s de trote, en la calle

    private func work(_ m: RunSegmentMeasure, _ t: RunSegmentTarget? = nil) -> RunElement {
        .segment(RunSegment(kind: .work, measure: m, target: t, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: nil))
    }

    private func rec(_ m: RunSegmentMeasure, _ mode: RunRecoveryMode) -> RunElement {
        .segment(RunSegment(kind: .recovery, measure: m, target: nil, resolved: nil,
                            inclinePct: nil, cadenceSpm: nil, recoveryMode: mode))
    }

    /// 5 × 500 m con trote de 90 s entre series, ya arrancada y con el 3-2-1
    /// saltado: el cursor está en la serie 1. El reloj se para para que las dos
    /// lecturas que se comparan miren el mismo instante.
    private func seriesDeCalle() -> WorkoutSession {
        var elementos: [RunElement] = []
        for i in 0..<5 {
            elementos.append(work(.distance(m: 500),
                                  .pace(valueS: 300, minS: 290, maxS: 310)))
            if i < 4 { elementos.append(rec(.duration(s: 90), .trote)) }
        }
        let rx = Prescription(scheme: .intervals, modality: .run, sets: nil, rounds: nil,
                              workS: nil, restS: nil, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil,
                              structure: [RunPhase(role: .main, elements: elementos)])
        let seg = WorkoutSegment(order: 1, title: "Correr · 5×500m", kind: .running,
                                 blockTitle: "Correr · 5×500m", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Correr · 5×500m", format: .intervals,
            estimatedDurationSeconds: 900, blockContext: "Libre", zoneTargets: [],
            equipment: [], segments: [seg], coachNote: nil, demoVideoUrl: nil,
            warmupChecklist: []))
        s.start()          // arma la puerta del bloque
        s.beginBlock()     // la cruza → arranca la estructura (3-2-1 + serie 1 cebada)
        s.primaryAdvance() // salta el 3-2-1 → dentro de la serie 1
        s.stop()           // mata el timer; el cursor se queda donde está
        return s
    }

    /// El viaje entero del cable, bytes incluidos: lo que el móvil escribe es lo
    /// que la muñeca lee, o se cae aquí y no en el gimnasio.
    private func tramaEnLaMuneca(_ s: WorkoutSession) throws -> MirrorStateFrame {
        let enviada = mirror.buildFrame(from: s)
        let bytes = try MirrorWire.encoder.encode(enviada)
        return try MirrorWire.decoder.decode(MirrorStateFrame.self, from: bytes)
    }

    private func caraEnSolitario(_ s: WorkoutSession) -> RodajeLamina.Lectura {
        RodajeLamina.lectura(RodajeLamina.Ventana(sesion: s))
    }

    private func caraEnEspejo(_ f: MirrorStateFrame) -> RodajeLamina.Lectura {
        RodajeLamina.lectura(RodajeLamina.Ventana(trama: f, elapsed: 0))
    }

    // MARK: - La puerta: quién pinta la lámina

    func testLaSerieDeCalleEntraEnLaLaminaAunqueCuenteRondas() throws {
        let f = try tramaEnLaMuneca(seriesDeCalle())
        XCTAssertEqual(f.tramo?.rondaTotal, 5, "el cable manda la cuenta de series")
        XCTAssertTrue(GuionDelEspejo.esRodajeLamina(f),
                      "la serie de calle caía fuera de la lámina por contar rondas")
    }

    func testElRodajeDeCorridoSigueEntrandoEnLaLamina() throws {
        let seg = WorkoutSegment(order: 1, title: "Rodaje", kind: .running,
                                 blockTitle: "Rodaje", blockPosition: 1, prescription: nil)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Rodaje", format: .steady, estimatedDurationSeconds: 1_800,
            blockContext: "Libre", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, demoVideoUrl: nil, warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()
        XCTAssertTrue(GuionDelEspejo.esRodajeLamina(try tramaEnLaMuneca(s)))
    }

    /// EL FORMATO MANDA PRIMERO. Un EMOM de cinta y una estación de correr de una
    /// ruta son del reloj de pared y de la ruta: su sujeto es el crono del
    /// formato, no los metros de la pieza. Robárselos a la lámina era el agujero
    /// que abría ampliar la puerta a toda la modalidad de correr.
    func testElEmomDeCorrerNoSeLoRobaLaLamina() {
        XCTAssertFalse(GuionDelEspejo.esRodajeLamina(
            trama(formato: PrescriptionScheme.emom.rawValue, rondaTotal: 12)))
    }

    func testLaEstacionDeCorrerDeUnaRutaNoSeLaRobaLaLamina() {
        for formato: PrescriptionScheme in [.forTime, .chipper, .hyroxSim, .rounds, .ladder] {
            XCTAssertFalse(GuionDelEspejo.esRodajeLamina(
                trama(formato: formato.rawValue, rondaTotal: 8)),
                "\(formato.rawValue) es una ruta, no una lámina de correr")
        }
    }

    func testLoQueNoEsCorrerNuncaEsLamina() {
        XCTAssertFalse(GuionDelEspejo.esRodajeLamina(
            trama(formato: PrescriptionScheme.sets.rawValue,
                  modalidad: PrescriptionModality.strength.rawValue, rondaTotal: 4)))
        var sinTramo = trama(formato: nil, rondaTotal: 1)
        sinTramo.tramo = nil
        XCTAssertFalse(GuionDelEspejo.esRodajeLamina(sinTramo))
    }

    // MARK: - La cara: las dos vías, la misma lectura

    func testLaSerieEnEspejoEsLaMismaCaraQueSinMovil() throws {
        let s = seriesDeCalle()
        s.sampleRunDistance(deltaMeters: 180, source: .healthkit)
        let f = try tramaEnLaMuneca(s)

        let espejo = caraEnEspejo(f)
        XCTAssertEqual(espejo, caraEnSolitario(s),
                       "el espejo pinta otra cosa que el solitario con el MISMO entreno")
        // Y es la lámina de SERIE, no la de rodaje: el sujeto son los metros que
        // faltan de ESTA serie y el contexto dice por cuál va.
        XCTAssertEqual(espejo.contexto, "serie 1 de 5 · te quedan")
        XCTAssertEqual(espejo.sujeto, "320")
        XCTAssertEqual(espejo.unidad, "m")
    }

    func testLaRecuperacionEnEspejoEsLaMismaCaraQueSinMovil() throws {
        let s = seriesDeCalle()
        s.sampleRunDistance(deltaMeters: 500, source: .healthkit)
        s.primaryAdvance()   // «tramo hecho» → el trote de vuelta
        s.stop()
        XCTAssertEqual(s.currentRunLeg?.isWork, false, "el motor no entró en la recuperación")

        let f = try tramaEnLaMuneca(s)
        let espejo = caraEnEspejo(f)
        XCTAssertEqual(espejo, caraEnSolitario(s))
        XCTAssertEqual(espejo.contexto, "recupera · viene la 2")
        XCTAssertEqual(espejo.etiquetaSegundo, "luego")
        XCTAssertEqual(espejo.nota, "toca · empezar ya")
        XCTAssertTrue(espejo.notaEnTinta)
        XCTAssertTrue(espejo.toca, "la oferta de empezar ya sin poder tocar es una mentira")
    }

    /// LA REGRESIÓN, EN UNA LÍNEA: antes de esto la serie en espejo no era una
    /// lámina de serie sino la lectura de un rodaje («rodaje · llevas»).
    func testLaSerieEnEspejoYaNoSePintaComoUnRodaje() throws {
        let s = seriesDeCalle()
        s.sampleRunDistance(deltaMeters: 120, source: .healthkit)
        let espejo = caraEnEspejo(try tramaEnLaMuneca(s))
        XCTAssertFalse(espejo.contexto.hasPrefix("rodaje"))
    }

    /// Un bloque rotatorio con una pieza de correr TAMBIÉN manda `rondaTotal > 1`
    /// y en solitario NO es una serie: se pinta como rodaje. Sin la marca de
    /// carrera estructurada (`parte`) la lámina volvería a separar las dos caras
    /// por el otro lado.
    func testUnaRondaQueNoEsCarreraEstructuradaSePintaComoRodaje() {
        var f = tramaVacia()
        f.tramo = tramoDeCorrer(rondaN: 3, rondaTotal: 6, estructurada: false)
        let cara = RodajeLamina.lectura(RodajeLamina.Ventana(trama: f, elapsed: 0))
        XCTAssertTrue(cara.contexto.hasPrefix("rodaje"))
        XCTAssertFalse(cara.toca, "sin estructura no hay tramo que cerrar desde la muñeca")
    }

    /// El suelo de honestidad del ritmo (§7) vive en la LECTURA, así que lo
    /// aplican las dos vías: el cable manda el ritmo del accesor del motor, que
    /// sólo lleva el techo, y en los primeros metros de cada tramo eso pintaba un
    /// ritmo donde el solitario callaba.
    func testUnRitmoSinMetrosSuficientesNoSePinta() {
        var f = tramaVacia()
        f.tramo = tramoDeCorrer(rondaTotal: 5, hechoMedida: 4, ritmoSecPorKm: 250)
        XCTAssertNil(RodajeLamina.lectura(RodajeLamina.Ventana(trama: f, elapsed: 0)).ritmo)
    }

    // MARK: - Tramas de laboratorio

    private func tramaVacia() -> MirrorStateFrame {
        MirrorStateFrame(
            phase: MirrorWire.Phase.active, blockTitle: "Bloque", lineTitle: nil,
            detailLine: nil, progressText: nil, sessionElapsed: 0, lapElapsed: 0,
            countdownRemaining: nil, targetZone: nil, isFinalStep: nil, restRemaining: nil
        )
    }

    private func tramoDeCorrer(
        formato: String? = PrescriptionScheme.intervals.rawValue,
        modalidad: String? = PrescriptionModality.run.rawValue,
        rondaN: Int = 1,
        rondaTotal: Int,
        hechoMedida: Double? = nil,
        ritmoSecPorKm: Int? = nil,
        estructurada: Bool = true
    ) -> MirrorTramo {
        var t = MirrorTramo(
            formato: formato, modalidad: modalidad,
            etiqueta: "Correr", dosis: "500 m", rondaN: rondaN, rondaTotal: rondaTotal,
            enDescanso: false, cierre: "machineGoal", objetivoMedida: 500,
            hechoMedida: hechoMedida, objetivoEsCalorias: false,
            ventanaQueda: nil, ventanaTotal: nil, enTramoS: 30,
            ritmoSecPorKm: ritmoSecPorKm, objetivoLabel: nil, objetivoEstado: nil,
            zonaViva: nil, siguiente: nil, cargaKg: nil, reps: nil
        )
        // La marca de carrera estructurada en el cable — la escribe el motor
        // desde `currentRunLeg`, y sin ella la pieza es un rodaje.
        t.parte = estructurada ? RunPhaseRole.main.rawValue : nil
        return t
    }

    private func trama(
        formato: String?,
        modalidad: String = PrescriptionModality.run.rawValue,
        rondaTotal: Int
    ) -> MirrorStateFrame {
        var f = tramaVacia()
        f.tramo = tramoDeCorrer(formato: formato, modalidad: modalidad, rondaTotal: rondaTotal)
        return f
    }
}
