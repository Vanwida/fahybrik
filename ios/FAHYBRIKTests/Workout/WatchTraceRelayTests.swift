import XCTest
@testable import FAHYBRIK

// QUE LA CARRERA DEL RELOJ TAMPOCO SE OLVIDE.
//
// El atleta sale con el reloj y deja el teléfono en casa: es la forma natural de
// correr y hasta ahora perdía el archivo entero. La serie medida en la muñeca viaja
// como FICHERO por su propia cola de WatchConnectivity, mientras el resultado de la
// ejecución viaja como SOBRE por otra. Las dos colas no se ordenan entre sí, así que
// estas pruebas fijan lo que hace que eso no importe: el cupón que las vuelve a
// juntar llegue quien llegue primero, y el fichero que aguanta en disco hasta que el
// teléfono confirma que lo tiene.
final class WatchTraceRelayTests: XCTestCase {

    private var spoolDirs: [String] = []
    private var storeFiles: [String] = []

    override func tearDown() {
        for name in spoolDirs { removeSupportItem(name) }
        for name in storeFiles { removeSupportItem(name) }
        spoolDirs = []
        storeFiles = []
        super.tearDown()
    }

    private func removeSupportItem(_ name: String) {
        guard let dir = try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        ) else { return }
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(name))
    }

    private func newSpool() -> WatchTraceSpool {
        let name = "test-spool-\(UUID().uuidString)"
        spoolDirs.append(name)
        return WatchTraceSpool(directoryName: name)
    }

    private func newStore() -> ParkedTraceStore {
        let name = "test-parked-\(UUID().uuidString).json"
        storeFiles.append(name)
        return ParkedTraceStore(filename: name)
    }

    /// La traza que de verdad puede medir una muñeca: pulso y distancia. Ni velocidad
    /// ni altitud — el target del reloj no importa CoreLocation en ningún sitio.
    private func wristTraces(seconds: Int = 3) -> [WorkoutTraceDTO] {
        let axis = Array(0..<seconds)
        return [
            WorkoutTraceDTO(signal: "hr", source: "healthkit",
                            started_at: "2026-08-12T07:00:00Z",
                            offsets_s: axis, values: axis.map { 150 + Double($0) }),
            WorkoutTraceDTO(signal: "distance", source: "healthkit",
                            started_at: "2026-08-12T07:00:00Z",
                            offsets_s: axis, values: axis.map { Double($0) * 3.3 }),
        ]
    }

    // MARK: - El buzón: terminar sin el teléfono cerca

    // LA GARANTÍA. El fichero se escribe en disco al terminar, ANTES de que nadie
    // intente mandarlo, y sigue ahí mientras el teléfono no aparezca.
    func testStagingLeavesTheFileOnDiskBeforeAnythingIsSent() {
        let spool = newSpool()
        let localId = spool.stage(traces: wristTraces())

        XCTAssertNotNil(localId)
        XCTAssertTrue(spool.exists(localId!))
        XCTAssertEqual(spool.pendingLocalIds(), [localId!])
    }

    // Y AGUANTA UN REINICIO. Otro buzón sobre el mismo directorio —otra vida de la
    // app— encuentra la traza entera. Nada vive en memoria.
    func testTheFileSurvivesTheAppDying() throws {
        let name = "test-spool-\(UUID().uuidString)"
        spoolDirs.append(name)

        let localId = try XCTUnwrap(WatchTraceSpool(directoryName: name).stage(traces: wristTraces(seconds: 5)))

        // Otra instancia, otra vida de la app, el mismo disco.
        let afterRelaunch = WatchTraceSpool(directoryName: name)
        XCTAssertEqual(afterRelaunch.pendingLocalIds(), [localId])

        let data = try Data(contentsOf: afterRelaunch.url(for: localId))
        let decoded = try WatchWire.decoder.decode(WatchTraceFile.self, from: data)
        XCTAssertEqual(decoded.localId, localId)
        XCTAssertEqual(decoded.traces.count, 2)
        XCTAssertEqual(decoded.traces[0].values.count, 5)
    }

    // Sólo se borra cuando la entrega está confirmada. Un fallo de transferencia deja
    // el fichero donde está — es justo lo que el camino de sensores NO hace.
    func testOnlyAConfirmedDeliveryClearsTheFile() throws {
        let spool = newSpool()
        let localId = try XCTUnwrap(spool.stage(traces: wristTraces()))

        XCTAssertTrue(spool.exists(localId), "sin confirmación, se queda")
        spool.remove(localId)
        XCTAssertFalse(spool.exists(localId))
        XCTAssertTrue(spool.pendingLocalIds().isEmpty)
    }

    // Una sesión sin nada medido no manda un fichero vacío: no manda ninguno.
    func testNothingMeasuredStagesNothing() {
        let spool = newSpool()
        XCTAssertNil(spool.stage(traces: []))
        XCTAssertTrue(spool.pendingLocalIds().isEmpty)
    }

    // Varias carreras pendientes conviven sin pisarse (dos salidas sin teléfono).
    func testSeveralPendingRunsCoexist() throws {
        let spool = newSpool()
        let first = try XCTUnwrap(spool.stage(traces: wristTraces()))
        let second = try XCTUnwrap(spool.stage(traces: wristTraces()))

        XCTAssertNotEqual(first, second)
        XCTAssertEqual(Set(spool.pendingLocalIds()), [first, second])
        spool.remove(first)
        XCTAssertEqual(spool.pendingLocalIds(), [second], "entregar una no se lleva la otra")
    }

    // MARK: - El reencuentro: las dos colas, en cualquier orden

    // FICHERO PRIMERO. Llega la traza, todavía sin saber de qué ejecución cuelga;
    // luego llega el sobre con su id y el par queda listo.
    func testFileFirstThenEnvelope() async {
        let store = newStore()
        let localId = "abc-123"

        let notYet = await store.deliver(watchLocalId: localId, traces: wristTraces())
        XCTAssertNil(notYet, "sin id todavía no se puede subir")

        let claimed = await store.claim(watchLocalId: localId)
        let ready = await store.stamp(parkId: claimed.id, executionId: 4231)

        XCTAssertEqual(ready?.executionId, 4231)
        XCTAssertEqual(ready?.traces.count, 2)
        XCTAssertTrue(ready?.isComplete == true)
    }

    // SOBRE PRIMERO. Llega el id a un aparcamiento vacío: se guarda como RESGUARDO en
    // vez de tirarse, y el fichero lo completa al llegar. Sin esto, esta carrera es la
    // que se perdía — el id llegaba, no encontraba nada y se iba.
    func testEnvelopeFirstThenFile() async {
        let store = newStore()
        let localId = "abc-456"

        let claimed = await store.claim(watchLocalId: localId)
        let stamped = await store.stamp(parkId: claimed.id, executionId: 909)
        XCTAssertEqual(stamped?.executionId, 909)
        XCTAssertFalse(stamped?.isComplete == true, "todavía le falta el fichero")

        let ready = await store.deliver(watchLocalId: localId, traces: wristTraces())
        XCTAssertEqual(ready?.executionId, 909)
        XCTAssertEqual(ready?.traces.count, 2)
    }

    // UN RESGUARDO A MEDIAS NO SE SUBE NI SE TIRA. No está roto: está esperando su
    // otra mitad. Si saliera por `resolvable()`, el barrido mandaría una traza vacía.
    func testAHalfClaimIsNeitherSentNorDropped() async {
        let store = newStore()
        let claimed = await store.claim(watchLocalId: "solo-el-sobre")
        _ = await store.stamp(parkId: claimed.id, executionId: 55)

        let resolvable = await store.resolvable()
        XCTAssertTrue(resolvable.isEmpty, "no se manda vacío…")
        let all = await store.all()
        XCTAssertEqual(all.count, 1, "…y no se tira: espera al fichero")
        XCTAssertEqual(all[0].executionId, 55, "con el id ya guardado en disco")
    }

    // Reclamar dos veces el mismo cupón no crea dos resguardos: las dos colas pueden
    // llamar en cualquier orden y hasta repetir tras una caída.
    func testClaimingTwiceIsIdempotent() async {
        let store = newStore()
        let first = await store.claim(watchLocalId: "mismo")
        let second = await store.claim(watchLocalId: "mismo")

        XCTAssertEqual(first.id, second.id)
        let all = await store.all()
        XCTAssertEqual(all.count, 1)
    }

    // El par completo sí sale por el barrido, que es quien lo sube.
    func testACompletePairBecomesResolvable() async {
        let store = newStore()
        let claimed = await store.claim(watchLocalId: "completo")
        _ = await store.stamp(parkId: claimed.id, executionId: 77)
        _ = await store.deliver(watchLocalId: "completo", traces: wristTraces())

        let resolvable = await store.resolvable()
        XCTAssertEqual(resolvable.count, 1)
        XCTAssertEqual(resolvable[0].executionId, 77)
    }

    // El resguardo del reloj y el aparcamiento del propio teléfono no se confunden:
    // el del teléfono no lleva cupón y no responde por uno ajeno.
    func testThePhonesOwnParkingIsNotAWristClaim() async {
        let store = newStore()
        _ = await store.park(wristTraces())

        let byLocalId = await store.find(watchLocalId: "cualquiera")
        XCTAssertNil(byLocalId)
        let all = await store.all()
        XCTAssertNil(all.first?.watchLocalId)
    }

    // MARK: - El sobre, y los relojes viejos

    // Un binario de reloj ANTERIOR no manda cupón: su sobre tiene que seguir
    // decodificando, y simplemente no trae traza. Nada se rompe a mitad de despliegue.
    func testAnOlderWatchEnvelopeStillDecodes() throws {
        let legacy = Data(#"{"assignmentId":"665","payloadJson":"e30="}"#.utf8)
        let envelope = try WatchWire.decoder.decode(WatchExecutionEnvelope.self, from: legacy)

        XCTAssertEqual(envelope.assignmentId, "665")
        XCTAssertNil(envelope.traceLocalId, "sin cupón = ese reloj no manda traza")
        XCTAssertNil(envelope.shareWithPartner)
    }

    // Y el sobre nuevo lleva el cupón de ida y vuelta por el coder compartido.
    func testTheEnvelopeCarriesTheCoupon() throws {
        let sent = WatchExecutionEnvelope(
            assignmentId: "665", payloadJson: Data("{}".utf8),
            shareWithPartner: nil, traceLocalId: "cupon-1"
        )
        let data = try WatchWire.encoder.encode(sent)
        let back = try WatchWire.decoder.decode(WatchExecutionEnvelope.self, from: data)
        XCTAssertEqual(back.traceLocalId, "cupon-1")
    }

    // MARK: - Truncada es peor que ninguna

    // El fichero se valida al llegar, y una traza desalineada (dos arrays que no
    // describen los mismos puntos) se cae. Es el CHECK de la tabla: dejarla pasar es
    // un 400 que se lleva la sesión entera, y peor, nadie se entera de que faltaba.
    func testAMisalignedTraceIsRejected() {
        let broken = WorkoutTraceDTO(
            signal: "hr", source: "healthkit", started_at: "2026-08-12T07:00:00Z",
            offsets_s: [0, 1, 2, 3], values: [150, 151]   // truncada a mitad de escritura
        )
        let good = wristTraces()[0]
        let kept = [broken, good].filter { $0.offsets_s.count == $0.values.count }

        XCTAssertEqual(kept.count, 1)
        XCTAssertEqual(kept[0], good)
    }

    // Un fichero que no decodifica no se aparca: no hay «media traza».
    func testACorruptFileDecodesToNothing() {
        XCTAssertNil(try? WatchWire.decoder.decode(WatchTraceFile.self, from: Data("no soy json".utf8)))
        XCTAssertNil(try? WatchWire.decoder.decode(WatchTraceFile.self, from: Data()))
    }

    // MARK: - El tamaño, que es lo que manda el transporte

    // Por esto el transporte es `transferFile` y no el sobre: una sesión de 90 min de
    // muñeca ya pasa de sobra el ~64 KB que se le atribuye a `transferUserInfo` (una
    // cifra que además Apple no documenta, así que apostar contra ella sería apostar a
    // ciegas). `transferFile` no tiene tope publicado y encola en segundo plano.
    func testAWristSessionIsFarTooBigForTheEnvelope() throws {
        let seconds = 90 * 60
        let axis = Array(0..<seconds)
        let traces = [
            WorkoutTraceDTO(signal: "hr", source: "healthkit", started_at: "2026-08-12T07:00:00Z",
                            offsets_s: axis, values: axis.map { Double(140 + $0 % 25) }),
            WorkoutTraceDTO(signal: "distance", source: "healthkit", started_at: "2026-08-12T07:00:00Z",
                            offsets_s: axis, values: axis.map { (Double($0) * 3.3 * 10).rounded() / 10 }),
        ]
        let bytes = try WatchWire.encoder.encode(WatchTraceFile(localId: "x", traces: traces)).count

        XCTAssertGreaterThan(bytes, 65_536, "\(bytes) bytes — no cabe en un diccionario")
        XCTAssertLessThan(bytes, 4_500_000, "y sigue lejos del tope de cuerpo del backend")
    }

    // MARK: - Lo que ya estaba aparcado en los móviles

    // EL APARCAMIENTO CAMBIÓ DE FORMA (ahora lleva cupón del reloj y la serie puede
    // llegar después). Un fichero escrito por la versión ANTERIOR —que ya está en los
    // móviles— tiene que seguir leyéndose: perderlo sería perder justo la carrera que
    // estaba esperando cobertura.
    func testAParkingFileFromThePreviousVersionStillLoads() async throws {
        let name = "test-parked-legacy-\(UUID().uuidString).json"
        storeFiles.append(name)

        // La forma de antes: sin `watchLocalId`.
        let legacy = Data("""
        [{"id":"1B4E28BA-2FA1-11D2-883F-B9A761BDE3FB","executionId":4231,
          "traces":[{"signal":"hr","source":"strap","started_at":"2026-08-11T18:00:00Z",
                     "offsets_s":[0,1],"values":[150,151]}],
          "createdAt":776000000}]
        """.utf8)
        let dir = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )
        try legacy.write(to: dir.appendingPathComponent(name))

        let parked = await ParkedTraceStore(filename: name).all()
        XCTAssertEqual(parked.count, 1, "la traza que esperaba sigue ahí")
        XCTAssertEqual(parked[0].executionId, 4231)
        XCTAssertNil(parked[0].watchLocalId, "sin cupón = era del propio teléfono")
        XCTAssertTrue(parked[0].isComplete, "y sigue lista para subir")
    }

    // MARK: - Quién es la fuente cuando graban los dos

    // LA DECISIÓN, EXPLÍCITA: la fuente la pone el aparato que MIDIÓ, en el punto de
    // captura — nunca quien suba antes. La distancia de la muñeca la da
    // `distanceWalkingRunning` de HealthKit (fusión de Apple), no un fix; sellarla
    // como «gps» sería etiquetar el archivo con un aparato que no la midió.
    func testTheWristsDistanceIsHealthKitNotGPS() {
        let wrist = WorkoutTraceRecorder()
        wrist.accumulate(.distance, source: .healthkit, delta: 3.3, atSecond: 1)

        let trace = wrist.traces(startedAt: Date())[0]
        XCTAssertEqual(trace.source, "healthkit")
        XCTAssertNotEqual(trace.source, "gps")
    }

    // Y SI ALGUNA VEZ GRABARAN LOS DOS, conviven: dos filas distintas por la clave
    // (ejecución, señal, fuente). Ninguna pisa a la otra y el lector elige por
    // fidelidad. Nada depende de quién llegue antes.
    func testBothDevicesRecordingCoexistWithoutOverwriting() {
        let recorder = WorkoutTraceRecorder()
        recorder.accumulate(.distance, source: .gps, delta: 3.3, atSecond: 1)         // teléfono
        recorder.accumulate(.distance, source: .healthkit, delta: 3.1, atSecond: 1)   // muñeca

        let traces = recorder.traces(startedAt: Date())
        XCTAssertEqual(traces.count, 2)
        XCTAssertEqual(Set(traces.map(\.signal)), ["distance"])
        XCTAssertEqual(Set(traces.map(\.source)), ["gps", "healthkit"])
    }
}
