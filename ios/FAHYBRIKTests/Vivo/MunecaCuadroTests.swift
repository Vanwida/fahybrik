import XCTest
@testable import FAHYBRIK

// EL CUADRO DE LA MUÑECA — lo que la pantalla del reloj pinta, decidido sin
// vista. Los vectores de oro (`MunecaCorrerTests`) comparan el cuadro con el
// kit web; aquí van las reglas que el kit no puede decir por sí solo: el
// Always-On, el enlace que se pierde, el GPS que no fija, la honestidad del
// héroe, y el adaptador desde el motor de verdad, con las sesiones de correr.
final class MunecaCuadroTests: XCTestCase {

    private typealias P = VivoPlanesDePrueba

    private func plan(_ p: WorkoutPlan, entorno: RunEnvironment = .outdoor) -> Vivo.PlanVivo {
        Vivo.planDe(p, zonas: P.zonas(), entorno: entorno)
    }

    private func estado(_ plan: Vivo.PlanVivo, _ i: Int, t: Double = 0, hecho: Double? = nil, ritmo: Double? = nil, ppm: Double? = nil,
                        gps: Vivo.EstadoGps = .listo, viejos: [Vivo.CampoVivo] = [], enlace: Vivo.Enlace = .solo,
                        cuenta: Int? = nil, go: Bool = false, terminado: Bool = false) -> Vivo.EstadoVivo {
        Vivo.EstadoVivo(pasos: plan.pasos, i: i,
                        lecturas: Vivo.Lecturas(t: t, hecho: hecho, ritmo: ritmo, ppm: ppm, gps: gps, viejos: viejos),
                        sesion: Vivo.Sesion(t: 1234, metros: 5230, ritmoMedio: 330, ppmMedio: 152), zonas: plan.zonas, reglas: plan.reglas,
                        pausado: false, enlace: enlace, cuenta: cuenta, go: go, terminado: terminado)
    }

    private func paso(_ c: Vivo.CuadroMuneca) throws -> Vivo.CaraPaso {
        guard case let .paso(p) = c.cara else { throw XCTSkip("la cara no es de paso: \(c.cara)") }
        return p
    }

    // MARK: - El héroe manda lo que pide el coach

    func testUnaSerieARitmoPintaElRitmoActualYSuBandaLlevaMarcaYPalabra() throws {
        let p = plan(try P.seisPorMilCompleto())
        XCTAssertEqual(p.pasos[1].clase, .series)

        let dentro = try paso(Vivo.cuadroMuneca(estado(p, 1, t: 40, hecho: 170, ritmo: 232, ppm: 171)))
        XCTAssertEqual(dentro.heroe.vista.clase, .ritmo)
        XCTAssertEqual(dentro.heroe.vista.texto, "3:52")
        XCTAssertEqual(dentro.banda?.palabra, Vivo.PalabraVeredicto(marca: nil, texto: "dentro"))
        XCTAssertEqual(dentro.banda?.rotulo, "3:45–3:55")
        XCTAssertEqual(dentro.segundo?.vista.etiqueta, "quedan")
        XCTAssertEqual(dentro.tercero?.vista.glifo, true, "el pulso siempre en la fila de abajo")

        let rapido = try paso(Vivo.cuadroMuneca(estado(p, 1, t: 40, hecho: 170, ritmo: 220, ppm: 171)))
        XCTAssertEqual(rapido.banda?.veredicto, .porEncima)
        XCTAssertEqual(rapido.banda?.palabra, Vivo.PalabraVeredicto(marca: "▲", texto: "rápido"))
        let lento = try paso(Vivo.cuadroMuneca(estado(p, 1, t: 40, hecho: 170, ritmo: 245, ppm: 171)))
        XCTAssertEqual(lento.banda?.palabra, Vivo.PalabraVeredicto(marca: "▼", texto: "lento"))
    }

