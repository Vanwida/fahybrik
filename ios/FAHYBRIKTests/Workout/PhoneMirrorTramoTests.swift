import XCTest
@testable import FAHYBRIK

// EL TRAMO EN EL CABLE — lo que la muñeca necesita para elegir guion y pintar el
// sujeto del formato, en vez de las tres frases redactadas que viajaban antes.
//
// Por qué existe este fichero, y es la razón que da nombre al caso de abajo: un
// cable es un contrato con dos implementaciones, y el compilador no ve un valor
// BIEN FORMADO Y EQUIVOCADO. El ritmo medio del segmento mandado donde tocaba el
// del tramo, o «lo cierras tú» mandado en una serie que cierra un hito, pasan las
// dos por un `Double?` y un `String?` perfectamente válidos — y en la muñeca se
// convierten en un sujeto distinto. Sólo los caza afirmar la trama contra una
// sesión real.
//
// Se verifica en el lado del TELÉFONO porque no hay target de tests de watchOS.
@MainActor
final class PhoneMirrorTramoTests: XCTestCase {

    private var mirror: PhoneMirrorService { PhoneMirrorService.shared }

    // MARK: - El caso real: «Correr · Series» del constructor de entreno libre

    /// 5 × 500 m con 1:30 de descanso a 5:00/km, arrancado desde el móvil. Es
    /// EXACTAMENTE lo que salió mal en el gimnasio: la muñeca enseñaba el crono de
    /// la sesión, «RONDA 1/5» y un botón que ponía «Terminar».
    private func seriesLibres() -> WorkoutSession {
        let set = PrescriptionSet(measure: .distance(meters: 500),
                                  target: .pace(unit: .perKm, valueS: 300, minS: nil, maxS: nil),
                                  modality: .run, restS: 90, tempo: nil, note: nil)
        let rx = Prescription(scheme: .intervals, modality: .run,
                              sets: Array(repeating: set, count: 5),
                              rounds: 5, workS: nil, restS: 90, totalS: nil,
                              target: nil, note: nil, start: nil, increment: nil, structure: nil)
        let seg = WorkoutSegment(order: 1, title: "Correr · 5×500m", kind: .running,
                                 blockTitle: "Correr · 5×500m", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Correr · 5×500m", format: .intervals,
            estimatedDurationSeconds: 900, blockContext: "Libre", zoneTargets: [],
            equipment: [], segments: [seg], coachNote: nil, demoVideoUrl: nil,
            warmupChecklist: []))
        s.start()
        s.beginBlock()
        s.stop()
        return s
    }

    func testSeriesDeCorrerViajanComoTramoConSuFormatoYSuModalidad() {
        let f = mirror.buildFrame(from: seriesLibres())
        let t = try? XCTUnwrap(f.tramo)
        XCTAssertNotNil(t, "sin tramo la muñeca no puede elegir guion y cae en genérico")
        XCTAssertEqual(f.tramo?.formato, PrescriptionScheme.intervals.rawValue)
        // El formato solo no basta: unas series de remo son el mismo `intervals`
        // y otra pantalla, porque el reloj no mide la máquina.
        XCTAssertEqual(f.tramo?.modalidad, PrescriptionModality.run.rawValue)
    }

    /// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. `cierre` salía de
    /// `ErgCounterPolicy`, que resuelve el contador del PM5 y devuelve `athleteTap`
    /// para todo lo que no sea un ergo. Con eso, una serie de 500 m corriendo —
    /// que cierra el hito de distancia — viajaba como «la cierras tú» y la muñeca
    /// cambiaba el sujeto: en vez de los metros que FALTAN pintaba los que LLEVAS,
    /// y ofrecía un toque para cerrar que no hace ninguna falta.
    func testUnaSerieConHitoDeDistanciaNoViajaComoCierreDelAtleta() {
        let f = mirror.buildFrame(from: seriesLibres())
        XCTAssertEqual(f.tramo?.cierre, "machineGoal")
        XCTAssertEqual(f.tramo?.objetivoMedida, 500)
    }

    /// La ronda del tramo va en DATO, no dentro de «RONDA 1/5». Sin ella la muñeca
    /// no puede escribir «Serie 1 / 5» en su contexto ni segmentar el aro.
    func testLaRondaViajaEnDatoYNoSoloEnLaFrase() {
        let f = mirror.buildFrame(from: seriesLibres())
        XCTAssertEqual(f.tramo?.rondaN, 1)
        XCTAssertEqual(f.tramo?.rondaTotal, 5)
        XCTAssertEqual(f.tramo?.enDescanso, false)
    }

    /// La dosis del tramo EN CURSO, no la del bloque plegado. El título plegado
    /// («Correr · 5×500m») es el mismo los cinco tramos, y por eso la muñeca
    /// llevaba veinte minutos diciendo lo mismo.
    func testLaDosisEsLaDelTramoEnCursoYNoLaDelBloquePlegado() {
        let f = mirror.buildFrame(from: seriesLibres())
        let dosis = f.tramo?.dosis ?? ""
        XCTAssertFalse(dosis.isEmpty, "sin dosis la muñeca no sabe qué toca ahora")
        XCTAssertNotEqual(dosis, f.blockTitle)
    }

    // MARK: - Fuerza: la serie EN CURSO, no la primera

    /// Un 4×10 mandaba la primera serie congelada dentro de `detailLine` las cuatro
    /// veces. La carga y las reps del set que toca ahora tienen que viajar sueltas.
    func testFuerzaMandaLaCargaDeLaSerieEnCurso() {
        let sets = (0..<4).map { _ in
            PrescriptionSet(measure: .reps(10), target: .kg(value: 60, min: nil, max: nil),
                            modality: .strength, restS: 90, tempo: nil, note: nil)
        }
        let rx = Prescription(scheme: .sets, modality: .strength, sets: sets, rounds: nil,
                              workS: nil, restS: 90, totalS: nil, target: nil, note: nil,
                              start: nil, increment: nil, structure: nil)
        let seg = WorkoutSegment(order: 1, title: "Press banca", kind: .strength,
                                 blockTitle: "Fuerza", blockPosition: 1, prescription: rx)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Fuerza", format: .sets, estimatedDurationSeconds: 900,
            blockContext: "Fuerza", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, demoVideoUrl: nil, warmupChecklist: []))
        s.start()
        s.beginBlock()
        s.stop()

        let f = mirror.buildFrame(from: s)
        XCTAssertEqual(f.tramo?.formato, PrescriptionScheme.sets.rawValue)
        XCTAssertEqual(f.tramo?.cargaKg, 60)
        XCTAssertEqual(f.tramo?.reps, 10)
    }

    // MARK: - La clave estructural

    /// Un cambio de ronda tiene que forzar trama nueva al instante; el ritmo, que
    /// corre solo, NO — si entrara, cada segundo mandaría una trama y el canal se
    /// inunda (el reloj tickea en local entre tramas).
    func testElCambioDeRondaEsEstructuralYElRitmoNo() {
        let base = mirror.buildFrame(from: seriesLibres())
        guard let t = base.tramo else { return XCTFail("sin tramo") }

        var otraRonda = base
        otraRonda.tramo = MirrorTramo(
            formato: t.formato, modalidad: t.modalidad, etiqueta: t.etiqueta, dosis: t.dosis,
            rondaN: (t.rondaN ?? 1) + 1, rondaTotal: t.rondaTotal, enDescanso: t.enDescanso,
            cierre: t.cierre, objetivoMedida: t.objetivoMedida, hechoMedida: t.hechoMedida,
            ventanaQueda: t.ventanaQueda, ventanaTotal: t.ventanaTotal, enTramoS: t.enTramoS,
            ritmoSecPorKm: t.ritmoSecPorKm, objetivoLabel: t.objetivoLabel,
            objetivoEstado: t.objetivoEstado, zonaViva: t.zonaViva, siguiente: t.siguiente,
            cargaKg: t.cargaKg, reps: t.reps)
        XCTAssertNotEqual(mirror.structuralKey(base), mirror.structuralKey(otraRonda))

        var otroRitmo = base
        otroRitmo.tramo = MirrorTramo(
            formato: t.formato, modalidad: t.modalidad, etiqueta: t.etiqueta, dosis: t.dosis,
            rondaN: t.rondaN, rondaTotal: t.rondaTotal, enDescanso: t.enDescanso,
            cierre: t.cierre, objetivoMedida: t.objetivoMedida, hechoMedida: t.hechoMedida,
            ventanaQueda: t.ventanaQueda, ventanaTotal: t.ventanaTotal, enTramoS: t.enTramoS,
            ritmoSecPorKm: (t.ritmoSecPorKm ?? 300) + 7, objetivoLabel: t.objetivoLabel,
            objetivoEstado: t.objetivoEstado, zonaViva: t.zonaViva, siguiente: t.siguiente,
            cargaKg: t.cargaKg, reps: t.reps)
        XCTAssertEqual(mirror.structuralKey(base), mirror.structuralKey(otroRitmo))
    }

    /// Un reloj anterior a este cambio (o una trama sin tramo) tiene que seguir
    /// decodificando: el campo es aditivo y opcional.
    func testUnaTramaSinTramoSigueSiendoValida() {
        var f = mirror.buildFrame(from: seriesLibres())
        f.tramo = nil
        let data = try? MirrorWire.encoder.encode(f)
        XCTAssertNotNil(data)
        XCTAssertNil(try? MirrorWire.decoder.decode(MirrorStateFrame.self, from: data ?? Data()).tramo)
    }
}
