import XCTest
@testable import FAHYBRIK

// EL DIRECTOR DE LA MUÑECA (correr, F3): de las transiciones del estado vivo a los eventos del
// vocabulario del §4, de cada evento a sus golpes, del «director activo» que calla lo heredado
// y del cierre seguro del último paso. Todo puro: sin WatchKit ni reloj.
//
//   · secuencias de estados → eventos EXACTOS (GO, recupera, bloque, fin de serie, sesión, 3-2-1…);
//   · el aviso fuera de objetivo: histéresis, cadencia, ni en calentamiento ni en recuperación
//     (salvo que el coach lo pida), solo por arriba en un rodaje a zona, en los dos en una serie;
//   · el preaviso solo en pasos de ≥ 30 s, una vez por paso;
//   · la vuelta por km (y que un rodaje tras un calentamiento no mida su primer km desde el arranque);
//   · el enlace perdido y recuperado;
//   · el mapeo evento → golpes y el silencio de lo heredado (con y sin cara nueva);
//   · cerrar el último paso pregunta, y «Descartar» solo existe con el enlace roto.
final class VivoDirectorTests: XCTestCase {

    // MARK: - El armazón

    private let zonas = Vivo.ZonasCoach(techos: [120, 140, 155, 170, 190])

    private func paso(_ id: String, _ clase: Vivo.Clase, _ medida: Vivo.Medida, rol: Vivo.Rol = .trabajo, fase: Vivo.Fase = .principal,
                      objetivos: [Vivo.Objetivo] = [], bloque: Int = 1,
                      posicion: Vivo.Posicion? = nil, vueltaAutoM: Double? = nil) -> Vivo.Paso {
        Vivo.Paso(id: id, clase: clase, rol: rol, fase: fase, medida: medida, objetivos: objetivos, posicion: posicion,
                  vueltaAutoM: vueltaAutoM, bloque: bloque)
    }

    private func tiempo(_ s: Double) -> Vivo.Medida { Vivo.Medida(tipo: .tiempo, prescrito: s, mide: .reloj) }
    private func metros(_ m: Double) -> Vivo.Medida { Vivo.Medida(tipo: .distancia, prescrito: m, mide: .gps) }
    private func ritmo(_ rapido: Double, _ lento: Double) -> Vivo.Objetivo { Vivo.Objetivo(eje: .ritmo, min: rapido, max: lento, papel: .principal) }
    private func zona(_ z: Double) -> Vivo.Objetivo { Vivo.Objetivo(eje: .zona, min: z, max: z, papel: .principal) }

    private func estado(_ pasos: [Vivo.Paso], _ i: Int = 0, t: Double = 100, ritmo: Double? = nil, ppm: Double? = nil, hecho: Double? = nil,
                        pausado: Bool = false, cuenta: Int? = nil, terminado: Bool = false, enlace: Vivo.Enlace = .solo,
                        vueltas: [Vivo.Vuelta] = [], reglas: Vivo.ReglasAviso = Vivo.reglasAvisoDefecto) -> Vivo.EstadoVivo {
        Vivo.EstadoVivo(pasos: pasos, i: i, lecturas: Vivo.Lecturas(t: t, hecho: hecho, ritmo: ritmo, ppm: ppm),
                        sesion: Vivo.Sesion(t: t), zonas: zonas, reglas: reglas, pausado: pausado, enlace: enlace,
                        vueltas: vueltas, cuenta: cuenta, terminado: terminado)
    }

    /// Una mirada: los eventos que produce.
    private func mira(_ m: inout Vivo.MemoriaDirector, _ e: Vivo.EstadoVivo, _ registro: Vivo.RegistroVueltas? = nil) -> [Vivo.EventoVivo] {
        Vivo.dirigir(&m, e, registro: registro).map(\.evento)
    }