    func testUnPasoAZonaPintaElPulsoYElRitmoVaAbajo() throws {
        let p = plan(try P.sesion573())
        XCTAssertEqual(p.pasos[0].clase, .tempo, "un correr continuo a Z4 es un tempo (umbral del coach)")
        let c = try paso(Vivo.cuadroMuneca(estado(p, 0, t: 300, hecho: 1200, ritmo: 300, ppm: 167)))
        XCTAssertEqual(c.heroe.vista.clase, .pulso)
        XCTAssertEqual(c.heroe.vista.texto, "167")
        XCTAssertEqual(c.heroe.vista.zona?.n, 4)
        XCTAssertEqual(c.tercero?.vista.valor, "5:00", "la otra métrica es el ritmo actual")
        XCTAssertEqual(c.contexto.texto, "Tempo · Z4 · 3950\u{00A0}m")
    }

    func testSinRitmoElHeroeNoInventaUnCero() throws {
        let p = plan(try P.seisPorMilCompleto())
        for gps in [Vivo.EstadoGps.buscando, .listo] {
            let c = try paso(Vivo.cuadroMuneca(estado(p, 1, t: 3, hecho: nil, ritmo: nil, ppm: nil, gps: gps)))
            XCTAssertNotEqual(c.heroe.vista.clase, .ritmo)
            XCTAssertFalse(c.heroe.vista.texto.hasPrefix("0:00"), c.heroe.vista.texto)
            XCTAssertNil(c.banda?.marca, "sin lectura no hay marca en la banda")
            XCTAssertEqual(c.tercero?.vista.valor, "—", "sin pulso, «—»")
        }
        let buscando = try paso(Vivo.cuadroMuneca(estado(p, 1, t: 3, gps: .buscando)))
        XCTAssertEqual(buscando.nota?.texto, "GPS · buscando")
    }

    /// El pulso está SIEMPRE en el paso de trabajo: es el héroe, o es la fila de abajo.
    func testElPulsoSiempreSeVeEnUnPasoDeTrabajo() throws {
        let planes = [try P.seisPorMilCompleto(), try P.sesion491(), try P.sesion494(), try P.sesion538Carrera(), try P.sesion551(),
                      try P.sesion573(), try P.sesion479Correr(), try P.sesion509(), try P.sesion535(), try P.sesion552()]
        var vistos = 0
        for wp in planes {
            let p = plan(wp, entorno: .treadmill)
            for (i, x) in p.pasos.enumerated() where x.rol == .trabajo {
                let c = try paso(Vivo.cuadroMuneca(estado(p, i, t: 20, hecho: 50, ritmo: 300, ppm: 150)))
                let pulsoAbajo = c.tercero?.vista.glifo == true
                XCTAssertTrue(c.heroe.vista.clase == .pulso || pulsoAbajo, "\(wp.name) · paso \(i) (\(x.clase))")
                vistos += 1
            }
        }
        XCTAssertGreaterThan(vistos, 60)
    }

    // MARK: - El fondo de zona

    func testSoloUnPasoAZonaLlevaTinte() throws {
        let zona = plan(try P.sesion573())
        let c = Vivo.cuadroMuneca(estado(zona, 0, t: 300, hecho: 1200, ritmo: 300, ppm: 167))
        XCTAssertEqual(c.tinte?.zona, 4)
        XCTAssertEqual(c.tinte?.color, Vivo.colorZona(4, 5))
        XCTAssertEqual(c.tinte?.mezclaPct, Vivo.tinteZonaPct)
        let ritmo = Vivo.cuadroMuneca(estado(plan(try P.seisPorMilCompleto()), 1, t: 40, hecho: 170, ritmo: 232, ppm: 171))
        XCTAssertNil(ritmo.tinte, "a ritmo no se tiñe")
        XCTAssertNil(Vivo.cuadroMuneca(estado(zona, 0, t: 300, ppm: nil)).tinte, "sin pulso no hay zona que teñir")
    }

