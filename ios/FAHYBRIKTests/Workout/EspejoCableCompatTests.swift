import XCTest
@testable import FAHYBRIK

// EL CABLE NUEVO Y SU COMPATIBILIDAD (F2). Matriz móvil viejo/nuevo × reloj viejo/nuevo:
//
//   · móvil VIEJO + reloj NUEVO → sin plan ni cursor: el reloj no inventa, cae a lo de hoy.
//   · móvil NUEVO + reloj VIEJO → sigue rellenando `tramo` y lo demás; el viejo ignora lo nuevo.
//   · móvil NUEVO + reloj NUEVO → plan + cursor: el cuadro es el del solitario (`EspejoCuadroMismoTests`).
//
// Más lo que el cable prometió: un plan cambiado reemplaza al anterior, un cursor con una
// huella desconocida pide el plan y no pinta, con plan vivo el reloj nuevo ignora el
// háptico del móvil, el plan más grande de correr cabe en el canal, y los comandos nuevos.
@MainActor
final class EspejoCableCompatTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba
    private let base = Date(timeIntervalSinceReferenceDate: 800_000_000)

    private func sesion(_ plan: WorkoutPlan, entorno: RunEnvironment = .outdoor) -> WorkoutSession {
        let s = EscenarioCorrer.enElPaso(plan, entorno: entorno, pasos: 1)
        s.stop()
        return s
    }

    private func viaje<T: Codable>(_ v: T) throws -> T {
        try MirrorWire.decoder.decode(T.self, from: MirrorWire.encoder.encode(v))
    }

    /// Una trama VIEJA tal como la escribía el móvil antes de F2: ni `cursor` ni `capacidades`.
    /// (Las claves son las de un móvil real de una serie de calle con su tramo, su forma y su entorno.)
    private let tramaVieja = Data(#"""
    {"phase":"active","blockTitle":"Series","lineTitle":"1000 m","detailLine":"3:45–3:55 /km","progressText":"SERIE 2/6",
     "sessionElapsed":845.5,"lapElapsed":62,"countdownRemaining":null,"targetZone":4,"isFinalStep":false,
     "hapticCue":"go","hapticSeq":7,"runEnvironment":"outdoor",
     "tramo":{"formato":"intervals","modalidad":"run","etiqueta":"Series","dosis":"1000 m","rondaN":2,"rondaTotal":6,
              "enDescanso":false,"cierre":"machineGoal","objetivoMedida":1000,"hechoMedida":340,"objetivoEsCalorias":false,
              "enTramoS":62,"ritmoSecPorKm":231,"objetivoLabel":"3:45–3:55","objetivoEstado":"tooFast","zonaViva":4,
              "tareaEsErgo":false,"recuperacionEnMovimiento":false,
              "forma":[{"trabajo":true,"peso":1},{"trabajo":false,"peso":0.4}],"formaIndice":0,"parte":"main"}}
    """#.utf8)

    // MARK: - Móvil viejo + reloj nuevo

    func testMovilViejoRelojNuevoNoHayCuadroYLaCaraDeSiempreSigueIgual() throws {
        let f = try MirrorWire.decoder.decode(MirrorStateFrame.self, from: tramaVieja)
        XCTAssertNil(f.cursor)
        XCTAssertNil(f.capacidades)
        // La cara de hoy sigue funcionando con esa trama: la misma puerta y la misma lámina.
        XCTAssertTrue(GuionDelEspejo.esRodajeLamina(f))
        _ = RodajeLamina.lectura(RodajeLamina.Ventana(trama: f, elapsed: 0))

        var espejo = Vivo.EspejoMuneca()
        espejo.recibirTrama(f, en: base)
        XCTAssertEqual(espejo.estado, .sinPlan)
        XCTAssertNil(espejo.cuadro(ahora: base), "sin plan ni cursor no se inventa un cuadro: la vista cae a la cara vieja")
        XCTAssertFalse(espejo.dirigeElPlan)
        XCTAssertNil(espejo.planAPedir(en: base), "un móvil viejo no tiene plan que pedirle")
        XCTAssertEqual(espejo.hapticAplicable(f), "go", "sin plan vivo el háptico del móvil sigue valiendo")
    }

    func testUnPlanSinCursorTampocoPintaNada() throws {
        var espejo = Vivo.EspejoMuneca()
        let s = sesion(try P.seisPorMilCompleto())
        espejo.recibirPlan(MirrorPlanVivo(plan: Vivo.planDe(s), entorno: .outdoor))
        espejo.recibirTrama(try MirrorWire.decoder.decode(MirrorStateFrame.self, from: tramaVieja), en: base)
        XCTAssertEqual(espejo.estado, .sinCursor)
        XCTAssertNil(espejo.cuadro(ahora: base))
    }

    // MARK: - Móvil nuevo + reloj viejo

    /// El reloj viejo, congelado: lo que leía de una trama antes de F2. Si esto decodifica una
    /// trama nueva y da lo mismo, el reloj viejo no se entera de nada de lo nuevo.
    private struct TramaDelRelojViejo: Decodable {
        let phase: String
        let lineTitle: String?
        let sessionElapsed: Double
        let lapElapsed: Double
        let hapticCue: String?
        let tramo: MirrorTramo?
        let runEnvironment: RunEnvironment?
    }

    func testMovilNuevoRelojViejoSigueRellenandoTramoYElViejoIgnoraLoNuevo() throws {
        let s = sesion(try P.seisPorMilCompleto())
        let nueva = PhoneLiveSession.shared.buildFrame(from: s)
        XCTAssertNotNil(nueva.cursor, "el móvil nuevo manda cursor")
        XCTAssertNotNil(nueva.tramo, "y sigue rellenando `tramo` para el reloj viejo")
        XCTAssertEqual(nueva.tramo?.modalidad, PrescriptionModality.run.rawValue)

        let bytes = try MirrorWire.encoder.encode(nueva)
        let viejo = try JSONDecoder().decode(TramaDelRelojViejo.self, from: bytes)
        XCTAssertEqual(viejo.phase, nueva.phase)
        XCTAssertEqual(viejo.lineTitle, nueva.lineTitle)
        XCTAssertEqual(viejo.tramo, nueva.tramo)
        XCTAssertEqual(viejo.runEnvironment, .outdoor)

        // Y el sobre `plan`: un tipo que el viejo no conoce viaja en el mismo sobre y se ignora.
        let sobre = try XCTUnwrap(MirrorEnvelope.encoding(type: MirrorWire.MessageType.plan,
                                                           MirrorPlanVivo(plan: Vivo.planDe(s), entorno: .outdoor)))
        let recibido = try XCTUnwrap(MirrorEnvelope.decoding(sobre))
        XCTAssertEqual(recibido.type, "plan")
        XCTAssertFalse([MirrorWire.MessageType.frame, MirrorWire.MessageType.end, MirrorWire.MessageType.haptic].contains(recibido.type),
                       "el reloj viejo cae al `default: break` de `handleRemote`")
    }

    func testLasTramasNuevasSinPlanNoLlevanCursorNiCapacidades() throws {
        // Una trama construida sin plan (no cabe en el canal, o quien la monta no lo pasa) es la de siempre.
        let s = sesion(try P.seisPorMilCompleto())
        let sin = PhoneMirrorFrameBuilder.buildFrame(
            from: s, context: PhoneMirrorFrameContext(isTreadmillLive: { false }, hapticCue: nil, hapticSeq: nil))
        XCTAssertNil(sin.cursor)
        XCTAssertNil(sin.capacidades)
        let json = try XCTUnwrap(String(data: try MirrorWire.encoder.encode(sin), encoding: .utf8))
        XCTAssertFalse(json.contains("cursor"))
        XCTAssertFalse(json.contains("capacidades"))
    }

    // MARK: - Móvil nuevo + reloj nuevo: la huella empareja plan y cursor

    private func tramaNueva(_ s: WorkoutSession) throws -> MirrorStateFrame {
        try viaje(PhoneLiveSession.shared.buildFrame(from: s))
    }

    func testElCursorDelMovilApuntaAlPlanQueElMovilManda() throws {
        let s = sesion(try P.seisPorMilCompleto())
        let plan = MirrorPlanVivo(plan: Vivo.planDe(s), entorno: s.runEnvironment)
        let f = try tramaNueva(s)
        XCTAssertEqual(f.cursor?.planHash, plan.planHash, "la huella es determinista: el mismo plan, la misma huella")
        XCTAssertEqual(f.cursor?.i, 1)
        XCTAssertEqual(f.capacidades, [MirrorWire.Capacidad.vuelta], "solo se anuncia lo que el motor atiende")
        var espejo = Vivo.EspejoMuneca()
        espejo.recibirPlan(try viaje(plan))
        espejo.recibirTrama(f, en: base)
        XCTAssertEqual(espejo.estado, .vivo)
        XCTAssertNotNil(espejo.cuadro(ahora: base))
    }

    func testUnPlanDistintoTieneOtraHuellaYReemplazaAlAnterior() throws {
        let s = sesion(try P.seisPorMilCompleto())
        let a = MirrorPlanVivo(plan: Vivo.planDe(s), entorno: .outdoor)
        var zonas = a.plan
        zonas.zonas = Vivo.ZonasCoach(techos: [120, 140, 155, 170, 190], nombres: nil)
        let b = MirrorPlanVivo(plan: zonas, entorno: .outdoor)
        XCTAssertNotEqual(a.planHash, b.planHash)
        XCTAssertNotEqual(a.planHash, MirrorPlanVivo(plan: Vivo.planDe(s), entorno: .treadmill).planHash, "el entorno cuenta")

        var espejo = Vivo.EspejoMuneca()
        espejo.recibirPlan(a)
        let f = try tramaNueva(s)                 // apunta a `a`
        espejo.recibirTrama(f, en: base)
        XCTAssertEqual(espejo.estado, .vivo)
        espejo.recibirPlan(b)                     // el móvil cambió el plan (otras zonas)
        XCTAssertEqual(espejo.plan?.planHash, b.planHash, "el plan nuevo reemplaza al anterior")
        XCTAssertEqual(espejo.estado, .planDesconocido(hash: a.planHash),
                       "hasta la próxima trama (que ya apuntará a `b`) el cursor viejo no pinta")
        XCTAssertNil(espejo.cuadro(ahora: base))
    }

    func testUnaTramaConUnaHuellaDesconocidaNoPintaYPideElPlanUnaSolaVez() throws {
        let s = sesion(try P.seisPorMilCompleto())
        var f = try tramaNueva(s)
        f.cursor = MirrorCursor(planHash: "ffff", i: 1, enPasoS: 10, sesionS: 10, pausado: false)
        var espejo = Vivo.EspejoMuneca()
        espejo.recibirTrama(f, en: base)
        XCTAssertEqual(espejo.estado, .planDesconocido(hash: "ffff"))
        XCTAssertNil(espejo.cuadro(ahora: base), "no inventa: sin el plan no hay cuadro")
        XCTAssertEqual(espejo.planAPedir(en: base), "ffff", "lo pide")
        XCTAssertNil(espejo.planAPedir(en: base.addingTimeInterval(1)), "y solo una vez: cada trama no es otra petición")
        XCTAssertEqual(espejo.planAPedir(en: base.addingTimeInterval(MirrorWire.planReenvioMinS + 0.1)), "ffff",
                       "pasado el margen, sin respuesta, otra vez")
        // Llega el plan de esa huella (lo simulamos con el real) → ya pinta.
        let real = MirrorPlanVivo(plan: Vivo.planDe(s), entorno: .outdoor)
        f.cursor = MirrorCursor(planHash: real.planHash, i: 1, enPasoS: 10, sesionS: 10, pausado: false)
        espejo.recibirTrama(f, en: base)
        espejo.recibirPlan(real)
        XCTAssertNotNil(espejo.cuadro(ahora: base))
        XCTAssertNil(espejo.planAPedir(en: base.addingTimeInterval(60)))
    }

    func testConPlanVivoElRelojNuevoIgnoraElHapticDelMovil() throws {
        let s = sesion(try P.seisPorMilCompleto())
        var f = try tramaNueva(s)
        f.hapticCue = MirrorWire.HapticCue.go
        f.hapticSeq = 3
        var espejo = Vivo.EspejoMuneca()
        XCTAssertEqual(espejo.hapticAplicable(f), "go", "sin plan vivo, vale (un móvil viejo, o aún sin plan)")
        espejo.recibirPlan(MirrorPlanVivo(plan: Vivo.planDe(s), entorno: .outdoor))
        espejo.recibirTrama(f, en: base)
        XCTAssertTrue(espejo.dirigeElPlan)
        XCTAssertNil(espejo.hapticAplicable(f), "con plan vivo el director de la muñeca manda: si no, vibraría dos veces")
    }

    // MARK: - El cursor y el plan, en bytes

    func testUnCursorAntiguoOIncompletoSeLeeConSusDefectos() throws {
        let json = Data(#"{"planHash":"ab","i":2,"enPasoS":3.5,"sesionS":100,"pausado":false,"algoDelFuturo":{"x":1}}"#.utf8)
        let c = try MirrorWire.decoder.decode(MirrorCursor.self, from: json)
        XCTAssertEqual(c, MirrorCursor(planHash: "ab", i: 2, enPasoS: 3.5, sesionS: 100, pausado: false))
        XCTAssertFalse(c.terminado)
        XCTAssertFalse(c.parado)
        XCTAssertNil(c.hecho)
        // Lo que es su defecto no se escribe: el cursor pesa lo que dice.
        let escrito = try XCTUnwrap(String(data: try MirrorWire.encoder.encode(c), encoding: .utf8))
        XCTAssertFalse(escrito.contains("terminado"))
        XCTAssertFalse(escrito.contains("hecho"))
    }

    func testUnPlanSinReglasNiUmbralesSeEntiendeConLosDelDefecto() throws {
        let s = sesion(try P.seisPorMilCompleto())
        let completo = MirrorPlanVivo(plan: Vivo.planDe(s), entorno: .outdoor)
        let bytes = try MirrorWire.encoder.encode(completo)
        var objeto = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        objeto.removeValue(forKey: "reglas")
        objeto.removeValue(forKey: "umbrales")
        objeto["campoNuevoDeUnMovilFuturo"] = 1
        let recortado = try JSONSerialization.data(withJSONObject: objeto)
        let leido = try MirrorWire.decoder.decode(MirrorPlanVivo.self, from: recortado)
        XCTAssertEqual(leido, completo)
    }

    /// EL PESO. Apple: 100 KB en cualquier ventana de 10 s (`HKWorkoutSession.h`). Las tramas van a
    /// ≤ 1 por segundo; el plan es lo grande y va una vez. El más grande de correr tiene que caber en un
    /// cuarto de la ventana, o el móvil no lo manda (y la muñeca cae a la cara de siempre).
    func testElPlanMasGrandeDeCorrerCabeEnElCanal() throws {
        let sesiones: [(String, WorkoutPlan)] = [
            ("491", try P.sesion491()), ("494", try P.sesion494()), ("509", try P.sesion509()), ("535", try P.sesion535()),
            ("538", try P.sesion538Carrera()), ("551", try P.sesion551()), ("552", try P.sesion552()), ("573", try P.sesion573()),
            ("479", try P.sesion479Correr()), ("6×1000", try P.seisPorMilCompleto()), ("tempo cinta", try P.tempoCinta()),
        ]
        var mayor = ("", 0)
        var informe: [String] = []
        for (nombre, plan) in sesiones {
            let s = EscenarioCorrer.enElPaso(plan, entorno: .outdoor, pasos: 1)
            s.stop()
            let mensaje = MirrorPlanVivo(plan: Vivo.planDe(s), entorno: .outdoor)
            let bytes = try XCTUnwrap(MirrorEnvelope.encoding(type: MirrorWire.MessageType.plan, mensaje)).count
            informe.append("\(nombre): \(mensaje.pasos.count) pasos, \(bytes) B")
            if bytes > mayor.1 { mayor = (nombre, bytes) }
            XCTAssertLessThanOrEqual(bytes, MirrorWire.Presupuesto.planMaxBytes, "\(nombre) no cabe en el canal")
        }
        // Y la trama con cursor, la que va cada segundo.
        let s = sesion(try P.sesion509())
        let trama = try XCTUnwrap(MirrorEnvelope.encoding(type: MirrorWire.MessageType.frame, PhoneLiveSession.shared.buildFrame(from: s))).count
        let sinCursor = try XCTUnwrap(MirrorEnvelope.encoding(
            type: MirrorWire.MessageType.frame,
            PhoneMirrorFrameBuilder.buildFrame(from: s, context: PhoneMirrorFrameContext(isTreadmillLive: { false }, hapticCue: nil, hapticSeq: nil)))).count
        informe.append("trama con cursor: \(trama) B (sin cursor \(sinCursor) B; el cursor pesa \(trama - sinCursor) B)")
        // La peor ventana de 10 s: 10 tramas + el plan más grande + un reenvío.
        let peor = 10 * trama + 2 * mayor.1
        informe.append("peor ventana de 10 s: \(peor) B de \(MirrorWire.Presupuesto.bytesPorVentana) B")
        XCTAssertLessThan(peor, MirrorWire.Presupuesto.bytesPorVentana)
        print("PESO DEL CABLE · " + informe.joined(separator: " · "))
    }

    // MARK: - Cuándo se manda el plan

    func testElPlanSeMandaAlAtarseCuandoCambiaYCuandoLaMunecaLoPide() throws {
        let feed = PhoneMirrorPlanFeed()
        let s = sesion(try P.seisPorMilCompleto())
        let t0 = base
        let primero = try XCTUnwrap(feed.pendienteDeEnvio(para: s, ahora: t0), "canal nuevo: hay que mandarlo")
        feed.marcarEnviado(primero, ahora: t0)
        XCTAssertNil(feed.pendienteDeEnvio(para: s, ahora: t0.addingTimeInterval(1)), "mandado y sin cambios: nada")

        feed.pedirReenvio()
        XCTAssertNil(feed.pendienteDeEnvio(para: s, ahora: t0.addingTimeInterval(1)), "la petición no rompe el presupuesto: espera")
        let reenvio = try XCTUnwrap(feed.pendienteDeEnvio(para: s, ahora: t0.addingTimeInterval(MirrorWire.planReenvioMinS)))
        feed.marcarEnviado(reenvio, ahora: t0.addingTimeInterval(MirrorWire.planReenvioMinS))
        XCTAssertNil(feed.pendienteDeEnvio(para: s, ahora: t0.addingTimeInterval(60)))

        s.runEnvironment = .indoor                // cambia el entorno → otra huella
        let cambiado = try XCTUnwrap(feed.pendienteDeEnvio(para: s, ahora: t0.addingTimeInterval(61)))
        XCTAssertNotEqual(cambiado.planHash, primero.planHash)
        feed.marcarEnviado(cambiado, ahora: t0.addingTimeInterval(61))

        feed.olvidarEnvio()                       // otra muñeca, otro canal
        XCTAssertNotNil(feed.pendienteDeEnvio(para: s, ahora: t0.addingTimeInterval(62)))
    }

    // MARK: - Los comandos nuevos

    func testNewLapSeRelayaAlMotorYLosDemasComandosNuevosQuedanConSuTodo() throws {
        let seg = WorkoutSegment(order: 1, title: "Rodaje", kind: .running,
                                 blockTitle: "Rodaje", blockPosition: 1, prescription: nil)
        let s = WorkoutSession(plan: WorkoutPlan(
            id: UUID(), name: "Rodaje", format: .steady, estimatedDurationSeconds: 1_800,
            blockContext: "Libre", zoneTargets: [], equipment: [], segments: [seg],
            coachNote: nil, demoVideoUrl: nil, warmupChecklist: []))
        s.start(); s.beginBlock(); s.stop()
        let antes = s.laps.count
        XCTAssertEqual(PhoneMirrorCommandRelay.aplicar(MirrorWire.CommandKind.newLap, a: s), .aplicado)
        XCTAssertEqual(s.laps.count, antes + 1, "la vuelta de la muñeca llegó al motor (deuda FH-30)")

        for kind in [MirrorWire.CommandKind.undo, MirrorWire.CommandKind.plus30, MirrorWire.CommandKind.vozMuneca] {
            guard case .pendiente = PhoneMirrorCommandRelay.aplicar(kind, a: s) else { return XCTFail("\(kind) debería estar pendiente") }
        }
        XCTAssertEqual(PhoneMirrorCommandRelay.aplicar("otraCosa", a: s), .ajeno)
        XCTAssertEqual(s.laps.count, antes + 1, "los pendientes no tocan el motor")
        XCTAssertFalse(PhoneMirrorFrameBuilder.capacidades.contains(MirrorWire.Capacidad.deshacer))
        XCTAssertFalse(PhoneMirrorFrameBuilder.capacidades.contains(MirrorWire.Capacidad.mas30))
    }
}