    /// Una sesión de series: calentamiento · serie 1 · recuperación · serie 2 · vuelta a la calma.
    private var series: [Vivo.Paso] {
        [
            paso("cal", .calentamiento, tiempo(600), fase: .calentamiento, bloque: 0),
            paso("s1", .series, metros(1000), objetivos: [ritmo(230, 240)], posicion: Vivo.Posicion(serie: Vivo.Contador(n: 1, de: 2))),
            paso("r1", .recuperacion, tiempo(90), rol: .recuperacion),
            paso("s2", .series, metros(1000), objetivos: [ritmo(230, 240)], posicion: Vivo.Posicion(serie: Vivo.Contador(n: 2, de: 2))),
            paso("vc", .vueltaCalma, tiempo(300), fase: .vuelta, bloque: 2),
        ]
    }

    private func vuelta(_ n: Int, _ v: Vivo.Veredicto) -> Vivo.Vuelta {
        Vivo.Vuelta(n: n, clase: .serie, segundos: 235, metros: 1000, ritmo: 235, ppm: nil, veredicto: v, eje: .ritmo)
    }

    // MARK: - Una sesión entera: entradas, resultado, bloque y final

    func testUnaSesionDeSeriesEmiteCadaEventoUnaVezYEnSuSitio() {
        var m = Vivo.MemoriaDirector()
        let ps = series
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 100)), [], "mirar a mitad del calentamiento no anuncia nada")
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 101)), [])
        XCTAssertEqual(mira(&m, estado(ps, 1, t: 0)), [.bloque, .go], "calentamiento → principal: el bloque acaba y el trabajo empieza")
        XCTAssertEqual(mira(&m, estado(ps, 1, t: 1, ritmo: 235)), [], "el mismo paso no repite el GO")
        // La serie 1 se cierra: su resultado (voz), y la recuperación empieza.
        let tras = estado(ps, 2, t: 0, vueltas: [vuelta(1, .dentro)])
        XCTAssertEqual(mira(&m, tras), [.finSerie, .recupera])
        XCTAssertEqual(mira(&m, estado(ps, 2, t: 1, vueltas: [vuelta(1, .dentro)])), [], "la vuelta ya dicha no se repite")
        // Recuperación → serie 2: mismo bloque, solo GO.
        XCTAssertEqual(mira(&m, estado(ps, 3, t: 0, vueltas: [vuelta(1, .dentro)])), [.go])
        XCTAssertEqual(mira(&m, estado(ps, 4, t: 0, vueltas: [vuelta(1, .dentro), vuelta(2, .porEncima)])), [.finSerie, .bloque, .go],
                       "la vuelta a la calma es otro bloque; el trabajo suave también empieza")
        XCTAssertEqual(mira(&m, estado(ps, 4, t: 300, terminado: true, vueltas: [vuelta(1, .dentro), vuelta(2, .porEncima)])), [.sesion])
        XCTAssertEqual(mira(&m, estado(ps, 4, t: 301, terminado: true, vueltas: [vuelta(1, .dentro), vuelta(2, .porEncima)])), [], "la sesión acaba una vez")
    }

    func testLaEntradaEnUnaSerieVibraElBloqueYLaVozEncadenaLoQueSeDice() {
        var m = Vivo.MemoriaDirector()
        let ps = series
        _ = mira(&m, estado(ps, 0, t: 100))
        let cola = Vivo.dirigir(&m, estado(ps, 1, t: 0))
        let e = m.componer(cola)
        XCTAssertEqual(e?.vibra, .bloque, "gana el de más prioridad: un solo háptico")
        XCTAssertEqual(e?.voz, Vivo.vozInicio(ps[1]), "el bloque no lleva voz: solo la del GO")
        XCTAssertEqual(e?.n, 1)
    }

    func testElFinDeSerieSoloDiceLoQueTieneQueDecir() {
        var m = Vivo.MemoriaDirector()
        // Una serie por TIEMPO a ritmo, sin veredicto (sin distancia que juzgar): «Stride 3: 0:20» no cuenta nada.
        let ps = [paso("st", .strides, tiempo(20), objetivos: [ritmo(200, 220)], posicion: Vivo.Posicion(serie: Vivo.Contador(n: 3, de: 6))),
                  paso("r", .recuperacion, tiempo(60), rol: .recuperacion)]
        _ = mira(&m, estado(ps, 0, t: 10))
        let sinVeredicto = Vivo.Vuelta(n: 3, clase: .serie, segundos: 20, metros: nil, ritmo: nil, ppm: nil, veredicto: nil, eje: .ritmo)
        XCTAssertEqual(mira(&m, estado(ps, 1, t: 0, vueltas: [sinVeredicto])), [.recupera])
    }

    func testUnPasoAtrasEsUnDeshacerYNoAnunciaNada() {
        var m = Vivo.MemoriaDirector()
        let ps = series
        _ = mira(&m, estado(ps, 2, t: 30))
        XCTAssertEqual(mira(&m, estado(ps, 1, t: 200)), [], "reabrir la serie no es empezarla")
        XCTAssertEqual(mira(&m, estado(ps, 2, t: 0)), [.recupera])
    }

    func testLaRecuperacionYElDescansoVibranIgual() {
        var m = Vivo.MemoriaDirector()
        let ps = [paso("a", .series, tiempo(60)), paso("d", .descanso, tiempo(30), rol: .descanso), paso("b", .series, tiempo(60))]
        _ = mira(&m, estado(ps, 0, t: 10))
        XCTAssertEqual(mira(&m, estado(ps, 1, t: 0)), [.recupera])
        XCTAssertEqual(Vivo.pulsos(de: m.componer([Vivo.Emitido(evento: .recupera)])!).map(\.haptico), [.stop])
    }

    // MARK: - El 3-2-1 y el GO del arranque

    func testLaCuentaDeArranqueLatePorSegundoYAcabaEnGo() {
        var m = Vivo.MemoriaDirector()
        let ps = [paso("r", .rodaje, tiempo(1800), vueltaAutoM: 1000)]
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 0, cuenta: 3)), [.cuenta])
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 0, cuenta: 3)), [], "el mismo número no late dos veces")
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 0, cuenta: 2)), [.cuenta])
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 0, cuenta: 1)), [.cuenta])
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 0.3)), [.go], "acaba la cuenta y el rodaje sigue en su paso: es el GO")
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 1.3)), [])
    }

    func testEnPausaLaCuentaNoSeTomaPorAcabada() {
        var m = Vivo.MemoriaDirector()
        let ps = [paso("r", .rodaje, tiempo(1800))]
        _ = mira(&m, estado(ps, 0, t: 0, cuenta: 2))
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 0, pausado: true)), [], "en pausa la cuenta desaparece del estado sin haber acabado")
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 0, cuenta: 1)), [.cuenta])
    }

    func testUnEntrenoQueEmpiezaSinCuentaDaElGoYUnoMiradoATardeNo() {
        var m = Vivo.MemoriaDirector()
        let ps = [paso("r", .rodaje, tiempo(1800))]
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 0.2)), [.go])
        var tarde = Vivo.MemoriaDirector()
        XCTAssertEqual(mira(&tarde, estado(ps, 0, t: 600)), [], "la muñeca se une a mitad de entreno: no se anuncia lo ya pasado")
    }

    func testLaCuentaEntrePasosSeguidaDelCambioDaUnSoloGo() {
        var m = Vivo.MemoriaDirector()
        let ps = [paso("r", .recuperacion, tiempo(90), rol: .recuperacion), paso("s", .series, metros(1000))]
        _ = mira(&m, estado(ps, 0, t: 85))
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 87.5, cuenta: 3)), [.cuenta])
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 88.5, cuenta: 2)), [.cuenta])
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 89.5, cuenta: 1)), [.cuenta])
        XCTAssertEqual(mira(&m, estado(ps, 1, t: 0)), [.go], "un solo GO: el del cambio de paso, no otro por acabar la cuenta")
    }

    // MARK: - El aviso fuera de objetivo

    /// Mira una serie a ritmo cada segundo de `desde` a `hasta` con el ritmo dado; devuelve (segundo, evento).
    private func avisos(_ ps: [Vivo.Paso], _ m: inout Vivo.MemoriaDirector, desde: Double, hasta: Double,
                        ritmo: Double? = nil, ppm: Double? = nil, reglas: Vivo.ReglasAviso = Vivo.reglasAvisoDefecto) -> [(Double, Vivo.EventoVivo)] {
        var out: [(Double, Vivo.EventoVivo)] = []
        var t = desde
        while t <= hasta {
            for e in mira(&m, estado(ps, 0, t: t, ritmo: ritmo, ppm: ppm, reglas: reglas)) { out.append((t, e)) }
            t += 1
        }
        return out
    }

    func testElAvisoEsperaLaConfirmacionYRespetaLaCadenciaMinima() {
        var m = Vivo.MemoriaDirector()
        let ps = [paso("s", .series, tiempo(600), objetivos: [ritmo(230, 240)])]
        _ = mira(&m, estado(ps, 0, t: 5, ritmo: 235))
        // Vas rápido (200 < 230 - 3): confirmación de 4 s y luego cada 20 s como mínimo.
        let a = avisos(ps, &m, desde: 10, hasta: 60, ritmo: 200)
        XCTAssertEqual(a.map(\.0), [14, 34, 54], "primer aviso a los 4 s de confirmar; luego, cada 20 s")
        XCTAssertTrue(a.allSatisfy { $0.1 == .afloja })
    }

    func testVolverADentroReiniciaLaConfirmacionPeroNoLaCadencia() {
        var m = Vivo.MemoriaDirector()
        let ps = [paso("s", .series, tiempo(600), objetivos: [ritmo(230, 240)])]
        _ = mira(&m, estado(ps, 0, t: 5, ritmo: 235))
        _ = avisos(ps, &m, desde: 10, hasta: 15, ritmo: 200)              // aviso a los 14
        _ = avisos(ps, &m, desde: 16, hasta: 18, ritmo: 235)              // dentro
        let otra = avisos(ps, &m, desde: 19, hasta: 40, ritmo: 200)       // otra vez fuera: confirma a los 23 pero la cadencia pide 34
        XCTAssertEqual(otra.map(\.0), [34])
    }

    func testVasLentoAprietaConSuPropioGolpe() {
        var m = Vivo.MemoriaDirector()
        let ps = [paso("s", .series, tiempo(600), objetivos: [ritmo(230, 240)])]
        _ = mira(&m, estado(ps, 0, t: 5, ritmo: 235))
        XCTAssertEqual(avisos(ps, &m, desde: 10, hasta: 16, ritmo: 260).map(\.1), [.aprieta])
    }

    func testNingunAvisoEnCalentamientoNiEnRecuperacionSalvoQueElCoachLoPida() {
        let calentar = paso("cal", .calentamiento, tiempo(900), fase: .calentamiento, objetivos: [ritmo(330, 360)])
        var m = Vivo.MemoriaDirector()
        _ = mira(&m, estado([calentar], 0, t: 5, ritmo: 345))
        XCTAssertEqual(avisos([calentar], &m, desde: 10, hasta: 90, ritmo: 250).count, 0, "calentamiento")

        let recuperar = paso("r", .recuperacion, tiempo(120), rol: .recuperacion, objetivos: [ritmo(330, 360)])
        var r = Vivo.MemoriaDirector()
        _ = mira(&r, estado([recuperar], 0, t: 5, ritmo: 345))
        XCTAssertEqual(avisos([recuperar], &r, desde: 10, hasta: 90, ritmo: 250).count, 0, "recuperación")

        // El coach lo pide: la recuperación con objetivo propio avisa.
        var pide = Vivo.reglasAvisoDefecto
        pide.avisarEnRecuperacion = true
        var p = Vivo.MemoriaDirector()
        _ = mira(&p, estado([recuperar], 0, t: 5, ritmo: 345, reglas: pide))
        XCTAssertEqual(avisos([recuperar], &p, desde: 10, hasta: 20, ritmo: 250, reglas: pide).map(\.1), [.afloja])
    }

    func testUnRodajeAZonaAvisaSoloPorArribaYUnaSerieAZ5EnLosDosSentidos() {
        // El plan del motor rellena `avisa` con el método por defecto: el rodaje solo por arriba.
        let rodaje = Vivo.conSentidoDeAviso([paso("r", .rodaje, tiempo(2400), objetivos: [zona(2)], vueltaAutoM: 1000)], .defecto)
        XCTAssertEqual(rodaje[0].objetivos[0].avisa, .soloArriba)
        var m = Vivo.MemoriaDirector()
        _ = mira(&m, estado(rodaje, 0, t: 5, ppm: 130))
        XCTAssertEqual(avisos(rodaje, &m, desde: 10, hasta: 80, ppm: 100).count, 0, "por debajo de Z2 en un rodaje no es un fallo")
        XCTAssertEqual(avisos(rodaje, &m, desde: 81, hasta: 90, ppm: 150).map(\.1), [.afloja], "por encima sí")

        let z5 = Vivo.conSentidoDeAviso([paso("s", .series, tiempo(300), objetivos: [zona(5)])], .defecto)
        XCTAssertNil(z5[0].objetivos[0].avisa, "una serie a Z5 no se toca: avisa en los dos sentidos")
        var s = Vivo.MemoriaDirector()
        _ = mira(&s, estado(z5, 0, t: 46, ppm: 180))
        XCTAssertEqual(avisos(z5, &s, desde: 47, hasta: 60, ppm: 160).map(\.1), [.aprieta], "por debajo, pasada la gracia del pulso")
        XCTAssertEqual(avisos(z5, &s, desde: 61, hasta: 90, ppm: 195).map(\.1), [.afloja], "por encima")
    }

    func testElPulsoBajoNoAvisaDentroDeLaGraciaDeLaZona() {
        let z5 = [paso("s", .series, tiempo(300), objetivos: [zona(5)])]
        var m = Vivo.MemoriaDirector()
        _ = mira(&m, estado(z5, 0, t: 1, ppm: 120))
        XCTAssertEqual(avisos(z5, &m, desde: 2, hasta: 40, ppm: 120).count, 0, "el pulso tarda en subir al arrancar")
    }

    func testElMetodoDelSentidoDelAvisoEsDatoConDefectoQueNoPisaLoPuesto() {
        let rodaje = paso("r", .rodaje, tiempo(2400), objetivos: [zona(2)])
        XCTAssertNil(Vivo.conSentidoDeAviso([rodaje], Vivo.MetodoAviso(zonaContinuaSoloArriba: false))[0].objetivos[0].avisa, "el coach que quiere la banda entera")
        var puesto = rodaje
        puesto.objetivos[0].avisa = .soloAbajo
        XCTAssertEqual(Vivo.conSentidoDeAviso([puesto], .defecto)[0].objetivos[0].avisa, .soloAbajo, "un `alert` del tramo manda")
        let ritmoRodaje = paso("r2", .rodaje, tiempo(2400), objetivos: [ritmo(300, 320)])
        XCTAssertNil(Vivo.conSentidoDeAviso([ritmoRodaje], .defecto)[0].objetivos[0].avisa, "a ritmo, en los dos sentidos")
    }

    // MARK: - El preaviso

    func testElPreavisoSoloEnPasosDeAlMenos30sYUnaVezPorPaso() {
        var m = Vivo.MemoriaDirector()
        let largo = [paso("l", .tempo, tiempo(60))]
        _ = mira(&m, estado(largo, 0, t: 20))
        XCTAssertEqual(mira(&m, estado(largo, 0, t: 49)), [])
        XCTAssertEqual(mira(&m, estado(largo, 0, t: 50)), [.preaviso], "a 10 s de acabar")
        XCTAssertEqual(mira(&m, estado(largo, 0, t: 51)), [], "suena una vez")

        var c = Vivo.MemoriaDirector()
        let corto = [paso("c", .strides, tiempo(20))]
        _ = mira(&c, estado(corto, 0, t: 2))
        XCTAssertEqual(mira(&c, estado(corto, 0, t: 12)), [], "un stride de 20 s no preavisa a mitad de stride")
    }

    func testElPreavisoPorMetrosAlos100mYNoEnLosPasosCortos() {
        var m = Vivo.MemoriaDirector()
        let mil = [paso("m", .series, metros(1000))]
        _ = mira(&m, estado(mil, 0, t: 30, hecho: 600))
        XCTAssertEqual(mira(&m, estado(mil, 0, t: 60, hecho: 890)), [])
        XCTAssertEqual(mira(&m, estado(mil, 0, t: 62, hecho: 901)), [.preaviso])
        var c = Vivo.MemoriaDirector()
        let corto = [paso("c", .series, metros(300))]
        _ = mira(&c, estado(corto, 0, t: 10, hecho: 100))
        XCTAssertEqual(mira(&c, estado(corto, 0, t: 30, hecho: 250)), [], "300 m < 4 × 100 m")
    }

    func testUnaPantallaQueSeAbreYaDentroDelPreavisoNoLoRepite() {
        var m = Vivo.MemoriaDirector()
        let largo = [paso("l", .tempo, tiempo(60))]
        XCTAssertEqual(mira(&m, estado(largo, 0, t: 52)), [])
        XCTAssertEqual(mira(&m, estado(largo, 0, t: 53)), [])
    }

    func testElPreavisoNoSuenaEnPausaNiDuranteLaCuenta() {
        var m = Vivo.MemoriaDirector()
        let largo = [paso("l", .tempo, tiempo(60)), paso("s", .series, metros(1000))]
        _ = mira(&m, estado(largo, 0, t: 20))
        XCTAssertEqual(mira(&m, estado(largo, 0, t: 50, pausado: true)), [])
        XCTAssertEqual(mira(&m, estado(largo, 0, t: 50)), [.preaviso], "al reanudar")
    }

    // MARK: - La vuelta por km

    func testElKmAutomaticoDaSuVueltaYSuFrase() {
        let r = paso("r", .rodaje, tiempo(3000), vueltaAutoM: 1000)
        var reg = Vivo.RegistroVueltas()
        var m = Vivo.MemoriaDirector()
        reg.observar(r, sesionT: 0, sesionM: 0, ppm: nil)
        XCTAssertEqual(mira(&m, estado([r], 0, t: 0.2), reg), [.go])
        reg.observar(r, sesionT: 200, sesionM: 700, ppm: nil)
        XCTAssertEqual(mira(&m, estado([r], 0, t: 200), reg), [])
        reg.observar(r, sesionT: 290, sesionM: 1001, ppm: nil)
        let cola = Vivo.dirigir(&m, estado([r], 0, t: 290), registro: reg)
        XCTAssertEqual(cola.map(\.evento), [.vuelta])
        XCTAssertEqual(cola.first?.voz, "Kilómetro 1: 4:50.")
        XCTAssertEqual(mira(&m, estado([r], 0, t: 291), reg), [], "el mismo km no suena dos veces")
        XCTAssertEqual(Vivo.pulsos(de: m.componer(cola)!).map(\.haptico), [.click, .click])
    }

    func testUnRodajeTrasElCalentamientoNoMideSuPrimerKmDesdeElArranque() {
        let cal = paso("cal", .calentamiento, tiempo(600), fase: .calentamiento, bloque: 0)
        let r = paso("r", .rodaje, tiempo(3000), vueltaAutoM: 1000)
        var reg = Vivo.RegistroVueltas()
        reg.observar(cal, sesionT: 0, sesionM: 0, ppm: nil)
        reg.observar(cal, sesionT: 300, sesionM: 1200, ppm: nil)
        XCTAssertNil(reg.observar(r, sesionT: 300, sesionM: 1200, ppm: nil), "el rodaje empieza a 1,2 km: el km a medias no tiene tiempo honesto")
        XCTAssertNil(reg.observar(r, sesionT: 500, sesionM: 2001, ppm: nil), "el km 2 cruza dentro del km a medias: se calla")
        let v = reg.observar(r, sesionT: 740, sesionM: 3001, ppm: nil)
        XCTAssertEqual(v?.n, 3)
        XCTAssertEqual(v?.segundos, 240, "el km 3 mide de 2000 a 3000, no desde el arranque de la sesión")
    }

    // MARK: - El enlace con el móvil

    func testElEnlaceSePierdeYSeRecuperaUnaVezCadaUno() {
        var m = Vivo.MemoriaDirector()
        let ps = [paso("r", .rodaje, tiempo(3000))]
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 100, enlace: .espejo)), [])
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 101, enlace: .sinEnlace)), [.enlace])
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 102, enlace: .sinEnlace)), [])
        XCTAssertEqual(mira(&m, estado(ps, 0, t: 103, enlace: .espejo)), [.enlaceRecuperado])
        XCTAssertEqual(Vivo.pulsos(de: Vivo.componer(1, [Vivo.Emitido(evento: .enlace)])).map(\.haptico), [.failure])
        XCTAssertEqual(Vivo.pulsos(de: Vivo.componer(2, [Vivo.Emitido(evento: .enlaceRecuperado)])).map(\.haptico), [.click])
        var solo = Vivo.MemoriaDirector()
        XCTAssertEqual(mira(&solo, estado(ps, 0, t: 100)), [])
        XCTAssertEqual(mira(&solo, estado(ps, 0, t: 101)), [], "en solitario no hay enlace que perder")
    }

    // MARK: - Del evento a los golpes

    private func golpes(_ e: Vivo.EventoVivo) -> [Vivo.HapticoWK] {
        Vivo.pulsos(de: Vivo.componer(1, [Vivo.Emitido(evento: e)])).map(\.haptico)
    }

    func testCadaEventoVibraComoDiceElVocabularioDelModelo() {
        XCTAssertEqual(golpes(.cuenta), [.click])
        XCTAssertEqual(golpes(.go), [.start, .start])
        XCTAssertEqual(golpes(.recupera), [.stop])
        XCTAssertEqual(golpes(.preaviso), [.notification])
        XCTAssertEqual(golpes(.afloja), [.directionDown, .directionDown])
        XCTAssertEqual(golpes(.aprieta), [.directionUp, .directionUp])
        XCTAssertEqual(golpes(.vuelta), [.click, .click])
        XCTAssertEqual(golpes(.finSerie), [], "el resultado de la serie es solo voz")
        XCTAssertEqual(golpes(.bloque), [.success])
        XCTAssertEqual(golpes(.sesion), [.success, .success])
        XCTAssertEqual(golpes(.accion), [.click])
        XCTAssertEqual(golpes(.enlace), [.failure])
        XCTAssertEqual(golpes(.enlaceRecuperado), [.click])
        for e in Vivo.EventoVivo.allCases { XCTAssertNotNil(Vivo.vocabulario[e], "\(e) sin vocablo") }
    }

    func testLosGolpesDeUnEventoVanSeparadosPorElHuecoYElPrimeroSuenaYa() {
        let p = Vivo.pulsos(de: Vivo.componer(1, [Vivo.Emitido(evento: .go)]))
        XCTAssertEqual(p.map(\.despuesS), [0, Vivo.huecoEntreGolpesS])
    }

    func testLoQueCoincideVibraUnaVezYLasVocesSeEncadenan() {
        let e = Vivo.componer(1, [Vivo.Emitido(evento: .finSerie, voz: "Serie 1: 3:55, dentro."), Vivo.Emitido(evento: .recupera, voz: "Recupera.")])
        XCTAssertEqual(e.vibra, .recupera)
        XCTAssertEqual(Vivo.pulsos(de: e).count, 1)
        XCTAssertEqual(e.voz, "Serie 1: 3:55, dentro. Recupera.")
    }

    func testLaAccionDelAtletaEsUnClickConSuPropiaEmision() {
        var m = Vivo.MemoriaDirector()
        let e = m.componer([Vivo.Emitido(evento: .accion)])
        XCTAssertEqual(Vivo.pulsos(de: e!).map(\.haptico), [.click])
        XCTAssertNil(m.componer([]), "sin eventos no hay emisión")
        XCTAssertEqual(m.componer([Vivo.Emitido(evento: .accion)])?.n, 2)
    }

    // MARK: - El silencio de lo heredado

    func testSinCaraNuevaTodoLoHeredadoSuenaComoHoy() {
        let p = Vivo.PoliticaHaptica()
        XCTAssertFalse(p.directorActivo)
        XCTAssertTrue(p.permite(.heredado), "fuerza, WOD, ergo y la cara de siempre no cambian")
        XCTAssertTrue(p.permite(.director))
    }

    func testConLaCaraNuevaSoloVibraElDirector() {
        let p = Vivo.PoliticaHaptica()
        p.activar()
        XCTAssertTrue(p.directorActivo)
        XCTAssertFalse(p.permite(.heredado), "los Haptics del motor y los avisos locales callan")
        XCTAssertTrue(p.permite(.director))
        p.soltar()
        XCTAssertTrue(p.permite(.heredado), "se va la cara nueva y lo de siempre vuelve a sonar")
    }

    func testAlCambiarDeCaraLaNuevaAparecerAntesDeQueSeVayaLaOtra() {
        let p = Vivo.PoliticaHaptica()
        p.activar()      // sale la cara del espejo
        p.activar()      // antes de irse la de solitario
        p.soltar()
        XCTAssertFalse(p.permite(.heredado), "sigue habiendo una cara nueva: sigue callado")
        p.soltar()
        XCTAssertTrue(p.permite(.heredado))
        p.soltar()       // un soltar de más no deja mudo lo de siempre
        p.activar()
        p.soltar()
        XCTAssertTrue(p.permite(.heredado))
    }

    // MARK: - El cierre seguro

    func testElUltimoPasoSaleDelCursorDelPlanYDeLoQueDiceElMovil() {
        XCTAssertEqual(Vivo.CierreSeguro.esUltimoPaso(indice: 4, de: 5), true)
        XCTAssertEqual(Vivo.CierreSeguro.esUltimoPaso(indice: 2, de: 5), false)
        XCTAssertEqual(Vivo.CierreSeguro.esUltimoPaso(indice: 2, de: 5, marcaDelMovil: true), true, "gana la marca más cauta")
        XCTAssertEqual(Vivo.CierreSeguro.esUltimoPaso(indice: 2, de: 5, marcaDelMovil: false), false)
        XCTAssertNil(Vivo.CierreSeguro.esUltimoPaso(indice: 0, de: 0), "sin plan no se sabe")
        XCTAssertNil(Vivo.CierreSeguro.esUltimoPaso(indice: 7, de: 5), "un cursor fuera del plan no se sabe")
        XCTAssertNil(Vivo.CierreSeguro.esUltimoPaso(indice: -1, de: 5))
        XCTAssertNil(Vivo.EspejoMuneca().ultimoPaso, "un espejo sin cuadro no sabe cuál es el último")
    }

    func testCerrarElUltimoPasoOSinCertezaPreguntaYUnPasoIntermedioNo() {
        XCTAssertTrue(Vivo.CierreSeguro.pideConfirmar(esVuelta: false, ultimoPaso: true), "el último paso guarda la sesión")
        XCTAssertFalse(Vivo.CierreSeguro.pideConfirmar(esVuelta: false, ultimoPaso: false), "un paso intermedio cierra sin preguntar")
        XCTAssertTrue(Vivo.CierreSeguro.pideConfirmar(esVuelta: false, ultimoPaso: nil), "sin certeza, se pregunta")
        XCTAssertFalse(Vivo.CierreSeguro.pideConfirmar(esVuelta: true, ultimoPaso: true), "«Vuelta» no cierra el paso")
        XCTAssertFalse(Vivo.CierreSeguro.pideConfirmar(esVuelta: true, ultimoPaso: nil))
    }

    func testDescartarSoloSeOfreceConElEnlaceRoto() {
        typealias C = Vivo.CierreSeguro
        XCTAssertTrue(C.ofreceDescartar(role: .mirror, link: .unlinked(nil)))
        XCTAssertTrue(C.ofreceDescartar(role: .mirror, link: .unlinked("error 3")))
        XCTAssertFalse(C.ofreceDescartar(role: .mirror, link: .mirroring), "con el móvil llevando el entreno, descartar es cosa suya")
        XCTAssertFalse(C.ofreceDescartar(role: .solo, link: .unlinked(nil)), "en solitario no hay enlace que perder")
        XCTAssertFalse(C.ofreceDescartar(role: nil, link: .unlinked(nil)))
    }
}