    /// La pista «doble toque · empezar ya» y «Luego · …» no caben siempre en una línea: la recuperación
    /// reserva las filas que de verdad ocupan y le quita el alto al héroe, en vez de empujar el pulso fuera.
    func testLaRecuperacionReservaLasLineasQueOcupanLaPistaYElLuego() throws {
        let p = plan(try P.seisPorMilCompleto())
        func recupera(_ m: Vivo.MedidasMuneca) throws -> Vivo.CaraRecupera {
            let c = Vivo.cuadroMuneca(estado(p, 2, t: 30, ritmo: 400, ppm: 168), entorno: Vivo.EntornoMuneca(medidas: m))
            guard case let .recupera(r) = c.cara else { throw XCTSkip("\(c.cara)") }
            return r
        }
        let ancho = try recupera(.mm46)
        XCTAssertEqual(ancho.pista.texto, "doble toque · empezar ya")
        XCTAssertEqual(ancho.pista.lineas, 1)
        XCTAssertEqual(ancho.luego?.lineas, 1)
        let estrecho = try recupera(Vivo.MedidasMuneca(ancho: 162, alto: 197))
        XCTAssertEqual(estrecho.pista.lineas, 2)
        XCTAssertEqual(estrecho.luego?.lineas, 2)
        // Cada nota de dos líneas roba 14 pt al héroe respecto de una de una línea.
        XCTAssertLessThan(estrecho.heroe.altoMax, ancho.heroe.altoMax - 28)
    }

    func testElGpsDeLaMunecaSaleDeLaPrecisionDelUltimoFijado() {
        XCTAssertEqual(Vivo.estadoGps(precisionM: nil), .buscando, "sin fijado, buscando")
        XCTAssertEqual(Vivo.estadoGps(precisionM: 8), .listo)
        XCTAssertEqual(Vivo.estadoGps(precisionM: 22), .listo, "débil pero usable")
        XCTAssertEqual(Vivo.estadoGps(precisionM: 60), .buscando, "una precisión que no sirve no es un fijado")
        XCTAssertEqual(Vivo.estadoGps(precisionM: -1), .buscando, "negativa = inválida")
    }

    func testLaRecuperacionYElDescansoSonMonocromos() throws {
        let p = plan(try P.seisPorMilCompleto())
        let c = Vivo.cuadroMuneca(estado(p, 2, t: 30, ritmo: 400, ppm: 168))
        XCTAssertNil(c.tinte)
        guard case let .recupera(r) = c.cara else { return XCTFail("\(c.cara)") }
        XCTAssertNil(r.pulso?.vista.zona, "el pulso de la recuperación no lleva color de zona")
        XCTAssertNil(r.heroe.vista.etiqueta)
        XCTAssertEqual(r.luego?.prefijo, "Luego ·")
        XCTAssertEqual(r.luego?.texto, "1000\u{00A0}m a 3:45–3:55")
        XCTAssertEqual(r.accion, "empezar ya")
        XCTAssertEqual(r.heroe.vista.clase, .falta)
        XCTAssertEqual(r.heroe.vista.texto, "1:00", "quedan 60 s de los 90″")
    }

    func testElDescansoEsLaFaseComun() throws {
        var pasos = plan(try P.seisPorMilCompleto()).pasos
        pasos[2] = Vivo.Paso(id: "d", clase: .descanso, rol: .descanso, medida: Vivo.Medida(tipo: .tiempo, prescrito: 90, mide: .reloj))
        let p = Vivo.PlanVivo(pasos: pasos, zonas: P.zonas().zonasVivo)
        let c = Vivo.cuadroMuneca(estado(p, 2, t: 30, ppm: 120))
        guard case let .descanso(d) = c.cara else { return XCTFail("\(c.cara)") }
        XCTAssertEqual(d.acciones, [.mas30s, .empezarYa])
        XCTAssertEqual(d.viene?.prefijo, "Viene:")
        XCTAssertEqual(d.contexto.texto, "Descanso")
        XCTAssertNil(d.pulso?.vista.zona)
    }

    // MARK: - Always-On

