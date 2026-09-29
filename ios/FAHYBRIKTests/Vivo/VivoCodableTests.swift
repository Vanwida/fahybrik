import XCTest
@testable import FAHYBRIK

// LA CODIFICACIÓN ESTABLE DEL PASO — lo que viaja por el cable a la muñeca (el
// mensaje `plan` de la fase 2) tiene que dar la vuelta entera, con las claves
// del kit, y aguantar un campo que falta o que sobra sin tirar el plan.
final class VivoCodableTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba

    private let codificador: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return e
    }()
    private let decodificador = JSONDecoder()

    private func vuelta<T: Codable & Equatable>(_ x: T, file: StaticString = #filePath, line: UInt = #line) throws {
        let back = try decodificador.decode(T.self, from: try codificador.encode(x))
        XCTAssertEqual(back, x, file: file, line: line)
    }

    private func texto<T: Encodable>(_ x: T) throws -> String { String(decoding: try codificador.encode(x), as: UTF8.self) }

    // MARK: - Todos los planes de prueba dan la vuelta entera

    func testCadaPlanDePruebaDaLaVueltaEntera() throws {
        let planes: [() throws -> WorkoutPlan] = [
            P.superserie, P.seriesRectas, P.seisPorMil, P.rodajeZ2, P.skiSeries, P.testRemo, P.emom, P.amrap, P.chipper, P.circuito, P.tabata, P.deathBy,
            P.seisPorMilCompleto, P.libreSeisPorMil, P.sesion491, P.sesion494, P.sesion538Carrera, P.sesion551, P.tempoCinta,
            P.sesion573, P.sesion479Correr, P.sesion509, P.sesion535, P.sesion552,
            VivoPlanesCircuito.sesion493, VivoPlanesCircuito.sesion492, P.emom498, P.amrapRemo, P.chipper10, P.tabataBurpee, P.deathByBurpee,
            P.remoSeries, P.skiCalorias, P.biciContinuo, P.remoZona, P.p11, P.piramide392, P.sesion529,
        ]
        var pasos = 0
        for (k, f) in planes.enumerated() {
            let plan = Vivo.planDe(try f(), zonas: P.zonas(), entorno: .outdoor)
            try vuelta(plan)
            pasos += plan.pasos.count
            XCTAssertFalse(plan.pasos.isEmpty, "plan \(k)")
        }
        XCTAssertGreaterThan(pasos, 300, "se examinan cientos de pasos de todas las familias")
    }

    /// El cable lleva lo justo: una sesión de las grandes cabe con holgura en un mensaje.
    func testElMensajeDeUnaSesionGrandePesaPoco() throws {
        let plan = Vivo.planDe(try P.sesion509(), zonas: P.zonas(), entorno: .treadmill)
        let bytes = try codificador.encode(plan).count
        XCTAssertGreaterThan(plan.pasos.count, 30)
        XCTAssertLessThan(bytes, 30_000, "509 (\(plan.pasos.count) pasos) pesa \(bytes) B")
    }

    // MARK: - Las uniones, con la forma del kit

    func testUnPasoConTodoDaLaVueltaEntera() throws {
        let tarea = Vivo.Tarea(nombre: "Wall Ball", dosis: Vivo.Medida(tipo: .reps, prescrito: 12, mide: .atleta), carga: Vivo.Carga(kg: 9), corporal: nil, mide: .atleta, corre: nil)
        let wods: [Vivo.InfoWod] = [
            .emom(tarea: tarea, ciclo: [tarea], ventanas: 16, ventanaS: 60),
            .amrap(tareas: [tarea], duracionS: 900),
            .puntuacion(tareas: [tarea, tarea], duracionS: 900),
            .fortime(tarea: nil, capS: nil),
            .fortime(tarea: tarea, capS: 1200),
            .pared(trabajoS: 20, descansoS: 10, rondas: 8),
            .deathby(tarea: tarea, inicio: 1, incremento: 1, ventanaS: 60, tope: nil),
            .deathby(tarea: tarea, inicio: 2, incremento: 2, ventanaS: 60, tope: 20),
        ]
        let cargas: [Vivo.CargaFuerza] = [.kg(min: 150, max: 160), .rm(pctMin: 65, pctMax: 70, rmKg: 140), .rm(pctMin: 65, pctMax: 70, rmKg: nil), .corporal,
                                          .tuya(ultimaKg: 30, lastre: true), .tuya(ultimaKg: nil, lastre: false)]
        let ventanas: [Vivo.Origen.Ventana] = [.segmento, .emom(3), .ronda(2), .pierna(7), .estacion(4), .serie(1)]
        for w in wods { try vuelta(w) }
        for c in cargas { try vuelta(c) }
        for v in ventanas { try vuelta(v) }

        let ficha = Vivo.FichaFuerza(ejercicio: "back-squat", carga: .rm(pctMin: 65, pctMax: 70, rmKg: 140), esfuerzo: Vivo.EsfuerzoFuerza(eje: .rir, min: 2, max: 2),
                                     porLado: .pierna, aproximacion: true, pasoKg: 5, vaciaKg: 15)
        let dobles = Vivo.Dobles(turno: .reparto, pareja: "Marta", estacion: "SkiErg 1km", tuyas: 10, suyas: 12, pctTuyo: 45, nota: "alterna 250m")
        let paso = Vivo.Paso(id: "todo", clase: .estacion, rol: .trabajo, fase: .vuelta, medida: Vivo.Medida(tipo: .distancia, prescrito: 50, mide: .atleta),
                             objetivos: [Vivo.Objetivo(eje: .ritmo, min: 225, max: 235, papel: .principal, avisa: .soloArriba, palabra: "fuerte"),
                                         Vivo.Objetivo(eje: .zona, min: nil, max: 2, papel: .techo)],
                             posicion: Vivo.Posicion(tanda: Vivo.Contador(n: 1, de: 2), serie: Vivo.Contador(n: 3, de: 6), tramo: Vivo.Contador(n: 2, de: 8),
                                                     ronda: Vivo.Contador(n: 2, de: 5), estacion: Vivo.Contador(n: 3, de: 4), slot: "A1"),
                             nombre: "Sled Push", modoRecupera: .andar, entorno: .pista, carga: Vivo.Carga(kg: 32, implementos: 2),
                             maquina: Vivo.Maquina(tipo: .ski, damper: 6), tempo: Vivo.Tempo(excentrica: 3, pausaAbajo: 1, concentrica: 1, pausaArriba: 0),
                             cue: "mirar el pulso", cierre: .atleta, vueltaAutoM: 1000, bloque: 4, roxzone: .salida,
                             wod: wods[1], fuerza: ficha, dobles: dobles,
                             origen: Vivo.Origen(segmento: 2, ventana: .serie(4), descanso: true, puntuacion: true))
        try vuelta(paso)
    }

    func testLasUnionesTienenLaFormaDelKit() throws {
        let wod = try decodificador.decode(Vivo.InfoWod.self, from: Data(#"{"formato":"fortime","tarea":null,"capS":null}"#.utf8))
        XCTAssertEqual(wod, .fortime(tarea: nil, capS: nil))
        let carga = try decodificador.decode(Vivo.CargaFuerza.self, from: Data(#"{"tipo":"kg","min":150,"max":160}"#.utf8))
        XCTAssertEqual(carga, .kg(min: 150, max: 160))
        XCTAssertEqual(try texto(Vivo.CargaFuerza.corporal), #"{"tipo":"corporal"}"#)
        XCTAssertEqual(try texto(Vivo.Origen.Ventana.pierna(3)), #"{"i":3,"tipo":"pierna"}"#)
        XCTAssertEqual(try texto(Vivo.Origen.Ventana.segmento), #"{"tipo":"segmento"}"#)
    }

    // MARK: - La forma es un contrato

    /// Si esto falla, cambió lo que viaja por el cable: o es a propósito (y el reloj y el móvil
    /// se actualizan juntos) o alguien renombró una clave sin querer.
    func testLasClavesDelPasoSonElContrato() throws {
        let p = Vivo.Paso(id: "s0-l3", clase: .series, rol: .trabajo, fase: .principal,
                          medida: Vivo.Medida(tipo: .distancia, prescrito: 1000, mide: .gps),
                          objetivos: [Vivo.Objetivo(eje: .ritmo, min: 225, max: 235, papel: .principal)],
                          posicion: Vivo.Posicion(serie: Vivo.Contador(n: 3, de: 6)), entorno: .calle, bloque: 1,
                          origen: Vivo.Origen(segmento: 0, ventana: .pierna(3)))
        XCTAssertEqual(try texto(p), """
        {"bloque":1,"cierre":"medida","clase":"series","entorno":"calle","fase":"principal","id":"s0-l3",\
        "medida":{"mide":"gps","prescrito":1000,"tipo":"distancia"},\
        "objetivos":[{"eje":"ritmo","max":235,"min":225,"papel":"principal"}],\
        "origen":{"segmento":0,"ventana":{"i":3,"tipo":"pierna"}},\
        "posicion":{"serie":{"de":6,"n":3}},"rol":"trabajo"}
        """)
    }

    // MARK: - Lo que falta y lo que sobra

    func testUnCampoConDefectoQueFaltaNoTiraElPlan() throws {
        let json = #"{"id":"x","clase":"series","rol":"trabajo","medida":{"tipo":"tiempo","prescrito":60,"mide":"reloj"},"campoDelFuturo":{"a":1}}"#
        let p = try decodificador.decode(Vivo.Paso.self, from: Data(json.utf8))
        XCTAssertEqual(p.fase, .principal)
        XCTAssertEqual(p.cierre, .medida)
        XCTAssertEqual(p.objetivos, [])
        XCTAssertNil(p.posicion)
        // Y sin `id`, `clase`, `rol` o `medida` no hay paso: eso sí es un mensaje roto.
        XCTAssertThrowsError(try decodificador.decode(Vivo.Paso.self, from: Data(#"{"id":"x"}"#.utf8)))
    }

    func testLasReglasYLosUmbralesSinDecirSonLosDelDefecto() throws {
        let plan = try decodificador.decode(Vivo.PlanVivo.self, from: Data(#"{"pasos":[]}"#.utf8))
        XCTAssertEqual(plan.reglas, Vivo.reglasAvisoDefecto)
        XCTAssertNil(plan.zonas)
        XCTAssertEqual(try decodificador.decode(Vivo.UmbralesCorrer.self, from: Data("{}".utf8)), Vivo.umbralesCorrerDefecto)
        // El coach toca un solo umbral y los demás siguen siendo los del defecto.
        let uno = try decodificador.decode(Vivo.UmbralesCorrer.self, from: Data(#"{"tiradaDesdeS":3000}"#.utf8))
        XCTAssertEqual(uno.tiradaDesdeS, 3000)
        XCTAssertEqual(uno.strideHastaS, Vivo.umbralesCorrerDefecto.strideHastaS)
        XCTAssertEqual(uno.tempoDesdeZona, Vivo.umbralesCorrerDefecto.tempoDesdeZona)
    }

    func testNuncaTempoPorZonaSeEscribeNuloYNoSeConfundeConNoDecirlo() throws {
        let nunca = Vivo.UmbralesCorrer(tempoDesdeZona: nil)
        try vuelta(nunca)
        XCTAssertNil(try decodificador.decode(Vivo.UmbralesCorrer.self, from: Data(#"{"tempoDesdeZona":null}"#.utf8)).tempoDesdeZona)
        XCTAssertEqual(try decodificador.decode(Vivo.UmbralesCorrer.self, from: Data("{}".utf8)).tempoDesdeZona, 4)
        try vuelta(Vivo.umbralesCorrerDefecto)
    }
}
