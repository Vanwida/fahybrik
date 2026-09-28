import XCTest
@testable import FAHYBRIK

// LA FAMILIA «CORRER» CONTRA SU CONTRATO — cada escenario de
// `screens/iphone-vivo-correr` con el plan real (gramática de carrera del
// servidor) y el motor real: lo que decide el cuadro (cabecera, héroe, banda,
// trabajo, rejilla, «Luego», acción, cuenta y GO) es lo del contrato.
final class VivoCorrerTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba
    private let movil = Vivo.Dispositivos(reloj: .sin, maquina: nil, pulsometro: .banda)

    @MainActor
    private func cuadro(_ e: EscenarioCorrer) -> VivoIphoneCuadro {
        let s = e.sesion
        let d = Vivo.Dispositivos(reloj: .sin, maquina: e.fuera.cintaConectada ? .cinta : nil, pulsometro: .banda)
        let x = Vivo.LecturaExterna(ritmo: e.fuera.ritmoCinta, gps: e.fuera.gps, dispositivos: d)
        let plan = Vivo.planDe(s.plan, zonas: s.hrZones, entorno: s.runEnvironment)
        return VivoIphoneCuadro(estado: Vivo.estadoDe(s, plan: plan, externo: x), sesion: s, dispositivos: d, test: false, declaradas: [:])
    }

    private func rejilla(_ c: VivoIphoneCuadro) -> [String] { c.metricas.map(\.etiqueta) }

    // MARK: - El plan: la gramática nombra los pasos

    func testLaGramaticaCuentaLasSeriesDeSuRepetirYLosTramosDelProgresivo() throws {
        let p = Vivo.planDe(try P.sesion538(), zonas: P.zonas(), entorno: .outdoor).pasos
        XCTAssertEqual(p[2].clase, .progresivo)
        XCTAssertEqual(Vivo.posicionDe(p[2]), ["Progresivo", "tramo 3/8"])
        XCTAssertEqual(Vivo.luegoDe(p, 2)?.que, "Tramo 4/8 · 1′ a 4:21–4:38")
        XCTAssertEqual(Vivo.posicionDe(p[8]), ["Serie 1/4", "600\u{00A0}m"], "el 4 × 600 cuenta su repetir, no las del día")
        XCTAssertEqual(Vivo.posicionDe(p[16]), ["Serie 1/3", "800\u{00A0}m"])
    }

    func testRodajeYStridesEnUnMismoBloque() throws {
        let p = Vivo.planDe(try P.sesion551(), zonas: P.zonas(), entorno: .outdoor).pasos
        XCTAssertEqual(p[0].clase, .rodaje)
        XCTAssertEqual(p[0].vueltaAutoM, 1000)
        XCTAssertEqual(p[5].clase, .strides)
        XCTAssertEqual(Vivo.posicionDe(p[5]), ["Stride 3/6", "20″"])
        XCTAssertEqual(Vivo.luegoDe(p, 5)?.que, "Recupera 1′ caminando")
        XCTAssertEqual(Vivo.luegoDe(p, 5)?.despues, "20″ a RPE 7")
    }

    func testUnRodajeLargoEsUnaTiradaYUnTempoVaARitmo() throws {
        XCTAssertEqual(Vivo.planDe(try P.sesion494(), zonas: P.zonas(), entorno: .outdoor).pasos[0].clase, .tirada)
        let cinta = Vivo.planDe(try P.tempoCinta(), zonas: P.zonas(), entorno: .treadmill).pasos
        XCTAssertEqual(cinta[1].clase, .tempo)
        XCTAssertEqual(Vivo.posicionDe(cinta[1]), ["Tempo", "20′"])
        let rodaje = Vivo.planDe(try P.sesion491(), zonas: P.zonas(), entorno: .outdoor).pasos
        XCTAssertEqual(rodaje[1].clase, .movilidad)
        XCTAssertEqual(Vivo.luegoDe(rodaje, 0)?.que, "Movilidad · 15′")
    }

    func testElUmbralDeTiradaEsDelCoach() {
        let m = Vivo.Medida(tipo: .tiempo, prescrito: 60 * 60, mide: .reloj)
        XCTAssertEqual(Vivo.claseContinua(m, []), .rodaje)
        XCTAssertEqual(Vivo.claseContinua(m, [], umbrales: Vivo.UmbralesCorrer(tiradaDesdeS: 50 * 60)), .tirada)
    }

    // MARK: - Los escenarios

    @MainActor
    func testSerieDentro() throws {
        let c = cuadro(try EscenarioCorrer.serieDentro())
        XCTAssertEqual(c.posicion, ["Serie 3/6", "1000\u{00A0}m"])
        XCTAssertEqual(c.formato, ["Series"])
        XCTAssertEqual(c.chips.map(\.texto), ["GPS", "Banda"])
        XCTAssertEqual(c.heroe.clase, .ritmo)
        XCTAssertEqual(c.banda?.rotulo, "3:45–3:55")
        XCTAssertEqual(c.banda?.palabra?.texto, "dentro")
        XCTAssertEqual(c.trabajo?.etiqueta, "quedan")
        XCTAssertEqual(rejilla(c), ["pulso", "distancia", "cadencia"])
        XCTAssertEqual(c.luego?.que, "Recupera 90″ trote")
        XCTAssertEqual(c.primaria?.clave, .siguientePaso)
        XCTAssertNil(c.tinte, "a ritmo no se tiñe")
    }

    @MainActor
    func testSerieRapidaDiceRapidoSinCambiarDeColor() throws {
        let c = cuadro(try EscenarioCorrer.serieRapida())
        XCTAssertEqual(c.heroe.texto, "3:38")
        XCTAssertEqual(c.banda?.palabra?.marca, "▲")
        XCTAssertEqual(c.banda?.palabra?.texto, "rápido")
    }

    @MainActor
    func testRecuperacionConSuPreavisoSuCuentaYSuGo() throws {
        let c = cuadro(try EscenarioCorrer.recuperacion(t: 77))
        XCTAssertEqual(c.posicion, ["Recupera", "trote", "90″"])
        XCTAssertEqual(c.heroe.texto, "0:13")
        XCTAssertEqual(c.trabajo?.etiqueta, "viene")
        XCTAssertEqual(c.trabajo?.valor, "1000\u{00A0}m a 3:45–3:55")
        XCTAssertEqual(rejilla(c), ["pulso", "ritmo"])
        XCTAssertEqual(c.metricas.first?.tendencia, .baja)
        XCTAssertEqual(c.primaria?.clave, .empezarYa)
        XCTAssertNil(c.estado.cuenta)
        XCTAssertEqual(cuadro(try EscenarioCorrer.recuperacion(t: 87.5)).estado.cuenta, 3)
        XCTAssertTrue(cuadro(try EscenarioCorrer.serie4(t: 0.4)).estado.go)
        let s4 = cuadro(try EscenarioCorrer.serie4(t: 3))
        XCTAssertFalse(s4.estado.go)
        XCTAssertEqual(s4.posicion, ["Serie 4/6", "1000\u{00A0}m"])
    }

    @MainActor
    func testDeTrabajoATrabajoNoHayCuentaNiGo() throws {
        let c = cuadro(try EscenarioCorrer.progresivo(tramo: 4))
        XCTAssertEqual(c.posicion, ["Progresivo", "tramo 4/8"])
        XCTAssertFalse(c.estado.go)
        XCTAssertNil(c.estado.cuenta)
        XCTAssertEqual(c.luego?.que, "Tramo 5/8 · 1′ a 4:15–4:30")
    }

    @MainActor
    func testRodajeAZonaMandaElPulsoConSuEspectro() throws {
        let c = cuadro(try EscenarioCorrer.rodajeZ2())
        XCTAssertEqual(c.posicion, ["Rodaje", "Z2", "50′"])
        XCTAssertEqual(c.heroe.clase, .pulso)
        XCTAssertEqual(c.banda?.rotulo, "Z2 · a 6 de Z3")
        XCTAssertEqual(rejilla(c), ["ritmo", "distancia", "cadencia"])
        XCTAssertEqual(c.luego?.que, "Movilidad · 15′")
        XCTAssertEqual(c.primaria?.clave, .vuelta)
        XCTAssertEqual(c.tinte, 2)
    }

    @MainActor
    func testCintaConectadaManda() throws {
        let c = cuadro(try EscenarioCorrer.cinta(conectada: true))
        XCTAssertEqual(c.posicion, ["Tempo", "20′"])
        XCTAssertEqual(c.chips.map(\.texto), ["Cinta", "Banda"])
        XCTAssertEqual(c.heroe.texto, "4:18")
        XCTAssertEqual(rejilla(c), ["pulso", "inclinación", "distancia"])
        XCTAssertFalse(c.conMapa, "en cinta no hay Mapa")
        XCTAssertTrue(Vivo.admiteHorizontal(c.familia))
    }

    @MainActor
    func testCintaSinConectarLoDicesTu() throws {
        let c = cuadro(try EscenarioCorrer.cinta(conectada: false))
        XCTAssertEqual(c.chips.first?.texto, "Conectar la cinta")
        XCTAssertEqual(c.nota, "sin la cinta · lo dices tú")
        XCTAssertEqual(c.heroe.clase, .falta)
        XCTAssertEqual(c.heroe.texto, "16:38")
        XCTAssertNil(c.banda?.marca, "sin lectura no hay marca")
        XCTAssertEqual(rejilla(c), ["pulso", "inclinación"])
    }

    @MainActor
    func testStrideARpeEsUnaInstruccion() throws {
        let c = cuadro(try EscenarioCorrer.strides(recupera: false))
        XCTAssertEqual(c.posicion, ["Stride 3/6", "20″"])
        XCTAssertNil(c.banda)
        XCTAssertEqual(c.instruccion, "RPE 7 · fuerte")
        XCTAssertEqual(rejilla(c), ["ritmo", "pulso", "distancia", "cadencia"])
        let r = cuadro(try EscenarioCorrer.strides(recupera: true))
        XCTAssertEqual(r.posicion, ["Recupera", "caminando", "1′"])
        XCTAssertEqual(r.formato, ["Stride"])
        XCTAssertNil(r.tinte, "la recuperación es monocroma")
    }

    @MainActor
    func testLibreIgualQueElDelCoach() throws {
        let coach = cuadro(try EscenarioCorrer.serieDentro())
        let libre = cuadro(try EscenarioCorrer.serieDentro(libre: true))
        XCTAssertEqual(libre.posicion, coach.posicion)
        XCTAssertEqual(libre.formato, coach.formato)
        XCTAssertEqual(rejilla(libre), rejilla(coach))
        XCTAssertEqual(libre.primaria, coach.primaria)
        XCTAssertEqual(libre.arcos.count, coach.arcos.count)
        // La única diferencia es del constructor libre: un ritmo es un valor, no una banda.
        XCTAssertEqual(libre.banda?.rotulo, "3:50")
    }

    // MARK: - Las vueltas del correr continuo

    func testLaVueltaAutomaticaPorKmYLaVueltaAMano() {
        let p = Vivo.Paso(id: "r", clase: .rodaje, rol: .trabajo, medida: Vivo.Medida(tipo: .tiempo, prescrito: 3000, mide: .reloj), vueltaAutoM: 1000)
        var v = Vivo.RegistroVueltas()
        v.observar(p, sesionT: 1000, sesionM: 4000, ppm: 146)
        XCTAssertNil(v.observar(p, sesionT: 1200, sesionM: 4800, ppm: 146))
        let km = v.observar(p, sesionT: 1292, sesionM: 5001, ppm: 146)
        XCTAssertEqual(km?.n, 5)
        XCTAssertEqual(v.avisoVigente(1293)?.titulo, "Kilómetro 5")
        XCTAssertEqual(v.avisoVigente(1293)?.valor, "4:52")
        XCTAssertNil(v.avisoVigente(1297), "la tarjeta dura 4 s")
        v.aMano(sesionT: 1400, sesionM: 5400, ppm: 146)
        XCTAssertEqual(v.avisoVigente(1400)?.titulo, "Vuelta 1")
    }

    func testAMitadDeKmLaPrimeraVueltaNoSeInventa() {
        let p = Vivo.Paso(id: "r", clase: .rodaje, rol: .trabajo, medida: Vivo.Medida(tipo: .tiempo, prescrito: 3000, mide: .reloj), vueltaAutoM: 1000)
        var v = Vivo.RegistroVueltas()
        v.observar(p, sesionT: 1452, sesionM: 4970, ppm: 146)
        XCTAssertNil(v.observar(p, sesionT: 1460, sesionM: 5010, ppm: 146), "el km 5 empezó antes de mirar: sin tiempo honesto")
        XCTAssertEqual(v.observar(p, sesionT: 1752, sesionM: 6010, ppm: 146)?.segundos, 292)
    }
}