    func testAlwaysOnAtenuaSinTinteYAUnHercio() throws {
        let zona = plan(try P.sesion573())
        let e = estado(zona, 0, t: 300, hecho: 1200, ritmo: 300, ppm: 167)
        let normal = Vivo.cuadroMuneca(e)
        XCTAssertEqual(normal.tinta, 1)
        XCTAssertEqual(normal.opacidadAro, 1)
        XCTAssertNil(normal.refrescoHz)
        XCTAssertNotNil(normal.tinte)

        let aod = Vivo.cuadroMuneca(e, entorno: Vivo.EntornoMuneca(alwaysOn: true))
        XCTAssertTrue(aod.alwaysOn)
        XCTAssertEqual(aod.tinta, 0.6)
        XCTAssertEqual(aod.opacidadAro, 0.4)
        XCTAssertEqual(aod.refrescoHz, 1)
        XCTAssertNil(aod.tinte, "sin tintes")
        // El contenido es el mismo: solo cambia cómo se enciende.
        XCTAssertEqual(aod.cara, normal.cara)
    }

    // MARK: - Lo que no llega se marca «—», nunca congelado

    func testSinEnlaceLoQueDependeDelMovilSeMarcaViejo() throws {
        let p = plan(try P.seisPorMilCompleto())
        let e = estado(p, 1, t: 40, hecho: 170, ritmo: 232, ppm: 171, enlace: .sinEnlace)
        let c = try paso(Vivo.cuadroMuneca(e))
        XCTAssertEqual(c.nota?.texto, "sin enlace · la muñeca sigue grabando")
        XCTAssertEqual(c.nota?.lineas, 2)
        XCTAssertNotEqual(c.heroe.vista.clase, .ritmo, "el ritmo del móvil no llega: no se pinta congelado")
        XCTAssertEqual(c.tercero?.vista.valor, "171", "el pulso lo mide el reloj y sigue")
        let datos = Vivo.cuadroMuneca(e).datos.filas
        XCTAssertEqual(datos[1].valor, "—")
        XCTAssertEqual(datos[2].valor, "—")
        XCTAssertEqual(datos[3].valor, "171")
        // Con enlace, nada de eso.
        let vivo = try paso(Vivo.cuadroMuneca(estado(p, 1, t: 40, hecho: 170, ritmo: 232, ppm: 171, enlace: .espejo)))
        XCTAssertNil(vivo.nota)
        XCTAssertEqual(vivo.heroe.vista.clase, .ritmo)
    }

    func testElEstadoDelGpsYElEnlaceViajanAlCuadro() {
        let p = plan(try! P.seisPorMilCompleto())
        let c = Vivo.cuadroMuneca(estado(p, 1, t: 1, gps: .buscando, enlace: .espejo))
        XCTAssertEqual(c.gps, .buscando)
        XCTAssertEqual(c.enlace, .espejo)
    }

    // MARK: - La cuenta atrás, el GO, el km y el final

    func testLaCuentaAtrasHablaDelPasoQueEntra() throws {
        let p = plan(try P.seisPorMilCompleto())
        let c = Vivo.cuadroMuneca(estado(p, 2, t: 88, cuenta: 2))
        guard case let .cuenta(x)? = c.capa else { return XCTFail("\(String(describing: c.capa))") }
        XCTAssertEqual(x.numero.vista.texto, "2")
        XCTAssertEqual(x.contexto.texto, "Serie 2/6 · 1000\u{00A0}m")
        XCTAssertEqual(x.que?.texto, "a 3:45–3:55", "el contexto no dice contra qué entras")
        XCTAssertGreaterThan(x.numero.talla.cuerpo, 80)
        let go = Vivo.cuadroMuneca(estado(p, 3, t: 0.4, go: true))
        guard case let .cuenta(g)? = go.capa else { return XCTFail() }
        XCTAssertEqual(g.numero.vista.texto, "GO")
    }

