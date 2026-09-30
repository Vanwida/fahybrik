import XCTest
@testable import FAHYBRIK

// MISMO CUADRO (F2, FH-30 llevado a la cara nueva): el MISMO entreno de correr por las
// dos vías —solitario (`WorkoutSession` → `Vivo.cuadroDeMuneca`) y espejo (plan + cursor
// que viajan en JSON → `Vivo.EspejoMuneca`)— da el MISMO `Vivo.CuadroMuneca`. Es la única
// afirmación que significa «misma cara»: comparar pantallas pintadas no la caza.
//
// Cómo se ensaya: el motor lo conducimos nosotros (sus relojes se fijan a mano, el timer
// muerto) y el reloj de pared del espejo es `base + segundos de sesión + pausas`. Los
// metros y el pulso entran POR LAS DOS puertas a la vez, con los mismos valores. Lo único
// que difiere a propósito es `enlace` (.solo frente a .espejo): se normaliza.
@MainActor
final class EspejoCuadroMismoTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba

    // MARK: - El ensayo: el motor de un lado, la muñeca del otro

    @MainActor
    private final class Ensayo {
        /// Potencia de dos: con `Date` cerca de 1e9 s la resolución es de 1e-7 s y ruido de ese tamaño
        /// llegaría a las cifras; aquí todo lo dyádico (x,25 x,5 x,75) es exacto.
        static let base = Date(timeIntervalSinceReferenceDate: 1_048_576)
        static let cadencia = 181.0

        let s: WorkoutSession
        let mensajePlan: MirrorPlanVivo
        let planSolo: Vivo.PlanVivo
        var espejo = Vivo.EspejoMuneca()
        private var ventana = Vivo.VentanaDeRitmo()
        private var acumulado = 0.0
        private(set) var registro = Vivo.RegistroVueltas()
        private var pausaS = 0.0
        private var legDesde = 0.0
        private(set) var t = 0.0
        var gps = Vivo.EstadoGps.listo

        init(_ plan: WorkoutPlan, entorno: RunEnvironment) throws {
            s = EscenarioCorrer.enElPaso(plan, entorno: entorno, pasos: 0)
            s.stop()
            s.elapsedSeconds = 0
            s.lapElapsedSeconds = s.runLegStartElapsed
            mensajePlan = MirrorPlanVivo(plan: Vivo.planDe(s), entorno: s.runEnvironment)
            planSolo = mensajePlan.plan
            // El plan viaja: bytes de ida y vuelta, como en el canal.
            let bytes = try XCTUnwrap(MirrorEnvelope.encoding(type: MirrorWire.MessageType.plan, mensajePlan))
            let llegado = try XCTUnwrap(MirrorEnvelope.decoding(bytes)?.body(as: MirrorPlanVivo.self))
            espejo.recibirPlan(llegado)
        }

        func pared(_ x: Double) -> Date { Self.base.addingTimeInterval(x + pausaS) }

        func reloj(_ x: Double) {
            t = x
            s.elapsedSeconds = x
            s.lapElapsedSeconds = s.runLegStartElapsed + (x - legDesde)
        }

        private func fuentes(_ x: Double, enlace: Vivo.Enlace = .solo) -> Vivo.FuentesMuneca {
            Vivo.FuentesMuneca(ritmoActual: ventana.ritmo(ahora: x), gps: gps, enlace: enlace, cadencia: Self.cadencia)
        }

        private func observarSolo(_ x: Double) {
            let e = Vivo.estadoDeMuneca(s, plan: planSolo, fuentes: fuentes(x))
            registro.observar(e.paso, sesionT: e.sesion.t, sesionM: e.sesion.metros, ppm: e.lecturas.ppm)
        }

        /// `deltaM` metros que entrega el builder en el segundo `x` de la sesión.
        func mover(_ deltaM: Double, en x: Double) {
            reloj(x)
            s.sampleRunDistance(deltaMeters: deltaM, source: .healthkit)
            acumulado += deltaM
            ventana.anotar(t: x, metros: acumulado)
            espejo.anotarDistancia(deltaM: deltaM, en: pared(x))
            observarSolo(x)
        }

        func pulso(_ bpm: Int, en x: Double) {
            reloj(x)
            s.injectLiveHR(bpm, source: .strap)
            espejo.anotarPulso(bpm, en: pared(x))
        }

        /// El atleta cierra el tramo (o el motor lo hace): el cursor salta al siguiente.
        func siguientePaso(en x: Double) {
            reloj(x)
            s.runStructurePrimary()
            legDesde = x
            s.lapElapsedSeconds = s.runLegStartElapsed
        }

        func pausar(en x: Double) { reloj(x); s.togglePause() }

        func reanudar(en x: Double, trasPausaS: Double) {
            pausaS += trasPausaS
            s.togglePause()
            reloj(x)
        }

        /// El móvil emite una trama en `x`: sale de `buildFrame` de verdad y viaja en JSON.
        @discardableResult
        func trama(en x: Double) throws -> MirrorStateFrame {
            reloj(x)
            let enviada = PhoneLiveSession.shared.buildFrame(from: s)
            let bytes = try MirrorWire.encoder.encode(enviada)
            let llegada = try MirrorWire.decoder.decode(MirrorStateFrame.self, from: bytes)
            espejo.recibirTrama(llegada, en: pared(x))
            observarSolo(x)
            return llegada
        }

        func solitario(en x: Double, enlace: Vivo.Enlace = .solo) -> Vivo.CuadroMuneca {
            reloj(x)
            return Vivo.cuadroDeMuneca(s, plan: planSolo, fuentes: fuentes(x, enlace: enlace), registro: registro)
        }

        func enEspejo(en x: Double, apple: Bool = false) -> Vivo.CuadroMuneca? {
            reloj(x)
            return espejo.cuadro(ahora: pared(x), locales: .init(gps: gps, cadencia: Self.cadencia, enlaceApplePerdido: apple))
        }
    }

    private func igual(_ e: Ensayo, _ x: Double, sinEnlace: Bool = false,
                       _ msg: String = "", file: StaticString = #filePath, line: UInt = #line) throws {
        let solo = e.solitario(en: x, enlace: sinEnlace ? .sinEnlace : .solo)
        var espejo = try XCTUnwrap(e.enEspejo(en: x), "el espejo no pinta nada en \(x) s. \(msg)", file: file, line: line)
        espejo.enlace = sinEnlace ? .sinEnlace : .solo
        if espejo != solo {
            XCTFail("espejo ≠ solitario en \(x) s. \(msg)\n" + diferencias(solo, espejo).prefix(8).joined(separator: "\n"), file: file, line: line)
        }
    }

    /// Dónde difieren dos valores (por reflexión): la ruta de cada hoja distinta, `solitario | espejo`.
    private func diferencias(_ a: Any, _ b: Any, ruta: String = "cuadro") -> [String] {
        let ma = Mirror(reflecting: a)
        let mb = Mirror(reflecting: b)
        if ma.children.isEmpty || ma.children.count != mb.children.count {
            let da = String(describing: a)
            let db = String(describing: b)
            return da == db ? [] : ["\(ruta): \(da) | \(db)"]
        }
        return zip(ma.children, mb.children).enumerated().flatMap { k, par in
            diferencias(par.0.value, par.1.value, ruta: ruta + "." + (par.0.label ?? "[\(k)]"))
        }
    }

    // MARK: - Un rodaje: los relojes corren solos entre tramas y el km se corta igual

    func testElRodajeEsElMismoCuadroEntreTramasYAlCruzarUnKm() throws {
        let e = try Ensayo(P.sesion491(), entorno: .outdoor)
        XCTAssertEqual(e.mensajePlan.pasos[0].vueltaAutoM, 1000, "un rodaje lleva vuelta automática por km")
        try e.trama(en: 0)
        var x = 0.0
        while x < 320 {
            x += 5
            e.mover(20, en: x)          // 4 m/s = 4:10/km
            e.pulso(146 + Int(x / 40), en: x)
            try e.trama(en: x)          // el latido del móvil: una trama cada 5 s (el límite es 5 s de silencio)
            try igual(e, x)
            try igual(e, x + 2.5, "entre tramas, con los relojes locales")
        }
        // 1000 m = 250 s a 4 m/s: el km se cortó en los dos lados, con su tarjeta y su fila.
        let c = try XCTUnwrap(e.enEspejo(en: 252))
        XCTAssertEqual(c.vueltas.filas.first?.n, "km 1", "km 1 cerrado")
        XCTAssertEqual(c.vueltas.filas.first?.valor, "4:10")
        guard case let .paso(cara) = c.cara else { return XCTFail("\(c.cara)") }
        XCTAssertEqual(cara.tercero?.vista.valor.isEmpty, false)
    }

    func testElRitmoActualSaleDeLaVentanaLocalYCaeAlPararse() throws {
        let e = try Ensayo(P.sesion491(), entorno: .outdoor)
        try e.trama(en: 0)
        for k in 1...4 { e.mover(20, en: Double(k) * 5); e.pulso(140, en: Double(k) * 5) }
        try e.trama(en: 20)
        guard case let .paso(viva) = try XCTUnwrap(e.enEspejo(en: 20)).cara else { return XCTFail() }
        XCTAssertNotNil(viva.segundo ?? viva.tercero)
        // Se para: el builder calla. A los 15 s sin metros no queda ritmo, ni congelado ni inventado: igual que en solitario.
        for x in [25.0, 30, 35] { try e.trama(en: x) }
        try igual(e, 35, "quieto")
        let quieto = try XCTUnwrap(e.enEspejo(en: 35))
        XCTAssertNotEqual(quieto, try XCTUnwrap(e.enEspejo(en: 21)), "el cuadro cambia: no se congela")
    }

    // MARK: - Series con recuperación: el paso, sus metros desde el ancla y la página Vueltas

    func testLasSeriesConSuRecuperacionSonElMismoCuadro() throws {
        let e = try Ensayo(P.seisPorMilCompleto(), entorno: .outdoor)
        try e.trama(en: 0)
        var x = 0.0
        var visto = Set<Vivo.Rol>()
        for paso in 0..<9 {
            let p = e.mensajePlan.pasos[min(paso, e.mensajePlan.pasos.count - 1)]
            visto.insert(p.rol)
            // Cada tramo dura 40 s a 4,5 m/s (una serie de 1000 m no cabe: cierra el atleta).
            for _ in 0..<8 {
                x += 5
                e.mover(22.5, en: x)
                e.pulso(p.rol == .trabajo ? 168 : 132, en: x)
                try e.trama(en: x)
                try igual(e, x, "paso \(paso) · \(p.clase)")
            }
            try igual(e, x + 1.75, "entre tramas · paso \(paso)")
            e.siguientePaso(en: x)
            try e.trama(en: x)
            try igual(e, x, "recién entrado en el paso \(paso + 1) (cuenta, GO, ancla nueva)")
            try igual(e, x + 1, "1 s dentro del paso \(paso + 1)")
        }
        XCTAssertTrue(visto.isSuperset(of: [.trabajo, .recuperacion]), "el ensayo pasó por series Y recuperaciones")
        let vueltas = try XCTUnwrap(e.enEspejo(en: x)).vueltas
        XCTAssertGreaterThanOrEqual(vueltas.filas.count, 3, "las series cerradas salen en Vueltas, medidas por la muñeca")
    }

    func testElDescansoEntreTandasEsElMismoCuadro() throws {
        let e = try Ensayo(P.sesion509(), entorno: .indoor)
        try e.trama(en: 0)
        var x = 0.0
        var entroEnDescansoDeTandas = false
        for paso in 0..<20 {
            for _ in 0..<3 {
                x += 5
                e.mover(12, en: x)
                e.pulso(150, en: x)
                try e.trama(en: x)
                try igual(e, x, "paso \(paso)")
            }
            e.siguientePaso(en: x)
            try e.trama(en: x)
            let p = e.mensajePlan.pasos[min(paso + 1, e.mensajePlan.pasos.count - 1)]
            if p.clase == .descansoTandas { entroEnDescansoDeTandas = true }
            try igual(e, x, "recién entrado en \(p.clase)")
            try igual(e, x + 3.25, "dentro de \(p.clase)")
        }
        XCTAssertTrue(entroEnDescansoDeTandas, "509 tiene un descanso entre tandas y el ensayo lo cruzó")
    }

    // MARK: - Pausa: los relojes se quedan quietos en los dos lados, y el ritmo no se contamina

    func testLaPausaCongelaLosRelojesYAlReanudarSigueIgual() throws {
        let e = try Ensayo(P.sesion491(), entorno: .outdoor)
        try e.trama(en: 0)
        for k in 1...6 { e.mover(20, en: Double(k) * 5); e.pulso(145, en: Double(k) * 5) }
        try e.trama(en: 30)
        e.pausar(en: 30)
        try e.trama(en: 30)                       // la trama pausada
        let quieta = try XCTUnwrap(e.enEspejo(en: 30))
        XCTAssertTrue(quieta.pausado)
        // Pasan 20 s de pared con el entreno pausado: el espejo no avanza (el motor tampoco).
        try igual(e, 30)
        e.reanudar(en: 30, trasPausaS: 20)
        try e.trama(en: 30)
        try igual(e, 30, "recién reanudado")
        for k in 7...10 { e.mover(20, en: Double(k) * 5); e.pulso(146, en: Double(k) * 5); try e.trama(en: Double(k) * 5) }
        try igual(e, 50, "tras reanudar: ritmo de la ventana sin el hueco de la pausa")
        try igual(e, 52.5)
    }

    // MARK: - Enlace perdido: se marca viejo, jamás se congela en silencio

    func testSinTramaDurante5SegundosElEnlaceSePintaPerdidoConSuNota() throws {
        let e = try Ensayo(P.seisPorMilCompleto(), entorno: .outdoor)
        try e.trama(en: 0)
        e.siguientePaso(en: 1)                    // primer paso de trabajo
        try e.trama(en: 1)
        for k in 1...4 { e.mover(20, en: 1 + Double(k) * 5); e.pulso(165, en: 1 + Double(k) * 5) }
        try e.trama(en: 21)
        try igual(e, 24.75, "3,75 s de silencio: todavía enlazado")
        XCTAssertEqual(e.enEspejo(en: 24.75)?.enlace, .espejo)
        try igual(e, 27, sinEnlace: true, "6 s sin trama: sin enlace")
        let c = try XCTUnwrap(e.enEspejo(en: 27))
        XCTAssertEqual(c.enlace, .sinEnlace)
        guard case let .paso(cara) = c.cara else { return XCTFail("\(c.cara)") }
        XCTAssertEqual(cara.nota?.texto, "sin enlace · la muñeca sigue grabando")
        XCTAssertNotEqual(c, try XCTUnwrap(e.enEspejo(en: 26)), "el reloj sigue corriendo en local")
        // Apple dice que se fue: sin esperar los 5 s.
        XCTAssertEqual(e.enEspejo(en: 22, apple: true)?.enlace, .sinEnlace)
    }

    // MARK: - Cinta enchufada: lo mide el móvil y viaja en el cursor

    func testEnCintaEnchufadaLosMetrosYElRitmoLosMideElMovilYViajan() throws {
        PhoneLiveSession.shared.isTreadmillLive = { true }
        defer { PhoneLiveSession.shared.isTreadmillLive = { DeviceHub.shared.treadmillLink.isLive } }
        let e = try Ensayo(P.tempoCinta(), entorno: .treadmill)
        e.siguientePaso(en: 1)
        for k in 1...6 {
            let x = 1 + Double(k) * 5
            e.reloj(x)
            e.s.sampleTreadmillDistance(deltaMeters: 17)
        }
        let f = try e.trama(en: 31)
        let c = try XCTUnwrap(f.cursor)
        XCTAssertNotNil(c.sesionM, "en cinta enchufada los metros de la sesión los mide el móvil")
        XCTAssertNotNil(c.ritmo, "y el ritmo es el de la banda")
        XCTAssertNil(c.hecho, "el paso es por tiempo: lo cuenta el reloj, no viaja")
        // Y la muñeca pinta lo que dice el cursor (no lo del builder, que en cinta enchufada no mide).
        let solo = e.s.liveBeltPaceSecPerKm.map(Double.init)
        XCTAssertEqual(c.ritmo, solo)
        let espejo = try XCTUnwrap(e.enEspejo(en: 31))
        let datos = espejo.datos.filas
        XCTAssertNotEqual(datos[1].valor, "—", "la distancia de la sesión sale del cursor")
    }
}
