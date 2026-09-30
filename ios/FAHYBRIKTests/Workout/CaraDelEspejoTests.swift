import XCTest
@testable import FAHYBRIK

// QUÉ CARA PINTA EL ESPEJO: la pila nueva de la muñeca o lo que la pila no cubre. La decisión es
// una función pura (`CaraDelEspejo.decide`), así que se prueba sin SwiftUI ni reloj:
//
//   · pila SOLO con cuadro + un paso que la pila cubre + una fase que la pila cubre;
//   · móvil viejo, plan aún sin llegar, otra huella, lista de movilidad, puerta de bloque y
//     guardando → sin pila (la puerta, la lista o «Grabando en la muñeca»);
//   · las transiciones (un paso cubierto, una lista, el fin del entreno);
//   · que «hay cuadro» (`estado == .vivo`) y «el espejo da un cuadro» son lo mismo.
@MainActor
final class CaraDelEspejoTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba
    private let base = Date(timeIntervalSinceReferenceDate: 800_000_000)

    /// Una trama como la escribe el móvil: solo cambia la fase.
    private func trama(fase: String = MirrorWire.Phase.active) throws -> MirrorStateFrame {
        let json = #"""
        {"phase":"\#(fase)","blockTitle":"Series","lineTitle":"1000 m","detailLine":"3:45–3:55 /km","progressText":"SERIE 2/6",
         "sessionElapsed":845.5,"lapElapsed":62,"countdownRemaining":null,"targetZone":4,"isFinalStep":false}
        """#
        return try MirrorWire.decoder.decode(MirrorStateFrame.self, from: Data(json.utf8))
    }

    private func decide(espejo: Vivo.EspejoMuneca.Estado = .vivo, frame: MirrorStateFrame?, cubre: Bool = true,
                        terminando: Bool = false) -> CaraDelEspejo {
        CaraDelEspejo.decide(espejo: espejo, frame: frame, cubre: cubre, terminando: terminando)
    }

    // MARK: - Cuándo manda la pila

    func testUnPasoQueLaPilaCubreConCuadroPintaLaPila() throws {
        XCTAssertEqual(decide(frame: try trama()), .muneca)
    }

    func testLasFasesQueLaPilaCubreYLaPuertaDeBloqueQueNo() throws {
        for fase in [MirrorWire.Phase.active, MirrorWire.Phase.paused, MirrorWire.Phase.countIn, MirrorWire.Phase.finished] {
            XCTAssertEqual(decide(frame: try trama(fase: fase)), .muneca, "\(fase): el cuadro trae la pausa, el 3-2-1 y el «completada»")
        }
        XCTAssertEqual(decide(frame: try trama(fase: MirrorWire.Phase.gate)), .sinPila, "la puerta de un bloque no es de la pila")
        XCTAssertEqual(decide(frame: try trama(fase: "faseDeUnFuturo")), .sinPila, "una fase que no conoce no la pinta la pila")
    }

    // MARK: - Cuándo no hay pila (y no inventa)

    func testSinCuadroNoHayPila() throws {
        let f = try trama()
        XCTAssertEqual(decide(espejo: .sinPlan, frame: f), .sinPila, "móvil viejo: ni plan ni cursor")
        XCTAssertEqual(decide(espejo: .sinCursor, frame: f), .sinPila, "plan sin cursor en las tramas")
        XCTAssertEqual(decide(espejo: .planDesconocido(hash: "ffff"), frame: f), .sinPila, "cursor de un plan que la muñeca no tiene")
        XCTAssertEqual(decide(frame: nil), .sinPila, "aún no ha llegado ninguna trama")
    }

    func testGuardandoManda() throws {
        XCTAssertEqual(decide(frame: try trama(), terminando: true), .sinPila, "«Guardando…» no es de la pila")
    }

    func testUnaListaDeMovilidadNoLaPintaLaPila() throws {
        XCTAssertEqual(decide(frame: try trama(), cubre: false), .sinPila)
    }

    // MARK: - Transiciones

    /// Un paso cubierto, una lista, otra vez un paso cubierto, la puerta del siguiente bloque y el fin.
    func testElEntrenoVaYVieneEntreLaPilaYLoQueLaPilaNoCubre() throws {
        let recorrido: [(String, Bool, CaraDelEspejo)] = [
            (MirrorWire.Phase.active, true, .muneca),     // un paso de la pila
            (MirrorWire.Phase.active, false, .sinPila),   // una lista de movilidad
            (MirrorWire.Phase.active, true, .muneca),     // otro paso
            (MirrorWire.Phase.paused, true, .muneca),     // pausa: el cuadro la trae
            (MirrorWire.Phase.gate, true, .sinPila),      // puerta del siguiente bloque
            (MirrorWire.Phase.finished, true, .muneca),
        ]
        for (fase, cubre, esperada) in recorrido {
            XCTAssertEqual(decide(frame: try trama(fase: fase), cubre: cubre), esperada, "\(fase) cubre=\(cubre)")
        }
    }

    // MARK: - «Hay cuadro» = «el espejo da un cuadro»

    private func sesion() throws -> WorkoutSession {
        let s = EscenarioCorrer.enElPaso(try P.seisPorMilCompleto(), entorno: .outdoor, pasos: 1)
        s.stop()
        return s
    }

    private func viaje<T: Codable>(_ v: T) throws -> T {
        try MirrorWire.decoder.decode(T.self, from: MirrorWire.encoder.encode(v))
    }

    func testEstadoVivoEsExactamenteCuandoElEspejoDaCuadroYPaso() throws {
        let s = try sesion()
        let plan = MirrorPlanVivo(plan: Vivo.planDe(s), entorno: s.runEnvironment)
        let f = try viaje(PhoneLiveSession.shared.buildFrame(from: s))
        var espejo = Vivo.EspejoMuneca()
        func coherente(_ etiqueta: String, file: StaticString = #filePath, line: UInt = #line) {
            let hay = espejo.cuadro(ahora: base) != nil
            XCTAssertEqual(espejo.estado == .vivo, hay, "\(etiqueta): estado ↔ cuadro", file: file, line: line)
            XCTAssertEqual(espejo.pasoVivo != nil, hay, "\(etiqueta): paso ↔ cuadro", file: file, line: line)
        }
        coherente("nada")                       // sinPlan
        espejo.recibirPlan(plan)
        coherente("solo plan")                  // sinCursor
        espejo.recibirTrama(f, en: base)
        coherente("plan + cursor")              // vivo
        XCTAssertEqual(espejo.pasoVivo?.id, plan.pasos[f.cursor?.i ?? 0].id, "el paso vivo es el del cursor")
        var desconocida = f
        desconocida.cursor = MirrorCursor(planHash: "ffff", i: 1, enPasoS: 1, sesionS: 1, pausado: false)
        espejo.recibirTrama(desconocida, en: base)
        coherente("otra huella")                // planDesconocido
        espejo.recibirTrama(try trama(), en: base)  // sin cursor (un móvil viejo)
        coherente("trama sin cursor")
    }

    /// Con un espejo real, la decisión da la pila en una sesión de correr y nada sin plan.
    func testConUnEspejoRealLaDecisionSigueAlCuadro() throws {
        let s = try sesion()
        let f = try viaje(PhoneLiveSession.shared.buildFrame(from: s))
        var espejo = Vivo.EspejoMuneca()
        XCTAssertEqual(decide(espejo: espejo.estado, frame: f, cubre: espejo.cubreLaMuneca), .sinPila, "sin plan aún")
        espejo.recibirPlan(try viaje(MirrorPlanVivo(plan: Vivo.planDe(s), entorno: s.runEnvironment)))
        espejo.recibirTrama(f, en: base)
        XCTAssertEqual(decide(espejo: espejo.estado, frame: f, cubre: espejo.cubreLaMuneca), .muneca)
    }
}