    func testElKmRecienHechoSaleSobreLaLamina() throws {
        let p = plan(try P.sesion491())
        var r = Vivo.RegistroVueltas()
        _ = r.observar(p.pasos[0], sesionT: 0, sesionM: 0, ppm: nil)
        r.observar(p.pasos[0], sesionT: 331, sesionM: 1001, ppm: 148)
        var e = estado(p, 0, t: 331, hecho: 1001, ritmo: 330, ppm: 148)
        e.sesion.t = 332
        let c = Vivo.cuadroMuneca(e, registro: r)
        guard case let .vuelta(a)? = c.capa else { return XCTFail("\(String(describing: c.capa))") }
        XCTAssertEqual(a.titulo, "Kilómetro 1")
        XCTAssertEqual(a.valor, "5:31")
        XCTAssertEqual(c.vueltas.filas.first?.n, "km 1")
        XCTAssertEqual(c.vueltas.enCurso?.n, "km 2")
        // Pasados los 4 s, la tarjeta se va.
        e.sesion.t = 340
        XCTAssertNil(Vivo.cuadroMuneca(e, registro: r).capa)
    }

    func testAlAcabarSaleSesionCompletada() {
        let p = plan(try! P.sesion573())
        XCTAssertEqual(Vivo.cuadroMuneca(estado(p, 0, t: 900, terminado: true)).cara, .completada)
    }

    /// Tocar la pantalla NO cierra nada (P4): la cara de un paso de trabajo no ofrece ninguna acción de avance.
    func testUnPasoDeTrabajoNoOfreceGestoDeAvance() throws {
        let c = try paso(Vivo.cuadroMuneca(estado(plan(try P.seisPorMilCompleto()), 1, t: 40, ritmo: 232, ppm: 171)))
        let campos = Mirror(reflecting: c).children.compactMap(\.label)
        for prohibido in ["accion", "avanzar", "cerrar", "siguiente", "toque", "alTocar"] {
            XCTAssertFalse(campos.contains { $0.lowercased().contains(prohibido) }, "la cara de trabajo no lleva «\(prohibido)»: \(campos)")
        }
        let cuadro = Mirror(reflecting: Vivo.cuadroMuneca(estado(plan(try P.seisPorMilCompleto()), 1, t: 40))).children.compactMap(\.label)
        XCTAssertFalse(cuadro.contains { $0.lowercased().contains("toque") || $0.lowercased().contains("avanzar") }, "\(cuadro)")
    }

    // MARK: - Las otras páginas

    func testLaPaginaDatosDiceLaSesionEntera() {
        let p = plan(try! P.seisPorMilCompleto())
        let c = Vivo.cuadroMuneca(estado(p, 1, t: 40, hecho: 170, ritmo: 232, ppm: 171))
        XCTAssertEqual(c.datos.titulo, ["Sesión"])
        XCTAssertEqual(c.datos.filas.map(\.valor), ["20:34", "5,23", "5:30", "171"])
        XCTAssertEqual(c.datos.filas.map(\.unidad), ["total", "km", "/km medio", "ppm"])
        XCTAssertEqual(c.datos.filas[3].zona?.n, 4)
        var e = estado(p, 1, t: 4)
        e.sesion = Vivo.Sesion(t: 12, metros: nil, ritmoMedio: nil, ppmMedio: nil)
        let vacia = Vivo.cuadroMuneca(e).datos.filas
        XCTAssertEqual(vacia.map(\.valor), ["0:12", "—", "—", "—"], "sin metros ni pulso, «—»: jamás 0,00 km")
    }

    func testEnCintaLosMetrosDicenDeQuienSon() throws {
        let p = plan(try P.sesion535(), entorno: .treadmill)
        XCTAssertEqual(Vivo.cuadroMuneca(estado(p, 0, t: 30)).datos.filas[1].unidad, "km · cinta")
    }

