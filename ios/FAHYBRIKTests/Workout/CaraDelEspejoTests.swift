import XCTest
@testable import FAHYBRIK

// QUÉ CARA PINTA EL ESPEJO (F2b): la pila nueva de la muñeca o todo lo de siempre. La decisión es
// una función pura (`CaraDelEspejo.decide`), así que se prueba sin SwiftUI ni reloj:
//
//   · nueva SOLO con cuadro + correr de corrido + bandera + fase que la cara nueva cubre;
//   · móvil viejo, plan aún sin llegar, otra huella, otra modalidad, dobles, puerta de bloque,
//     guardando y bandera apagada → la de siempre;
//   · las transiciones (HYROX: carrera → estación → carrera; fin del entreno) y que el pager
//     de la cara de siempre no se quede en una página que ya no existe al volver a él;
//   · que «hay cuadro» (`estado == .vivo`) y «el espejo da un cuadro» son lo mismo.
@MainActor
final class CaraDelEspejoTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba
    private let base = Date(timeIntervalSinceReferenceDate: 800_000_000)

    /// Una trama como la escribe el móvil: solo cambia la fase, el tramo (formato y modalidad) y los dobles.
    private func trama(fase: String = MirrorWire.Phase.active, formato: String = "intervals", modalidad: String = "run",
                       dobles: Bool = false) throws -> MirrorStateFrame {
        let relevo = dobles ? #","dobles":{"role":"partner","station":"SkiErg","selfSharePct":50}"# : ""
        let json = #"""
        {"phase":"\#(fase)","blockTitle":"Series","lineTitle":"1000 m","detailLine":"3:45–3:55 /km","progressText":"SERIE 2/6",
         "sessionElapsed":845.5,"lapElapsed":62,"countdownRemaining":null,"targetZone":4,"isFinalStep":false\#(relevo),
         "tramo":{"formato":"\#(formato)","modalidad":"\#(modalidad)","etiqueta":"Series","dosis":"1000 m","rondaN":2,"rondaTotal":6,
                  "enDescanso":false,"cierre":"machineGoal","objetivoMedida":1000,"hechoMedida":340,"objetivoEsCalorias":false,
                  "enTramoS":62,"ritmoSecPorKm":231,"objetivoLabel":"3:45–3:55","objetivoEstado":"tooFast","zonaViva":4,
                  "tareaEsErgo":false,"recuperacionEnMovimiento":false,
                  "forma":[{"trabajo":true,"peso":1},{"trabajo":false,"peso":0.4}],"formaIndice":0,"parte":"main"}}
        """#
        return try MirrorWire.decoder.decode(MirrorStateFrame.self, from: Data(json.utf8))
    }

    private func decide(bandera: Bool = true, espejo: Vivo.EspejoMuneca.Estado = .vivo, frame: MirrorStateFrame?,
                        terminando: Bool = false) -> CaraDelEspejo {
        CaraDelEspejo.decide(bandera: bandera, espejo: espejo, frame: frame, terminando: terminando)
    }

    // MARK: - Cuándo manda la cara nueva

    func testCorrerDeCorridoConCuadroYBanderaPintaLaCaraNueva() throws {
        XCTAssertEqual(decide(frame: try trama()), .muneca)
        // La misma puerta que la lámina de siempre: series de calle y rodaje son ambos correr.
        XCTAssertEqual(decide(frame: try trama(formato: "steady")), .muneca)
        XCTAssertEqual(decide(frame: try trama(formato: "sets")), .muneca)
    }

    func testLasFasesQueLaCaraNuevaCubreYLaPuertaDeBloqueQueNo() throws {
        for fase in [MirrorWire.Phase.active, MirrorWire.Phase.paused, MirrorWire.Phase.countIn, MirrorWire.Phase.finished] {
            XCTAssertEqual(decide(frame: try trama(fase: fase)), .muneca, "\(fase): el cuadro trae la pausa, el 3-2-1 y el «completada»")
        }
        XCTAssertEqual(decide(frame: try trama(fase: MirrorWire.Phase.gate)), .deSiempre, "la puerta de un bloque sigue siendo la de siempre")
        XCTAssertEqual(decide(frame: try trama(fase: "faseDeUnFuturo")), .deSiempre, "una fase que no conoce no la pinta la cara nueva")
    }

    // MARK: - Cuándo cae a la de siempre (y no inventa)

    func testSinBanderaTodoEsComoHoy() throws {
        XCTAssertEqual(decide(bandera: false, frame: try trama()), .deSiempre)
    }

    func testSinCuadroCaeALaDeSiempre() throws {
        let f = try trama()
        XCTAssertEqual(decide(espejo: .sinPlan, frame: f), .deSiempre, "móvil viejo: ni plan ni cursor")
        XCTAssertEqual(decide(espejo: .sinCursor, frame: f), .deSiempre, "plan sin cursor en las tramas")
        XCTAssertEqual(decide(espejo: .planDesconocido(hash: "ffff"), frame: f), .deSiempre, "cursor de un plan que la muñeca no tiene")
        XCTAssertEqual(decide(frame: nil), .deSiempre, "aún no ha llegado ninguna trama")
    }

    func testGuardandoManda() throws {
        XCTAssertEqual(decide(frame: try trama(), terminando: true), .deSiempre, "«Guardando…» es de la capa de siempre")
    }

    func testOtraModalidadOtroFormatoYDoblesSonDeLaCaraDeSiempre() throws {
        for modalidad in ["strength", "row", "ski", "bike", "functional"] {
            XCTAssertEqual(decide(frame: try trama(formato: "sets", modalidad: modalidad)), .deSiempre, modalidad)
        }
        XCTAssertEqual(decide(frame: try trama(formato: PrescriptionScheme.emom.rawValue)), .deSiempre, "un EMOM de correr es del reloj de pared")
        for ruta in [PrescriptionScheme.hyroxSim, .forTime, .chipper, .rounds, .ladder] {
            XCTAssertEqual(decide(frame: try trama(formato: ruta.rawValue)), .deSiempre, "\(ruta): una ruta por estaciones")
        }
        XCTAssertEqual(decide(frame: try trama(dobles: true)), .deSiempre, "el relevo de dobles tiene pantalla propia")
    }

    // MARK: - Transiciones

    /// HYROX: carrera → estación → carrera → fin. La cara sigue al tramo que dice el móvil en cada trama.
    func testUnHyroxVaYVieneEntreLaCaraNuevaYLaDeSiempre() throws {
        let recorrido: [(String, String, String, CaraDelEspejo)] = [
            (MirrorWire.Phase.active, "intervals", "run", .muneca),          // carrera 1
            (MirrorWire.Phase.active, "hyrox_sim", "ski", .deSiempre),       // estación
            (MirrorWire.Phase.active, "intervals", "run", .muneca),          // carrera 2
            (MirrorWire.Phase.paused, "intervals", "run", .muneca),          // pausa: el cuadro la trae
            (MirrorWire.Phase.gate, "intervals", "run", .deSiempre),         // puerta del siguiente bloque
            (MirrorWire.Phase.finished, "intervals", "run", .muneca),
        ]
        for (fase, formato, modalidad, esperada) in recorrido {
            XCTAssertEqual(decide(frame: try trama(fase: fase, formato: formato, modalidad: modalidad)), esperada, "\(fase) \(formato) \(modalidad)")
        }
    }

    /// Al salir de la cara nueva el pager de siempre no puede quedarse en una página que no existe: la
    /// selección vuelve a Vivo (`RodajePagina.valida`) sea cual sea la que quedó abierta.
    func testElPagerDeSiempreNuncaQuedaEnUnaPaginaInexistente() {
        // Corrió con Datos abierto, la modalidad pasó a una estación (ya no es lámina): Datos no existe.
        XCTAssertEqual(RodajePagina.valida(.datos, esLamina: false, atenuado: false), .vivo)
        // Y con la muñeca bajada corriendo se vuelve a Vivo aunque Datos exista.
        XCTAssertEqual(RodajePagina.valida(.datos, esLamina: true, atenuado: true), .vivo)
        XCTAssertEqual(RodajePagina.valida(.controles, esLamina: true, atenuado: false), .controles)
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

    /// Con un espejo real, la decisión da la cara nueva en una sesión de correr y la de siempre sin plan.
    func testConUnEspejoRealLaDecisionSigueAlCuadro() throws {
        let s = try sesion()
        let f = try viaje(PhoneLiveSession.shared.buildFrame(from: s))
        XCTAssertTrue(GuionDelEspejo.esRodajeLamina(f), "la sesión de prueba es correr de corrido")
        var espejo = Vivo.EspejoMuneca()
        XCTAssertEqual(decide(espejo: espejo.estado, frame: f), .deSiempre, "sin plan aún")
        espejo.recibirPlan(try viaje(MirrorPlanVivo(plan: Vivo.planDe(s), entorno: s.runEnvironment)))
        espejo.recibirTrama(f, en: base)
        XCTAssertEqual(decide(espejo: espejo.estado, frame: f), .muneca)
        XCTAssertEqual(decide(bandera: false, espejo: espejo.estado, frame: f), .deSiempre)
    }
}