    func testLasVueltasDeLasSeriesSeJuzganContraSuObjetivo() {
        let p = plan(try! P.seisPorMilCompleto())
        var e = estado(p, 7, t: 20, hecho: 90, ritmo: 232, ppm: 170)
        e.vueltas = [Vivo.Vuelta(n: 1, clase: .serie, segundos: 232, metros: 1000, ritmo: 232, ppm: 171, veredicto: .dentro, eje: .ritmo),
                     Vivo.Vuelta(n: 2, clase: .serie, segundos: 228, metros: 1000, ritmo: 228, ppm: 174, veredicto: .porEncima, eje: .ritmo)]
        let v = Vivo.cuadroMuneca(e).vueltas
        XCTAssertEqual(v.titulo, ["Series", "3:45–3:55"])
        XCTAssertEqual(v.enCurso?.n, "4")
        XCTAssertEqual(v.enCurso?.detalle, "ahora")
        XCTAssertEqual(v.filas.map(\.n), ["2", "1"], "la última primero")
        XCTAssertEqual(v.filas.first?.juicio, Vivo.JuicioVuelta(texto: "▲ rápido", fuera: true))
        XCTAssertNil(v.vacia)
        XCTAssertEqual(Vivo.cuadroMuneca(estado(p, 0, t: 4)).vueltas.vacia, "Aún ninguna")
    }

    func testLaEstructuraEnseñaUnaVentanaAlrededorDeAhora() throws {
        let p = plan(try P.sesion535(), entorno: .treadmill)
        let c = Vivo.cuadroMuneca(estado(p, 4, t: 30)).estructura
        XCTAssertEqual(c.titulo, ["Estructura"])
        XCTAssertLessThanOrEqual(c.filas.count, Vivo.filasVisiblesEstructura)
        XCTAssertTrue(c.filas.contains { $0.estado == .ahora })
        XCTAssertEqual(c.filas.first?.linea, "2 × (4 × 2′ / 2′)", "el 535: dos tandas de cuatro series con su recuperación")
        XCTAssertEqual(c.filas.first?.detalle, "a Z4 · r 2′ trote · 5′ entre tandas")
    }

    func testElAroEsLaSesionEntera() throws {
        let p = plan(try P.seisPorMilCompleto())
        let c = Vivo.cuadroMuneca(estado(p, 1, t: 116, hecho: 500, ritmo: 232))
        XCTAssertEqual(c.aro.arcos.count, p.pasos.count)
        XCTAssertEqual(c.aro.indice, 1)
        XCTAssertEqual(c.aro.fraccion, 0.5, accuracy: 1e-9)
        XCTAssertEqual(c.avisoCierre, "Serie 1 cerrada")
    }

    // MARK: - Otros relojes

    func testTodoCabeEnLos42Y49Milimetros() throws {
        for m in [Vivo.MedidasMuneca.mm42, .mm46, .mm49] {
            for wp in [try P.seisPorMilCompleto(), try P.sesion573(), try P.sesion535()] {
                let p = plan(wp)
                for (i, x) in p.pasos.enumerated() where x.rol == .trabajo {
                    let c = try paso(Vivo.cuadroMuneca(estado(p, i, t: 20, hecho: 50, ritmo: 232, ppm: 171), entorno: Vivo.EntornoMuneca(medidas: m)))
                    XCTAssertLessThanOrEqual(c.heroe.talla.ancho, m.anchoHeroe + 0.5, "\(m) · \(x.clase)")
                    XCTAssertGreaterThanOrEqual(c.contexto.cuerpo, Vivo.suelo)
                    XCTAssertGreaterThanOrEqual(c.tercero?.cuerpoValor ?? 99, Vivo.suelo)
                    XCTAssertGreaterThanOrEqual(c.segundo?.cuerpoValor ?? 99, Vivo.suelo)
                }
            }
        }
        XCTAssertEqual(Vivo.MedidasMuneca.mm42.anchoUtil, 167)
        XCTAssertEqual(Vivo.MedidasMuneca.deUtil(ancho: 188, alto: 212), .mm46)
    }

    // MARK: - Las sesiones nuevas del contrato

    func testLaEstructuraDe509LeeLasTandasYSuDescanso() throws {
        let p = plan(try P.sesion509(), entorno: .treadmill)
        XCTAssertEqual(p.pasos.filter { $0.clase == .descansoTandas }.count, 3, "cada tanda cierra con su descanso")
        let filas = Vivo.estructuraDe(p.pasos, i: 0)
        XCTAssertEqual(filas.map(\.fase), [.calentamiento, .principal])
        let t = Vivo.textoFila(filas[1])
        XCTAssertEqual(t.linea, "3 × (6 × 1′ / 1′)")
        XCTAssertTrue(t.detalle?.contains("5′ entre tandas") == true, t.detalle ?? "-")
        XCTAssertNil(p.pasos.first { $0.clase == .series }?.objetivos.first, "509 no trae objetivo")
    }

    func testLaCursaDeCincoKmEsUnaCarreraDeUnSoloPaso() throws {
        let p = plan(try P.sesion552())
        XCTAssertEqual(p.pasos.count, 1)
        XCTAssertEqual(p.pasos[0].clase, .carrera)
        XCTAssertEqual(p.pasos[0].medida, Vivo.Medida(tipo: .distancia, prescrito: 5000, mide: .gps))
        XCTAssertEqual(p.pasos.map(firma), try delKit("552").map(firma))
        // Es una carrera: la cara es la de correr (P10), con lo que falta como héroe si no hay objetivo.
        let c = try paso(Vivo.cuadroMuneca(estado(p, 0, t: 600, hecho: 1800, ritmo: 333, ppm: 168)))
        XCTAssertEqual(c.heroe.vista.clase, .falta)
        XCTAssertEqual(c.heroe.vista.texto, "3,20")
        XCTAssertEqual(c.tercero?.vista.glifo, true)
    }

    // MARK: - Lo que el adaptador lee es lo que el doble dibuja

    /// El paso reducido a lo que decide la lámina: clase, rol, fase, medida, objetivos (sin la dirección
    /// del aviso, que el adaptador aún no rellena), posición y cómo se recupera.
    private func firma(_ p: Vivo.Paso) -> String {
        let medida = "\(p.medida.tipo.rawValue):\(p.medida.prescrito.map { MunecaPlano.n3($0) } ?? "-"):\(p.medida.mide.rawValue)"
        let objetivos = p.objetivos.map { "\($0.eje.rawValue):\($0.min.map { MunecaPlano.n3($0) } ?? "-"):\($0.max.map { MunecaPlano.n3($0) } ?? "-"):\($0.papel.rawValue)" }
        let pos = p.posicion
        let c = { (x: Vivo.Contador?) in x.map { "\($0.n)/\($0.de)" } ?? "-" }
        return ([p.clase.rawValue, p.rol.rawValue, p.fase.rawValue, medida, objetivos.joined(separator: ","),
                 "t\(c(pos?.tanda)) s\(c(pos?.serie)) m\(c(pos?.tramo))", p.modoRecupera?.rawValue ?? "-"]).joined(separator: "|")
    }

    private func delKit(_ clave: String) throws -> [Vivo.Paso] {
        try XCTUnwrap(MunecaCorrerTests.doc.casos.first { $0.clave == clave }, clave).plan.pasos
    }

    /// Quita la recuperación que el servidor escribe tras la ÚLTIMA serie (dentro del «repetir»): el doble no la dibuja.
    private func sinRecuperacionDeCierre(_ pasos: [Vivo.Paso]) -> [Vivo.Paso] {
        pasos.enumerated().filter { i, p in
            guard p.rol == .recuperacion, i > 0, let s = pasos[i - 1].posicion?.serie else { return true }
            return s.n != s.de
        }.map(\.element)
    }

    /// Las sesiones del contrato, escritas como las escribe el servidor, dan los MISMOS pasos que dibuja el doble.
    func testLasSesionesDelServidorDanLosPasosDelDoble() throws {
        let iguales: [(clave: String, plan: () throws -> WorkoutPlan, entorno: RunEnvironment, cierre: Bool)] = [
            ("573", P.sesion573, .outdoor, false), ("535", P.sesion535, .treadmill, false), ("494", P.sesion494, .outdoor, false),
            ("551", P.sesion551, .outdoor, true), ("modelo-6x1000", P.seisPorMilCompleto, .outdoor, true),
        ]
        for x in iguales {
            var pasos = plan(try x.plan(), entorno: x.entorno).pasos
            if x.cierre { pasos = sinRecuperacionDeCierre(pasos) }
            XCTAssertEqual(pasos.map(firma), try delKit(x.clave).map(firma), x.clave)
        }
    }

    func testElCorrerDe479SonLosMismosPasosQueElDoble() throws {
        let kit = try delKit("479").filter { Vivo.clasesCorrer.contains($0.clase) || $0.clase == .recuperacion }.map(firma)
        let swift = plan(try P.sesion479Correr()).pasos.map(firma)
        // El servidor cierra el repetir con su recuperación (la sexta): el doble la omite tras la última serie.
        XCTAssertEqual(swift.count, kit.count + 1)
        XCTAssertEqual(Array(swift[0..<11]), Array(kit[0..<11]))
        XCTAssertEqual(swift.last, kit.last)
    }

    func testEl509LeeSusTandasComoElDoble() throws {
        let kit = try delKit("509").map(firma)
        let swift = plan(try P.sesion509(), entorno: .treadmill).pasos.map(firma)
        // Las 11 primeras (calentamiento y la primera tanda sin su cierre) coinciden; el doble muestra el descanso como tal
        // y el servidor lo escribe como una recuperación parada.
        XCTAssertEqual(Array(swift[0..<12]), Array(kit[0..<12]))
    }

    // MARK: - El adaptador, con el motor de verdad

    @MainActor
    func testElAdaptadorDaAlHeroeElRitmoActualYNuncaLaMediaDelTramo() throws {
        let e = try EscenarioCorrer.serieDentro()
        let s = e.sesion
        let plan = Vivo.planDe(s)
        // El motor sabe la media del tramo (~3:49): la muñeca no la rotula «ritmo».
        XCTAssertNotNil(s.liveCoveredPaceSecPerKm)
        let sin = Vivo.cuadroDeMuneca(s, plan: plan, fuentes: Vivo.FuentesMuneca(ritmoActual: nil, gps: .listo))
        guard case let .paso(a) = sin.cara else { return XCTFail("\(sin.cara)") }
        XCTAssertNotEqual(a.heroe.vista.clase, .ritmo)
        let con = Vivo.cuadroDeMuneca(s, plan: plan, fuentes: Vivo.FuentesMuneca(ritmoActual: 231, gps: .listo))
        guard case let .paso(b) = con.cara else { return XCTFail("\(con.cara)") }
        XCTAssertEqual(b.heroe.vista.clase, .ritmo)
        XCTAssertEqual(b.heroe.vista.texto, "3:51")
        XCTAssertEqual(con.contextoDePrueba, ["Serie 3/6", "1000\u{00A0}m"])
        // El adaptador usa las zonas y el entorno de la sesión, no los del móvil.
        XCTAssertEqual(plan.zonas?.techos.count, 5)
    }

    @MainActor
    func testElEnlaceYElGpsSonDeLaMuneca() throws {
        let s = try EscenarioCorrer.serieDentro().sesion
        let c = Vivo.cuadroDeMuneca(s, plan: Vivo.planDe(s), fuentes: Vivo.FuentesMuneca(ritmoActual: 231, gps: .buscando, enlace: .sinEnlace))
        XCTAssertEqual(c.gps, .buscando)
        XCTAssertEqual(c.enlace, .sinEnlace)
        guard case let .paso(a) = c.cara else { return XCTFail() }
        XCTAssertEqual(a.nota?.texto, "sin enlace · la muñeca sigue grabando")
    }
}

private extension Vivo.CuadroMuneca {
    /// El contexto de la cara de paso (partes), para las aserciones cortas.
    var contextoDePrueba: [String] {
        guard case let .paso(p) = cara else { return [] }
        return p.contexto.texto.components(separatedBy: " · ")
    }
}

private extension HRZoneProfile {
    var zonasVivo: Vivo.ZonasCoach? { Vivo.zonasDe(self) }
}
